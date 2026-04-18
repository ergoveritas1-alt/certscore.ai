import { enqueueNanoSignalEnrichmentJob } from "../queue/validation-queue";
import { getFullScanQueueAvailability } from "../queue/full-scan-queue";
import { createPreviewScanRecord, findOrCreateAnonymousPreviewDomain } from "./preview-scan-repository";

export async function createPreviewScan(input: { hostname: string; normalizedUrl: string }) {
  const scannerAvailability = await getFullScanQueueAvailability();
  if (!scannerAvailability.enabled) {
    throw new Error(scannerAvailability.reason ?? "Preview scanning is unavailable because the scanner service is not healthy.");
  }

  const domain = await findOrCreateAnonymousPreviewDomain(input.hostname, input.normalizedUrl);
  const scan = await createPreviewScanRecord({
    domainId: domain.id,
    hostname: domain.hostname,
    normalizedUrl: domain.normalized_url
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
