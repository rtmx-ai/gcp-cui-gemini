import { describe, it, expect } from "vitest";
import { buildManifest, CONTRACT_VERSION } from "../manifest.js";

// @req REQ-GCG-001: Manifest returns valid schema

describe("buildManifest", () => {
  const manifest = buildManifest();

  it("returns correct plugin name", () => {
    expect(manifest.name).toBe("gcp-cui-gemini");
  });

  it("returns aegis-infra/v1 contract", () => {
    expect(manifest.contract).toBe("aegis-infra/v1");
    expect(CONTRACT_VERSION).toBe("aegis-infra/v1");
  });

  it("requires gcp-adc credentials", () => {
    expect(manifest.requires.credentials).toContain("gcp-adc");
  });

  it("declares project_id as required input", () => {
    const projectId = manifest.requires.inputs.find((i) => i.name === "project_id");
    expect(projectId).toBeDefined();
    expect(projectId!.required).toBe(true);
    expect(projectId!.type).toBe("string");
  });

  it("declares region with us-central1 default", () => {
    const region = manifest.requires.inputs.find((i) => i.name === "region");
    expect(region).toBeDefined();
    expect(region!.default).toBe("us-central1");
  });

  it("declares impact_level as enum with IL4/IL5", () => {
    const impact = manifest.requires.inputs.find((i) => i.name === "impact_level");
    expect(impact).toBeDefined();
    expect(impact!.type).toBe("enum");
    expect(impact!.values).toEqual(["IL4", "IL5"]);
    expect(impact!.default).toBe("IL4");
  });

  it("provides all four expected outputs", () => {
    const names = manifest.provides.outputs.map((o) => o.name);
    expect(names).toContain("vertex_endpoint");
    expect(names).toContain("kms_key_resource_name");
    expect(names).toContain("vpc_name");
    expect(names).toContain("audit_bucket");
  });

  it("is JSON-serializable without data loss", () => {
    const json = JSON.stringify(manifest);
    const roundtripped = JSON.parse(json);
    expect(roundtripped).toEqual(manifest);
  });
});
