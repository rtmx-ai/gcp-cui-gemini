Feature: Initialization State Machine
  As aegis-cli
  I need the up subcommand to execute a robust multi-phase initialization
  So that a clean GCP project can be brought to a fully operational boundary
  without manual API enablement or IAM configuration

  Background:
    Given the plugin binary is executable
    And input with project_id and impact_level "IL4"

  # @req REQ-GCG-005
  Scenario: Full initialization from clean project
    Given valid GCP ADC credentials for a project with no APIs enabled
    When the "up" subcommand is invoked
    Then diagnostic events indicate state transitions in order:
      | state            |
      | PREFLIGHT        |
      | API_ENABLEMENT   |
      | PROVISION        |
      | VERIFY           |
    And progress events show each required API being enabled:
      | api                                |
      | compute.googleapis.com             |
      | cloudkms.googleapis.com            |
      | storage.googleapis.com             |
      | iam.googleapis.com                 |
      | cloudresourcemanager.googleapis.com |
    And progress events show each boundary resource being created
    And check events confirm boundary health
    And the final result has success true with outputs

  # @req REQ-GCG-005
  Scenario: Preflight fails on invalid credentials
    Given expired GCP ADC credentials
    When the "up" subcommand is invoked
    Then a diagnostic event indicates "PREFLIGHT" state
    And the result event has success false
    And the error mentions "credentials" or "authentication"
    And no subsequent state transitions occur

  # @req REQ-GCG-005
  Scenario: Preflight fails on nonexistent project
    Given valid GCP ADC credentials
    And input with project_id "nonexistent-project-xyz-000"
    When the "up" subcommand is invoked
    Then a diagnostic event indicates "PREFLIGHT" state
    And the result event has success false
    And the error mentions "project" or "not found" or "permission"

  # @req REQ-GCG-005
  Scenario: API enablement is idempotent on fully enabled project
    Given valid GCP ADC credentials
    And all required APIs are already enabled on the project
    When the "up" subcommand is invoked
    Then the API_ENABLEMENT state completes with no enable calls
    And each API progress event transitions directly to "complete"
    And provisioning proceeds normally

  # @req REQ-GCG-005
  Scenario: API enablement handles propagation delay
    Given valid GCP ADC credentials
    And the KMS API was just enabled and returns 403 on first poll
    When the "up" subcommand is invoked
    Then the API_ENABLEMENT state retries polling
    And the KMS API eventually reports "complete"
    And provisioning succeeds after the delay

  # @req REQ-GCG-005
  Scenario: API enablement times out
    Given valid GCP ADC credentials
    And the Compute API never transitions to ENABLED within 120 seconds
    When the "up" subcommand is invoked
    Then a diagnostic event indicates "API_ENABLEMENT" state
    And the result event has success false
    And the error mentions "compute.googleapis.com" and "timeout"
    And no resources are created

  # @req REQ-GCG-005
  Scenario: Partial provision converges on retry
    Given a previous "up" that created KMS and VPC but failed on the audit bucket
    When the "up" subcommand is invoked again
    Then PREFLIGHT passes (credentials and project still valid)
    And API_ENABLEMENT passes (APIs still enabled)
    And PROVISION creates only the missing resources
    And the final result has success true

  # @req REQ-GCG-005
  Scenario: Verify reports partial health without rollback
    Given a fully provisioned boundary
    And the audit bucket was manually deleted after provisioning
    When the "up" subcommand is invoked
    Then PROVISION detects the missing bucket and recreates it
    And VERIFY runs health checks
    And the final result has success true

  # @req REQ-GCG-005
  Scenario: State transitions are observable via diagnostic events
    Given valid GCP ADC credentials
    When the "up" subcommand is invoked
    Then each state transition emits a diagnostic event with severity "info"
    And the message contains the state name
    And the events appear in stdout before the corresponding state's progress events
