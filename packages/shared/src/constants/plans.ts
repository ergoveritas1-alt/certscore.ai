import type { PlanCode, ScanFrequency, ScanProfile } from "../types/entities";

export const PLAN_CODES = ["free", "individual", "pro", "team"] as const satisfies readonly PlanCode[];

export type PlanDefinition = {
  code: PlanCode;
  label: string;
  priceLabel: string;
  priceNote: string;
  description: string;
  coverageLabel: string;
  monthlyPageScanLabel: string;
  summary: string;
  trialLabel?: string;
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
    label: "Trial",
    priceLabel: "$0",
    priceNote: "for 7 days",
    description: "One-week trial for trying CertScore with a small scan allowance.",
    coverageLabel: "10 page scans / trial",
    monthlyPageScanLabel: "10 page scans included during the trial",
    summary: "Try the scan workflow before choosing a monthly plan.",
    trialLabel: "One-week free trial",
    maxDomains: 1,
    maxPagesPerScan: 3,
    scanFrequency: "manual",
    scanProfile: "homepage",
    manualRescanLimitPerMonth: 10,
    scanHistoryEnabled: false,
    apiAccess: false
  },
  {
    code: "individual",
    label: "Starter",
    priceLabel: "$40/mo",
    priceNote: "per month",
    description: "For teams that need repeatable page-level checks without a large volume commitment.",
    coverageLabel: "50 page scans / month",
    monthlyPageScanLabel: "50 page scans / month",
    summary: "For teams that need repeatable page-level checks without a large volume commitment.",
    maxDomains: 1,
    maxPagesPerScan: 5,
    scanFrequency: "hourly",
    scanProfile: "standard",
    manualRescanLimitPerMonth: 50,
    scanHistoryEnabled: true,
    apiAccess: false
  },
  {
    code: "pro",
    label: "Pro",
    priceLabel: "$200/mo",
    priceNote: "per month",
    description: "For ongoing review work, more page coverage, and recurring scan history.",
    coverageLabel: "500 page scans / month",
    monthlyPageScanLabel: "500 page scans / month",
    summary: "For ongoing review work, more page coverage, and recurring scan history.",
    maxDomains: 20,
    maxPagesPerScan: 5,
    scanFrequency: "hourly",
    scanProfile: "standard",
    manualRescanLimitPerMonth: 500,
    scanHistoryEnabled: true,
    apiAccess: false
  },
  {
    code: "team",
    label: "Custom",
    priceLabel: "Custom",
    priceNote: "custom monthly plan",
    description: "For higher-volume page scanning, portfolio workflows, API access, and custom evidence needs.",
    coverageLabel: "Custom page-scan volume",
    monthlyPageScanLabel: "Custom page-scan volume",
    summary: "For higher-volume page scanning, portfolio workflows, API access, and custom evidence needs.",
    maxDomains: 100,
    maxPagesPerScan: 5,
    scanFrequency: "hourly",
    scanProfile: "team",
    manualRescanLimitPerMonth: 2000,
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
