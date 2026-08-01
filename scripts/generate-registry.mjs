import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertConnectorManifest, ConnectorManifestRegistry } from "../dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(root, "registry/manifests");
const schemaSource = resolve(root, "registry/schema/connector-manifest.schema.json");
const officialCatalogSource = resolve(root, "profiles/official-catalog.json");
const outputDirectory = resolve(root, "dist/registry");
const outputPath = resolve(outputDirectory, "index.json");
const schemaOutput = resolve(outputDirectory, "connector-manifest.schema.json");
const officialCatalogOutput = resolve(root, "dist/official-catalog.json");
const checkOnly = process.argv.includes("--check");
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const files = (await readdir(sourceDirectory))
  .filter(file => file.endsWith(".json"))
  .sort((a, b) => a.localeCompare(b));
const registry = new ConnectorManifestRegistry();

for (const file of files) {
  const source = await readFile(resolve(sourceDirectory, file), "utf8");
  let manifest;
  try {
    manifest = JSON.parse(source);
    assertConnectorManifest(manifest);
    registry.add(manifest);
  } catch (error) {
    throw new Error(`Invalid connector manifest ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const connectors = registry.list();
const generatedAt = connectors.reduce(
  (latest, manifest) => manifest.updatedAt > latest ? manifest.updatedAt : latest,
  "1970-01-01T00:00:00.000Z",
);
const index = {
  schemaVersion: 1,
  generatedAt,
  connectorCount: connectors.length,
  connectors,
};

const officialProfile = JSON.parse(await readFile(officialCatalogSource, "utf8"));
const profileFields = new Set(["$schema", "schemaVersion", "id", "entries", "updatedAt"]);
if (!officialProfile || typeof officialProfile !== "object" || Array.isArray(officialProfile)) {
  throw new Error("profiles/official-catalog.json must be an object");
}
for (const field of Object.keys(officialProfile)) {
  if (!profileFields.has(field)) throw new Error(`profiles/official-catalog.json: unknown field ${field}`);
}
if (officialProfile.schemaVersion !== 1 || officialProfile.id !== "official-connectors" || !Array.isArray(officialProfile.entries)) {
  throw new Error("profiles/official-catalog.json has an invalid schemaVersion, id, or entries");
}
if (typeof officialProfile.updatedAt !== "string" ||
    !ISO_UTC_TIMESTAMP.test(officialProfile.updatedAt) ||
    Number.isNaN(Date.parse(officialProfile.updatedAt))) {
  throw new Error("profiles/official-catalog.json updatedAt must be an ISO-8601 timestamp");
}
const manifestsById = new Map(connectors.map(manifest => [manifest.id, manifest]));
const selectedIds = new Set();
const profileEntries = officialProfile.entries.map((entry, entryIndex) => {
  const allowedEntryFields = entry?.state === "withdraw"
    ? new Set(["id", "version", "state", "reason", "at"])
    : new Set(["id", "version", "state"]);
  if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
      Object.keys(entry).some(field => !allowedEntryFields.has(field)) ||
      typeof entry.id !== "string" || typeof entry.version !== "string" ||
      (entry.state !== "publish" && entry.state !== "withdraw")) {
    throw new Error(`profiles/official-catalog.json entries[${entryIndex}] has an invalid id, version, state, or field`);
  }
  if (entry.state === "withdraw" &&
      (typeof entry.reason !== "string" || !entry.reason.trim() || entry.reason.length > 500 ||
       typeof entry.at !== "string" || !ISO_UTC_TIMESTAMP.test(entry.at) || Number.isNaN(Date.parse(entry.at)))) {
    throw new Error(`profiles/official-catalog.json entries[${entryIndex}] withdrawal requires reason and at`);
  }
  if (selectedIds.has(entry.id)) throw new Error(`profiles/official-catalog.json duplicates ${entry.id}`);
  selectedIds.add(entry.id);
  const manifest = manifestsById.get(entry.id);
  if (!manifest) throw new Error(`official connector is not registered: ${entry.id}`);
  if (manifest.version !== entry.version) throw new Error(`official connector ${entry.id} expects ${entry.version}, registry has ${manifest.version}`);
  if (entry.state === "publish" && manifest.status !== "active") {
    throw new Error(`official connector is not active: ${entry.id}`);
  }
  return { entry, manifest };
});
const officialConnectors = profileEntries
  .filter(({ entry }) => entry.state === "publish")
  .map(({ manifest }) => manifest)
  .sort((left, right) => left.id.localeCompare(right.id));
const withdrawalCount = profileEntries.filter(({ entry }) => entry.state === "withdraw").length;
const officialCatalog = {
  schemaVersion: 1,
  generatedAt: officialProfile.updatedAt,
  connectorCount: officialConnectors.length,
  connectors: officialConnectors,
};

if (!checkOnly) {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`);
  await writeFile(schemaOutput, await readFile(schemaSource));
  await writeFile(officialCatalogOutput, `${JSON.stringify(officialCatalog, null, 2)}\n`);
}

console.log(`${checkOnly ? "Validated" : "Generated"} ${connectors.length} connector manifests, ${officialConnectors.length} published official connectors, and ${withdrawalCount} withdrawals${checkOnly ? "" : ` at ${outputPath}`}.`);
