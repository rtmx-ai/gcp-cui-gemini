Feature: aegis-infra/v1 Plugin Contract
  As aegis-cli
  I need the gcp-cui-gemini plugin to speak the aegis-infra/v1 protocol
  So that I can discover, provision, and manage GCP boundaries

  # @req REQ-GCG-001
  Scenario: Manifest returns valid schema
    Given the plugin binary is executable
    When the "manifest" subcommand is invoked with no arguments
    Then stdout contains exactly one JSON line
    And the JSON includes name "gcp-cui-gemini"
    And the JSON includes contract "aegis-infra/v1"
    And the JSON includes requires.inputs with project_id, region, and impact_level
    And the JSON includes provides.outputs with vertex_endpoint, kms_key_resource_name, vpc_name, and audit_bucket
    And exit code is 0

  # @req REQ-GCG-001
  Scenario: Invalid subcommand returns usage error
    Given the plugin binary is executable
    When an unknown subcommand "foo" is provided
    Then stderr contains "Usage:"
    And exit code is 1

  # @req REQ-GCG-001
  Scenario: Missing --input returns error for preview
    Given the plugin binary is executable
    When the "preview" subcommand is invoked without --input
    Then stdout contains a result event with success false
    And the error mentions "--input"
    And exit code is 2

  # @req REQ-GCG-001
  Scenario: Missing --input returns error for up
    Given the plugin binary is executable
    When the "up" subcommand is invoked without --input
    Then stdout contains a result event with success false
    And exit code is 2

  # @req REQ-GCG-001
  Scenario: Invalid JSON in --input returns error
    Given the plugin binary is executable
    When the "up" subcommand is invoked with --input "not json"
    Then stdout contains a result event with success false
    And the error mentions "Invalid JSON"
    And exit code is 2

  # @req REQ-GCG-001
  Scenario: Missing project_id returns error
    Given the plugin binary is executable
    When the "up" subcommand is invoked with --input "{}"
    Then stdout contains a result event with success false
    And the error mentions "project_id"
    And exit code is 2
