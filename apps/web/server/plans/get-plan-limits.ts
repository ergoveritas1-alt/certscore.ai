"use server";

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
