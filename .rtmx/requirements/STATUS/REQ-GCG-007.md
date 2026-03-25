# REQ-GCG-007: VPC-SC Perimeter Validation and Vertex AI Model Access

## Overview

Two health checks produce false assurance in their current form:

1. **VPC-SC perimeter**: The perimeter is only created when `accessPolicyId` is provided in Pulumi config, but nothing warns the user when it is absent. For an IL4/IL5 boundary, the perimeter is a compliance requirement -- its absence should be surfaced as a health check failure, not silently ignored.

2. **Vertex AI model access**: The current check only verifies network reachability (HTTP response from the endpoint). Status codes 401 and 403 are treated as "pass", which means a boundary could pass all health checks while the user has no actual access to Gemini models. The check should validate authenticated model access using ADC.

These gaps were discovered during the live PoC: VPC-SC perimeter was silently skipped (no `accessPolicyId`), and Vertex AI returned HTTP 401 which was marked "pass".

## Upstream Cross-References

- REQ-GCG-003: Boundary Health Status Checks -- strengthens two of the four checks
- REQ-INFRA-010 (aegis-cli): VPC-SC perimeter validation
- REQ-INFRA-012 (aegis-cli): Endpoint connectivity verification

## Specification

### VPC-SC Perimeter Validation

The `vpc_sc_enforced` health check must distinguish between three states:

| State | Check Status | Detail |
|-------|-------------|--------|
| Perimeter exists and is ACTIVE | pass | Perimeter name and restricted services |
| Perimeter not configured (`accessPolicyId` absent) | fail | "VPC-SC perimeter not configured. Set aegis:accessPolicyId to enable." |
| Perimeter configured but not active | fail | Perimeter state and troubleshooting info |

When `accessPolicyId` is absent, the `up` subcommand should emit a `diagnostic` warning (severity "warning") during PROVISION indicating the boundary is incomplete without VPC-SC. This is not a blocking error -- the boundary is functional without VPC-SC -- but it MUST be visible.

The Pulumi stack outputs must include `perimeter_configured: "true" | "false"` so the health checker can distinguish "not configured" from "configured but broken".

### Vertex AI Model Access Validation

The `vertex_ai_reachable` check must be replaced with `vertex_ai_accessible`, which validates:

1. **Network reachability**: The endpoint responds (any HTTP status)
2. **Authenticated access**: Using ADC, list models in the project/region -- if the response is 200, the caller can access Vertex AI
3. **Model availability**: The expected model (e.g., `gemini-2.5-pro-001`) is in the model list

| Result | Check Status | Detail |
|--------|-------------|--------|
| Model found and accessible | pass | Model name and version |
| Endpoint reachable but auth fails (403) | fail | "Vertex AI reachable but caller lacks aiplatform.user role" |
| Endpoint reachable but model not found | warn | "Endpoint accessible but model gemini-2.5-pro-001 not found in region" |
| Endpoint unreachable | fail | Network error details |

## BDD Scenarios

### Scenario 1: VPC-SC perimeter not configured emits failure
- Given a provisioned boundary without accessPolicyId configured
- When the "status" subcommand is invoked
- Then the vpc_sc_enforced check has status "fail"
- And the detail mentions "not configured" and "accessPolicyId"

### Scenario 2: VPC-SC perimeter active reports pass
- Given a provisioned boundary with an active VPC-SC perimeter
- When the "status" subcommand is invoked
- Then the vpc_sc_enforced check has status "pass"
- And the detail includes the perimeter name

### Scenario 3: Vertex AI accessible with valid credentials
- Given a provisioned boundary
- And the caller has aiplatform.user role
- When the "status" subcommand is invoked
- Then the vertex_ai_accessible check has status "pass"
- And the detail includes the model name

### Scenario 4: Vertex AI reachable but no permission
- Given a provisioned boundary
- And the caller lacks aiplatform.user role
- When the "status" subcommand is invoked
- Then the vertex_ai_accessible check has status "fail"
- And the detail mentions "lacks" and "role"

### Scenario 5: Up warns when VPC-SC is not configured
- Given input without accessPolicyId
- When the "up" subcommand runs PROVISION
- Then a diagnostic event with severity "warning" mentions "VPC-SC perimeter not configured"

## TDD Test Case Signatures

- `checkVpcScPerimeter`: Validates perimeter state using Pulumi output flag + GCP API
- `checkVertexAiAccessible`: Authenticated model list check using ADC
- `isPerimeterConfigured`: Reads `perimeter_configured` from Pulumi outputs

## Acceptance Criteria

- [AC1] Missing VPC-SC perimeter is reported as "fail" with actionable instructions
- [AC2] Active VPC-SC perimeter is reported as "pass" with perimeter details
- [AC3] Vertex AI check uses authenticated requests, not just network ping
- [AC4] Vertex AI 403 is reported as "fail" (not "pass")
- [AC5] Up emits a warning diagnostic when VPC-SC is not configured
- [AC6] Stack outputs include perimeter_configured flag

## Traceability

- Parent: REQ-GCG-003 (Boundary Health Status Checks), aegis-cli REQ-INFRA-010, REQ-INFRA-012
- Tests: src/infrastructure/__tests__/health.test.ts
- Feature: tests/features/status/vpc-sc-vertex.feature
