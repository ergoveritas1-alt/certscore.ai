import { getPlanDefinition } from "@website-signal-risk-scanner/shared";

export const PULSE_SCAN_COVERAGE_PLAN_CODE = "team" as const;
export const PULSE_MIN_REUSABLE_PAGES_REQUESTED = getPlanDefinition(PULSE_SCAN_COVERAGE_PLAN_CODE).maxPagesPerScan;
