import { CALIFORNIA_AGENT_REGISTRATION_ID, californiaAgentRegistrationProjectionSchema, CALIFORNIA_RIGHTS_DISCLOSURE_ID, californiaPrivacyReviewSchema } from "@certscore/contracts";

/** Editorial selection over an already-projected finding. The underlying
 * finding, eligibility, evidence and score effects remain available in detail.
 * Missing metadata never lets a title or summary stand in for assessed topics. */
export function isDetailedOnlyCaliforniaDisclosure(finding: {
  id?: string;
  evidenceJson?: Record<string, unknown>;
}): boolean {
  if (finding.id === CALIFORNIA_AGENT_REGISTRATION_ID)
    return californiaAgentRegistrationProjectionSchema.safeParse(finding.evidenceJson?.agentRegistrationProjection).success;
  if (finding.id !== CALIFORNIA_RIGHTS_DISCLOSURE_ID) return false;
  const parsed = californiaPrivacyReviewSchema.safeParse(finding.evidenceJson?.californiaPrivacyReview);
  if (!parsed.success) return false;
  const review = parsed.data;
  const topics = "rightsAssessment" in review ? review.rightsAssessment?.topics
    : review.contractVersion === "certscore.california-privacy-review.v4" ? review.disclosureInspection?.topics : undefined;
  const missing = topics?.filter(topic => topic.status === "not_observed");
  return missing?.length === 1 && missing[0]?.topic === "non_discrimination";
}
