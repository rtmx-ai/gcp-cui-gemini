# REQ-GCG-003: Boundary Health Status Checks

## Overview

Implement the `status` subcommand that validates the provisioned boundary is intact and functional. This is new to gcp-cui-gemini and maps to aegis-cli's `aegis doctor` command. It implements the health verification aspects of upstream REQ-INFRA-009 through REQ-INFRA-012 and REQ-INFRA-015.

## Upstream Cross-References

- REQ-INFRA-009 (aegis-cli): KMS key rotation verification
- REQ-INFRA-010 (aegis-cli): VPC-SC perimeter validation
- REQ-INFRA-011 (aegis-cli): Audit log sink verification
- REQ-INFRA-012 (aegis-cli): Endpoint connectivity verification
- REQ-INFRA-015 (aegis-cli): Infrastructure health monitoring

## Specification

### Health Checks

| Check Name           | What It Verifies                                      | API Used                    |
|----------------------|-------------------------------------------------------|-----------------------------|
| kms_key_active       | CMEK key exists, is ENABLED, rotation is current      | Cloud KMS API               |
| vpc_sc_enforced      | Service perimeter is ACTIVE and covers aiplatform      | Access Context Manager API  |
| audit_sink_flowing   | Recent audit log entries exist (within last hour)      | Cloud Logging API           |
| vertex_ai_reachable  | Pinned model endpoint responds in us-central1          | Vertex AI API               |

### Output Format

Each check emits a `check` event:
```json
{"type":"check","name":"kms_key_active","status":"pass","detail":"aegis-cmek-key is ENABLED, last rotation 2026-03-10"}
```

Status values: `pass`, `fail`, `warn`.

The final `result` event summarizes: `{"type":"result","success":true,"summary":"4/4 checks passed"}`.
Success is true only if all checks pass or warn (no failures).

### Graceful Degradation

If a check cannot be performed (e.g., API not enabled, insufficient permissions), it emits status `warn` with a descriptive detail, not `fail`. This prevents false negatives during initial setup.

## BDD Scenarios

### Scenario 1: All checks pass on healthy boundary
- Given a fully provisioned boundary
- When the `status` subcommand is invoked
- Then 4 check events are emitted, all with status "pass"
- And the result summary says "4/4 checks passed"
- And exit code is 0

### Scenario 2: KMS key disabled reports failure
- Given a provisioned boundary where the CMEK key has been disabled
- When the `status` subcommand is invoked
- Then the kms_key_active check has status "fail"
- And the result success is false
- And exit code is 0 (status check itself succeeded, boundary is unhealthy)

### Scenario 3: Missing permissions reports warning
- Given valid credentials lacking Cloud KMS Viewer role
- When the `status` subcommand is invoked
- Then the kms_key_active check has status "warn"
- And detail mentions insufficient permissions

### Scenario 4: Vertex AI unreachable reports failure
- Given a provisioned boundary where VPC-SC blocks Vertex AI
- When the `status` subcommand is invoked
- Then the vertex_ai_reachable check has status "fail"
- And detail includes the endpoint URL and error

## TDD Test Case Signatures

- `checkKmsKeyActive`: Calls KMS API, returns HealthCheck with pass/fail/warn
- `checkVpcScEnforced`: Calls Access Context Manager API, returns HealthCheck
- `checkAuditSinkFlowing`: Queries recent audit log entries, returns HealthCheck
- `checkVertexAiReachable`: Pings Vertex AI endpoint, returns HealthCheck
- `aggregateChecks`: Combines individual HealthChecks into final result event

## Acceptance Criteria

- [AC1] All 4 health checks execute and emit check events
- [AC2] Final result reflects aggregate health (all pass = success true)
- [AC3] Individual check failures do not prevent other checks from running
- [AC4] Missing permissions produce warnings, not failures
- [AC5] Exit code is always 0 if the status command itself ran (health state is in the output, not the exit code)

## Traceability

- Parent: aegis-cli REQ-INFRA-009, REQ-INFRA-010, REQ-INFRA-011, REQ-INFRA-012, REQ-INFRA-015
- Tests: src/infrastructure/__tests__/health.test.ts, tests/integration/status.test.ts
- Feature: tests/features/status/health.feature
