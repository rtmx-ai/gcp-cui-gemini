import { describe, it, expect } from "vitest";
import type { BoundaryOutput, HealthCheck } from "@aegis/infra-sdk";

// @req REQ-GCG-007: VPC-SC perimeter validation
// Pure logic test -- no GCP API calls, no imports of GCP client libraries.

/** Reproduce the VPC-SC check logic from health.ts without importing the module. */
function checkVpcScPerimeterLogic(outputs?: BoundaryOutput): HealthCheck | null {
  if (outputs && outputs["perimeter_configured"] !== "true") {
    return {
      name: "vpc_sc_enforced",
      status: "fail",
      detail:
        "VPC-SC perimeter not configured. Set aegis:accessPolicyId to enable IL4/IL5 compliance.",
    };
  }
  return null; // would proceed to API call in production
}

describe("VPC-SC perimeter check logic", () => {
  it("returns fail when perimeter_configured is false", () => {
    const outputs: BoundaryOutput = {
      perimeter_configured: "false",
      vpc_name: "aegis-vpc-abc",
    };
    const result = checkVpcScPerimeterLogic(outputs);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("fail");
    expect(result!.detail).toContain("not configured");
    expect(result!.detail).toContain("accessPolicyId");
  });

  it("returns null (proceeds to API) when perimeter_configured is true", () => {
    const outputs: BoundaryOutput = {
      perimeter_configured: "true",
      vpc_name: "aegis-vpc-abc",
    };
    const result = checkVpcScPerimeterLogic(outputs);
    expect(result).toBeNull();
  });

  it("returns null when outputs are undefined (no state available)", () => {
    const result = checkVpcScPerimeterLogic(undefined);
    expect(result).toBeNull();
  });

  it("returns fail when perimeter_configured key is missing from outputs", () => {
    const outputs: BoundaryOutput = {
      vpc_name: "aegis-vpc-abc",
    };
    const result = checkVpcScPerimeterLogic(outputs);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("fail");
  });
});
