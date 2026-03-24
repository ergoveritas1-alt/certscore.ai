"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import { FULL_SCAN_EVENT_TYPES, USAGE_METRIC_KEYS, getPlanDefinition, type PlanCode } from "@website-signal-risk-scanner/shared";
import { redirect } from "next/navigation";
import { getDashboardContext } from "../auth";
import { getDomainById } from "../domains/get-domain-by-id";
import { getPlanLimits } from "../plans/get-plan-limits";
import { getFullScanQueueAvailability } from "../queue/full-scan-queue";
import { getRescanAvailability } from "../../lib/scans/rescan-policy";
import { ensureValidationRunForManualScan } from "../validation/repository";

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
            : "This domain was scanned recently. Pro and Ultra plans allow one re-scan every 3 minutes per domain.",
        scanId: null
      };
    }
  }

  const supabase = createAdminClient();

  if (input.enforceMonthlyUsageLimit) {
    const monthWindow = getCurrentMonthWindow();
    const metricKey = USAGE_METRIC_KEYS.manualFullScans;
    const { data: usageCounter, error: usageError } = await supabase
      .from("usage_counters")
      .select("id, value")
      .eq("organization_id", input.organizationId)
      .eq("metric_key", metricKey)
      .eq("period_start", monthWindow.periodStart)
      .eq("period_end", monthWindow.periodEnd)
      .maybeSingle();

    if (usageError) {
      return {
        error: `Could not verify scan limits: ${usageError.message}`,
        scanId: null
      };
    }

    const currentUsage = Number((usageCounter as { id: string; value: number } | null)?.value ?? 0);
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

    if (usageCounter) {
      const { error: updateUsageError } = await supabase
        .from("usage_counters")
        .update({ value: nextUsageValue })
        .eq("id", (usageCounter as { id: string }).id);

      if (updateUsageError) {
        return {
          error: `Scan created but usage tracking failed: ${updateUsageError.message}`,
          scanId: null
        };
      }
    } else {
      const { error: insertUsageError } = await supabase.from("usage_counters").insert({
        organization_id: input.organizationId,
        metric_key: metricKey,
        period_start: monthWindow.periodStart,
        period_end: monthWindow.periodEnd,
        value: nextUsageValue
      });

      if (insertUsageError) {
        return {
          error: `Scan created but usage tracking failed: ${insertUsageError.message}`,
          scanId: null
        };
      }
    }
  }

  const pagesRequested = domainRecord.domain.maxPagesOverride ?? planLimits.maxPagesPerScan;
  const scanConfig = {
    processor: "queued-full-scan-v1",
    profile: planLimits.scanProfile,
    maxPages: pagesRequested,
    source: input.source ?? "manual-dashboard"
  };

  const { data: scan, error } = await supabase
    .from("scans")
    .insert({
      organization_id: input.organizationId,
      domain_id: domainRecord.domain.id,
      submitted_by_user_id: input.submittedByUserId,
      scan_type: "full",
      status: "queued",
      pages_requested: pagesRequested,
      pages_scanned: 0,
      scan_config_json: scanConfig
    })
    .select("id")
    .single();

  if (error || !scan) {
    return {
      error: `Could not create full scan: ${error?.message ?? "Unknown error"}`,
      scanId: null
    };
  }

  const { error: eventError } = await supabase.from("scan_events").insert({
    scan_id: scan.id,
    domain_id: domainRecord.domain.id,
    organization_id: input.organizationId,
    event_type: FULL_SCAN_EVENT_TYPES.queued,
    message: "Scan queued and awaiting scanner pickup.",
    metadata_json: {
      pagesRequested,
      profile: planLimits.scanProfile
    }
  });

  if (eventError) {
    return {
      error: `Scan created but event logging failed: ${eventError.message}`,
      scanId: null
    };
  }

  const { error: latestScanError } = await supabase
    .from("domains")
    .update({ latest_scan_id: scan.id })
    .eq("id", domainRecord.domain.id)
    .eq("organization_id", input.organizationId);

  if (latestScanError) {
    return {
      error: `Scan created but latest scan update failed: ${latestScanError.message}`,
      scanId: null
    };
  }

  try {
    await ensureValidationRunForManualScan({
      domainId: domainRecord.domain.id,
      hostname: domainRecord.domain.hostname,
      normalizedUrl: domainRecord.domain.normalizedUrl,
      organizationId: input.organizationId,
      scanId: scan.id,
      submittedByUserId: input.submittedByUserId
    });
  } catch (validationRunError) {
    return {
      error: `Scan queued but validation handoff failed: ${validationRunError instanceof Error ? validationRunError.message : "Unknown error"}`,
      scanId: scan.id
    };
  }

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
