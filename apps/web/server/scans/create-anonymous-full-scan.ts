import {
  FULL_SCAN_EVENT_TYPES,
  SCAN_EVENT_TYPES,
  normalizeScanFrom,
  type PlanCode,
  type ScanFrom
} from "@website-signal-risk-scanner/shared";
import { getPlanLimits } from "../plans/get-plan-limits";
import { getFullScanQueueAvailability } from "../queue/full-scan-queue";
import { getFullScanQueueMetadata } from "../queue/scan-queue-priority";
import { enqueueNanoSignalEnrichmentJob } from "../queue/validation-queue";
import { ensureValidationRunForManualScan } from "../validation/manual-scan-handoff";
import { findOrCreateAnonymousPreviewDomain } from "../preview-scan/preview-scan-repository";
import { setPreviewDomainLatestScan } from "../preview-scan/db";
import { createQueuedFullScan, insertQueuedFullScanEvent, loadPriorScanAccelerationCandidate } from "./repository";
import { buildQueuedFullScanConfig } from "./full-scan-config";
import {
  LOCAL_V2_DAG_LAMBDA_DISPATCH_ACCEPTED_EVENT_TYPE,
  LOCAL_V2_DAG_LAMBDA_DISPATCH_FAILED_EVENT_TYPE,
  LOCAL_V2_DAG_LAMBDA_DISPATCH_REQUESTED_EVENT_TYPE,
  LOCAL_V2_DAG_LAMBDA_DISPATCH_STARTED_EVENT_TYPE,
  dispatchLocalV2DagLambdaScan,
  isLocalV2DagLambdaIntentSimulated,
  summarizeLocalV2DagLambdaDispatchForEvent
} from "./local-v2-dag-lambda-dispatch";
import {
  regionalRealIpEgressUnavailableMessage,
  requiresRegionalRealIpEgress,
  type LocalV2DagScanProfile
} from "./local-v2-dag-scan-config";
import { dispatchLocalV2DagSimulatedLambdaScan } from "./local-v2-dag-lambda-simulated-dispatch";
import { findRecentCompletedScanForDomain, RECENT_SCAN_REUSE_WINDOW_HOURS } from "./recent-scan-reuse";
import { logScanRequestFailure, recordScanRequest } from "./scan-request-log";

type ScanQueueProvenance = {
  githubActor?: string | null;
  githubRunId?: string | null;
  githubSha?: string | null;
  githubWorkflow?: string | null;
  host?: string | null;
  originIp?: string | null;
  source?: string | null;
  userAgent?: string | null;
};

export async function createAnonymousFullScan(input: {
  bypassRecentScanReuse?: boolean;
  coveragePlanCode?: PlanCode;
  hostname: string;
  localV2DagLambdaDebugOverrides?: import("./local-v2-dag-scan-config").LocalV2DagLambdaDebugOverrides | null;
  localV2DagScanProfile?: LocalV2DagScanProfile | null;
  localV2DagRunViaLambda?: boolean | null;
  minimumReusablePagesRequested?: number;
  normalizedUrl: string;
  provenance?: ScanQueueProvenance;
  scanFrom?: ScanFrom;
}) {
  const scanFrom = normalizeScanFrom(input.scanFrom);
  const coveragePlanCode = input.coveragePlanCode ?? "free";
  const planLimits = await getPlanLimits(coveragePlanCode);
  const pagesRequested = planLimits.maxPagesPerScan;
  const minimumReusablePagesRequested =
    typeof input.minimumReusablePagesRequested === "number" && Number.isFinite(input.minimumReusablePagesRequested)
      ? Math.floor(input.minimumReusablePagesRequested)
      : input.coveragePlanCode
        ? pagesRequested
        : undefined;
  const domain = await findOrCreateAnonymousPreviewDomain(input.hostname, input.normalizedUrl);
  const bypassRecentScanReuse = Boolean(input.bypassRecentScanReuse);

  if (!bypassRecentScanReuse) {
    const recentScan = await findRecentCompletedScanForDomain({
      normalizedDomain: input.hostname,
      normalizedUrl: input.normalizedUrl,
      organizationId: null,
      scanFrom,
      minPagesRequested: minimumReusablePagesRequested
    }).catch((error) => {
      console.error("[web] anonymous recent scan reuse lookup failed", {
        error: error instanceof Error ? error.message : String(error),
        domainId: domain.id
      });
      return null;
    });

    if (recentScan) {
      await recordScanRequest({
        fulfilledByScanId: recentScan.id,
        normalizedDomain: input.hostname,
        normalizedUrl: input.normalizedUrl,
        organizationId: null,
        requestChannel: input.provenance?.source ?? "marketing-anonymous-full-scan",
        requestedBy: { anonymous: true },
        requestedUrl: input.normalizedUrl,
        requestContext: {
          bypassRecentScanReuse,
          coveragePlanCode,
          localV2DagRunViaLambda: Boolean(input.localV2DagRunViaLambda),
          minimumReusablePagesRequested: minimumReusablePagesRequested ?? null,
          provenance: input.provenance ?? null,
          scanFrom
        },
        resolutionMode: "reused_existing_scan",
        reusedCompletedAt: recentScan.completedAt,
        reuseWindowHours: RECENT_SCAN_REUSE_WINDOW_HOURS,
        scanId: recentScan.id,
        status: "reused_recent_scan"
      }).catch((error) => logScanRequestFailure("anonymous_recent_scan_reuse", error));

      return {
        domain,
        reusedExistingScan: true as const,
        scan: { id: recentScan.id }
      };
    }
  }

  const fullScanQueueAvailability = await getFullScanQueueAvailability({
    allowDegradedScanner: process.env.FULL_SCAN_QUEUE_ALLOW_DEGRADED_HEARTBEAT === "true",
    scanFrom
  });

  if (!fullScanQueueAvailability.enabled) {
    await recordScanRequest({
      normalizedDomain: input.hostname,
      normalizedUrl: input.normalizedUrl,
      organizationId: null,
      requestChannel: input.provenance?.source ?? "marketing-anonymous-full-scan",
      requestedBy: { anonymous: true },
      requestedUrl: input.normalizedUrl,
      requestContext: {
        bypassRecentScanReuse,
        coveragePlanCode,
        localV2DagRunViaLambda: Boolean(input.localV2DagRunViaLambda),
        minimumReusablePagesRequested: minimumReusablePagesRequested ?? null,
        provenance: input.provenance ?? null,
        scanFrom
      },
      errorCode: "queue_unavailable",
      errorMessage: fullScanQueueAvailability.reason ?? "Full scan queue is unavailable.",
      resolutionMode: "queue_unavailable",
      status: "rejected"
    }).catch((error) => logScanRequestFailure("anonymous_queue_unavailable", error));

    throw new Error(fullScanQueueAvailability.reason ?? "Full scan queue is unavailable.");
  }

  const priorScanAcceleration = await loadPriorScanAccelerationCandidate({
    domainId: domain.id,
    normalizedUrl: domain.normalized_url,
    organizationId: null
  }).catch((error) => {
    console.error("[web] anonymous prior scan acceleration lookup failed", {
      error: error instanceof Error ? error.message : String(error),
      domainId: domain.id
    });
    return null;
  });
  const scanConfig = buildQueuedFullScanConfig({
    hostname: input.hostname,
    localV2DagLambdaDebugOverrides: input.localV2DagLambdaDebugOverrides,
    localV2DagScanProfile: input.localV2DagScanProfile,
    localV2DagRunViaLambda: input.localV2DagRunViaLambda,
    maxPages: pagesRequested,
    normalizedUrl: input.normalizedUrl,
    priorScanAcceleration,
    profile: planLimits.scanProfile,
    scanFrom,
    source: input.provenance?.source ?? "marketing-anonymous-full-scan"
  });
  const localV2DagLambdaDispatch = summarizeLocalV2DagLambdaDispatchForEvent(scanConfig);
  if (requiresRegionalRealIpEgress(scanFrom) && !localV2DagLambdaDispatch) {
    const message = regionalRealIpEgressUnavailableMessage(scanFrom);
    await recordScanRequest({
      normalizedDomain: input.hostname,
      normalizedUrl: input.normalizedUrl,
      organizationId: null,
      requestChannel: input.provenance?.source ?? "marketing-anonymous-full-scan",
      requestedBy: { anonymous: true },
      requestedUrl: input.normalizedUrl,
      requestContext: {
        bypassRecentScanReuse,
        coveragePlanCode,
        localV2DagRunViaLambda: Boolean(input.localV2DagRunViaLambda),
        minimumReusablePagesRequested: minimumReusablePagesRequested ?? null,
        pagesRequested,
        provenance: input.provenance ?? null,
        scanFrom
      },
      errorCode: "regional_real_ip_egress_unavailable",
      errorMessage: message,
      resolutionMode: "regional_real_ip_egress_unavailable",
      status: "rejected"
    }).catch((error) => logScanRequestFailure("anonymous_regional_real_ip_egress_unavailable", error));

    throw new Error(message);
  }
  const queueMetadata = getFullScanQueueMetadata({
    provenance: input.provenance,
    scanType: "full"
  });

  const scan = await createQueuedFullScan({
    domainId: domain.id,
    initialStatus: localV2DagLambdaDispatch ? "running" : "queued",
    organizationId: null,
    pagesRequested,
    queueOrigin: queueMetadata.queueOrigin,
    queuePriority: queueMetadata.queuePriority,
    scanConfigJson: scanConfig,
    submittedByUserId: null
  });

  await recordScanRequest({
    fulfilledByScanId: scan.id,
    normalizedDomain: input.hostname,
    normalizedUrl: input.normalizedUrl,
    organizationId: null,
    requestChannel: input.provenance?.source ?? "marketing-anonymous-full-scan",
    requestedBy: { anonymous: true },
    requestedUrl: input.normalizedUrl,
    requestContext: {
      bypassRecentScanReuse,
      coveragePlanCode,
      localV2DagRunViaLambda: Boolean(input.localV2DagRunViaLambda),
      minimumReusablePagesRequested: minimumReusablePagesRequested ?? null,
      pagesRequested,
      provenance: input.provenance ?? null,
      queueOrigin: queueMetadata.queueOrigin,
      queuePriority: queueMetadata.queuePriority,
      scanFrom
    },
    resolutionMode: "queued_new_scan",
    scanId: scan.id,
    status: "queued"
  }).catch((error) => logScanRequestFailure("anonymous_queued_new_scan", error));

  await insertQueuedFullScanEvent({
    domainId: domain.id,
    eventType: SCAN_EVENT_TYPES.priorScanAccelerationEvaluated,
    message: priorScanAcceleration
      ? "Prior scan acceleration metadata attached as non-evidence hints."
      : "No eligible prior scan acceleration metadata found.",
    metadataJson: {
      crawlSeedHintCount: priorScanAcceleration?.crawlSeedHints.length ?? 0,
      crawlSeedHintTypes: priorScanAcceleration?.priorScan.crawlSeedHintTypes ?? [],
      found: Boolean(priorScanAcceleration),
      priorScanSelectionReason: priorScanAcceleration?.priorScan.priorScanSelectionReason ?? null,
      priorScanSelectionScore: priorScanAcceleration?.priorScan.priorScanSelectionScore ?? null,
      selectedDocumentSourceCount: priorScanAcceleration?.selectedDocumentSources.length ?? 0,
      selectedHighYieldPageCount: priorScanAcceleration?.selectedHighYieldPages.length ?? 0,
      sourceScanId: priorScanAcceleration?.priorScan.sourceScanId ?? null
    },
    organizationId: null,
    scanId: scan.id
  });

  await insertQueuedFullScanEvent({
    domainId: domain.id,
    eventType: FULL_SCAN_EVENT_TYPES.queued,
    message: localV2DagLambdaDispatch
      ? "Scan accepted for local v2 DAG Lambda artifact-only execution."
      : "Scan queued and awaiting scanner pickup.",
    metadataJson: {
      pagesRequested,
      coveragePlanCode,
      profile: planLimits.scanProfile,
      queueOrigin: queueMetadata.queueOrigin,
      queuePriority: queueMetadata.queuePriority,
      queueAvailabilityReason: fullScanQueueAvailability.reason,
      source: input.provenance?.source ?? scanConfig.source,
      scanFrom,
      requestedGeo: scanConfig.requestedGeo ?? null,
      originIp: input.provenance?.originIp ?? null,
      githubRunId: input.provenance?.githubRunId ?? null,
      githubWorkflow: input.provenance?.githubWorkflow ?? null,
      provenance: input.provenance ?? null,
      localV2DagLambdaDispatch
    },
    organizationId: null,
    scanId: scan.id
  });
  if (localV2DagLambdaDispatch) {
    await insertQueuedFullScanEvent({
      domainId: domain.id,
      eventType: LOCAL_V2_DAG_LAMBDA_DISPATCH_REQUESTED_EVENT_TYPE,
      message:
        "Local v2 DAG Lambda dispatch requested for the artifact-only v2 DAG scanner.",
      metadataJson: localV2DagLambdaDispatch,
      organizationId: null,
      scanId: scan.id
    });
  }

  if (localV2DagLambdaDispatch) {
    const simulatedLocalLambda = isLocalV2DagLambdaIntentSimulated(scanConfig);
    await insertQueuedFullScanEvent({
      domainId: domain.id,
      eventType: LOCAL_V2_DAG_LAMBDA_DISPATCH_STARTED_EVENT_TYPE,
      message: "Invoking local v2 DAG Lambda for artifact-only scan execution.",
      metadataJson: localV2DagLambdaDispatch,
      organizationId: null,
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
      await insertQueuedFullScanEvent({
        domainId: domain.id,
        eventType: LOCAL_V2_DAG_LAMBDA_DISPATCH_ACCEPTED_EVENT_TYPE,
        message: simulatedLocalLambda
          ? "Local simulated Lambda completed the v2 DAG artifact-only scan invocation."
          : "AWS Lambda accepted the local v2 DAG artifact-only scan invocation.",
        metadataJson: {
          ...localV2DagLambdaDispatch,
          invocationRequestId: dispatchResult.invocationRequestId,
          invocationStatusCode: dispatchResult.invocationStatusCode,
          invocationType: dispatchResult.invocationType,
          simulatedLocalLambda,
          productionFindingIntegration: false
        },
        organizationId: null,
        scanId: scan.id
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Local v2 DAG Lambda dispatch failed.";
      await insertQueuedFullScanEvent({
        domainId: domain.id,
        eventType: LOCAL_V2_DAG_LAMBDA_DISPATCH_FAILED_EVENT_TYPE,
        message: "Local v2 DAG Lambda dispatch failed; no fallback scanner execution was started.",
        metadataJson: {
          ...localV2DagLambdaDispatch,
          errorMessage: message,
          productionFindingIntegration: false
        },
        organizationId: null,
        scanId: scan.id
      });

      throw new Error(message);
    }
  }

  await setPreviewDomainLatestScan(domain.id, scan.id);

  if (localV2DagLambdaDispatch) {
    return {
      domain,
      scan
    };
  }

  await enqueueNanoSignalEnrichmentJob(scan.id).catch((error) => {
    console.error("[web] anonymous nano signal enrichment handoff failed", {
      error: error instanceof Error ? error.message : String(error),
      scanId: scan.id
    });
  });

  await ensureValidationRunForManualScan({
    domainId: domain.id,
    hostname: domain.hostname,
    normalizedUrl: domain.normalized_url,
    organizationId: null,
    scanId: scan.id,
    submittedByUserId: null
  }).catch((error) => {
    console.error("[web] anonymous validation handoff failed", {
      error: error instanceof Error ? error.message : String(error),
      scanId: scan.id
    });
  });

  return {
    domain,
    scan
  };
}
