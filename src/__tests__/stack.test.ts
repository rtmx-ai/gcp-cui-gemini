import { describe, it, expect } from "vitest";
import { complianceLabels, extractOutputs } from "../stack.js";

// @req REQ-GCG-002: compliance labels and output extraction

describe("complianceLabels", () => {
  it("returns aegis-managed label", () => {
    expect(complianceLabels("IL4")["aegis-managed"]).toBe("true");
  });

  it("lowercases impact level", () => {
    expect(complianceLabels("IL4")["impact-level"]).toBe("il4");
    expect(complianceLabels("IL5")["impact-level"]).toBe("il5");
  });

  it("includes nist-800-171 compliance framework", () => {
    expect(complianceLabels("IL4")["compliance-framework"]).toBe("nist-800-171");
  });
});

describe("extractOutputs", () => {
  it("maps Pulumi output values to BoundaryOutput", () => {
    const pulumiOutputs = {
      vertex_endpoint: { value: "us-central1-aiplatform.googleapis.com", secret: false },
      kms_key_resource_name: {
        value: "projects/p/locations/us-central1/keyRings/kr/cryptoKeys/ck",
        secret: false,
      },
      vpc_name: { value: "aegis-vpc-abc123", secret: false },
      audit_bucket: { value: "aegis-audit-logs-xyz789", secret: false },
      perimeter_configured: { value: "true", secret: false },
    };

    const output = extractOutputs(pulumiOutputs);
    expect(output["vertex_endpoint"]).toBe("us-central1-aiplatform.googleapis.com");
    expect(output["kms_key_resource_name"]).toContain("keyRings");
    expect(output["vpc_name"]).toBe("aegis-vpc-abc123");
    expect(output["audit_bucket"]).toBe("aegis-audit-logs-xyz789");
    expect(output["perimeter_configured"]).toBe("true");
  });

  it("handles missing outputs gracefully", () => {
    const output = extractOutputs({});
    expect(Object.keys(output)).toHaveLength(0);
  });
});
