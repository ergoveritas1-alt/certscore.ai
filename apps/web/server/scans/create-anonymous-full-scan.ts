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
import {
  createQueuedFullScan,
  insertQueuedFullScanEvent,
  loadPriorScanAccelerationCandidate
} from "./repository";
import { buildQueuedFullScanConfig } from "./full-scan-config";
import {
  LOCAL_V2_DAG_LAMBDA_DISPATCH_REQUESTED_EVENT_TYPE,
  isLocalV2DagLambdaIntentSimulated,
  summarizeLocalV2DagLambdaDispatchForEvent
} from "./local-v2-dag-lambda-dispatch";
import type { LocalV2DagScanProfile } from "./local-v2-dag-scan-config";
import { runLocalV2DagDispatch, type LocalV2DagDispatchContext } from "./local-v2-dag-dispatch-runner";
import { resolveRecentScanReuseDecision, RECENT_SCAN_REUSE_WINDOW_HOURS } from "./recent-scan-reuse";
import { logScanRequestFailure, recordScanRequest } from "./scan-request-log";
import { lookupTrancoRankMetadata } from "./tranco-rank-metadata";
import { AnonymousScanQuotaError, lightMcpScanRequesterKey } from "../pulse/anonymous-scan-quota";
import { claimAnonymousScanDailyQuota, claimLightMcpNewScanQuota } from "../pulse/repository";
import {
  normalizeScanRequesterIpContext,
  type ScanRequesterIpContext
} from "./requester-ip-context";
import type { CampaignAttribution } from "../../lib/attribution/campaign-attribution";
import { ensureCanonicalScanReportProjectionForReuse } from "./canonical-scan-report-publisher";
import { isDomainDnsPreflightError, requireDomainDns } from "../domains/domain-dns";

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
  campaignAttribution?: CampaignAttribution | null;
  clientRequestId?: string | null;
  coveragePlanCode?: PlanCode;
  countAnonymousQuota?: boolean;
  hostname: string;
  localV2DagLambdaDebugOverrides?: import("./local-v2-dag-scan-config").LocalV2DagLambdaDebugOverrides | null;
  localV2DagScanProfile?: LocalV2DagScanProfile | null;
  localV2DagRunViaLambda?: boolean | null;
  minimumReusablePagesRequested?: number;
  normalizedUrl: string;
  provenance?: ScanQueueProvenance;
  requesterIpContext?: ScanRequesterIpContext | null;
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
  scanFrom?: ScanFrom;
}) {
  const scanFrom = normalizeScanFrom(input.scanFrom);
  const coveragePlanCode = input.coveragePlanCode ?? "free";
  const planLimits = await getPlanLimits(coveragePlanCode);
  const pagesRequested = planLimits.maxPagesPerScan;
  const minimumReusablePagesRequested =
    typeof input.minimumReusablePagesRequested === "number" && Number.isFinite(input.minimumReusablePagesRequested)
      ? Math.floor(input.minimumReusablePagesRequested)
      : pagesRequested;
  const domain = await findOrCreateAnonymousPreviewDomain(input.hostname, input.normalizedUrl);
  const bypassRecentScanReuse = Boolean(input.bypassRecentScanReuse);
  const requesterIpContext = normalizeScanRequesterIpContext(input.requesterIpContext);

  const reuseDecision = await resolveRecentScanReuseDecision({
      forceNewScan: bypassRecentScanReuse,
      minPagesRequested: minimumReusablePagesRequested,
      normalizedDomain: input.hostname,
      normalizedUrl: input.normalizedUrl,
      organizationId: null,
      scanFrom
    }).catch((error) => {
      console.error("[web] anonymous recent scan reuse lookup failed", {
        error: error instanceof Error ? error.message : String(error),
        domainId: domain.id
      });
      return null;
    });

  if (reuseDecision?.action === "reuse") {
    const recentScan = reuseDecision.eligibility.candidate;
    if (recentScan) {
      const projection = await ensureCanonicalScanReportProjectionForReuse({
        organizationId: null,
        scanId: recentScan.id
      }).catch((error) => {
        console.error("[web] anonymous reusable scan report projection preparation failed", {
          error: error instanceof Error ? error.message : String(error),
          sourceScanId: recentScan.id
        });
        return { ready: false, reason: "projection_preparation_failed" } as const;
      });
      if (!projection.ready) {
        console.warn("[web] anonymous recent scan is not report-ready; queueing a new scan", {
          reason: projection.reason,
          sourceScanId: recentScan.id
        });
      } else {
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
            ipHash: requesterIpContext.ipHash,
            localV2DagRunViaLambda: Boolean(input.localV2DagRunViaLambda),
            minimumReusablePagesRequested: minimumReusablePagesRequested ?? null,
            provenance: input.provenance ?? null,
            scanFrom,
            sourceIp: requesterIpContext.sourceIp
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
        ipHash: requesterIpContext.ipHash,
        localV2DagRunViaLambda: Boolean(input.localV2DagRunViaLambda),
        minimumReusablePagesRequested: minimumReusablePagesRequested ?? null,
        provenance: input.provenance ?? null,
        scanFrom,
        sourceIp: requesterIpContext.sourceIp
      },
      errorCode: "queue_unavailable",
      errorMessage: fullScanQueueAvailability.reason ?? "Full scan queue is unavailable.",
      resolutionMode: "queue_unavailable",
      status: "rejected"
    }).catch((error) => logScanRequestFailure("anonymous_queue_unavailable", error));

    throw new Error(fullScanQueueAvailability.reason ?? "Full scan queue is unavailable.");
  }

  try {
    await requireDomainDns(input.hostname);
  } catch (error) {
    if (isDomainDnsPreflightError(error)) {
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
          ipHash: requesterIpContext.ipHash,
          provenance: input.provenance ?? null,
          scanFrom,
          sourceIp: requesterIpContext.sourceIp
        },
        errorCode: error.code,
        errorMessage: error.message,
        resolutionMode: "dns_preflight_rejected",
        status: "rejected"
      }).catch((recordError) => logScanRequestFailure("anonymous_dns_preflight", recordError));
    }
    throw error;
  }

  if (input.countAnonymousQuota !== false) {
    const isLightMcp = requesterIpContext.anonymousMcpSurface === "mcp_light";
    const lightRequesterKey = lightMcpScanRequesterKey({
      ipHash: requesterIpContext.ipHash ?? input.provenance?.originIp,
      network: requesterIpContext.anonymousRequesterNetwork
    });
    const quota = isLightMcp
      ? await claimLightMcpNewScanQuota({ requesterKey: lightRequesterKey })
      : await claimAnonymousScanDailyQuota({
          ipHash: requesterIpContext.ipHash ?? input.provenance?.originIp
        });
    if (!quota.allowed) {
      await recordScanRequest({
        normalizedDomain: input.hostname,
        normalizedUrl: input.normalizedUrl,
        organizationId: null,
        requestChannel: input.provenance?.source ?? "anonymous-full-scan",
        requestedBy: { anonymous: true },
        requestedUrl: input.normalizedUrl,
        requestContext: {
          coveragePlanCode,
          ipHash: requesterIpContext.ipHash,
          provenance: input.provenance ?? null,
          scanFrom,
          sourceIp: requesterIpContext.sourceIp
        },
        errorCode: "anonymous_scan_daily_limit",
        errorMessage: "Anonymous scan daily limit reached.",
        resolutionMode: "rate_limited",
        status: "rejected"
      }).catch((error) => logScanRequestFailure("anonymous_daily_quota", error));

      throw new AnonymousScanQuotaError(quota.retryAfterSeconds, {
        lightMcp: isLightMcp,
        ...("limit" in quota ? {
          limit: quota.limit,
          scope: quota.scope,
          window: quota.window
        } : {})
      });
    }
  }

  const [priorScanAcceleration, trancoRankMetadata] = await Promise.all([loadPriorScanAccelerationCandidate({
    domainId: domain.id,
    normalizedUrl: domain.normalized_url,
    organizationId: null
  }).catch((error) => {
    console.error("[web] anonymous prior scan acceleration lookup failed", {
      error: error instanceof Error ? error.message : String(error),
      domainId: domain.id
    });
    return null;
  }), lookupTrancoRankMetadata({
    hostname: input.hostname,
    normalizedUrl: input.normalizedUrl
  }).catch((error) => {
    console.error("[web] anonymous full-scan Tranco rank metadata lookup failed", {
      error: error instanceof Error ? error.message : String(error),
      hostname: input.hostname
    });
    return null;
  })]);
  const baseScanConfig = buildQueuedFullScanConfig({
    hostname: input.hostname,
    localV2DagLambdaDebugOverrides: input.localV2DagLambdaDebugOverrides,
    localV2DagScanProfile: input.localV2DagScanProfile,
    localV2DagRunViaLambda: input.localV2DagRunViaLambda,
    maxPages: pagesRequested,
    normalizedUrl: input.normalizedUrl,
    priorScanAcceleration,
    profile: planLimits.scanProfile,
    scanFrom,
    source: input.provenance?.source ?? "marketing-anonymous-full-scan",
    campaignAttribution: input.campaignAttribution,
    trancoRankMetadata
  });
  const scanConfig = input.clientRequestId
    ? { ...baseScanConfig, clientRequestId: input.clientRequestId }
    : baseScanConfig;
  const localV2DagLambdaDispatch = summarizeLocalV2DagLambdaDispatchForEvent(scanConfig);
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
      ipHash: requesterIpContext.ipHash,
      localV2DagRunViaLambda: Boolean(input.localV2DagRunViaLambda),
      minimumReusablePagesRequested: minimumReusablePagesRequested ?? null,
      pagesRequested,
      provenance: input.provenance ?? null,
      queueOrigin: queueMetadata.queueOrigin,
      queuePriority: queueMetadata.queuePriority,
      scanFrom,
      sourceIp: requesterIpContext.sourceIp
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

  await setPreviewDomainLatestScan(domain.id, scan.id);

  if (localV2DagLambdaDispatch) {
    const dispatchContext: LocalV2DagDispatchContext = {
      domainId: domain.id,
      localV2DagLambdaDispatch,
      organizationId: null,
      scanConfig,
      scanId: scan.id,
      simulatedLocalLambda: isLocalV2DagLambdaIntentSimulated(scanConfig)
    };
    if (dispatchContext.simulatedLocalLambda && input.scheduleBackgroundTask) {
      try {
        input.scheduleBackgroundTask(async () => {
          const error = await runLocalV2DagDispatch(dispatchContext);
          if (error) {
            console.error("[web] deferred anonymous local v2 DAG simulated Lambda dispatch failed", {
              error,
              scanId: scan.id
            });
          }
        });
        return {
          domain,
          scan
        };
      } catch (error) {
        console.warn("[web] anonymous local v2 DAG background scheduling failed; awaiting dispatch in request", {
          error: error instanceof Error ? error.message : String(error),
          scanId: scan.id
        });
      }
    }

    const dispatchError = await runLocalV2DagDispatch(dispatchContext);
    if (dispatchError) {
      throw new Error(dispatchError);
    }
  }

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
