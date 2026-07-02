import { getAnonymousScanById } from "./get-scan-by-id";
import { materializeLocalV2DagScanDetail } from "./local-v2-dag-report";

export type PublicScanRecord = NonNullable<Awaited<ReturnType<typeof getAnonymousScanById>>>;

export async function getPublicScanRecord(scanId: string, options: { logPrefix?: string } = {}) {
  const scanRecord = await getAnonymousScanById(scanId).catch(() => null);
  if (!scanRecord || scanRecord.scan.status !== "completed") {
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
