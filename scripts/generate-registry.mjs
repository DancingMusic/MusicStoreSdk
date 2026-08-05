import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertConnectorManifest,
  assertOfficialConnectorDefaultsProfile,
  buildOfficialConnectorDefaultsProfile,
  ConnectorManifestRegistry,
} from "../dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(root, "registry/manifests");
const schemaSource = resolve(root, "registry/schema/connector-manifest.schema.json");
const outputDirectory = resolve(root, "dist/registry");
const outputPath = resolve(outputDirectory, "index.json");
const schemaOutput = resolve(outputDirectory, "connector-manifest.schema.json");
const defaultsInputPath = resolve(root, "profiles/official-defaults.json");
const defaultsOutputPath = resolve(root, "dist/official-defaults.json");
const checkOnly = process.argv.includes("--check");

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
const defaults = JSON.parse(await readFile(defaultsInputPath, "utf8"));
assertOfficialConnectorDefaultsProfile(defaults, connectors);
const officialDefaults = buildOfficialConnectorDefaultsProfile(defaults, connectors);
const defaultsOutput = `${JSON.stringify(officialDefaults, null, 2)}\n`;

if (!checkOnly) {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`);
  await writeFile(schemaOutput, await readFile(schemaSource));
  await writeFile(defaultsOutputPath, defaultsOutput);
} else {
  let existingDefaults = "";
  try { existingDefaults = await readFile(defaultsOutputPath, "utf8"); } catch { /* reported below */ }
  if (existingDefaults !== defaultsOutput) throw new Error("dist/official-defaults.json is stale; run npm run build");
}

console.log(`${checkOnly ? "Validated" : "Generated"} ${connectors.length} connector manifests${checkOnly ? "" : ` at ${outputPath}`}.`);
