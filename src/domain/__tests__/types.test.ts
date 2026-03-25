import { describe, it, expect } from "vitest";
import { parseSubcommand, parseInput, SUBCOMMANDS } from "../types.js";

// @req REQ-GCG-001: parseSubcommand

describe("parseSubcommand", () => {
  it("returns the subcommand for each valid value", () => {
    for (const cmd of SUBCOMMANDS) {
      expect(parseSubcommand(cmd)).toBe(cmd);
    }
  });

  it("returns null for undefined input", () => {
    expect(parseSubcommand(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseSubcommand("")).toBeNull();
  });

  it("returns null for unknown subcommand", () => {
    expect(parseSubcommand("foo")).toBeNull();
    expect(parseSubcommand("init")).toBeNull();
    expect(parseSubcommand("MANIFEST")).toBeNull();
  });
});

// @req REQ-GCG-001: parseInput

describe("parseInput", () => {
  it("parses valid input with all fields", () => {
    const config = parseInput(
      JSON.stringify({
        project_id: "my-project",
        region: "us-central1",
        impact_level: "IL4",
      }),
    );
    expect(config).toEqual({
      projectId: "my-project",
      region: "us-central1",
      impactLevel: "IL4",
    });
  });

  it("defaults region to us-central1", () => {
    const config = parseInput(JSON.stringify({ project_id: "my-project" }));
    expect(config.region).toBe("us-central1");
  });

  it("defaults impact_level to IL4", () => {
    const config = parseInput(JSON.stringify({ project_id: "my-project" }));
    expect(config.impactLevel).toBe("IL4");
  });

  it("accepts IL5 impact level", () => {
    const config = parseInput(JSON.stringify({ project_id: "p", impact_level: "IL5" }));
    expect(config.impactLevel).toBe("IL5");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseInput("not json")).toThrow("Invalid JSON");
  });

  it("throws on non-object JSON", () => {
    expect(() => parseInput('"just a string"')).toThrow("must be a JSON object");
  });

  it("throws on missing project_id", () => {
    expect(() => parseInput(JSON.stringify({}))).toThrow("project_id is required");
  });

  it("throws on empty project_id", () => {
    expect(() => parseInput(JSON.stringify({ project_id: "" }))).toThrow("project_id is required");
  });

  it("throws on invalid impact_level", () => {
    expect(() => parseInput(JSON.stringify({ project_id: "p", impact_level: "IL3" }))).toThrow(
      "impact_level must be",
    );
  });
});
