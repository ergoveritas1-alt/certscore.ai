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
  if (storageSummary?.originBoundProjection !== undefined) {
    const projection = preConsentBrowserStorageProjectionSchema.parse(storageSummary.originBoundProjection);
    if (projection.scanId !== input.scanId || projection.contractVersion !== "certscore.pre-consent-browser-storage-projection.v2") throw new Error("Invalid origin-bound storage projection");
    return projection;
  }
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

/** Called only at the verified retained-bundle boundary. Legacy URLs are request
 * URLs, not storage-origin proof; never promote them into exact identities. */
export function projectOriginBoundBrowserStorage(input: {
  snapshots: import("@certscore/contracts").StorageSnapshot[];
  scanId: string;
  sourceHash: string;
}): PreConsentBrowserStorageProjection | undefined {
  const snapshots = input.snapshots.map((snapshot, index) => ({ snapshot, index }))
    .filter(({ snapshot }) => snapshot.consentStateAtTime === "pre_consent");
  if (!snapshots.length || snapshots.some(({ snapshot }) => !snapshot.captureContext)) return undefined;
  const entries: Array<{ origin: string; storageType: "localStorage" | "sessionStorage"; key: string; capturedAtMs: number; evidenceRefs: string[] }> = [];
  const limitations = new Set<string>();
  const identities = new Set<string>();
  for (const { snapshot, index } of snapshots) {
    const context = snapshot.captureContext!;
    for (const storageType of ["localStorage", "sessionStorage"] as const) {
      if (!context[`${storageType}ReadComplete`]) limitations.add(`${storageType}_read_incomplete`);
      for (const key of snapshot[`${storageType}Keys`]) {
        const identity = JSON.stringify([context.origin, storageType, key]);
        if (identities.has(identity)) continue;
        if (key.length > 4096 || entries.filter(entry => entry.storageType === storageType).length >= 100) {
          limitations.add("storage_identity_limit_reached"); continue;
        }
        identities.add(identity);
        entries.push({ origin: context.origin, storageType, key, capturedAtMs: snapshot.capturedAtMs,
          evidenceRefs: [`CanonicalEvidenceBundle.json#storageSnapshots/${index}`] });
      }
    }
  }
  return preConsentBrowserStorageProjectionSchema.parse({
    contractVersion: "certscore.pre-consent-browser-storage-projection.v2",
    scanId: input.scanId, sourceHash: input.sourceHash, sourceLane: "runtime_evidence",
    consentState: "pre_interaction", valuesRedacted: true,
    assessmentStatus: entries.length ? "observed" : limitations.size ? "not_testable" : "not_observed",
    entries, localStorageKeys: [...new Set(entries.filter(entry => entry.storageType === "localStorage").map(entry => entry.key))],
    sessionStorageKeys: [...new Set(entries.filter(entry => entry.storageType === "sessionStorage").map(entry => entry.key))],
    retainedStorageSnapshotCount: snapshots.length,
    storageFirstObservedAtMs: Math.min(...snapshots.map(({ snapshot }) => snapshot.capturedAtMs)),
    evidenceRefs: ["CanonicalEvidenceBundle.json#storageSnapshots"], limitationKeys: [...limitations],
  });
}
