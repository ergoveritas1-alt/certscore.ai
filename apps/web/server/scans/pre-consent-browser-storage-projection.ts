import { createHash } from "node:crypto";
import {
  MAX_PRE_CONSENT_BROWSER_STORAGE_KEYS_PER_TYPE,
  PRE_CONSENT_BROWSER_STORAGE_PROJECTION_VERSION,
  preConsentBrowserStorageProjectionSchema,
  type PreConsentBrowserStorageProjection,
} from "@certscore/contracts";

import type { ScanDetailResponse } from "./get-scan-by-id";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boundedStorageKeys(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, MAX_PRE_CONSENT_BROWSER_STORAGE_KEYS_PER_TYPE);
}

export function buildPreConsentBrowserStorageProjection(input: {
  runtimeArtifacts: ScanDetailResponse["runtimeArtifacts"];
  scanId: string;
}): PreConsentBrowserStorageProjection {
  const artifacts = record(input.runtimeArtifacts);
  const storageSummary = record(artifacts?.storageSummary) ?? record(artifacts?.storage_summary);
  const retainedStorageSnapshotCountCandidate = finiteNumber(
    storageSummary?.retainedStorageSnapshotCount ??
    storageSummary?.retained_storage_snapshot_count
  );
  const retainedStorageSnapshotCount =
    retainedStorageSnapshotCountCandidate !== null &&
    Number.isInteger(retainedStorageSnapshotCountCandidate) &&
    retainedStorageSnapshotCountCandidate > 0
      ? retainedStorageSnapshotCountCandidate
      : 0;
  const checked = retainedStorageSnapshotCount > 0;
  const localStorageKeys = checked
    ? boundedStorageKeys(storageSummary?.localStorageKeys ?? storageSummary?.local_storage_keys)
    : [];
  const sessionStorageKeys = checked
    ? boundedStorageKeys(storageSummary?.sessionStorageKeys ?? storageSummary?.session_storage_keys)
    : [];
  const firstObservedAtCandidate = finiteNumber(
    storageSummary?.storageFirstObservedAtMs ?? storageSummary?.storage_first_observed_at_ms
  );
  const storageFirstObservedAtMs =
    checked &&
    firstObservedAtCandidate !== null &&
    Number.isInteger(firstObservedAtCandidate) &&
    firstObservedAtCandidate >= 0
      ? firstObservedAtCandidate
      : null;
  const assessmentStatus = !checked
    ? "not_testable"
    : localStorageKeys.length + sessionStorageKeys.length > 0
      ? "observed"
      : "not_observed";
  const hashInput = {
    assessmentStatus,
    consentState: "pre_interaction",
    localStorageKeys,
    retainedStorageSnapshotCount,
    sessionStorageKeys,
    storageFirstObservedAtMs,
  };
  const projection = {
    contractVersion: PRE_CONSENT_BROWSER_STORAGE_PROJECTION_VERSION,
    scanId: input.scanId,
    assessmentStatus,
    consentState: "pre_interaction",
    localStorageKeys,
    sessionStorageKeys,
    retainedStorageSnapshotCount,
    storageFirstObservedAtMs,
    valuesRedacted: true,
    evidenceRefs: checked
      ? ["CanonicalEvidenceBundle.json#storageSnapshots"]
      : [],
    limitationKeys: checked ? [] : ["storage_snapshot_not_retained"],
    sourceHash: createHash("sha256").update(JSON.stringify(hashInput)).digest("hex"),
    sourceLane: "runtime_evidence",
  };

  return preConsentBrowserStorageProjectionSchema.parse(projection);
}
