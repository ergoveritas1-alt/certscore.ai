import { MAX_COLLECTION_SURFACE_CONTROL_INDEX } from "@certscore/contracts";

/** Capture scheduling only. These limits cannot establish absence, rank findings,
 * alter severity, or authorize interactions. Existing lane deadlines still win. */
export const EVIDENCE_WORK_POLICY = {
  version: "breadth_before_detail.v1",
  finalizationReserveMs: 250,
  // Spend a bounded portion of the existing preference deadline on lazy panel
  // hydration. The protected capture reserve and overall compute envelope remain fixed.
  preferences: { basicCaptureReserveMs: 1_000, panelOpeningBudgetMs: 1_000, registeredLazyPanelOpeningBudgetMs: 3_000 },
  runtimeSnapshot: {
    storageBudgetMs: 100,
    storageKeysPerArea: 10_000,
    fieldDetailBudgetMs: 250,
    fieldDiscoveryBudgetMs: 50,
    fieldDiscoveryCandidates: MAX_COLLECTION_SURFACE_CONTROL_INDEX + 1,
    fieldGroups: 50,
    renderedLinkBudgetMs: 200,
    shadowDiscoveryBudgetMs: 100,
    shadowElements: 10_000,
    shadowRoots: 32,
    anchors: 1_000,
  },
} as const;

/** Optional work only spends time left after the protected work and handoff.
 * No task receives a fresh timeout after waiting behind another task. */
export function optionalEvidenceAllowance(input: {
  remainingMs: number;
  maximumMs: number;
  requiredReserveMs?: number;
}): number {
  if (![input.remainingMs, input.maximumMs, input.requiredReserveMs ?? 0].every(value => Number.isFinite(value) && value >= 0)) return 0;
  return Math.max(0, Math.min(input.maximumMs,
    input.remainingMs - (input.requiredReserveMs ?? 0) - EVIDENCE_WORK_POLICY.finalizationReserveMs));
}
