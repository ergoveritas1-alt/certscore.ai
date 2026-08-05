import { getAnonymousScanById } from "./get-scan-by-id";
import { materializeLocalV2DagScanDetail } from "./local-v2-dag-report";
import { getPersistedScanReportProjection } from "./scan-report-projection";

export type PublicScanRecord = NonNullable<Awaited<ReturnType<typeof getAnonymousScanById>>>;

export async function getPublicScanRecord(scanId: string, options: { logPrefix?: string } = {}) {
  const scanRecord = await getAnonymousScanById(scanId).catch(() => null);
  if (!scanRecord || scanRecord.scan.status !== "completed") {
    return scanRecord;
  }

  const persistedReportProjection = getPersistedScanReportProjection(scanRecord);
  if (persistedReportProjection) {
    return {
      ...persistedReportProjection,
      snapshot: {
        ...persistedReportProjection.snapshot,
        report_projection_computed_at: scanRecord.snapshot?.report_projection_computed_at,
        report_projection_source_hash: scanRecord.snapshot?.report_projection_source_hash,
        report_projection_status: scanRecord.snapshot?.report_projection_status,
        report_projection_version: scanRecord.snapshot?.report_projection_version
      }
    };
  }

  return materializeLocalV2DagScanDetail(scanRecord).catch((error) => {
    console.error(`${options.logPrefix ?? "[public-scan-record]"} local v2 artifact materialization failed`, {
      error: error instanceof Error ? error.message : String(error),
      scanId
    });
    return scanRecord;
  });
}
