/**
 * GCP-specific CspClient implementation.
 * Uses fetchWithRetry for resilient API calls and cached ADC tokens.
 *
 * Implements: REQ-GCG-010
 */

import type { CspClient, InfraConfig } from "@aegis/infra-sdk";
import { fetchWithRetry, TIMEOUTS } from "./fetch-retry.js";
import { getAdcToken } from "./token-cache.js";

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
      const resp = await fetchWithRetry(
        `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`,
        { headers: { Authorization: `Bearer ${token}` } },
        { timeoutMs: TIMEOUTS.api() },
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
      const resp = await fetchWithRetry(
        `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${api}`,
        { headers: { Authorization: `Bearer ${token}` } },
        { timeoutMs: TIMEOUTS.api() },
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
    const resp = await fetchWithRetry(
      `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${api}:enable`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
      { timeoutMs: TIMEOUTS.enable() },
    );
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Failed to enable ${api}: HTTP ${resp.status} ${body}`);
    }
  }

  async discoverAccessPolicyId(config: InfraConfig): Promise<string | undefined> {
    try {
      const token = await getAdcToken();
      const projectId = config.params["project_id"];

      const projResp = await fetchWithRetry(
        `https://cloudresourcemanager.googleapis.com/v3/projects/${projectId}`,
        { headers: { Authorization: `Bearer ${token}` } },
        { timeoutMs: TIMEOUTS.api() },
      );
      if (!projResp.ok) return undefined;

      const projData = (await projResp.json()) as { parent?: string };
      let orgId: string | undefined;

      if (projData.parent?.startsWith("organizations/")) {
        orgId = projData.parent;
      } else if (projData.parent?.startsWith("folders/")) {
        const ancestryResp = await fetchWithRetry(
          `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getAncestry`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          },
          { timeoutMs: TIMEOUTS.api() },
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

      const policiesResp = await fetchWithRetry(
        `https://accesscontextmanager.googleapis.com/v1/accessPolicies?parent=${orgId}`,
        { headers: { Authorization: `Bearer ${token}` } },
        { timeoutMs: TIMEOUTS.api() },
      );
      if (!policiesResp.ok) return undefined;

      const policies = (await policiesResp.json()) as {
        accessPolicies?: { name?: string }[];
      };

      if (policies.accessPolicies && policies.accessPolicies.length > 0) {
        const policyName = policies.accessPolicies[0].name;
        return policyName?.replace("accessPolicies/", "");
      }

      return undefined;
    } catch {
      return undefined;
    }
  }
}
