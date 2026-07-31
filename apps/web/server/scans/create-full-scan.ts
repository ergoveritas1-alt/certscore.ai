"use server";

import {
  FULL_SCAN_EVENT_TYPES,
  SCAN_EVENT_TYPES,
  USAGE_METRIC_KEYS,
  getPlanDefinition,
  normalizeScanFrom,
  type PlanCode,
  type ScanFrom,
  type ScanType
} from "@website-signal-risk-scanner/shared";
import { getDomainById } from "../domains/get-domain-by-id";
import {
  applyManualRescanLimitOverride,
  getOrganizationManualRescanLimitOverride,
  getPlanLimits
} from "../plans/get-plan-limits";
import { getFullScanQueueAvailability } from "../queue/full-scan-queue";
import { getFullScanQueueMetadata } from "../queue/scan-queue-priority";
import { getAdminScanThrottleMs, getScanThrottleCopy } from "../../lib/scan-access";
import { getRescanAvailability } from "../../lib/scans/rescan-policy";
import { parsePlatformAdminEmails } from "../admin/platform-admin-core";
import { ensureValidationRunForManualScan } from "../validation/manual-scan-handoff";
import { enqueueNanoSignalEnrichmentJob } from "../queue/validation-queue";
import {
  createQueuedFullScan,
  failInterruptedLocalV2DagLambdaScansForDomain,
  insertQueuedFullScanEvent,
  loadMonthlyScanUsage,
  loadPriorScanAccelerationCandidate,
  loadUsageCounter,
  upsertUsageCounter,
  updateDomainLatestScan,
  updateLocalV2DagLambdaDispatchState
} from "./repository";
import { buildQueuedFullScanConfig } from "./full-scan-config";
import {
  normalizeLocalV2DagRunViaLambda,
  normalizeLocalV2DagScanProfile,
  type LocalV2DagScanProfile
} from "./local-v2-dag-scan-config";
import {
  canUseRestrictedScanOptions,
  restrictLocalV2RunViaLambdaForUser,
  restrictScanFromForUser
} from "./restricted-scan-options";
import {
  LOCAL_V2_DAG_LAMBDA_DISPATCH_ACCEPTED_EVENT_TYPE,
  LOCAL_V2_DAG_LAMBDA_DISPATCH_FAILED_EVENT_TYPE,
  LOCAL_V2_DAG_LAMBDA_DISPATCH_REQUESTED_EVENT_TYPE,
  LOCAL_V2_DAG_LAMBDA_DISPATCH_STARTED_EVENT_TYPE,
  LocalV2DagLambdaDispatchError,
  dispatchLocalV2DagLambdaScan,
  isLocalV2DagLambdaIntentSimulated,
  summarizeLocalV2DagLambdaDispatchForEvent
} from "./local-v2-dag-lambda-dispatch";
import { dispatchLocalV2DagSimulatedLambdaScan } from "./local-v2-dag-lambda-simulated-dispatch";
import { resolveRecentScanReuseDecision, RECENT_SCAN_REUSE_WINDOW_HOURS } from "./recent-scan-reuse";
import { logScanRequestFailure, recordScanRequest, type ScanRequestStatus } from "./scan-request-log";
import { lookupTrancoRankMetadata } from "./tranco-rank-metadata";
import { upsertOrganizationSettings } from "../settings/repository";
import { headers } from "next/headers";
import {
  getScanRequesterIpContext,
  normalizeScanRequesterIpContext,
  type ScanRequesterIpContext
} from "./requester-ip-context";
import type { CampaignAttribution } from "../../lib/attribution/campaign-attribution";

export type CreateFullScanActionState = {
  error: string | null;
};

const initialState: CreateFullScanActionState = {
  error: null
};

const LOCAL_INTERRUPTED_V2_DAG_CLEANUP_MS = 90_000;

type QueueFullScanInput = {
  campaignAttribution?: CampaignAttribution | null;
  clientRequestId?: string | null;
  domainContext?: {
    activeScanExists: boolean;
    domain: {
      hostname: string;
      id: string;
      lastScannedAt: string | null;
      maxPagesOverride: number | null;
      normalizedUrl: string;
    };
  };
  domainId: string;
  bypassRecentScanReuse?: boolean;
  localV2DagLambdaDebugOverrides?: import("./local-v2-dag-scan-config").LocalV2DagLambdaDebugOverrides | null;
  localV2DagScanProfile?: LocalV2DagScanProfile | null;
  localV2DagRunViaLambda?: boolean | null;
  organizationId: string;
  planCode: PlanCode;
  planLimitsOverride?: Awaited<ReturnType<typeof getPlanLimits>>;
  submittedByUserId: string | null;
  scanType?: Extract<ScanType, "full" | "scheduled">;
  enforceCooldown?: boolean;
  enforceMonthlyUsageLimit?: boolean;
  provenance?: {
    githubActor?: string | null;
    githubRunId?: string | null;
    githubSha?: string | null;
    githubWorkflow?: string | null;
    host?: string | null;
    originIp?: string | null;
    source?: string | null;
    userAgent?: string | null;
  };
  requesterIpContext?: ScanRequesterIpContext | null;
  scanFrom?: ScanFrom;
  scanThrottleMs?: number;
  source?: string;
};

function getManualDashboardScanThrottleMs(userEmail: string): number | undefined {
  if (process.env.NODE_ENV !== "production") {
    return 0;
  }

  return parsePlatformAdminEmails(process.env.CERTSCORE_ADMIN_EMAILS).has(userEmail.toLowerCase())
    ? getAdminScanThrottleMs()
    : undefined;
}

function getCurrentMonthWindow(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const periodStart = new Date(Date.UTC(year, month, 1));
  const periodEnd = new Date(Date.UTC(year, month + 1, 0));

  return {
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10)
  };
}

function shouldPersistLastScanFrom(input: QueueFullScanInput) {
  return Boolean(input.submittedByUserId) && (input.scanType ?? "full") !== "scheduled";
}

async function persistLastScanFrom(input: QueueFullScanInput, scanFrom: ScanFrom) {
  if (!shouldPersistLastScanFrom(input)) {
    return;
  }

  await upsertOrganizationSettings(input.organizationId, {
    default_scan_from: scanFrom
  }).catch((error) => {
    console.error("[web] failed to persist last scan location", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: input.organizationId,
      scanFrom
    });
  });
}

export async function queueFullScanForDomain(input: QueueFullScanInput): Promise<{
  error: string | null;
  reusedExistingScan?: boolean;
  scanId: string | null;
}> {
  const scanFrom = normalizeScanFrom(input.scanFrom);
  const basePlanLimits = input.planLimitsOverride ?? (await getPlanLimits(input.planCode));
  const manualRescanLimitOverride = await getOrganizationManualRescanLimitOverride(input.organizationId).catch((error) => {
    console.error("[web] organization manual scan limit override lookup failed", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: input.organizationId
    });
    return null;
  });
  const planLimits = await applyManualRescanLimitOverride(basePlanLimits, manualRescanLimitOverride);
  const planDefinition = getPlanDefinition(planLimits.planCode);
  if (process.env.NODE_ENV !== "production" && !input.domainContext) {
    await failInterruptedLocalV2DagLambdaScansForDomain({
      domainId: input.domainId,
      olderThanMs: LOCAL_INTERRUPTED_V2_DAG_CLEANUP_MS
    }).catch((error) => {
      console.warn("[web] interrupted local v2 DAG Lambda scan cleanup failed", {
        domainId: input.domainId,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }
  const domainRecord = input.domainContext
    ? {
        domain: input.domainContext.domain,
        scans: input.domainContext.activeScanExists
          ? [{ status: "running", completedAt: null }]
          : []
      }
    : await getDomainById({
        domainId: input.domainId,
        organizationId: input.organizationId
      });

  if (!domainRecord) {
    return {
      error: "This domain could not be found in your workspace.",
      scanId: null
    };
  }

  const pagesRequested = domainRecord.domain.maxPagesOverride ?? planLimits.maxPagesPerScan;
  const bypassRecentScanReuse = Boolean(input.bypassRecentScanReuse);
  const requesterIpContext = normalizeScanRequesterIpContext(input.requesterIpContext);

  const logRequest = (details: {
    errorCode?: string | null;
    errorMessage?: string | null;
    fulfilledByScanId?: string | null;
    requireSuccess?: boolean;
    resolutionMode?: string | null;
    reusedCompletedAt?: string | null;
    scanId?: string | null;
    status: ScanRequestStatus;
  }) => {
    const request = recordScanRequest({
      errorCode: details.errorCode ?? null,
      errorMessage: details.errorMessage ?? null,
      fulfilledByScanId: details.fulfilledByScanId ?? details.scanId ?? null,
      normalizedDomain: domainRecord.domain.hostname,
      normalizedUrl: domainRecord.domain.normalizedUrl,
      organizationId: input.organizationId,
      requestChannel: input.provenance?.source ?? input.source ?? "manual-dashboard",
      requestedBy: {
        anonymous: !input.submittedByUserId,
        userId: input.submittedByUserId
      },
      requestedUrl: domainRecord.domain.normalizedUrl,
      requestContext: {
        bypassRecentScanReuse,
        enforceCooldown: Boolean(input.enforceCooldown),
        enforceMonthlyUsageLimit: Boolean(input.enforceMonthlyUsageLimit),
        ipHash: requesterIpContext.ipHash,
        planCode: input.planCode,
        provenance: input.provenance ?? null,
        sourceIp: requesterIpContext.sourceIp,
        localV2DagRunViaLambda: Boolean(input.localV2DagRunViaLambda),
        scanType: input.scanType ?? "full",
        scanFrom,
        source: input.source ?? null
      },
      resolutionMode: details.resolutionMode ?? null,
      reusedCompletedAt: details.reusedCompletedAt ?? null,
      reuseWindowHours:
        details.resolutionMode === "reused_existing_scan" ? RECENT_SCAN_REUSE_WINDOW_HOURS : null,
      scanId: details.scanId ?? null,
      status: details.status
    });

    if (details.requireSuccess) {
      return request;
    }

    return request.catch((error) => logScanRequestFailure("workspace_full_scan_request", error));
  };

  const reuseDecision = await resolveRecentScanReuseDecision({
      forceNewScan: bypassRecentScanReuse,
      minPagesRequested: pagesRequested,
      normalizedDomain: domainRecord.domain.hostname,
      normalizedUrl: domainRecord.domain.normalizedUrl,
      organizationId: input.organizationId,
      scanFrom
    }).catch((error) => {
        console.error("[web] workspace recent scan reuse lookup failed", {
          domainId: domainRecord.domain.id,
          error: error instanceof Error ? error.message : String(error)
        });
        return null;
      });

  if (reuseDecision?.action === "reuse") {
    const recentScan = reuseDecision.eligibility.candidate;
    if (recentScan) {
      try {
        await logRequest({
          fulfilledByScanId: recentScan.id,
          requireSuccess:
            typeof recentScan.organizationId === "string" || recentScan.organizationId === null
              ? recentScan.organizationId !== input.organizationId
              : false,
          resolutionMode: "reused_existing_scan",
          reusedCompletedAt: recentScan.completedAt,
          scanId: recentScan.id,
          status: "reused_recent_scan"
        });
        await updateDomainLatestScan({
          completedAt: recentScan.completedAt,
          domainId: domainRecord.domain.id,
          organizationId: input.organizationId,
          scanId: recentScan.id
        });
        await persistLastScanFrom(input, scanFrom);

        return {
          error: null,
          reusedExistingScan: true,
          scanId: recentScan.id
        };
      } catch (error) {
        console.error("[web] cross-workspace recent scan reuse access logging failed; queueing new scan instead", {
          domainId: domainRecord.domain.id,
          error: error instanceof Error ? error.message : String(error),
          sourceScanId: recentScan.id
        });
      }
    }
  }

  const fullScanQueueAvailability = await getFullScanQueueAvailability({
    allowDegradedScanner: process.env.FULL_SCAN_QUEUE_ALLOW_DEGRADED_HEARTBEAT === "true",
    scanFrom
  });

  if (!fullScanQueueAvailability.enabled) {
    await logRequest({
      errorCode: "queue_unavailable",
      errorMessage: fullScanQueueAvailability.reason ?? null,
      resolutionMode: "queue_unavailable",
      status: "rejected"
    });

    return {
      error: fullScanQueueAvailability.reason,
      scanId: null
    };
  }

  const activeScanExists = domainRecord.scans.some((scan) => scan.status === "queued" || scan.status === "running");
  const lastScannedAt =
    domainRecord.domain.lastScannedAt ??
    domainRecord.scans.find((scan) => scan.status === "completed" && scan.completedAt)?.completedAt ??
    null;

  if (input.enforceCooldown) {
    const availability = getRescanAvailability({
      activeScanExists,
      lastScannedAt,
      planCode: input.planCode,
      rescanCooldownMs: input.scanThrottleMs
    });

    if (!availability.allowed) {
      if (availability.reason) {
        await logRequest({
          errorCode: "rescan_cooldown",
          errorMessage: availability.reason,
          resolutionMode: "rescan_cooldown",
          status: "rejected"
        });

        return {
          error: availability.reason,
          scanId: null
        };
      }

      const throttleMessage = getScanThrottleCopy();

      await logRequest({
        errorCode: "rescan_cooldown",
        errorMessage: throttleMessage,
        resolutionMode: "rescan_cooldown",
        status: "rejected"
      });

      return {
        error: throttleMessage,
        scanId: null
      };
    }
  }

  if (input.enforceMonthlyUsageLimit) {
    const monthWindow = getCurrentMonthWindow();
    const metricKey = USAGE_METRIC_KEYS.manualFullScans;
    let usageCounter;
    let monthlyScanUsage = 0;

    try {
      [usageCounter, monthlyScanUsage] = await Promise.all([
        loadUsageCounter({
          metricKey,
          organizationId: input.organizationId,
          periodStart: monthWindow.periodStart,
          periodEnd: monthWindow.periodEnd
        }),
        loadMonthlyScanUsage({
          organizationId: input.organizationId,
          periodStart: monthWindow.periodStart,
          periodEnd: monthWindow.periodEnd
        })
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not verify scan limits.";
      await logRequest({
        errorCode: "usage_limit_check_failed",
        errorMessage: message,
        resolutionMode: "usage_limit_check_failed",
        status: "failed"
      });

      return {
        error: message,
        scanId: null
      };
    }

    const currentUsage = Math.max(Number(usageCounter?.value ?? 0), monthlyScanUsage);
    const monthlyLimit = planLimits.manualRescanLimitPerMonth;

    if (monthlyLimit !== null && currentUsage >= monthlyLimit) {
      const message =
        planLimits.planCode === "free"
          ? "You’ve already used the Trial plan scan allowance for this month."
          : `You’ve reached the ${planDefinition.label} scan limit of ${monthlyLimit} for this billing period.`;
      await logRequest({
        errorCode: "monthly_usage_limit",
        errorMessage: message,
        resolutionMode: "monthly_usage_limit",
        status: "rejected"
      });

      return {
        error: message,
        scanId: null
      };
    }

    const nextUsageValue = currentUsage + 1;

    try {
      await upsertUsageCounter({
        counterId: usageCounter?.id ?? null,
        metricKey,
        organizationId: input.organizationId,
        periodStart: monthWindow.periodStart,
        periodEnd: monthWindow.periodEnd,
        value: nextUsageValue
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scan created but usage tracking failed.";
      await logRequest({
        errorCode: "usage_tracking_failed",
        errorMessage: message,
        resolutionMode: "usage_tracking_failed",
        status: "failed"
      });

      return {
        error: message,
        scanId: null
      };
    }
  }

  const [priorScanAcceleration, trancoRankMetadata] = await Promise.all([loadPriorScanAccelerationCandidate({
    domainId: domainRecord.domain.id,
    normalizedUrl: domainRecord.domain.normalizedUrl,
    organizationId: input.organizationId
  }).catch((error) => {
    console.error("[web] prior scan acceleration lookup failed", {
      error: error instanceof Error ? error.message : String(error),
      domainId: domainRecord.domain.id
    });
    return null;
  }), lookupTrancoRankMetadata({
    hostname: domainRecord.domain.hostname,
    normalizedUrl: domainRecord.domain.normalizedUrl
  }).catch((error) => {
    console.error("[web] full-scan Tranco rank metadata lookup failed", {
      error: error instanceof Error ? error.message : String(error),
      hostname: domainRecord.domain.hostname
    });
    return null;
  })]);
  const baseScanConfig = buildQueuedFullScanConfig({
    hostname: domainRecord.domain.hostname,
    localV2DagLambdaDebugOverrides: input.localV2DagLambdaDebugOverrides,
    localV2DagScanProfile: input.localV2DagScanProfile,
    localV2DagRunViaLambda: input.localV2DagRunViaLambda,
    maxPages: pagesRequested,
    normalizedUrl: domainRecord.domain.normalizedUrl,
    priorScanAcceleration,
    profile: planLimits.scanProfile,
    scanFrom,
    campaignAttribution: input.campaignAttribution,
    source: input.source ?? "manual-dashboard",
    trancoRankMetadata
  });
  const scanConfig = input.clientRequestId
    ? { ...baseScanConfig, clientRequestId: input.clientRequestId }
    : baseScanConfig;
  const localV2DagLambdaDispatch = summarizeLocalV2DagLambdaDispatchForEvent(scanConfig);
  const queueMetadata = getFullScanQueueMetadata({
    provenance: input.provenance,
    scanType: input.scanType ?? "full"
  });

  let scan;

  try {
    scan = await createQueuedFullScan({
      domainId: domainRecord.domain.id,
      initialStatus: localV2DagLambdaDispatch ? "running" : "queued",
      organizationId: input.organizationId,
      pagesRequested,
      queueOrigin: queueMetadata.queueOrigin,
      queuePriority: queueMetadata.queuePriority,
      scanType: input.scanType ?? "full",
      scanConfigJson: scanConfig,
      submittedByUserId: input.submittedByUserId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create full scan.";
    await logRequest({
      errorCode: "scan_create_failed",
      errorMessage: message,
      resolutionMode: "scan_create_failed",
      status: "failed"
    });

    return {
      error: message,
      scanId: null
    };
  }

  await logRequest({
    fulfilledByScanId: scan.id,
    resolutionMode: "queued_new_scan",
    scanId: scan.id,
    status: "queued"
  });
  await persistLastScanFrom(input, scanFrom);

  try {
    await insertQueuedFullScanEvent({
      domainId: domainRecord.domain.id,
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
      organizationId: input.organizationId,
      scanId: scan.id
    });
    await insertQueuedFullScanEvent({
      domainId: domainRecord.domain.id,
      eventType: FULL_SCAN_EVENT_TYPES.queued,
      message: localV2DagLambdaDispatch
        ? "Scan accepted for local v2 DAG Lambda artifact-only execution."
        : "Scan queued and awaiting scanner pickup.",
      metadataJson: {
        pagesRequested,
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
        localV2DagRunViaLambda: Boolean(input.localV2DagRunViaLambda),
        localV2DagLambdaDispatch
      },
      organizationId: input.organizationId,
      scanId: scan.id
    });
    if (localV2DagLambdaDispatch) {
      await insertQueuedFullScanEvent({
        domainId: domainRecord.domain.id,
        eventType: LOCAL_V2_DAG_LAMBDA_DISPATCH_REQUESTED_EVENT_TYPE,
        message:
          "Local v2 DAG Lambda dispatch requested for the artifact-only v2 DAG scanner.",
        metadataJson: localV2DagLambdaDispatch,
        organizationId: input.organizationId,
        scanId: scan.id
      });
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Scan created but event logging failed.",
      scanId: scan.id
    };
  }

  if (localV2DagLambdaDispatch) {
    const simulatedLocalLambda = isLocalV2DagLambdaIntentSimulated(scanConfig);
    await insertQueuedFullScanEvent({
      domainId: domainRecord.domain.id,
      eventType: LOCAL_V2_DAG_LAMBDA_DISPATCH_STARTED_EVENT_TYPE,
      message: "Invoking local v2 DAG Lambda for artifact-only scan execution.",
      metadataJson: localV2DagLambdaDispatch,
      organizationId: input.organizationId,
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
      const acceptancePersistenceStartedAtMs = Date.now();
      await updateLocalV2DagLambdaDispatchState({
        acceptedAt: new Date().toISOString(),
        dispatchState: "accepted",
        invocationRequestId: dispatchResult.invocationRequestId,
        scanId: scan.id
      });
      const acceptancePersistenceMs = Date.now() - acceptancePersistenceStartedAtMs;
      const eventPersistenceStartedAtMs = Date.now();
      await insertQueuedFullScanEvent({
        domainId: domainRecord.domain.id,
        eventType: LOCAL_V2_DAG_LAMBDA_DISPATCH_ACCEPTED_EVENT_TYPE,
        message: simulatedLocalLambda
          ? "Local simulated Lambda completed the v2 DAG artifact-only scan invocation."
          : "AWS Lambda accepted the local v2 DAG artifact-only scan invocation.",
        metadataJson: {
          ...localV2DagLambdaDispatch,
          invocationRequestId: dispatchResult.invocationRequestId,
          invocationStatusCode: dispatchResult.invocationStatusCode,
          invocationType: dispatchResult.invocationType,
          dispatchTimings: {
            ...dispatchResult.timings,
            acceptancePersistenceMs
          },
          simulatedLocalLambda,
          productionFindingIntegration: false
        },
        organizationId: input.organizationId,
        scanId: scan.id
      });
      console.info(JSON.stringify({
        ...dispatchResult.timings,
        acceptancePersistenceMs,
        event: "scan.lambda_dispatch_timing",
        eventPersistenceMs: Date.now() - eventPersistenceStartedAtMs,
        scanId: scan.id
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Local v2 DAG Lambda dispatch failed.";
      const dispatchState = error instanceof LocalV2DagLambdaDispatchError ? error.dispatchState : "failed";
      await updateLocalV2DagLambdaDispatchState({ dispatchState, errorMessage: message, scanId: scan.id });
      await insertQueuedFullScanEvent({
        domainId: domainRecord.domain.id,
        eventType: LOCAL_V2_DAG_LAMBDA_DISPATCH_FAILED_EVENT_TYPE,
        message: "Local v2 DAG Lambda dispatch failed; no fallback scanner execution was started.",
        metadataJson: {
          ...localV2DagLambdaDispatch,
          errorMessage: message,
          dispatchState,
          dispatchTimings: error instanceof LocalV2DagLambdaDispatchError ? error.timings : null,
          productionFindingIntegration: false
        },
        organizationId: input.organizationId,
        scanId: scan.id
      });

      return {
        error: message,
        scanId: scan.id
      };
    }
  }

  try {
    await updateDomainLatestScan({
      domainId: domainRecord.domain.id,
      organizationId: input.organizationId,
      scanId: scan.id
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Scan created but latest scan update failed.",
      scanId: scan.id
    };
  }

  if (localV2DagLambdaDispatch) {
    return {
      error: null,
      scanId: scan.id
    };
  }

  await enqueueNanoSignalEnrichmentJob(scan.id).catch((error) => {
    console.error("[web] nano signal enrichment handoff failed", {
      error: error instanceof Error ? error.message : String(error),
      scanId: scan.id
    });
  });
  await ensureValidationRunForManualScan({
    domainId: domainRecord.domain.id,
    hostname: domainRecord.domain.hostname,
    normalizedUrl: domainRecord.domain.normalizedUrl,
    organizationId: input.organizationId,
    scanId: scan.id,
    submittedByUserId: input.submittedByUserId,
    triggerMode: input.scanType === "scheduled" ? "automatic" : "manual"
  }).catch((error) => {
    console.error("[web] validation handoff failed for full scan", {
      error: error instanceof Error ? error.message : String(error),
      scanId: scan.id
    });
  });

  return {
    error: null,
    scanId: scan.id
  };
}

export async function createFullScanAction(
  _previousState: CreateFullScanActionState = initialState,
  formData: FormData
): Promise<CreateFullScanActionState> {
  const [{ getDashboardContext }, { redirect }] = await Promise.all([import("../auth"), import("next/navigation")]);
  const dashboardContext = await getDashboardContext();
  const requesterIpContext = getScanRequesterIpContext(await headers());
  const domainId = String(formData.get("domainId") ?? "").trim();
  const forceNewScan = formData.get("forceNewScan") === "true";
  const localV2DagScanProfile = normalizeLocalV2DagScanProfile(formData.get("localV2ScanProfile"));
  const allowRestrictedScanOptions = canUseRestrictedScanOptions({
    membershipRole: dashboardContext.membership.role,
    userEmail: dashboardContext.user.email
  });
  const scanFrom = restrictScanFromForUser({
    canUseRestrictedScanOptions: allowRestrictedScanOptions,
    scanFrom: normalizeScanFrom(formData.get("scanFrom"))
  });
  const localV2DagRunViaLambda = restrictLocalV2RunViaLambdaForUser({
    canUseRestrictedScanOptions: allowRestrictedScanOptions,
    localV2DagRunViaLambda: normalizeLocalV2DagRunViaLambda(formData.get("localV2RunViaLambda"), process.env, scanFrom)
  });

  const fullScanQueueAvailability = await getFullScanQueueAvailability({ scanFrom });

  if (!fullScanQueueAvailability.enabled) {
    return {
      error: fullScanQueueAvailability.reason
    };
  }

  if (domainId.length === 0) {
    return {
      error: "A domain is required to start a full scan."
    };
  }

  const result = await queueFullScanForDomain({
    domainId,
    organizationId: dashboardContext.organization.id,
    planCode: dashboardContext.organization.plan,
    submittedByUserId: dashboardContext.user.id,
    bypassRecentScanReuse: forceNewScan,
    enforceMonthlyUsageLimit: true,
    localV2DagScanProfile,
    localV2DagRunViaLambda,
    requesterIpContext,
    scanFrom,
    scanThrottleMs: getManualDashboardScanThrottleMs(dashboardContext.user.email),
    source: "manual-dashboard"
  });

  if (result.error || !result.scanId) {
    return {
      error: result.error ?? "Could not create full scan."
    };
  }

  redirect(`/app/scans/${result.scanId}`);
  return initialState;
}
