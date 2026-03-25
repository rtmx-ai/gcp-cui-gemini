# REQ-GCG-002: GCP Assured Workloads Boundary Provisioning

## Overview

Provision the IL4/IL5-grade Assured Workloads boundary in Google Cloud using Pulumi Automation API with a local state backend. This requirement implements the GCP resource set specified in aegis-cli's REQ-AEG-007 and the infrastructure automation pattern from REQ-AEG-001.

## Upstream Cross-References

- REQ-AEG-007 (aegis-cli): Assured Workloads Boundary (GCP) -- specifies the exact resource set
- REQ-AEG-001 (aegis-cli): Infrastructure Automation via `aegis init` -- specifies Pulumi Automation API
- REQ-INFRA-001 (aegis-cli): Embedded Pulumi for GCP Assured Workloads
- REQ-INFRA-004 (aegis-cli): Infrastructure preview (`aegis plan`)
- REQ-INFRA-017 (aegis-cli): Mandatory compliance metadata labels

## Specification

### Resource Set

1. **Cloud KMS KeyRing** (`aegis-keyring`) in us-central1
2. **Cloud KMS CryptoKey** (`aegis-cmek-key`) with 30-day automatic rotation, `protect: true`
3. **VPC Network** (`aegis-vpc`) with `privateIpGoogleAccess: true`
4. **Subnet** (`aegis-subnet-us-central1`) in us-central1 with Private Google Access
5. **VPC Service Controls Perimeter** around `aiplatform.googleapis.com`
6. **IAM Audit Config** for ADMIN_READ, DATA_READ, DATA_WRITE
7. **GCS Audit Bucket** with uniform bucket-level access, versioning, CMEK encryption, 365-day lifecycle

### Pulumi Configuration

- Runtime: Pulumi Automation API (programmatic, no CLI dependency)
- State backend: Local file at `~/.aegis/state/gcp-cui-gemini/`
- Stack name: derived from project_id and impact_level
- All resources tagged with compliance metadata labels: `aegis-managed: true`, `impact-level: IL4|IL5`, `compliance-framework: nist-800-171`

### Constraints

- Region: us-central1 only (hardened US region)
- No secrets, tokens, or CUI in stack state or outputs -- routing metadata only
- Vertex AI model versions must be explicit (e.g., `gemini-2.5-pro-001`)

## BDD Scenarios

### Scenario 1: Preview shows planned resources
- Given valid GCP ADC credentials for project "test-project"
- And input with impact_level "IL4"
- When the `preview` subcommand is invoked
- Then progress events list all 7 resource types with operation "create"
- And the result event has success true

### Scenario 2: Provisioning creates all resources
- Given valid GCP ADC credentials with Project Creator permissions
- And input with project_id and impact_level "IL4"
- When the `up` subcommand is invoked
- Then progress events stream as each resource is created
- And the final result includes vertex_endpoint, kms_key_resource_name, vpc_name, audit_bucket
- And all resources have compliance metadata labels

### Scenario 3: Idempotent re-provisioning
- Given an already-provisioned boundary
- When the `up` subcommand is invoked again with the same input
- Then no resources are created or destroyed
- And the result outputs match the original provisioning

### Scenario 4: Destroy tears down all resources
- Given an already-provisioned boundary
- When the `destroy` subcommand is invoked
- Then progress events stream as each resource is deleted
- And the result event has success true

### Scenario 5: KMS key has 30-day rotation
- Given a provisioned boundary
- When the KMS crypto key resource is inspected
- Then the rotation period is 30 days
- And the key is protected from accidental deletion

## TDD Test Case Signatures

- `buildStackConfig`: Constructs Pulumi stack config from ProjectConfig input
- `defineResources`: Returns the Pulumi program function defining all 7 resources
- `applyComplianceLabels`: Adds mandatory metadata labels to a resource
- `extractOutputs`: Maps Pulumi stack outputs to ResourceOutput value object

## Acceptance Criteria

- [AC1] All 7 GCP resources are created with correct configuration
- [AC2] KMS crypto key rotates every 30 days and is delete-protected
- [AC3] VPC has Private Google Access enabled
- [AC4] VPC-SC perimeter restricts aiplatform.googleapis.com
- [AC5] Audit logs capture DATA_READ, DATA_WRITE, ADMIN_READ
- [AC6] GCS bucket has versioning, CMEK, 365-day lifecycle
- [AC7] All resources have compliance metadata labels
- [AC8] Stack state is stored locally at ~/.aegis/state/gcp-cui-gemini/

## Traceability

- Parent: aegis-cli REQ-AEG-007 (Assured Workloads Boundary)
- Tests: src/infrastructure/__tests__/stack.test.ts, tests/integration/provisioning.test.ts
- Feature: tests/features/provisioning/boundary.feature
