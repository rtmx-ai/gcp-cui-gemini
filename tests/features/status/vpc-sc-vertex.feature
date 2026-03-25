Feature: VPC-SC Perimeter Validation and Vertex AI Model Access
  As aegis-cli
  I need accurate health checks that detect real compliance gaps
  So that the user is not given false assurance about boundary integrity

  # @req REQ-GCG-007
  Scenario: VPC-SC perimeter not configured emits failure
    Given a provisioned boundary without accessPolicyId configured
    When the "status" subcommand is invoked
    Then the vpc_sc_enforced check has status "fail"
    And the detail mentions "not configured" and "accessPolicyId"

  # @req REQ-GCG-007
  Scenario: VPC-SC perimeter active reports pass
    Given a provisioned boundary with an active VPC-SC perimeter
    When the "status" subcommand is invoked
    Then the vpc_sc_enforced check has status "pass"
    And the detail includes the perimeter name

  # @req REQ-GCG-007
  Scenario: Vertex AI accessible with valid authenticated credentials
    Given a provisioned boundary
    And the caller has aiplatform.user role on the project
    When the "status" subcommand is invoked
    Then the vertex_ai_accessible check has status "pass"
    And the detail includes the model name

  # @req REQ-GCG-007
  Scenario: Vertex AI reachable but caller lacks permission
    Given a provisioned boundary
    And the caller lacks aiplatform.user role
    When the "status" subcommand is invoked
    Then the vertex_ai_accessible check has status "fail"
    And the detail mentions "permission" or "role"

  # @req REQ-GCG-007
  Scenario: Up warns when VPC-SC is not configured
    Given valid GCP ADC credentials
    And input without accessPolicyId
    When the "up" subcommand is invoked
    Then a diagnostic event with severity "warning" appears during PROVISION
    And the message mentions "VPC-SC perimeter not configured"

  # @req REQ-GCG-007
  Scenario: Stack outputs include perimeter_configured flag
    Given a provisioned boundary
    When the "up" subcommand completes
    Then the result outputs include perimeter_configured "true" or "false"
