import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";

export type ScanDisplayStateInput = {
  completed_at: string | null;
  created_at: string;
  scan_type: string;
  started_at: string | null;
  status: string;
};

export type ScanDisplayStateEvent = {
  createdAt: string;
  eventType: string;
};

function getEventTimestampBounds(events: ScanDisplayStateEvent[], eventTypes: string[]) {
  const timestamps = events
    .filter((event) => eventTypes.includes(event.eventType))
    .map((event) => event.createdAt)
    .filter((value) => value.length > 0)
    .sort((left, right) => left.localeCompare(right));

  return {
    earliest: timestamps[0] ?? null,
    latest: timestamps.at(-1) ?? null
  };
}

export function deriveScanDisplayState(scan: ScanDisplayStateInput, events: ScanDisplayStateEvent[]) {
  if (scan.scan_type !== "preview") {
    return {
      completedAt: scan.completed_at,
      startedAt: scan.started_at,
      status: scan.status
    };
  }

  const startedAt =
    scan.started_at ??
    getEventTimestampBounds(events, [
      SCAN_EVENT_TYPES.previewStarted,
      SCAN_EVENT_TYPES.nanoDocRetrievalStarted,
      SCAN_EVENT_TYPES.nanoSignalEnrichmentStarted,
      SCAN_EVENT_TYPES.signalMergeStarted,
      SCAN_EVENT_TYPES.unifiedFindingsDerivedStarted
    ]).earliest;
  const completedAt =
    scan.completed_at ??
    getEventTimestampBounds(events, [
      SCAN_EVENT_TYPES.previewCompleted,
      SCAN_EVENT_TYPES.signalMergeCompleted,
      SCAN_EVENT_TYPES.unifiedFindingsDerivedCompleted
    ]).latest;
  const failedAt =
    scan.status === "failed"
      ? scan.completed_at ?? scan.started_at ?? scan.created_at
      : getEventTimestampBounds(events, [
          SCAN_EVENT_TYPES.previewFailed,
          SCAN_EVENT_TYPES.nanoDocRetrievalFailed,
          SCAN_EVENT_TYPES.nanoSignalEnrichmentFailed,
          SCAN_EVENT_TYPES.signalMergeFailed,
          SCAN_EVENT_TYPES.unifiedFindingsDerivedFailed
        ]).latest;
  const status =
    failedAt ? "failed" :
    completedAt ? "completed" :
    startedAt ? "running" :
    scan.status;

  return {
    completedAt,
    startedAt,
    status
  };
}
