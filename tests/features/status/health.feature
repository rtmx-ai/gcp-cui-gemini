Feature: Boundary Health Status Checks
  As aegis-cli (via aegis doctor)
  I need to verify the provisioned boundary is intact
  So that I can alert the user before they attempt to use a broken boundary

  # @req REQ-GCG-003
  Scenario: All checks pass on healthy boundary
    Given a fully provisioned and healthy boundary
    When the "status" subcommand is invoked
    Then 4 check events are emitted
    And all check events have status "pass"
    And the result summary says "4 passed (4 total)"
    And result success is true
    And exit code is 0

  # @req REQ-GCG-003
  Scenario: KMS key disabled reports failure
    Given a provisioned boundary where the CMEK key has been disabled
    When the "status" subcommand is invoked
    Then the kms_key_active check has status "fail"
    And result success is false
    And exit code is 0

  # @req REQ-GCG-003
  Scenario: Missing permissions reports warning not failure
    Given valid credentials lacking Cloud KMS Viewer role
    When the "status" subcommand is invoked
    Then the kms_key_active check has status "warn"
    And detail mentions "permissions"
    And result success is true

  # @req REQ-GCG-003
  Scenario: Individual check failure does not block other checks
    Given a boundary where only the audit bucket has been deleted
    When the "status" subcommand is invoked
    Then 4 check events are emitted
    And 3 checks have status "pass"
    And 1 check has status "fail"

  # @req REQ-GCG-003
  Scenario: Vertex AI endpoint unreachable
    Given a provisioned boundary where VPC-SC blocks outbound traffic
    When the "status" subcommand is invoked
    Then the vertex_ai_reachable check has status "fail"
    And detail includes the endpoint URL
