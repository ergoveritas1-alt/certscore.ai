import type { SharedScanConfig } from "@website-signal-risk-scanner/shared";
import {
  LOCAL_V2_DAG_LAMBDA_DISPATCH_ACCEPTED_EVENT_TYPE,
  LOCAL_V2_DAG_LAMBDA_DISPATCH_FAILED_EVENT_TYPE,
  LOCAL_V2_DAG_LAMBDA_DISPATCH_STARTED_EVENT_TYPE,
  LocalV2DagLambdaDispatchError,
  summarizeLocalV2DagLambdaDispatchForEvent
} from "./local-v2-dag-lambda-dispatch";
import { dispatchLocalV2DagSimulatedLambdaScan } from "./local-v2-dag-lambda-simulated-dispatch";
import { insertQueuedFullScanEvent, updateLocalV2DagLambdaDispatchState } from "./repository";

export type LocalV2DagDispatchContext = {
  domainId: string;
  localV2DagLambdaDispatch: NonNullable<ReturnType<typeof summarizeLocalV2DagLambdaDispatchForEvent>>;
  organizationId: string | null;
  scanConfig: SharedScanConfig | Record<string, unknown>;
  scanId: string;
  simulatedLocalLambda: boolean;
};

export async function runLocalV2DagDispatch(context: LocalV2DagDispatchContext): Promise<string | null> {
  if (!context.simulatedLocalLambda) {
    // The scan row is the transactional dispatch outbox. Its complete Lambda
    // intent and pending_dispatch state were committed together, and the
    // validation worker durably publishes that intent to regional FIFO SQS.
    // Do not make a second, ambiguous direct Lambda Invoke request here.
    console.info(JSON.stringify({
      awsRegion: context.localV2DagLambdaDispatch.awsRegion,
      event: "scan.lambda_dispatch_enqueued",
      scanId: context.scanId,
      transport: "sqs_fifo"
    }));
    return null;
  }

  try {
    await insertQueuedFullScanEvent({
      domainId: context.domainId,
      eventType: LOCAL_V2_DAG_LAMBDA_DISPATCH_STARTED_EVENT_TYPE,
      message: "Invoking local v2 DAG Lambda for artifact-only scan execution.",
      metadataJson: context.localV2DagLambdaDispatch,
      organizationId: context.organizationId,
      scanId: context.scanId
    });

    const dispatchResult = await dispatchLocalV2DagSimulatedLambdaScan({
      localCallbackUrl: null,
      scanConfig: context.scanConfig,
      scanId: context.scanId
    });
    const acceptancePersistenceStartedAtMs = Date.now();
    await updateLocalV2DagLambdaDispatchState({
      acceptedAt: new Date().toISOString(),
      dispatchState: "accepted",
      invocationRequestId: dispatchResult.invocationRequestId,
      scanId: context.scanId
    });
    const acceptancePersistenceMs = Date.now() - acceptancePersistenceStartedAtMs;
    const eventPersistenceStartedAtMs = Date.now();
    await insertQueuedFullScanEvent({
      domainId: context.domainId,
      eventType: LOCAL_V2_DAG_LAMBDA_DISPATCH_ACCEPTED_EVENT_TYPE,
      message: "Local simulated Lambda completed the v2 DAG artifact-only scan invocation.",
      metadataJson: {
        ...context.localV2DagLambdaDispatch,
        invocationRequestId: dispatchResult.invocationRequestId,
        invocationStatusCode: dispatchResult.invocationStatusCode,
        invocationType: dispatchResult.invocationType,
        dispatchTimings: {
          ...dispatchResult.timings,
          acceptancePersistenceMs
        },
        simulatedLocalLambda: context.simulatedLocalLambda,
        productionFindingIntegration: false
      },
      organizationId: context.organizationId,
      scanId: context.scanId
    });
    console.info(JSON.stringify({
      ...dispatchResult.timings,
      acceptancePersistenceMs,
      event: "scan.lambda_dispatch_timing",
      eventPersistenceMs: Date.now() - eventPersistenceStartedAtMs,
      scanId: context.scanId
    }));
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Local v2 DAG Lambda dispatch failed.";
    const dispatchState = error instanceof LocalV2DagLambdaDispatchError ? error.dispatchState : "failed";
    try {
      await updateLocalV2DagLambdaDispatchState({ dispatchState, errorMessage: message, scanId: context.scanId });
      await insertQueuedFullScanEvent({
        domainId: context.domainId,
        eventType: LOCAL_V2_DAG_LAMBDA_DISPATCH_FAILED_EVENT_TYPE,
        message: "Local v2 DAG Lambda dispatch failed; no fallback scanner execution was started.",
        metadataJson: {
          ...context.localV2DagLambdaDispatch,
          errorMessage: message,
          dispatchState,
          dispatchTimings: error instanceof LocalV2DagLambdaDispatchError ? error.timings : null,
          productionFindingIntegration: false
        },
        organizationId: context.organizationId,
        scanId: context.scanId
      });
    } catch (persistenceError) {
      console.error("[web] local v2 DAG dispatch failure persistence failed", {
        dispatchError: message,
        persistenceError: persistenceError instanceof Error ? persistenceError.message : String(persistenceError),
        scanId: context.scanId
      });
    }
    return message;
  }
}
