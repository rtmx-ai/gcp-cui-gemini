# REQ-GCG-013: Plugin Documentation Infrastructure

## Overview

The plugin needs a `docs/` directory with Starlight-compatible MDX files that serve as the canonical source for rtmx.ai public documentation. Docs are versioned with the code and labeled as the reference implementation for the aegis plugin ecosystem.

## Specification

- `docs/` directory with 5 MDX pages: overview, installation, configuration, architecture, changelog
- `docs/.rtmx-docs.yaml` config file identifying the product and version
- Frontmatter schema: title (required), description (required)
- CHANGELOG.md and CONTRIBUTING.md at repo root
- package.json metadata: repository, homepage, keywords, bugs
- README "Reference Implementation" callout with link to PLUGIN_GUIDE.md

## Acceptance Criteria

- [AC1] docs/ directory exists with 5 valid MDX files
- [AC2] Each MDX file has title and description frontmatter
- [AC3] CHANGELOG.md covers v0.2.0 release history
- [AC4] CONTRIBUTING.md covers dev setup, testing tiers, release process
- [AC5] README identifies this as the reference implementation
- [AC6] package.json includes repository, homepage, keywords

## Traceability

- Parent: REQ-SDK-014 (Documentation SDK and Multi-Version Strategy)
- Deliverables: docs/, CHANGELOG.md, CONTRIBUTING.md
