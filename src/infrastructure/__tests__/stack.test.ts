import { describe, it, expect } from "vitest";
import { complianceLabels, extractOutputs } from "../stack.js";

// @req REQ-GCG-002: applyComplianceLabels, extractOutputs

describe("complianceLabels", () => {
  it("returns aegis-managed label", () => {
    const labels = complianceLabels("IL4");
    expect(labels["aegis-managed"]).toBe("true");
  });

  it("lowercases impact level", () => {
    expect(complianceLabels("IL4")["impact-level"]).toBe("il4");
    expect(complianceLabels("IL5")["impact-level"]).toBe("il5");
  });

  it("includes nist-800-171 compliance framework", () => {
    const labels = complianceLabels("IL4");
    expect(labels["compliance-framework"]).toBe("nist-800-171");
  });
});

describe("extractOutputs", () => {
  it("maps Pulumi output values to ResourceOutput", () => {
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
    expect(output.vertexEndpoint).toBe("us-central1-aiplatform.googleapis.com");
    expect(output.kmsKeyResourceName).toContain("keyRings");
    expect(output.vpcName).toBe("aegis-vpc-abc123");
    expect(output.auditBucket).toBe("aegis-audit-logs-xyz789");
    expect(output.perimeterConfigured).toBe(true);
  });

  it("handles missing outputs gracefully", () => {
    const output = extractOutputs({});
    expect(output.vertexEndpoint).toBe("");
    expect(output.kmsKeyResourceName).toBe("");
    expect(output.vpcName).toBe("");
    expect(output.auditBucket).toBe("");
    expect(output.perimeterConfigured).toBe(false);
  });
});
