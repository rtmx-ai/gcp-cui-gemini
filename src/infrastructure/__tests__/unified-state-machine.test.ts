import { describe, it, expect, vi } from "vitest";
import { Writable } from "node:stream";
import type { GcpApiClient } from "../gcp-apis.js";
import { REQUIRED_APIS } from "../gcp-apis.js";
import { checkApiReadiness, requireConfirmDestroy } from "../init-state-machine.js";
import type { InitContext } from "../init-state-machine.js";
import { StdoutEmitter } from "../../protocol/emitter.js";
import type { ProtocolEvent } from "../../domain/events.js";

// @req REQ-GCG-006: TDD test cases

function createTestContext(clientOverrides: Partial<GcpApiClient> = {}): {
  ctx: InitContext;
  events: ProtocolEvent[];
} {
  const events: ProtocolEvent[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      events.push(JSON.parse(chunk.toString().trim()));
      callback();
    },
  });
  const emitter = new StdoutEmitter(stream);

  const defaultClient: GcpApiClient = {
    getApiState: vi.fn().mockResolvedValue("ENABLED"),
    enableApi: vi.fn().mockResolvedValue(undefined),
    validateCredentials: vi.fn().mockResolvedValue(true),
    checkProjectAccess: vi.fn().mockResolvedValue(true),
  };

  const client = { ...defaultClient, ...clientOverrides };

  const ctx: InitContext = {
    config: { projectId: "test-project", region: "us-central1", impactLevel: "IL4" },
    emitter,
    gcpClient: client,
    apiPollIntervalMs: 0,
    apiPollTimeoutMs: 100,
  };

  return { ctx, events };
}

// --- checkApiReadiness (check-only, no enable) ---

describe("checkApiReadiness", () => {
  it("returns empty list when all APIs are enabled", async () => {
    const { ctx } = createTestContext();
    const disabled = await checkApiReadiness(ctx);
    expect(disabled).toEqual([]);
  });

  it("returns list of disabled APIs without enabling them", async () => {
    const enableApi = vi.fn();
    const getApiState = vi.fn().mockImplementation(async (_proj: string, api: string) => {
      return api === "compute.googleapis.com" ? "DISABLED" : "ENABLED";
    });
    const { ctx } = createTestContext({ getApiState, enableApi });
    const disabled = await checkApiReadiness(ctx);
    expect(disabled).toContain("compute.googleapis.com");
    expect(disabled).toHaveLength(1);
    expect(enableApi).not.toHaveBeenCalled();
  });

  it("returns all APIs when all are disabled", async () => {
    const { ctx } = createTestContext({
      getApiState: vi.fn().mockResolvedValue("DISABLED"),
    });
    const disabled = await checkApiReadiness(ctx);
    expect(disabled).toHaveLength(REQUIRED_APIS.length);
  });

  it("emits diagnostic event indicating API_ENABLEMENT state", async () => {
    const { ctx, events } = createTestContext();
    await checkApiReadiness(ctx);
    expect(
      events.some(
        (e) => e.type === "diagnostic" && "message" in e && e.message.includes("API_ENABLEMENT"),
      ),
    ).toBe(true);
  });
});

// --- requireConfirmDestroy ---

describe("requireConfirmDestroy", () => {
  it("returns true when --confirm-destroy is present", () => {
    expect(
      requireConfirmDestroy(["node", "index.js", "destroy", "--confirm-destroy", "--input", "{}"]),
    ).toBe(true);
  });

  it("returns false when --confirm-destroy is absent", () => {
    expect(requireConfirmDestroy(["node", "index.js", "destroy", "--input", "{}"])).toBe(false);
  });

  it("returns false for empty args", () => {
    expect(requireConfirmDestroy([])).toBe(false);
  });
});
