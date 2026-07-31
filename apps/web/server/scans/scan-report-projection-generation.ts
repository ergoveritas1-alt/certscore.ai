import type { ScanDetailResponse } from "./get-scan-by-id";

export type ScanReportProjectionGeneration = {
  eventCount: number;
  latestEventId: string | null;
};

export function getScanReportProjectionGeneration(
  scanRecord: Pick<ScanDetailResponse, "events">
): ScanReportProjectionGeneration {
  const latestEvent = scanRecord.events.reduce<(typeof scanRecord.events)[number] | null>(
    (latest, event) => {
      if (!latest) return event;
      if (event.createdAt > latest.createdAt) return event;
      if (event.createdAt === latest.createdAt && event.id > latest.id) return event;
      return latest;
    },
    null
  );
  return {
    eventCount: scanRecord.events.length,
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
