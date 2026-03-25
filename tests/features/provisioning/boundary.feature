Feature: Infrastructure Provisioning
  As aegis-cli
  I need to provision a CUI boundary via the up subcommand
  So that Vertex AI is accessible within an IL4/IL5 perimeter

  # @req REQ-GCG-002
  Scenario: Preview shows planned resources
    Given valid GCP ADC credentials for project "test-project"
    And input with project_id "test-project" and impact_level "IL4"
    When the "preview" subcommand is invoked
    Then stdout contains progress events for planned resources
    And the final result event has success true
    And exit code is 0

  # @req REQ-GCG-002
  Scenario: Successful provisioning streams progress events
    Given valid GCP ADC credentials with Project Creator permissions
    And input with project_id "test-project" and impact_level "IL4"
    When the "up" subcommand is invoked
    Then stdout contains progress events for each resource
    And the final result event has success true
    And outputs include vertex_endpoint and kms_key_resource_name
    And outputs include vpc_name and audit_bucket
    And exit code is 0

  # @req REQ-GCG-002
  Scenario: Idempotent re-provisioning
    Given an already-provisioned boundary for project "test-project"
    When the "up" subcommand is invoked again with the same input
    Then no create or delete progress events are emitted
    And the result outputs match the original provisioning
    And exit code is 0

  # @req REQ-GCG-002
  Scenario: Destroy tears down all resources
    Given an already-provisioned boundary for project "test-project"
    When the "destroy" subcommand is invoked
    Then stdout contains progress events for deleted resources
    And the final result event has success true
    And exit code is 0

  # @req REQ-GCG-002, REQ-INFRA-017
  Scenario: All resources have compliance metadata labels
    Given a provisioned boundary at impact level "IL4"
    When resources are inspected
    Then all labellable resources have aegis-managed "true"
    And all labellable resources have impact-level "il4"
    And all labellable resources have compliance-framework "nist-800-171"
