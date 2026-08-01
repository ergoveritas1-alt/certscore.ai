export type CanonicalSurfaceScoreAssessment = {
  coverageConfidence?: "high" | "medium" | "low" | "insufficient" | null;
  coverageRatio?: number | null;
  scoreSource?: string | null;
  scoreValue: number | null;
  scoreVersion?: string | null;
  scoredAt?: string | null;
};

export type CanonicalSurfaceSummary = {
  cmpVendorName: string | null;
  consentAro: { accept: boolean | null; reject: boolean | null; options: boolean | null } | null;
  privacyPolicyPresent: boolean | null;
  score: number | null;
  topFindingCount: number | null;
};

function numberValue(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "boolean" ? value : null;
}

function stringValue(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Projects the small scan summary shared by Overview, Admin Scans, and API
 * Activity. The persisted canonical snapshot wins over a versioned score
 * assessment fallback. A no-go or withheld score fails closed instead of
 * borrowing values from a stale display or API response.
 */
export function projectCanonicalSurfaceSummary(input: {
  fallbackScoreAssessment?: CanonicalSurfaceScoreAssessment | null;
  noGo: boolean;
  snapshot: Record<string, unknown> | null | undefined;
}): CanonicalSurfaceSummary {
  if (input.noGo) {
    return {
      cmpVendorName: null,
      consentAro: null,
      privacyPolicyPresent: null,
      score: null,
      topFindingCount: null
    };
  }

  const snapshotScore = numberValue(input.snapshot, "certscore_overall");
  const score = snapshotScore ?? input.fallbackScoreAssessment?.scoreValue ?? null;
  const hasConsentProjection = input.snapshot?.consent_evidence_status !== null &&
    input.snapshot?.consent_evidence_status !== undefined;

  return {
    cmpVendorName: stringValue(input.snapshot, "cmp_vendor_name"),
    consentAro: hasConsentProjection
      ? {
          accept: booleanValue(input.snapshot, "consent_accept_observed"),
          reject: booleanValue(input.snapshot, "consent_reject_observed"),
          options: booleanValue(input.snapshot, "consent_options_observed")
        }
      : null,
    privacyPolicyPresent: booleanValue(input.snapshot, "privacy_policy_present"),
    score,
    topFindingCount: score === null ? null : numberValue(input.snapshot, "top_finding_count")
  };
}
