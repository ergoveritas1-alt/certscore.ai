import {BROAD_OPT_OUT_FINDING_ID,broadOptOutAssessmentSchema} from "@certscore/contracts";
import {OPT_OUT_ABSENCE_FINDING_ID,OPT_OUT_SIGNAL_FINDING_ID,optOutPresenceSignalSchema,policyChoiceMethodsSchema} from "@certscore/contracts";
import {
  californiaPrivacyReviewSchema, californiaPrivacyReviewFindingIds,
  CALIFORNIA_CHOICE_ABSENCE_ID, CALIFORNIA_PRIVACY_REVIEW_SIGNAL,
  PRIVACY_CHOICE_PRESENCE_SIGNAL, privacyChoicePresenceTitle, saleSharingPresenceLinks,
  POLICY_CHOICE_METHOD_FINDING_ID, FRICTIONLESS_GPC_FINDING_ID, frictionlessGpcProjectionSchema,
} from "@certscore/contracts";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

/** Place already-projected canonical observations in the snapshot. Missing
 * evidence never becomes absence, and raw labels never become findings. */
export function projectCaliforniaChoicePresence(findings: UnifiedFindingDisplayPacket[], scanId: string, documentUrl?: string) {
  let absence: CaliforniaChoicePresence | null = null;
  for (const finding of findings) {
    if (finding.details?.family !== "california_privacy_review" || !finding.surfacingDecision?.reportable ||
        !finding.concernContext?.promotionEligibilities.includes("eligible") ||
        !finding.concernContext.externalSurfacingEligibilities.includes("eligible")) continue;
    const parsed = californiaPrivacyReviewSchema.safeParse(finding.details.projection);
    if (!parsed.success || parsed.data.scanId !== scanId || (documentUrl !== undefined && parsed.data.documentUrl !== documentUrl)) continue;
    const review = parsed.data;
    const hasSignal = (key: string) => finding.sourceRefs.some(ref => ref.kind === "signal" && ref.source === "runtime_artifact_signal" && ref.key === key);
    if (finding.unifiedFindingId === "targeted_advertising_choices_present" &&
        finding.surfacingDecision.reportLane === "confidence_and_coverage" &&
        finding.surfacingDecision.appliedRules.includes("evidence.privacy_choice_presence.observed") &&
        !finding.scoreEffects?.length && hasSignal(PRIVACY_CHOICE_PRESENCE_SIGNAL)) {
      const links = saleSharingPresenceLinks(review.choicePresence);
      if (links.length) return { state: "observed", title: privacyChoicePresenceTitle(review.choicePresence), scanId,
        sourceHash: review.sourceHash, labels: [...new Set(links.map(link => link.label))] } satisfies CaliforniaChoicePresence;
    }
    if (finding.unifiedFindingId === CALIFORNIA_CHOICE_ABSENCE_ID &&
        finding.presentationDecision.status === "surface" &&
        hasSignal(`${CALIFORNIA_PRIVACY_REVIEW_SIGNAL}.${CALIFORNIA_CHOICE_ABSENCE_ID}`) &&
        californiaPrivacyReviewFindingIds(review).includes(CALIFORNIA_CHOICE_ABSENCE_ID) &&
        review.choiceSurface === "not_observed_in_inspected_scope") {
      absence = { state: "not_observed", title: "Sale/sharing opt-out link not observed", scanId,
        sourceHash: review.sourceHash, labels: [] };
    }
  }
  return absence;
}
export type CaliforniaChoicePresence = {
  state: "observed" | "not_observed";
  title: string;
  scanId: string;
  sourceHash: string;
  labels: string[];
};

/** A separate canonical informational projection. Never feeds homepage status. */
export function projectCaliforniaPolicyChoiceMethods(findings: UnifiedFindingDisplayPacket[], scanId:string, documentUrl?:string) {
  for(const finding of findings){
    if(finding.unifiedFindingId!==POLICY_CHOICE_METHOD_FINDING_ID||
       !finding.surfacingDecision?.reportable||finding.surfacingDecision.reportLane!=="confidence_and_coverage"||
       !finding.surfacingDecision.appliedRules.includes("evidence.policy_choice_method.observed")||finding.scoreEffects?.length||
       !finding.concernContext?.promotionEligibilities.includes("eligible")||!finding.concernContext.externalSurfacingEligibilities.includes("eligible")||
       !finding.sourceRefs.some(ref=>ref.kind==="signal"&&ref.source==="runtime_artifact_signal"&&ref.key===`${CALIFORNIA_PRIVACY_REVIEW_SIGNAL}.${POLICY_CHOICE_METHOD_FINDING_ID}`))continue;
    if(finding.details?.family==="policy_choice_methods"){
      const parsed=policyChoiceMethodsSchema.safeParse(finding.details.projection);
      if(parsed.success&&parsed.data.scanId===scanId&&(documentUrl===undefined||parsed.data.reportDocumentUrl===documentUrl))return parsed.data;
      continue;
    }
    if(finding.details?.family!=="california_privacy_review")continue;
    const parsed=californiaPrivacyReviewSchema.safeParse(finding.details.projection);
    if(parsed.success&&parsed.data.scanId===scanId&&(documentUrl===undefined||parsed.data.documentUrl===documentUrl))
      return parsed.data.policyChoiceMethods??null;
  }
  return null;
}
export type CaliforniaPolicyChoiceMethods = NonNullable<ReturnType<typeof projectCaliforniaPolicyChoiceMethods>>;


/** Render only the assessment carried by an eligible canonical informational finding. */
export function projectCaliforniaFrictionlessGpcException(findings:UnifiedFindingDisplayPacket[],scanId:string,documentUrl?:string){
  for(const finding of findings){
    if(finding.unifiedFindingId!==FRICTIONLESS_GPC_FINDING_ID||finding.details?.family!=="frictionless_gpc_exception"||
       !finding.surfacingDecision?.reportable||finding.surfacingDecision.reportLane!=="confidence_and_coverage"||finding.scoreEffects?.length||
       !finding.surfacingDecision.appliedRules.includes("evidence.frictionless_gpc.assessed")||
       !finding.concernContext?.promotionEligibilities.includes("eligible")||!finding.concernContext.externalSurfacingEligibilities.includes("eligible")||
       !finding.sourceRefs.some(ref=>ref.kind==="signal"&&ref.source==="runtime_artifact_signal"&&ref.key===`${CALIFORNIA_PRIVACY_REVIEW_SIGNAL}.${FRICTIONLESS_GPC_FINDING_ID}`))continue;
    const parsed=frictionlessGpcProjectionSchema.safeParse(finding.details.projection);
    if(parsed.success&&parsed.data.assessment.scanId===scanId&&(documentUrl===undefined||parsed.data.assessment.documentUrl===documentUrl))return parsed.data;
  }
  return null;
}
export type CaliforniaFrictionlessGpcException=NonNullable<ReturnType<typeof projectCaliforniaFrictionlessGpcException>>;

/** Broad owner-approved presence view over canonical findings. Observed means
 * a credible retained signal, while link inspection and score policies stay separate. */
export type CaliforniaOptOutPresence={state:'observed'|'not_observed'|'unknown';signal?:import('@certscore/contracts').OptOutPresenceSignal;absenceScope?:string;absenceSourceUrl?:string;absenceLimitations?:string[]};
export function projectCaliforniaOptOutPresence(findings:UnifiedFindingDisplayPacket[],scanId:string,documentUrl?:string):CaliforniaOptOutPresence{
  const homepage=projectCaliforniaChoicePresence(findings,scanId,documentUrl);
  const methods=projectCaliforniaPolicyChoiceMethods(findings,scanId,documentUrl);
  let signal:import('@certscore/contracts').OptOutPresenceSignal|undefined;
  for(const finding of findings){
    if(finding.unifiedFindingId!==OPT_OUT_SIGNAL_FINDING_ID||finding.details?.family!=="opt_out_presence_signal"||
       !finding.surfacingDecision?.reportable||finding.surfacingDecision.reportLane!=="confidence_and_coverage"||finding.scoreEffects?.length||
       !finding.surfacingDecision.appliedRules.includes("evidence.opt_out_signal.observed")||
       !finding.concernContext?.promotionEligibilities.includes("eligible")||!finding.concernContext.externalSurfacingEligibilities.includes("eligible")||
       !finding.sourceRefs.some(ref=>ref.kind==="signal"&&ref.source==="runtime_artifact_signal"&&ref.key===`${CALIFORNIA_PRIVACY_REVIEW_SIGNAL}.${OPT_OUT_SIGNAL_FINDING_ID}`))continue;
    const parsed=optOutPresenceSignalSchema.safeParse(finding.details.projection);
    if(parsed.success&&parsed.data.scanId===scanId&&(documentUrl===undefined||parsed.data.documentUrl===documentUrl)){signal=parsed.data;break;}
  }
  let broad:import('@certscore/contracts').BroadOptOutAssessment|undefined;
  for(const f of findings){
    if(f.unifiedFindingId!==BROAD_OPT_OUT_FINDING_ID||f.details?.family!=="broad_opt_out_assessment"||!f.surfacingDecision.reportable||
      f.surfacingDecision.reportLane!=="confidence_and_coverage"||f.scoreEffects?.length||!f.surfacingDecision.appliedRules.includes("evidence.broad_opt_out.assessed")||
      !f.concernContext?.promotionEligibilities.includes("eligible")||!f.concernContext.externalSurfacingEligibilities.includes("eligible")||
      !f.sourceRefs.some(ref=>ref.kind==="signal"&&ref.source==="runtime_artifact_signal"&&ref.key===`${CALIFORNIA_PRIVACY_REVIEW_SIGNAL}.${BROAD_OPT_OUT_FINDING_ID}`))continue;
    const parsed=broadOptOutAssessmentSchema.safeParse(f.details.projection);
    if(parsed.success&&parsed.data.scanId===scanId&&(documentUrl===undefined||parsed.data.documentUrl===documentUrl)){broad=parsed.data;break;}
  }
  const negative=findings.some(f=>f.unifiedFindingId===OPT_OUT_ABSENCE_FINDING_ID&&f.details?.family==="opt_out_absence"&&
    f.details.projection.scanId===scanId&&(documentUrl===undefined||f.details.projection.documentUrl===documentUrl)&&
    f.surfacingDecision.reportable&&f.surfacingDecision.reportLane==="confidence_and_coverage"&&!f.scoreEffects?.length&&
    f.surfacingDecision.appliedRules.includes("evidence.opt_out_absence.complete")&&
    f.concernContext?.promotionEligibilities.includes("eligible")&&f.concernContext.externalSurfacingEligibilities.includes("eligible")&&
    f.sourceRefs.some(ref=>ref.kind==="signal"&&ref.source==="runtime_artifact_signal"&&ref.key===`${CALIFORNIA_PRIVACY_REVIEW_SIGNAL}.${OPT_OUT_ABSENCE_FINDING_ID}`));
  return {state:broad?broad.state:homepage?.state==="observed"||methods||signal?"observed" as const:homepage?.state==="not_observed"||negative?"not_observed" as const:"unknown" as const,
    ...(signal?{signal}:{}),
    ...((broad?.version==='sale_sharing_opt_out_assessment.v2'||broad?.version==='sale_sharing_opt_out_assessment.v3'||broad?.version==='sale_sharing_opt_out_assessment.v4')&&broad.basis==='scoped_negative_search'?{
      absenceScope:broad.version==='sale_sharing_opt_out_assessment.v4'&&broad.scope==='captured_runtime_main_document_text'?'Captured runtime main-document text only':(broad.version==='sale_sharing_opt_out_assessment.v3'||broad.version==='sale_sharing_opt_out_assessment.v4')&&broad.scope==='captured_main_document_text'?'Captured main-document text only':'Captured starting-page observations',absenceSourceUrl:broad.documentUrl,
      absenceLimitations:(broad.limitations??[]).map(key=>({control_coverage_limited:'Control inspection was limited.',frames_uninspected:'Some frames were not inspected.',unnamed_controls:'Some controls had no readable name.',shadow_roots_uninspected:'Some shadow roots were not inspected.',policy_text_incomplete:'Complete governing-policy text was not available.',choice_inspection_unavailable:'Dedicated choice inspection was unavailable.',choice_inventory_truncated:'The dedicated control inventory was truncated.',inspection_stability_limited:'The separate inspection retained stability limits.',inspection_unrepresentative:'The separate inspection was not representative.',inspection_loading:'The separate inspection was still loading.',consent_checkpoint_limited:'The supporting consent checkpoint was limited.',separate_consent_capture_unusable:'The separate consent capture showed a verification screen.'}[key])),
    }:negative?{absenceScope:"Starting page and retained policy routes"}:{}),};
}
