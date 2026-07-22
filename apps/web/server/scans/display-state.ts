import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";

export type ScanDisplayStateInput = {
  completed_at: string | Date | null;
  created_at: string | Date;
  scan_type: string;
  started_at: string | Date | null;
  status: string;
};

export type ScanDisplayStateEvent = {
  createdAt: string;
  eventType: string;
  id?: string;
  message?: string | null;
  metadataJson?: unknown;
};

function normalizeTimestamp(value: string | Date | null) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  return value;
}

function parseTimestamp(value: string | Date | null) {
  const normalized = normalizeTimestamp(value);
  if (!normalized) {
    return null;
  }

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deriveDisplayCreatedAt(input: {
  completedAt: string | Date | null;
  createdAt: string | Date;
  startedAt: string | Date | null;
}) {
  const createdAt = normalizeTimestamp(input.createdAt) ?? String(input.createdAt);
  const trustedLifecycleAt = normalizeTimestamp(input.startedAt ?? input.completedAt);
  if (!trustedLifecycleAt) {
    return createdAt;
  }

  const createdAtMs = parseTimestamp(createdAt);
  const trustedLifecycleAtMs = parseTimestamp(trustedLifecycleAt);
  if (createdAtMs === null || trustedLifecycleAtMs === null) {
    return createdAt;
  }

  const displayToleranceMs = 60 * 1000;
  if (createdAtMs <= trustedLifecycleAtMs + displayToleranceMs) {
    return createdAt;
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
  const completedAt = normalizeTimestamp(scan.completed_at);
  const startedAt = normalizeTimestamp(scan.started_at);
  const createdAt = normalizeTimestamp(scan.created_at) ?? String(scan.created_at);
  if (scan.scan_type !== "preview") {
    return {
      completedAt,
      startedAt,
      status: scan.status
    };
  }

  const previewStartedAt =
    startedAt ??
    getEventTimestampBounds(events, [
      SCAN_EVENT_TYPES.previewStarted
    ]).earliest;
  const previewCompletedAt =
    completedAt ??
    getEventTimestampBounds(events, [
      SCAN_EVENT_TYPES.previewCompleted
    ]).latest;
  const failedAt =
    scan.status === "failed"
      ? completedAt ?? startedAt ?? createdAt
      : getEventTimestampBounds(events, [
          SCAN_EVENT_TYPES.previewFailed
        ]).latest;
  const status =
    failedAt ? "failed" :
    previewCompletedAt ? "completed" :
    previewStartedAt ? "running" :
    scan.status;

  return {
    completedAt: previewCompletedAt,
    startedAt: previewStartedAt,
    status
  };
}
