# REQ-GCG-010: Resilient Network Operations

## Overview

Every network call in the plugin has zero retries, no exponential backoff, and no proxy/CA bundle support. A single transient 503 or network blip fails the entire operation. Corporate environments with HTTPS-intercepting firewalls fail on every GCP API call. These issues were identified in a testability audit on 2026-03-25.

## Specification

### Retry with Exponential Backoff

All fetch calls and GCP client library calls must retry on transient errors:
- Retryable status codes: 408, 429, 500, 502, 503, 504
- Retryable network errors: ECONNRESET, ETIMEDOUT, ENOTFOUND, EAI_AGAIN
- Backoff: exponential with jitter (base 1s, max 30s, 3 retries)
- Non-retryable: 400, 401, 403, 404 (real errors, not transient)

Implementation: a shared `fetchWithRetry()` wrapper used by all fetch calls in `csp-client.ts` and `health.ts`.

### ADC Token Caching with Expiry Check

Replace per-call `getAdcToken()` with a cached token manager:
- Cache the token and its expiry timestamp
- Refresh when token has <5 minutes remaining
- Share a single `GoogleAuth` instance across all calls
- If Pulumi provisioning runs >60 minutes, the engine's GCP provider handles its own token refresh (Pulumi manages this internally). Health checks use the cached token.

### Proxy and CA Bundle Support

- Respect `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` environment variables
- Support `NODE_EXTRA_CA_CERTS` for corporate CA bundles
- When a TLS certificate error occurs, emit a diagnostic with actionable detail: "TLS certificate verification failed. If behind a corporate proxy, set NODE_EXTRA_CA_CERTS=/path/to/ca-bundle.pem"
- Document proxy configuration in README

### Configurable Timeouts

- `AEGIS_API_TIMEOUT_MS` -- override default 10s for API calls
- `AEGIS_ENABLE_TIMEOUT_MS` -- override default 30s for API enablement
- `AEGIS_INFERENCE_TIMEOUT_MS` -- override default 15s for Vertex AI health check
- Fall back to hardcoded defaults when env vars are absent

## BDD Scenarios

### Scenario 1: Transient 503 is retried and succeeds
- Given an API that returns 503 on the first call and 200 on the second
- When any GCP API call is made
- Then the call succeeds after one retry
- And a diagnostic event mentions the retry

### Scenario 2: Non-retryable 403 is not retried
- Given an API that returns 403
- When a GCP API call is made
- Then the call fails immediately without retry

### Scenario 3: Token is cached across calls
- Given multiple sequential API calls within 5 minutes
- When getAdcToken is called each time
- Then only one actual token fetch occurs

### Scenario 4: Corporate proxy with custom CA succeeds
- Given NODE_EXTRA_CA_CERTS is set to a valid CA bundle
- When GCP API calls are made through a proxy
- Then TLS verification succeeds using the custom CA

### Scenario 5: Timeout is configurable via environment
- Given AEGIS_API_TIMEOUT_MS is set to 30000
- When a GCP API call is made
- Then the timeout is 30 seconds, not the default 10 seconds

## Acceptance Criteria

- [AC1] All fetch calls use retry with exponential backoff (3 retries, jitter)
- [AC2] ADC token is cached and refreshed before expiry
- [AC3] NODE_EXTRA_CA_CERTS is supported for corporate CA bundles
- [AC4] TLS errors produce actionable diagnostics
- [AC5] Timeouts are configurable via AEGIS_*_TIMEOUT_MS env vars
- [AC6] Retry and timeout behavior is unit-testable via dependency injection

## Traceability

- Tests: src/__tests__/fetch-retry.test.ts, src/__tests__/token-cache.test.ts
- Feature: tests/features/provisioning/resilience.feature
