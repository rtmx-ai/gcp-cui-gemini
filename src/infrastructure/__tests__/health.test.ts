import { describe, it, expect } from "vitest";
import { aggregateChecks, checkVpcScEnforced } from "../health.js";
import type { HealthCheck, ResourceOutput } from "../../domain/types.js";

// @req REQ-GCG-003: aggregateChecks
// @req REQ-GCG-007: checkVpcScPerimeter, checkVertexAiAccessible

describe("aggregateChecks", () => {
  it("returns success true when all pass", () => {
    const checks: HealthCheck[] = [
      { name: "a", status: "pass", detail: "ok" },
      { name: "b", status: "pass", detail: "ok" },
    ];
    const result = aggregateChecks(checks);
    expect(result.success).toBe(true);
    expect(result.summary).toContain("2 passed");
  });

  it("returns success true when some warn but none fail", () => {
    const checks: HealthCheck[] = [
      { name: "a", status: "pass", detail: "ok" },
      { name: "b", status: "warn", detail: "missing perms" },
    ];
    const result = aggregateChecks(checks);
    expect(result.success).toBe(true);
    expect(result.summary).toContain("1 warned");
  });

  it("returns success false when any fail", () => {
    const checks: HealthCheck[] = [
      { name: "a", status: "pass", detail: "ok" },
      { name: "b", status: "fail", detail: "key disabled" },
      { name: "c", status: "warn", detail: "missing perms" },
    ];
    const result = aggregateChecks(checks);
    expect(result.success).toBe(false);
    expect(result.summary).toContain("1 failed");
  });

  it("includes total count", () => {
    const checks: HealthCheck[] = [
      { name: "a", status: "pass", detail: "ok" },
      { name: "b", status: "pass", detail: "ok" },
      { name: "c", status: "pass", detail: "ok" },
      { name: "d", status: "pass", detail: "ok" },
    ];
    const result = aggregateChecks(checks);
    expect(result.summary).toContain("4 total");
  });

  it("handles empty checks array", () => {
    const result = aggregateChecks([]);
    expect(result.success).toBe(true);
    expect(result.summary).toContain("0 total");
  });

  it("handles all failures", () => {
    const checks: HealthCheck[] = [
      { name: "a", status: "fail", detail: "bad" },
      { name: "b", status: "fail", detail: "bad" },
    ];
    const result = aggregateChecks(checks);
    expect(result.success).toBe(false);
    expect(result.summary).toContain("2 failed");
  });
});

// @req REQ-GCG-007: VPC-SC perimeter validation

describe("checkVpcScEnforced", () => {
  const config = { projectId: "test", region: "us-central1", impactLevel: "IL4" as const };

  it("returns fail when perimeter is not configured", async () => {
    const outputs: ResourceOutput = {
      vertexEndpoint: "us-central1-aiplatform.googleapis.com",
      kmsKeyResourceName: "projects/test/locations/us-central1/keyRings/kr/cryptoKeys/ck",
      vpcName: "aegis-vpc-abc",
      auditBucket: "aegis-audit-logs-xyz",
      perimeterConfigured: false,
    };
    const result = await checkVpcScEnforced(config, outputs);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("not configured");
    expect(result.detail).toContain("accessPolicyId");
  });
});
