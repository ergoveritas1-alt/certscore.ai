import { createHash } from "node:crypto";

export const SANITIZED_NETWORK_EVIDENCE_CANONICALIZATION_VERSION = "sanitized_network_evidence.v1";

type UnknownRecord = Record<string, unknown>;

export type SanitizedNetworkEvidenceEntry = {
  evidenceKind?: string;
  matchedVendor?: string;
  pageUrl?: string;
  requestUrlSanitized?: string;
  runtimePhase?: string;
  sourceUrl?: string;
};

export type SanitizedNetworkEvidence = UnknownRecord & {
  artifactSha256?: string;
  canonicalizationVersion?: string;
  capturedAt?: string;
  entries?: unknown;
  sourceWindowEndedAt?: string;
  sourceWindowStartedAt?: string;
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneWithSortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneWithSortedKeys(entry));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, cloneWithSortedKeys(value[key])])
  );
}

function stripAuditFields(record: UnknownRecord) {
  const {
    artifactSha256: _artifactSha256,
    capturedAt: _capturedAt,
    sourceWindowEndedAt: _sourceWindowEndedAt,
    sourceWindowStartedAt: _sourceWindowStartedAt,
    ...rest
  } = record;

  return rest;
}

function toIsoStringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function getSanitizedNetworkEvidence(
  rawEvidence: Record<string, unknown> | null | undefined
): SanitizedNetworkEvidence | null {
  const candidate =
    rawEvidence?.sanitizedNetworkEvidence ??
    rawEvidence?.sanitized_network_evidence;

  return isRecord(candidate) ? (candidate as SanitizedNetworkEvidence) : null;
}

export function canonicalizeSanitizedNetworkEvidenceForHash(
  input: SanitizedNetworkEvidence | UnknownRecord
) {
  return JSON.stringify(cloneWithSortedKeys(stripAuditFields(input)));
}

export function hashSanitizedNetworkEvidence(
  input: SanitizedNetworkEvidence | UnknownRecord
) {
  return createHash("sha256")
    .update(canonicalizeSanitizedNetworkEvidenceForHash(input))
    .digest("hex");
}

export function buildSanitizedNetworkEvidenceAuditRecord(
  input: SanitizedNetworkEvidence | UnknownRecord,
  options?: {
    canonicalizationVersion?: string;
    capturedAt?: string;
    sourceWindowEndedAt?: string | null;
    sourceWindowStartedAt?: string | null;
  }
) {
  const canonicalizationVersion =
    options?.canonicalizationVersion ??
    (typeof input.canonicalizationVersion === "string" && input.canonicalizationVersion.trim().length > 0
      ? input.canonicalizationVersion
      : SANITIZED_NETWORK_EVIDENCE_CANONICALIZATION_VERSION);
  const capturedAt = options?.capturedAt ?? toIsoStringOrNull(input.capturedAt) ?? new Date().toISOString();
  const sourceWindowStartedAt =
    options?.sourceWindowStartedAt ?? toIsoStringOrNull(input.sourceWindowStartedAt);
  const sourceWindowEndedAt =
    options?.sourceWindowEndedAt ?? toIsoStringOrNull(input.sourceWindowEndedAt);
  const payload: SanitizedNetworkEvidence = {
    ...input,
    canonicalizationVersion
  };
  const artifactSha256 = hashSanitizedNetworkEvidence(payload);

  return {
    ...payload,
    artifactSha256,
    capturedAt,
    ...(sourceWindowStartedAt ? { sourceWindowStartedAt } : {}),
    ...(sourceWindowEndedAt ? { sourceWindowEndedAt } : {})
  };
}

export function hasSanitizedNetworkEvidenceHash(
  rawEvidence: Record<string, unknown> | null | undefined
) {
  const evidence = getSanitizedNetworkEvidence(rawEvidence);
  return typeof evidence?.artifactSha256 === "string" && evidence.artifactSha256.trim().length > 0;
}

export function getSanitizedNetworkEvidenceEntries(
  rawEvidence: Record<string, unknown> | null | undefined,
  options?: {
    runtimePhase?: string | null;
  }
) {
  const evidence = getSanitizedNetworkEvidence(rawEvidence);
  if (!Array.isArray(evidence?.entries)) {
    return [] as SanitizedNetworkEvidenceEntry[];
  }

  return evidence.entries.filter((entry): entry is SanitizedNetworkEvidenceEntry => {
    if (!isRecord(entry)) {
      return false;
    }

    if (
      options?.runtimePhase &&
      typeof entry.runtimePhase === "string" &&
      entry.runtimePhase !== options.runtimePhase
    ) {
      return false;
    }

    if (options?.runtimePhase && typeof entry.runtimePhase !== "string") {
      return false;
    }

    return true;
  });
}

export function hasConcreteSanitizedNetworkEvidence(
  rawEvidence: Record<string, unknown> | null | undefined,
  options?: {
    runtimePhase?: string | null;
  }
) {
  return getSanitizedNetworkEvidenceEntries(rawEvidence, options).some((entry) => {
    const hasRequest =
      typeof entry.requestUrlSanitized === "string" && entry.requestUrlSanitized.trim().length > 0;
    const hasVendor = typeof entry.matchedVendor === "string" && entry.matchedVendor.trim().length > 0;
    const hasUrl = typeof entry.pageUrl === "string" || typeof entry.sourceUrl === "string";
    return hasRequest || (hasVendor && hasUrl);
  });
}

export function getSanitizedNetworkEvidenceRequestUrls(
  rawEvidence: Record<string, unknown> | null | undefined,
  options?: {
    runtimePhase?: string | null;
  }
) {
  return [
    ...new Set(
      getSanitizedNetworkEvidenceEntries(rawEvidence, options)
        .map((entry) => entry.requestUrlSanitized)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    )
  ];
}

export function getSanitizedNetworkEvidenceVendors(
  rawEvidence: Record<string, unknown> | null | undefined,
  options?: {
    runtimePhase?: string | null;
  }
) {
  return [
    ...new Set(
      getSanitizedNetworkEvidenceEntries(rawEvidence, options)
        .map((entry) => entry.matchedVendor)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    )
  ];
}
