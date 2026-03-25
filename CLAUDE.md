# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

gcp-cui-gemini is an IaC deployer plugin for [aegis-cli](https://github.com/rtmx-ai/aegis-cli) that provisions an IL4/IL5-grade Assured Workloads boundary in Google Cloud with Vertex AI Gemini access. It implements the `aegis-infra/v1` contract and communicates with aegis-cli's Rust binary over a JSON-line stdout protocol.

The user never interacts with this plugin directly -- aegis-cli invokes it as a subprocess during `aegis init`, `aegis doctor`, and `aegis destroy`.

## Prerequisites

- Node.js >= 22 (pinned via `.nvmrc`; use `nvm use` to activate)
- Pulumi CLI is NOT required -- the Automation API is embedded

## Build and Test Commands

```bash
# Install dependencies
nvm use && npm install

# Build
npm run build              # tsc compilation

# Lint and format
npm run lint               # ESLint
npm run format             # Prettier check
npm run format:fix         # Prettier fix

# Test (three-tier pyramid)
npm test                   # all tests
npm run test:unit          # tier 1: unit tests only
npm run test:integration   # tier 2: integration tests (requires GCP ADC)
npm run test:e2e           # tier 3: BDD/Cucumber feature tests

# Run a single test file
npx vitest run src/domain/__tests__/protocol.test.ts

# Run tests matching a pattern
npx vitest run -t "manifest"

# Pulumi operations (for manual testing)
npx ts-node src/index.ts manifest
npx ts-node src/index.ts preview --input '{"project_id":"...","region":"us-central1","impact_level":"IL4"}'
```

## Architecture

### Plugin Contract (aegis-infra/v1)

Five subcommands, all emitting newline-delimited JSON to stdout:

| Command    | Purpose                          |
|------------|----------------------------------|
| `manifest` | Declare inputs, outputs, version |
| `preview`  | Dry-run of planned changes       |
| `up`       | Provision resources              |
| `status`   | Health check of live boundary    |
| `destroy`  | Tear down all managed resources  |

Three event types in the JSON-line protocol:
- `progress` -- resource operation status (create/update/delete, in_progress/complete/failed)
- `diagnostic` -- warnings and informational messages
- `check` -- health check results (for `status` subcommand)
- `result` -- final output with success/failure and outputs object

### Hexagonal Architecture

```
src/
  index.ts          -- CLI entrypoint: dispatches subcommands
  domain/
    types.ts        -- Value objects (ProjectConfig, ResourceOutput, HealthCheck)
    ports.ts        -- Port interfaces (IaCEngine, HealthChecker, EventEmitter)
    events.ts       -- Protocol event types conforming to aegis-infra/v1
  infrastructure/
    stack.ts        -- Pulumi program definition (KMS, VPC, VPC-SC, audit)
    automation.ts   -- Pulumi Automation API wrapper (local backend, programmatic up/destroy)
    health.ts       -- GCP API calls for status checks
  protocol/
    emitter.ts      -- JSON-line event emitter to stdout
    schema.ts       -- Manifest schema definition
```

The domain layer has zero I/O dependencies. Infrastructure implements the domain ports. The protocol layer translates between Pulumi internals and the aegis-infra/v1 wire format.

### Pulumi State

State is stored locally at `~/.aegis/state/gcp-cui-gemini/` (not Pulumi Cloud). This is a local dev tool, not a CI deployment -- single user, single workstation, no remote locking.

## Development Methodology

This project follows the same DDD/TDD/BDD approach as aegis-cli.

### Requirement Traceability (RTMX)

Requirements live in `.rtmx/requirements/CATEGORY/REQ-ID.md`. Each requirement includes BDD scenarios (Given-When-Then), TDD test signatures, acceptance criteria, and traceability to the upstream GEMINI.md spec. The `.rtmx/database.csv` maps requirements to tests.

### Three-Tier Testing Pyramid

- **Tier 1 (Unit/TDD):** Write tests before implementation. Test protocol serialization, domain types, manifest schema, input validation. No network, no GCP, no Pulumi engine.
- **Tier 2 (Integration):** Test Pulumi stack in preview/dry-run mode against real GCP ADC. Test health checks against live APIs. Sandboxed but real.
- **Tier 3 (E2E/BDD):** Cucumber feature files in `tests/features/`. Execute the compiled binary as aegis-cli would -- pipe JSON input, assert JSON-line output, verify exit codes. Feature scenarios link to requirements via `@req REQ-ID` tags.

### BDD Feature Files

```gherkin
Feature: Infrastructure provisioning
  As aegis-cli
  I need to provision a CUI boundary via the up subcommand
  So that Vertex AI is accessible within an IL4/IL5 perimeter

  @req REQ-GCG-001
  Scenario: Successful provisioning streams progress events
    Given valid GCP ADC credentials
    And input with project_id "test-project" and impact_level "IL4"
    When the up subcommand is executed
    Then stdout contains progress events for each resource
    And the final result event has success true
    And outputs include vertex_endpoint and kms_key_resource_name
```

## Key Constraints

- All GCP resources pinned to us-central1 (hardened US region only)
- CMEK encryption via Cloud KMS with 30-day rotation on all data at rest
- VPC Service Controls perimeter around `aiplatform.googleapis.com`
- Audit logs: ADMIN_READ, DATA_READ, DATA_WRITE with 365-day retention
- Vertex AI model versions must be explicit (e.g., `gemini-2.5-pro-001`), never generic aliases
- Stderr is reserved for unstructured debug logs; stdout is exclusively the JSON-line protocol
- No secrets, tokens, or CUI in Pulumi state or stack outputs -- routing metadata only
