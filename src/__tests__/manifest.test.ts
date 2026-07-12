import { describe, expect, it } from "vitest";
import {
  assertConnectorManifest,
  assertOfficialConnectorDefaultsProfile,
  buildOfficialConnectorDefaultsProfile,
  ConnectorManifestRegistry,
  ConnectorManifestValidationError,
  validateConnectorManifest,
  type ConnectorManifest,
} from "../index";

const VALID_SRI = `sha256-${"A".repeat(43)}=` as const;

function manifest(id = "example"): ConnectorManifest {
  return {
    schemaVersion: 1,
    id,
    familyId: id,
    variant: "anonymous",
    authRequirement: "none",
    platforms: ["web", "desktop"],
    name: "Example connector",
    description: "A connector used by the registry test suite.",
    publisher: { name: "Example publisher", url: "https://example.com" },
    repository: `https://github.com/example/${id}`,
    homepage: "https://example.com/connector",
    license: "MIT",
    version: "1.2.3",
    protocolVersion: ">=0.1.0",
    capabilities: ["search", "stream"],
    artifact: {
      url: `https://cdn.example.com/${id}@v1.2.3/index.js`,
      format: "esm",
      integrity: VALID_SRI,
    },
    permissions: {
      networkOrigins: ["https://api.example.com"],
      artworkOrigins: ["https://images.example.com"],
    },
    tags: ["example"],
    status: "active",
    submittedAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
  };
}

describe("connector manifest validation", () => {
  it("accepts a complete v1 manifest", () => {
    expect(validateConnectorManifest(manifest())).toEqual({ valid: true, issues: [] });
    expect(() => assertConnectorManifest(manifest())).not.toThrow();
  });

  it("accepts granular remote favorite capabilities", () => {
    const value = manifest();
    value.capabilities = ["search", "favorites-read", "favorites-write"];
    expect(validateConnectorManifest(value)).toEqual({ valid: true, issues: [] });
  });

  it("accepts exact artwork origins and rejects unsafe or duplicate values", () => {
    const value = manifest();
    value.permissions = {
      artworkOrigins: [
        "https://images.example.com",
        "https://images.example.com/path",
        "https://images.example.com?size=300",
        "https://user@images.example.com",
        "http://images.example.com",
        "https://images.example.com",
      ],
    };

    const issues = validateConnectorManifest(value).issues.filter(issue => issue.path.startsWith("$.permissions.artworkOrigins"));
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.permissions.artworkOrigins[1]", code: "invalid_value" }),
      expect.objectContaining({ path: "$.permissions.artworkOrigins[2]", code: "invalid_value" }),
      expect.objectContaining({ path: "$.permissions.artworkOrigins[3]", code: "invalid_value" }),
      expect.objectContaining({ path: "$.permissions.artworkOrigins[4]", code: "invalid_value" }),
      expect.objectContaining({ path: "$.permissions.artworkOrigins[5]", code: "duplicate_value" }),
    ]));
  });

  it("accepts bounded regional discovery metadata and rejects invalid values", () => {
    const value = manifest();
    value.discovery = { recommendedRegions: ["mainland", "global"], priority: 80 };
    expect(validateConnectorManifest(value)).toEqual({ valid: true, issues: [] });

    const invalid = { ...manifest(), discovery: { recommendedRegions: ["moon"], priority: 101 } };
    const paths = validateConnectorManifest(invalid).issues.map(issue => issue.path);
    expect(paths).toContain("$.discovery.recommendedRegions");
    expect(paths).toContain("$.discovery.priority");
  });

  it("accepts native mobile platforms", () => {
    const value = manifest();
    value.platforms = ["ios", "android"];

    expect(validateConnectorManifest(value)).toEqual({ valid: true, issues: [] });
  });

  it("rejects unknown platforms and duplicate hosts", () => {
    const unknown = { ...manifest(), platforms: ["web", "watchos"] };
    expect(validateConnectorManifest(unknown).issues).toContainEqual(expect.objectContaining({
      path: "$.platforms",
      code: "invalid_value",
    }));

    const duplicate = { ...manifest(), platforms: ["android", "android"] };
    expect(validateConnectorManifest(duplicate).issues).toContainEqual(expect.objectContaining({
      path: "$.platforms",
      code: "duplicate_value",
    }));
  });

  it("accepts pinned regional mirrors and release metadata", () => {
    const value = manifest();
    value.artifact.integrity = VALID_SRI;
    value.artifact.mirrors = [
      { region: "global", url: "https://global.example.com/example@v1.2.3/index.js" },
      { region: "china", url: "https://china.example.com/example@v1.2.3/index.js" },
    ];
    value.releaseNotesUrl = "https://example.com/releases/1.2.3";
    value.publishedAt = "2026-07-10T00:00:00.000Z";
    expect(validateConnectorManifest(value)).toEqual({ valid: true, issues: [] });
  });

  it("requires integrity and unique regions for mirrors", () => {
    const value = manifest();
    delete value.artifact.integrity;
    value.artifact.mirrors = [
      { region: "china", url: "https://one.example.com/example@v1.2.3/index.js" },
      { region: "china", url: "https://two.example.com/example@v1.2.3/index.js" },
    ];
    const paths = validateConnectorManifest(value).issues.map(issue => issue.path);
    expect(paths).toContain("$.artifact.integrity");
    expect(paths).toContain("$.artifact.mirrors[1].region");
  });

  it("rejects a floating mirror branch", () => {
    const value = manifest();
    value.artifact.integrity = VALID_SRI;
    value.artifact.mirrors = [{ region: "global", url: "https://cdn.example.com/example@main/index.js" }];
    expect(validateConnectorManifest(value).issues.some(issue => issue.path === "$.artifact.mirrors[0].url")).toBe(true);
  });

  it("requires integrity for every active connector", () => {
    const value = manifest();
    delete value.artifact.integrity;
    expect(validateConnectorManifest(value).issues).toContainEqual(expect.objectContaining({
      path: "$.artifact.integrity",
      code: "missing_field",
    }));
  });

  it("rejects truncated integrity and versions that only appear outside the path", () => {
    const truncated = manifest();
    truncated.artifact.integrity = "sha256-YWJj";
    expect(validateConnectorManifest(truncated).issues).toContainEqual(expect.objectContaining({
      path: "$.artifact.integrity",
    }));

    const versionInQuery = manifest();
    versionInQuery.artifact.url = "https://cdn.example.com/example/index.js?version=1.2.3";
    expect(validateConnectorManifest(versionInQuery).issues).toContainEqual(expect.objectContaining({
      path: "$.artifact.url",
    }));
  });

  it("reports all actionable validation issues", () => {
    const invalid = {
      ...manifest(),
      id: "Bad ID",
      repository: "http://example.com/repository",
      capabilities: ["search", "search", "teleport"],
      artifact: { url: "https://cdn.example.com/example@main/index.js", format: "esm" },
      extra: true,
    };
    const result = validateConnectorManifest(invalid);

    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.path)).toEqual(expect.arrayContaining([
      "$.id",
      "$.repository",
      "$.artifact.url",
      "$.capabilities[1]",
      "$.capabilities[2]",
      "$.extra",
    ]));
    expect(() => assertConnectorManifest(invalid)).toThrow(ConnectorManifestValidationError);
  });

  it("rejects contradictory anonymous and account variants", () => {
    const anonymous = { ...manifest(), capabilities: ["search", "login"], permissions: { account: true } };
    expect(validateConnectorManifest(anonymous).issues.some(issue => issue.path === "$.variant")).toBe(true);

    const account = { ...manifest(), variant: "account", authRequirement: "required" };
    expect(validateConnectorManifest(account).issues.some(issue => issue.path === "$.variant")).toBe(true);
  });
});

describe("ConnectorManifestRegistry", () => {
  it("sorts records and filters discovery fields", () => {
    const spotify: ConnectorManifest = { ...manifest("spotify"), publisher: { name: "DancingMusic" }, capabilities: ["search", "playlist"], tags: ["preview"] };
    const radio: ConnectorManifest = { ...manifest("radio"), publisher: { name: "Community" }, capabilities: ["search", "stream"], tags: ["live"] };
    const registry = new ConnectorManifestRegistry();
    registry.add(spotify);
    registry.add(radio);

    expect(registry.list().map(item => item.id)).toEqual(["radio", "spotify"]);
    expect(registry.list({ capability: "playlist" }).map(item => item.id)).toEqual(["spotify"]);
    expect(registry.list({ publisher: "Community" }).map(item => item.id)).toEqual(["radio"]);
    expect(registry.list({ keyword: "PREVIEW" }).map(item => item.id)).toEqual(["spotify"]);
  });

  it("rejects duplicate IDs and requires an existing record for replacement", () => {
    const registry = new ConnectorManifestRegistry([manifest()]);
    expect(() => registry.add(manifest())).toThrow("already registered");
    expect(() => registry.replace(manifest("missing"))).toThrow("not registered");
  });

  it("returns defensive copies", () => {
    const registry = new ConnectorManifestRegistry([manifest()]);
    const copy = registry.get("example");
    if (!copy) throw new Error("expected manifest");
    copy.name = "Mutated";
    expect(registry.get("example")?.name).toBe("Example connector");
  });
});

describe("official connector defaults profile", () => {
  const profile = () => ({
    schemaVersion: "1" as const,
    id: "official-defaults" as const,
    channel: "stable" as const,
    revision: "1.0.0",
    defaultConnectorId: "archive",
    connectors: [
      { id: "radio", version: "1.2.3", order: 10, installMode: "recommended" as const, updatePolicy: "notify" as const },
      { id: "archive", version: "1.2.3", order: 0, installMode: "preinstalled" as const, updatePolicy: "notify" as const },
    ],
    updatedAt: "2026-08-05T00:00:00.000Z",
  });

  it("cross-checks immutable active manifests and sorts by explicit order", () => {
    const manifests = [manifest("archive"), manifest("radio")];
    expect(() => assertOfficialConnectorDefaultsProfile(profile(), manifests)).not.toThrow();
    expect(buildOfficialConnectorDefaultsProfile(profile(), manifests).connectors.map(item => item.id)).toEqual(["archive", "radio"]);
  });

  it("rejects unreviewed, mismatched, duplicate, and silent-update entries", () => {
    const manifests = [manifest("archive")];
    const invalid = profile();
    invalid.connectors = [
      { id: "archive", version: "9.9.9", order: 0, installMode: "preinstalled", updatePolicy: "notify" },
      { id: "archive", version: "1.2.3", order: 0, installMode: "recommended", updatePolicy: "silent" as "notify" },
    ];
    expect(() => assertOfficialConnectorDefaultsProfile(invalid, manifests)).toThrow();
  });
});
