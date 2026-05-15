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
  scanId: string | null;
}> {
  const fullScanQueueAvailability = await getFullScanQueueAvailability({
    allowDegradedScanner: process.env.FULL_SCAN_QUEUE_ALLOW_DEGRADED_HEARTBEAT === "true"
  });

  if (!fullScanQueueAvailability.enabled) {
    return {
      error: fullScanQueueAvailability.reason,
      scanId: null
    };
  }

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
        return {
          error: availability.reason,
          scanId: null
        };
      }

      return {
        error:
          input.planCode === "free"
            ? "Free plan domains can only be re-scanned once every 30 days."
            : "This domain was scanned recently. Pro and Ultra plans allow one re-scan every 1 minute per domain.",
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
      return {
        error: error instanceof Error ? error.message : "Could not verify scan limits.",
        scanId: null
      };
    }

    const currentUsage = Number(usageCounter?.value ?? 0);
    const monthlyLimit = planLimits.manualRescanLimitPerMonth;

    if (monthlyLimit !== null && currentUsage >= monthlyLimit) {
      return {
        error:
          planLimits.planCode === "free"
            ? "You’ve already used the Free plan scan for this month."
            : `You’ve reached the ${planDefinition.label} manual scan limit of ${monthlyLimit} for this billing period.`,
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
      return {
        error: error instanceof Error ? error.message : "Scan created but usage tracking failed.",
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
    return {
      error: error instanceof Error ? error.message : "Could not create full scan.",
      scanId: null
    };
  }

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
