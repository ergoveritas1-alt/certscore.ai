import type { ScanStatus } from "../types/entities";

export const SCAN_JOB_TYPES = {
  previewScan: "preview_scan",
  fullScan: "full_scan",
  scheduledScan: "scheduled_scan",
  validationCollect: "validation_collect",
  validationRank: "validation_rank",
  validationVerdict: "validation_verdict"
} as const;

export const QUEUE_NAMES = {
  previewScan: SCAN_JOB_TYPES.previewScan,
  fullScan: SCAN_JOB_TYPES.fullScan,
  scheduledScan: SCAN_JOB_TYPES.scheduledScan,
  validationCollect: SCAN_JOB_TYPES.validationCollect,
  validationRank: SCAN_JOB_TYPES.validationRank,
  validationVerdict: SCAN_JOB_TYPES.validationVerdict
} as const;

export const PREVIEW_SCAN_JOB = SCAN_JOB_TYPES.previewScan;
export const FULL_SCAN_JOB = SCAN_JOB_TYPES.fullScan;
export const SCHEDULED_SCAN_JOB = SCAN_JOB_TYPES.scheduledScan;
export const VALIDATION_COLLECT_JOB = SCAN_JOB_TYPES.validationCollect;
export const VALIDATION_RANK_JOB = SCAN_JOB_TYPES.validationRank;
export const VALIDATION_VERDICT_JOB = SCAN_JOB_TYPES.validationVerdict;

export const QUEUE_JOB_NAMES = Object.values(SCAN_JOB_TYPES);
export const SCAN_STATUS = ["queued", "running", "completed", "failed"] as const satisfies readonly ScanStatus[];

export const SCAN_EVENT_TYPES = {
  scannerHeartbeat: "scanner.runtime_heartbeat",
  previewQueued: "preview_scan.queued",
  previewStarted: "preview_scan.started",
  previewCompleted: "preview_scan.completed",
  previewFailed: "preview_scan.failed",
  fullQueued: "full_scan.queued",
  fullStarted: "full_scan.started",
  fullRunning: "full_scan.running",
  fullCompleted: "full_scan.completed",
  fullFailed: "full_scan.failed",
  fullWorkerHeartbeat: "full_scan.worker_heartbeat",
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
  policyLlmChunkDiagnostic: "legal.policy_llm_chunk_diagnostic",
  trackerVendorDiagnostic: "tracker.vendor_detection_diagnostic",
  ftcSignalAuditCompleted: "legal.ftc_signal_audit_completed",
  legalAuditCompleted: "legal.audit_completed",
  legalAuditFailed: "legal.audit_failed",
  accessLimitationsDetected: "access.limitations_detected",
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
  changesComputed: "signals.changes_computed",
  validationRunQueued: "validation.run_queued",
  validationRunStarted: "validation.run_started",
  validationTargetClaimed: "validation.target_claimed",
  validationClaimed: "validation.claimed",
  validationPipelinePaused: "validation.pipeline_paused",
  validationPipelineResumed: "validation.pipeline_resumed",
  validationModeChanged: "validation.mode_changed",
  validationIntervalChanged: "validation.interval_changed",
  validationCollectQueued: "validation.collect_queued",
  validationCollectStarted: "validation.collect_started",
  validationCollectCompleted: "validation.collect_completed",
  validationRankStarted: "validation.rank_started",
  validationRankCompleted: "validation.rank_completed",
  validationVerdictStarted: "validation.verdict_started",
  validationVerdictCompleted: "validation.verdict_completed",
  validationVerdictFailed: "validation.verdict_failed",
  nanoSignalEnrichmentStarted: "signals.nano_doc_enrichment_started",
  nanoSignalEnrichmentCompleted: "signals.nano_doc_enrichment_completed",
  nanoSignalEnrichmentFailed: "signals.nano_doc_enrichment_failed",
  signalMergeStarted: "signals.merge_started",
  signalMergeCompleted: "signals.merge_completed",
  signalMergeFailed: "signals.merge_failed",
  unifiedFindingsDerivedStarted: "findings.unified_derivation_started",
  unifiedFindingsDerivedCompleted: "findings.unified_derivation_completed",
  unifiedFindingsDerivedFailed: "findings.unified_derivation_failed",
  validationRunCompleted: "validation.run_completed",
  validationRunFailed: "validation.run_failed"
} as const;
