import type { ScanModuleRun } from "@certscore/contracts";

export function consentFlowRuntimeScannerPlaceholder(startedAt: string): ScanModuleRun {
  return {
    moduleName: "consentFlowRuntimeScanner",
    status: "not_run",
    startedAt,
    completedAt: startedAt,
    durationMs: 0,
    evidenceRefs: [],
    errors: ["Placeholder only. Consent-flow runtime scanner is not implemented in phase 1."],
  };
}

export function policySurfaceScannerPlaceholder(startedAt: string, reason?: string): ScanModuleRun {
  return {
    moduleName: "policySurfaceScanner",
    status: reason ? "skipped_budget" : "not_run",
    startedAt,
    completedAt: startedAt,
    durationMs: 0,
    evidenceRefs: [],
    errors: [reason ?? "Placeholder only. Policy-surface scanner is not implemented in phase 1."],
  };
}
