import {createHash} from "node:crypto";
import {isCurrentCaliforniaChoiceInspection,isCaliforniaRuntimeLinkAssessment,californiaRuntimeLinkProofSchema,gpcResponseAssessmentSchema,
  frictionlessGpcContradictionSchema,type CaliforniaPrivacyReview} from "@certscore/contracts";
import {deriveCaliforniaGpcResponsePolicy,CALIFORNIA_GPC_RESPONSE_POLICY_VERSION,INDEX_AUCTION_GPC_POLICY_VERSION,MAGNITE_AUCTION_GPC_POLICY_VERSION} from "./california-gpc-response-policy";
import {hasVerifiedCustomerGpcEvidence} from "./gpc-customer-policy";

/** Positive typed GPC proof, independent of policy wording or CMP state getters.
 * This is server-side assessment work over already verified retained evidence. */
function qualifiedGpcCollection(review:CaliforniaPrivacyReview,value:unknown){
  if(review.contractVersion!=="certscore.california-privacy-review.v10")return undefined;
  const parsed=gpcResponseAssessmentSchema.safeParse(value);
  if(!parsed.success || parsed.data.contractVersion!=="certscore.gpc-response-assessment.v3" || !hasVerifiedCustomerGpcEvidence(parsed.data))return undefined;
  const a=parsed.data,o=a.observation,policy=deriveCaliforniaGpcResponsePolicy(a);
  const documentHash=createHash("sha256").update(review.documentUrl).digest("hex");
  if(![CALIFORNIA_GPC_RESPONSE_POLICY_VERSION,INDEX_AUCTION_GPC_POLICY_VERSION,MAGNITE_AUCTION_GPC_POLICY_VERSION].some(v=>v===policy.policyVersion) || policy.scoreEffect!=="deduction" ||
      policy.reasonCode!=="verified_gpc_advertising_collection" || o.scanId!==review.scanId || o.documentUrlSha256!==documentHash ||
      !o.sourceSha256 || !o.sessionSha256 || o.sourceSha256!==a.comparison.gpcArtifact?.sha256)return undefined;
  const ids=new Set(policy.eligibleActivity.persistedUnderGpc);
  const requests=o.requests.advertisingCollectionRecipients?.rows.filter(r=>ids.has(r.evidenceId) && policy.recipientIds?.includes(r.entityId))
    .map(r=>({evidenceId:r.evidenceId,entityId:r.entityId}));
  if(!requests?.length)return undefined;
  return {o,policy,requests,documentHash};
}

export function deriveCaliforniaRuntimeLinkProof(review:CaliforniaPrivacyReview,value:unknown) {
  if(review.choiceSurface!=="not_observed_in_inspected_scope"||!review.inspection||review.inspection.coverage!=="complete"||!isCurrentCaliforniaChoiceInspection(review.inspection))return undefined;
  const qualified=qualifiedGpcCollection(review,value);if(!qualified)return undefined;
  const {o,policy,requests,documentHash}=qualified;
  const proof=californiaRuntimeLinkProofSchema.safeParse({basis:"qualified_gpc_collection.v1",inspectionSourceHash:review.inspection.sourceHash,
    gpcSourceSha256:o.sourceSha256,gpcSessionSha256:o.sessionSha256,documentUrlSha256:documentHash,qualifierVersion:policy.policyVersion,requests});
  return proof.success?proof.data:undefined;
}

/** Re-join persisted proof to the current typed GPC assessment. A stored boolean,
 * score, title, other URL, or source/session mutation cannot supply this effect. */
export function supportsCaliforniaRuntimeLink(review:CaliforniaPrivacyReview,value:unknown):boolean {
  const stored=review.contractVersion==="certscore.california-privacy-review.v10" &&
    isCaliforniaRuntimeLinkAssessment(review.disclosureChoiceAssessment)
    ? review.disclosureChoiceAssessment.runtimeLinkProof : undefined;
  if(!stored)return false;
  const derived=deriveCaliforniaRuntimeLinkProof(review,value);
  return Boolean(derived && JSON.stringify(derived)===JSON.stringify(stored));
}


/** Counterexample to full GPC processing; does not establish link absence. */
export function deriveFrictionlessGpcContradiction(review:CaliforniaPrivacyReview,value:unknown){
  const q=qualifiedGpcCollection(review,value);if(!q)return undefined;
  const parsed=frictionlessGpcContradictionSchema.safeParse({sourceSha256:q.o.sourceSha256,sessionSha256:q.o.sessionSha256,
    documentUrlSha256:q.documentHash,qualifierVersion:q.policy.policyVersion,requests:q.requests.slice(0,4)});
  return parsed.success?parsed.data:undefined;
}
export function supportsFrictionlessGpcContradiction(review:CaliforniaPrivacyReview,value:unknown){
  const stored=review.contractVersion==="certscore.california-privacy-review.v10"?review.frictionlessGpcException?.gpcContradiction:undefined;
  const derived=stored?deriveFrictionlessGpcContradiction(review,value):undefined;
  return Boolean(stored&&derived&&JSON.stringify(stored)===JSON.stringify(derived));
}
