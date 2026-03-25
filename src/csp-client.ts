/**
 * GCP-specific CspClient implementation.
 * Thin wrapper over GCP REST APIs using Application Default Credentials.
 */

import type { CspClient, InfraConfig } from "@aegis/infra-sdk";

async function getAdcToken(): Promise<string> {
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Failed to obtain ADC access token");
  return token.token;
}

export class GcpClient implements CspClient {
  async validateCredentials(): Promise<boolean> {
    try {
      await getAdcToken();
      return true;
    } catch {
      return false;
    }
  }

  async checkAccess(config: InfraConfig): Promise<boolean> {
    try {
      const token = await getAdcToken();
      const projectId = config.params["project_id"];
      const resp = await fetch(
        `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        },
      );
      return resp.ok;
    } catch {
      return false;
    }
  }

  async getApiState(config: InfraConfig, api: string): Promise<"ENABLED" | "DISABLED"> {
    try {
      const token = await getAdcToken();
      const projectId = config.params["project_id"];
      const resp = await fetch(
        `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${api}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!resp.ok) return "DISABLED";
      const data = (await resp.json()) as { state?: string };
      return data.state === "ENABLED" ? "ENABLED" : "DISABLED";
    } catch {
      return "DISABLED";
    }
  }

  async enableApi(config: InfraConfig, api: string): Promise<void> {
    const token = await getAdcToken();
    const projectId = config.params["project_id"];
    const resp = await fetch(
      `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${api}:enable`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Failed to enable ${api}: HTTP ${resp.status} ${body}`);
    }
  }

  /**
   * Discover the organization's Access Context Manager access policy ID.
   * Most GCP orgs have exactly one access policy. Returns the policy number
   * or undefined if none found or insufficient permissions.
   *
   * Discovery path: project -> ancestor org -> access policies for that org.
   */
  async discoverAccessPolicyId(config: InfraConfig): Promise<string | undefined> {
    try {
      const token = await getAdcToken();
      const projectId = config.params["project_id"];

      // Step 1: Get the project's parent organization
      const projResp = await fetch(
        `https://cloudresourcemanager.googleapis.com/v3/projects/${projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!projResp.ok) return undefined;

      const projData = (await projResp.json()) as { parent?: string };
      // parent is either "organizations/123" or "folders/456"
      let orgId: string | undefined;

      if (projData.parent?.startsWith("organizations/")) {
        orgId = projData.parent;
      } else if (projData.parent?.startsWith("folders/")) {
        // Walk up the folder hierarchy to find the org
        const ancestryResp = await fetch(
          `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getAncestry`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!ancestryResp.ok) return undefined;
        const ancestry = (await ancestryResp.json()) as {
          ancestor?: { resourceId: { type: string; id: string } }[];
        };
        const org = ancestry.ancestor?.find((a) => a.resourceId.type === "organization");
        if (org) {
          orgId = `organizations/${org.resourceId.id}`;
        }
      }

      if (!orgId) return undefined;

      // Step 2: List access policies for the organization
      const policiesResp = await fetch(
        `https://accesscontextmanager.googleapis.com/v1/accessPolicies?parent=${orgId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!policiesResp.ok) return undefined;

      const policies = (await policiesResp.json()) as {
        accessPolicies?: { name?: string }[];
      };

      if (policies.accessPolicies && policies.accessPolicies.length > 0) {
        // Return the numeric ID from "accessPolicies/123456"
        const policyName = policies.accessPolicies[0].name;
        return policyName?.replace("accessPolicies/", "");
      }

      return undefined;
    } catch {
      return undefined;
    }
  }
}
