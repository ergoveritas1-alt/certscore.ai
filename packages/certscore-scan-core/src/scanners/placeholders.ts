import type { ScanModuleRun } from "@certscore/contracts";

export function consentFlowRuntimeScannerPlaceholder(startedAt: string, reason?: string): ScanModuleRun {
  return {
    moduleName: "consentFlowRuntimeScanner",
    status: reason ? "not_testable" : "not_run",
    startedAt,
    completedAt: startedAt,
    durationMs: 0,
    evidenceRefs: [],
    errors: [reason ?? "Placeholder only. Consent-flow runtime scanner is not implemented in phase 1."],
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
