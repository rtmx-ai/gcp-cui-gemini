# REQ-GCG-004: Local Pulumi State Backend

## Overview

Configure Pulumi Automation API to use a local file backend at `~/.aegis/state/gcp-cui-gemini/` instead of Pulumi Cloud or a remote backend. This is a design decision specific to gcp-cui-gemini -- the user is a local developer, not a CI system, so remote state locking is unnecessary.

## Upstream Cross-References

- REQ-INFRA-006 (aegis-cli): Pulumi state encryption with CMEK -- we implement local state; CMEK encryption of state is a future enhancement
- REQ-AEG-008 (aegis-cli): Secure Onboarding State Machine -- the "Configuration Commit" state writes to ~/.aegis/

## Specification

### State Directory

- Path: `~/.aegis/state/gcp-cui-gemini/`
- Created automatically on first `up` if it does not exist
- Directory permissions: 0700 (owner read/write/execute only)
- Contains Pulumi state JSON files managed by the Automation API

### Stack Naming

- Stack name format: `{project_id}-{impact_level}` (e.g., `my-project-il4`)
- One stack per project/impact-level combination
- Multiple stacks can coexist for different projects

### State Lifecycle

- `up` creates or updates state
- `destroy` removes resources but preserves state (records the empty state)
- State is never transmitted over the network
- State contains resource IDs and configuration but no secrets or CUI

## BDD Scenarios

### Scenario 1: State directory created on first provision
- Given ~/.aegis/state/gcp-cui-gemini/ does not exist
- When the `up` subcommand is invoked
- Then the directory is created with 0700 permissions
- And a Pulumi state file exists within it

### Scenario 2: State persists across invocations
- Given a previously provisioned boundary
- When the `preview` subcommand is invoked
- Then the preview reflects the existing state (no changes)

### Scenario 3: Multiple stacks coexist
- Given a provisioned boundary for project "project-a" at IL4
- When a second `up` is invoked for project "project-b" at IL5
- Then both stacks exist independently in the state directory

## TDD Test Case Signatures

- `resolveStateDir`: Expands ~ and returns absolute path to state directory
- `ensureStateDir`: Creates directory with 0700 permissions if absent
- `buildStackName`: Formats stack name from project_id and impact_level

## Acceptance Criteria

- [AC1] State directory is ~/.aegis/state/gcp-cui-gemini/ with 0700 permissions
- [AC2] Pulumi Automation API uses `file://` backend pointing to state directory
- [AC3] Stack name is deterministic from input parameters
- [AC4] No network calls are made for state storage or locking

## Traceability

- Parent: aegis-cli REQ-INFRA-006 (Pulumi state encryption)
- Tests: src/infrastructure/__tests__/automation.test.ts
- Feature: tests/features/provisioning/state.feature
