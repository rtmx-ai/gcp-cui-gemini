/**
 * Pulumi program definition for the IL4/IL5 Assured Workloads boundary.
 *
 * Resources:
 *   1. Cloud KMS KeyRing + CryptoKey (CMEK, 30-day rotation, delete protection)
 *   2. VPC Network with Private Google Access
 *   3. Subnet in us-central1
 *   4. VPC Service Controls perimeter around aiplatform.googleapis.com
 *   5. IAM Audit Config (DATA_READ, DATA_WRITE, ADMIN_READ)
 *   6. GCS Audit Bucket (versioning, CMEK, 365-day lifecycle)
 *
 * Implements: REQ-GCG-002, upstream REQ-AEG-007
 */

import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import type { ProjectConfig, ResourceOutput } from "../domain/types.js";

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
  config: ProjectConfig,
): () => Promise<Record<string, pulumi.Output<string>>> {
  return async (): Promise<Record<string, pulumi.Output<string>>> => {
    const labels = complianceLabels(config.impactLevel);

    // 1. Cloud KMS KeyRing
    const keyRing = new gcp.kms.KeyRing("aegis-keyring", {
      location: config.region,
      project: config.projectId,
    });

    // 2. Cloud KMS CryptoKey with 30-day rotation
    const cryptoKey = new gcp.kms.CryptoKey(
      "aegis-cmek-key",
      {
        keyRing: keyRing.id,
        rotationPeriod: "2592000s", // 30 days in seconds
        labels,
      },
      // Protection is enforced at the plugin contract level via --confirm-destroy.
      // Pulumi protect:true is not used because it blocks programmatic destroy.
    );

    // 3. VPC Network
    const network = new gcp.compute.Network("aegis-vpc", {
      project: config.projectId,
      autoCreateSubnetworks: false,
      description: "Aegis CUI boundary network",
    });

    // 4. Subnet with Private Google Access
    new gcp.compute.Subnetwork("aegis-subnet-us-central1", {
      project: config.projectId,
      network: network.id,
      ipCidrRange: "10.0.0.0/24",
      region: config.region,
      privateIpGoogleAccess: true,
      logConfig: {
        aggregationInterval: "INTERVAL_5_SEC",
        flowSampling: 1.0,
        metadata: "INCLUDE_ALL_METADATA",
      },
    });

    // 5. Access Policy for VPC Service Controls
    // NOTE: In production, you would reference an existing access policy.
    // For the PoC, we create the service perimeter assuming a policy exists.
    // The access policy ID must be provided as a Pulumi config value.
    const pulumiConfig = new pulumi.Config("aegis");
    const accessPolicyId = pulumiConfig.get("accessPolicyId");

    const perimeterConfigured = !!accessPolicyId;
    let perimeterName: pulumi.Output<string> = pulumi.output("not-configured");
    if (accessPolicyId) {
      const perimeter = new gcp.accesscontextmanager.ServicePerimeter("aegis-perimeter", {
        parent: `accessPolicies/${accessPolicyId}`,
        name: `accessPolicies/${accessPolicyId}/servicePerimeters/aegis_boundary`,
        title: "Aegis CUI Boundary",
        perimeterType: "PERIMETER_TYPE_REGULAR",
        status: {
          restrictedServices: ["aiplatform.googleapis.com"],
          resources: [pulumi.interpolate`projects/${config.projectId}`],
        },
      });
      perimeterName = perimeter.name;
    }

    // 6. Grant Cloud Storage service agent CMEK access.
    // GCS requires its service agent to have encrypter/decrypter on the CMEK key
    // before a CMEK-encrypted bucket can be created.
    // Look up the project number for the GCS service agent email.
    const project = gcp.organizations.getProjectOutput({ projectId: config.projectId });
    const gcsServiceAgentEmail = pulumi.interpolate`service-${project.number}@gs-project-accounts.iam.gserviceaccount.com`;

    const cmekGcsBinding = new gcp.kms.CryptoKeyIAMMember("aegis-cmek-gcs-binding", {
      cryptoKeyId: cryptoKey.id,
      role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
      member: pulumi.interpolate`serviceAccount:${gcsServiceAgentEmail}`,
    });

    // 7. IAM Audit Config
    new gcp.projects.IAMAuditConfig("aegis-audit-config", {
      project: config.projectId,
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
        project: config.projectId,
        location: config.region.toUpperCase(),
        uniformBucketLevelAccess: true,
        versioning: { enabled: true },
        labels,
        encryption: {
          defaultKmsKeyName: cryptoKey.id,
        },
        lifecycleRules: [
          {
            action: { type: "Delete" },
            condition: { age: 365 },
          },
        ],
      },
      { dependsOn: [cmekGcsBinding] },
    );

    // Stack outputs (routing metadata only, no secrets)
    return {
      vertex_endpoint: pulumi.output(`${config.region}-aiplatform.googleapis.com`),
      kms_key_resource_name: cryptoKey.id,
      vpc_name: network.name,
      audit_bucket: auditBucket.name,
      perimeter_name: perimeterName,
      perimeter_configured: pulumi.output(perimeterConfigured ? "true" : "false"),
    };
  };
}

/** Map Pulumi stack outputs to the domain ResourceOutput type. */
export function extractOutputs(
  outputs: Record<string, pulumi.automation.OutputValue>,
): ResourceOutput {
  return {
    vertexEndpoint: String(outputs["vertex_endpoint"]?.value ?? ""),
    kmsKeyResourceName: String(outputs["kms_key_resource_name"]?.value ?? ""),
    vpcName: String(outputs["vpc_name"]?.value ?? ""),
    auditBucket: String(outputs["audit_bucket"]?.value ?? ""),
    perimeterConfigured: String(outputs["perimeter_configured"]?.value ?? "false") === "true",
  };
}
