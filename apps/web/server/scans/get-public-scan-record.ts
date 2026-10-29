import { getAnonymousScanByIdForReadOnlyProjection } from "./get-scan-by-id";
import { materializeLocalV2DagScanDetail } from "./local-v2-dag-report";
import { loadAnonymousPersistedScanReportProjection } from "./scan-report-projection";
import { hasTerminalReportPublicationFailure, requiresPersistedReportPublication } from "./report-publication-read-state";

export type PublicScanRecord = NonNullable<Awaited<ReturnType<typeof getAnonymousScanByIdForReadOnlyProjection>>>;

export async function getPublicScanRecord(scanId: string, options: { logPrefix?: string } = {}) {
  const persistedReportProjection = await loadAnonymousPersistedScanReportProjection({ scanId });
  if (persistedReportProjection) {
    return persistedReportProjection;
  }

  const scanRecord = await getAnonymousScanByIdForReadOnlyProjection(scanId);
  if (!scanRecord) return scanRecord;
  if (hasTerminalReportPublicationFailure(scanRecord) || requiresPersistedReportPublication(scanRecord) &&
      (scanRecord.scan.status === "completed" || scanRecord.scan.status === "completed_limited")) {
    // A read must not rebuild an unpublished modern report or expose its scores
    // through callers that only check the returned scan status.
    return {
      ...scanRecord,
      scan: { ...scanRecord.scan, status: hasTerminalReportPublicationFailure(scanRecord) ? "failed" : "finalizing" },
    };
  }
  if (scanRecord.scan.status !== "completed") {
    return scanRecord;
  }

  return materializeLocalV2DagScanDetail(scanRecord).catch((error) => {
    console.error(`${options.logPrefix ?? "[public-scan-record]"} local v2 artifact materialization failed`, {
      error: error instanceof Error ? error.message : String(error),
      scanId
    });
    return scanRecord;
  });
}
