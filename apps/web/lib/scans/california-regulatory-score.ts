import { siteIntegrityFindingEffects, siteIntegrityDeduction, CALIFORNIA_SITE_INTEGRITY_SCORE_VERSION, SITE_INTEGRITY_SCORE_POLICY_KEY } from "./site-integrity-score-policy";
import { SITE_INTEGRITY_POLICY_VERSION, SITE_INTEGRITY_FINDING_ID } from "@certscore/contracts";
import { californiaAgentRegistrationProjectionSchema } from "@certscore/contracts";
import { CALIFORNIA_AGENT_REGISTRATION_RULE, CALIFORNIA_AGENT_REGISTRATION_SCORE_VERSION, CALIFORNIA_REGISTRATION_ABSORBING_RIGHTS_IDS } from "./scoring-policy";
import {supportsCombinedOptOutRisk} from "./california-combined-opt-out-policy";
import {CALIFORNIA_COMBINED_OPT_OUT_POLICY} from "@certscore/contracts";
import {CALIFORNIA_COMBINED_OPT_OUT_SCORE_VERSION,CALIFORNIA_COMBINED_OPT_OUT_SCORING_RULES} from "./scoring-policy";
import {frictionlessGpcLinkEvidenceConsistent} from "@certscore/contracts";
import {supportsCaliforniaRuntimeLink} from "./california-runtime-link-policy";
import {CALIFORNIA_RUNTIME_LINK_POLICY,CALIFORNIA_NINE_POINT_LINK_POLICY} from "@certscore/contracts";
import {californiaPotentialRiskSchema,potentialRiskRecipients,CA_POTENTIAL_RISK_FINDING,CA_POTENTIAL_RISK_POLICY,potentialRiskPoints,potentialRiskIncrement,CA_POTENTIAL_RISK_LEGACY_POLICY} from "./california-potential-risk-policy";
import {deriveCaliforniaGpcResponsePolicy} from "./california-gpc-response-policy";
import {californiaPostRejectAssessmentSchema,californiaPostRejectPoints,CALIFORNIA_POST_REJECT_POLICY,CALIFORNIA_POST_REJECT_FINDING} from "./california-post-reject-policy";
import {deriveGppPropagationPolicy, GPP_PROPAGATION_FINDING_ID, GPP_PROPAGATION_POLICY_KEY, GPP_PROPAGATION_POINTS} from "./gpp-propagation-policy";
import { accessibilityFindingDeductionBreakdown } from "./accessibility-score-policy";
import { californiaOptOutCollectionPolicy } from "./california-opt-out-collection-policy";
import { californiaChoiceEnforcementPoints, CALIFORNIA_CHOICE_ENFORCEMENT_POLICY_KEY } from "./california-choice-enforcement-policy";
import { CALIFORNIA_NINE_POINT_LINK_SCORE_VERSION, CALIFORNIA_NINE_POINT_LINK_SCORING_RULES, CALIFORNIA_RUNTIME_LINK_SCORE_VERSION, CALIFORNIA_DISCLOSURE_CHOICE_SCORE_VERSION, CALIFORNIA_DISCLOSURE_CHOICE_SCORING_RULES, CALIFORNIA_NON_DISCRIMINATION_ONLY_POINTS, CALIFORNIA_SCORING_POLICY_VERSION, CALIFORNIA_SCORING_RULES, CALIFORNIA_SCORING_RULES_V1, CALIFORNIA_SCORING_RULES_V4_V7, CALIFORNIA_SCORING_RULES_V2_V3, CALIFORNIA_SHARED_NOTICE_POINTS } from "./scoring-policy";
import {
  californiaPrivacyReviewFindingIds,
  californiaPrivacyReviewSchema,
  type CaliforniaPrivacyReview,
} from "@certscore/contracts";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

export const CALIFORNIA_REGULATORY_SCORE_VERSION = CALIFORNIA_SCORING_POLICY_VERSION;
export const CALIFORNIA_GPP_SCORE_VERSION = "california-regulatory-posture.v13-gpp" as const;
export const CALIFORNIA_REJECT_SCORE_VERSION = "california-regulatory-posture.v14-reject" as const;
const PRE_OBSERVED_SCORE_VERSION = "california-regulatory-posture.v11-wcag" as const;
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
export const CALIFORNIA_REGULATORY_SCORE_RULES = [...CALIFORNIA_COMBINED_OPT_OUT_SCORING_RULES, CALIFORNIA_AGENT_REGISTRATION_RULE];
export {CALIFORNIA_COMBINED_OPT_OUT_SCORE_VERSION,CALIFORNIA_DISCLOSURE_CHOICE_SCORE_VERSION,CALIFORNIA_RUNTIME_LINK_SCORE_VERSION,CALIFORNIA_NINE_POINT_LINK_SCORE_VERSION};
const isDisclosureChoiceScore=(version:string)=>version === CALIFORNIA_COMBINED_OPT_OUT_SCORE_VERSION || version === CALIFORNIA_NINE_POINT_LINK_SCORE_VERSION || version === CALIFORNIA_DISCLOSURE_CHOICE_SCORE_VERSION || version === CALIFORNIA_RUNTIME_LINK_SCORE_VERSION;
function rulesForVersion(version:string) {
  return version === CALIFORNIA_COMBINED_OPT_OUT_SCORE_VERSION ? CALIFORNIA_COMBINED_OPT_OUT_SCORING_RULES : version === CALIFORNIA_NINE_POINT_LINK_SCORE_VERSION ? CALIFORNIA_NINE_POINT_LINK_SCORING_RULES : isDisclosureChoiceScore(version) ? CALIFORNIA_DISCLOSURE_CHOICE_SCORING_RULES : version === LEGACY_SCORE_VERSION ? LEGACY_SCORE_RULES : (version === CALIFORNIA_REGULATORY_SCORE_VERSION || version === PRE_OBSERVED_SCORE_VERSION) ? CALIFORNIA_SCORING_RULES : new Set<string>([PRE_TRANSFER_SCORE_VERSION,REFINED_SCORE_VERSION,CLAUSE_SCORE_VERSION,CLAUSE_PREDECESSOR_SCORE_VERSION]).has(version) ? CALIFORNIA_SCORING_RULES_V4_V7 : CALIFORNIA_SCORING_RULES_V2_V3;
}
function scoreVersion(version:string, assessment?:CaliforniaPrivacyReview) {
  if (assessment?.contractVersion === "certscore.california-privacy-review.v10" && assessment.disclosureChoiceAssessment)
    return assessment.disclosureChoiceAssessment.policyVersion === CALIFORNIA_COMBINED_OPT_OUT_POLICY ? CALIFORNIA_COMBINED_OPT_OUT_SCORE_VERSION : assessment.disclosureChoiceAssessment.policyVersion === CALIFORNIA_NINE_POINT_LINK_POLICY ? CALIFORNIA_NINE_POINT_LINK_SCORE_VERSION : assessment.disclosureChoiceAssessment.policyVersion === CALIFORNIA_RUNTIME_LINK_POLICY ? CALIFORNIA_RUNTIME_LINK_SCORE_VERSION : CALIFORNIA_DISCLOSURE_CHOICE_SCORE_VERSION;
  if (assessment?.contractVersion === "certscore.california-privacy-review.v10" && assessment.observedScoreBasis) return CALIFORNIA_REGULATORY_SCORE_VERSION;
  return version === "certscore.california-privacy-review.v1" ? LEGACY_SCORE_VERSION :
    version === "certscore.california-privacy-review.v2" ? COVERAGE_GATED_SCORE_VERSION :
    version === "certscore.california-privacy-review.v3" ? CAPTURE_BASED_SCORE_VERSION : version === "certscore.california-privacy-review.v4" ? CLAUSE_PREDECESSOR_SCORE_VERSION : version === "certscore.california-privacy-review.v5"?CLAUSE_SCORE_VERSION:version === "certscore.california-privacy-review.v6"?REFINED_SCORE_VERSION:version === "certscore.california-privacy-review.v10"?PRE_OBSERVED_SCORE_VERSION:PRE_TRANSFER_SCORE_VERSION;
}

export type CaliforniaRegulatoryScore = {
  policyVersion: typeof CALIFORNIA_SITE_INTEGRITY_SCORE_VERSION | typeof CALIFORNIA_AGENT_REGISTRATION_SCORE_VERSION | typeof CALIFORNIA_COMBINED_OPT_OUT_SCORE_VERSION | typeof CALIFORNIA_NINE_POINT_LINK_SCORE_VERSION | typeof CALIFORNIA_RUNTIME_LINK_SCORE_VERSION | typeof CALIFORNIA_DISCLOSURE_CHOICE_SCORE_VERSION | "california-regulatory-posture.v17-reject-scope" | "california-regulatory-posture.v16-collection-review" | "california-regulatory-posture.v15-collection-review" | typeof CALIFORNIA_REJECT_SCORE_VERSION | typeof CALIFORNIA_GPP_SCORE_VERSION | typeof CALIFORNIA_REGULATORY_SCORE_VERSION | typeof PRE_OBSERVED_SCORE_VERSION | "california-regulatory-posture.v9" | typeof PRE_TRANSFER_SCORE_VERSION | typeof LEGACY_SCORE_VERSION | typeof COVERAGE_GATED_SCORE_VERSION | typeof CAPTURE_BASED_SCORE_VERSION | typeof CLAUSE_PREDECESSOR_SCORE_VERSION | typeof CLAUSE_SCORE_VERSION | typeof REFINED_SCORE_VERSION;
  score: number | null;
  scope: "starting_page";
  coverage: "bounded" | "limited" | "unavailable";
  assessmentSourceHash: string | null;
  potentialRiskRecipientIds?: string[];
  deductions: Array<{ findingId: string; policyKey: string; label: string; points: number }>;
  reviewCoverage?: import("@certscore/contracts").CaliforniaReviewCoverage;
  rightsAssessment?: import("@certscore/contracts").CaliforniaRightsClauseAssessment;
  collectionNoticeAssessment?: import("@certscore/contracts").CaliforniaCollectionNoticeAssessment | import("@certscore/contracts").CaliforniaCollectionNoticeV2 | import("@certscore/contracts").CaliforniaCollectionNoticeV3 | import("@certscore/contracts").CaliforniaCollectionNoticeV4 | import("@certscore/contracts").CaliforniaCollectionNoticeV5;
  saleSharingAssessment?: import("@certscore/contracts").CaliforniaSaleSharingAssessment;
};

/** Read the versioned canonical assessment, never a title or a display selector. */
function disclosureChoicePoints(id:string, points:number, version:string, assessment?:CaliforniaPrivacyReview) {
  if (!isDisclosureChoiceScore(version)) return points;
  if (id === "california_rights_disclosure_not_observed" && assessment?.contractVersion === "certscore.california-privacy-review.v10") {
    const missing=assessment.rightsAssessment?.topics.filter(topic=>topic.status === "not_observed");
    if (missing?.length === 1 && missing[0]!.topic === "non_discrimination") return CALIFORNIA_NON_DISCRIMINATION_ONLY_POINTS;
  }
  return points;
}
function requiredLinkProof(assessment?:CaliforniaPrivacyReview, runtimeGpc?:unknown) {
  if(assessment?.contractVersion==="certscore.california-privacy-review.v10" && assessment.disclosureChoiceAssessment?.policyVersion===CALIFORNIA_COMBINED_OPT_OUT_POLICY)
    return supportsCombinedOptOutRisk(assessment,runtimeGpc);
  return assessment?.contractVersion === "certscore.california-privacy-review.v10" &&
    frictionlessGpcLinkEvidenceConsistent(assessment) &&
    (assessment.disclosureChoiceAssessment?.requiredLinkProof || supportsCaliforniaRuntimeLink(assessment,runtimeGpc));
}

/** Only canonical, reportable California findings can carry the new policy effect. */
export function californiaFindingScoreEffect(id: string, evidenceRef: string, assessmentVersion = "certscore.california-privacy-review.v1", assessment?: CaliforniaPrivacyReview, runtimeGpc?:unknown) {
  if (id === CALIFORNIA_AGENT_REGISTRATION_RULE.findingId) {
    const parsed = californiaPrivacyReviewSchema.safeParse(assessment);
    if (!parsed.success || parsed.data.contractVersion !== "certscore.california-privacy-review.v10" ||
        !parsed.data.agentRegistrationAssessment || assessmentVersion !== parsed.data.contractVersion) return [];
    return [{ appliesTo: "california_posture" as const, framework: "california" as const,
      deductionPoints: CALIFORNIA_AGENT_REGISTRATION_RULE.points, evidenceRefs: [evidenceRef], observedActivity: [],
      policyKey: CALIFORNIA_AGENT_REGISTRATION_RULE.policyKey, policyVersion: CALIFORNIA_AGENT_REGISTRATION_SCORE_VERSION,
      reasonCode: "verified_reportable_california_finding" }];
  }
  const version = scoreVersion(assessmentVersion, assessment);
  if (isDisclosureChoiceScore(version) && !californiaPrivacyReviewSchema.safeParse(assessment).success) return [];
  if (isDisclosureChoiceScore(version) && id === "california_privacy_choice_not_observed" && !requiredLinkProof(assessment,runtimeGpc)) return [];
  const rule = rulesForVersion(version).find(candidate => candidate.findingId === id);
  const choice = id === "california_sale_sharing_opt_out_activity" && (isDisclosureChoiceScore(version) || version === CALIFORNIA_REGULATORY_SCORE_VERSION || version === PRE_OBSERVED_SCORE_VERSION)
    ? californiaOptOutCollectionPolicy(assessment) : null;
  if (choice && !choice.supportedConcern) return [];
  return rule ? [{ appliesTo: "california_posture" as const, framework: "california" as const,
    deductionPoints: version===CALIFORNIA_COMBINED_OPT_OUT_SCORE_VERSION && id==="california_privacy_choice_not_observed" &&
      assessment?.contractVersion==="certscore.california-privacy-review.v10" && assessment.disclosureChoiceAssessment?.policyVersion===CALIFORNIA_COMBINED_OPT_OUT_POLICY &&
      assessment.disclosureChoiceAssessment.optOutRisk?.status==="gpc_contradiction"
        ? californiaChoiceEnforcementPoints(assessment.disclosureChoiceAssessment.optOutRisk.recipientIds,true)
        : choice?.points ?? disclosureChoicePoints(id, rule.points, version, assessment), evidenceRefs: [evidenceRef], observedActivity: choice?.recipientIds ?? [],
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
  const policyVersion = scoreVersion(assessment.contractVersion, assessment);
  const recipientPolicy = isDisclosureChoiceScore(policyVersion) || policyVersion === CALIFORNIA_REGULATORY_SCORE_VERSION || policyVersion === PRE_OBSERVED_SCORE_VERSION;
  const rules = rulesForVersion(policyVersion);

  const deductions: CaliforniaRegulatoryScore["deductions"] = [];
  const explicitChoice = californiaOptOutCollectionPolicy(assessment);
  const choiceRecipients = new Set<string>();
  let choiceSupported = false;
  let gpcChoiceSupported = false;
  let rejectChoiceSupported = false;
  let rejectScopePolicyApplied = false;
  const runtimeLinkGpc=input.unifiedFindings.find(f=>f.unifiedFindingId === "gpc_response" &&
    f.presentationDecision.status === "surface" && f.surfacingDecision?.reportable === true &&
    f.concernContext?.promotionEligibilities.includes("eligible") && f.concernContext?.externalSurfacingEligibilities.includes("eligible") &&
    f.details?.family === "privacy_signal" && f.details.kind === "gpc_response" &&
    (policyVersion===CALIFORNIA_COMBINED_OPT_OUT_SCORE_VERSION ? supportsCombinedOptOutRisk(assessment,f.details.assessment) : supportsCaliforniaRuntimeLink(assessment,f.details.assessment)) && f.scoreEffects?.some(e=>{
      if(f.details?.family !== "privacy_signal" || f.details.kind !== "gpc_response")return false;
      const p=deriveCaliforniaGpcResponsePolicy(f.details.assessment);
      return e.appliesTo === "california_posture" && e.framework === "california" && e.policyVersion === p.policyVersion &&
        e.policyKey === p.policyKey && e.deductionPoints === p.deductionPoints;
    }));
  const combinedPacket=input.unifiedFindings.find(f=>f.unifiedFindingId==="california_privacy_choice_not_observed" && f.details?.family==="california_privacy_review" && supportsCombinedOptOutRisk(assessment,f.details.gpcAssessment));
  const runtimeLinkAssessment=combinedPacket?.details?.family==="california_privacy_review" ? combinedPacket.details.gpcAssessment : runtimeLinkGpc?.details?.family === "privacy_signal" && runtimeLinkGpc.details.kind === "gpc_response"
    ? runtimeLinkGpc.details.assessment : undefined;
  const eligibleRules=rules.filter(rule=>
    (!isDisclosureChoiceScore(policyVersion) || rule.findingId !== "california_privacy_choice_not_observed" || requiredLinkProof(assessment,runtimeLinkAssessment)) &&
    (rule.findingId !== "california_sale_sharing_opt_out_activity" || !recipientPolicy || assessment.optOutObservation?.evidence.requests.some(row=>row.collectionEvidence)));
  for (const rule of eligibleRules) {
    const isChoice = rule.findingId === "california_sale_sharing_opt_out_activity" && recipientPolicy;
    const combinedRisk=policyVersion===CALIFORNIA_COMBINED_OPT_OUT_SCORE_VERSION && rule.findingId==="california_privacy_choice_not_observed" &&
      assessment.contractVersion==="certscore.california-privacy-review.v10" && assessment.disclosureChoiceAssessment?.policyVersion===CALIFORNIA_COMBINED_OPT_OUT_POLICY ? assessment.disclosureChoiceAssessment.optOutRisk:undefined;
    const points = combinedRisk?.status==="gpc_contradiction" ? californiaChoiceEnforcementPoints(combinedRisk.recipientIds,true) : isChoice ? explicitChoice.points : disclosureChoicePoints(rule.findingId,rule.points,policyVersion,assessment);
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
          // v12 changes availability, v11 added shared WCAG. The recipient
          // schedule and privacy evidence gates are identical to v10.
          (recipientPolicy && !isDisclosureChoiceScore(policyVersion) && (effect.policyVersion === "california-regulatory-posture.v10-recipients" || effect.policyVersion === PRE_OBSERVED_SCORE_VERSION))) &&
        effect.policyKey === rule.policyKey &&
        effect.deductionPoints === points))) return unavailable;
    if (projected.length) {
      deductions.push({findingId: rule.findingId, policyKey: rule.policyKey, label: rule.label, points});
      if(combinedRisk?.status==="gpc_contradiction") {
        choiceSupported=true;
        combinedRisk.recipientIds.forEach(id=>choiceRecipients.add(id));
      }
      if (isChoice) {
        choiceSupported = explicitChoice.supportedConcern;
        explicitChoice.recipientIds.forEach(id => choiceRecipients.add(id));
      }
    }
  }
  if (californiaPrivacyReviewFindingIds(assessment).some(id => eligibleRules.some(rule => rule.findingId === id) && !deductions.some(row => row.findingId === id))) return unavailable;
  const registration = assessment.contractVersion === "certscore.california-privacy-review.v10"
    ? assessment.agentRegistrationAssessment : undefined;
  if (registration) {
    const rule = CALIFORNIA_AGENT_REGISTRATION_RULE;
    const projected = input.unifiedFindings.filter(finding => finding.unifiedFindingId === rule.findingId &&
      finding.presentationDecision.status === "surface" && finding.surfacingDecision?.reportable === true &&
      finding.concernContext?.promotionEligibilities.includes("eligible") &&
      finding.concernContext?.externalSurfacingEligibilities.includes("eligible"));
    if (!projected.length || projected.some(finding => {
      if (finding.details?.family !== "california_agent_registration") return true;
      const proof = californiaAgentRegistrationProjectionSchema.safeParse(finding.details.projection);
      return !proof.success || proof.data.documentUrl !== assessment.documentUrl ||
        JSON.stringify(proof.data.assessment) !== JSON.stringify(registration) ||
        !finding.scoreEffects?.some(effect => effect.appliesTo === "california_posture" && effect.framework === "california" &&
          effect.policyKey === rule.policyKey && effect.policyVersion === CALIFORNIA_AGENT_REGISTRATION_SCORE_VERSION &&
          effect.deductionPoints === rule.points);
    })) return unavailable;
    // Retain the factual finding when absorbed. Only already validated, scored
    // rights effects reduce this increment; raw finding presence never does.
    const rightsPoints = deductions.filter(row => CALIFORNIA_REGISTRATION_ABSORBING_RIGHTS_IDS.some(id => id === row.findingId))
      .reduce((sum, row) => sum + row.points, 0);
    const increment = Math.max(0, rule.points - rightsPoints);
    if (increment) deductions.push({...rule, points: increment});
  }
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
  if(assessment.contractVersion==="certscore.california-privacy-review.v10")for(const finding of input.unifiedFindings) {
    if(finding.unifiedFindingId!==CALIFORNIA_POST_REJECT_FINDING || finding.presentationDecision.status!=="surface" ||
      finding.surfacingDecision?.reportable!==true || !finding.concernContext?.promotionEligibilities.includes("eligible") ||
      !finding.concernContext?.externalSurfacingEligibilities.includes("eligible") || finding.details?.family!=="california_post_reject")continue;
    const parsed=californiaPostRejectAssessmentSchema.safeParse(finding.details.assessment);
    if(!parsed.success || parsed.data.scanId!==assessment.scanId || parsed.data.status!=="qualified_collection")continue;
    const a=parsed.data;
    if(!finding.scoreEffects?.some(effect=>effect.appliesTo==="california_posture"&&effect.framework==="california"&&
      effect.policyVersion===a.policyVersion&&effect.policyKey==="california.choice_enforcement.post_reject"&&
      effect.deductionPoints===californiaPostRejectPoints(a)))continue;
    a.recipientIds.forEach(id=>choiceRecipients.add(id));choiceSupported=true;rejectChoiceSupported=true;
    if(a.policyVersion===CALIFORNIA_POST_REJECT_POLICY)rejectScopePolicyApplied=true;
  }
  if (choiceSupported) {
    // Union canonical entity identities across both choices. The initial effect
    // includes the first recipient and a contradiction; neither is additive.
    const explicit = deductions.findIndex(row => row.findingId === "california_sale_sharing_opt_out_activity");
    if (explicit >= 0) deductions.splice(explicit, 1);
    const combined=policyVersion===CALIFORNIA_COMBINED_OPT_OUT_SCORE_VERSION && deductions.some(d=>d.findingId==="california_privacy_choice_not_observed");
    if(combined)deductions.splice(deductions.findIndex(d=>d.findingId==="california_privacy_choice_not_observed"),1);
    deductions.push({ findingId: combined ? "california_privacy_choice_not_observed" : gpcChoiceSupported ? "gpc_response" : rejectChoiceSupported && !explicitChoice.supportedConcern ? CALIFORNIA_POST_REJECT_FINDING : "california_sale_sharing_opt_out_activity",
      policyKey: CALIFORNIA_CHOICE_ENFORCEMENT_POLICY_KEY, label: "Verified privacy-choice enforcement risk",
      points: californiaChoiceEnforcementPoints([...choiceRecipients], true) });
  }
  let potentialRiskRecipientIds:string[]=[];
  let riskVersion:string=CA_POTENTIAL_RISK_POLICY;
  if(assessment.contractVersion==="certscore.california-privacy-review.v10") {
    const eligible=input.unifiedFindings.flatMap(f=>{
      if(f.unifiedFindingId!==CA_POTENTIAL_RISK_FINDING||f.presentationDecision.status!=="surface"||!f.surfacingDecision?.reportable||
        !f.concernContext?.promotionEligibilities.includes("eligible")||!f.concernContext?.externalSurfacingEligibilities.includes("eligible")||f.details?.family!=="california_collection_review"||
        !f.scoreEffects?.some(e=>e.appliesTo==="california_posture"&&e.framework==="california"&&e.policyKey===e.policyVersion&&
          f.details?.family==="california_collection_review"&&f.details.assessments.every(a=>a.policyVersion===e.policyVersion)&&
          e.deductionPoints===potentialRiskPoints(potentialRiskRecipients(f.details.assessments),e.policyVersion)))return [];
      return f.details.assessments.flatMap(a=>{const p=californiaPotentialRiskSchema.safeParse(a);return p.success&&p.data.scanId===assessment.scanId?[p.data]:[];});
    });
    potentialRiskRecipientIds=potentialRiskRecipients(eligible,choiceRecipients);
    riskVersion=eligible[0]?.policyVersion??CA_POTENTIAL_RISK_POLICY;
    const increment=potentialRiskIncrement(choiceRecipients,potentialRiskRecipientIds,choiceSupported,riskVersion);
    if(!increment)potentialRiskRecipientIds=[];
    if(increment)deductions.push({findingId:CA_POTENTIAL_RISK_FINDING,policyKey:riskVersion,
      label:"Collection under privacy-choice conditions warrants review",points:increment});
  }
  // Separate capped signaling-risk family. It neither changes the recipient
  // union nor interprets a malformed payload as an opt-out being off.
  if (assessment.contractVersion === "certscore.california-privacy-review.v10") {
    const supported=input.unifiedFindings.some(finding=>{
      if (finding.unifiedFindingId !== GPP_PROPAGATION_FINDING_ID || finding.presentationDecision.status !== "surface" ||
        finding.surfacingDecision?.reportable !== true || !finding.concernContext?.promotionEligibilities.includes("eligible") ||
        !finding.concernContext?.externalSurfacingEligibilities.includes("eligible") || finding.details?.family !== "privacy_signal" ||
        finding.details.kind !== GPP_PROPAGATION_FINDING_ID || finding.details.assessment.contractVersion !== "certscore.gpc-response-assessment.v3" ||
        finding.details.assessment.observation.scanId !== assessment.scanId) return false;
      const policy=deriveGppPropagationPolicy(finding.details.assessment);
      return policy.scoreEffect === "deduction" && finding.scoreEffects?.some(effect=>effect.appliesTo === "california_posture" &&
        effect.framework === "california" && effect.policyKey === policy.policyKey && effect.policyVersion === policy.policyVersion &&
        effect.deductionPoints === policy.deductionPoints);
    });
    if (supported) deductions.push({findingId:GPP_PROPAGATION_FINDING_ID,policyKey:GPP_PROPAGATION_POLICY_KEY,
      label:"GPP propagation inconsistency",points:GPP_PROPAGATION_POINTS});
  }
  // Reuse a supported canonical checklist gap; missing or inconclusive policy
  // evidence does not become a California deduction.
  const sharedNotice = input.checklistRows.find(row => row.id === "privacy_notice_availability");
  if (sharedNotice?.assessmentStatus === "gap_observed" && sharedNotice.evidenceState === "not_observed") {
    deductions.push({findingId: "regulatory_gap__gdpr_eprivacy__privacy_notice_availability",
      policyKey: CALIFORNIA_SHARED_PRIVACY_NOTICE_KEY, label: "Privacy notice unavailable", points: CALIFORNIA_SHARED_NOTICE_POINTS});
  }
  const integrityPoints = recipientPolicy ? siteIntegrityDeduction(siteIntegrityFindingEffects(input.unifiedFindings, assessment.scanId), {
    appliesTo: "california_posture", policyVersion: SITE_INTEGRITY_POLICY_VERSION,
  }) : 0;
  if (integrityPoints) deductions.push({ findingId: SITE_INTEGRITY_FINDING_ID, policyKey: SITE_INTEGRITY_SCORE_POLICY_KEY,
    label: "Hidden outbound links", points: integrityPoints });
  const ready = legacy ? assessment.inspection?.coverage === "complete" && assessment.choiceSurface !== "unknown" : assessment.reviewCoverage.scoreReady;
  const coverage = ready && ((legacy || assessment.contractVersion === "certscore.california-privacy-review.v2") || assessment.reviewCoverage.families.every(row=>["observed","assessed_gap","not_triggered_in_scope"].includes(row.status))) ? "bounded" : "limited";
  // Verified governing notice evidence can support the bounded risk score even
  // when unrelated runtime capture is incomplete. Coverage stays limited and
  // unknown checks never become observed passes or deductions.
  const retainedPolicy = recipientPolicy &&
    assessment.contractVersion === "certscore.california-privacy-review.v10" &&
    assessment.reviewCoverage.sourceDocuments.some(document=>document.complete);
  const observedVisit = assessment.contractVersion === "certscore.california-privacy-review.v10" && Boolean(assessment.observedScoreBasis);
  // Every usable report has both postures. Coverage and unknown checks remain
  // independent; no eligible findings means no deductions, not a verified pass.
  const scoreAvailable = observedVisit || ready || deductions.length > 0 || retainedPolicy;
  if (recipientPolicy) {
    const accessibility = accessibilityFindingDeductionBreakdown(input.unifiedFindings);
    for (const rule of accessibility.rules) deductions.push({
      findingId: rule.ruleId, policyKey: `accessibility.${rule.ruleId}`,
      label: rule.label, points: rule.policyDeductionPoints,
    });
  }
  const score = scoreAvailable
    ? Math.max(CALIFORNIA_REGULATORY_SCORE_FLOOR, 100 - deductions.reduce((sum, row) => sum + row.points, 0))
    : null;
  const hasRiskDeduction=deductions.some(row=>row.findingId===CA_POTENTIAL_RISK_FINDING);
  const usesRetainedScopePolicy=rejectScopePolicyApplied||(hasRiskDeduction&&riskVersion===CA_POTENTIAL_RISK_POLICY);
  return { policyVersion:integrityPoints ? CALIFORNIA_SITE_INTEGRITY_SCORE_VERSION : registration ? CALIFORNIA_AGENT_REGISTRATION_SCORE_VERSION : isDisclosureChoiceScore(policyVersion) ? policyVersion : usesRetainedScopePolicy?"california-regulatory-posture.v17-reject-scope":hasRiskDeduction?(riskVersion===CA_POTENTIAL_RISK_LEGACY_POLICY?"california-regulatory-posture.v15-collection-review":"california-regulatory-posture.v16-collection-review"):rejectChoiceSupported?CALIFORNIA_REJECT_SCORE_VERSION:deductions.some(row=>row.findingId===GPP_PROPAGATION_FINDING_ID)?CALIFORNIA_GPP_SCORE_VERSION:policyVersion,
    score, scope: "starting_page", coverage, assessmentSourceHash: assessment.sourceHash, deductions,
    ...(potentialRiskRecipientIds.length?{potentialRiskRecipientIds}:{}),
    ...(!legacy ? {reviewCoverage:assessment.reviewCoverage} : {}),
    ...(assessment.contractVersion === "certscore.california-privacy-review.v5" || assessment.contractVersion === "certscore.california-privacy-review.v6" || (assessment.contractVersion === "certscore.california-privacy-review.v7" || (assessment.contractVersion === "certscore.california-privacy-review.v8" || (assessment.contractVersion === "certscore.california-privacy-review.v9" || assessment.contractVersion === "certscore.california-privacy-review.v10"))) ? {rightsAssessment:assessment.rightsAssessment,collectionNoticeAssessment:assessment.collectionNoticeAssessment} : {}),
    ...(assessment.contractVersion === "certscore.california-privacy-review.v6" || (assessment.contractVersion === "certscore.california-privacy-review.v7" || (assessment.contractVersion === "certscore.california-privacy-review.v8" || (assessment.contractVersion === "certscore.california-privacy-review.v9" || assessment.contractVersion === "certscore.california-privacy-review.v10")))?{saleSharingAssessment:assessment.saleSharingAssessment}:{}) };
}
