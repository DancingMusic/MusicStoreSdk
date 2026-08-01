# MusicStore Connector Registry Tasks

- Last-Updated: `2026-07-12`

## Milestone A — Registry foundation

- [x] Replace the obsolete track/order marketplace model in OpenSpec with
  connector registry, submission, validation, and distribution ownership.
- [x] Define the connector manifest v1 TypeScript model and JSON Schema.
- [x] Implement structured validation and assertion helpers.
- [x] Implement a typed manifest registry with deterministic discovery.
- [x] Preserve the existing `MusicConnectorRegistry` public API.

## Milestone B — Curated distribution

- [x] Add manifests for the official independent connector repositories.
- [x] Generate `dist/registry/index.json` deterministically from source records.
- [x] Document connector submission and review requirements.
- [x] Add registry validation, generation, and compatibility tests.

## Milestone C — Automation and maintenance

- [x] Run typecheck, tests, registry validation, and build in CI.
- [x] Add automated artifact reachability and integrity verification.
- [x] Generate deterministic unsigned StoreService publish input in CI.
- [ ] Define a reviewed deprecation/removal policy and migration window.
- [ ] Move protocol compatibility exports to `MusicConnect` after host and all
  connectors have migrated; removal requires a separate major release.

## Milestone D — Account connector variants

- [x] Register the independent NetEase Cloud Music account connector without
  replacing the anonymous family member.
- [x] Register the independent QQ Music account connector without replacing the
  anonymous family member.
- [x] Verify both releases use host-managed official login flows and never send
  captured credentials to configurable catalog gateways.
