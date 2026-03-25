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
}
