/**
 * Pulumi program definition for the IL4/IL5 Assured Workloads boundary.
 *
 * Resources:
 *   1. Cloud KMS KeyRing + CryptoKey (CMEK, 30-day rotation)
 *   2. CMEK IAM binding for GCS service agent
 *   3. VPC Network with Private Google Access
 *   4. Subnet in us-central1
 *   5. VPC Service Controls perimeter (optional, requires accessPolicyId)
 *   6. IAM Audit Config (DATA_READ, DATA_WRITE, ADMIN_READ)
 *   7. GCS Audit Bucket (versioning, CMEK, 365-day lifecycle)
 *
 * Implements: REQ-GCG-002, upstream REQ-AEG-007
 */

import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import type { InfraConfig, BoundaryOutput } from "@aegis/infra-sdk";

/** Compliance metadata labels applied to all resources per REQ-INFRA-017. */
export function complianceLabels(impactLevel: string): Record<string, string> {
  return {
    "aegis-managed": "true",
    "impact-level": impactLevel.toLowerCase(),
    "compliance-framework": "nist-800-171",
  };
}

/** Defines the Pulumi program for the Assured Workloads boundary. */
export function defineResources(
  config: InfraConfig,
): () => Promise<Record<string, pulumi.Output<string>>> {
  const projectId = config.params["project_id"];
  const region = config.params["region"] ?? "us-central1";
  const impactLevel = config.params["impact_level"] ?? "IL4";

  return async (): Promise<Record<string, pulumi.Output<string>>> => {
    const labels = complianceLabels(impactLevel);

    // 1. Cloud KMS KeyRing
    const keyRing = new gcp.kms.KeyRing("aegis-keyring", {
      location: region,
      project: projectId,
    });

    // 2. Cloud KMS CryptoKey with 30-day rotation
    const cryptoKey = new gcp.kms.CryptoKey("aegis-cmek-key", {
      keyRing: keyRing.id,
      rotationPeriod: "2592000s",
      labels,
    });

    // 3. VPC Network
    const network = new gcp.compute.Network("aegis-vpc", {
      project: projectId,
      autoCreateSubnetworks: false,
      description: "Aegis CUI boundary network",
    });

    // 4. Subnet with Private Google Access
    new gcp.compute.Subnetwork("aegis-subnet-us-central1", {
      project: projectId,
      network: network.id,
      ipCidrRange: "10.0.0.0/24",
      region,
      privateIpGoogleAccess: true,
      logConfig: {
        aggregationInterval: "INTERVAL_5_SEC",
        flowSampling: 1.0,
        metadata: "INCLUDE_ALL_METADATA",
      },
    });

    // 5. VPC Service Controls perimeter (optional)
    const pulumiConfig = new pulumi.Config("aegis");
    const accessPolicyId = pulumiConfig.get("accessPolicyId");
    const perimeterConfigured = !!accessPolicyId;

    if (accessPolicyId) {
      new gcp.accesscontextmanager.ServicePerimeter("aegis-perimeter", {
        parent: `accessPolicies/${accessPolicyId}`,
        name: `accessPolicies/${accessPolicyId}/servicePerimeters/aegis_boundary`,
        title: "Aegis CUI Boundary",
        perimeterType: "PERIMETER_TYPE_REGULAR",
        status: {
          restrictedServices: ["aiplatform.googleapis.com"],
          resources: [pulumi.interpolate`projects/${projectId}`],
        },
      });
    }

    // 6. CMEK IAM binding for GCS service agent
    const project = gcp.organizations.getProjectOutput({ projectId });
    const gcsServiceAgentEmail = pulumi.interpolate`service-${project.number}@gs-project-accounts.iam.gserviceaccount.com`;

    const cmekGcsBinding = new gcp.kms.CryptoKeyIAMMember("aegis-cmek-gcs-binding", {
      cryptoKeyId: cryptoKey.id,
      role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
      member: pulumi.interpolate`serviceAccount:${gcsServiceAgentEmail}`,
    });

    // 7. IAM Audit Config
    new gcp.projects.IAMAuditConfig("aegis-audit-config", {
      project: projectId,
      service: "allServices",
      auditLogConfigs: [
        { logType: "ADMIN_READ" },
        { logType: "DATA_READ" },
        { logType: "DATA_WRITE" },
      ],
    });

    // 8. GCS Audit Bucket (depends on CMEK IAM binding)
    const auditBucket = new gcp.storage.Bucket(
      "aegis-audit-logs",
      {
        project: projectId,
        location: region.toUpperCase(),
        uniformBucketLevelAccess: true,
        versioning: { enabled: true },
        labels,
        encryption: { defaultKmsKeyName: cryptoKey.id },
        lifecycleRules: [{ action: { type: "Delete" }, condition: { age: 365 } }],
      },
      { dependsOn: [cmekGcsBinding] },
    );

    return {
      vertex_endpoint: pulumi.output(`${region}-aiplatform.googleapis.com`),
      kms_key_resource_name: cryptoKey.id,
      vpc_name: network.name,
      audit_bucket: auditBucket.name,
      perimeter_configured: pulumi.output(perimeterConfigured ? "true" : "false"),
    };
  };
}

/** Map Pulumi stack outputs to BoundaryOutput. */
export function extractOutputs(
  outputs: Record<string, pulumi.automation.OutputValue>,
): BoundaryOutput {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(outputs)) {
    result[key] = String(val.value ?? "");
  }
  return result;
}
