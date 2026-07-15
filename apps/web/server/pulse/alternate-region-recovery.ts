import { normalizeScanFrom, type ScanFrom } from "@website-signal-risk-scanner/shared";

export const ALTERNATE_REGION_FALLBACK_FROM = "eu_de" satisfies ScanFrom;
export const ALTERNATE_REGION_FALLBACK_REASON = "access_denied_or_forbidden_page";

export type AlternateRegionRecoveryPlan = {
  from: ScanFrom;
  reasonCode: typeof ALTERNATE_REGION_FALLBACK_REASON;
  to: typeof ALTERNATE_REGION_FALLBACK_FROM;
};

export function planAlternateRegionRecovery(input: {
  fallbackAlreadyAttempted: boolean;
  noGoReason: string | null | undefined;
  primaryScanFrom: unknown;
}): AlternateRegionRecoveryPlan | null {
  const from = normalizeScanFrom(input.primaryScanFrom);
  if (
    input.fallbackAlreadyAttempted ||
    input.noGoReason !== ALTERNATE_REGION_FALLBACK_REASON ||
    from !== "eu_ie"
  ) {
    return null;
  }

  return {
    from,
    reasonCode: ALTERNATE_REGION_FALLBACK_REASON,
    to: ALTERNATE_REGION_FALLBACK_FROM
  };
}

export function hasAlternateRegionRecoveryAttempt(requestContext: Record<string, unknown> | null | undefined) {
  const recovery = requestContext?.recovery;
  return Boolean(
    recovery &&
      typeof recovery === "object" &&
      !Array.isArray(recovery) &&
      (recovery as Record<string, unknown>).alternateRegionAttempted === true
  );
}
