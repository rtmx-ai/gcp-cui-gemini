#!/usr/bin/env node

import { createPluginCli } from "@aegis/infra-sdk";
import { GcpClient } from "./csp-client.js";
import { GcpPulumiEngine } from "./engine.js";
import { GcpHealthChecker } from "./health.js";

createPluginCli({
  name: "gcp-assured-workloads",
  version: "0.2.0",
  description: "IL4/IL5 Assured Workloads boundary in Google Cloud",
  credentials: ["gcp-adc"],
  inputs: [
    { name: "project_id", type: "string", required: true },
    { name: "region", type: "string", default: "us-central1" },
    { name: "impact_level", type: "enum", values: ["IL4", "IL5"], default: "IL4" },
    { name: "model", type: "string", default: "gemini-2.5-pro-001" },
  ],
  outputs: [
    "vertex_endpoint",
    "kms_key_resource_name",
    "vpc_name",
    "audit_bucket",
    "perimeter_configured",
  ],
  cspClient: new GcpClient(),
  engine: new GcpPulumiEngine(),
  healthChecker: new GcpHealthChecker(),
  requiredApis: [
    "compute.googleapis.com",
    "cloudkms.googleapis.com",
    "storage.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
  ],
});
