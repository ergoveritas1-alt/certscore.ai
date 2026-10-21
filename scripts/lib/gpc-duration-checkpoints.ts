import { createHash } from "node:crypto";
import type { CanonicalEvidenceBundle, GpcImpactCapture } from "../../packages/certscore-contracts/src";
import { gpcImpactIdentityHash } from "../../packages/certscore-scan-core/src/gpc-impact-capture";

type LedgerRow = NonNullable<GpcImpactCapture["requestLedger"]>["rows"][number];
type Service = { key: string; label: string; entityId?: string; entity?: string };

export function durationServiceIndex(bundles: CanonicalEvidenceBundle[]) {
  const index = new Map<string, Service>();
  for (const bundle of bundles) for (const vendor of bundle.normalizedVendorObservations) {
    const hash = createHash("sha256").update(JSON.stringify([vendor.vendor, vendor.product ?? "unspecified", vendor.purpose])).digest("hex");
    const service = {key: vendor.registryAttribution?.serviceId ?? hash,
      label: vendor.product ?? vendor.vendor, entityId: vendor.registryAttribution?.entityId, entity: vendor.entity};
    if (index.has(hash) && index.get(hash)!.key !== service.key) throw new Error("conflicting_retained_service_identity");
    index.set(hash, service);
  }
  return index;
}

export function verifyDurationCheckpoint(bundle: CanonicalEvidenceBundle, durationMs: 3000 | 5000 | 8000 | 10000 | 15000) {
  const capture = bundle.gpcImpactCapture;
  if (!capture?.document || !capture.requestLedger || capture.comparisonPolicy !== "page_http_signal.v2") throw new Error("compact_checkpoint_source_missing");
  const window = capture.windows.find(row => row.durationMs === durationMs);
  if (!window) throw new Error(`${durationMs}_checkpoint_missing`);
  const rows = capture.requestLedger.rows.filter(row => row.timestampMs >= capture.document!.committedAtMs && row.timestampMs < capture.document!.committedAtMs + durationMs);
  if (rows.length !== window.requestCount || new Set(rows.map(row => row.eventId)).size !== rows.length ||
    gpcImpactIdentityHash(rows) !== window.requestSetSha256 || rows.some(row => !row.headersVerified || row.secGpc !== (capture.expectedEnabled ? "1" : null)) ||
    (bundle.gpcSignalObservation?.capturedAtMs ?? -1) < capture.document.committedAtMs + durationMs) throw new Error(`${durationMs}_checkpoint_unverified`);
  return rows;
}

export function compareDurationRows(early: LedgerRow[], complete: LedgerRow[], index: Map<string, Service>) {
  const service = (hash: string) => {
    const retained = index.get(hash);
    if (!retained) throw new Error("unresolved_retained_service_identity");
    return retained;
  };
  const hashes = (row: LedgerRow) => [...row.advertising, ...row.analytics];
  const keys = (rows: LedgerRow[], collectionOnly = false) => new Set(rows.filter(row => !collectionOnly || row.collection).flatMap(row => hashes(row).map(hash => service(hash).key)));
  const before = keys(early), after = keys(complete), collectionBefore = keys(early, true), collectionAfter = keys(complete, true);
  const added = [...after].filter(key => !before.has(key));
  const firstCollection = [...collectionAfter].filter(key => !collectionBefore.has(key));
  const labels = new Map(complete.flatMap(row => hashes(row).map(hash => {const value = service(hash); return [value.key,value] as const;})));
  const earlyEventIds = new Set(early.map(row => row.eventId));
  const late = complete.filter(row => !earlyEventIds.has(row.eventId));
  const counts = (rows: LedgerRow[]) => ({requests: rows.length,
    advertisingRequests: rows.filter(row => row.advertising.length > 0).length,
    analyticsRequests: rows.filter(row => row.analytics.length > 0).length,
    collectionEndpointRequests: rows.filter(row => row.collection && hashes(row).length > 0).length,
    services: keys(rows).size});
  return {threeSeconds: counts(early), fiveSeconds: counts(complete),
    lateRequestCount: late.length, lateClassifiedRequestCount: late.filter(row => hashes(row).length > 0).length,
    newServices: added.map(key => labels.get(key)!), firstCollectionServices: firstCollection.map(key => labels.get(key)!),
    meaningful: added.length > 0 || firstCollection.length > 0,
    collectionEvidenceGain: firstCollection.length > 0,
    newServiceEvidenceGain: added.length > 0,
    repeatOnly: added.length === 0 && firstCollection.length === 0 && late.some(row => hashes(row).length > 0)};
}
