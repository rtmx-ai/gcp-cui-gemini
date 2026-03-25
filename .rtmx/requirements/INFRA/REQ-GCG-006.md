# REQ-GCG-006: Unified State Machine for All Stateful Subcommands

## Overview

The initialization state machine (REQ-GCG-005) currently only governs the `up` subcommand. The `preview` and `destroy` subcommands bypass preflight checks and API enablement, leading to opaque failures when credentials are invalid or APIs are disabled. All stateful subcommands must route through a shared preflight and API readiness gate.

This gap was discovered during the live PoC against `aegis-cli-demo`: the `up` subcommand handled API enablement gracefully, but `preview` and `destroy` would have failed with raw GCP 403 errors if APIs had not already been enabled by a prior `up`.

## Upstream Cross-References

- REQ-GCG-005: Initialization State Machine -- extends the state machine to cover all stateful subcommands
- REQ-AEG-001 (aegis-cli): Infrastructure Automation

## Specification

### Subcommand State Coverage

| Subcommand | PREFLIGHT | API_ENABLEMENT | PROVISION | VERIFY |
|------------|-----------|----------------|-----------|--------|
| manifest   | No        | No             | No        | No     |
| preview    | Yes       | Yes (check only, no enable) | Yes (dry run) | No |
| up         | Yes       | Yes (enable)   | Yes       | Yes    |
| status     | Yes       | No             | No        | Yes    |
| destroy    | Yes       | Yes (check only, no enable) | Yes (teardown) | No |

- `preview` and `destroy` run PREFLIGHT and check API readiness but do NOT attempt to enable APIs. If APIs are disabled, they emit a diagnostic with instructions and fail cleanly.
- `status` runs PREFLIGHT (credential check) but skips API enablement since it only reads state and calls GCP APIs that may return graceful errors.
- Only `up` enables APIs.

### Destroy and CryptoKey Protection

The CryptoKey resource has `protect: true` in Pulumi, which prevents accidental deletion. The `destroy` subcommand must:
1. Run preflight checks
2. Temporarily remove protection from the CryptoKey before running Pulumi destroy
3. Emit a diagnostic warning that protected resources are being unprotected
4. Require explicit confirmation via a `--confirm-destroy` flag (checked before teardown begins)

Without `--confirm-destroy`, the destroy subcommand emits a result event with success false and an error instructing the user to pass the flag. This maps to aegis-cli's teardown safety gate (REQ-INFRA-013).

## BDD Scenarios

### Scenario 1: Preview runs preflight before dry run
- Given valid GCP ADC credentials
- And input with project_id and impact_level "IL4"
- When the "preview" subcommand is invoked
- Then a diagnostic event indicates "PREFLIGHT" state
- And a diagnostic event indicates "API_ENABLEMENT" (check-only) state
- And preview proceeds if all APIs are enabled

### Scenario 2: Preview fails cleanly when APIs are disabled
- Given valid GCP ADC credentials
- And the Compute API is disabled on the project
- When the "preview" subcommand is invoked
- Then the result event has success false
- And the error mentions "compute.googleapis.com" and "not enabled"
- And the error includes instructions to run "up" first

### Scenario 3: Destroy requires --confirm-destroy flag
- Given a provisioned boundary
- When the "destroy" subcommand is invoked without --confirm-destroy
- Then the result event has success false
- And the error mentions "--confirm-destroy"

### Scenario 4: Destroy with confirmation runs preflight and tears down
- Given a provisioned boundary
- And the --confirm-destroy flag is provided
- When the "destroy" subcommand is invoked
- Then PREFLIGHT passes
- And API readiness is checked
- And a diagnostic warns about unprotecting the CryptoKey
- And all resources are destroyed
- And the result event has success true

### Scenario 5: Destroy fails on invalid credentials
- Given expired GCP ADC credentials
- And the --confirm-destroy flag is provided
- When the "destroy" subcommand is invoked
- Then PREFLIGHT fails
- And no resources are destroyed

### Scenario 6: Status runs preflight before health checks
- Given valid GCP ADC credentials
- When the "status" subcommand is invoked
- Then a diagnostic event indicates "PREFLIGHT" state
- And health checks proceed

## TDD Test Case Signatures

- `runPreflightForSubcommand`: Runs preflight checks, returns pass/fail
- `checkApiReadiness`: Checks (but does not enable) all required APIs. Returns list of disabled APIs.
- `requireConfirmDestroy`: Checks argv for --confirm-destroy flag. Returns boolean.
- `unprotectResources`: Removes protect flag from CryptoKey before destroy.

## Acceptance Criteria

- [AC1] preview, destroy, and status all run preflight checks before proceeding
- [AC2] preview and destroy check API readiness and fail cleanly if APIs are disabled
- [AC3] destroy requires --confirm-destroy flag; without it, no resources are touched
- [AC4] destroy temporarily removes CryptoKey protection before Pulumi destroy
- [AC5] All failures emit properly formatted result events (not raw errors)

## Traceability

- Parent: REQ-GCG-005 (Initialization State Machine), aegis-cli REQ-INFRA-013 (Teardown Safety Gate)
- Tests: src/infrastructure/__tests__/unified-state-machine.test.ts
- Feature: tests/features/provisioning/unified-lifecycle.feature
