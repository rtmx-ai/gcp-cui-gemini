/**
 * Protocol event types conforming to aegis-infra/v1.
 * These are the JSON structures emitted on stdout.
 */

/** Resource operation in progress or completed. */
export interface ProgressEvent {
  readonly type: "progress";
  readonly resource: string;
  readonly name: string;
  readonly operation: "create" | "update" | "delete";
  readonly status: "in_progress" | "complete" | "failed";
}

/** Warning or informational message. */
export interface DiagnosticEvent {
  readonly type: "diagnostic";
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
}

/** Health check result (status subcommand only). */
export interface CheckEvent {
  readonly type: "check";
  readonly name: string;
  readonly status: "pass" | "fail" | "warn";
  readonly detail: string;
}

/** Final result with outputs or error. */
export interface ResultEvent {
  readonly type: "result";
  readonly success: boolean;
  readonly outputs?: Record<string, string>;
  readonly error?: string;
  readonly summary?: string;
}

/** Union of all protocol events. */
export type ProtocolEvent = ProgressEvent | DiagnosticEvent | CheckEvent | ResultEvent;
