import { LOCAL_V2_DAG_SCAN_PROCESSOR } from "./local-v2-dag-scan-config";

/** Operational read metadata; never evidence or part of a persisted report. */
export type ReportPublicationReadState = {
  requestStatus: string | null;
  snapshotPersisted: boolean;
  projectionVerified: boolean;
};

type PublicationRecord = {
  reportPublication?: ReportPublicationReadState;
  scan: { status?: string; scanConfigJson?: Record<string, unknown> | null };
  snapshot?: Record<string, unknown> | null;
  events?: readonly { eventType: string }[];
};

export function hasTerminalReportPublicationFailure(record: PublicationRecord) {
  return record.reportPublication?.requestStatus === "terminal_failure";
}

export function requiresPersistedReportPublication(record: PublicationRecord) {
  return record.scan.scanConfigJson?.processor === LOCAL_V2_DAG_SCAN_PROCESSOR ||
    record.reportPublication?.requestStatus != null ||
    record.events?.some(event => event.eventType === "v2_lambda_result.received") === true;
}

/** Read eligibility only: never computes, repairs, or publishes a report. */
export function reportPublicationResultState(record: PublicationRecord): "final" | "finalizing" | "failed" {
  if (hasTerminalReportPublicationFailure(record) || ["failed", "expired"].includes(record.scan.status ?? "")) {
    return "failed";
  }
  if (!["completed", "completed_limited"].includes(record.scan.status ?? "")) return "finalizing";
  const projectionStatus = record.snapshot?.report_projection_status;
  if (projectionStatus === "failed") return "failed";
  if (projectionStatus === "ready") {
    return requiresPersistedReportPublication(record) && record.reportPublication?.projectionVerified !== true
      ? "finalizing" : "final";
  }
  const score = record.snapshot?.certscore_overall;
  return !projectionStatus && !requiresPersistedReportPublication(record) &&
    record.reportPublication?.snapshotPersisted !== false && typeof score === "number" && Number.isFinite(score)
    ? "final" : "finalizing";
}

export function terminalReportPublicationError() {
  return {
    code: "report_publication_failed",
    message: "The scan completed, but its report could not be published.",
    retryable: false,
    retryAfterSeconds: null,
    recommendedNextAction: "Stop polling this scan. Review the publication failure or contact CertScore.ai support.",
  };
}
