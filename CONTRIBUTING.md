# Contributing to gcp-assured-workloads

Thank you for your interest in contributing. This document covers prerequisites, development setup, testing, and the release process.

## Prerequisites

- **Node.js >= 22** -- Pinned via `.nvmrc`. Use `nvm use` to activate the correct version.
- **nvm** -- Recommended for managing Node.js versions.
- **GCP Application Default Credentials** -- Required for integration tests. Run `gcloud auth application-default login`.
- **Pulumi CLI >= 3.181.0** -- Required for infrastructure provisioning. Install from [pulumi.com/docs/install](https://www.pulumi.com/docs/install/).

## Development Setup

1. Clone the repository:

```bash
git clone https://github.com/rtmx-ai/gcp-assured-workloads.git
cd gcp-assured-workloads
```

2. Install the SDK sibling (if developing against a local copy of @aegis-cli/infra-sdk):

```bash
# From the parent directory:
git clone https://github.com/rtmx-ai/aegis-infra-sdk.git
cd aegis-infra-sdk
nvm use && npm install && npm run build
```

3. Install dependencies and build:

```bash
nvm use
npm install
npm run build
```

4. Verify the build:

```bash
node dist/index.js manifest
```

## Running Tests

The project follows a three-tier testing pyramid.

### Tier 1: Unit Tests

Unit tests run without network access or GCP credentials. They test protocol serialization, domain types, manifest schema, and input validation using mocks.

```bash
npm run test:unit
```

### Tier 2: Integration Tests

Integration tests require GCP ADC credentials and test against live APIs in dry-run mode.

```bash
npm run test:integration
```

### Tier 3: E2E / BDD Tests

End-to-end tests use Cucumber feature files and execute the compiled binary as aegis-cli would -- piping JSON input and asserting JSON-line output.

```bash
npm run test:e2e
```

### Running a Single Test

```bash
npx vitest run src/__tests__/stack.test.ts
npx vitest run -t "manifest"
```

## Code Style

- **ESLint** and **Prettier** are configured for the project.
- A **husky** pre-commit hook runs format, lint, build, and unit tests on every commit.
- Run checks manually:

```bash
npm run format        # Prettier check
npm run format:fix    # Prettier fix
npm run lint          # ESLint
npm run lint:fix      # ESLint fix
```

## PR Process

1. Fork the repository.
2. Create a feature branch from `main`.
3. Write tests before implementation (TDD).
4. Ensure all checks pass: `npm run precommit`
5. Open a pull request against `main`.

All PRs must pass CI (lint, format, build, unit tests) before merge.

## Release Process

1. Update the version in `package.json` and `src/index.ts`.
2. Update `CHANGELOG.md` with the new version and changes.
3. Commit and tag: `git tag v<version>`
4. Push the tag: `git push origin v<version>`

Pushing a tag triggers the release workflow, which builds platform binaries (linux-x64, linux-arm64, darwin-x64, darwin-arm64) via `bun compile` and signs them with cosign keyless signing.

## Architecture

This plugin consumes `@aegis-cli/infra-sdk` which provides protocol handling, lifecycle management, and CLI dispatch. The plugin implements three port interfaces:

| File | Interface | Responsibility |
|------|-----------|----------------|
| `src/csp-client.ts` | `CspClient` | GCP credential validation, API enablement, VPC-SC auto-discovery |
| `src/engine.ts` | `IaCEngine` | Pulumi Automation API wrapper |
| `src/health.ts` | `HealthChecker` | 4 GCP boundary health checks |
| `src/stack.ts` | -- | Pulumi program definition (8 GCP resources) |
| `src/index.ts` | -- | Declarative entrypoint with `createPluginCli()` |

All protocol, state machine, and CLI code lives in the SDK. If you are writing event emission or argument parsing, it belongs in the SDK, not in this plugin.
