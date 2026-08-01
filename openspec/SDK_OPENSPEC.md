# OpenSpec: MusicStore Connector Registry

- Spec-ID: `music-store-registry-openspec`
- Version: `3.3.0`
- Status: `Active`
- Last-Updated: `2026-08-01`

## Scope

MusicStore is the public registry, submission, validation, discovery, and
distribution metadata layer for independently released `MusicConnect-*`
implementations.

MusicStore owns:

- the versioned connector manifest schema;
- validation rules for submitted manifests;
- the curated source registry under `registry/manifests/`;
- deterministic generation of `dist/registry/index.json`;
- schema-validated `profiles/official-catalog.json` and deterministic
  generation of the exact-version official catalog payload;
- a typed in-memory manifest registry for hosts and third-party tooling;
- submission guidance and CI checks for registry changes.

MusicStore does not own connector protocol types or concrete platform source.
The protocol belongs to `MusicConnect`; implementations remain in independent
`MusicConnect-*` repositories.

Long-form documentation is published by `DancingMusic/docs` at
`https://dancingmusic.github.io/docs/ecosystem/stores`. This repository keeps
the schema and registry source of truth; its legacy Pages root only redirects.

## Connector manifest v1

Each registry record MUST declare:

- `schemaVersion`: literal `1`;
- `id`: stable lower-case identifier;
- `name`, `description`, `publisher`, and SPDX-style `license` metadata;
- `repository`: canonical HTTPS source repository;
- `version`: immutable SemVer implementation version;
- `protocolVersion`: supported MusicConnect protocol SemVer range;
- `capabilities`: only capabilities implemented by that release;
- `artifact`: immutable HTTPS ESM entry URL and optional SHA-256 integrity;
- `artifact.mirrors`: optional pinned `global` and `china` mirrors. The existing
  `artifact.url` remains canonical for manifest-v1 consumers; every mirror MUST
  serve identical bytes covered by the single `artifact.integrity` value;
- optional `releaseNotesUrl` and `publishedAt`: the HTTPS release notes and the
  implementation release timestamp used by update UI. `updatedAt` remains the
  registry-record audit timestamp;
- `status`: `active`, `deprecated`, or `unlisted`;
- `submittedAt` and `updatedAt`: ISO-8601 timestamps.

Mirror URLs are subject to the same HTTPS, immutable-version, and no-floating-
branch rules as the canonical artifact URL. A manifest may declare at most one
mirror for each region.

Optional `homepage`, `permissions`, and `tags` fields support discovery and
host review. Unknown fields are rejected so typos cannot silently enter the
distribution index.

`permissions.artworkOrigins` is an optional list of unique exact HTTPS origins
(scheme, host, and optional port only). It authorizes a host-owned artwork
resolver to retrieve the exact `MusicTrack.coverUrl` or
`MusicPlaylist.coverUrl` returned by that implementation. It does not grant the
connector Worker network access and is therefore separate from
`networkOrigins`. Paths, queries, fragments, URL credentials, redirects to a
different origin, and non-HTTPS origins are not allowed. Adding an artwork
origin is a permission expansion that requires review.

Optional `discovery` metadata controls regional recommendation order without
changing availability. `recommendedRegions` may contain `mainland` and/or
`global`, while `priority` is a stable integer from 0 through 100. Hosts MUST
keep non-matching connectors discoverable and MUST NOT infer this value from UI
language or use it to activate, install, or authenticate a connector.

Anonymous and account implementations for the same music platform are separate
records with a shared `familyId` and distinct immutable `id` values. An account
record MUST declare `variant: account`, `authRequirement: required`, the
`login` capability and `permissions.account: true`. Publishing an account
record never replaces or upgrades the anonymous record in place; users may
install either variant and the host keeps their configuration and credential
namespaces isolated.

For mainland platforms without an official public API, an account connector
may coordinate an official browser/QR login through the MusicConnect login
contract, but it MUST NOT send captured cookies to a configurable catalog
gateway or include them in request URLs. Store review rejects an account
manifest whose implementation claims authenticated catalog capabilities without
a declared, trusted and bounded credential-processing path.

## Registry behavior

- Manifest IDs are unique.
- A manifest is validated before it can be added or replaced.
- Replacing a record MUST keep the same `id`.
- Discovery can filter by status, capability, publisher, and keyword.
- Generated entries are sorted by `id` for reproducible output.
- `dist/registry/index.json` includes the schema version, generation metadata,
  and the validated connector list. Generated output MUST NOT contain secrets.

## Submission and distribution

1. A connector is developed, tested, tagged, and distributed independently.
2. The author adds or updates one JSON manifest in `registry/manifests/`.
3. `npm run validate:registry` validates every source record.
4. `npm run build` builds the TypeScript package and regenerates the public
   distribution index.
5. Reviewers verify repository ownership, permissions, immutable artifact URL,
   declared capabilities, license, and protocol compatibility.
6. The protected release workflow imports every accepted artifact into the
   official StoreService content-addressed cache, verifies the published bytes,
   signs the deterministic catalog envelope, and publishes it to the official
   connector catalog endpoint.

Artwork review additionally verifies that each declared origin is used by the
implementation's returned cover URLs and that the implementation does not put
account credentials in those URLs. Production hosts trust this reviewed Store
metadata rather than connector runtime self-declarations.

Registry acceptance is metadata curation, not permission to copy implementation
source into MusicStore.

The Git registry remains the source of truth. Private immutable Git release or
package assets may be used as the cold artifact source, but their URL and access
credential MUST NOT appear in the public manifest. The public `artifact.url`
and mirrors point to immutable StoreService paths after successful import.

The released catalog is wrapped by StoreService with numeric `schemaVersion`,
`algorithm: ES256`, `keyId`, `payloadKind`, a monotonic `sequence`, `issuedAt`,
`expiresAt`, the validated registry `payload`, and a base64url IEEE-P1363
`signature` over canonical JSON of every preceding field. Signing
keys live in protected CI/KMS. MusicStore source, generated output and logs
MUST NOT contain signing keys or private Git credentials.

Registry presence does not imply official distribution. The official connector
source is an explicit exact-version allowlist in
`profiles/official-catalog.json`; StoreService signs only the generated
`dist/official-catalog.json`. Every profile entry declares an exact id/version
and a generic lifecycle `state`. `publish` requires an active manifest and
includes it in the generated payload. `withdraw` requires an audit reason and
timestamp, excludes the implementation from the public payload, and is emitted
to StoreService as private lifecycle-control metadata. The generated publish
input always includes a deterministic `withdrawals` array. An empty profile is
valid and publishes an empty official catalog while retaining manifests as
compatibility and review history.

## Compatibility

The existing public connector runtime API remains exported for current hosts
and connector implementations:

- `MusicConnector` and related connector/login/playlist types;
- optional track access badges, entitlement and preview metadata owned by
  `MusicConnect` and re-exported unchanged for compatible hosts;
- `MusicConnectorRegistry` with `register`, `unregister`, `activate`, `active`,
  `get`, `list`, and `dispose`;
- `MusicStoreClient` and legacy track/order types.

These compatibility exports are not the Store's new domain model and MUST NOT
be removed without a separate major-version migration through `MusicConnect`
and the host.

## MUST

- Build without a host checkout.
- Expose public TypeScript APIs only through `src/index.ts`.
- Validate source manifests in CI before publishing generated output.
- Use pinned version URLs for distributable connector artifacts.
- Keep generated output deterministic apart from explicit generation metadata.
- Preserve the existing connector registry public API during this migration.
- Re-export the canonical `MusicConnect` contract without narrowing optional
  provider-normalized access metadata.
- Preserve granular `favorites-read` and `favorites-write` capabilities so a
  host can independently discover remote favorite reads and idempotent writes.

## MUST NOT

- Contain concrete connector implementation source.
- redefine platform-specific credentials or login UI;
- store tokens, cookies, signing keys, or other credentials;
- treat mutable branch URLs as production distribution artifacts;
- absorb MusicConnect protocol ownership into this repository.

## Release

1. Update OpenSpec, README, source manifests, and tests.
2. Run `npm run check`.
3. Inspect `dist/registry/index.json`.
4. Version and publish the package and registry output together.
