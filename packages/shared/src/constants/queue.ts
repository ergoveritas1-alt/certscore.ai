import type { ScanStatus } from "../types/entities";

export const SCAN_JOB_TYPES = {
  previewScan: "preview_scan",
  fullScan: "full_scan",
  scheduledScan: "scheduled_scan"
} as const;

export const QUEUE_NAMES = {
  previewScan: SCAN_JOB_TYPES.previewScan,
  fullScan: SCAN_JOB_TYPES.fullScan,
  scheduledScan: SCAN_JOB_TYPES.scheduledScan
} as const;

export const PREVIEW_SCAN_JOB = SCAN_JOB_TYPES.previewScan;
export const FULL_SCAN_JOB = SCAN_JOB_TYPES.fullScan;
export const SCHEDULED_SCAN_JOB = SCAN_JOB_TYPES.scheduledScan;

export const QUEUE_JOB_NAMES = Object.values(SCAN_JOB_TYPES);
export const SCAN_STATUS = ["queued", "running", "completed", "failed"] as const satisfies readonly ScanStatus[];

export const SCAN_EVENT_TYPES = {
  previewQueued: "preview_scan.queued",
  previewStarted: "preview_scan.started",
  previewCompleted: "preview_scan.completed",
  previewFailed: "preview_scan.failed",
  fullQueued: "full_scan.queued",
  fullStarted: "full_scan.started",
  fullRunning: "full_scan.running",
  fullCompleted: "full_scan.completed",
  fullFailed: "full_scan.failed",
  crawlStarted: "crawl.started",
  homepageLoaded: "crawl.homepage_loaded",
  pageDiscoveryCompleted: "crawl.page_discovery_completed",
  pageDiscoveryFailed: "crawl.page_discovery_failed",
  accessibilityAuditStarted: "accessibility.audit_started",
  accessibilityPageAudited: "accessibility.page_audited",
  accessibilityAuditCompleted: "accessibility.audit_completed",
  accessibilityPageFailed: "accessibility.page_failed",
  privacyAuditStarted: "privacy.audit_started",
  privacyPageAudited: "privacy.page_audited",
  privacyAuditCompleted: "privacy.audit_completed",
  privacyPageFailed: "privacy.page_failed",
  legalAuditStarted: "legal.audit_started",
  policyDetectionCompleted: "legal.policy_detection_completed",
  policyContentCheckCompleted: "legal.policy_content_check_completed",
  ftcSignalAuditCompleted: "legal.ftc_signal_audit_completed",
  legalAuditCompleted: "legal.audit_completed",
  legalAuditFailed: "legal.audit_failed",
  signalsPersisted: "signals.persisted",
  regressionStarted: "regression.started",
  regressionCompleted: "regression.completed",
  regressionFailed: "regression.failed",
  scheduleSweepStarted: "schedule.sweep_started",
  scheduleSweepCompleted: "schedule.sweep_completed",
  scheduleSweepFailed: "schedule.sweep_failed",
  scheduledScanEnqueued: "scheduled_scan.enqueued",
  scheduledScanSkippedExistingActiveScan: "scheduled_scan.skipped_existing_active_scan",
  scheduledQueued: "scheduled_scan.queued",
  changesComputed: "signals.changes_computed"
} as const;
