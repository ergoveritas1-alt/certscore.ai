import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";

export const LEGACY_CHANGE_EVENT_TYPES = [
  "signal_added",
  "signal_removed",
  "signal_changed",
  "tracker_detected",
  "tracker_removed"
] as const;

export type LegacyChangeCounts = {
  addedCount: number;
  removedCount: number;
  changedCount: number;
  trackerDetectedCount: number;
  trackerRemovedCount: number;
};

export type LegacyScanEventRow = {
  created_at: string;
  event_type: string;
  id: string;
  message: string;
  metadata_json: Record<string, unknown> | null;
  scan_id: string | null;
};

const EMPTY_COUNTS: LegacyChangeCounts = {
  addedCount: 0,
  removedCount: 0,
  changedCount: 0,
  trackerDetectedCount: 0,
  trackerRemovedCount: 0
};

function coerceCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseLegacySummary(metadata: Record<string, unknown> | null): LegacyChangeCounts | null {
  if (!metadata) {
    return null;
  }

  const addedCount = coerceCount(metadata.addedCount);
  const removedCount = coerceCount(metadata.removedCount);
  const changedCount = coerceCount(metadata.changedCount);
  const trackerDetectedCount = coerceCount(metadata.trackerDetectedCount);
  const trackerRemovedCount = coerceCount(metadata.trackerRemovedCount);

  if (
    addedCount === null &&
    removedCount === null &&
    changedCount === null &&
    trackerDetectedCount === null &&
    trackerRemovedCount === null
  ) {
    return null;
  }

  return {
    addedCount: addedCount ?? 0,
    removedCount: removedCount ?? 0,
    changedCount: changedCount ?? 0,
    trackerDetectedCount: trackerDetectedCount ?? 0,
    trackerRemovedCount: trackerRemovedCount ?? 0
  };
}

export function isMissingComplianceChangeEventsTable(error: {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
} | null) {
  if (!error) {
    return false;
  }

  const text = [error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();
  return text.includes("compliance_change_events") && (text.includes("schema cache") || text.includes("does not exist"));
}

export function summarizeLegacyChangeEvents(events: LegacyScanEventRow[]) {
  const summaryMap = new Map<string, LegacyChangeCounts>();
  const detailMap = new Map<string, LegacyChangeCounts>();

  for (const event of events) {
    if (!event.scan_id) {
      continue;
    }

    if (event.event_type === SCAN_EVENT_TYPES.changesComputed) {
      const summary = parseLegacySummary(event.metadata_json);

      if (summary && !summaryMap.has(event.scan_id)) {
        summaryMap.set(event.scan_id, summary);
      }

      continue;
    }

    const bucket = detailMap.get(event.scan_id) ?? { ...EMPTY_COUNTS };

    if (event.event_type === "tracker_detected") {
      bucket.addedCount += 1;
      bucket.trackerDetectedCount += 1;
    } else if (event.event_type === "tracker_removed") {
      bucket.removedCount += 1;
      bucket.trackerRemovedCount += 1;
    } else if (event.event_type === "signal_added") {
      bucket.addedCount += 1;
    } else if (event.event_type === "signal_removed") {
      bucket.removedCount += 1;
    } else if (event.event_type === "signal_changed") {
      bucket.changedCount += 1;
    }

    detailMap.set(event.scan_id, bucket);
  }

  return new Map<string, LegacyChangeCounts>(
    [...new Set([...summaryMap.keys(), ...detailMap.keys()])].map((scanId) => [scanId, summaryMap.get(scanId) ?? detailMap.get(scanId) ?? { ...EMPTY_COUNTS }])
  );
}
