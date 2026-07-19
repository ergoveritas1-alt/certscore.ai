import { enqueueNanoSignalEnrichmentJob } from "../queue/validation-queue";
import type { ScanFrom } from "@website-signal-risk-scanner/shared";
import type { LocalV2DagScanProfile } from "../scans/local-v2-dag-scan-config";
import { getPreviewScanAvailability } from "./preview-scan-availability";
import { createPreviewScanRecord, findOrCreateAnonymousPreviewDomain } from "./preview-scan-repository";
import { insertPreviewScanEvent, setPreviewDomainLatestScan } from "./db";
import { updateLocalV2DagLambdaDispatchState } from "../scans/repository";
import {
  LOCAL_V2_DAG_LAMBDA_DISPATCH_ACCEPTED_EVENT_TYPE,
  LOCAL_V2_DAG_LAMBDA_DISPATCH_FAILED_EVENT_TYPE,
  LOCAL_V2_DAG_LAMBDA_DISPATCH_REQUESTED_EVENT_TYPE,
  LOCAL_V2_DAG_LAMBDA_DISPATCH_STARTED_EVENT_TYPE,
  LocalV2DagLambdaDispatchError,
  dispatchLocalV2DagLambdaScan,
  isLocalV2DagLambdaIntentSimulated,
  summarizeLocalV2DagLambdaDispatchForEvent
} from "../scans/local-v2-dag-lambda-dispatch";
import { dispatchLocalV2DagSimulatedLambdaScan } from "../scans/local-v2-dag-lambda-simulated-dispatch";

export async function createPreviewScan(input: {
  clientRequestId?: string | null;
  hostname: string;
  localV2DagScanProfile?: LocalV2DagScanProfile | null;
  localV2DagRunViaLambda?: boolean | null;
  normalizedUrl: string;
  scanFrom?: ScanFrom;
}) {
  getPreviewScanAvailability();

  const domain = await findOrCreateAnonymousPreviewDomain(input.hostname, input.normalizedUrl);
  const scan = await createPreviewScanRecord({
    clientRequestId: input.clientRequestId,
    domainId: domain.id,
    hostname: domain.hostname,
    localV2DagScanProfile: input.localV2DagScanProfile,
    localV2DagRunViaLambda: input.localV2DagRunViaLambda,
    normalizedUrl: domain.normalized_url,
    scanFrom: input.scanFrom
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
    await insertPreviewScanEvent({
      domainId: domain.id,
      eventType: LOCAL_V2_DAG_LAMBDA_DISPATCH_STARTED_EVENT_TYPE,
      message: "Invoking v2 DAG Lambda for preview scan execution.",
      metadata: lambdaDispatch,
      scanId: scan.id
    });

    try {
      const dispatchResult = await (simulatedLocalLambda
        ? dispatchLocalV2DagSimulatedLambdaScan
        : dispatchLocalV2DagLambdaScan)({
        localCallbackUrl: null,
        scanConfig,
        scanId: scan.id
      });
      await updateLocalV2DagLambdaDispatchState({
        acceptedAt: new Date().toISOString(),
        dispatchState: "accepted",
        invocationRequestId: dispatchResult.invocationRequestId,
        scanId: scan.id
      });
      await insertPreviewScanEvent({
        domainId: domain.id,
        eventType: LOCAL_V2_DAG_LAMBDA_DISPATCH_ACCEPTED_EVENT_TYPE,
        message: simulatedLocalLambda
          ? "Local simulated Lambda completed the preview scan invocation."
          : "AWS Lambda accepted the preview scan invocation.",
        metadata: {
          ...lambdaDispatch,
          invocationRequestId: dispatchResult.invocationRequestId,
          invocationStatusCode: dispatchResult.invocationStatusCode,
          invocationType: dispatchResult.invocationType,
          dispatchTimings: dispatchResult.timings,
          simulatedLocalLambda
        },
        scanId: scan.id
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Preview scan Lambda dispatch failed.";
      const dispatchState = error instanceof LocalV2DagLambdaDispatchError ? error.dispatchState : "failed";
      await updateLocalV2DagLambdaDispatchState({ dispatchState, errorMessage: message, scanId: scan.id });
      await insertPreviewScanEvent({
        domainId: domain.id,
        eventType: LOCAL_V2_DAG_LAMBDA_DISPATCH_FAILED_EVENT_TYPE,
        message: "Preview scan Lambda dispatch failed; no fallback scanner execution was started.",
        metadata: {
          ...lambdaDispatch,
          dispatchState,
          errorMessage: message,
          dispatchTimings: error instanceof LocalV2DagLambdaDispatchError ? error.timings : null
        },
        scanId: scan.id
      });
      throw error;
    }
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
