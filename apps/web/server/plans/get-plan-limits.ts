"use server";

import { getPlanDefinition, type PlanCode, type ScanFrequency, type ScanProfile } from "@website-signal-risk-scanner/shared";
import { queryOne } from "@website-signal-risk-scanner/db";

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

export async function getPlanLimits(planCode: PlanCode): Promise<PlanLimitRecord> {
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

export function applyManualRescanLimitOverride(
  limits: PlanLimitRecord,
  manualRescanLimitOverride: number | null | undefined
): PlanLimitRecord {
  if (
    typeof manualRescanLimitOverride !== "number" ||
    !Number.isFinite(manualRescanLimitOverride) ||
    manualRescanLimitOverride < 0
  ) {
    return limits;
  }

  return {
    ...limits,
    manualRescanLimitPerMonth: Math.floor(manualRescanLimitOverride)
  };
}

export async function getOrganizationManualRescanLimitOverride(organizationId: string): Promise<number | null> {
  const row = await queryOne<{ manual_rescan_limit_override: number | null }>(
    `select manual_rescan_limit_override
       from organizations
      where id = $1`,
    [organizationId],
    { readOnly: true }
  );

  return row?.manual_rescan_limit_override ?? null;
}
