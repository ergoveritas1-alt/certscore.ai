import {
  consentControlAssessmentSchema,
  type ConsentControlAssessment
} from "@certscore/contracts";

export function assessmentSurfaceCompatibilityState(
  assessment: ConsentControlAssessment
): boolean | null {
  return assessment.surface.status === "observed_actionable" ||
      assessment.surface.status === "observed_non_actionable"
    ? true
    : assessment.surface.status === "not_observed" &&
        assessment.assessmentStatus === "complete" &&
        assessment.coverage.status === "complete"
      ? false
      : null;
}

export function canonicalConsentSurfaceCompatibilityFromSnapshot(
  snapshot: Record<string, unknown> | null | undefined
): boolean | null {
  const parsed = consentControlAssessmentSchema.safeParse(snapshot?.consent_control_assessment);
  return parsed.success ? assessmentSurfaceCompatibilityState(parsed.data) : null;
}

export function withCanonicalConsentSnapshotCompatibility(
  snapshot: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...snapshot,
    cookie_banner_present: canonicalConsentSurfaceCompatibilityFromSnapshot(snapshot)
  };
}
