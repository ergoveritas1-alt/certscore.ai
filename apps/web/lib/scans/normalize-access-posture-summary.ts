import type { AccessPostureClass, RecoverableFindingClass, ScanExecutionTier } from "@website-signal-risk-scanner/shared";

type NormalizeAccessPostureSummaryInput = {
  accessPostureClass: AccessPostureClass | null;
  highestSuccessfulTier: ScanExecutionTier | null;
  homepageFetchHttpStatus: number | null;
  homepageFetchStatus: string | null;
  pagesScanned: number;
  recoverableFindingClasses: RecoverableFindingClass[] | unknown;
  stopTier: ScanExecutionTier | null;
  totalSignals: number | null;
};

function normalizeRecoverableFindingClasses(value: unknown): RecoverableFindingClass[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is RecoverableFindingClass => typeof entry === "string")
    : [];
}

export function normalizeAccessPostureSummary(input: NormalizeAccessPostureSummaryInput) {
  const hasEarlyHomepageEvidence = input.homepageFetchHttpStatus !== null || input.homepageFetchStatus !== null;
  const isImpossibleEarlyLoss =
    input.accessPostureClass === "early_loss" && (input.totalSignals ?? 0) === 0 && input.pagesScanned === 0;

  return {
    accessPostureClass: input.accessPostureClass,
    highestSuccessfulTier: isImpossibleEarlyLoss ? null : input.highestSuccessfulTier,
    stopTier: isImpossibleEarlyLoss ? (hasEarlyHomepageEvidence ? "tier1_front_door" : null) : input.stopTier,
    recoverableFindingClasses: normalizeRecoverableFindingClasses(input.recoverableFindingClasses)
  } satisfies {
    accessPostureClass: AccessPostureClass | null;
    highestSuccessfulTier: ScanExecutionTier | null;
    stopTier: ScanExecutionTier | null;
    recoverableFindingClasses: RecoverableFindingClass[];
  };
}
