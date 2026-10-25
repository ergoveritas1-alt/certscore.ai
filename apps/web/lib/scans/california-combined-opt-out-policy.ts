import {createHash} from "node:crypto";
import {CALIFORNIA_COMBINED_OPT_OUT_POLICY,californiaCombinedOptOutRiskSchema,gpcResponseAssessmentSchema,
  isCurrentCaliforniaChoiceInspection,type CaliforniaPrivacyReview} from "@certscore/contracts";
import {CALIFORNIA_GPC_RESPONSE_POLICY_VERSION,deriveCaliforniaGpcResponsePolicy} from "./california-gpc-response-policy";
import {hasVerifiedCustomerGpcEvidence} from "./gpc-customer-policy";

/** New materializations only. A scoped badge is not sufficient absence proof.
 * Reuse successful, attributed collections; scripts/vendor presence never qualify.
 * A recorded opt-out supports the bounded response, not the full link exception. */
export function deriveCombinedOptOutRisk(review:CaliforniaPrivacyReview,value:unknown) {
  if(review.contractVersion!=="certscore.california-privacy-review.v10" ||
    review.disclosureChoiceAssessment?.policyVersion!==CALIFORNIA_COMBINED_OPT_OUT_POLICY ||
    review.broadOptOutAssessment?.state!=="not_observed" || review.choiceSurface!=="not_observed_in_inspected_scope" ||
    !isCurrentCaliforniaChoiceInspection(review.inspection) || review.inspection?.coverage!=="complete")return undefined;
  const parsed=gpcResponseAssessmentSchema.safeParse(value);
  if(!parsed.success || parsed.data.contractVersion!=="certscore.gpc-response-assessment.v3" || !hasVerifiedCustomerGpcEvidence(parsed.data))return undefined;
  const a=parsed.data,o=a.observation;
  if(o.status==="unavailable" || o.scanId!==review.scanId || !o.sourceSha256 || !o.sessionSha256 ||
    o.sourceSha256!==a.comparison.gpcArtifact?.sha256 ||
    o.documentUrlSha256!==createHash("sha256").update(review.documentUrl).digest("hex") ||
    !o.delivery.httpHeaderRetained || !o.delivery.mainNavigatorReadbackRetained ||
    !(o.positiveEvidence?.representativeDocument || o.status==="complete" && o.delivery.fullContextVerified && o.requests.complete))return undefined;
  const policy=deriveCaliforniaGpcResponsePolicy(a);
  // Both inventories originate in the verified successful-collection builder.
  const advertisingEvidenceIds=[...new Set([
    ...(o.requests.collectionReview?.rows.filter(r=>r.purpose==="advertising"||r.purpose==="marketing").map(r=>r.evidenceId)??[]),
    ...(o.requests.advertisingCollectionRecipients?.rows.map(r=>r.evidenceId)??[]),
  ])].sort().slice(0,32);
  if(!advertisingEvidenceIds.length)return undefined;
  const contradiction=policy.scoreEffect==="deduction" &&
    (policy.reasonCode==="verified_gpc_choice_contradiction" || policy.policyVersion===CALIFORNIA_GPC_RESPONSE_POLICY_VERSION);
  const supported=policy.scoreEffect==="none" && o.status==="complete" && o.delivery.fullContextVerified && o.requests.complete &&
    o.semanticProbe==="observed" && o.registration.cmpGpcSignal==="received" &&
    o.registration.sale==="opted_out" && o.registration.sharing==="opted_out";
  if(!contradiction && !(supported && review.disclosureChoiceAssessment.requiredLinkProof))return undefined;
  return californiaCombinedOptOutRiskSchema.parse({status:contradiction?"gpc_contradiction":"supported_gpc_missing_method",
    gpcSourceSha256:o.sourceSha256,gpcSessionSha256:o.sessionSha256,documentUrlSha256:o.documentUrlSha256,
    advertisingEvidenceIds,recipientIds:[...new Set(policy.recipientIds??[])].sort().slice(0,32)});
}

/** Never trust a stored status without rejoining its original typed evidence. */
export function supportsCombinedOptOutRisk(review:CaliforniaPrivacyReview,value:unknown) {
  const stored=review.contractVersion==="certscore.california-privacy-review.v10" &&
    review.disclosureChoiceAssessment?.policyVersion===CALIFORNIA_COMBINED_OPT_OUT_POLICY ? review.disclosureChoiceAssessment.optOutRisk:undefined;
  const derived=stored?deriveCombinedOptOutRisk(review,value):undefined;
  return Boolean(stored && derived && JSON.stringify(stored)===JSON.stringify(derived));
}
