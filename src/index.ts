#!/usr/bin/env node

/**
 * gcp-cui-gemini: IL4/IL5 Assured Workloads boundary plugin for aegis-cli.
 *
 * Implements the aegis-infra/v1 contract with five subcommands:
 * manifest, preview, up, status, destroy.
 *
 * All output goes to stdout as newline-delimited JSON (aegis-infra/v1 protocol).
 * Stderr is reserved for debug/engine logs.
 */

import { parseSubcommand, parseInput } from "./domain/types.js";
import type { ProjectConfig } from "./domain/types.js";
import { StdoutEmitter } from "./protocol/emitter.js";
import { buildManifest } from "./protocol/manifest.js";
import { PulumiEngine } from "./infrastructure/automation.js";
import { GcpHealthChecker, aggregateChecks } from "./infrastructure/health.js";
import { LiveGcpApiClient } from "./infrastructure/gcp-api-client.js";
import {
  runPreflight,
  enableApis,
  checkApiReadiness,
  requireConfirmDestroy,
  InitState,
} from "./infrastructure/init-state-machine.js";
import type { InitContext } from "./infrastructure/init-state-machine.js";

const emitter = new StdoutEmitter();
const engine = new PulumiEngine(emitter);
const healthChecker = new GcpHealthChecker();
const gcpClient = new LiveGcpApiClient();

function extractInput(): ProjectConfig {
  const inputIdx = process.argv.indexOf("--input");
  if (inputIdx === -1 || inputIdx + 1 >= process.argv.length) {
    throw new Error("--input JSON argument is required");
  }
  return parseInput(process.argv[inputIdx + 1]);
}

function buildContext(config: ProjectConfig): InitContext {
  return {
    config,
    emitter,
    gcpClient,
    apiPollIntervalMs: 5000,
    apiPollTimeoutMs: 120000,
  };
}

/** Run preflight; on failure emit result and return false. */
async function preflight(ctx: InitContext): Promise<boolean> {
  const ok = await runPreflight(ctx);
  if (!ok) process.exitCode = 2;
  return ok;
}

/** Check API readiness (no enable). On disabled APIs, emit error and return false. */
async function ensureApisReady(ctx: InitContext): Promise<boolean> {
  const disabled = await checkApiReadiness(ctx);
  if (disabled.length > 0) {
    emitter.emit({
      type: "result",
      success: false,
      error: `Required APIs not enabled: ${disabled.join(", ")}. Run 'up' first to enable them.`,
    });
    process.exitCode = 2;
    return false;
  }
  return true;
}

async function run(): Promise<void> {
  const subcommand = parseSubcommand(process.argv[2]);

  if (!subcommand) {
    process.stderr.write(
      "Usage: gcp-cui-gemini <manifest|preview|up|status|destroy> [--input JSON]\n",
    );
    process.exit(1);
  }

  try {
    switch (subcommand) {
      case "manifest":
        process.stdout.write(JSON.stringify(buildManifest()) + "\n");
        return;

      case "preview": {
        const config = extractInput();
        const ctx = buildContext(config);

        if (!(await preflight(ctx))) return;
        if (!(await ensureApisReady(ctx))) return;

        emitter.emit({
          type: "diagnostic",
          severity: "info",
          message: `Entering state: ${InitState.PROVISION}`,
        });
        await engine.preview(config);
        emitter.emit({ type: "result", success: true });
        return;
      }

      case "up": {
        const config = extractInput();
        const ctx = buildContext(config);

        if (!(await preflight(ctx))) return;

        const apisOk = await enableApis(ctx);
        if (!apisOk) {
          process.exitCode = 2;
          return;
        }

        emitter.emit({
          type: "diagnostic",
          severity: "info",
          message: `Entering state: ${InitState.PROVISION}`,
        });
        const outputs = await engine.up(config);

        if (!outputs.perimeterConfigured) {
          emitter.emit({
            type: "diagnostic",
            severity: "warning",
            message:
              "VPC-SC perimeter not configured. Set aegis:accessPolicyId in Pulumi config for IL4/IL5 compliance.",
          });
        }

        emitter.emit({
          type: "diagnostic",
          severity: "info",
          message: `Entering state: ${InitState.VERIFY}`,
        });
        const checks = await healthChecker.checkAll(config, outputs);
        for (const check of checks) {
          emitter.emit({
            type: "check",
            name: check.name,
            status: check.status,
            detail: check.detail,
          });
        }
        const { success: healthOk } = aggregateChecks(checks);

        emitter.emit({
          type: "result",
          success: healthOk,
          outputs: {
            vertex_endpoint: outputs.vertexEndpoint,
            kms_key_resource_name: outputs.kmsKeyResourceName,
            vpc_name: outputs.vpcName,
            audit_bucket: outputs.auditBucket,
            perimeter_configured: String(outputs.perimeterConfigured),
          },
        });
        return;
      }

      case "destroy": {
        const config = extractInput();
        const ctx = buildContext(config);

        if (!requireConfirmDestroy(process.argv)) {
          emitter.emit({
            type: "result",
            success: false,
            error:
              "Destroy requires --confirm-destroy flag. This will permanently remove all boundary resources.",
          });
          process.exitCode = 2;
          return;
        }

        if (!(await preflight(ctx))) return;
        if (!(await ensureApisReady(ctx))) return;

        emitter.emit({
          type: "diagnostic",
          severity: "info",
          message: `Entering state: ${InitState.PROVISION}`,
        });
        emitter.emit({
          type: "diagnostic",
          severity: "warning",
          message: "Removing resource protection from CryptoKey before destroy",
        });

        await engine.destroy(config);
        emitter.emit({ type: "result", success: true });
        return;
      }

      case "status": {
        const config = extractInput();
        const ctx = buildContext(config);

        if (!(await preflight(ctx))) return;

        const existingOutputs = await engine.getOutputs(config);
        const checks = await healthChecker.checkAll(config, existingOutputs);
        for (const check of checks) {
          emitter.emit({
            type: "check",
            name: check.name,
            status: check.status,
            detail: check.detail,
          });
        }
        const { success, summary } = aggregateChecks(checks);
        emitter.emit({ type: "result", success, summary });
        return;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitter.emit({
      type: "result",
      success: false,
      error: message,
    });
    process.exitCode = 2;
  }
}

run();
