import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import { StdoutEmitter } from "../emitter.js";
import type { ProtocolEvent } from "../../domain/events.js";

// @req REQ-GCG-001: emitEvent, emitResult

function createCapture() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return {
    stream,
    lines: () =>
      chunks
        .join("")
        .split("\n")
        .filter((l) => l.length > 0),
  };
}

describe("StdoutEmitter", () => {
  it("emits a progress event as a single JSON line", () => {
    const { stream, lines } = createCapture();
    const emitter = new StdoutEmitter(stream);

    emitter.emit({
      type: "progress",
      resource: "gcp:kms:KeyRing",
      name: "aegis-keyring",
      operation: "create",
      status: "complete",
    });

    const output = lines();
    expect(output).toHaveLength(1);
    const parsed = JSON.parse(output[0]);
    expect(parsed.type).toBe("progress");
    expect(parsed.resource).toBe("gcp:kms:KeyRing");
  });

  it("emits multiple events as separate lines", () => {
    const { stream, lines } = createCapture();
    const emitter = new StdoutEmitter(stream);

    emitter.emit({
      type: "progress",
      resource: "r1",
      name: "n1",
      operation: "create",
      status: "in_progress",
    });
    emitter.emit({
      type: "progress",
      resource: "r1",
      name: "n1",
      operation: "create",
      status: "complete",
    });
    emitter.emit({
      type: "result",
      success: true,
      outputs: { vpc_name: "aegis-vpc" },
    });

    const output = lines();
    expect(output).toHaveLength(3);
    expect(JSON.parse(output[2]).success).toBe(true);
  });

  it("emits check events for status subcommand", () => {
    const { stream, lines } = createCapture();
    const emitter = new StdoutEmitter(stream);

    emitter.emit({
      type: "check",
      name: "kms_key_active",
      status: "pass",
      detail: "Key is ENABLED",
    });

    const parsed = JSON.parse(lines()[0]);
    expect(parsed.type).toBe("check");
    expect(parsed.status).toBe("pass");
  });

  it("emits diagnostic events", () => {
    const { stream, lines } = createCapture();
    const emitter = new StdoutEmitter(stream);

    emitter.emit({
      type: "diagnostic",
      severity: "warning",
      message: "Propagation delay expected",
    });

    const parsed = JSON.parse(lines()[0]);
    expect(parsed.type).toBe("diagnostic");
    expect(parsed.severity).toBe("warning");
  });

  it("emits result with error", () => {
    const { stream, lines } = createCapture();
    const emitter = new StdoutEmitter(stream);

    emitter.emit({
      type: "result",
      success: false,
      error: "Permission denied",
    });

    const parsed = JSON.parse(lines()[0]);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe("Permission denied");
  });

  it("each line is valid JSON (no trailing garbage)", () => {
    const { stream, lines } = createCapture();
    const emitter = new StdoutEmitter(stream);

    const events: ProtocolEvent[] = [
      { type: "progress", resource: "r", name: "n", operation: "create", status: "complete" },
      { type: "diagnostic", severity: "info", message: "m" },
      { type: "check", name: "c", status: "pass", detail: "d" },
      { type: "result", success: true },
    ];

    for (const event of events) {
      emitter.emit(event);
    }

    for (const line of lines()) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
