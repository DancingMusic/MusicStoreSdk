import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const REGISTRY_PATH = "dist/official-catalog.json";
const PROFILE_PATH = "profiles/official-catalog.json";
const PUBLISHED_REGISTRY_PATH = "official-catalog.json";
const OUTPUT_PATH = "dist/store-service-publish.json";
const MAX_ARTIFACT_BYTES = 5_000_000;
const root = new URL("../", import.meta.url);
const registryUrl = new URL(REGISTRY_PATH, root);
const profileUrl = new URL(PROFILE_PATH, root);
const outputUrl = new URL(OUTPUT_PATH, root);
const checkOnly = process.argv.includes("--check");

function sha256HexFromSri(integrity, id) {
  const match = /^sha256-([A-Za-z0-9+/]{43}=)$/.exec(integrity ?? "");
  if (!match) throw new Error(`${id}: active artifact must have an exact SHA-256 SRI`);
  const digest = Buffer.from(match[1], "base64");
  if (digest.byteLength !== 32) throw new Error(`${id}: invalid SHA-256 digest length`);
  return digest.toString("hex");
}

const registryBytes = await readFile(registryUrl);
const registry = JSON.parse(registryBytes.toString("utf8"));
if (!Array.isArray(registry.connectors)) throw new Error("generated registry has no connectors array");
const profile = JSON.parse(await readFile(profileUrl, "utf8"));
if (!Array.isArray(profile.entries)) throw new Error("official catalog profile has no entries array");
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const profileIds = new Set();
const publishedVersions = new Map();
for (const entry of profile.entries) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
      typeof entry.id !== "string" || typeof entry.version !== "string" ||
      (entry.state !== "publish" && entry.state !== "withdraw")) {
    throw new Error("official catalog profile has an invalid id, version, or state");
  }
  if (profileIds.has(entry.id)) throw new Error(`official catalog profile duplicates ${entry.id}`);
  profileIds.add(entry.id);
  if (entry.state === "publish") publishedVersions.set(entry.id, entry.version);
}
const registryVersions = new Map(registry.connectors.map(connector => [connector.id, connector.version]));
if (registryVersions.size !== publishedVersions.size ||
    [...publishedVersions].some(([id, version]) => registryVersions.get(id) !== version)) {
  throw new Error("generated official catalog does not match the publish profile; rebuild it first");
}

const artifacts = registry.connectors
  .map((connector) => ({
    id: connector.id,
    version: connector.version,
    url: connector.artifact.url,
    ...(connector.artifact.mirrors ? { mirrors: connector.artifact.mirrors } : {}),
    integrity: connector.artifact.integrity,
    sha256Hex: sha256HexFromSri(connector.artifact.integrity, connector.id),
    maxBytes: MAX_ARTIFACT_BYTES,
  }))
  .sort((left, right) => left.id.localeCompare(right.id));
const withdrawals = profile.entries
  .filter((entry) => entry?.state === "withdraw")
  .map((entry) => {
    if (typeof entry.id !== "string" || typeof entry.version !== "string" ||
        typeof entry.reason !== "string" || !entry.reason.trim() ||
        typeof entry.at !== "string" || !ISO_UTC_TIMESTAMP.test(entry.at) || Number.isNaN(Date.parse(entry.at))) {
      throw new Error("official catalog withdrawal has invalid id, version, reason, or at");
    }
    return { id: entry.id, version: entry.version, reason: entry.reason, at: entry.at };
  })
  .sort((left, right) => left.id.localeCompare(right.id));

const publishInput = {
  schemaVersion: 1,
  kind: "connectors",
  registryPath: PUBLISHED_REGISTRY_PATH,
  payloadSha256: createHash("sha256").update(registryBytes).digest("hex"),
  artifacts,
  withdrawals,
};
const output = `${JSON.stringify(publishInput, null, 2)}\n`;

if (checkOnly) {
  let existing = "";
  try { existing = await readFile(outputUrl, "utf8"); } catch { /* reported below */ }
  if (existing !== output) throw new Error(`${OUTPUT_PATH} is stale; run npm run store-service:generate`);
  console.log(`Validated StoreService publish input for ${artifacts.length} connectors and ${withdrawals.length} withdrawals`);
} else {
  await writeFile(outputUrl, output);
  console.log(`Generated StoreService publish input for ${artifacts.length} connectors and ${withdrawals.length} withdrawals at ${OUTPUT_PATH}`);
}
