"use server";

import {
  FULL_SCAN_EVENT_TYPES,
  SCAN_EVENT_TYPES,
  USAGE_METRIC_KEYS,
  getPlanDefinition,
  type PlanCode,
  type ScanType
} from "@website-signal-risk-scanner/shared";
import { redirect } from "next/navigation";
import { getDashboardContext } from "../auth";
import { getDomainById } from "../domains/get-domain-by-id";
import { getPlanLimits } from "../plans/get-plan-limits";
import { getFullScanQueueAvailability } from "../queue/full-scan-queue";
import { getFullScanQueueMetadata } from "../queue/scan-queue-priority";
import { LAUNCH_ACCESS, getLaunchScanThrottleCopy } from "../../lib/launch-mode";
import { getRescanAvailability } from "../../lib/scans/rescan-policy";
import { ensureValidationRunForManualScan } from "../validation/repository";
import { enqueueNanoSignalEnrichmentJob } from "../queue/validation-queue";
import {
  createQueuedFullScan,
  insertQueuedFullScanEvent,
  loadPriorScanAccelerationCandidate,
  loadUsageCounter,
  upsertUsageCounter,
  updateDomainLatestScan
} from "./repository";
import { buildQueuedFullScanConfig } from "./full-scan-config";
import { findRecentCompletedScanForDomain, findRecentCompletedScanInHistory, RECENT_SCAN_REUSE_WINDOW_HOURS } from "./recent-scan-reuse";
import { logScanRequestFailure, recordScanRequest, type ScanRequestStatus } from "./scan-request-log";

export type CreateFullScanActionState = {
  error: string | null;
};

const initialState: CreateFullScanActionState = {
  error: null
};

type QueueFullScanInput = {
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
  source?: string;
};

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

export async function queueFullScanForDomain(input: QueueFullScanInput): Promise<{
  error: string | null;
  reusedExistingScan?: boolean;
  scanId: string | null;
}> {
  const planLimits = input.planLimitsOverride ?? (await getPlanLimits(input.planCode));
  const planDefinition = getPlanDefinition(planLimits.planCode);
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

  const logRequest = (details: {
    errorCode?: string | null;
    errorMessage?: string | null;
    fulfilledByScanId?: string | null;
    resolutionMode?: string | null;
    reusedCompletedAt?: string | null;
    scanId?: string | null;
    status: ScanRequestStatus;
  }) =>
    recordScanRequest({
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
        bypassRecentScanReuse: Boolean(input.bypassRecentScanReuse),
        enforceCooldown: Boolean(input.enforceCooldown),
        enforceMonthlyUsageLimit: Boolean(input.enforceMonthlyUsageLimit),
        planCode: input.planCode,
        provenance: input.provenance ?? null,
        scanType: input.scanType ?? "full",
        source: input.source ?? null
      },
      resolutionMode: details.resolutionMode ?? null,
      reusedCompletedAt: details.reusedCompletedAt ?? null,
      reuseWindowHours:
        details.resolutionMode === "reused_existing_scan" ? RECENT_SCAN_REUSE_WINDOW_HOURS : null,
      scanId: details.scanId ?? null,
      status: details.status
    }).catch((error) => logScanRequestFailure("workspace_full_scan_request", error));

  if (!input.bypassRecentScanReuse) {
    const recentScan =
      findRecentCompletedScanInHistory(domainRecord.scans) ??
      (await findRecentCompletedScanForDomain({
        normalizedDomain: domainRecord.domain.hostname,
        normalizedUrl: domainRecord.domain.normalizedUrl,
        organizationId: input.organizationId
      }).catch((error) => {
        console.error("[web] workspace recent scan reuse lookup failed", {
          domainId: domainRecord.domain.id,
          error: error instanceof Error ? error.message : String(error)
        });
        return null;
      }));

    if (recentScan) {
      await logRequest({
        fulfilledByScanId: recentScan.id,
        resolutionMode: "reused_existing_scan",
        reusedCompletedAt: recentScan.completedAt,
        scanId: recentScan.id,
        status: "reused_recent_scan"
      });

      return {
        error: null,
        reusedExistingScan: true,
        scanId: recentScan.id
      };
    }
  }

  const fullScanQueueAvailability = await getFullScanQueueAvailability({
    allowDegradedScanner: process.env.FULL_SCAN_QUEUE_ALLOW_DEGRADED_HEARTBEAT === "true"
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
      planCode: input.planCode
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

      const launchThrottleMessage = `${getLaunchScanThrottleCopy()} For higher-throughput scanning or batch workflows, contact ${LAUNCH_ACCESS.salesEmail}.`;

      await logRequest({
        errorCode: "rescan_cooldown",
        errorMessage: launchThrottleMessage,
        resolutionMode: "rescan_cooldown",
        status: "rejected"
      });

      return {
        error: launchThrottleMessage,
        scanId: null
      };
    }
  }

  if (input.enforceMonthlyUsageLimit) {
    const monthWindow = getCurrentMonthWindow();
    const metricKey = USAGE_METRIC_KEYS.manualFullScans;
    let usageCounter;

    try {
      usageCounter = await loadUsageCounter({
        metricKey,
        organizationId: input.organizationId,
        periodStart: monthWindow.periodStart,
        periodEnd: monthWindow.periodEnd
      });
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

    const currentUsage = Number(usageCounter?.value ?? 0);
    const monthlyLimit = planLimits.manualRescanLimitPerMonth;

    if (monthlyLimit !== null && currentUsage >= monthlyLimit) {
      const message =
        planLimits.planCode === "free"
          ? "You’ve already used the Free plan scan for this month."
          : `You’ve reached the ${planDefinition.label} manual scan limit of ${monthlyLimit} for this billing period.`;
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

  const pagesRequested = domainRecord.domain.maxPagesOverride ?? planLimits.maxPagesPerScan;
  const priorScanAcceleration = await loadPriorScanAccelerationCandidate({
    domainId: domainRecord.domain.id,
    normalizedUrl: domainRecord.domain.normalizedUrl,
    organizationId: input.organizationId
  }).catch((error) => {
    console.error("[web] prior scan acceleration lookup failed", {
      error: error instanceof Error ? error.message : String(error),
      domainId: domainRecord.domain.id
    });
    return null;
  });
  const scanConfig = buildQueuedFullScanConfig({
    hostname: domainRecord.domain.hostname,
    maxPages: pagesRequested,
    normalizedUrl: domainRecord.domain.normalizedUrl,
    priorScanAcceleration,
    profile: planLimits.scanProfile,
    source: input.source ?? "manual-dashboard"
  });
  const queueMetadata = getFullScanQueueMetadata({
    provenance: input.provenance,
    scanType: input.scanType ?? "full"
  });

  let scan;

  try {
    scan = await createQueuedFullScan({
      domainId: domainRecord.domain.id,
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
      message: "Scan queued and awaiting scanner pickup.",
      metadataJson: {
        pagesRequested,
        profile: planLimits.scanProfile,
        queueOrigin: queueMetadata.queueOrigin,
        queuePriority: queueMetadata.queuePriority,
        queueAvailabilityReason: fullScanQueueAvailability.reason,
        source: input.provenance?.source ?? scanConfig.source,
        originIp: input.provenance?.originIp ?? null,
        githubRunId: input.provenance?.githubRunId ?? null,
        githubWorkflow: input.provenance?.githubWorkflow ?? null,
        provenance: input.provenance ?? null
      },
      organizationId: input.organizationId,
      scanId: scan.id
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Scan created but event logging failed.",
      scanId: null
    };
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
      scanId: null
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
  const fullScanQueueAvailability = await getFullScanQueueAvailability();

  if (!fullScanQueueAvailability.enabled) {
    return {
      error: fullScanQueueAvailability.reason
    };
  }

  const dashboardContext = await getDashboardContext();
  const domainId = String(formData.get("domainId") ?? "").trim();

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
    enforceMonthlyUsageLimit: true,
    source: "manual-dashboard"
  });

  if (result.error || !result.scanId) {
    return {
      error: result.error ?? "Could not create full scan."
    };
  }

  redirect(`/app/scans/${result.scanId}`);
}
