"use server";

import { FULL_SCAN_EVENT_TYPES, USAGE_METRIC_KEYS, getPlanDefinition, type PlanCode } from "@website-signal-risk-scanner/shared";
import { redirect } from "next/navigation";
import { getDashboardContext } from "../auth";
import { getDomainById } from "../domains/get-domain-by-id";
import { getPlanLimits } from "../plans/get-plan-limits";
import { getFullScanQueueAvailability } from "../queue/full-scan-queue";
import { getRescanAvailability } from "../../lib/scans/rescan-policy";
import { ensureValidationRunForManualScan } from "../validation/repository";
import { enqueueNanoSignalEnrichmentJob } from "../queue/validation-queue";
import {
  createQueuedFullScan,
  insertQueuedFullScanEvent,
  loadUsageCounter,
  upsertUsageCounter,
  updateDomainLatestScan
} from "./repository";

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
  submittedByUserId: string;
  enforceCooldown?: boolean;
  enforceMonthlyUsageLimit?: boolean;
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
  const fullScanQueueAvailability = await getFullScanQueueAvailability();

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
  const scanConfig = {
    freshBrowserRequired: true,
    maxRequestedTier: "tier5_full_scan",
    post403Policy: {
      maxHomepageRetriesAfter403: 0,
      maxPassiveVerificationFetchesAfter403: 4,
      passiveOnlyAfter403: true,
      stopOnHomepage403: true,
      verifiedSurfaceTargetsAfter403: ["privacy_policy", "terms_of_service", "cookie_policy", "contact_page"]
    },
    processor: "queued-full-scan-v1",
    profile: planLimits.scanProfile,
    maxPages: pagesRequested,
    source: input.source ?? "manual-dashboard"
  };

  let scan;

  try {
    scan = await createQueuedFullScan({
      domainId: domainRecord.domain.id,
      organizationId: input.organizationId,
      pagesRequested,
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
      eventType: FULL_SCAN_EVENT_TYPES.queued,
      message: "Scan queued and awaiting scanner pickup.",
      metadataJson: {
        pagesRequested,
        profile: planLimits.scanProfile
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
    submittedByUserId: input.submittedByUserId
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
