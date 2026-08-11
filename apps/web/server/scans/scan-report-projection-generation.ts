import type { ScanDetailResponse } from "./get-scan-by-id";

// These events retain internal review artifacts and diagnostics, but they are
// not inputs to normalized concerns, concern policy, unified findings, or the
// persisted customer-facing report. They therefore must not invalidate an
// otherwise canonical report projection while an independent evidence lane is
// completing its durable handoff.
export const SCAN_REPORT_PROJECTION_NON_SOURCE_EVENT_TYPES = [
  "v2_policy_evidence.received",
  "v2_policy_evidence.rejected"
] as const;

const scanReportProjectionNonSourceEventTypes = new Set<string>(
  SCAN_REPORT_PROJECTION_NON_SOURCE_EVENT_TYPES
);

export function isScanReportProjectionSourceEvent(eventType: string) {
  return !scanReportProjectionNonSourceEventTypes.has(eventType);
}

export type ScanReportProjectionGeneration = {
  eventCount: number;
  latestEventId: string | null;
};

export function getScanReportProjectionGeneration(
  scanRecord: Pick<ScanDetailResponse, "events">
): ScanReportProjectionGeneration {
  const sourceEvents = scanRecord.events.filter((event) =>
    isScanReportProjectionSourceEvent(event.eventType)
  );
  const latestEvent = sourceEvents.reduce<(typeof scanRecord.events)[number] | null>(
    (latest, event) => {
      if (!latest) return event;
      if (event.createdAt > latest.createdAt) return event;
      if (event.createdAt === latest.createdAt && event.id > latest.id) return event;
      return latest;
    },
    null
  );
  return {
    eventCount: sourceEvents.length,
    latestEventId: latestEvent?.id ?? null
  };
}

export function isSameScanReportProjectionGeneration(
  left: ScanReportProjectionGeneration,
  right: ScanReportProjectionGeneration
) {
  return left.eventCount === right.eventCount && left.latestEventId === right.latestEventId;
}

export function getCanonicalScanReportPublicationReadiness(input: {
  findingsReady: boolean;
  mergedSignalsReady: boolean;
  projectionRequired: boolean;
  scanStatus: string;
}) {
  if (input.scanStatus !== "completed" && input.scanStatus !== "completed_limited") {
    return { ready: false, reason: "scan_not_completed" } as const;
  }
  if (input.projectionRequired && (!input.mergedSignalsReady || !input.findingsReady)) {
    return { ready: false, reason: "canonical_findings_not_ready" } as const;
  }
  return { ready: true, reason: "canonical_inputs_ready" } as const;
}
