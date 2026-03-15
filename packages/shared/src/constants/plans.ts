import type { PlanCode, ScanFrequency, ScanProfile } from "../types/entities";

export const PLAN_CODES = ["free", "pro", "team"] as const satisfies readonly PlanCode[];

export type PlanDefinition = {
  code: PlanCode;
  label: string;
  priceLabel: string;
  description: string;
  coverageLabel: string;
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
    description: "Homepage-only preview",
    coverageLabel: "Homepage-only preview",
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
    description: "Expanded domain coverage",
    coverageLabel: "Expanded domain coverage",
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
    description: "Expanded domain coverage",
    coverageLabel: "Expanded domain coverage",
    maxDomains: 200,
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
