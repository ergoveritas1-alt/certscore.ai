import { readPropertySaleSharingSource } from "@certscore/vendor-resolver/property-sale-sharing";
import {propertySaleSharingProofSchema} from "@certscore/contracts";
import {z} from "zod";
import {createHash} from "node:crypto";
import {postRefusalReportProjectionSchema,isQualifyingSaleSharingRequest,classifyConsentControlLabel,normalizeConsentControlText,type PostRefusalReportProjection} from "@certscore/contracts";
import {retainedRejectPresence} from "./reject-presence-evidence";
import {californiaChoiceEnforcementPoints} from "./california-choice-enforcement-policy";
const PREVIOUS_POLICY="california-post-reject.v2-qualified-disclosure" as const;
export const PROPERTY_BOUND_POST_REJECT_POLICY="california-post-reject.v3-property-bound" as const;
export const CALIFORNIA_POST_REJECT_POLICY="california-post-reject.v4-retained-scope" as const;
export const MAGNITE_AUCTION_POST_REJECT_POLICY="california-post-reject.v6-auctions" as const;
export const INDEX_AUCTION_POST_REJECT_POLICY="california-post-reject.v5-index-auction" as const;
export const CALIFORNIA_POST_REJECT_FINDING="california_post_reject_collection" as const;
export const californiaPostRejectAssessmentSchema=z.object({
 policyVersion:z.enum(["california-post-reject.v1",PREVIOUS_POLICY,PROPERTY_BOUND_POST_REJECT_POLICY,CALIFORNIA_POST_REJECT_POLICY,INDEX_AUCTION_POST_REJECT_POLICY,MAGNITE_AUCTION_POST_REJECT_POLICY]),scanId:z.string().min(1).max(160).nullable(),
 sourcePacketSha256:z.string().regex(/^[a-f0-9]{64}$/).nullable(),targetSha256:z.string().regex(/^[a-f0-9]{64}$/).nullable(),
 scope:z.enum(["cookie_tracking_rejection","unknown"]),controlLabel:z.string().max(160),
 scopeEvidence:z.object({policyVersion:z.literal("retained_cookie_reject_scope.v1"),basis:z.literal("bound_canonical_reject_context"),
  controlObservedAtMs:z.number().int().nonnegative(),selectorSha256:z.string().regex(/^[a-f0-9]{64}$/),frameIdentitySha256:z.string().regex(/^[a-f0-9]{64}$/),
  classifierRegistryVersion:z.string().min(1).max(120),matchedTerm:z.string().min(1).max(160),
 }).strict().optional(),
 status:z.enum(["qualified_collection","no_eligible_collection","insufficient_evidence"]),
 requestsObserved:z.number().int().nonnegative(),requestsTruncated:z.boolean(),
 recipientIds:z.array(z.string().regex(/^ent_[a-f0-9]{12}$/)).max(32),
 requests:z.array(z.object({requestId:z.string().max(120),msAfterClick:z.number().int().nonnegative(),
  reason:z.enum(["qualified_collection","request_metadata_unavailable","restricted_or_unresolved_processing","payload_uninspected","response_unverified","request_proof_incomplete","qualification_unresolved","sale_sharing_purpose_unresolved"]),
  propertyEvidence:propertySaleSharingProofSchema.optional(),
  diagnostics:z.object({collectionMetadata:z.enum(["observed","unavailable"]),propertyBinding:z.enum(["observed","unavailable"]),purpose:z.enum(["supported","unresolved"])}).strict().optional(),
  entityId:z.string().regex(/^ent_[a-f0-9]{12}$/).optional(),entity:z.string().max(200).optional(),
 }).strict()).max(32),
 }).strict().superRefine((a,ctx)=>{
 const ids=[...new Set(a.requests.filter(r=>r.reason==="qualified_collection").map(r=>r.entityId))].sort();
 if(a.scopeEvidence&&(![CALIFORNIA_POST_REJECT_POLICY,INDEX_AUCTION_POST_REJECT_POLICY,MAGNITE_AUCTION_POST_REJECT_POLICY].some(v=>v===a.policyVersion)||a.scope!=="cookie_tracking_rejection"||!a.sourcePacketSha256||!a.targetSha256))
  ctx.addIssue({code:z.ZodIssueCode.custom,message:"Retained scope evidence requires the current source-bound scope policy."});
 if(ids.some(id=>!id) || JSON.stringify(ids)!==JSON.stringify(a.recipientIds) || new Set(a.requests.map(r=>r.requestId)).size!==a.requests.length ||
  ((a.status==="qualified_collection")!==(ids.length>0)) || ids.length>0&&(!a.scanId||!a.sourcePacketSha256||!a.targetSha256||a.scope==="unknown"))
  ctx.addIssue({code:z.ZodIssueCode.custom,message:"California Reject recipients require consistent source-bound qualifying requests."});
});
export type CaliforniaPostRejectAssessment=z.infer<typeof californiaPostRejectAssessmentSchema>;

/** The producer already classified a live cookie-consent action. Recheck its
 * exact label using the shared registry and join the retained control read to
 * the same selector/frame/source; a CMP name or bare label is not context. */
function retainedCookieRejectScope(p:PostRefusalReportProjection):CaliforniaPostRejectAssessment["scopeEvidence"] {
 const proof=p.actionControlProof;
 if(!retainedRejectPresence(p)||!p.packetSha256||!p.sourceIdentity||p.sourceIdentity.targetSha256!==proof?.authorizedTargetSha256||
  proof.contractVersion!=="certscore.consent_action_control_proof.v2"||proof.actionSemantics!=="direct_label"||
  proof.classifierIntent!=="reject"||proof.classifierConfidence<.9||!proof.frameIdentitySha256||
  !proof.classifierReasonCodes.includes("context_satisfied")||!proof.classifierReasonCodes.includes("matched_reject")||
  !p.interactionDiagnostics?.navigation.documentCommitted||!p.interactionDiagnostics.navigation.finalUrlAuthorized)return;
 const classification=classifyConsentControlLabel({label:proof.accessibleLabel,hasConsentContext:true,usage:"action",classifierProfile:"multilingual_v1"});
 if(classification.intent!=="reject"||classification.semanticRole!=="reject"||classification.confidence<.9||
  classification.matchStrength!=="direct"||classification.matchStrength!==proof.matchStrength||
  !classification.registryVersion||!classification.matchedTerm||classification.variant||
  normalizeConsentControlText(proof.accessibleLabel)!==normalizeConsentControlText(classification.matchedTerm))return;
 const selectorSha256=createHash("sha256").update(proof.selectorHint).digest("hex");
 const bound=p.interactionDiagnostics.resolver?.snapshots.some(row=>row.source==="control_proof"&&row.state==="candidate_detected"&&
  row.selectorMatchCount===1&&row.visibleCount===1&&row.enabledCount===1&&row.binding?.selectorSha256===selectorSha256&&
  row.binding.frameIdentitySha256===proof.frameIdentitySha256&&row.binding.labelSources.some(source=>source===proof.labelSource)&&
  row.controlLabels.some(label=>normalizeConsentControlText(label)===normalizeConsentControlText(proof.accessibleLabel)));
 if(!bound)return;
 return {policyVersion:"retained_cookie_reject_scope.v1",basis:"bound_canonical_reject_context",controlObservedAtMs:proof.observedAtMs,
  selectorSha256,frameIdentitySha256:proof.frameIdentitySha256,classifierRegistryVersion:classification.registryVersion,matchedTerm:classification.matchedTerm};
}

/** Cookie-wide refusal can anchor cookie-based advertising/identity collection
 * risk. It does not assert refusal of every CCPA processing purpose. */
export function assessCaliforniaPostReject(value:unknown, policyVersion?:CaliforniaPostRejectAssessment["policyVersion"]):CaliforniaPostRejectAssessment|null {
 const parsed=postRefusalReportProjectionSchema.safeParse(value);if(!parsed.success)return null;
 policyVersion??=parsed.data.scoringEvidence?.requests.some(r=>["bounded_ca_request_proof.v13","bounded_ca_request_proof.v14"].includes(r.californiaCollection?.proof?.policyVersion??""))?MAGNITE_AUCTION_POST_REJECT_POLICY:parsed.data.scoringEvidence?.requests.some(r=>r.californiaCollection?.proof?.policyVersion==="bounded_ca_request_proof.v12")?INDEX_AUCTION_POST_REJECT_POLICY:CALIFORNIA_POST_REJECT_POLICY;
 const propertyBound=policyVersion===MAGNITE_AUCTION_POST_REJECT_POLICY||policyVersion===INDEX_AUCTION_POST_REJECT_POLICY||policyVersion===CALIFORNIA_POST_REJECT_POLICY||policyVersion===PROPERTY_BOUND_POST_REJECT_POLICY;
 const p=parsed.data,propertySource=propertyBound?readPropertySaleSharingSource(parsed.data.propertySaleSharingSource):undefined,presence=retainedRejectPresence(p),proof=p.actionControlProof;
 const label=proof?.accessibleLabel??"";
 const classification=classifyConsentControlLabel({label,contextText:proof?.cmpId??"",usage:"observation"});
 const legacyScope=proof?.classifierIntent==="reject" && proof.classifierConfidence>=0.9 &&
  (classification.semanticRole==="necessary_only" || /^(?:reject|decline|deny) all(?: cookies)?[.!]?$/i.test(label.trim()))
  ? "cookie_tracking_rejection" as const:"unknown" as const;
 const scopeEvidence=legacyScope==="unknown"&&[CALIFORNIA_POST_REJECT_POLICY,INDEX_AUCTION_POST_REJECT_POLICY,MAGNITE_AUCTION_POST_REJECT_POLICY].some(v=>v===policyVersion)?retainedCookieRejectScope(p):undefined;
 const scope=scopeEvidence?"cookie_tracking_rejection" as const:legacyScope;
 const source=p.sourceIdentity;
 const verified=presence && source && p.packetSha256 && source.targetSha256===proof?.authorizedTargetSha256;
 const requests:CaliforniaPostRejectAssessment["requests"]=[];
 const sourceRequests=presence?presence.requestIds.map(id=>p.scoringEvidence!.requests.find(row=>row.requestId===id)!).sort((a,b)=>Number(Boolean(b.californiaCollection))-Number(Boolean(a.californiaCollection))):[];
 if(verified && scope!=="unknown")for(const row of sourceRequests.slice(0,32)){
  const requestId=row.requestId;
  const fact=row.californiaCollection;
  const retained=p.afterActionRequests?.find(row=>row.requestId===requestId);
  let propertyEvidence: z.infer<typeof propertySaleSharingProofSchema>|undefined;
  let reason:CaliforniaPostRejectAssessment["requests"][number]["reason"]="request_metadata_unavailable";
  if(fact && (!retained || JSON.stringify(fact)===JSON.stringify(retained.californiaCollection))) {
   let qualification={...fact.qualification,policyVersion:policyVersion===MAGNITE_AUCTION_POST_REJECT_POLICY&&["bounded_ca_request_proof.v13","bounded_ca_request_proof.v14"].includes(fact.proof?.policyVersion??"")&&fact.qualification.basis==="magnite_exchange_bid_user_identifier"?"ca_sale_sharing_qualification.v5-magnite-auction" as const:(policyVersion===INDEX_AUCTION_POST_REJECT_POLICY||policyVersion===MAGNITE_AUCTION_POST_REJECT_POLICY)&&fact.proof?.policyVersion==="bounded_ca_request_proof.v12"&&fact.qualification.basis==="index_exchange_bid_user_identifier"?"ca_sale_sharing_qualification.v4-index-auction" as const:propertyBound?"ca_sale_sharing_qualification.v3" as const:policyVersion===PREVIOUS_POLICY?"ca_sale_sharing_qualification.v2" as const:undefined};
   const declaration=propertySource?.declarations.find(d=>d.propertyIdSha256===fact.propertyBinding?.propertyIdSha256&&d.entityId===fact.entity.entityId);
   if(qualification.activity==="unresolved"&&declaration&&propertySource){
    propertyEvidence={policyVersion:"corroborated_property_collection.v1",sourceBundleSha256:propertySource.sourceBundleSha256,
     declarationId:declaration.declarationId,propertyIdSha256:declaration.propertyIdSha256,requestUrlSha256:fact.urlSha256};
    qualification={...qualification,activity:"declared_sale_sharing_collection",basis:declaration.basis,propertyEvidence};
   }
   reason=fact.contractVersion==="california_reject_request.v2" &&
    (fact.proof?.headersStatus!=="complete" || !["absent","complete"].includes(fact.proof?.bodyStatus??""))?"request_proof_incomplete":
    qualification.processingSignals.some(signal=>["privacy_signal_invalid","gpp_unresolved","privacy_signal_conflict"].includes(signal))?"qualification_unresolved":
    qualification.activity==="unresolved"?(propertyBound?"sale_sharing_purpose_unresolved":"qualification_unresolved"):
    !isQualifyingSaleSharingRequest(qualification)?"restricted_or_unresolved_processing":
    fact.payload!=="no_body" && fact.payload!=="inspected_body"?"payload_uninspected":
    fact.httpStatus===null || fact.httpStatus<200 || fact.httpStatus>=400 || row.completedAtMs===undefined || row.completedAtMs>presence.end?"response_unverified":"qualified_collection";
  }
  const measurement=retained?.measurementEvidence??row.measurementEvidence;
  const metadata=Boolean(fact||measurement);
  if(propertyBound&&!fact&&measurement?.profile==="google_analytics_collection.v1")reason="sale_sharing_purpose_unresolved";
  requests.push({requestId,msAfterClick:row.startedAtMs-presence.start,reason,
   ...(propertyBound?{diagnostics:{collectionMetadata:metadata?"observed" as const:"unavailable" as const,
    propertyBinding:fact?.propertyBinding?"observed" as const:"unavailable" as const,purpose:(fact&&fact.qualification.activity!=="unresolved"||propertyEvidence)?"supported" as const:"unresolved" as const},...(propertyEvidence?{propertyEvidence}:{})}:{}),
   ...(fact?{entityId:fact.entity.entityId,entity:fact.entity.label}:{})});
 }
 const recipientIds=[...new Set(requests.filter(row=>row.reason==="qualified_collection").map(row=>row.entityId!))].sort();
 return californiaPostRejectAssessmentSchema.parse({policyVersion,scanId:source?.scanId??null,
  sourcePacketSha256:p.packetSha256??null,targetSha256:source?.targetSha256??null,scope,controlLabel:label,...(scopeEvidence?{scopeEvidence}:{}),
  requestsObserved:sourceRequests.length,requestsTruncated:sourceRequests.length>32,
  status:recipientIds.length?"qualified_collection":sourceRequests.length>32 || !verified || scope==="unknown" || requests.some(row=>row.reason==="request_metadata_unavailable"||row.reason==="response_unverified"||row.reason==="payload_uninspected"||row.reason==="request_proof_incomplete"||row.reason==="qualification_unresolved"||row.reason==="sale_sharing_purpose_unresolved")?"insufficient_evidence":"no_eligible_collection",
  recipientIds,requests});
}
export function retainedCaliforniaPostReject(runtime:Record<string,unknown>|null|undefined) {
 const parsed=californiaPostRejectAssessmentSchema.safeParse(runtime?.californiaPostRejectAssessment);if(!parsed.success)return null;
 const derived=assessCaliforniaPostReject(runtime?.postRefusalEvidenceProjection,parsed.data.policyVersion);
 return derived && JSON.stringify(derived)===JSON.stringify(parsed.data)?parsed.data:null;
}
export function californiaPostRejectPoints(a:CaliforniaPostRejectAssessment) {
 return californiaChoiceEnforcementPoints(a.recipientIds,a.status==="qualified_collection");
}
