import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { canonicalEvidenceBundleSchema, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { regulatoryReviewToProductionChecklistModel, type V2RegulatoryReviewChecklistModel } from "@certscore/report-adapter";
import { reviewEvidenceBundle } from "@certscore/review-engine";

export type V2ScanLabProfile = "tiny" | "standard" | "policy" | "consent" | "full";

export type V2ScanLabStageKey =
  | "reportProjection"
  | "wc01Shadow"
  | "manualReviewerPacket"
  | "evidencePreviewPacket";

export type V2ScanLabLoadResult =
  | { status: "empty"; message: string }
  | { status: "error"; error: V2ScanLabError }
  | { status: "ready"; model: V2ScanLabModel };

export type V2ScanLabError = {
  code:
    | "invalid_url"
    | "artifact_read_failed"
    | "invalid_json"
    | "unsupported_artifact_version"
    | "production_eligible_true"
    | "customer_facing_eligible_true"
    | "top_finding_eligible_true"
    | "gap_eligible_true"
    | "forbidden_status_mapping_present"
    | "raw_blocked_fields_present"
    | "legal_conclusion_wording_present"
    | "unsafe_unbounded_evidence_text";
  message: string;
  artifactPath?: string;
};

export type V2ScanLabModel = {
  query: {
    input: string;
    normalizedUrl: string;
    hostname: string;
    domain: string;
    profile: V2ScanLabProfile;
  };
  chains: V2ScanLabArtifactChain[];
  selectedChain: V2ScanLabArtifactChain;
  summary: V2ScanLabSummary;
  reviewSummary: V2ScanLabReviewSummary;
  candidateSignals: V2ScanLabCandidateSignal[];
  familySummaries: V2ScanLabFamilySummary[];
  sections: V2ScanLabSection[];
  vendorPurposeSummary: V2ScanLabVendorPurposeSummary[];
  coverageLimitations: string[];
  evidenceGroups: V2ScanLabEvidenceGroup[];
  noGoSummary: V2ScanLabNoGoSummary;
  runtimeSnapshot: V2ScanLabRuntimeSnapshot;
  visualSnapshot: V2ScanLabVisualSnapshot;
  timing: V2ScanLabTimingSummary;
  regulatoryReviewChecklist: V2RegulatoryReviewChecklistModel;
  diagnostics: string[];
};

export type V2ScanLabReviewSummary = {
  headline: string;
  posture: "artifact_ready" | "needs_review" | "limited_artifacts" | "blocked";
  supportingText: string;
  highlightRows: Array<{
    label: string;
    value: string;
    tone: "neutral" | "success" | "warning";
  }>;
};

export type V2ScanLabNoGoSummary = {
  status: "observed" | "not_observed";
  coverageLabel: string;
  message: string;
  previewFindingTitle: string;
  reason: string | null;
  reasons: string[];
  title: string;
};

export type V2ScanLabArtifactChain = {
  chainKey: string;
  cohort: string;
  domain: string;
  sourceUrl: string | null;
  artifactRoots: string[];
  artifacts: Record<V2ScanLabStageKey, string | null>;
  stages: Record<V2ScanLabStageKey, boolean>;
  profileMatch: boolean;
};

export type V2ScanLabSummary = {
  queueItemCount: number;
  representativeGroupCount: number;
  resolvedExcerptCount: number;
  resolvedSourceRefCount: number;
  unresolvedRefCount: number;
  warningCount: number;
  sensitiveContextItemCount: number;
  guardrailFlags: Record<string, boolean>;
};

export type V2ScanLabFamilySummary = {
  family: string;
  queueItemCount: number;
  representativeGroupCount: number;
  resolvedExcerptCount: number;
  unresolvedRefCount: number;
  vendorLabels: string[];
  supportingPurposes: string[];
  diagnosticPurposes: string[];
};

export type V2ScanLabCandidateSignal = {
  id: string;
  sourceFindingKey: string;
  sourceRowId: string;
  family: string;
  lane: string;
  simulatedPolicyOutcome: string;
  confidence: string;
  directness: string;
  vendorLabels: string[];
  supportingPurposes: string[];
  diagnosticPurposes: string[];
  sensitiveContextCategories: string[];
  coverageLimitations: string[];
  caveats: string[];
  resolvedExcerptCount: number;
  resolvedSourceRefCount: number;
  unresolvedRefCount: number;
  warningCount: number;
  evidenceGroupCount: number;
  topDisplaySafeExcerpts: string[];
};

export type V2ScanLabSection = {
  key: string;
  title: string;
  items: V2ScanLabFamilySummary[];
};

export type V2ScanLabVendorPurposeSummary = {
  label: string;
  purposes: string[];
  count: number;
};

export type V2ScanLabEvidenceGroup = {
  groupId: string;
  groupLabel: string;
  candidateFamily: string;
  evidenceKind: string;
  vendorLabels: string[];
  supportingPurposes: string[];
  diagnosticPurposes: string[];
  confidence: string;
  directness: string;
  topDisplaySafeExcerpts: string[];
  sourceRefsCount: number;
  unresolvedRefsCount: number;
  warningCount: number;
};

export type V2ScanLabRuntimeSnapshot = {
  consentPlatform: {
    status: "observed" | "unavailable";
    label: string;
    detail: string;
    signals: string[];
  };
  metrics: {
    thirdPartyRequests: V2ScanLabRuntimeMetric;
    cookiesBeforeConsent: V2ScanLabRuntimeMetric;
  };
  trackerFootprint: {
    status: "observed" | "unavailable";
    vendorCount: number;
    domainCount: number;
    totalCount: number;
    vendorLabels: string[];
    domainLabels: string[];
  };
  policySurfaces: {
    status: "observed" | "unavailable";
    observedCount: number;
    surfaces: V2ScanLabPolicySurfaceSummary[];
  };
};

export type V2ScanLabRuntimeMetric = {
  status: "observed" | "unavailable";
  value: number | null;
  detail: string;
};

export type V2ScanLabPolicySurfaceSummary = {
  surfaceType: string;
  label: string;
  url: string | null;
  status: string;
  detail: string;
};

export type V2ScanLabVisualSnapshot = {
  status: "observed" | "unavailable";
  href: string | null;
  label: string;
  path: string | null;
};

export type V2ScanLabTimingSummary = {
  status: "observed" | "unavailable";
  totalDurationMs: number | null;
  rows: Array<{
    key: string;
    label: string;
    durationMs: number | null;
    deltaFromTotalMs: number | null;
    detail: string;
    percentOfTotal: number | null;
  }>;
};

type LoadOptions = {
  artifactsDir?: string;
  workspaceRoot?: string;
};

type NonStageArtifactKind = "canonicalEvidenceBundle" | "scanLabTiming";
type ArtifactKind = V2ScanLabStageKey | NonStageArtifactKind;

type ArtifactDefinition = {
  rootPrefix: string;
  fileName: string;
  kind: ArtifactKind;
  versionField: string;
  supportedVersion: string;
};

type ArtifactMatch = {
  kind: ArtifactKind;
  rootName: string;
  rootPath: string;
  domainFolder: string;
  filePath: string;
  raw: string;
  parsed: Record<string, unknown>;
  canonicalEvidenceBundle?: CanonicalEvidenceBundle;
  sourceUrl: string | null;
};

type QueueItemModel = {
  id: string;
  sourceFindingKey: string;
  sourceRowId: string;
  lane: string;
  simulatedPolicyOutcome: string;
  confidence: string;
  directness: string;
  candidateFamily: string;
  vendorLabels: string[];
  supportingPurposes: string[];
  diagnosticPurposes: string[];
  sensitiveContextCategories: string[];
  resolvedExcerptCount: number;
  resolvedSourceRefCount: number;
  unresolvedRefCount: number;
  warningCount: number;
  representativeGroups: V2ScanLabEvidenceGroup[];
  coverageLimitations: string[];
  caveats: string[];
  topDisplaySafeExcerpts: string[];
};

const ARTIFACT_DEFINITIONS: ArtifactDefinition[] = [
  {
    rootPrefix: "v2-wc01-evidence-preview-",
    fileName: "Wc01V2EvidencePreviewPacket.json",
    kind: "evidencePreviewPacket",
    versionField: "packetVersion",
    supportedVersion: "wc01.v2_evidence_preview_packet.1",
  },
  {
    rootPrefix: "v2-wc01-reviewer-packets-",
    fileName: "Wc01V2ManualReviewerPacket.json",
    kind: "manualReviewerPacket",
    versionField: "packetVersion",
    supportedVersion: "wc01.v2_manual_reviewer_packet.1",
  },
  {
    rootPrefix: "v2-wc01-shadow-",
    fileName: "Wc01V2ShadowProjection.json",
    kind: "wc01Shadow",
    versionField: "contractVersion",
    supportedVersion: "wc01.v2_shadow_projection.1",
  },
  {
    rootPrefix: "v2-shadow-projection-",
    fileName: "V2ReportProjectionDraft.json",
    kind: "reportProjection",
    versionField: "projectionVersion",
    supportedVersion: "certscore.v2.report_projection_draft.1",
  },
  {
    rootPrefix: "v2-calibration-",
    fileName: "CanonicalEvidenceBundle.json",
    kind: "canonicalEvidenceBundle",
    versionField: "sourceBundleSchemaVersion",
    supportedVersion: "certscore.v2.alpha.1",
  },
  {
    rootPrefix: "v2-calibration-",
    fileName: "V2ScanLabTiming.json",
    kind: "scanLabTiming",
    versionField: "timingVersion",
    supportedVersion: "wc01.v2_scan_lab_timing.1",
  },
];

const STAGE_KEYS: V2ScanLabStageKey[] = [
  "reportProjection",
  "wc01Shadow",
  "manualReviewerPacket",
  "evidencePreviewPacket",
];

const RAW_BLOCKED_FIELD_NAMES = [
  `request${"Body"}`,
  `response${"Body"}`,
  `setCookie${"Headers"}`,
  `cookie${"Value"}`,
  `raw${"Cookie"}`,
  `raw${"Request"}`,
  `raw${"Response"}`,
  `rawNano${"Reasoning"}`,
  `fullDom${"Text"}`,
  `fullPolicy${"Text"}`,
  `sensitiveQuery${"Value"}`,
] as const;

const RAW_BLOCKED_FIELD_PATTERN = new RegExp(
  String.raw`\b(${RAW_BLOCKED_FIELD_NAMES.join("|")})\b`,
  "i",
);

const LEGAL_CONCLUSION_PHRASES = [
  `legal ${"violation"}`,
  String.raw`violates? (?:the )?law`,
  `un${"lawful"}`,
  `il${"legal"}`,
  String.raw`non[- ]compliant`,
  `not ${"compliant"}`,
] as const;

const LEGAL_CONCLUSION_WORDING_PATTERN = new RegExp(
  String.raw`\b(${LEGAL_CONCLUSION_PHRASES.join("|")})\b`,
  "i",
);

const MAX_DISPLAY_SAFE_TEXT_LENGTH = 500;

export async function loadV2ScanLabArtifacts(input: {
  chainKey?: string | null;
  url?: string | null;
  profile?: string | null;
  options?: LoadOptions;
}): Promise<V2ScanLabLoadResult> {
  if (!input.url?.trim()) {
    return {
      status: "empty",
      message: "No saved v2 artifacts found for this URL. Run a v2 calibration or scan first.",
    };
  }

  const normalized = normalizeUrlInput(input.url);
  if (!normalized) {
    return {
      status: "error",
      error: {
        code: "invalid_url",
        message: "Enter a URL or domain that can be normalized.",
      },
    };
  }

  try {
    const artifactsDir = input.options?.artifactsDir ?? path.join(findWorkspaceRoot(input.options?.workspaceRoot ?? process.cwd()), "artifacts");
    const requestedChainKey = input.chainKey?.trim() || null;
    const preferredChainKey = requestedChainKey ?? await findNewestDomainChainKey({
      artifactsDir,
      domain: normalized.domain,
    });
    const matches = await discoverArtifactMatches({
      artifactsDir,
      preferredChainKey,
      target: normalized,
    });
    if (matches.length === 0) {
      return {
        status: "empty",
        message: "No saved v2 artifacts found for this URL. Run a v2 calibration or scan first.",
      };
    }

    const profile = parseProfile(input.profile);
    const chains = buildArtifactChains(matches, profile);
    const selectedChain = selectArtifactChain(chains, profile, input.chainKey);
    const model = await buildModel({
      chains,
      matches,
      normalized,
      profile,
      selectedChain,
    });

    return { status: "ready", model };
  } catch (error) {
    if (isV2ScanLabError(error)) {
      return { status: "error", error };
    }
    return {
      status: "error",
      error: {
        code: "artifact_read_failed",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function findNewestDomainChainKey(input: {
  artifactsDir: string;
  domain: string;
}) {
  if (!existsSync(input.artifactsDir)) {
    return null;
  }
  const rootEntries = await readdir(input.artifactsDir, { withFileTypes: true });
  const candidates: Array<{ chainKey: string; mtimeMs: number; score: number }> = [];
  for (const rootEntry of rootEntries) {
    if (!rootEntry.isDirectory()) {
      continue;
    }
    const definition = ARTIFACT_DEFINITIONS.find((candidate) =>
      rootEntry.name.startsWith(candidate.rootPrefix)
    );
    if (!definition) {
      continue;
    }
    const domainFolder = input.domain;
    const filePath = path.join(input.artifactsDir, rootEntry.name, domainFolder, definition.fileName);
    if (!await fileExists(filePath)) {
      continue;
    }
    const fileStats = await stat(filePath);
    candidates.push({
      chainKey: `${deriveCohort(rootEntry.name)}:${domainFolder}`,
      mtimeMs: fileStats.mtimeMs,
      score: artifactKindScore(definition.kind),
    });
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || right.score - left.score);
  return candidates[0]?.chainKey ?? null;
}

export function normalizeUrlInput(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return null;
  }
  if (!parsed.hostname) {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const normalizedUrl = `https://${hostname}${parsed.pathname === "/" ? "/" : parsed.pathname}`;
  return {
    input: trimmed,
    normalizedUrl,
    hostname,
    domain: hostname,
  };
}

export function parseV2ScanLabArtifact(
  raw: string,
  definition: ArtifactDefinition,
  artifactPath: string,
) {
  validateRawTextGuardrails(raw, artifactPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw scanLabError("invalid_json", "Artifact is not valid JSON.", artifactPath);
  }
  if (!isRecord(parsed)) {
    throw scanLabError("invalid_json", "Artifact must be a JSON object.", artifactPath);
  }
  const version = parsed[definition.versionField];
  if (version !== definition.supportedVersion) {
    throw scanLabError(
      "unsupported_artifact_version",
      `Unsupported ${definition.fileName} version.`,
      artifactPath,
    );
  }
  if (definition.kind !== "reportProjection") {
    validateParsedGuardrails(parsed, artifactPath);
  }
  return parsed;
}

async function discoverArtifactMatches(input: {
  artifactsDir: string;
  preferredChainKey?: string | null;
  target: NonNullable<ReturnType<typeof normalizeUrlInput>>;
}) {
  if (!existsSync(input.artifactsDir)) {
    return [];
  }

  const rootEntries = await readdir(input.artifactsDir, { withFileTypes: true });
  const matches: ArtifactMatch[] = [];
  for (const rootEntry of rootEntries) {
    if (!rootEntry.isDirectory()) {
      continue;
    }
    const definitions = ARTIFACT_DEFINITIONS.filter((candidate) =>
      rootEntry.name.startsWith(candidate.rootPrefix)
    );
    if (definitions.length === 0) {
      continue;
    }
    const rootPath = path.join(input.artifactsDir, rootEntry.name);
    const domainEntries = await readdir(rootPath, { withFileTypes: true });
    for (const domainEntry of domainEntries) {
      if (!domainEntry.isDirectory()) {
        continue;
      }
      const chainKey = `${deriveCohort(rootEntry.name)}:${domainEntry.name}`;
      if (input.preferredChainKey && chainKey !== input.preferredChainKey) {
        continue;
      }
      for (const definition of definitions) {
        const filePath = path.join(rootPath, domainEntry.name, definition.fileName);
        if (!await fileExists(filePath)) {
          continue;
        }
        const domainMatches = normalizeHostname(domainEntry.name) === input.target.domain;
        if (definition.kind === "canonicalEvidenceBundle") {
          if (!domainMatches) {
            continue;
          }
          const raw = await readFile(filePath, "utf8");
          const { bundle, preview } = parseCanonicalEvidenceBundlePreview(
            raw,
            definition,
            filePath,
            domainEntry.name,
          );
          matches.push({
            kind: definition.kind,
            rootName: rootEntry.name,
            rootPath,
            domainFolder: domainEntry.name,
            filePath,
            raw: "",
            parsed: preview,
            canonicalEvidenceBundle: bundle,
            sourceUrl: stringValue(preview.url) ?? `https://${normalizeHostname(domainEntry.name)}`,
          });
          continue;
        }

        const raw = await readFile(filePath, "utf8");
        let parsed: Record<string, unknown>;
        let sourceUrl: string | null = null;
        if (domainMatches) {
          parsed = parseV2ScanLabArtifact(raw, definition, filePath);
          sourceUrl = extractSourceUrl(parsed);
        } else {
          const looseParsed = tryParseJsonObject(raw);
          sourceUrl = looseParsed ? extractSourceUrl(looseParsed) : null;
          const sourceHost = sourceUrl ? normalizeUrlInput(sourceUrl)?.hostname : null;
          if (sourceHost !== input.target.hostname && sourceHost !== input.target.domain) {
            continue;
          }
          parsed = parseV2ScanLabArtifact(raw, definition, filePath);
        }

        matches.push({
          kind: definition.kind,
          rootName: rootEntry.name,
          rootPath,
          domainFolder: domainEntry.name,
          filePath,
          raw,
          parsed,
          sourceUrl,
        });
      }
    }
  }
  return matches;
}

function tryParseJsonObject(raw: string) {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildArtifactChains(matches: ArtifactMatch[], profile: V2ScanLabProfile) {
  const chainsByKey = new Map<string, V2ScanLabArtifactChain>();
  for (const match of matches) {
    const cohort = deriveCohort(match.rootName);
    const chainKey = `${cohort}:${match.domainFolder}`;
    const existing = chainsByKey.get(chainKey) ?? {
      chainKey,
      cohort,
      domain: match.domainFolder,
      sourceUrl: null,
      artifactRoots: [],
      artifacts: {
        reportProjection: null,
        wc01Shadow: null,
        manualReviewerPacket: null,
        evidencePreviewPacket: null,
      },
      stages: {
        reportProjection: false,
        wc01Shadow: false,
        manualReviewerPacket: false,
        evidencePreviewPacket: false,
      },
      profileMatch: rootMatchesProfile(match.rootName, profile, match.parsed),
    };
    existing.sourceUrl ??= match.sourceUrl;
    existing.artifactRoots = uniqueStrings([...existing.artifactRoots, relativeToWorkspace(match.rootPath)]);
    existing.profileMatch ||= rootMatchesProfile(match.rootName, profile, match.parsed);
    if (isStageArtifactKind(match.kind)) {
      existing.artifacts[match.kind] = relativeToWorkspace(match.filePath);
      existing.stages[match.kind] = true;
    }
    chainsByKey.set(chainKey, existing);
  }
  return [...chainsByKey.values()].sort((left, right) => scoreChain(right) - scoreChain(left));
}

function isStageArtifactKind(kind: ArtifactKind): kind is V2ScanLabStageKey {
  return STAGE_KEYS.includes(kind as V2ScanLabStageKey);
}

function selectArtifactChain(
  chains: V2ScanLabArtifactChain[],
  profile: V2ScanLabProfile,
  preferredChainKey: string | null | undefined,
) {
  const preferredChain = preferredChainKey
    ? chains.find((chain) => chain.chainKey === preferredChainKey)
    : null;
  if (preferredChain) {
    return preferredChain;
  }
  const profileMatch = chains.find((chain) => chain.profileMatch && chain.stages.evidencePreviewPacket);
  if (profileMatch) {
    return profileMatch;
  }
  const evidencePreview = chains.find((chain) => chain.stages.evidencePreviewPacket);
  if (evidencePreview) {
    return evidencePreview;
  }
  return chains.find((chain) => chain.profileMatch) ?? chains[0]!;
}

async function buildModel(input: {
  chains: V2ScanLabArtifactChain[];
  matches: ArtifactMatch[];
  normalized: NonNullable<ReturnType<typeof normalizeUrlInput>>;
  profile: V2ScanLabProfile;
  selectedChain: V2ScanLabArtifactChain;
}): Promise<V2ScanLabModel> {
  const selectedMatches = input.matches.filter((match) =>
    deriveCohort(match.rootName) === input.selectedChain.cohort &&
    match.domainFolder === input.selectedChain.domain
  );
  const evidencePreview = selectedMatches.find((match) => match.kind === "evidencePreviewPacket")?.parsed;
  const reviewerPacket = selectedMatches.find((match) => match.kind === "manualReviewerPacket")?.parsed;
  const reportProjection = selectedMatches.find((match) => match.kind === "reportProjection")?.parsed;
  const canonicalEvidenceBundle = selectedMatches.find((match) => match.kind === "canonicalEvidenceBundle")?.parsed;
  const canonicalEvidenceBundleFull = selectedMatches.find((match) => match.kind === "canonicalEvidenceBundle")?.canonicalEvidenceBundle;
  const scanLabTiming = selectedMatches.find((match) => match.kind === "scanLabTiming")?.parsed;
  const regulatoryReviewChecklist = canonicalEvidenceBundleFull
    ? regulatoryReviewToProductionChecklistModel((await reviewEvidenceBundle(canonicalEvidenceBundleFull)).regulatoryReview)
    : regulatoryReviewToProductionChecklistModel(null);
  const queueItems = extractQueueItems(evidencePreview ?? reviewerPacket);
  const shadowRows = extractProjectionRows(reportProjection);
  const familySummaries = buildFamilySummaries(queueItems, shadowRows);
  const evidenceGroups = queueItems.flatMap((item) => item.representativeGroups);
  const summary = buildSummary(evidencePreview, reviewerPacket, queueItems);
  const moduleCoverageLimitations = buildModuleCoverageLimitations(canonicalEvidenceBundle);
  const coverageLimitations = uniqueStrings([
    ...queueItems.flatMap((item) => item.coverageLimitations),
    ...moduleCoverageLimitations,
  ]);

  return {
    query: {
      input: input.normalized.input,
      normalizedUrl: input.normalized.normalizedUrl,
      hostname: input.normalized.hostname,
      domain: input.normalized.domain,
      profile: input.profile,
    },
    chains: input.chains,
    selectedChain: input.selectedChain,
    summary,
    reviewSummary: buildReviewSummary({
      chain: input.selectedChain,
      evidenceGroups,
      hasModuleCoverageLimitations: moduleCoverageLimitations.length > 0,
      noGoSummary: isRecord(canonicalEvidenceBundle?.noGoSummary)
        ? canonicalEvidenceBundle.noGoSummary as V2ScanLabNoGoSummary
        : unavailableNoGoSummary(),
      queueItems,
      summary,
    }),
    candidateSignals: queueItems.map(buildCandidateSignal),
    familySummaries,
    sections: buildSections(familySummaries),
    vendorPurposeSummary: buildVendorPurposeSummary(queueItems, shadowRows),
    coverageLimitations,
    evidenceGroups,
    noGoSummary: isRecord(canonicalEvidenceBundle?.noGoSummary)
      ? canonicalEvidenceBundle.noGoSummary as V2ScanLabNoGoSummary
      : unavailableNoGoSummary(),
    runtimeSnapshot: isRecord(canonicalEvidenceBundle?.runtimeSnapshot)
      ? canonicalEvidenceBundle.runtimeSnapshot as V2ScanLabRuntimeSnapshot
      : unavailableRuntimeSnapshot(),
    visualSnapshot: isRecord(canonicalEvidenceBundle?.visualSnapshot)
      ? canonicalEvidenceBundle.visualSnapshot as V2ScanLabVisualSnapshot
      : unavailableVisualSnapshot(),
    timing: buildTimingSummary(scanLabTiming, canonicalEvidenceBundle),
    regulatoryReviewChecklist,
    diagnostics: buildDiagnostics(evidencePreview, reviewerPacket, canonicalEvidenceBundle),
  };
}

function parseCanonicalEvidenceBundlePreview(
  raw: string,
  definition: ArtifactDefinition,
  artifactPath: string,
  domainFolder: string,
): { bundle?: CanonicalEvidenceBundle; preview: Record<string, unknown> } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw scanLabError("invalid_json", "Canonical evidence bundle is not valid JSON.", artifactPath);
  }
  if (!isRecord(parsed)) {
    throw scanLabError("invalid_json", "Canonical evidence bundle must be a JSON object.", artifactPath);
  }
  const bundleResult = canonicalEvidenceBundleSchema.safeParse(parsed);
  const bundle = bundleResult.success ? bundleResult.data : undefined;
  const version = stringValue(parsed.schemaVersion);
  if (version !== definition.supportedVersion) {
    throw scanLabError(
      "unsupported_artifact_version",
      "Unsupported CanonicalEvidenceBundle version.",
      artifactPath,
    );
  }
  return {
    bundle,
    preview: {
      sourceBundleSchemaVersion: version,
      url: bundle?.url || stringValue(parsed.url) || `https://${normalizeHostname(domainFolder)}`,
      scanProfile: bundle
        ? {
            profileId: bundle.scanProfile.profileId,
          }
        : isRecord(parsed.scanProfile)
          ? {
              profileId: stringValue(parsed.scanProfile.profileId),
            }
          : undefined,
      modulesRun: bundle?.modulesRun ?? (Array.isArray(parsed.modulesRun) ? parsed.modulesRun.filter(isRecord) : []),
      noGoSummary: buildNoGoSummaryPreview(parsed, path.dirname(artifactPath)),
      runtimeSnapshot: buildRuntimeSnapshotPreview(parsed),
      visualSnapshot: buildVisualSnapshotPreview(parsed),
    },
  };
}

function buildNoGoSummaryPreview(bundle: Record<string, unknown>, artifactDir: string): V2ScanLabNoGoSummary {
  const reasons = detectNoGoCandidateReasons(bundle, artifactDir);
  if (reasons.length === 0) {
    return unavailableNoGoSummary();
  }
  const reason = reasons.some((item) => item === "policy_homepage_fetch_403")
    ? "Reason: homepage request was blocked with HTTP 403."
    : reasons.some((item) =>
      item.includes("human_verification") ||
      item.includes("connection_security_review") ||
      item === "network_cloudflare_challenge" ||
      item === "network_datadome_challenge"
    )
      ? "Reason: the homepage triggered a captcha or bot challenge before the scanner could verify a usable public page surface."
      : reasons.some((item) => item === "homepage_response_403")
        ? "Reason: homepage request was blocked with HTTP 403."
      : "Reason: homepage request was blocked by bot protection, access controls, or a forbidden response.";
  const challengeObserved = reasons.some((item) =>
    item.includes("human_verification") ||
    item.includes("connection_security_review") ||
    item.includes("access_temporarily_restricted") ||
    item.includes("automated_activity") ||
    item === "network_cloudflare_challenge" ||
    item === "network_datadome_challenge"
  );
  return {
    status: "observed",
    coverageLabel: "No public verification available",
    message: challengeObserved
      ? "This run could not fully verify public pages because the site presented a captcha or bot challenge to the scan environment."
      : "This run could not fully verify public pages because the site limited automated access from the scan environment.",
    previewFindingTitle: challengeObserved ? "Bot challenge blocked homepage verification" : "Homepage blocked during live scan",
    reason,
    reasons,
    title: "Access limited by site protections",
  };
}

function unavailableNoGoSummary(): V2ScanLabNoGoSummary {
  return {
    status: "not_observed",
    coverageLabel: "",
    message: "",
    previewFindingTitle: "",
    reason: null,
    reasons: [],
    title: "",
  };
}

function detectNoGoCandidateReasons(bundle: Record<string, unknown>, artifactDir: string) {
  const reasons = new Set<string>();
  const moduleRuns = Array.isArray(bundle.modulesRun) ? bundle.modulesRun.filter(isRecord) : [];
  const policyRun = moduleRuns.find((moduleRun) => stringValue(moduleRun.moduleName) === "policySurfaceScanner");
  const policyErrors = parseStringArray(policyRun?.errors);
  const policyHomepageForbidden = policyErrors.some((error) =>
    /homepage fetch failed with status 403|forbidden|access denied/i.test(error),
  );
  const domText = readOptionalText(path.join(artifactDir, "dom-text-pre-consent.txt"));
  const normalizedDomText = domText.replace(/\s+/g, " ").trim();
  const lowerDomText = normalizedDomText.toLowerCase();
  const blockTextMatchers: Array<[string, string]> = [
    ["access_temporarily_restricted", "access is temporarily restricted"],
    ["automated_activity", "automated (bot) activity"],
    ["security_service_block", "this website is using a security service"],
    ["unable_to_access", "you are unable to access"],
    ["blocked_message", "you have been blocked"],
    ["human_verification", "verify you are human"],
    ["connection_security_review", "checking if the site connection is secure"],
    ["connection_security_review", "needs to review the security of your connection"],
  ];
  const blockTextMatches = blockTextMatchers.filter(([, needle]) => lowerDomText.includes(needle));

  for (const [reason] of blockTextMatches) {
    reasons.add(`block_page_text:${reason}`);
  }
  if (policyHomepageForbidden) {
    reasons.add("policy_homepage_fetch_403");
  }
  if (normalizedDomText.length === 0) {
    reasons.add("dom_text_empty");
  }

  const vendorObservations = Array.isArray(bundle.normalizedVendorObservations)
    ? bundle.normalizedVendorObservations
    : [];
  if (vendorObservations.length === 0) {
    reasons.add("vendor_observations_zero");
  }
  const responseEvents = Array.isArray(bundle.networkResponseEvents)
    ? bundle.networkResponseEvents.filter(isRecord)
    : [];
  const homepageResponseForbidden = responseEvents.some((event) => {
    const status = numberValue(event.status);
    const firstParty = event.firstParty === true;
    const pathValue = stringValue(event.path) ?? "";
    const responseUrl = stringValue(event.responseUrl) ?? stringValue(event.url) ?? "";
    return status === 403 && firstParty && (pathValue === "/" || /https:\/\/(?:www\.)?[^/]+\/?$/.test(responseUrl));
  });
  if (homepageResponseForbidden) {
    reasons.add("homepage_response_403");
  }
  const networkEvents = Array.isArray(bundle.networkEvents)
    ? bundle.networkEvents.filter(isRecord)
    : [];
  const cloudflareChallengeObserved = networkEvents.some((event) => {
    const requestUrl = stringValue(event.requestUrl) ?? stringValue(event.url) ?? "";
    const hostname = stringValue(event.requestHostname) ?? stringValue(event.hostname) ?? "";
    const pathValue = stringValue(event.path) ?? "";
    const documentUrl = stringValue(event.documentUrl) ?? stringValue(event.topLevelUrl) ?? "";
    return (
      requestUrl.includes("/cdn-cgi/challenge-platform/") ||
      pathValue.includes("/cdn-cgi/challenge-platform/") ||
      documentUrl.includes("__cf_chl_rt_tk=") ||
      (hostname === "challenges.cloudflare.com" && requestUrl.includes("/turnstile/"))
    );
  });
  if (cloudflareChallengeObserved) {
    reasons.add("network_cloudflare_challenge");
  }
  const datadomeChallengeObserved = [...networkEvents, ...responseEvents].some((event) => {
    const requestUrl = stringValue(event.requestUrl) ?? stringValue(event.responseUrl) ?? stringValue(event.url) ?? "";
    const hostname = stringValue(event.requestHostname) ?? stringValue(event.hostname) ?? "";
    const pathValue = stringValue(event.path) ?? "";
    const cookieNames = parseStringArray(event.cookieNamesSet);
    return (
      hostname.endsWith("captcha-delivery.com") ||
      requestUrl.includes("captcha-delivery.com/captcha") ||
      pathValue.includes("/captcha/") ||
      cookieNames.includes("datadome")
    );
  });
  if (datadomeChallengeObserved) {
    reasons.add("network_datadome_challenge");
  }

  const hasDirectBlockEvidence = [...reasons].some((reason) => reason.startsWith("block_page_text:"));
  const hasEmptyForbiddenShell =
    (policyHomepageForbidden || homepageResponseForbidden) &&
    normalizedDomText.length === 0 &&
    vendorObservations.length === 0;
  const hasEmptyCloudflareChallengeShell =
    cloudflareChallengeObserved &&
    normalizedDomText.length === 0 &&
    vendorObservations.length === 0;
  const hasEmptyDatadomeChallengeShell =
    datadomeChallengeObserved &&
    normalizedDomText.length === 0 &&
    vendorObservations.length === 0;

  if (
    !hasDirectBlockEvidence &&
    !hasEmptyForbiddenShell &&
    !hasEmptyCloudflareChallengeShell &&
    !hasEmptyDatadomeChallengeShell
  ) {
    return [];
  }
  return [...reasons].sort();
}

function readOptionalText(filePath: string) {
  if (!existsSync(filePath)) {
    return "";
  }
  return readFileSync(filePath, "utf8");
}

function buildVisualSnapshotPreview(bundle: Record<string, unknown>): V2ScanLabVisualSnapshot {
  const screenshots = Array.isArray(bundle.screenshots)
    ? bundle.screenshots.filter(isRecord)
    : [];
  const artifactRefs = Array.isArray(bundle.artifactRefs)
    ? bundle.artifactRefs.filter(isRecord)
    : [];
  const candidates = [
    ...screenshots.filter((item) => stringValue(item.artifactId) === "screenshot_pre_consent"),
    ...artifactRefs.filter((item) => stringValue(item.artifactId) === "screenshot_pre_consent"),
    ...screenshots,
    ...artifactRefs.filter((item) => stringValue(item.artifactType) === "screenshot"),
  ];
  const screenshot = candidates.find((item) => {
    const candidatePath = stringValue(item.path);
    return Boolean(candidatePath && isSupportedScreenshotPath(candidatePath));
  });
  const rawPath = stringValue(screenshot?.path);
  if (!rawPath) {
    return unavailableVisualSnapshot();
  }
  const relativePath = relativeToWorkspace(rawPath);
  return {
    status: "observed",
    href: `/app/admin/v2-scan-lab/screenshot?path=${encodeURIComponent(relativePath)}`,
    label: stringValue(screenshot?.label) ?? "Pre-consent screenshot",
    path: relativePath,
  };
}

function unavailableVisualSnapshot(): V2ScanLabVisualSnapshot {
  return {
    status: "unavailable",
    href: null,
    label: "Screengrab unavailable",
    path: null,
  };
}

function buildRuntimeSnapshotPreview(bundle: Record<string, unknown>): V2ScanLabRuntimeSnapshot {
  const metrics = buildRuntimeMetricPreview(bundle);
  const trackerFootprint = buildTrackerFootprintPreview(bundle);
  const policySurfaces = buildPolicySurfacePreview(bundle);
  const cmpObservations = Array.isArray(bundle.cmpRuntimeObservations)
    ? bundle.cmpRuntimeObservations.filter(isRecord)
    : [];
  const firstCmp = cmpObservations[0];
  if (firstCmp) {
    const vendor = stringValue(firstCmp.vendor);
    const product = stringValue(firstCmp.product);
    const signals = Array.isArray(firstCmp.signals)
      ? firstCmp.signals.filter(isRecord)
      : [];
    const signalLabels = uniqueStrings(signals.flatMap((signal) => [
      stringValue(signal.matchedValueRedacted),
      stringValue(signal.signalType),
    ]).filter((value): value is string => Boolean(value))).slice(0, 4);
    return {
      consentPlatform: {
        status: "observed",
        label: product ?? vendor ?? "Consent platform observed",
        detail: `${signals.length} pre-consent CMP signal${signals.length === 1 ? "" : "s"} captured by v2 runtime.`,
        signals: signalLabels,
      },
      metrics,
      trackerFootprint,
      policySurfaces,
    };
  }

  const vendorObservations = Array.isArray(bundle.normalizedVendorObservations)
    ? bundle.normalizedVendorObservations.filter(isRecord)
    : [];
  const cmpVendor = vendorObservations.find((vendor) => stringValue(vendor.purpose) === "consent_management");
  if (cmpVendor) {
    return {
      consentPlatform: {
        status: "observed",
        label: stringValue(cmpVendor.product) ?? stringValue(cmpVendor.vendor) ?? "Consent platform observed",
        detail: "Consent-management vendor resolved from v2 normalized vendor evidence.",
        signals: parseStringArray(cmpVendor.basis).slice(0, 4),
      },
      metrics,
      trackerFootprint,
      policySurfaces,
    };
  }

  return {
    ...unavailableRuntimeSnapshot(),
    metrics,
    trackerFootprint,
    policySurfaces,
  };
}

function unavailableRuntimeSnapshot(): V2ScanLabRuntimeSnapshot {
  return {
    consentPlatform: {
      status: "unavailable",
      label: "Stub: consent banner status unavailable",
      detail: "v2 lab model does not expose an old-report consent-platform equivalent.",
      signals: [],
    },
    metrics: {
      thirdPartyRequests: {
        status: "unavailable",
        value: null,
        detail: "Not projected in v2 lab",
      },
      cookiesBeforeConsent: {
        status: "unavailable",
        value: null,
        detail: "Not available in v2 lab",
      },
    },
    trackerFootprint: {
      status: "unavailable",
      vendorCount: 0,
      domainCount: 0,
      totalCount: 0,
      vendorLabels: [],
      domainLabels: [],
    },
    policySurfaces: {
      status: "unavailable",
      observedCount: 0,
      surfaces: [],
    },
  };
}

function buildRuntimeMetricPreview(bundle: Record<string, unknown>): V2ScanLabRuntimeSnapshot["metrics"] {
  const networkEvents = Array.isArray(bundle.networkEvents)
    ? bundle.networkEvents.filter(isRecord)
    : [];
  const thirdPartyRequestCount = networkEvents.filter((event) =>
    event.thirdParty === true || event.isThirdParty === true
  ).length;

  const cookieSnapshots = Array.isArray(bundle.cookieSnapshots)
    ? bundle.cookieSnapshots.filter(isRecord)
    : [];
  const cookieNames = uniqueStrings(cookieSnapshots.flatMap((snapshot) => {
    const explicitNames = parseStringArray(snapshot.cookieNames);
    if (explicitNames.length > 0) {
      return explicitNames;
    }
    const cookies = Array.isArray(snapshot.cookies) ? snapshot.cookies.filter(isRecord) : [];
    return cookies.map((cookie) => stringValue(cookie.name)).filter((name): name is string => Boolean(name));
  }));

  return {
    thirdPartyRequests: {
      status: networkEvents.length > 0 ? "observed" : "unavailable",
      value: networkEvents.length > 0 ? thirdPartyRequestCount : null,
      detail: networkEvents.length > 0
        ? `${thirdPartyRequestCount} 3rd-party request${thirdPartyRequestCount === 1 ? "" : "s"}`
        : "Not projected in v2 lab",
    },
    cookiesBeforeConsent: {
      status: cookieSnapshots.length > 0 ? "observed" : "unavailable",
      value: cookieSnapshots.length > 0 ? cookieNames.length : null,
      detail: cookieSnapshots.length > 0
        ? `${cookieNames.length} cookie${cookieNames.length === 1 ? "" : "s"} before consent`
        : "Not available in v2 lab",
    },
  };
}

function buildTrackerFootprintPreview(bundle: Record<string, unknown>): V2ScanLabRuntimeSnapshot["trackerFootprint"] {
  const vendorObservations = Array.isArray(bundle.normalizedVendorObservations)
    ? bundle.normalizedVendorObservations.filter(isRecord)
    : [];
  const trackerPurposes = new Set(["advertising", "analytics", "session_replay"]);
  const vendorLabels = uniqueStrings(vendorObservations
    .filter((vendor) => {
      const purpose = stringValue(vendor.purpose);
      return purpose ? trackerPurposes.has(purpose) : false;
    })
    .map((vendor) => stringValue(vendor.vendor) ?? stringValue(vendor.entity) ?? stringValue(vendor.product))
    .filter((label): label is string => Boolean(label)));

  const networkEvents = Array.isArray(bundle.networkEvents)
    ? bundle.networkEvents.filter(isRecord)
    : [];
  const domainLabels = uniqueStrings(networkEvents
    .filter((event) => event.thirdParty === true || event.isThirdParty === true)
    .map((event) =>
      stringValue(event.requestHostname) ??
      stringValue(event.hostname) ??
      hostnameFromUrl(stringValue(event.requestUrl) ?? stringValue(event.url))
    )
    .filter((label): label is string => Boolean(label)));

  const totalCount = vendorLabels.length + domainLabels.length;
  return {
    status: totalCount > 0 ? "observed" : "unavailable",
    vendorCount: vendorLabels.length,
    domainCount: domainLabels.length,
    totalCount,
    vendorLabels,
    domainLabels,
  };
}

function buildTimingSummary(
  scanLabTiming: Record<string, unknown> | undefined,
  canonicalEvidenceBundle: Record<string, unknown> | undefined,
): V2ScanLabTimingSummary {
  const stepTimings = Array.isArray(scanLabTiming?.stepTimings)
    ? scanLabTiming.stepTimings.filter(isRecord)
    : [];
  const moduleRuns = Array.isArray(canonicalEvidenceBundle?.modulesRun)
    ? canonicalEvidenceBundle.modulesRun.filter(isRecord)
    : [];
  const stepDuration = (label: string) => durationForStep(stepTimings, label);
  const moduleDuration = (moduleName: string) => durationForModule(moduleRuns, moduleName);
  const wc01AdapterDuration = sumDurations([
    stepDuration("shadow"),
    stepDuration("allowlist"),
    stepDuration("concern input"),
    stepDuration("policy simulation"),
    stepDuration("normalized concern adapter"),
    stepDuration("policy comparison"),
  ]);
  const reviewerPreviewDuration = sumDurations([
    stepDuration("reviewer packet"),
    stepDuration("evidence preview"),
  ]);
  const totalDurationMs = numberValue(scanLabTiming?.totalDurationMs);
  const timingRow = (row: {
    key: string;
    label: string;
    durationMs: number | null;
    detail: string;
  }) => ({
    ...row,
    deltaFromTotalMs: totalDurationMs !== null && row.durationMs !== null
      ? row.durationMs - totalDurationMs
      : null,
    percentOfTotal: totalDurationMs !== null && totalDurationMs > 0 && row.durationMs !== null
      ? Math.round((row.durationMs / totalDurationMs) * 1000) / 10
      : null,
  });
  const rows = [
    timingRow({
      key: "total",
      label: "total wall time",
      durationMs: totalDurationMs,
      detail: "Full v2 lab chain wall-clock time. Parallel work is counted once here, not added by module.",
    }),
    timingRow({
      key: "scan_core",
      label: "scan-core wall time",
      durationMs: stepDuration("scan"),
      detail: "v2:scan command wall-clock time. In standard/full scans, preConsentRuntimeScanner and policySurfaceScanner run in parallel inside this span; full scans also include consentFlowRuntimeScanner.",
    }),
    timingRow({
      key: "pre_consent_scanner",
      label: "pre-consent scanner",
      durationMs: moduleDuration("preConsentRuntimeScanner"),
      detail: moduleDuration("preConsentRuntimeScanner") === null
        ? "Available when preConsentRuntimeScanner runs in new scans."
        : "Pre-consent runtime observation path inside scan-core. This may overlap with policy-surface scanning and is not additive to total.",
    }),
    timingRow({
      key: "consent_flow_scanner",
      label: "consent-flow scanner",
      durationMs: moduleDuration("consentFlowRuntimeScanner"),
      detail: moduleDuration("consentFlowRuntimeScanner") === null
        ? "Available when consentFlowRuntimeScanner runs in new full scans."
        : "consentFlowRuntimeScanner module duration inside scan-core. In full scans this is part of scan-core timing and is not additive to total.",
    }),
    timingRow({
      key: "policy_scanner",
      label: "policy scanner",
      durationMs: moduleDuration("policySurfaceScanner"),
      detail: moduleDuration("policySurfaceScanner") === null
        ? "Available when policySurfaceScanner runs in new standard, policy, or full scans."
        : "policySurfaceScanner module duration inside scan-core. In standard/full scans this overlaps with pre-consent runtime work and is not additive to total.",
    }),
    timingRow({
      key: "vendor_resolver",
      label: "vendor resolver",
      durationMs: moduleDuration("vendorResolver"),
      detail: moduleDuration("vendorResolver") === null
        ? "Available for new scans after timing instrumentation."
        : "Canonical resolver pass inside scan-core after runtime evidence capture. This is a subspan of scan-core, not additive to total.",
    }),
    timingRow({
      key: "review_engine",
      label: "review-engine",
      durationMs: stepDuration("review"),
      detail: "v2:review evidence interpretation.",
    }),
    timingRow({
      key: "report_adapter_projection",
      label: "report-adapter projection",
      durationMs: stepDuration("project"),
      detail: "v2:project projection draft.",
    }),
    timingRow({
      key: "wc01_adapters",
      label: "WC01 adapters sum",
      durationMs: wc01AdapterDuration,
      detail: "Sequential sum of shadow, allowlist, concern-input, policy simulation, normalized-concern, and comparison steps.",
    }),
    timingRow({
      key: "reviewer_preview",
      label: "reviewer packet / evidence preview",
      durationMs: reviewerPreviewDuration,
      detail: "Sequential sum of internal reviewer packet and bounded evidence preview generation.",
    }),
  ];

  return {
    status: rows.some((row) => row.durationMs !== null) ? "observed" : "unavailable",
    totalDurationMs,
    rows,
  };
}

function durationForStep(stepTimings: Record<string, unknown>[], label: string) {
  return numberValue(stepTimings.find((step) => stringValue(step.label) === label)?.durationMs);
}

function durationForModule(moduleRuns: Record<string, unknown>[], moduleName: string) {
  return numberValue(moduleRuns.find((module) => stringValue(module.moduleName) === moduleName)?.durationMs);
}

function sumDurations(values: Array<number | null>) {
  const observed = values.filter((value): value is number => typeof value === "number");
  return observed.length > 0 ? observed.reduce((sum, value) => sum + value, 0) : null;
}

function buildPolicySurfacePreview(bundle: Record<string, unknown>): V2ScanLabRuntimeSnapshot["policySurfaces"] {
  const observations = Array.isArray(bundle.policySurfaceObservations)
    ? bundle.policySurfaceObservations.filter(isRecord)
    : [];
  const displayableStatuses = new Set(["observed", "candidate", "assisted_candidate", "fetched"]);
  const surfaces = new Map<string, V2ScanLabPolicySurfaceSummary>();

  for (const observation of observations) {
    const surfaceType = stringValue(observation.surfaceType) ?? "unknown";
    if (surfaceType === "unknown") {
      continue;
    }
    const status = stringValue(observation.status) ?? "observed";
    if (!displayableStatuses.has(status)) {
      continue;
    }
    const surface = {
      surfaceType,
      label: policySurfaceLabel(surfaceType),
      url: stringValue(observation.normalizedUrl) ?? stringValue(observation.url),
      status,
      detail: policySurfaceDetail(observation),
    };
    const existing = surfaces.get(surfaceType);
    if (!existing || policySurfaceRank(surface) < policySurfaceRank(existing)) {
      surfaces.set(surfaceType, surface);
    }
  }

  const orderedSurfaces = [...surfaces.values()].sort((left, right) =>
    policySurfacePriority(left.surfaceType) - policySurfacePriority(right.surfaceType) ||
    left.label.localeCompare(right.label),
  );

  return {
    status: orderedSurfaces.length > 0 ? "observed" : "unavailable",
    observedCount: orderedSurfaces.length,
    surfaces: orderedSurfaces,
  };
}

function policySurfaceRank(surface: V2ScanLabPolicySurfaceSummary) {
  const statusRank = surface.status === "fetched" ? 0 : surface.status === "observed" ? 1 : 2;
  const urlRank = surface.url ? 0 : 1;
  return statusRank * 10 + urlRank;
}

function policySurfaceDetail(observation: Record<string, unknown>) {
  const status = stringValue(observation.status) ?? "observed";
  const httpStatus = numberValue(observation.httpStatus);
  const topics = parseStringArray(observation.observedTopics);
  const controls = parseStringArray(observation.mentionedControls);
  const parts = [
    status,
    httpStatus ? `HTTP ${httpStatus}` : null,
    topics.length > 0 ? `${topics.length} topic${topics.length === 1 ? "" : "s"}` : null,
    controls.length > 0 ? `${controls.length} control${controls.length === 1 ? "" : "s"}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

function policySurfaceLabel(surfaceType: string) {
  switch (surfaceType) {
    case "privacy_policy":
      return "Privacy policy";
    case "cookie_policy":
      return "Cookie policy";
    case "terms":
      return "Terms of service";
    case "california_notice":
      return "California notice";
    case "notice_at_collection":
      return "Notice at collection";
    case "do_not_sell_or_share":
      return "Do not sell or share";
    case "your_privacy_choices":
      return "Your privacy choices";
    case "cookie_settings":
      return "Cookie settings";
    case "consent_preferences":
      return "Consent preferences";
    case "ai_disclosure":
      return "AI disclosure";
    case "accessibility_statement":
      return "Accessibility statement";
    default:
      return surfaceType.replaceAll("_", " ");
  }
}

function policySurfacePriority(surfaceType: string) {
  const order = [
    "privacy_policy",
    "cookie_policy",
    "terms",
    "california_notice",
    "notice_at_collection",
    "do_not_sell_or_share",
    "your_privacy_choices",
    "cookie_settings",
    "consent_preferences",
    "ai_disclosure",
    "accessibility_statement",
  ];
  const index = order.indexOf(surfaceType);
  return index === -1 ? order.length : index;
}

function extractQueueItems(packet: Record<string, unknown> | undefined) {
  const items = Array.isArray(packet?.queueItems) ? packet.queueItems.filter(isRecord) : [];
  return items.map(parseQueueItem);
}

function parseQueueItem(item: Record<string, unknown>): QueueItemModel {
  const groups = parseRepresentativeGroups(item.representativeEvidenceGroups);
  const confidence = stringValue(item.confidence) ?? mostCommonString(groups.map((group) => group.confidence)) ?? "unknown";
  const directness = stringValue(item.directness) ?? mostCommonString(groups.map((group) => group.directness)) ?? "unknown";
  const topDisplaySafeExcerpts = groups.flatMap((group) => group.topDisplaySafeExcerpts).slice(0, 5);
  return {
    id: stringValue(item.queueItemId) ?? stringValue(item.candidateId) ?? "candidate_signal",
    sourceFindingKey: stringValue(item.sourceFindingKey) ?? "unknown_source",
    sourceRowId: stringValue(item.sourceRowId) ?? "unknown_row",
    lane: stringValue(item.queueLane) ?? "internal_review",
    simulatedPolicyOutcome: stringValue(item.simulatedPolicyOutcome) ?? "artifact_preview_only",
    confidence,
    directness,
    candidateFamily: stringValue(item.candidateFamily) ?? "unknown",
    vendorLabels: parseStringArray(item.vendorLabels),
    supportingPurposes: parseStringArray(item.supportingPurposes),
    diagnosticPurposes: parseStringArray(item.diagnosticPurposes),
    sensitiveContextCategories: parseStringArray(item.sensitiveContextCategories),
    resolvedExcerptCount: arrayLength(item.resolvedEvidenceExcerpts),
    resolvedSourceRefCount: arrayLength(item.resolvedSourceRefs),
    unresolvedRefCount: arrayLength(item.unresolvedEvidenceRefs),
    warningCount: groups.reduce((sum, group) => sum + group.warningCount, 0),
    representativeGroups: groups,
    coverageLimitations: parseStringArray(item.coverageLimitations),
    caveats: parseStringArray(item.caveats),
    topDisplaySafeExcerpts,
  };
}

function buildCandidateSignal(item: QueueItemModel): V2ScanLabCandidateSignal {
  return {
    id: item.id,
    sourceFindingKey: item.sourceFindingKey,
    sourceRowId: item.sourceRowId,
    family: item.candidateFamily,
    lane: item.lane,
    simulatedPolicyOutcome: item.simulatedPolicyOutcome,
    confidence: item.confidence,
    directness: item.directness,
    vendorLabels: item.vendorLabels,
    supportingPurposes: item.supportingPurposes,
    diagnosticPurposes: item.diagnosticPurposes,
    sensitiveContextCategories: item.sensitiveContextCategories,
    coverageLimitations: item.coverageLimitations,
    caveats: item.caveats,
    resolvedExcerptCount: item.resolvedExcerptCount,
    resolvedSourceRefCount: item.resolvedSourceRefCount,
    unresolvedRefCount: item.unresolvedRefCount,
    warningCount: item.warningCount,
    evidenceGroupCount: item.representativeGroups.length,
    topDisplaySafeExcerpts: item.topDisplaySafeExcerpts,
  };
}

function parseRepresentativeGroups(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord).map((group): V2ScanLabEvidenceGroup => {
    const representativeExcerpts = Array.isArray(group.representativeExcerpts)
      ? group.representativeExcerpts.filter(isRecord)
      : [];
    return {
      groupId: stringValue(group.groupId) ?? stringValue(group.groupKey) ?? "unknown_group",
      groupLabel: stringValue(group.groupLabel) ?? "Unnamed group",
      candidateFamily: stringValue(group.family) ?? "unknown",
      evidenceKind: stringValue(group.evidenceKind) ?? "unknown",
      vendorLabels: parseStringArray(group.vendorLabels),
      supportingPurposes: parseStringArray(group.supportingPurposes),
      diagnosticPurposes: parseStringArray(group.diagnosticPurposes),
      confidence: stringValue(group.confidence) ?? "unknown",
      directness: stringValue(group.directness) ?? "unknown",
      topDisplaySafeExcerpts: representativeExcerpts
        .map((excerpt) => stringValue(excerpt.boundedText))
        .filter((excerpt): excerpt is string => Boolean(excerpt))
        .slice(0, 5),
      sourceRefsCount: numberValue(group.totalResolvedSourceRefs) ?? arrayLength(group.representativeSourceRefs),
      unresolvedRefsCount: numberValue(group.totalUnresolvedRefs) ?? 0,
      warningCount: numberValue(group.totalRedactionWarnings) ?? 0,
    };
  });
}

function extractProjectionRows(reportProjection: Record<string, unknown> | undefined) {
  return Array.isArray(reportProjection?.rows) ? reportProjection.rows.filter(isRecord) : [];
}

function buildFamilySummaries(queueItems: QueueItemModel[], reportRows: Record<string, unknown>[]) {
  const summaries = new Map<string, V2ScanLabFamilySummary>();
  for (const item of queueItems) {
    const summary = summaries.get(item.candidateFamily) ?? {
      family: item.candidateFamily,
      queueItemCount: 0,
      representativeGroupCount: 0,
      resolvedExcerptCount: 0,
      unresolvedRefCount: 0,
      vendorLabels: [],
      supportingPurposes: [],
      diagnosticPurposes: [],
    };
    summary.queueItemCount += 1;
    summary.representativeGroupCount += item.representativeGroups.length;
    summary.resolvedExcerptCount += item.resolvedExcerptCount;
    summary.unresolvedRefCount += item.unresolvedRefCount;
    summary.vendorLabels = uniqueStrings([...summary.vendorLabels, ...item.vendorLabels]);
    summary.supportingPurposes = uniqueStrings([...summary.supportingPurposes, ...item.supportingPurposes]);
    summary.diagnosticPurposes = uniqueStrings([...summary.diagnosticPurposes, ...item.diagnosticPurposes]);
    summaries.set(item.candidateFamily, summary);
  }
  for (const row of reportRows) {
    const key = mapFindingKeyToFamily(stringValue(row.findingKey) ?? "report_projection");
    if (!summaries.has(key)) {
      summaries.set(key, {
        family: key,
        queueItemCount: 0,
        representativeGroupCount: 0,
        resolvedExcerptCount: arrayLength(row.evidenceExcerptIds),
        unresolvedRefCount: 0,
        vendorLabels: extractRelatedVendorLabels(row.relatedVendors),
        supportingPurposes: extractRelatedVendorPurposes(row.relatedVendors),
        diagnosticPurposes: [],
      });
    }
  }
  return [...summaries.values()].sort((left, right) => left.family.localeCompare(right.family));
}

function buildSections(familySummaries: V2ScanLabFamilySummary[]) {
  const sections = [
    { key: "candidate_families", title: "Candidate families overview", predicate: () => true },
    { key: "pre_consent_tracking", title: "Pre-consent tracking", predicate: (family: string) => family.includes("pre_consent_tracking") },
    { key: "pre_consent_cookie_storage", title: "Pre-consent cookie/storage", predicate: (family: string) => family.includes("cookie") || family.includes("storage") },
    { key: "session_replay", title: "Session replay / behavioral analytics", predicate: (family: string) => family.includes("session_replay") || family.includes("behavioral") },
    { key: "consent_flow", title: "Consent / consent-flow signals", predicate: (family: string) => family.includes("consent") },
    { key: "policy_control_surface", title: "Policy/control surface signals", predicate: (family: string) => family.includes("policy") || family.includes("control") },
  ] satisfies Array<{
    key: string;
    title: string;
    predicate: (family: string) => boolean;
  }>;

  return sections.map((section) => ({
    key: section.key,
    title: section.title,
    items: familySummaries.filter((summary) => section.predicate(summary.family)),
  }));
}

function buildVendorPurposeSummary(queueItems: QueueItemModel[], reportRows: Record<string, unknown>[]) {
  const counts = new Map<string, V2ScanLabVendorPurposeSummary>();
  for (const item of queueItems) {
    for (const label of item.vendorLabels) {
      const existing = counts.get(label) ?? { label, purposes: [], count: 0 };
      existing.count += 1;
      existing.purposes = uniqueStrings([
        ...existing.purposes,
        ...item.supportingPurposes,
        ...item.diagnosticPurposes,
      ]);
      counts.set(label, existing);
    }
  }
  for (const row of reportRows) {
    const vendors = Array.isArray(row.relatedVendors) ? row.relatedVendors.filter(isRecord) : [];
    for (const vendor of vendors) {
      const label = stringValue(vendor.vendor) ?? stringValue(vendor.entity);
      if (!label) {
        continue;
      }
      const existing = counts.get(label) ?? { label, purposes: [], count: 0 };
      existing.count += 1;
      existing.purposes = uniqueStrings([...existing.purposes, ...parseStringArray(vendor.regulatoryRelevance), stringValue(vendor.purpose)].filter((value): value is string => Boolean(value)));
      counts.set(label, existing);
    }
  }
  return [...counts.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildSummary(
  evidencePreview: Record<string, unknown> | undefined,
  reviewerPacket: Record<string, unknown> | undefined,
  queueItems: QueueItemModel[],
): V2ScanLabSummary {
  const packet = evidencePreview ?? reviewerPacket;
  return {
    queueItemCount: numberValue(packet?.queueItemCount) ?? queueItems.length,
    representativeGroupCount: queueItems.reduce((sum, item) => sum + item.representativeGroups.length, 0),
    resolvedExcerptCount: queueItems.reduce((sum, item) => sum + item.resolvedExcerptCount, 0),
    resolvedSourceRefCount: queueItems.reduce((sum, item) => sum + item.resolvedSourceRefCount, 0),
    unresolvedRefCount: queueItems.reduce((sum, item) => sum + item.unresolvedRefCount, 0) + arrayLength(evidencePreview?.unresolvedEvidenceRefs),
    warningCount: queueItems.reduce((sum, item) => sum + item.warningCount, 0) + arrayLength(evidencePreview?.redactionWarnings),
    sensitiveContextItemCount: queueItems.filter((item) => item.sensitiveContextCategories.length > 0).length,
    guardrailFlags: extractGuardrailFlags(packet?.guardrails),
  };
}

function buildReviewSummary(input: {
  chain: V2ScanLabArtifactChain;
  evidenceGroups: V2ScanLabEvidenceGroup[];
  hasModuleCoverageLimitations: boolean;
  noGoSummary: V2ScanLabNoGoSummary;
  queueItems: QueueItemModel[];
  summary: V2ScanLabSummary;
}): V2ScanLabReviewSummary {
  const closedDefaultFlags = Object.entries(input.summary.guardrailFlags);
  const closedDefaultFailures = closedDefaultFlags.filter(([, value]) => value === false).length;
  const posture =
    input.noGoSummary.status === "observed"
      ? "blocked"
      : closedDefaultFailures > 0
      ? "blocked"
      : input.summary.queueItemCount === 0 || input.hasModuleCoverageLimitations
        ? "limited_artifacts"
        : input.summary.unresolvedRefCount > 0 || input.summary.warningCount > 0 || input.summary.sensitiveContextItemCount > 0
          ? "needs_review"
          : "artifact_ready";
  const headline = input.noGoSummary.status === "observed"
    ? input.noGoSummary.title
    : input.summary.queueItemCount > 0
      ? `${input.summary.queueItemCount} internal candidate signal${input.summary.queueItemCount === 1 ? "" : "s"} available`
      : "No internal candidate signals available";

  return {
    headline,
    posture,
    supportingText: input.noGoSummary.status === "observed"
      ? `${input.noGoSummary.message} ${input.noGoSummary.reason ?? ""}`.trim()
      : "",
    highlightRows: [
      {
        label: input.noGoSummary.status === "observed" ? "Public verification" : "Artifact posture",
        value: input.noGoSummary.status === "observed" ? input.noGoSummary.coverageLabel : formatReviewPosture(posture),
        tone: posture === "artifact_ready" ? "success" : posture === "blocked" ? "warning" : "neutral",
      },
      {
        label: input.noGoSummary.status === "observed" ? "Scoring" : "Review queue",
        value: input.noGoSummary.status === "observed" ? "Withheld" : `${input.summary.queueItemCount} items`,
        tone: input.noGoSummary.status === "observed" ? "warning" : input.summary.queueItemCount > 0 ? "success" : "neutral",
      },
      {
        label: input.noGoSummary.status === "observed" ? "No-go signal" : "Evidence groups",
        value: input.noGoSummary.status === "observed" ? input.noGoSummary.previewFindingTitle : `${input.summary.representativeGroupCount} groups`,
        tone: input.noGoSummary.status === "observed" ? "warning" : input.summary.representativeGroupCount > 0 ? "success" : "neutral",
      },
      {
        label: input.noGoSummary.status === "observed" ? "Candidate findings" : "Refs needing attention",
        value: input.noGoSummary.status === "observed" ? "Withheld" : `${input.summary.unresolvedRefCount} unresolved`,
        tone: input.noGoSummary.status === "observed" ? "warning" : input.summary.unresolvedRefCount > 0 ? "warning" : "success",
      },
    ],
  };
}

function formatReviewPosture(value: V2ScanLabReviewSummary["posture"]) {
  switch (value) {
    case "artifact_ready":
      return "Artifact-ready";
    case "blocked":
      return "Blocked";
    case "limited_artifacts":
      return "Limited artifacts";
    case "needs_review":
      return "Needs review";
  }
}

function buildDiagnostics(
  evidencePreview: Record<string, unknown> | undefined,
  reviewerPacket: Record<string, unknown> | undefined,
  canonicalEvidenceBundle: Record<string, unknown> | undefined,
) {
  const warnings = parseStringArray(evidencePreview?.redactionWarnings);
  const blockedCandidates = Array.isArray(reviewerPacket?.blockedCandidates)
    ? reviewerPacket.blockedCandidates.length
    : 0;
  return [
    ...warnings.map((warning) => `sanitizer warning: ${warning}`),
    ...buildModuleDiagnostics(canonicalEvidenceBundle),
    ...(blockedCandidates > 0 ? [`blocked candidates: ${blockedCandidates}`] : []),
  ];
}

function buildModuleCoverageLimitations(canonicalEvidenceBundle: Record<string, unknown> | undefined) {
  const moduleRuns = Array.isArray(canonicalEvidenceBundle?.modulesRun)
    ? canonicalEvidenceBundle.modulesRun.filter(isRecord)
    : [];
  return uniqueStrings(moduleRuns
    .filter((moduleRun) => {
      const status = stringValue(moduleRun.status);
      return status === "failed" || status === "partial";
    })
    .map((moduleRun) => {
      const moduleName = stringValue(moduleRun.moduleName) ?? "unknown module";
      const status = stringValue(moduleRun.status) ?? "limited";
      return `${moduleName} ${status}`;
    }));
}

function buildModuleDiagnostics(canonicalEvidenceBundle: Record<string, unknown> | undefined) {
  const moduleRuns = Array.isArray(canonicalEvidenceBundle?.modulesRun)
    ? canonicalEvidenceBundle.modulesRun.filter(isRecord)
    : [];
  return moduleRuns
    .filter((moduleRun) => {
      const status = stringValue(moduleRun.status);
      return status === "failed" || status === "partial";
    })
    .map((moduleRun) => {
      const moduleName = stringValue(moduleRun.moduleName) ?? "unknown module";
      const status = stringValue(moduleRun.status) ?? "limited";
      const errors = parseStringArray(moduleRun.errors);
      const firstError = errors[0];
      return firstError
        ? `module ${moduleName} ${status}: ${firstError}`
        : `module ${moduleName} ${status}`;
    });
}

function validateRawTextGuardrails(raw: string, artifactPath: string) {
  if (raw.includes(`gap_${"observed"}`)) {
    throw scanLabError(
      "forbidden_status_mapping_present",
      "Artifact contains a forbidden production gap status token.",
      artifactPath,
    );
  }
  if (RAW_BLOCKED_FIELD_PATTERN.test(raw)) {
    throw scanLabError(
      "raw_blocked_fields_present",
      "Artifact contains raw blocked evidence field names.",
      artifactPath,
    );
  }
  if (LEGAL_CONCLUSION_WORDING_PATTERN.test(raw)) {
    throw scanLabError(
      "legal_conclusion_wording_present",
      "Artifact contains legal-conclusion wording.",
      artifactPath,
    );
  }
}

function validateParsedGuardrails(value: unknown, artifactPath: string) {
  walkArtifact(value, (key, entry) => {
    if (key === "productionEligible" && entry === true) {
      throw scanLabError("production_eligible_true", "Artifact is production eligible.", artifactPath);
    }
    if (key === "customerFacingEligible" && entry === true) {
      throw scanLabError("customer_facing_eligible_true", "Artifact is customer-facing eligible.", artifactPath);
    }
    if (key === "topFindingEligible" && entry === true) {
      throw scanLabError("top_finding_eligible_true", "Artifact contains top-finding eligibility.", artifactPath);
    }
    if (key === "gapEligible" && entry === true) {
      throw scanLabError("gap_eligible_true", "Artifact contains gap eligibility.", artifactPath);
    }
    if (
      typeof entry === "string" &&
      (key === "boundedText" || key === "displayText" || key === "excerpt") &&
      entry.length > MAX_DISPLAY_SAFE_TEXT_LENGTH
    ) {
      throw scanLabError(
        "unsafe_unbounded_evidence_text",
        "Artifact contains evidence text that exceeds the internal display bound.",
        artifactPath,
      );
    }
  });
}

function walkArtifact(value: unknown, visitor: (key: string, value: unknown) => void) {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkArtifact(item, visitor);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    visitor(key, entry);
    walkArtifact(entry, visitor);
  }
}

function extractSourceUrl(value: Record<string, unknown>) {
  return stringValue(value.sourceUrl)
    ?? stringValue(value.url)
    ?? (isRecord(value.source) ? stringValue(value.source.url) : null)
    ?? (isRecord(value.sourceArtifact) ? stringValue(value.sourceArtifact.sourceUrl) : null);
}

function extractGuardrailFlags(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }
  const flags: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "boolean") {
      flags[key] = entry;
    }
  }
  return flags;
}

function deriveCohort(rootName: string) {
  for (const definition of ARTIFACT_DEFINITIONS) {
    if (rootName.startsWith(definition.rootPrefix)) {
      return rootName.slice(definition.rootPrefix.length);
    }
  }
  return rootName;
}

function rootMatchesProfile(
  rootName: string,
  profile: V2ScanLabProfile,
  parsed: Record<string, unknown>,
) {
  if (rootName.includes(profile)) {
    return true;
  }
  const scanProfile = isRecord(parsed.scanProfile) ? parsed.scanProfile : null;
  return stringValue(scanProfile?.profileId) === profile;
}

function scoreChain(chain: V2ScanLabArtifactChain) {
  return (chain.profileMatch ? 100 : 0)
    + (chain.stages.evidencePreviewPacket ? 20 : 0)
    + (chain.stages.manualReviewerPacket ? 10 : 0)
    + (chain.stages.wc01Shadow ? 5 : 0)
    + (chain.stages.reportProjection ? 3 : 0);
}

function artifactKindScore(kind: ArtifactKind) {
  switch (kind) {
    case "evidencePreviewPacket":
      return 20;
    case "manualReviewerPacket":
      return 10;
    case "wc01Shadow":
      return 5;
    case "reportProjection":
      return 3;
    case "canonicalEvidenceBundle":
      return 1;
    case "scanLabTiming":
      return 0;
  }
}

function mapFindingKeyToFamily(findingKey: string) {
  if (findingKey.includes("pre_consent_tracking") || findingKey.includes("third_party_vendor")) {
    return "pre_consent_tracking";
  }
  if (findingKey.includes("cookie") || findingKey.includes("storage")) {
    return "pre_consent_cookie_storage";
  }
  if (findingKey.includes("session_replay") || findingKey.includes("behavioral")) {
    return "session_replay_behavioral_analytics";
  }
  if (findingKey.includes("consent")) {
    return "consent_flow";
  }
  if (findingKey.includes("policy") || findingKey.includes("control")) {
    return "policy_control_surface";
  }
  return findingKey;
}

function extractRelatedVendorLabels(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStrings(value.filter(isRecord).flatMap((vendor) => [
    stringValue(vendor.vendor),
    stringValue(vendor.entity),
  ]));
}

function extractRelatedVendorPurposes(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStrings(value.filter(isRecord).flatMap((vendor) => [
    stringValue(vendor.purpose),
    ...parseStringArray(vendor.regulatoryRelevance),
  ]));
}

function parseProfile(value: string | null | undefined): V2ScanLabProfile {
  return value === "tiny" || value === "standard" || value === "policy" || value === "consent" || value === "full" ? value : "tiny";
}

async function fileExists(filePath: string) {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

function findWorkspaceRoot(startDir: string) {
  let current = path.resolve(startDir);
  for (;;) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDir);
    }
    current = parent;
  }
}

function relativeToWorkspace(filePath: string) {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const relativePath = path.relative(workspaceRoot, filePath);
  return relativePath.startsWith("..") ? filePath : relativePath;
}

function isSupportedScreenshotPath(filePath: string) {
  return [".png", ".jpg", ".jpeg", ".webp"].includes(path.extname(filePath).toLowerCase());
}

function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

function hostnameFromUrl(value: string | null) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function scanLabError(
  code: V2ScanLabError["code"],
  message: string,
  artifactPath?: string,
) {
  return { code, message, artifactPath } satisfies V2ScanLabError;
}

function isV2ScanLabError(value: unknown): value is V2ScanLabError {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function arrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function mostCommonString(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}
