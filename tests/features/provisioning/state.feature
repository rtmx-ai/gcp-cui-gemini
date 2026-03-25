Feature: Local Pulumi State Backend
  As aegis-cli
  I need Pulumi state stored locally at ~/.aegis/state/
  So that no infrastructure state is transmitted over the network

  # @req REQ-GCG-004
  Scenario: State directory created on first provision
    Given ~/.aegis/state/gcp-cui-gemini/ does not exist
    When the "up" subcommand is invoked
    Then the directory ~/.aegis/state/gcp-cui-gemini/ is created
    And the directory has 0700 permissions
    And a Pulumi state file exists within it

  # @req REQ-GCG-004
  Scenario: State persists across invocations
    Given a previously provisioned boundary for project "test-project"
    When the "preview" subcommand is invoked with the same input
    Then the preview reflects the existing state with no changes

  # @req REQ-GCG-004
  Scenario: Multiple stacks coexist
    Given a provisioned boundary for project "project-a" at IL4
    And a provisioned boundary for project "project-b" at IL5
    Then both stacks exist independently in the state directory
    And each stack has a distinct name
