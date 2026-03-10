import type { PlanCode, ScanFrequency, ScanProfile } from "../types/entities";

export const PLAN_CODES = ["free", "pro", "team"] as const satisfies readonly PlanCode[];

export type PlanDefinition = {
  code: PlanCode;
  label: string;
  priceLabel: string;
  description: string;
  maxDomains: number;
  maxPagesPerScan: number;
  scanFrequency: ScanFrequency;
  scanProfile: ScanProfile;
  manualRescanLimitPerMonth: number;
  scanHistoryEnabled: boolean;
  apiAccess: boolean;
};

export const PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    code: "free",
    label: "Free",
    priceLabel: "$0",
    description: "One website with lightweight scans and one scan each month.",
    maxDomains: 1,
    maxPagesPerScan: 3,
    scanFrequency: "manual",
    scanProfile: "homepage",
    manualRescanLimitPerMonth: 1,
    scanHistoryEnabled: false,
    apiAccess: false
  },
  {
    code: "pro",
    label: "Pro",
    priceLabel: "$79/mo",
    description: "Up to three websites with on-demand scans up to hourly.",
    maxDomains: 3,
    maxPagesPerScan: 5,
    scanFrequency: "hourly",
    scanProfile: "standard",
    manualRescanLimitPerMonth: 90,
    scanHistoryEnabled: false,
    apiAccess: false
  },
  {
    code: "team",
    label: "Ultra",
    priceLabel: "$149/mo",
    description: "Up to fifty websites with scan history, API access, and scans up to hourly.",
    maxDomains: 50,
    maxPagesPerScan: 5,
    scanFrequency: "hourly",
    scanProfile: "team",
    manualRescanLimitPerMonth: 600,
    scanHistoryEnabled: true,
    apiAccess: true
  }
];

export const PLAN_DEFINITION_MAP = Object.fromEntries(
  PLAN_DEFINITIONS.map((definition) => [definition.code, definition])
) as Record<PlanCode, PlanDefinition>;

export function getPlanDefinition(planCode: PlanCode): PlanDefinition {
  return PLAN_DEFINITION_MAP[planCode];
}
