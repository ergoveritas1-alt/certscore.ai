"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import { getPlanDefinition, type PlanCode, type ScanFrequency, type ScanProfile } from "@website-signal-risk-scanner/shared";

export type PlanLimitRecord = {
  planCode: PlanCode;
  maxDomains: number;
  maxPagesPerScan: number;
  scanFrequency: ScanFrequency;
  manualRescanLimitPerMonth: number | null;
  scanHistoryEnabled: boolean;
  apiAccess: boolean;
  scanProfile: ScanProfile;
};

type PlanLimitsRow = {
  api_access: boolean;
  manual_rescan_limit_per_month: number | null;
  max_domains: number;
  max_pages_per_scan: number;
  plan_code: PlanCode;
  scan_history_enabled: boolean;
  scan_frequency: ScanFrequency;
};

function normalizePlanLimitRow(row: PlanLimitsRow): PlanLimitRecord {
  const plan = getPlanDefinition(row.plan_code);

  return {
    planCode: row.plan_code,
    maxDomains: row.max_domains,
    maxPagesPerScan: row.max_pages_per_scan,
    scanFrequency: row.scan_frequency,
    manualRescanLimitPerMonth: row.manual_rescan_limit_per_month,
    scanHistoryEnabled: row.scan_history_enabled,
    apiAccess: row.api_access,
    scanProfile: plan.scanProfile
  };
}

function getFallbackPlanLimits(planCode: PlanCode): PlanLimitRecord {
  const plan = getPlanDefinition(planCode);

  return {
    planCode,
    maxDomains: plan.maxDomains,
    maxPagesPerScan: plan.maxPagesPerScan,
    scanFrequency: plan.scanFrequency,
    manualRescanLimitPerMonth: plan.manualRescanLimitPerMonth,
    scanHistoryEnabled: plan.scanHistoryEnabled,
    apiAccess: plan.apiAccess,
    scanProfile: plan.scanProfile
  };
}

export async function getPlanLimits(planCode: PlanCode): Promise<PlanLimitRecord> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("plan_limits").select("*").eq("plan_code", planCode).maybeSingle();

  if (!data) {
    return getFallbackPlanLimits(planCode);
  }

  return normalizePlanLimitRow(data as PlanLimitsRow);
}
