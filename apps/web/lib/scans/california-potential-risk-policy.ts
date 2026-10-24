import {californiaChoiceEnforcementPoints} from "./california-choice-enforcement-policy";
import {gpcResponseAssessmentSchema, postRefusalReportProjectionSchema, isQualifyingSaleSharingRequest} from "@certscore/contracts";
import {resolveCanonicalVendor} from "@certscore/vendor-resolver";
import {retainedRejectPresence} from "./reject-presence-evidence";
import {assessCaliforniaPostReject,PROPERTY_BOUND_POST_REJECT_POLICY} from "./california-post-reject-policy";

import { CA_POTENTIAL_RISK_LEGACY_POLICY, CA_POTENTIAL_RISK_POLICY, californiaPotentialRiskSchema, type CaliforniaPotentialRiskAssessment } from "./california-potential-risk-contract";
export * from "./california-potential-risk-contract";
export function potentialRiskPoints(ids:Iterable<string>,version:string=CA_POTENTIAL_RISK_POLICY):number {
 const count=new Set(ids).size;
 return count===0?0:version===CA_POTENTIAL_RISK_LEGACY_POLICY?5:[0,7,11,13,15][Math.min(count,4)]!;
}
/** Bound the mixed increment by the full schedule for the same total recipient
 * inventory. Promotion then cannot improve a score or exceed the shared cap. */
export function potentialRiskIncrement(full:Iterable<string>,potential:Iterable<string>,supported:boolean,version:string=CA_POTENTIAL_RISK_POLICY):number {
 const qualified=new Set(full),remaining=[...new Set(potential)].filter(id=>!qualified.has(id));
 const points=potentialRiskPoints(remaining,version);
 if(version===CA_POTENTIAL_RISK_LEGACY_POLICY)return points;
 return Math.min(points,Math.max(0,californiaChoiceEnforcementPoints([...qualified,...remaining],supported||remaining.length>0)-californiaChoiceEnforcementPoints([...qualified],supported)));
}
const restricted = new Set(["google_rdp", "google_limited_ads", "meta_ldu", "us_privacy_sale_opt_out", "gpp_opt_out", "gpp_service_provider"]);
function requestSignals(q:Parameters<typeof isQualifyingSaleSharingRequest>[0]):string[] {
  const signals=new Set<string>(q.processingSignals);
  // Keep decoded declarations authoritative even if a historical producer
  // omitted the redundant convenience flag.
  if(q.gpp?.status==="decoded")for(const section of q.gpp.sections){
    if(section.saleOptOut===1||section.sharingOptOut===1||section.targetedAdvertisingOptOut===1)signals.add("gpp_opt_out");
    if(section.serviceProviderMode===1)signals.add("gpp_service_provider");
  }
  return [...signals];
}
function treatment(signals:string[],qualified:boolean):CaliforniaPotentialRiskAssessment["rows"][number]["treatment"] {
  return qualified?"qualified_collection":signals.some(s=>restricted.has(s))?"declared_restriction":"potential_risk";
}
export function assessGpcPotentialRisk(value:unknown,policyVersion:CaliforniaPotentialRiskAssessment["policyVersion"]=CA_POTENTIAL_RISK_POLICY):CaliforniaPotentialRiskAssessment|null {
  const parsed=gpcResponseAssessmentSchema.safeParse(value);
  if(!parsed.success||parsed.data.contractVersion!=="certscore.gpc-response-assessment.v3")return null;
  const o=parsed.data.observation;
  if(!o.scanId||!o.requests.collectionReview||!o.sourceSha256||!o.sessionSha256||!o.documentUrlSha256||
    (!o.delivery.httpHeaderRetained||!o.delivery.mainNavigatorReadbackRetained)||!o.positiveEvidence?.representativeDocument)return null;
  return californiaPotentialRiskSchema.parse({policyVersion,path:"gpc",scanId:o.scanId,sourceSha256:o.sourceSha256,
    rows:o.requests.collectionReview.rows.map(r=>({evidenceId:r.evidenceId,entityId:r.entityId,entity:r.label,msFromAnchor:r.observedAtMs,
      purpose:r.purpose,processingSignals:requestSignals(r.qualification),treatment:treatment(requestSignals(r.qualification),isQualifyingSaleSharingRequest(r.qualification))})),
    responseUnverified:0,legalConclusion:"not_established"});
}
export function assessRejectPotentialRisk(value:unknown,policyVersion:CaliforniaPotentialRiskAssessment["policyVersion"]=CA_POTENTIAL_RISK_POLICY):CaliforniaPotentialRiskAssessment|null {
  const parsed=postRefusalReportProjectionSchema.safeParse(value);if(!parsed.success)return null;
  const p=parsed.data,presence=retainedRejectPresence(p),full=policyVersion===CA_POTENTIAL_RISK_POLICY?assessCaliforniaPostReject(p):assessCaliforniaPostReject(p,PROPERTY_BOUND_POST_REJECT_POLICY);
  if(!presence||!p.packetSha256||!p.sourceIdentity||p.sourceIdentity.targetSha256!==p.actionControlProof?.authorizedTargetSha256||full?.scope!=="cookie_tracking_rejection")return null;
  const rows:CaliforniaPotentialRiskAssessment["rows"]=[];let responseUnverified=0;
  for(const id of presence.requestIds) {
    if(p.scoringEvidence!.requests.filter(r=>r.requestId===id).length!==1)continue;
    const r=p.scoringEvidence!.requests.find(r=>r.requestId===id)!;
    let url:URL;try{url=new URL(r.sanitizedUrl);}catch{continue;}
    if(url.protocol!=="https:")continue;
    const retained=p.afterActionRequests?.find(r=>r.requestId===id);
    if(retained && (JSON.stringify(retained.californiaCollection)!==JSON.stringify(r.californiaCollection)||
      JSON.stringify(retained.measurementEvidence)!==JSON.stringify(r.measurementEvidence)||retained.httpStatus!==r.httpStatus))continue;
    const m=r.measurementEvidence,f=r.californiaCollection;
    // No purpose or payload inference from a historical sanitized URL. The
    // typed inspector must have positively identified this collection endpoint.
    if(!f&&!m)continue;
    if(m && (m.requestId!==id||m.timestampMs!==r.startedAtMs||m.method!==r.method||
      url.origin!==m.requestOrigin||url.pathname!==m.requestPath))continue;
    if(f&&(f.requestId!==id||f.method!==r.method||f.startedAtMs!==r.startedAtMs||f.origin!==url.origin||f.path!==url.pathname))continue;
    const vendor=resolveCanonicalVendor({type:"request",url:r.sanitizedUrl,sourceScanner:"reject_observation",matchSource:"network_request"}).observation;
    if(!vendor||vendor.confidence<.9||vendor.registryAttribution?.matchKind!=="endpoint"||vendor.purpose!==r.purpose||
      !["analytics","advertising","marketing","session_replay"].includes(vendor.purpose))continue;
    if(f&&f.entity.entityId!==vendor.registryAttribution.entityId)continue;
    if(f?.httpStatus!==undefined&&f.httpStatus!==null&&r.httpStatus!==undefined&&f.httpStatus!==r.httpStatus)continue;
    const status=f?.httpStatus??r.httpStatus;
    if(status===undefined||status===null||status<200||status>=400||r.completedAtMs===undefined||r.completedAtMs>presence.end){responseUnverified++;continue;}
    const signals=f?requestSignals(f.qualification):["processing_declarations_not_retained",...(r.googleConsentMode?.nonPersonalizedAds==="declared"?["google_npa"]:[])];
    rows.push({evidenceId:id,entityId:vendor.registryAttribution.entityId,entity:vendor.entity,msFromAnchor:r.startedAtMs-presence.start,
      purpose:vendor.purpose as CaliforniaPotentialRiskAssessment["rows"][number]["purpose"],processingSignals:signals,
      treatment:treatment(signals,full.requests.some(q=>q.requestId===id&&q.reason==="qualified_collection"))});
  }
  // Prioritize distinct recipients without increasing the retained 32-row cap.
  const first=rows.filter((r,i)=>rows.findIndex(x=>x.entityId===r.entityId)===i);
  const selected=[...first,...rows.filter(r=>!first.includes(r))].slice(0,32);
  return californiaPotentialRiskSchema.parse({policyVersion,path:"reject",scanId:p.sourceIdentity.scanId,
    sourceSha256:p.packetSha256,rows:selected,responseUnverified,legalConclusion:"not_established"});
}
export function retainedPotentialRisk(runtime:Record<string,unknown>|null|undefined):CaliforniaPotentialRiskAssessment[] {
  const pairs=[['californiaGpcPotentialRiskAssessment',runtime?.gpcResponseAssessment,assessGpcPotentialRisk],
    ['californiaRejectPotentialRiskAssessment',runtime?.postRefusalEvidenceProjection,assessRejectPotentialRisk]] as const;
  const assessments=pairs.flatMap(([key,source,derive])=>{
    const parsed=californiaPotentialRiskSchema.safeParse(runtime?.[key]);
    if(!parsed.success)return [];
    const derived=derive(source,parsed.data.policyVersion);
    return derived&&JSON.stringify(derived)===JSON.stringify(parsed.data)?[parsed.data]:[];
  });
  return new Set(assessments.map(a=>a.scanId)).size>1?[]:assessments;
}
export function potentialRiskRecipients(assessments:CaliforniaPotentialRiskAssessment[],qualified:Iterable<string>=[]) {
  const full=new Set(qualified);
  assessments.forEach(a=>a.rows.filter(r=>r.treatment==="qualified_collection").forEach(r=>full.add(r.entityId)));
  return [...new Set(assessments.flatMap(a=>a.rows.filter(r=>r.treatment==="potential_risk"&&!full.has(r.entityId)).map(r=>r.entityId)))].sort();
}
