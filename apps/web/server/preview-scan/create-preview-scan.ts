import { enqueueNanoSignalEnrichmentJob } from "../queue/validation-queue";
import type { ScanFrom } from "@website-signal-risk-scanner/shared";
import type { LocalV2DagScanProfile } from "../scans/local-v2-dag-scan-config";
import { getPreviewScanAvailability } from "./preview-scan-availability";
import { createPreviewScanRecord, findOrCreateAnonymousPreviewDomain } from "./preview-scan-repository";

export async function createPreviewScan(input: {
  hostname: string;
  localV2DagScanProfile?: LocalV2DagScanProfile | null;
  localV2DagRunViaLambda?: boolean | null;
  normalizedUrl: string;
  scanFrom?: ScanFrom;
}) {
  getPreviewScanAvailability();

  const domain = await findOrCreateAnonymousPreviewDomain(input.hostname, input.normalizedUrl);
  const scan = await createPreviewScanRecord({
    domainId: domain.id,
    hostname: domain.hostname,
    localV2DagScanProfile: input.localV2DagScanProfile,
    localV2DagRunViaLambda: input.localV2DagRunViaLambda,
    normalizedUrl: domain.normalized_url,
    scanFrom: input.scanFrom
  });

  await enqueueNanoSignalEnrichmentJob(scan.id).catch((error) => {
    console.error("[preview-scan] nano signal enrichment handoff failed", {
      error: error instanceof Error ? error.message : String(error),
      scanId: scan.id
    });
  });

  return {
    domain,
    scan
  };
}
