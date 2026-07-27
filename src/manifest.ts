import type { MusicConnectorCapability } from "./connector";
import type { MusicConnectorAuthRequirement, MusicConnectorHost, MusicConnectorVariant } from "./connector";

export const CONNECTOR_MANIFEST_SCHEMA_VERSION = 1 as const;

export type ConnectorManifestStatus = "active" | "deprecated" | "unlisted";

export interface ConnectorManifestPublisher {
  name: string;
  url?: string;
}

export interface ConnectorManifestArtifact {
  url: string;
  format: "esm";
  integrity?: `sha256-${string}`;
  mirrors?: ConnectorManifestArtifactMirror[];
}

export interface ConnectorManifestArtifactMirror {
  region: "global" | "china";
  url: string;
}

export interface ConnectorManifestPermissions {
  /** Network origins the connector implementation may contact at runtime. */
  networkOrigins?: string[];
  /** Exact HTTPS origins whose returned cover URLs the host may normalize. */
  artworkOrigins?: string[];
  /** Whether the connector asks the host to coordinate an account login flow. */
  account?: boolean;
}

export interface ConnectorManifestDiscovery {
  recommendedRegions?: ("mainland" | "global")[];
  priority?: number;
}

/** Store-reviewed distribution classification; connector code cannot choose it at runtime. */
export interface ConnectorManifestDistribution {
  channel: "official-authorized" | "developer-only";
  reviewedAt?: string;
}

export interface ConnectorManifest {
  schemaVersion: typeof CONNECTOR_MANIFEST_SCHEMA_VERSION;
  id: string;
  familyId: string;
  variant: MusicConnectorVariant;
  authRequirement: MusicConnectorAuthRequirement;
  platforms: MusicConnectorHost[];
  name: string;
  description: string;
  publisher: ConnectorManifestPublisher;
  repository: string;
  homepage?: string;
  license: string;
  version: string;
  protocolVersion: string;
  capabilities: MusicConnectorCapability[];
  artifact: ConnectorManifestArtifact;
  releaseNotesUrl?: string;
  publishedAt?: string;
  permissions?: ConnectorManifestPermissions;
  discovery?: ConnectorManifestDiscovery;
  distribution: ConnectorManifestDistribution;
  tags?: string[];
  status: ConnectorManifestStatus;
  submittedAt: string;
  updatedAt: string;
}

export type ConnectorManifestIssueCode =
  | "invalid_type"
  | "missing_field"
  | "unknown_field"
  | "invalid_value"
  | "duplicate_value";

export interface ConnectorManifestIssue {
  path: string;
  code: ConnectorManifestIssueCode;
  message: string;
}

export interface ConnectorManifestValidationResult {
  valid: boolean;
  issues: ConnectorManifestIssue[];
}

export class ConnectorManifestValidationError extends Error {
  readonly issues: ConnectorManifestIssue[];

  constructor(issues: ConnectorManifestIssue[]) {
    super(issues.map(issue => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "ConnectorManifestValidationError";
    this.issues = issues;
  }
}

const CAPABILITIES = new Set<MusicConnectorCapability>([
  "search",
  "stream",
  "lyrics",
  "playlist",
  "login",
  "user-library",
  "recommendations",
  "favorites-read",
  "favorites-write",
]);
const STATUSES = new Set<ConnectorManifestStatus>(["active", "deprecated", "unlisted"]);
const TOP_LEVEL_FIELDS = new Set([
  "schemaVersion", "id", "name", "description", "publisher", "repository",
  "homepage", "license", "version", "protocolVersion", "capabilities",
  "artifact", "releaseNotesUrl", "publishedAt", "permissions", "tags", "status", "submittedAt", "updatedAt",
  "familyId", "variant", "authRequirement", "platforms", "discovery", "distribution",
]);
const PUBLISHER_FIELDS = new Set(["name", "url"]);
const ARTIFACT_FIELDS = new Set(["url", "format", "integrity", "mirrors"]);
const MIRROR_FIELDS = new Set(["region", "url"]);
const PERMISSION_FIELDS = new Set(["networkOrigins", "artworkOrigins", "account"]);
const DISCOVERY_FIELDS = new Set(["recommendedRegions", "priority"]);
const DISTRIBUTION_FIELDS = new Set(["channel", "reviewedAt"]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SEMVER_RANGE_PATTERN = /^(?:[~^]|>=?|<=?)?\s*(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\s+-\s+(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*))?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isExactHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && url.origin === value
      && url.pathname === "/"
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

function artifactUrlPinsVersion(rawUrl: string, version: string): boolean {
  try {
    const url = new URL(rawUrl);
    const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:@|/)(?:v)?${escapedVersion}(?:/|$)`, "i").test(url.pathname)
      && !/(?:@|\/)(?:main|master|head)(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

function hasUnknownFields(
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  issues: ConnectorManifestIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push({ path: `${path}.${key}`, code: "unknown_field", message: "field is not allowed" });
    }
  }
}

function requireString(
  value: Record<string, unknown>,
  key: string,
  issues: ConnectorManifestIssue[],
  path = "$",
): string | undefined {
  const field = value[key];
  if (field === undefined) {
    issues.push({ path: `${path}.${key}`, code: "missing_field", message: "field is required" });
    return undefined;
  }
  if (typeof field !== "string" || field.trim() === "") {
    issues.push({ path: `${path}.${key}`, code: "invalid_type", message: "must be a non-empty string" });
    return undefined;
  }
  return field;
}

function validateOptionalHttpsUrl(value: unknown, path: string, issues: ConnectorManifestIssue[]): void {
  if (value !== undefined && (typeof value !== "string" || !isHttpsUrl(value))) {
    issues.push({ path, code: "invalid_value", message: "must be an HTTPS URL" });
  }
}

export function validateConnectorManifest(value: unknown): ConnectorManifestValidationResult {
  const issues: ConnectorManifestIssue[] = [];
  if (!isRecord(value)) {
    return { valid: false, issues: [{ path: "$", code: "invalid_type", message: "must be an object" }] };
  }

  hasUnknownFields(value, TOP_LEVEL_FIELDS, "$", issues);
  if (value.schemaVersion === undefined) {
    issues.push({ path: "$.schemaVersion", code: "missing_field", message: "field is required" });
  } else if (value.schemaVersion !== CONNECTOR_MANIFEST_SCHEMA_VERSION) {
    issues.push({ path: "$.schemaVersion", code: "invalid_value", message: "must equal 1" });
  }

  const id = requireString(value, "id", issues);
  if (id && !ID_PATTERN.test(id)) {
    issues.push({ path: "$.id", code: "invalid_value", message: "must be a lower-case kebab-case identifier" });
  }
  const familyId = requireString(value, "familyId", issues);
  if (familyId && !ID_PATTERN.test(familyId)) {
    issues.push({ path: "$.familyId", code: "invalid_value", message: "must be a lower-case kebab-case identifier" });
  }
  if (value.variant === undefined) issues.push({ path: "$.variant", code: "missing_field", message: "field is required" });
  else if (!["anonymous", "account", "hybrid"].includes(String(value.variant))) issues.push({ path: "$.variant", code: "invalid_value", message: "must equal anonymous, account, or hybrid" });
  if (value.authRequirement === undefined) issues.push({ path: "$.authRequirement", code: "missing_field", message: "field is required" });
  else if (!["none", "optional", "required"].includes(String(value.authRequirement))) issues.push({ path: "$.authRequirement", code: "invalid_value", message: "must equal none, optional, or required" });
  if (value.platforms === undefined) issues.push({ path: "$.platforms", code: "missing_field", message: "field is required" });
  else {
    if (!Array.isArray(value.platforms) || value.platforms.length === 0 || value.platforms.some(item => item !== "web" && item !== "desktop")) {
      issues.push({ path: "$.platforms", code: "invalid_value", message: "must contain web and/or desktop" });
    } else if (new Set(value.platforms).size !== value.platforms.length) {
      issues.push({ path: "$.platforms", code: "duplicate_value", message: "must not contain duplicate hosts" });
    }
  }
  requireString(value, "name", issues);
  requireString(value, "description", issues);
  requireString(value, "license", issues);

  const repository = requireString(value, "repository", issues);
  if (repository && !isHttpsUrl(repository)) {
    issues.push({ path: "$.repository", code: "invalid_value", message: "must be an HTTPS URL" });
  }
  validateOptionalHttpsUrl(value.homepage, "$.homepage", issues);
  validateOptionalHttpsUrl(value.releaseNotesUrl, "$.releaseNotesUrl", issues);

  const version = requireString(value, "version", issues);
  if (version && !SEMVER_PATTERN.test(version)) {
    issues.push({ path: "$.version", code: "invalid_value", message: "must be a SemVer version without a v prefix" });
  }
  const protocolVersion = requireString(value, "protocolVersion", issues);
  if (protocolVersion && !SEMVER_RANGE_PATTERN.test(protocolVersion)) {
    issues.push({ path: "$.protocolVersion", code: "invalid_value", message: "must be a supported simple SemVer range" });
  }

  if (!isRecord(value.publisher)) {
    issues.push({ path: "$.publisher", code: value.publisher === undefined ? "missing_field" : "invalid_type", message: "must be an object" });
  } else {
    hasUnknownFields(value.publisher, PUBLISHER_FIELDS, "$.publisher", issues);
    requireString(value.publisher, "name", issues, "$.publisher");
    validateOptionalHttpsUrl(value.publisher.url, "$.publisher.url", issues);
  }

  if (!Array.isArray(value.capabilities) || value.capabilities.length === 0) {
    issues.push({ path: "$.capabilities", code: value.capabilities === undefined ? "missing_field" : "invalid_type", message: "must be a non-empty array" });
  } else {
    const seen = new Set<string>();
    value.capabilities.forEach((capability, index) => {
      if (typeof capability !== "string" || !CAPABILITIES.has(capability as MusicConnectorCapability)) {
        issues.push({ path: `$.capabilities[${index}]`, code: "invalid_value", message: "is not a supported connector capability" });
      } else if (seen.has(capability)) {
        issues.push({ path: `$.capabilities[${index}]`, code: "duplicate_value", message: "capability is duplicated" });
      }
      if (typeof capability === "string") seen.add(capability);
    });
  }

  if (!isRecord(value.artifact)) {
    issues.push({ path: "$.artifact", code: value.artifact === undefined ? "missing_field" : "invalid_type", message: "must be an object" });
  } else {
    hasUnknownFields(value.artifact, ARTIFACT_FIELDS, "$.artifact", issues);
    const url = requireString(value.artifact, "url", issues, "$.artifact");
    if (url && !isHttpsUrl(url)) issues.push({ path: "$.artifact.url", code: "invalid_value", message: "must be an HTTPS URL" });
    if (url && version && !artifactUrlPinsVersion(url, version)) {
      issues.push({ path: "$.artifact.url", code: "invalid_value", message: "must identify the immutable manifest version" });
    }
    if (value.artifact.format !== "esm") issues.push({ path: "$.artifact.format", code: "invalid_value", message: "must equal esm" });
    if (value.artifact.integrity !== undefined && (typeof value.artifact.integrity !== "string" || !/^sha256-[A-Za-z0-9+/]{43}=$/.test(value.artifact.integrity))) {
      issues.push({ path: "$.artifact.integrity", code: "invalid_value", message: "must be an SRI sha256 value" });
    }
    if (value.artifact.mirrors !== undefined) {
      if (!Array.isArray(value.artifact.mirrors) || value.artifact.mirrors.length === 0 || value.artifact.mirrors.length > 2) {
        issues.push({ path: "$.artifact.mirrors", code: "invalid_type", message: "must contain one or two regional mirrors" });
      } else {
        const regions = new Set<string>();
        const urls = new Set<string>();
        value.artifact.mirrors.forEach((mirror, index) => {
          const path = `$.artifact.mirrors[${index}]`;
          if (!isRecord(mirror)) {
            issues.push({ path, code: "invalid_type", message: "must be an object" });
            return;
          }
          hasUnknownFields(mirror, MIRROR_FIELDS, path, issues);
          if (mirror.region !== "global" && mirror.region !== "china") {
            issues.push({ path: `${path}.region`, code: "invalid_value", message: "must equal global or china" });
          } else if (regions.has(mirror.region)) {
            issues.push({ path: `${path}.region`, code: "duplicate_value", message: "must not duplicate a region" });
          } else regions.add(mirror.region);
          if (typeof mirror.url !== "string" || !isHttpsUrl(mirror.url)) {
            issues.push({ path: `${path}.url`, code: "invalid_value", message: "must be an HTTPS URL" });
          } else {
            if (urls.has(mirror.url)) issues.push({ path: `${path}.url`, code: "duplicate_value", message: "must not duplicate an artifact URL" });
            urls.add(mirror.url);
            if (version && !artifactUrlPinsVersion(mirror.url, version)) {
              issues.push({ path: `${path}.url`, code: "invalid_value", message: "must identify the immutable manifest version" });
            }
          }
        });
      }
      if (value.artifact.integrity === undefined) {
        issues.push({ path: "$.artifact.integrity", code: "missing_field", message: "is required when mirrors are declared" });
      }
    }
  }

  if (value.permissions !== undefined) {
    if (!isRecord(value.permissions)) {
      issues.push({ path: "$.permissions", code: "invalid_type", message: "must be an object" });
    } else {
      hasUnknownFields(value.permissions, PERMISSION_FIELDS, "$.permissions", issues);
      if (value.permissions.account !== undefined && typeof value.permissions.account !== "boolean") {
        issues.push({ path: "$.permissions.account", code: "invalid_type", message: "must be a boolean" });
      }
      if (value.permissions.networkOrigins !== undefined) {
        if (!Array.isArray(value.permissions.networkOrigins)) {
          issues.push({ path: "$.permissions.networkOrigins", code: "invalid_type", message: "must be an array" });
        } else {
          value.permissions.networkOrigins.forEach((origin, index) => {
            if (typeof origin !== "string" || !isHttpsUrl(origin)) {
              issues.push({ path: `$.permissions.networkOrigins[${index}]`, code: "invalid_value", message: "must be an HTTPS origin" });
            }
          });
        }
      }
      if (value.permissions.artworkOrigins !== undefined) {
        if (!Array.isArray(value.permissions.artworkOrigins)) {
          issues.push({ path: "$.permissions.artworkOrigins", code: "invalid_type", message: "must be an array" });
        } else {
          const origins = new Set<string>();
          value.permissions.artworkOrigins.forEach((origin, index) => {
            const path = `$.permissions.artworkOrigins[${index}]`;
            if (typeof origin !== "string" || !isExactHttpsOrigin(origin)) {
              issues.push({ path, code: "invalid_value", message: "must be an exact HTTPS origin without credentials, path, query, or fragment" });
            } else if (origins.has(origin)) {
              issues.push({ path, code: "duplicate_value", message: "must not duplicate an artwork origin" });
            } else {
              origins.add(origin);
            }
          });
        }
      }
    }
  }

  if (value.discovery !== undefined) {
    if (!isRecord(value.discovery)) {
      issues.push({ path: "$.discovery", code: "invalid_type", message: "must be an object" });
    } else {
      hasUnknownFields(value.discovery, DISCOVERY_FIELDS, "$.discovery", issues);
      if (value.discovery.recommendedRegions !== undefined) {
        const regions = value.discovery.recommendedRegions;
        if (!Array.isArray(regions) || regions.length === 0 || regions.some(region => region !== "mainland" && region !== "global")) {
          issues.push({ path: "$.discovery.recommendedRegions", code: "invalid_value", message: "must contain mainland and/or global" });
        } else if (new Set(regions).size !== regions.length) {
          issues.push({ path: "$.discovery.recommendedRegions", code: "duplicate_value", message: "must not contain duplicate regions" });
        }
      }
      if (value.discovery.priority !== undefined && (typeof value.discovery.priority !== "number" || !Number.isInteger(value.discovery.priority) || value.discovery.priority < 0 || value.discovery.priority > 100)) {
        issues.push({ path: "$.discovery.priority", code: "invalid_value", message: "must be an integer from 0 through 100" });
      }
    }
  }

  if (!isRecord(value.distribution)) {
    issues.push({ path: "$.distribution", code: value.distribution === undefined ? "missing_field" : "invalid_type", message: "must be an object" });
  } else {
    hasUnknownFields(value.distribution, DISTRIBUTION_FIELDS, "$.distribution", issues);
    if (value.distribution.channel !== "official-authorized" && value.distribution.channel !== "developer-only") {
      issues.push({ path: "$.distribution.channel", code: value.distribution.channel === undefined ? "missing_field" : "invalid_value", message: "must equal official-authorized or developer-only" });
    }
    if (value.distribution.reviewedAt !== undefined && (typeof value.distribution.reviewedAt !== "string" || Number.isNaN(Date.parse(value.distribution.reviewedAt)) || !value.distribution.reviewedAt.includes("T"))) {
      issues.push({ path: "$.distribution.reviewedAt", code: "invalid_value", message: "must be an ISO-8601 timestamp" });
    }
    if (value.distribution.channel === "official-authorized" && value.status !== "active") {
      issues.push({ path: "$.distribution.channel", code: "invalid_value", message: "official-authorized records must be active" });
    }
    if (value.distribution.channel === "developer-only" && value.status === "active") {
      issues.push({ path: "$.distribution.channel", code: "invalid_value", message: "developer-only records must be unlisted or deprecated" });
    }
  }

  const capabilities = Array.isArray(value.capabilities) ? value.capabilities : [];
  const hasLogin = capabilities.includes("login");
  const accountPermission = isRecord(value.permissions) && value.permissions.account === true;
  if (value.variant === "anonymous" && (value.authRequirement !== "none" || hasLogin)) {
    issues.push({ path: "$.variant", code: "invalid_value", message: "anonymous variants require authRequirement none and no login capability" });
  }
  if (value.variant === "account" && (value.authRequirement !== "required" || !hasLogin || !accountPermission)) {
    issues.push({ path: "$.variant", code: "invalid_value", message: "account variants require login capability, required auth, and account permission" });
  }
  if ((value.authRequirement === "optional" || value.authRequirement === "required") && !hasLogin) {
    issues.push({ path: "$.authRequirement", code: "invalid_value", message: "optional or required auth needs the login capability" });
  }

  if (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.some(tag => typeof tag !== "string" || tag.trim() === ""))) {
    issues.push({ path: "$.tags", code: "invalid_type", message: "must be an array of non-empty strings" });
  }

  if (typeof value.status !== "string" || !STATUSES.has(value.status as ConnectorManifestStatus)) {
    issues.push({ path: "$.status", code: value.status === undefined ? "missing_field" : "invalid_value", message: "must be active, deprecated, or unlisted" });
  }
  if (value.status === "active" && (!isRecord(value.artifact) || typeof value.artifact.integrity !== "string")) {
    issues.push({ path: "$.artifact.integrity", code: "missing_field", message: "is required for active connectors" });
  }

  for (const field of ["submittedAt", "updatedAt"] as const) {
    const timestamp = requireString(value, field, issues);
    if (timestamp && (Number.isNaN(Date.parse(timestamp)) || !timestamp.includes("T"))) {
      issues.push({ path: `$.${field}`, code: "invalid_value", message: "must be an ISO-8601 timestamp" });
    }
  }
  if (value.publishedAt !== undefined && (typeof value.publishedAt !== "string" || Number.isNaN(Date.parse(value.publishedAt)) || !value.publishedAt.includes("T"))) {
    issues.push({ path: "$.publishedAt", code: "invalid_value", message: "must be an ISO-8601 timestamp" });
  }
  if (typeof value.submittedAt === "string" && typeof value.updatedAt === "string" && Date.parse(value.updatedAt) < Date.parse(value.submittedAt)) {
    issues.push({ path: "$.updatedAt", code: "invalid_value", message: "must not be earlier than submittedAt" });
  }

  return { valid: issues.length === 0, issues };
}

export function assertConnectorManifest(value: unknown): asserts value is ConnectorManifest {
  const result = validateConnectorManifest(value);
  if (!result.valid) throw new ConnectorManifestValidationError(result.issues);
}
