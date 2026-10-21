import type { GpcImpactCapture } from "../../packages/certscore-contracts/src";
import type { durationServiceIndex } from "./gpc-duration-checkpoints";

type LedgerRow = NonNullable<GpcImpactCapture["requestLedger"]>["rows"][number];

export function simulateDurationQuietRule(offsetsMs: number[], quietMs: 2000 | 3000) {
  if (offsetsMs.some(offset => !Number.isFinite(offset) || offset < 0)) throw new Error("invalid_request_offset");
  let stopMs = 5000;
  for (const offset of [...offsetsMs].sort((first, second) => first - second)) {
    if (offset >= stopMs) break;
    stopMs = Math.max(stopMs, Math.min(15000, offset + quietMs));
  }
  return {stopMs, reachedCap: stopMs === 15000};
}

export function durationNovelEvidenceOffsets(rows: LedgerRow[], committedAtMs: number, index: ReturnType<typeof durationServiceIndex>) {
  const services = new Set<string>(), collection = new Set<string>();
  return [...rows].sort((first, second) => first.timestampMs - second.timestampMs).flatMap(row => {
    let novel = false;
    for (const hash of [...row.advertising, ...row.analytics]) {
      const service = index.get(hash);
      if (!service) throw new Error("unresolved_retained_service_identity");
      if (!services.has(service.key)) {services.add(service.key); novel = true;}
      if (row.collection && !collection.has(service.key)) {collection.add(service.key); novel = true;}
    }
    return novel ? [row.timestampMs - committedAtMs] : [];
  });
}
