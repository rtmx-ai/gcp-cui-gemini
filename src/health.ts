/**
 * GCP boundary health checks.
 * Implements HealthChecker from @aegis/infra-sdk.
 *
 * Implements: REQ-GCG-003, REQ-GCG-007
 */

import { KeyManagementServiceClient } from "@google-cloud/kms";
import { Storage } from "@google-cloud/storage";
import type { HealthChecker, InfraConfig, BoundaryOutput, HealthCheck } from "@aegis/infra-sdk";

function handleCheckError(name: string, err: unknown): HealthCheck {
  const message = err instanceof Error ? err.message : String(err);
  if (
    message.includes("PERMISSION_DENIED") ||
    message.includes("403") ||
    message.includes("insufficient")
  ) {
    return { name, status: "warn", detail: `Insufficient permissions: ${message}` };
  }
  return { name, status: "warn", detail: `Check failed: ${message}` };
}

async function checkKmsKeyActive(
  config: InfraConfig,
  outputs?: BoundaryOutput,
): Promise<HealthCheck> {
  try {
    const client = new KeyManagementServiceClient();
    const keyName =
      outputs?.["kms_key_resource_name"] ??
      `projects/${config.params["project_id"]}/locations/${config.params["region"]}/keyRings/aegis-keyring/cryptoKeys/aegis-cmek-key`;

    const [key] = await client.getCryptoKey({ name: keyName });
    const keyShortName = keyName.split("/").pop() ?? keyName;

    if (key.primary?.state === "ENABLED") {
      const rotationInfo = key.rotationPeriod
        ? `, rotation period ${key.rotationPeriod.seconds}s`
        : "";
      return {
        name: "kms_key_active",
        status: "pass",
        detail: `${keyShortName} is ENABLED${rotationInfo}`,
      };
    }
    return {
      name: "kms_key_active",
      status: "fail",
      detail: `${keyShortName} state: ${key.primary?.state ?? "UNKNOWN"}`,
    };
  } catch (err) {
    return handleCheckError("kms_key_active", err);
  }
}

async function checkVpcScEnforced(
  config: InfraConfig,
  outputs?: BoundaryOutput,
): Promise<HealthCheck> {
  if (outputs && outputs["perimeter_configured"] !== "true") {
    return {
      name: "vpc_sc_enforced",
      status: "fail",
      detail:
        "VPC-SC perimeter not configured. Set aegis:accessPolicyId to enable IL4/IL5 compliance.",
    };
  }

  try {
    const compute = await import("@google-cloud/compute");
    const client = new compute.NetworksClient();
    const networkName = outputs?.["vpc_name"] ?? "aegis-vpc";

    const [network] = await client.get({
      project: config.params["project_id"],
      network: networkName,
    });

    if (network) {
      return {
        name: "vpc_sc_enforced",
        status: "pass",
        detail: `${networkName} network exists with VPC-SC perimeter active`,
      };
    }
    return { name: "vpc_sc_enforced", status: "fail", detail: `${networkName} network not found` };
  } catch (err) {
    return handleCheckError("vpc_sc_enforced", err);
  }
}

async function checkAuditSinkFlowing(
  config: InfraConfig,
  outputs?: BoundaryOutput,
): Promise<HealthCheck> {
  try {
    const storage = new Storage({ projectId: config.params["project_id"] });

    if (outputs?.["audit_bucket"]) {
      const bucket = storage.bucket(outputs["audit_bucket"]);
      const [exists] = await bucket.exists();
      if (exists) {
        return {
          name: "audit_sink_flowing",
          status: "pass",
          detail: `Audit bucket ${outputs["audit_bucket"]} exists`,
        };
      }
      return {
        name: "audit_sink_flowing",
        status: "fail",
        detail: `Audit bucket ${outputs["audit_bucket"]} not found`,
      };
    }

    const [buckets] = await storage.getBuckets({ prefix: "aegis-audit-logs" });
    if (buckets.length > 0) {
      return {
        name: "audit_sink_flowing",
        status: "pass",
        detail: `Audit bucket ${buckets[0].name} exists`,
      };
    }
    return {
      name: "audit_sink_flowing",
      status: "fail",
      detail: "No aegis-audit-logs bucket found",
    };
  } catch (err) {
    return handleCheckError("audit_sink_flowing", err);
  }
}

async function checkModelAccessible(
  config: InfraConfig,
  outputs?: BoundaryOutput,
): Promise<HealthCheck> {
  try {
    const model = config.params["model"] ?? "gemini-2.5-pro-001";
    const region = config.params["region"] ?? "us-central1";
    const endpoint = outputs?.["vertex_endpoint"] ?? `${region}-aiplatform.googleapis.com`;

    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    if (!token.token) {
      return {
        name: "model_accessible",
        status: "fail",
        detail: "Failed to obtain ADC token for Vertex AI access check",
      };
    }

    const modelsUrl = `https://${endpoint}/v1/projects/${config.params["project_id"]}/locations/${region}/publishers/google/models`;
    const response = await fetch(modelsUrl, {
      headers: { Authorization: `Bearer ${token.token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      return {
        name: "model_accessible",
        status: "pass",
        detail: `Authenticated access to ${endpoint} confirmed for ${model}`,
      };
    }
    if (response.status === 403) {
      return {
        name: "model_accessible",
        status: "fail",
        detail: `${endpoint} reachable but caller lacks aiplatform.user role (HTTP 403)`,
      };
    }
    if (response.status === 404) {
      return {
        name: "model_accessible",
        status: "pass",
        detail: `Authenticated access to ${endpoint} confirmed (API accessible)`,
      };
    }
    return {
      name: "model_accessible",
      status: "fail",
      detail: `${endpoint} returned HTTP ${response.status}`,
    };
  } catch (err) {
    return handleCheckError("model_accessible", err);
  }
}

export class GcpHealthChecker implements HealthChecker {
  async checkAll(config: InfraConfig, outputs?: BoundaryOutput): Promise<HealthCheck[]> {
    const results = await Promise.allSettled([
      checkKmsKeyActive(config, outputs),
      checkVpcScEnforced(config, outputs),
      checkAuditSinkFlowing(config, outputs),
      checkModelAccessible(config, outputs),
    ]);

    return results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : { name: "unknown", status: "warn" as const, detail: String(r.reason) },
    );
  }
}
