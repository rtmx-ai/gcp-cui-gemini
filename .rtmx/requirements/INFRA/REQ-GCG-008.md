# REQ-GCG-008: Pre-commit Hook Enforcement

## Overview

The package.json defines a `precommit` script (format, lint, build, test:unit) but it is not wired to a git hook. Developers can push code that fails lint, format, or type checks. For a project that will be vendored into a compliance-focused tool, the pre-commit gate must be enforced.

## Specification

- Install and configure a git hook runner (husky or lefthook) to execute the precommit script on every `git commit`
- The hook must run: format check, lint, build (type check), and unit tests
- The hook must block the commit if any step fails
- The hook must be installed automatically via `npm install` (prepare script)

## BDD Scenarios

### Scenario 1: Commit blocked on lint failure
- Given a staged file with a lint error
- When the developer runs git commit
- Then the commit is rejected
- And the output indicates a lint failure

### Scenario 2: Commit succeeds when all checks pass
- Given staged files that pass format, lint, build, and unit tests
- When the developer runs git commit
- Then the commit succeeds

## Acceptance Criteria

- [AC1] Pre-commit hook runs on every git commit
- [AC2] Hook executes format, lint, build, and unit tests
- [AC3] Hook is installed automatically via npm prepare script
- [AC4] Failing any step blocks the commit

## Traceability

- Tests: Manual verification
- Feature: N/A (developer workflow, not runtime behavior)
