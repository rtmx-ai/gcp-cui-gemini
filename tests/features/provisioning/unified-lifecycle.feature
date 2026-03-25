Feature: Unified State Machine for All Stateful Subcommands
  As aegis-cli
  I need all stateful subcommands to run preflight checks
  So that invalid credentials or disabled APIs produce clear errors
  instead of raw GCP 403 failures

  # @req REQ-GCG-006
  Scenario: Preview runs preflight before dry run
    Given valid GCP ADC credentials
    And input with project_id and impact_level "IL4"
    When the "preview" subcommand is invoked
    Then a diagnostic event indicates "PREFLIGHT" state
    And a diagnostic event indicates "API_ENABLEMENT" state
    And the API_ENABLEMENT state checks but does not enable APIs
    And preview proceeds with planned resource output

  # @req REQ-GCG-006
  Scenario: Preview fails cleanly when APIs are disabled
    Given valid GCP ADC credentials
    And the Compute API is disabled on the project
    When the "preview" subcommand is invoked
    Then the result event has success false
    And the error mentions "compute.googleapis.com" and "not enabled"
    And the error includes instructions to run "up" first

  # @req REQ-GCG-006
  Scenario: Destroy requires --confirm-destroy flag
    Given a provisioned boundary
    And input with project_id and impact_level "IL4"
    When the "destroy" subcommand is invoked without --confirm-destroy
    Then the result event has success false
    And the error mentions "--confirm-destroy"
    And no resources are destroyed

  # @req REQ-GCG-006
  Scenario: Destroy with confirmation runs full lifecycle
    Given a provisioned boundary
    And the --confirm-destroy flag is provided
    When the "destroy" subcommand is invoked
    Then a diagnostic event indicates "PREFLIGHT" state
    And a diagnostic warns about unprotecting the CryptoKey
    And progress events show each resource being deleted
    And the result event has success true

  # @req REQ-GCG-006
  Scenario: Destroy fails on invalid credentials
    Given expired GCP ADC credentials
    And the --confirm-destroy flag is provided
    When the "destroy" subcommand is invoked
    Then a diagnostic event indicates "PREFLIGHT" state
    And the result event has success false
    And no resources are destroyed

  # @req REQ-GCG-006
  Scenario: Status runs preflight before health checks
    Given valid GCP ADC credentials
    And input with project_id and impact_level "IL4"
    When the "status" subcommand is invoked
    Then a diagnostic event indicates "PREFLIGHT" state
    And health check events follow the preflight
