/**
 * Manifest schema definition for the gcp-cui-gemini plugin.
 * Returns the static capability declaration for aegis-cli discovery.
 */

import type { Manifest } from "../domain/types.js";

// Read version from package.json at build time would be ideal,
// but for now we keep it in sync manually.
const PLUGIN_VERSION = "0.1.0";

export const CONTRACT_VERSION = "aegis-infra/v1";

export function buildManifest(): Manifest {
  return {
    name: "gcp-cui-gemini",
    version: PLUGIN_VERSION,
    contract: CONTRACT_VERSION,
    description: "IL4/IL5 Assured Workloads boundary with Vertex AI Gemini",
    requires: {
      credentials: ["gcp-adc"],
      inputs: [
        { name: "project_id", type: "string", required: true },
        { name: "region", type: "string", default: "us-central1" },
        {
          name: "impact_level",
          type: "enum",
          values: ["IL4", "IL5"],
          default: "IL4",
        },
      ],
    },
    provides: {
      outputs: [
        { name: "vertex_endpoint", type: "string" },
        { name: "kms_key_resource_name", type: "string" },
        { name: "vpc_name", type: "string" },
        { name: "audit_bucket", type: "string" },
      ],
    },
  };
}
