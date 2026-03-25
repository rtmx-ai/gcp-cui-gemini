/**
 * Initialization state machine for the `up` subcommand.
 *
 * Phases:
 *   0. PREFLIGHT   -- validate credentials and project access
 *   1. API_ENABLEMENT -- enable required GCP APIs and poll until active
 *   2. PROVISION   -- run Pulumi up (handled externally)
 *   3. VERIFY      -- run health checks (handled externally)
 *
 * All GCP API calls go through the injectable GcpApiClient port,
 * making every phase testable at Tier 1 with mocks.
 *
 * Implements: REQ-GCG-005
 */

import type { ProjectConfig } from "../domain/types.js";
import type { EventEmitter } from "../domain/ports.js";
import type { GcpApiClient } from "./gcp-apis.js";
import { REQUIRED_APIS } from "./gcp-apis.js";

export enum InitState {
  PREFLIGHT = "PREFLIGHT",
  API_ENABLEMENT = "API_ENABLEMENT",
  PROVISION = "PROVISION",
  VERIFY = "VERIFY",
}

export interface InitContext {
  config: ProjectConfig;
  emitter: EventEmitter;
  gcpClient: GcpApiClient;
  apiPollIntervalMs: number;
  apiPollTimeoutMs: number;
}

function emitStateTransition(ctx: InitContext, state: InitState): void {
  ctx.emitter.emit({
    type: "diagnostic",
    severity: "info",
    message: `Entering state: ${state}`,
  });
}

/** Identify errors caused by API propagation delay (retryable). */
export function isRetryableError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    (message.includes("403") && message.includes("API has not been used")) ||
    message.includes("SERVICE_DISABLED")
  );
}

/** State 0: Validate ADC credentials and project access. */
export async function runPreflight(ctx: InitContext): Promise<boolean> {
  emitStateTransition(ctx, InitState.PREFLIGHT);

  try {
    const credsValid = await ctx.gcpClient.validateCredentials();
    if (!credsValid) {
      ctx.emitter.emit({
        type: "result",
        success: false,
        error: "GCP ADC credentials are invalid or expired",
      });
      return false;
    }

    ctx.emitter.emit({
      type: "diagnostic",
      severity: "info",
      message: "ADC credentials validated",
    });

    const projectOk = await ctx.gcpClient.checkProjectAccess(ctx.config.projectId);
    if (!projectOk) {
      ctx.emitter.emit({
        type: "result",
        success: false,
        error: `Project '${ctx.config.projectId}' not found or caller lacks access`,
      });
      return false;
    }

    ctx.emitter.emit({
      type: "diagnostic",
      severity: "info",
      message: `Project '${ctx.config.projectId}' accessible`,
    });

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.emitter.emit({
      type: "result",
      success: false,
      error: `Preflight failed: ${message}`,
    });
    return false;
  }
}

/** Poll a single API until it reports ENABLED or timeout. */
export async function pollApiEnabled(ctx: InitContext, api: string): Promise<boolean> {
  const deadline = Date.now() + ctx.apiPollTimeoutMs;

  while (Date.now() < deadline) {
    const state = await ctx.gcpClient.getApiState(ctx.config.projectId, api);
    if (state === "ENABLED") {
      return true;
    }
    if (ctx.apiPollIntervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, ctx.apiPollIntervalMs));
    }
  }

  return false;
}

/** State 1: Enable required GCP APIs and poll until active. */
export async function enableApis(ctx: InitContext): Promise<boolean> {
  emitStateTransition(ctx, InitState.API_ENABLEMENT);

  for (const api of REQUIRED_APIS) {
    const state = await ctx.gcpClient.getApiState(ctx.config.projectId, api);

    if (state === "ENABLED") {
      ctx.emitter.emit({
        type: "progress",
        resource: "gcp:serviceusage:Api",
        name: api,
        operation: "create",
        status: "complete",
      });
      continue;
    }

    ctx.emitter.emit({
      type: "progress",
      resource: "gcp:serviceusage:Api",
      name: api,
      operation: "create",
      status: "in_progress",
    });

    await ctx.gcpClient.enableApi(ctx.config.projectId, api);

    const enabled = await pollApiEnabled(ctx, api);
    if (!enabled) {
      ctx.emitter.emit({
        type: "progress",
        resource: "gcp:serviceusage:Api",
        name: api,
        operation: "create",
        status: "failed",
      });
      ctx.emitter.emit({
        type: "result",
        success: false,
        error: `API '${api}' failed to enable within timeout`,
      });
      return false;
    }

    ctx.emitter.emit({
      type: "progress",
      resource: "gcp:serviceusage:Api",
      name: api,
      operation: "create",
      status: "complete",
    });
  }

  return true;
}

/**
 * Check API readiness without enabling. Used by preview, destroy, status.
 * Returns list of disabled API names (empty if all ready).
 */
export async function checkApiReadiness(ctx: InitContext): Promise<string[]> {
  emitStateTransition(ctx, InitState.API_ENABLEMENT);
  const disabled: string[] = [];

  for (const api of REQUIRED_APIS) {
    const state = await ctx.gcpClient.getApiState(ctx.config.projectId, api);
    if (state !== "ENABLED") {
      disabled.push(api);
    }
  }

  return disabled;
}

/** Check if --confirm-destroy flag is present in process args. */
export function requireConfirmDestroy(argv: string[]): boolean {
  return argv.includes("--confirm-destroy");
}
