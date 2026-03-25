/**
 * Domain value objects for gcp-cui-gemini.
 * Zero I/O dependencies -- pure data types and validation.
 */

/** Impact level for the Assured Workloads boundary. */
export type ImpactLevel = "IL4" | "IL5";

/** Validated input configuration for provisioning. */
export interface ProjectConfig {
  readonly projectId: string;
  readonly region: string;
  readonly impactLevel: ImpactLevel;
}

/** Outputs from a successfully provisioned boundary. */
export interface ResourceOutput {
  readonly vertexEndpoint: string;
  readonly kmsKeyResourceName: string;
  readonly vpcName: string;
  readonly auditBucket: string;
  readonly perimeterConfigured: boolean;
}

/** Result of a single health check. */
export type CheckStatus = "pass" | "fail" | "warn";

export interface HealthCheck {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

/** Input schema declaration for the manifest. */
export interface InputField {
  readonly name: string;
  readonly type: "string" | "enum";
  readonly required?: boolean;
  readonly default?: string;
  readonly values?: readonly string[];
}

/** Output schema declaration for the manifest. */
export interface OutputField {
  readonly name: string;
  readonly type: "string";
}

/** Plugin manifest returned by the `manifest` subcommand. */
export interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly contract: string;
  readonly description: string;
  readonly requires: {
    readonly credentials: readonly string[];
    readonly inputs: readonly InputField[];
  };
  readonly provides: {
    readonly outputs: readonly OutputField[];
  };
}

/** The five subcommands supported by the plugin. */
export const SUBCOMMANDS = ["manifest", "preview", "up", "status", "destroy"] as const;
export type Subcommand = (typeof SUBCOMMANDS)[number];

/** Validate and parse a subcommand string. */
export function parseSubcommand(arg: string | undefined): Subcommand | null {
  if (!arg) return null;
  return (SUBCOMMANDS as readonly string[]).includes(arg) ? (arg as Subcommand) : null;
}

/** Validate and parse --input JSON into a ProjectConfig. */
export function parseInput(json: string): ProjectConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid JSON in --input");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("--input must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.project_id !== "string" || obj.project_id.length === 0) {
    throw new Error("project_id is required and must be a non-empty string");
  }

  const region = typeof obj.region === "string" ? obj.region : "us-central1";

  const impactLevel = typeof obj.impact_level === "string" ? obj.impact_level : "IL4";
  if (impactLevel !== "IL4" && impactLevel !== "IL5") {
    throw new Error("impact_level must be 'IL4' or 'IL5'");
  }

  return {
    projectId: obj.project_id,
    region,
    impactLevel,
  };
}
