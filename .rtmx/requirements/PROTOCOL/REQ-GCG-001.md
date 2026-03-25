# REQ-GCG-001: aegis-infra/v1 Plugin Contract

## Overview

Define the subprocess communication protocol between aegis-cli (Rust) and this plugin. The plugin implements five subcommands (manifest, preview, up, status, destroy) and communicates via newline-delimited JSON on stdout. This requirement is new to gcp-cui-gemini and does not exist upstream -- it bridges the architectural gap between aegis-cli's Rust binary and the Pulumi TypeScript IaC engine.

## Upstream Cross-References

- REQ-AEG-001 (aegis-cli): Infrastructure Automation via `aegis init` -- this plugin is the IaC backend that `aegis init` invokes
- REQ-AEG-008 (aegis-cli): Secure Onboarding State Machine -- the "Infrastructure Binding" state calls our `up` subcommand

## Specification

### Subcommands

| Command   | Input              | Output                          | Exit Code |
|-----------|--------------------|---------------------------------|-----------|
| manifest  | None               | Manifest JSON (schema, version) | 0=ok      |
| preview   | --input JSON       | Progress + result events        | 0=ok      |
| up        | --input JSON       | Progress + result events        | 0=ok      |
| status    | --input JSON       | Check + result events           | 0=ok      |
| destroy   | --input JSON       | Progress + result events        | 0=ok      |

### JSON-Line Event Types

- `progress`: Resource operation status (resource, name, operation, status)
- `diagnostic`: Warnings and informational messages (severity, message)
- `check`: Health check result (name, status, detail) -- status subcommand only
- `result`: Final output (success, outputs or error)

### Wire Format

- stdout: Exclusively newline-delimited JSON events (one per line)
- stderr: Unstructured debug/engine logs (not parsed by aegis-cli)
- Exit code 0: Success. Exit code 1: Usage error. Exit code 2: Runtime error.

### Contract Versioning

The `manifest` output includes a `contract` field with semver (e.g., `aegis-infra/v1`). aegis-cli rejects plugins speaking an incompatible contract version.

## BDD Scenarios

### Scenario 1: Manifest returns valid schema
- Given the plugin binary is executable
- When the `manifest` subcommand is invoked with no arguments
- Then stdout contains exactly one JSON line
- And the JSON includes name, version, contract, requires.inputs, and provides.outputs
- And the contract field equals "aegis-infra/v1"

### Scenario 2: Invalid subcommand returns usage error
- Given the plugin binary is executable
- When an unknown subcommand "foo" is provided
- Then stderr contains usage instructions
- And exit code is 1

### Scenario 3: Missing --input returns error for stateful commands
- Given the plugin binary is executable
- When the `up` subcommand is invoked without --input
- Then a result event with success false is emitted
- And exit code is 2

### Scenario 4: Progress events stream during provisioning
- Given valid input JSON with project_id and region
- When the `up` subcommand is invoked
- Then stdout emits one or more progress events before the final result event
- And each progress event has type, resource, name, operation, and status fields

## TDD Test Case Signatures

- `parseSubcommand`: Validates subcommand string against allowed values
- `parseInput`: Deserializes --input JSON into ProjectConfig value object
- `emitEvent`: Serializes a protocol event to a JSON line on stdout
- `emitResult`: Serializes the final result event with outputs or error

## Acceptance Criteria

- [AC1] All five subcommands are dispatched correctly
- [AC2] Unknown subcommands produce exit code 1 with usage on stderr
- [AC3] All stdout output is valid newline-delimited JSON parseable by aegis-cli
- [AC4] No non-JSON output appears on stdout under any circumstance
- [AC5] The manifest contract field matches "aegis-infra/v1"

## Traceability

- Parent: aegis-cli REQ-AEG-001 (Infrastructure Automation)
- Tests: src/domain/__tests__/protocol.test.ts, src/protocol/__tests__/emitter.test.ts
- Feature: tests/features/protocol/contract.feature
