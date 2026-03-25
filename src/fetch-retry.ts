/**
 * Fetch wrapper with exponential backoff retry and configurable timeouts.
 * Used by all GCP API calls in the plugin.
 *
 * Implements: REQ-GCG-010
 */

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED",
]);

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

/** Read timeout from env var or use default. */
export function resolveTimeout(envVar: string, defaultMs: number): number {
  const envVal = process.env[envVar];
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return defaultMs;
}

/** Standard timeouts (configurable via env vars). */
export const TIMEOUTS = {
  api: (): number => resolveTimeout("AEGIS_API_TIMEOUT_MS", 10000),
  enable: (): number => resolveTimeout("AEGIS_ENABLE_TIMEOUT_MS", 30000),
  inference: (): number => resolveTimeout("AEGIS_INFERENCE_TIMEOUT_MS", 15000),
};

function backoffDelay(attempt: number): number {
  const exponential = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  const jitter = exponential * (0.75 + Math.random() * 0.5);
  return Math.floor(jitter);
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code && RETRYABLE_ERROR_CODES.has(code)) return true;
    if (err.message.includes("UNABLE_TO_VERIFY_LEAF_SIGNATURE")) return true;
    if (err.message.includes("CERT_HAS_EXPIRED")) return true;
  }
  return false;
}

function isTlsError(err: unknown): boolean {
  if (err instanceof Error) {
    return (
      err.message.includes("UNABLE_TO_VERIFY_LEAF_SIGNATURE") ||
      err.message.includes("CERT_HAS_EXPIRED") ||
      err.message.includes("ERR_TLS_CERT_ALTNAME_INVALID")
    );
  }
  return false;
}

export interface FetchRetryOptions {
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Fetch with retry on transient errors and configurable timeout.
 * Retries on 408, 429, 500, 502, 503, 504 and network errors.
 * Does NOT retry on 400, 401, 403, 404 (permanent errors).
 * Enhances TLS errors with actionable diagnostic.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts?: FetchRetryOptions,
): Promise<Response> {
  const maxRetries = opts?.maxRetries ?? MAX_RETRIES;
  const timeoutMs = opts?.timeoutMs ?? TIMEOUTS.api();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === maxRetries) {
        return response;
      }

      // Retryable status code -- wait and retry
      const delay = backoffDelay(attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (isTlsError(err)) {
        throw new Error(
          `TLS certificate verification failed for ${url}. ` +
            `If behind a corporate proxy, set NODE_EXTRA_CA_CERTS=/path/to/ca-bundle.pem. ` +
            `Original error: ${lastError.message}`,
        );
      }

      if (!isRetryableError(err) || attempt === maxRetries) {
        throw lastError;
      }

      const delay = backoffDelay(attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error("fetchWithRetry exhausted retries");
}
