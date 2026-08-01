import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const REGISTRY_PATH = "dist/official-catalog.json";
const PUBLISHED_REGISTRY_PATH = "official-catalog.json";
const OUTPUT_PATH = "dist/store-service-publish.json";
const MAX_ARTIFACT_BYTES = 5_000_000;
const root = new URL("../", import.meta.url);
const registryUrl = new URL(REGISTRY_PATH, root);
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

const publishInput = {
  schemaVersion: 1,
  kind: "connectors",
  registryPath: PUBLISHED_REGISTRY_PATH,
  payloadSha256: createHash("sha256").update(registryBytes).digest("hex"),
  artifacts,
};
const output = `${JSON.stringify(publishInput, null, 2)}\n`;

if (checkOnly) {
  let existing = "";
  try { existing = await readFile(outputUrl, "utf8"); } catch { /* reported below */ }
  if (existing !== output) throw new Error(`${OUTPUT_PATH} is stale; run npm run store-service:generate`);
  console.log(`Validated StoreService publish input for ${artifacts.length} connectors`);
} else {
  await writeFile(outputUrl, output);
  console.log(`Generated StoreService publish input for ${artifacts.length} connectors at ${OUTPUT_PATH}`);
}
