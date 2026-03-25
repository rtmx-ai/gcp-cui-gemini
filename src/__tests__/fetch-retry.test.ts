import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveTimeout } from "../fetch-retry.js";

// @req REQ-GCG-010: configurable timeouts

describe("resolveTimeout", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns default when env var is not set", () => {
    delete process.env["AEGIS_API_TIMEOUT_MS"];
    expect(resolveTimeout("AEGIS_API_TIMEOUT_MS", 10000)).toBe(10000);
  });

  it("returns env var value when set", () => {
    process.env["AEGIS_API_TIMEOUT_MS"] = "30000";
    expect(resolveTimeout("AEGIS_API_TIMEOUT_MS", 10000)).toBe(30000);
  });

  it("returns default for non-numeric env var", () => {
    process.env["AEGIS_API_TIMEOUT_MS"] = "abc";
    expect(resolveTimeout("AEGIS_API_TIMEOUT_MS", 10000)).toBe(10000);
  });

  it("returns default for zero", () => {
    process.env["AEGIS_API_TIMEOUT_MS"] = "0";
    expect(resolveTimeout("AEGIS_API_TIMEOUT_MS", 10000)).toBe(10000);
  });

  it("returns default for negative", () => {
    process.env["AEGIS_API_TIMEOUT_MS"] = "-5000";
    expect(resolveTimeout("AEGIS_API_TIMEOUT_MS", 10000)).toBe(10000);
  });
});
