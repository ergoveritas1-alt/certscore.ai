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
  id?: string;
  message?: string | null;
  metadataJson?: unknown;
};

function parseTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deriveDisplayCreatedAt(input: {
  completedAt: string | null;
  createdAt: string;
  startedAt: string | null;
}) {
  const trustedLifecycleAt = input.startedAt ?? input.completedAt;
  if (!trustedLifecycleAt) {
    return input.createdAt;
  }

  const createdAtMs = parseTimestamp(input.createdAt);
  const trustedLifecycleAtMs = parseTimestamp(trustedLifecycleAt);
  if (createdAtMs === null || trustedLifecycleAtMs === null) {
    return input.createdAt;
  }

  const displayToleranceMs = 60 * 1000;
  if (createdAtMs <= trustedLifecycleAtMs + displayToleranceMs) {
    return input.createdAt;
  }

  return trustedLifecycleAt;
}

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
      SCAN_EVENT_TYPES.previewStarted
    ]).earliest;
  const completedAt =
    scan.completed_at ??
    getEventTimestampBounds(events, [
      SCAN_EVENT_TYPES.previewCompleted
    ]).latest;
  const failedAt =
    scan.status === "failed"
      ? scan.completed_at ?? scan.started_at ?? scan.created_at
      : getEventTimestampBounds(events, [
          SCAN_EVENT_TYPES.previewFailed
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
