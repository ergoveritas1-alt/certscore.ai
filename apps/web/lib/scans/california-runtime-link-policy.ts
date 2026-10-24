import {createHash} from "node:crypto";
import {isCurrentCaliforniaChoiceInspection,CALIFORNIA_RUNTIME_LINK_POLICY,californiaRuntimeLinkProofSchema,gpcResponseAssessmentSchema,
  type CaliforniaPrivacyReview} from "@certscore/contracts";
import {deriveCaliforniaGpcResponsePolicy,CALIFORNIA_GPC_RESPONSE_POLICY_VERSION} from "./california-gpc-response-policy";
import {hasVerifiedCustomerGpcEvidence} from "./gpc-customer-policy";

/** Positive typed GPC proof, independent of policy wording or CMP state getters.
 * This is server-side assessment work over already verified retained evidence. */
export function deriveCaliforniaRuntimeLinkProof(review:CaliforniaPrivacyReview,value:unknown) {
  if(review.contractVersion!=="certscore.california-privacy-review.v10" ||
      review.choiceSurface!=="not_observed_in_inspected_scope" || !review.inspection || review.inspection.coverage!=="complete" || !isCurrentCaliforniaChoiceInspection(review.inspection))return undefined;
  const parsed=gpcResponseAssessmentSchema.safeParse(value);
  if(!parsed.success || parsed.data.contractVersion!=="certscore.gpc-response-assessment.v3" || !hasVerifiedCustomerGpcEvidence(parsed.data))return undefined;
  const a=parsed.data,o=a.observation,policy=deriveCaliforniaGpcResponsePolicy(a);
  const documentHash=createHash("sha256").update(review.documentUrl).digest("hex");
  if(policy.policyVersion!==CALIFORNIA_GPC_RESPONSE_POLICY_VERSION || policy.scoreEffect!=="deduction" ||
      policy.reasonCode!=="verified_gpc_advertising_collection" || o.scanId!==review.scanId || o.documentUrlSha256!==documentHash ||
      !o.sourceSha256 || !o.sessionSha256 || o.sourceSha256!==a.comparison.gpcArtifact?.sha256)return undefined;
  const ids=new Set(policy.eligibleActivity.persistedUnderGpc);
  const requests=o.requests.advertisingCollectionRecipients?.rows.filter(r=>ids.has(r.evidenceId) && policy.recipientIds?.includes(r.entityId))
    .map(r=>({evidenceId:r.evidenceId,entityId:r.entityId}));
  const proof=californiaRuntimeLinkProofSchema.safeParse({basis:"qualified_gpc_collection.v1",inspectionSourceHash:review.inspection.sourceHash,
    gpcSourceSha256:o.sourceSha256,gpcSessionSha256:o.sessionSha256,documentUrlSha256:documentHash,qualifierVersion:policy.policyVersion,requests});
  return proof.success?proof.data:undefined;
}

/** Re-join persisted proof to the current typed GPC assessment. A stored boolean,
 * score, title, other URL, or source/session mutation cannot supply this effect. */
export function supportsCaliforniaRuntimeLink(review:CaliforniaPrivacyReview,value:unknown):boolean {
  const stored=review.contractVersion==="certscore.california-privacy-review.v10" &&
    review.disclosureChoiceAssessment?.policyVersion===CALIFORNIA_RUNTIME_LINK_POLICY
    ? review.disclosureChoiceAssessment.runtimeLinkProof : undefined;
  if(!stored)return false;
  const derived=deriveCaliforniaRuntimeLinkProof(review,value);
  return Boolean(derived && JSON.stringify(derived)===JSON.stringify(stored));
}
