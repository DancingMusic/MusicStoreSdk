# @dancingmusic/music-store

MusicStore is DancingMusic's public catalog for independently released music
connectors. It defines the submission manifest, validates registry changes,
provides typed discovery APIs, and builds a distributable connector index.

It does not contain connector implementation source. The connector contract is
owned by `MusicConnect`, and each platform implementation is built and tagged
in its own `MusicConnect-*` repository.

## Install

```bash
npm install github:DancingMusic/MusicStore
```

应用和发布构建必须把解析结果固定到 lockfile 中的完整提交哈希；上面的写法仅用于首次安装。

## Registry layout

```text
registry/
├── manifests/                         # reviewed source records
└── schema/connector-manifest.schema.json

dist/registry/
├── index.json                         # generated public connector index
└── connector-manifest.schema.json

profiles/official-defaults.json          # reviewed packaged-default policy
dist/official-defaults.json              # generated validated snapshot
```

The generated index is sorted by connector ID and uses pinned release artifact
URLs. Run the complete validation pipeline with:

```bash
npm ci
npm run check
```

`profiles/official-defaults.json` contains only exact IDs and versions already
reviewed in the Registry. `preinstalled` lets a Release package embed that
artifact as an offline seed; it never copies implementation source into the
host. Hosts keep the user's local follow-packaged-presets preference and must
ask before applying a `notify` update.

Useful focused commands:

```bash
npm run typecheck
npm test
npm run validate:registry
npm run build
```

## Discover manifests in code

```ts
import {
  ConnectorManifestRegistry,
  assertConnectorManifest,
} from "@dancingmusic/music-store";

const response = await fetch(
  "https://cdn.jsdelivr.net/npm/@dancingmusic/music-store/dist/registry/index.json",
);
const { connectors } = await response.json();

for (const connector of connectors) {
  assertConnectorManifest(connector);
}

const registry = new ConnectorManifestRegistry(connectors);
const playlistConnectors = registry.list({
  status: "active",
  capability: "playlist",
});
```

`ConnectorManifestRegistry` manages distribution records only. It is distinct
from the compatibility `MusicConnectorRegistry`, which manages live connector
instances inside a host process.

## Submit or update a connector

1. Implement the `MusicConnect` protocol in an independent repository.
2. Test and tag an immutable SemVer release.
3. Publish a browser-loadable ESM artifact for that exact tag.
4. Add one JSON file under `registry/manifests/`, following
   `registry/schema/connector-manifest.schema.json`.
5. Declare only capabilities and network/account permissions the release uses.
6. Run `npm run check` and include the generated-index result in review.

Reviewers verify repository ownership, license, protocol compatibility,
capabilities, permissions, the pinned artifact URL, and its SHA-256 integrity. Never submit cookies,
tokens, API secrets, signing material, or mutable `@main` distribution URLs.

## Manifest v1

```json
{
  "schemaVersion": 1,
  "id": "example-music",
  "familyId": "example-music",
  "variant": "anonymous",
  "authRequirement": "none",
  "platforms": ["web", "desktop"],
  "name": "Example Music",
  "description": "Example connector.",
  "publisher": { "name": "Example" },
  "repository": "https://github.com/example/MusicConnect-Example",
  "license": "MIT",
  "version": "1.0.0",
  "protocolVersion": ">=0.2.0",
  "capabilities": ["search", "stream"],
  "artifact": {
    "url": "https://cdn.jsdelivr.net/gh/example/MusicConnect-Example@v1.0.0/dist/index.js",
    "format": "esm",
    "integrity": "sha256-BASE64_SHA256_OF_DIST"
  },
  "permissions": {
    "networkOrigins": ["https://api.example.com"],
    "artworkOrigins": ["https://images.example.com"],
    "account": false
  },
  "discovery": { "recommendedRegions": ["global"], "priority": 80 },
  "status": "active",
  "submittedAt": "2026-07-12T00:00:00.000Z",
  "updatedAt": "2026-07-12T00:00:00.000Z"
}
```

See [`openspec/SDK_OPENSPEC.md`](openspec/SDK_OPENSPEC.md) for the normative
field and lifecycle requirements.

`artworkOrigins` contains exact HTTPS origins only. It lets a host normalize
the connector's returned cover URLs for Canvas/WebGL without expanding the
connector Worker's `networkOrigins` or introducing provider-specific host code.

## Runtime compatibility

The package continues to export the existing runtime connector surface used by
current hosts and connectors:

- `MusicConnector` and related track, login, lyrics, playlist, and remote
  favorite synchronization types;
- granular `favorites-read` and `favorites-write` capability declarations;
- provider-normalized track access badges, entitlement, and preview metadata;
- `MusicConnectorRegistry` with its existing registration and activation API;
- `MusicStoreClient` and the legacy track/order types.

These exports are retained for compatibility while protocol ownership is
migrated cleanly to `MusicConnect`; they are not the new Store domain model.

## GitHub Pages

The responsibility overview is published from `docs/` by
`.github/workflows/deploy-pages.yml` at:

https://dancingmusic.github.io/docs/connectors/

The same workflow builds and publishes the machine-readable central registry at:

https://dancingmusic.github.io/MusicStore/registry/index.json

## License

Apache-2.0
