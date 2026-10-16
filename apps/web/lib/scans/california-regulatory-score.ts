import {
  CALIFORNIA_CHOICE_ABSENCE_ID,
  CALIFORNIA_CHOICE_DESTINATION_ID,
  CALIFORNIA_NOTICE_DESTINATION_ID,
  CALIFORNIA_OPT_OUT_ACTIVITY_ID,
  CALIFORNIA_RIGHTS_DESTINATION_ID,
  californiaPrivacyReviewFindingIds,
  californiaPrivacyReviewSchema,
  type CaliforniaPrivacyReview,
} from "@certscore/contracts";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

export const CALIFORNIA_REGULATORY_SCORE_VERSION = "california-regulatory-posture.v1" as const;
export const CALIFORNIA_REGULATORY_SCORE_FLOOR = 0;
export const CALIFORNIA_SHARED_PRIVACY_NOTICE_KEY = "california.shared_privacy_notice_unavailable";
export const CALIFORNIA_REGULATORY_SCORE_RULES = [
  { findingId: CALIFORNIA_OPT_OUT_ACTIVITY_ID, policyKey: "california.opt_out_activity", points: 18, label: "Activity after a recorded sale/sharing opt-out" },
  { findingId: CALIFORNIA_CHOICE_DESTINATION_ID, policyKey: "california.choice_destination_error", points: 14, label: "Privacy-choice destination unavailable" },
  { findingId: CALIFORNIA_NOTICE_DESTINATION_ID, policyKey: "california.notice_destination_error", points: 10, label: "Notice-at-collection destination unavailable" },
  { findingId: CALIFORNIA_RIGHTS_DESTINATION_ID, policyKey: "california.rights_destination_error", points: 10, label: "California rights-information destination unavailable" },
  { findingId: CALIFORNIA_CHOICE_ABSENCE_ID, policyKey: "california.named_choice_not_observed", points: 6, label: "Named sale/sharing choice not identified in a complete inspection" },
] as const;

export type CaliforniaRegulatoryScore = {
  policyVersion: typeof CALIFORNIA_REGULATORY_SCORE_VERSION;
  score: number | null;
  scope: "starting_page";
  coverage: "bounded" | "limited" | "unavailable";
  assessmentSourceHash: string | null;
  deductions: Array<{ findingId: string; policyKey: string; label: string; points: number }>;
};

/** Only canonical, reportable California findings can carry the new policy effect. */
export function californiaFindingScoreEffect(id: string, evidenceRef: string) {
  const rule = CALIFORNIA_REGULATORY_SCORE_RULES.find(candidate => candidate.findingId === id);
  return rule ? [{ appliesTo: "california_posture" as const, framework: "california" as const,
    deductionPoints: rule.points, evidenceRefs: [evidenceRef], observedActivity: [],
    policyKey: rule.policyKey, policyVersion: CALIFORNIA_REGULATORY_SCORE_VERSION,
    reasonCode: "verified_reportable_california_finding" }] : [];
}

export function deriveCaliforniaRegulatoryScore(input: {
  assessment: CaliforniaPrivacyReview | null | undefined;
  checklistRows: GdprEprivacyCoverageChecklistItem[];
  unifiedFindings: UnifiedFindingDisplayPacket[];
}): CaliforniaRegulatoryScore {
  const parsed = californiaPrivacyReviewSchema.safeParse(input.assessment);
  const assessment = parsed.success ? parsed.data : null;
  const unavailable = { policyVersion: CALIFORNIA_REGULATORY_SCORE_VERSION, score: null,
    scope: "starting_page" as const, coverage: "unavailable" as const,
    assessmentSourceHash: null, deductions: [] };
  if (!assessment) return unavailable;

  const deductions: CaliforniaRegulatoryScore["deductions"] = [];
  for (const rule of CALIFORNIA_REGULATORY_SCORE_RULES) {
    const projected = input.unifiedFindings.filter(finding =>
      finding.unifiedFindingId === rule.findingId &&
      finding.presentationDecision.status === "surface" && finding.surfacingDecision?.reportable === true &&
      finding.concernContext?.promotionEligibilities.includes("eligible") &&
      finding.concernContext?.externalSurfacingEligibilities.includes("eligible") &&
      finding.details?.family === "california_privacy_review");
    // Old or mismatched packets cannot be silently reinterpreted under v1.
    if (projected.some(finding =>
      finding.details?.family !== "california_privacy_review" ||
      finding.details.projection.scanId !== assessment.scanId ||
      finding.details.projection.sourceHash !== assessment.sourceHash ||
      !finding.scoreEffects?.some(effect => effect.appliesTo === "california_posture" &&
        effect.policyVersion === CALIFORNIA_REGULATORY_SCORE_VERSION && effect.policyKey === rule.policyKey &&
        effect.deductionPoints === rule.points))) return unavailable;
    if (projected.length) deductions.push({findingId: rule.findingId, policyKey: rule.policyKey, label: rule.label, points: rule.points});
  }
  if (californiaPrivacyReviewFindingIds(assessment).some(id => !deductions.some(row => row.findingId === id))) return unavailable;
  // Reuse a supported canonical checklist gap; missing or inconclusive policy
  // evidence does not become a California deduction.
  const sharedNotice = input.checklistRows.find(row => row.id === "privacy_notice_availability");
  if (sharedNotice?.assessmentStatus === "gap_observed" && sharedNotice.evidenceState === "not_observed") {
    deductions.push({findingId: "regulatory_gap__gdpr_eprivacy__privacy_notice_availability",
      policyKey: CALIFORNIA_SHARED_PRIVACY_NOTICE_KEY, label: "Privacy notice unavailable", points: 10});
  }
  const coverage = assessment.inspection?.coverage === "complete" && assessment.choiceSurface !== "unknown" ? "bounded" : "limited";
  // A clean 100 requires a complete named-choice inspection. With partial
  // coverage, only directly supported findings can yield a numeric risk signal.
  const score = coverage === "bounded" || deductions.length > 0
    ? Math.max(CALIFORNIA_REGULATORY_SCORE_FLOOR, 100 - deductions.reduce((sum, row) => sum + row.points, 0))
    : null;
  return { policyVersion: CALIFORNIA_REGULATORY_SCORE_VERSION, score,
    scope: "starting_page", coverage, assessmentSourceHash: assessment.sourceHash, deductions };
}
