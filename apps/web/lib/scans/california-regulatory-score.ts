import {deriveCaliforniaGpcResponsePolicy} from "./california-gpc-response-policy";
import { accessibilityFindingDeductionBreakdown } from "./accessibility-score-policy";
import { californiaOptOutCollectionPolicy } from "./california-opt-out-collection-policy";
import { californiaChoiceEnforcementPoints, CALIFORNIA_CHOICE_ENFORCEMENT_POLICY_KEY } from "./california-choice-enforcement-policy";
import { CALIFORNIA_SCORING_POLICY_VERSION, CALIFORNIA_SCORING_RULES, CALIFORNIA_SCORING_RULES_V1, CALIFORNIA_SCORING_RULES_V4_V7, CALIFORNIA_SCORING_RULES_V2_V3, CALIFORNIA_SHARED_NOTICE_POINTS } from "./scoring-policy";
import {
  californiaPrivacyReviewFindingIds,
  californiaPrivacyReviewSchema,
  type CaliforniaPrivacyReview,
} from "@certscore/contracts";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

export const CALIFORNIA_REGULATORY_SCORE_VERSION = CALIFORNIA_SCORING_POLICY_VERSION;
const PRE_TRANSFER_SCORE_VERSION = "california-regulatory-posture.v7" as const;
const CLAUSE_PREDECESSOR_SCORE_VERSION = "california-regulatory-posture.v4" as const;
const CLAUSE_SCORE_VERSION = "california-regulatory-posture.v5" as const;
const REFINED_SCORE_VERSION = "california-regulatory-posture.v6" as const;
const CAPTURE_BASED_SCORE_VERSION = "california-regulatory-posture.v3" as const;
const COVERAGE_GATED_SCORE_VERSION = "california-regulatory-posture.v2" as const;
const LEGACY_SCORE_VERSION = "california-regulatory-posture.v1" as const;
export const CALIFORNIA_REGULATORY_SCORE_FLOOR = 0;
export const CALIFORNIA_SHARED_PRIVACY_NOTICE_KEY = "california.shared_privacy_notice_unavailable";
const LEGACY_SCORE_RULES = CALIFORNIA_SCORING_RULES_V1;
export const CALIFORNIA_REGULATORY_SCORE_RULES = CALIFORNIA_SCORING_RULES;
function rulesForVersion(version:string) {
  return version === LEGACY_SCORE_VERSION ? LEGACY_SCORE_RULES : version === CALIFORNIA_REGULATORY_SCORE_VERSION ? CALIFORNIA_SCORING_RULES : new Set<string>([PRE_TRANSFER_SCORE_VERSION,REFINED_SCORE_VERSION,CLAUSE_SCORE_VERSION,CLAUSE_PREDECESSOR_SCORE_VERSION]).has(version) ? CALIFORNIA_SCORING_RULES_V4_V7 : CALIFORNIA_SCORING_RULES_V2_V3;
}
function scoreVersion(version:string) {
  return version === "certscore.california-privacy-review.v1" ? LEGACY_SCORE_VERSION :
    version === "certscore.california-privacy-review.v2" ? COVERAGE_GATED_SCORE_VERSION :
    version === "certscore.california-privacy-review.v3" ? CAPTURE_BASED_SCORE_VERSION : version === "certscore.california-privacy-review.v4" ? CLAUSE_PREDECESSOR_SCORE_VERSION : version === "certscore.california-privacy-review.v5"?CLAUSE_SCORE_VERSION:version === "certscore.california-privacy-review.v6"?REFINED_SCORE_VERSION:version === "certscore.california-privacy-review.v10"?CALIFORNIA_REGULATORY_SCORE_VERSION:PRE_TRANSFER_SCORE_VERSION;
}

export type CaliforniaRegulatoryScore = {
  policyVersion: typeof CALIFORNIA_REGULATORY_SCORE_VERSION | "california-regulatory-posture.v9" | typeof PRE_TRANSFER_SCORE_VERSION | typeof LEGACY_SCORE_VERSION | typeof COVERAGE_GATED_SCORE_VERSION | typeof CAPTURE_BASED_SCORE_VERSION | typeof CLAUSE_PREDECESSOR_SCORE_VERSION | typeof CLAUSE_SCORE_VERSION | typeof REFINED_SCORE_VERSION;
  score: number | null;
  scope: "starting_page";
  coverage: "bounded" | "limited" | "unavailable";
  assessmentSourceHash: string | null;
  deductions: Array<{ findingId: string; policyKey: string; label: string; points: number }>;
  reviewCoverage?: import("@certscore/contracts").CaliforniaReviewCoverage;
  rightsAssessment?: import("@certscore/contracts").CaliforniaRightsClauseAssessment;
  collectionNoticeAssessment?: import("@certscore/contracts").CaliforniaCollectionNoticeAssessment | import("@certscore/contracts").CaliforniaCollectionNoticeV2 | import("@certscore/contracts").CaliforniaCollectionNoticeV3 | import("@certscore/contracts").CaliforniaCollectionNoticeV4 | import("@certscore/contracts").CaliforniaCollectionNoticeV5;
  saleSharingAssessment?: import("@certscore/contracts").CaliforniaSaleSharingAssessment;
};

/** Only canonical, reportable California findings can carry the new policy effect. */
export function californiaFindingScoreEffect(id: string, evidenceRef: string, assessmentVersion = "certscore.california-privacy-review.v1", assessment?: CaliforniaPrivacyReview) {
  const version = scoreVersion(assessmentVersion);
  const rule = rulesForVersion(version).find(candidate => candidate.findingId === id);
  const choice = id === "california_sale_sharing_opt_out_activity" && version === CALIFORNIA_REGULATORY_SCORE_VERSION
    ? californiaOptOutCollectionPolicy(assessment) : null;
  if (choice && !choice.supportedConcern) return [];
  return rule ? [{ appliesTo: "california_posture" as const, framework: "california" as const,
    deductionPoints: choice?.points ?? rule.points, evidenceRefs: [evidenceRef], observedActivity: choice?.recipientIds ?? [],
    policyKey: rule.policyKey, policyVersion: version,
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
  const legacy = assessment.contractVersion === "certscore.california-privacy-review.v1";
  const policyVersion = scoreVersion(assessment.contractVersion);
  const rules = rulesForVersion(policyVersion);

  const deductions: CaliforniaRegulatoryScore["deductions"] = [];
  const explicitChoice = californiaOptOutCollectionPolicy(assessment);
  const choiceRecipients = new Set<string>();
  let choiceSupported = false;
  let gpcChoiceSupported = false;
  const eligibleRules=rules.filter(rule=>rule.findingId !== "california_sale_sharing_opt_out_activity" ||
    policyVersion !== CALIFORNIA_REGULATORY_SCORE_VERSION || assessment.optOutObservation?.evidence.requests.some(row=>row.collectionEvidence));
  for (const rule of eligibleRules) {
    const isChoice = rule.findingId === "california_sale_sharing_opt_out_activity" && policyVersion === CALIFORNIA_REGULATORY_SCORE_VERSION;
    const points = isChoice ? explicitChoice.points : rule.points;
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
        (effect.policyVersion === policyVersion ||
          // v11 adds the shared WCAG aggregate; the v10 privacy rules and
          // evidence gates are identical, so retained v10 effects stay valid.
          (policyVersion === CALIFORNIA_REGULATORY_SCORE_VERSION && effect.policyVersion === "california-regulatory-posture.v10-recipients")) &&
        effect.policyKey === rule.policyKey &&
        effect.deductionPoints === points))) return unavailable;
    if (projected.length) {
      deductions.push({findingId: rule.findingId, policyKey: rule.policyKey, label: rule.label, points});
      if (isChoice) {
        choiceSupported = explicitChoice.supportedConcern;
        explicitChoice.recipientIds.forEach(id => choiceRecipients.add(id));
      }
    }
  }
  if (californiaPrivacyReviewFindingIds(assessment).some(id => eligibleRules.some(rule => rule.findingId === id) && !deductions.some(row => row.findingId === id))) return unavailable;
  if (assessment.contractVersion === "certscore.california-privacy-review.v10") {
    const finding=input.unifiedFindings.find(row=>row.unifiedFindingId === "gpc_response" && row.presentationDecision.status === "surface" &&
      row.surfacingDecision?.reportable === true && row.concernContext?.promotionEligibilities.includes("eligible") &&
      row.concernContext?.externalSurfacingEligibilities.includes("eligible"));
    if (finding?.details?.family === "privacy_signal" && finding.details.kind === "gpc_response") {
      const policy=deriveCaliforniaGpcResponsePolicy(finding.details.assessment);
      const effect=finding.scoreEffects?.find(e=>e.appliesTo === "california_posture" && e.policyVersion === policy.policyVersion &&
        e.policyKey === policy.policyKey && e.deductionPoints === policy.deductionPoints);
      if (policy.scoreEffect === "deduction" && effect && finding.details.assessment.contractVersion === "certscore.gpc-response-assessment.v3" &&
        finding.details.assessment.observation.scanId === assessment.scanId) {
        choiceSupported = true;
        gpcChoiceSupported = true;
        policy.recipientIds?.forEach(id => choiceRecipients.add(id));
      }
    }
  }
  if (choiceSupported) {
    // Union canonical entity identities across both choices. The initial effect
    // includes the first recipient and a contradiction; neither is additive.
    const explicit = deductions.findIndex(row => row.findingId === "california_sale_sharing_opt_out_activity");
    if (explicit >= 0) deductions.splice(explicit, 1);
    deductions.push({ findingId: gpcChoiceSupported ? "gpc_response" : "california_sale_sharing_opt_out_activity",
      policyKey: CALIFORNIA_CHOICE_ENFORCEMENT_POLICY_KEY, label: "Verified privacy-choice enforcement risk",
      points: californiaChoiceEnforcementPoints([...choiceRecipients], true) });
  }
  // Reuse a supported canonical checklist gap; missing or inconclusive policy
  // evidence does not become a California deduction.
  const sharedNotice = input.checklistRows.find(row => row.id === "privacy_notice_availability");
  if (sharedNotice?.assessmentStatus === "gap_observed" && sharedNotice.evidenceState === "not_observed") {
    deductions.push({findingId: "regulatory_gap__gdpr_eprivacy__privacy_notice_availability",
      policyKey: CALIFORNIA_SHARED_PRIVACY_NOTICE_KEY, label: "Privacy notice unavailable", points: CALIFORNIA_SHARED_NOTICE_POINTS});
  }
  const ready = legacy ? assessment.inspection?.coverage === "complete" && assessment.choiceSurface !== "unknown" : assessment.reviewCoverage.scoreReady;
  const coverage = ready && ((legacy || assessment.contractVersion === "certscore.california-privacy-review.v2") || assessment.reviewCoverage.families.every(row=>["observed","assessed_gap","not_triggered_in_scope"].includes(row.status))) ? "bounded" : "limited";
  // Verified governing notice evidence can support the bounded risk score even
  // when unrelated runtime capture is incomplete. Coverage stays limited and
  // unknown checks never become observed passes or deductions.
  const retainedPolicy = policyVersion === CALIFORNIA_REGULATORY_SCORE_VERSION &&
    assessment.contractVersion === "certscore.california-privacy-review.v10" &&
    assessment.reviewCoverage.sourceDocuments.some(document=>document.complete);
  const scoreAvailable = ready || deductions.length > 0 || retainedPolicy;
  if (policyVersion === CALIFORNIA_REGULATORY_SCORE_VERSION) {
    const accessibility = accessibilityFindingDeductionBreakdown(input.unifiedFindings);
    for (const rule of accessibility.rules) deductions.push({
      findingId: rule.ruleId, policyKey: `accessibility.${rule.ruleId}`,
      label: rule.label, points: rule.policyDeductionPoints,
    });
  }
  const score = scoreAvailable
    ? Math.max(CALIFORNIA_REGULATORY_SCORE_FLOOR, 100 - deductions.reduce((sum, row) => sum + row.points, 0))
    : null;
  return { policyVersion, score, scope: "starting_page", coverage, assessmentSourceHash: assessment.sourceHash, deductions,
    ...(!legacy ? {reviewCoverage:assessment.reviewCoverage} : {}),
    ...(assessment.contractVersion === "certscore.california-privacy-review.v5" || assessment.contractVersion === "certscore.california-privacy-review.v6" || (assessment.contractVersion === "certscore.california-privacy-review.v7" || (assessment.contractVersion === "certscore.california-privacy-review.v8" || (assessment.contractVersion === "certscore.california-privacy-review.v9" || assessment.contractVersion === "certscore.california-privacy-review.v10"))) ? {rightsAssessment:assessment.rightsAssessment,collectionNoticeAssessment:assessment.collectionNoticeAssessment} : {}),
    ...(assessment.contractVersion === "certscore.california-privacy-review.v6" || (assessment.contractVersion === "certscore.california-privacy-review.v7" || (assessment.contractVersion === "certscore.california-privacy-review.v8" || (assessment.contractVersion === "certscore.california-privacy-review.v9" || assessment.contractVersion === "certscore.california-privacy-review.v10")))?{saleSharingAssessment:assessment.saleSharingAssessment}:{}) };
}
