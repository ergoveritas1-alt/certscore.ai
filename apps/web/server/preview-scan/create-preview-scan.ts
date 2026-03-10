import { PREVIEW_SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import {
  createPreviewScanRecord,
  findOrCreateAnonymousPreviewDomain,
  insertScanEvent,
  updatePreviewScan
} from "./preview-scan-repository";
import { enqueuePreviewScanJob } from "../queue/preview-scan-queue";

export async function createPreviewScan(input: { hostname: string; normalizedUrl: string }) {
  const domain = await findOrCreateAnonymousPreviewDomain(input.hostname, input.normalizedUrl);
  const scan = await createPreviewScanRecord({
    domainId: domain.id,
    hostname: domain.hostname,
    normalizedUrl: domain.normalized_url
  });

  void enqueuePreviewScanJob(scan.id).catch(async (queueError) => {
    const message = queueError instanceof Error ? queueError.message : "Unknown preview queue error";

    await updatePreviewScan(scan.id, {
      error_message: message,
      status: "failed"
    });

    await insertScanEvent({
      domainId: domain.id,
      eventType: PREVIEW_SCAN_EVENT_TYPES.failed,
      message: "Preview scan queue handoff failed.",
      metadata: {
        error: message
      },
      organizationId: null,
      scanId: scan.id
    });
  });

  return {
    domain,
    scan
  };
}
