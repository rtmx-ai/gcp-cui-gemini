import { describe, it, expect } from "vitest";
import type {
  ProgressEvent,
  DiagnosticEvent,
  CheckEvent,
  ResultEvent,
  ProtocolEvent,
} from "../events.js";

// @req REQ-GCG-001: Protocol event type validation

describe("ProtocolEvent types", () => {
  it("ProgressEvent has correct shape", () => {
    const event: ProgressEvent = {
      type: "progress",
      resource: "gcp:kms:KeyRing",
      name: "aegis-keyring",
      operation: "create",
      status: "in_progress",
    };
    expect(event.type).toBe("progress");
    expect(event.operation).toBe("create");
    expect(event.status).toBe("in_progress");
  });

  it("DiagnosticEvent has correct shape", () => {
    const event: DiagnosticEvent = {
      type: "diagnostic",
      severity: "warning",
      message: "Audit log sink has 24h propagation delay",
    };
    expect(event.type).toBe("diagnostic");
    expect(event.severity).toBe("warning");
  });

  it("CheckEvent has correct shape", () => {
    const event: CheckEvent = {
      type: "check",
      name: "kms_key_active",
      status: "pass",
      detail: "aegis-cmek-key is ENABLED",
    };
    expect(event.type).toBe("check");
    expect(event.status).toBe("pass");
  });

  it("ResultEvent with outputs has correct shape", () => {
    const event: ResultEvent = {
      type: "result",
      success: true,
      outputs: {
        vertex_endpoint: "us-central1-aiplatform.googleapis.com",
      },
    };
    expect(event.type).toBe("result");
    expect(event.success).toBe(true);
    expect(event.outputs?.vertex_endpoint).toBe("us-central1-aiplatform.googleapis.com");
  });

  it("ResultEvent with error has correct shape", () => {
    const event: ResultEvent = {
      type: "result",
      success: false,
      error: "Insufficient permissions",
    };
    expect(event.success).toBe(false);
    expect(event.error).toBe("Insufficient permissions");
  });

  it("all event types are assignable to ProtocolEvent", () => {
    const events: ProtocolEvent[] = [
      { type: "progress", resource: "r", name: "n", operation: "create", status: "complete" },
      { type: "diagnostic", severity: "info", message: "m" },
      { type: "check", name: "c", status: "pass", detail: "d" },
      { type: "result", success: true },
    ];
    expect(events).toHaveLength(4);
  });
});
