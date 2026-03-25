/**
 * Cached ADC token manager.
 * Shares a single GoogleAuth instance across all calls.
 * Refreshes token when <5 minutes from expiry.
 *
 * Implements: REQ-GCG-010
 */

let cachedToken: string | undefined;
let tokenExpiryMs: number = 0;

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

/** Get a cached ADC token, refreshing if expired or near expiry. */
export async function getAdcToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiryMs - REFRESH_BUFFER_MS) {
    return cachedToken;
  }

  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();

  if (!tokenResponse.token) {
    throw new Error("Failed to obtain ADC access token");
  }

  cachedToken = tokenResponse.token;
  // Default token lifetime is 3600s (1 hour). If we can't determine expiry, assume 1 hour.
  tokenExpiryMs = Date.now() + 3600 * 1000;

  return cachedToken;
}

/** Clear the cached token (useful for testing). */
export function clearTokenCache(): void {
  cachedToken = undefined;
  tokenExpiryMs = 0;
}
