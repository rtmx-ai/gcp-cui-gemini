/**
 * GCP Pulumi Automation API engine.
 * Implements IaCEngine from @aegis/infra-sdk.
 *
 * Uses local file backend at ~/.aegis/state/gcp-assured-workloads/.
 */

import * as automation from "@pulumi/pulumi/automation/index.js";
import type { IaCEngine, InfraConfig, BoundaryOutput } from "@aegis/infra-sdk";
import { resolveStateDir, ensureStateDir, buildStackName } from "@aegis/infra-sdk";
import { defineResources, extractOutputs } from "./stack.js";

const PLUGIN_NAME = "gcp-assured-workloads";

async function getStack(config: InfraConfig): Promise<automation.Stack> {
  ensureStateDir(PLUGIN_NAME);
  return automation.LocalWorkspace.createOrSelectStack(
    {
      stackName: buildStackName(config),
      projectName: PLUGIN_NAME,
      program: defineResources(config),
    },
    {
      projectSettings: {
        name: PLUGIN_NAME,
        runtime: "nodejs",
        backend: { url: `file://${resolveStateDir(PLUGIN_NAME)}` },
      },
      envVars: { PULUMI_CONFIG_PASSPHRASE: "" },
    },
  );
}

export class GcpPulumiEngine implements IaCEngine {
  async preview(config: InfraConfig): Promise<void> {
    const stack = await getStack(config);
    await stack.setConfig("gcp:project", { value: config.params["project_id"] });
    await stack.setConfig("gcp:region", { value: config.params["region"] ?? "us-central1" });
    await stack.preview();
  }

  async up(config: InfraConfig): Promise<BoundaryOutput> {
    const stack = await getStack(config);
    await stack.setConfig("gcp:project", { value: config.params["project_id"] });
    await stack.setConfig("gcp:region", { value: config.params["region"] ?? "us-central1" });
    const result = await stack.up();
    return extractOutputs(result.outputs);
  }

  async destroy(config: InfraConfig): Promise<void> {
    const stack = await getStack(config);
    await stack.destroy();
  }

  async getOutputs(config: InfraConfig): Promise<BoundaryOutput | undefined> {
    try {
      const stack = await getStack(config);
      const outputs = await stack.outputs();
      if (Object.keys(outputs).length === 0) return undefined;
      return extractOutputs(outputs);
    } catch {
      return undefined;
    }
  }
}
