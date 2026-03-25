/**
 * Pulumi Automation API wrapper.
 *
 * Uses local file backend at ~/.aegis/state/gcp-cui-gemini/.
 * Programmatic preview, up, destroy without requiring the Pulumi CLI.
 *
 * Implements: REQ-GCG-002 (provisioning), REQ-GCG-004 (local state)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as automation from "@pulumi/pulumi/automation/index.js";
import type { ProjectConfig, ResourceOutput } from "../domain/types.js";
import type { IaCEngine } from "../domain/ports.js";
import type { EventEmitter } from "../domain/ports.js";
import { defineResources, extractOutputs } from "./stack.js";

const STATE_DIR_NAME = "gcp-cui-gemini";
const STATE_BASE = path.join(os.homedir(), ".aegis", "state", STATE_DIR_NAME);

/** Resolve the absolute path to the local state directory. */
export function resolveStateDir(): string {
  return STATE_BASE;
}

/** Create the state directory with 0700 permissions if it does not exist. */
export function ensureStateDir(): void {
  const dir = resolveStateDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/** Build a deterministic stack name from project config. */
export function buildStackName(config: ProjectConfig): string {
  return `${config.projectId}-${config.impactLevel.toLowerCase()}`;
}

/** Create or select a Pulumi stack with local file backend. */
async function getStack(config: ProjectConfig): Promise<automation.Stack> {
  ensureStateDir();
  const stackName = buildStackName(config);
  const projectName = "gcp-cui-gemini";
  const program = defineResources(config);

  return automation.LocalWorkspace.createOrSelectStack(
    {
      stackName,
      projectName,
      program,
    },
    {
      projectSettings: {
        name: projectName,
        runtime: "nodejs",
        backend: {
          url: `file://${resolveStateDir()}`,
        },
      },
      envVars: {
        PULUMI_CONFIG_PASSPHRASE: "",
      },
    },
  );
}

/** IaCEngine implementation using Pulumi Automation API. */
export class PulumiEngine implements IaCEngine {
  private readonly emitter: EventEmitter;

  constructor(emitter: EventEmitter) {
    this.emitter = emitter;
  }

  /** Read current stack outputs without running an update. */
  async getOutputs(config: ProjectConfig): Promise<ResourceOutput | undefined> {
    try {
      const stack = await getStack(config);
      const outputs = await stack.outputs();
      if (Object.keys(outputs).length === 0) return undefined;
      return extractOutputs(outputs);
    } catch {
      return undefined;
    }
  }

  async preview(config: ProjectConfig): Promise<void> {
    const stack = await getStack(config);

    await stack.setConfig("gcp:project", { value: config.projectId });
    await stack.setConfig("gcp:region", { value: config.region });

    const result = await stack.preview({
      onEvent: (event) => {
        if (event.resourcePreEvent) {
          const meta = event.resourcePreEvent.metadata;
          this.emitter.emit({
            type: "progress",
            resource: meta.type,
            name: meta.urn.split("::").pop() ?? "",
            operation: mapOperation(meta.op),
            status: "in_progress",
          });
        }
      },
    });

    this.emitter.emit({
      type: "diagnostic",
      severity: "info",
      message: `Preview complete: ${result.changeSummary?.create ?? 0} to create, ${result.changeSummary?.update ?? 0} to update, ${result.changeSummary?.delete ?? 0} to delete`,
    });
  }

  async up(config: ProjectConfig): Promise<ResourceOutput> {
    const stack = await getStack(config);

    await stack.setConfig("gcp:project", { value: config.projectId });
    await stack.setConfig("gcp:region", { value: config.region });

    const result = await stack.up({
      onEvent: (event) => {
        if (event.resOutputsEvent) {
          const meta = event.resOutputsEvent.metadata;
          this.emitter.emit({
            type: "progress",
            resource: meta.type,
            name: meta.urn.split("::").pop() ?? "",
            operation: mapOperation(meta.op),
            status: "complete",
          });
        }
      },
    });

    return extractOutputs(result.outputs);
  }

  async destroy(config: ProjectConfig): Promise<void> {
    const stack = await getStack(config);

    await stack.destroy({
      onEvent: (event) => {
        if (event.resOutputsEvent) {
          const meta = event.resOutputsEvent.metadata;
          this.emitter.emit({
            type: "progress",
            resource: meta.type,
            name: meta.urn.split("::").pop() ?? "",
            operation: "delete",
            status: "complete",
          });
        }
      },
    });
  }
}

function mapOperation(op: string): "create" | "update" | "delete" {
  switch (op) {
    case "create":
      return "create";
    case "update":
    case "replace":
      return "update";
    case "delete":
      return "delete";
    default:
      return "create";
  }
}
