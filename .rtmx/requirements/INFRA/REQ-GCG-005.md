# REQ-GCG-005: Initialization State Machine

## Overview

The `up` subcommand must execute a multi-phase initialization state machine that handles the full lifecycle from raw GCP credentials to a verified, operational boundary. The live PoC against `aegis-cli-demo` revealed three classes of failure that a naive single-pass Pulumi deployment cannot handle:

1. **API enablement** -- GCP APIs (Compute, KMS, Storage) must be explicitly enabled before any resources can be created against them.
2. **IAM propagation** -- CMEK key IAM bindings must be in place and propagated before CMEK-encrypted resources (e.g., GCS buckets) can be created.
3. **Eventual consistency** -- API enablement has a propagation delay (seconds to minutes); retrying during this window produces spurious 403 errors.

The state machine makes the initialization process robust (handles all three failure classes), idempotent (re-running from any state converges), and observable (aegis-cli knows which phase is active via protocol events).

## Upstream Cross-References

- REQ-AEG-008 (aegis-cli): Secure Onboarding State Machine -- the "Infrastructure Binding" state maps to this entire state machine
- REQ-AEG-001 (aegis-cli): Infrastructure Automation via `aegis init`
- REQ-GCG-002: GCP Assured Workloads Boundary Provisioning -- this requirement governs HOW provisioning proceeds; REQ-GCG-002 governs WHAT is provisioned

## Specification

### States

| State | Name | Purpose | Idempotent |
|-------|------|---------|------------|
| 0 | PREFLIGHT | Validate input, verify ADC, check project access | Yes |
| 1 | API_ENABLEMENT | Enable required GCP APIs, poll until active | Yes |
| 2 | PROVISION | Run Pulumi up with dependency ordering | Yes (Pulumi convergence) |
| 3 | VERIFY | Run health checks, confirm boundary is operational | Yes |

### State 0: PREFLIGHT

- Validate input JSON (project_id, region, impact_level)
- Verify GCP ADC credentials produce a valid access token
- Verify the target project exists and the caller has `resourcemanager.projects.get` permission
- Emit `diagnostic` events for each check

Exit: All preflight checks pass. On failure, emit `result` with error and exit.

### State 1: API_ENABLEMENT

Required APIs:
- `compute.googleapis.com`
- `cloudkms.googleapis.com`
- `storage.googleapis.com`
- `iam.googleapis.com`
- `cloudresourcemanager.googleapis.com`

For each API:
- Check if already enabled (GET service state)
- If not enabled, enable it (POST :enable)
- Poll until state is ENABLED (max 120s, 5s interval)
- Emit `progress` event per API with operation "create" and status transitions

Exit: All APIs enabled. On timeout, emit `result` with error listing which APIs failed.

### State 2: PROVISION

- Run Pulumi `up` as currently implemented
- Pulumi handles resource ordering via `dependsOn` (CMEK IAM binding before audit bucket)
- Stream `progress` events per resource
- On partial failure, Pulumi state records what was created; next run converges

Exit: Pulumi reports success. On failure, emit `result` with Pulumi diagnostic.

### State 3: VERIFY

- Run all health checks from REQ-GCG-003
- Emit `check` events per check
- Aggregate results

Exit: All checks pass or warn (no failures). On check failure, emit `result` with summary but do NOT roll back -- the boundary is partially operational and the user should be informed.

### Protocol Events

Each state transition emits a `diagnostic` event:
```json
{"type":"diagnostic","severity":"info","message":"Entering state: API_ENABLEMENT"}
```

This lets aegis-cli update its TUI with the current phase.

### Retry and Timeout

- API enablement polling: 5s interval, 120s max per API
- No automatic retry of PROVISION state -- Pulumi's idempotency handles convergence on re-run
- The entire state machine is safe to re-run at any point; it converges to the same end state

## BDD Scenarios

### Scenario 1: Full initialization from clean project
- Given valid GCP ADC credentials for a project with no APIs enabled
- And input with project_id and impact_level "IL4"
- When the `up` subcommand is invoked
- Then diagnostic events indicate PREFLIGHT state
- And diagnostic events indicate API_ENABLEMENT state
- And progress events show each API being enabled
- And diagnostic events indicate PROVISION state
- And progress events show each resource being created
- And diagnostic events indicate VERIFY state
- And check events confirm boundary health
- And the final result has success true with outputs

### Scenario 2: Preflight fails on invalid credentials
- Given expired or invalid GCP ADC credentials
- When the `up` subcommand is invoked
- Then a diagnostic event indicates PREFLIGHT state
- And the result event has success false
- And the error mentions credentials
- And no APIs are enabled and no resources are created

### Scenario 3: Preflight fails on nonexistent project
- Given valid GCP ADC credentials
- And input with project_id "nonexistent-project-xyz"
- When the `up` subcommand is invoked
- Then the result event has success false
- And the error mentions project not found or permission denied

### Scenario 4: API enablement is idempotent
- Given a project where all APIs are already enabled
- When the `up` subcommand is invoked
- Then the API_ENABLEMENT state completes immediately
- And no enable API calls are made
- And provisioning proceeds normally

### Scenario 5: API enablement handles propagation delay
- Given a project where KMS API was just enabled
- And the API returns 403 on first IAM policy read
- When the `up` subcommand is invoked
- Then the API_ENABLEMENT state polls until the API is active
- And provisioning succeeds after the delay

### Scenario 6: Partial provision converges on retry
- Given a previous `up` that created KMS and VPC but failed on the audit bucket
- When the `up` subcommand is invoked again
- Then existing resources are not recreated
- And only the missing audit bucket is created
- And the final result has success true

### Scenario 7: Verify reports partial health without rollback
- Given a fully provisioned boundary where the audit bucket was manually deleted
- When the `up` subcommand completes provisioning
- And the VERIFY state runs health checks
- Then the audit_sink_flowing check has status "fail"
- And the result success is false
- But no resources are destroyed (no rollback)

### Scenario 8: State transitions are observable
- Given any invocation of `up`
- When the state machine executes
- Then each state transition emits a diagnostic event with the state name
- And aegis-cli can display the current phase in its TUI

## TDD Test Case Signatures

- `runPreflight`: Validates ADC token, project existence, caller permissions. Returns pass/fail.
- `enableApis`: For each required API, checks state and enables if needed. Returns list of API statuses.
- `pollApiEnabled`: Polls a single API until ENABLED or timeout. Returns final state.
- `runStateMachine`: Orchestrates all four states in sequence. Emits events at each transition.
- `isRetryableError`: Identifies 403 errors caused by API propagation delay vs. real permission issues.

## Acceptance Criteria

- [AC1] The `up` subcommand executes all four states in order: PREFLIGHT, API_ENABLEMENT, PROVISION, VERIFY
- [AC2] Each state transition emits a diagnostic event with the state name
- [AC3] API enablement is idempotent -- already-enabled APIs are not re-enabled
- [AC4] API enablement polls with backoff until all APIs are active or timeout
- [AC5] Preflight failure prevents any API enablement or resource creation
- [AC6] PROVISION state is idempotent via Pulumi state convergence
- [AC7] VERIFY state runs regardless of whether PROVISION created new resources
- [AC8] The entire state machine is safe to re-run from any interruption point
- [AC9] All GCP API calls in PREFLIGHT and API_ENABLEMENT are mockable for Tier 1 unit tests

## Traceability

- Parent: aegis-cli REQ-AEG-008 (Secure Onboarding State Machine), REQ-GCG-002 (Boundary Provisioning)
- Tests: src/infrastructure/__tests__/init-state-machine.test.ts, tests/integration/initialization.test.ts
- Feature: tests/features/provisioning/initialization.feature
