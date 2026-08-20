import { enqueueNanoSignalEnrichmentJob } from "../queue/validation-queue";
import type { ScanFrom } from "@website-signal-risk-scanner/shared";
import type { CampaignAttribution } from "../../lib/attribution/campaign-attribution";
import type { LocalV2DagScanProfile } from "../scans/local-v2-dag-scan-config";
import { getPreviewScanAvailability } from "./preview-scan-availability";
import { createPreviewScanRecord, findOrCreateAnonymousPreviewDomain } from "./preview-scan-repository";
import { insertPreviewScanEvent, setPreviewDomainLatestScan } from "./db";
import {
  LOCAL_V2_DAG_LAMBDA_DISPATCH_REQUESTED_EVENT_TYPE,
  isLocalV2DagLambdaIntentSimulated,
  summarizeLocalV2DagLambdaDispatchForEvent
} from "../scans/local-v2-dag-lambda-dispatch";
import { runLocalV2DagDispatch } from "../scans/local-v2-dag-dispatch-runner";
import { requireDomainDns } from "../domains/domain-dns";

export async function createPreviewScan(input: {
  clientRequestId?: string | null;
  campaignAttribution?: CampaignAttribution | null;
  hostname: string;
  localV2DagScanProfile?: LocalV2DagScanProfile | null;
  localV2DagRunViaLambda?: boolean | null;
  normalizedUrl: string;
  scanFrom?: ScanFrom;
}) {
  getPreviewScanAvailability();
  await requireDomainDns(input.hostname);

  const domain = await findOrCreateAnonymousPreviewDomain(input.hostname, input.normalizedUrl);
  const scan = await createPreviewScanRecord({
    clientRequestId: input.clientRequestId,
    domainId: domain.id,
    hostname: domain.hostname,
    localV2DagScanProfile: input.localV2DagScanProfile,
    localV2DagRunViaLambda: input.localV2DagRunViaLambda,
    normalizedUrl: domain.normalized_url,
    scanFrom: input.scanFrom,
    campaignAttribution: input.campaignAttribution
  });

  const scanConfig = scan.scan_config_json;
  const lambdaDispatch = summarizeLocalV2DagLambdaDispatchForEvent(scanConfig);
  if (lambdaDispatch) {
    const simulatedLocalLambda = isLocalV2DagLambdaIntentSimulated(scanConfig);
    await insertPreviewScanEvent({
      domainId: domain.id,
      eventType: LOCAL_V2_DAG_LAMBDA_DISPATCH_REQUESTED_EVENT_TYPE,
      message: "Preview scan requested v2 DAG Lambda execution.",
      metadata: lambdaDispatch,
      scanId: scan.id
    });
    const dispatchError = await runLocalV2DagDispatch({
      domainId: domain.id,
      localV2DagLambdaDispatch: lambdaDispatch,
      organizationId: null,
      scanConfig,
      scanId: scan.id,
      simulatedLocalLambda
    });
    if (dispatchError) throw new Error(dispatchError);
  }

  await setPreviewDomainLatestScan(domain.id, scan.id);

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
