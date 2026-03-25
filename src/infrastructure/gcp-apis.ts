/**
 * Port interface for GCP Service Usage API operations.
 * Enables dependency injection for testing without live GCP calls.
 *
 * Implements: REQ-GCG-005 (AC9: all GCP API calls mockable)
 */

export interface GcpApiClient {
  /** Get the enablement state of a single API. */
  getApiState(projectId: string, api: string): Promise<"ENABLED" | "DISABLED">;

  /** Enable a single API. Returns once the enable request is accepted (not propagated). */
  enableApi(projectId: string, api: string): Promise<void>;

  /** Validate ADC credentials by fetching a token. Returns true if valid. */
  validateCredentials(): Promise<boolean>;

  /** Check if the caller can access the project. */
  checkProjectAccess(projectId: string): Promise<boolean>;
}

/** The set of APIs required for the Assured Workloads boundary. */
export const REQUIRED_APIS = [
  "compute.googleapis.com",
  "cloudkms.googleapis.com",
  "storage.googleapis.com",
  "iam.googleapis.com",
  "cloudresourcemanager.googleapis.com",
] as const;
