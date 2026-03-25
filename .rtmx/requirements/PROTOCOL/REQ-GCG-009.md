# REQ-GCG-009: Extract @aegis/infra-sdk for Plugin Ecosystem

## Overview

The gcp-cui-gemini plugin contains significant generic infrastructure that repeats for every backend plugin regardless of CSP or model provider. This code must be extracted into a shared SDK (`@aegis/infra-sdk`) so that plugin authors implement only three port interfaces and the SDK handles protocol compliance, lifecycle orchestration, CLI dispatch, and safety gates.

This requirement was identified by analyzing DRY violations in the exemplar plugin: the protocol layer, state machine skeleton, CLI entrypoint, and domain types are CSP-agnostic and would be copy-pasted verbatim into any new plugin without the SDK.

## Upstream Cross-References

- REQ-GCG-001: aegis-infra/v1 Plugin Contract -- the SDK enforces this contract
- REQ-GCG-005: Initialization State Machine -- the SDK provides the generic orchestrator
- REQ-GCG-006: Unified State Machine for All Subcommands -- the SDK wires all subcommands

## Specification

### SDK Public API

The SDK exports a single entrypoint function and the port interfaces a plugin must implement:

```typescript
import { createPluginCli } from "@aegis/infra-sdk";

createPluginCli({
  name: "gcp-cui-gemini",
  version: "0.1.0",
  description: "IL4/IL5 Assured Workloads boundary with Vertex AI Gemini",
  credentials: ["gcp-adc"],
  inputs: [
    { name: "project_id", type: "string", required: true },
    { name: "region", type: "string", default: "us-central1" },
    { name: "impact_level", type: "enum", values: ["IL4", "IL5"], default: "IL4" },
  ],
  outputs: ["vertex_endpoint", "kms_key_resource_name", "vpc_name", "audit_bucket"],
  cspClient: new MyGcpApiClient(),
  engine: new MyPulumiEngine(),
  healthChecker: new MyGcpHealthChecker(),
});
```

### Port Interfaces (implemented by each plugin)

```typescript
/** CSP-specific credential validation and API readiness. */
interface CspClient {
  validateCredentials(): Promise<boolean>;
  checkProjectAccess(config: InfraConfig): Promise<boolean>;
  getApiState(config: InfraConfig, api: string): Promise<"ENABLED" | "DISABLED">;
  enableApi(config: InfraConfig, api: string): Promise<void>;
  readonly requiredApis: readonly string[];
}

/** CSP-specific IaC provisioning. */
interface IaCEngine {
  preview(config: InfraConfig): Promise<void>;
  up(config: InfraConfig): Promise<BoundaryOutput>;
  destroy(config: InfraConfig): Promise<void>;
  getOutputs(config: InfraConfig): Promise<BoundaryOutput | undefined>;
}

/** CSP-specific health checks. */
interface HealthChecker {
  checkAll(config: InfraConfig, outputs?: BoundaryOutput): Promise<HealthCheck[]>;
}
```

### What the SDK Provides (plugin author does NOT implement)

| Component | Source in gcp-cui-gemini | SDK Module |
|-----------|------------------------|------------|
| StdoutEmitter | src/protocol/emitter.ts | @aegis/infra-sdk/protocol |
| ProtocolEvent types | src/domain/events.ts | @aegis/infra-sdk/events |
| Manifest builder | src/protocol/manifest.ts | @aegis/infra-sdk/manifest |
| CLI dispatch | src/index.ts (switch/case) | @aegis/infra-sdk/cli |
| Input parsing | src/domain/types.ts (parseSubcommand, parseInput) | @aegis/infra-sdk/cli |
| --confirm-destroy gate | src/infrastructure/init-state-machine.ts | @aegis/infra-sdk/lifecycle |
| State machine orchestration | src/index.ts + init-state-machine.ts | @aegis/infra-sdk/lifecycle |
| Health check aggregation | src/infrastructure/health.ts (aggregateChecks) | @aegis/infra-sdk/health |
| State directory management | src/infrastructure/automation.ts (ensureStateDir) | @aegis/infra-sdk/state |

### What Stays in Each Plugin

| Component | Why |
|-----------|-----|
| Pulumi stack definition | Resources differ per CSP (GCP KMS vs AWS KMS vs Azure Key Vault) |
| Pulumi Automation API wrapper | Stack config, provider, and resource types are CSP-specific |
| Health check implementations | API calls differ per CSP |
| CspClient implementation | REST endpoints differ per CSP |
| Required API list | GCP Service Usage vs AWS service activation vs Azure RP registration |

### SDK Package Structure

```
@aegis/infra-sdk/
  src/
    cli/
      entrypoint.ts     createPluginCli() -- wires everything
      args.ts           Subcommand parsing, --input, --confirm-destroy
    lifecycle/
      state-machine.ts  Generic PREFLIGHT/API_ENABLE/PROVISION/VERIFY
      types.ts          InitContext, InitState
    protocol/
      emitter.ts        StdoutEmitter
      events.ts         ProtocolEvent union
      manifest.ts       Manifest builder from plugin config
    domain/
      types.ts          InfraConfig, BoundaryOutput, HealthCheck
      ports.ts          CspClient, IaCEngine, HealthChecker
    health/
      aggregator.ts     aggregateChecks()
    state/
      local.ts          ensureStateDir(), resolveStateDir()
```

### Contract Version

The SDK owns the contract version string (`aegis-infra/v1`). When the protocol evolves to v2, the SDK updates and all plugins automatically comply by upgrading the SDK dependency.

## BDD Scenarios

### Scenario 1: Minimal plugin boots with createPluginCli
- Given a plugin that implements CspClient, IaCEngine, and HealthChecker
- And calls createPluginCli with name, version, inputs, outputs, and the three implementations
- When the "manifest" subcommand is invoked
- Then the manifest JSON is emitted with the correct name, version, and contract
- And the inputs and outputs match what was declared

### Scenario 2: SDK runs state machine for up subcommand
- Given a plugin registered via createPluginCli
- And CspClient.validateCredentials returns true
- And CspClient.checkProjectAccess returns true
- And all required APIs are enabled
- When the "up" subcommand is invoked
- Then diagnostic events indicate PREFLIGHT, API_ENABLEMENT, PROVISION, VERIFY states
- And IaCEngine.up is called exactly once
- And HealthChecker.checkAll is called with the outputs from up

### Scenario 3: SDK enforces --confirm-destroy
- Given a plugin registered via createPluginCli
- When the "destroy" subcommand is invoked without --confirm-destroy
- Then the result event has success false
- And the error mentions "--confirm-destroy"
- And IaCEngine.destroy is never called

### Scenario 4: SDK handles preflight failure
- Given a plugin where CspClient.validateCredentials returns false
- When the "up" subcommand is invoked
- Then diagnostic indicates PREFLIGHT state
- And the result event has success false with error about credentials
- And IaCEngine.up is never called
- And CspClient.enableApi is never called

### Scenario 5: SDK checks API readiness for preview and destroy
- Given a plugin where one required API is disabled
- When the "preview" subcommand is invoked
- Then the result event has success false
- And the error mentions the disabled API and "Run 'up' first"

### Scenario 6: SDK emits only valid JSON on stdout
- Given any subcommand invocation
- When the SDK processes the command
- Then every line on stdout is valid JSON
- And no non-JSON content appears on stdout

### Scenario 7: Two plugins from different CSPs use the same SDK
- Given plugin-a implements GCP ports
- And plugin-b implements AWS ports
- When both are registered via createPluginCli
- Then both emit the same aegis-infra/v1 protocol
- And both enforce --confirm-destroy
- And both run the same state machine phases

## TDD Test Case Signatures

- `createPluginCli`: Wires subcommand dispatch from plugin config. Returns void (starts CLI).
- `buildManifestFromConfig`: Constructs Manifest from plugin config object.
- `runLifecycle`: Orchestrates state machine with generic CspClient/IaCEngine/HealthChecker.
- `parsePluginInput`: Validates --input JSON against declared inputs schema.
- `enforceConfirmDestroy`: Checks for --confirm-destroy in argv.

## Acceptance Criteria

- [AC1] A plugin author implements 3 interfaces and calls createPluginCli -- no protocol, lifecycle, or CLI code needed
- [AC2] The SDK enforces aegis-infra/v1 protocol compliance for all plugins
- [AC3] The SDK runs the 4-phase state machine for `up` and appropriate subsets for other subcommands
- [AC4] The SDK handles --confirm-destroy safety gate for all plugins
- [AC5] The SDK owns the contract version and manifest schema
- [AC6] gcp-cui-gemini is refactored to use the SDK with no behavioral changes
- [AC7] A second plugin stub (e.g., aws-govcloud-bedrock) validates the SDK generalizes

## Traceability

- Parent: REQ-GCG-001 (Plugin Contract), REQ-GCG-005 (State Machine), REQ-GCG-006 (Unified Lifecycle)
- Repo: rtmx-ai/aegis-infra-sdk (to be created)
- Tests: SDK repo unit tests + gcp-cui-gemini regression tests after refactor
