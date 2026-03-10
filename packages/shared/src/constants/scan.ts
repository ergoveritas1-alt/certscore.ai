import type { ScanStatus, ScanType } from "../types/entities";
import { SCAN_EVENT_TYPES } from "./queue";

export const DEFAULT_FULL_SCAN_PAGE_CAP = 10;
export const DEFAULT_PREVIEW_PAGE_CAP = 1;
export const DEFAULT_SCORE_VERSION = "v1";

export const SCAN_TYPES = ["preview", "full", "scheduled"] as const satisfies readonly ScanType[];
export const SCAN_STATUSES = ["queued", "running", "completed", "failed"] as const satisfies readonly ScanStatus[];

export const PREVIEW_SCAN_EVENT_TYPES = {
  queued: SCAN_EVENT_TYPES.previewQueued,
  started: SCAN_EVENT_TYPES.previewStarted,
  completed: SCAN_EVENT_TYPES.previewCompleted,
  failed: SCAN_EVENT_TYPES.previewFailed
} as const;

export const FULL_SCAN_EVENT_TYPES = {
  queued: SCAN_EVENT_TYPES.fullQueued,
  started: SCAN_EVENT_TYPES.fullStarted,
  running: SCAN_EVENT_TYPES.fullRunning,
  completed: SCAN_EVENT_TYPES.fullCompleted,
  failed: SCAN_EVENT_TYPES.fullFailed
} as const;
