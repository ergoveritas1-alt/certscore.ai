import {z} from "zod";
import {postRefusalReportProjectionSchema,isQualifyingSaleSharingRequest,classifyConsentControlLabel} from "@certscore/contracts";
import {retainedRejectPresence} from "./reject-presence-evidence";
import {californiaChoiceEnforcementPoints} from "./california-choice-enforcement-policy";
export const CALIFORNIA_POST_REJECT_POLICY="california-post-reject.v1" as const;
export const CALIFORNIA_POST_REJECT_FINDING="california_post_reject_collection" as const;
export const californiaPostRejectAssessmentSchema=z.object({
 policyVersion:z.literal(CALIFORNIA_POST_REJECT_POLICY),scanId:z.string().min(1).max(160).nullable(),
 sourcePacketSha256:z.string().regex(/^[a-f0-9]{64}$/).nullable(),targetSha256:z.string().regex(/^[a-f0-9]{64}$/).nullable(),
 scope:z.enum(["cookie_tracking_rejection","unknown"]),controlLabel:z.string().max(160),
 status:z.enum(["qualified_collection","no_eligible_collection","insufficient_evidence"]),
 requestsObserved:z.number().int().nonnegative(),requestsTruncated:z.boolean(),
 recipientIds:z.array(z.string().regex(/^ent_[a-f0-9]{12}$/)).max(32),
 requests:z.array(z.object({requestId:z.string().max(120),msAfterClick:z.number().int().nonnegative(),
  reason:z.enum(["qualified_collection","request_metadata_unavailable","restricted_or_unresolved_processing","payload_uninspected","response_unverified","request_proof_incomplete","qualification_unresolved"]),
  entityId:z.string().regex(/^ent_[a-f0-9]{12}$/).optional(),entity:z.string().max(200).optional(),
 }).strict()).max(32),
 }).strict().superRefine((a,ctx)=>{
 const ids=[...new Set(a.requests.filter(r=>r.reason==="qualified_collection").map(r=>r.entityId))].sort();
 if(ids.some(id=>!id) || JSON.stringify(ids)!==JSON.stringify(a.recipientIds) || new Set(a.requests.map(r=>r.requestId)).size!==a.requests.length ||
  ((a.status==="qualified_collection")!==(ids.length>0)) || ids.length>0&&(!a.scanId||!a.sourcePacketSha256||!a.targetSha256||a.scope==="unknown"))
  ctx.addIssue({code:z.ZodIssueCode.custom,message:"California Reject recipients require consistent source-bound qualifying requests."});
});
export type CaliforniaPostRejectAssessment=z.infer<typeof californiaPostRejectAssessmentSchema>;

/** Cookie-wide refusal can anchor cookie-based advertising/identity collection
 * risk. It does not assert refusal of every CCPA processing purpose. */
export function assessCaliforniaPostReject(value:unknown):CaliforniaPostRejectAssessment|null {
 const parsed=postRefusalReportProjectionSchema.safeParse(value);if(!parsed.success)return null;
 const p=parsed.data,presence=retainedRejectPresence(p),proof=p.actionControlProof;
 const label=proof?.accessibleLabel??"";
 const classification=classifyConsentControlLabel({label,contextText:proof?.cmpId??"",usage:"observation"});
 const scope=proof?.classifierIntent==="reject" && proof.classifierConfidence>=0.9 &&
  (classification.semanticRole==="necessary_only" || /^(?:reject|decline|deny) all(?: cookies)?[.!]?$/i.test(label.trim()))
  ? "cookie_tracking_rejection" as const:"unknown" as const;
 const source=p.sourceIdentity;
 const verified=presence && source && p.packetSha256 && source.targetSha256===proof?.authorizedTargetSha256;
 const requests:CaliforniaPostRejectAssessment["requests"]=[];
 const sourceRequests=presence?presence.requestIds.map(id=>p.scoringEvidence!.requests.find(row=>row.requestId===id)!).sort((a,b)=>Number(Boolean(b.californiaCollection))-Number(Boolean(a.californiaCollection))):[];
 if(verified && scope!=="unknown")for(const row of sourceRequests.slice(0,32)){
  const requestId=row.requestId;
  const fact=row.californiaCollection;
  const retained=p.afterActionRequests?.find(row=>row.requestId===requestId);
  let reason:CaliforniaPostRejectAssessment["requests"][number]["reason"]="request_metadata_unavailable";
  if(fact && (!retained || JSON.stringify(fact)===JSON.stringify(retained.californiaCollection))) {
   reason=fact.contractVersion==="california_reject_request.v2" &&
    (fact.proof?.headersStatus!=="complete" || !["absent","complete"].includes(fact.proof?.bodyStatus??""))?"request_proof_incomplete":
    fact.qualification.activity==="unresolved" || fact.qualification.processingSignals.some(signal=>["privacy_signal_invalid","gpp_unresolved","privacy_signal_conflict"].includes(signal))?"qualification_unresolved":
    !isQualifyingSaleSharingRequest(fact.qualification)?"restricted_or_unresolved_processing":
    fact.payload!=="no_body" && fact.payload!=="inspected_body"?"payload_uninspected":
    fact.httpStatus===null || fact.httpStatus<200 || fact.httpStatus>=400 || row.completedAtMs===undefined || row.completedAtMs>presence.end?"response_unverified":"qualified_collection";
  }
  requests.push({requestId,msAfterClick:row.startedAtMs-presence.start,reason,
   ...(fact?{entityId:fact.entity.entityId,entity:fact.entity.label}:{})});
 }
 const recipientIds=[...new Set(requests.filter(row=>row.reason==="qualified_collection").map(row=>row.entityId!))].sort();
 return californiaPostRejectAssessmentSchema.parse({policyVersion:CALIFORNIA_POST_REJECT_POLICY,scanId:source?.scanId??null,
  sourcePacketSha256:p.packetSha256??null,targetSha256:source?.targetSha256??null,scope,controlLabel:label,
  requestsObserved:sourceRequests.length,requestsTruncated:sourceRequests.length>32,
  status:recipientIds.length?"qualified_collection":sourceRequests.length>32 || !verified || scope==="unknown" || requests.some(row=>row.reason==="request_metadata_unavailable"||row.reason==="response_unverified"||row.reason==="payload_uninspected"||row.reason==="request_proof_incomplete"||row.reason==="qualification_unresolved")?"insufficient_evidence":"no_eligible_collection",
  recipientIds,requests});
}
export function retainedCaliforniaPostReject(runtime:Record<string,unknown>|null|undefined) {
 const parsed=californiaPostRejectAssessmentSchema.safeParse(runtime?.californiaPostRejectAssessment);if(!parsed.success)return null;
 const derived=assessCaliforniaPostReject(runtime?.postRefusalEvidenceProjection);
 return derived && JSON.stringify(derived)===JSON.stringify(parsed.data)?parsed.data:null;
}
export function californiaPostRejectPoints(a:CaliforniaPostRejectAssessment) {
 return californiaChoiceEnforcementPoints(a.recipientIds,a.status==="qualified_collection");
}
