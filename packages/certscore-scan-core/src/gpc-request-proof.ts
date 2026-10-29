import {isQualifyingSaleSharingRequest,gpcRequestProofSchema,type GpcObservationSession,type NetworkEvent} from "@certscore/contracts";
import {inspectGpcRequestQualification,applyGppRequestCmpContext} from "@certscore/vendor-resolver";
import {captureCaliforniaRejectRequest,californiaProofRecipient} from "./california-reject-request";
import {gpcDocumentHash} from "./gpc-signal-capture";
import {measurementInspectionBudget} from "./measurement-capture";

type Capture=NonNullable<GpcObservationSession["requestProofCapture"]>;
type Row=Capture["rows"][number];
/** One representative per recipient before duplicate requests; prefer positive
 * qualification. Stable order preserves the earliest equally useful proof. */
export function prioritizeGpcRecipients<T>(rows:readonly T[],entity:(r:T)=>string,positive:(r:T)=>boolean,cap:number):T[]{
 if(cap<=0)return [];
 if(rows.length<=cap)return [...rows];
 const sorted=[...rows].sort((a,b)=>Number(positive(b))-Number(positive(a)));
 const selected:T[]=[],seen=new Set<string>();
 for(const row of sorted){const id=entity(row);if(seen.has(id))continue;selected.push(row);seen.add(id);if(selected.length>=cap)return selected;}
 for(const row of sorted){if(selected.includes(row))continue;selected.push(row);if(selected.length>=cap)break;}
 return selected;
}
/** In-memory interpretation of the existing Request, never an HTTP fetch. */
export function createGpcRequestProofCapture(now:()=>number){
 const budget=measurementInspectionBudget({distinctRecipients:true});
 let inspected=0,skipped=0,pending=0,failed=0,finished=false;
 const failureOutcomes={noProof:0,captureException:0};
 const rows:Row[]=[],restrictions:Capture["restrictions"]=[];
 const statuses=new Map<string,number|null>();
 return {
  response(eventId:string,status:number){
   if(finished||!statuses.has(eventId))return;
   statuses.set(eventId,status);const row=rows.find(r=>r.eventId===eventId);if(row)row.proof.httpStatus=status;
  },
  reserve(event:Pick<NetworkEvent,"eventId"|"timestampMs"|"requestUrl"> & Partial<Pick<NetworkEvent,"requestId"|"method">>,documentToken:string|undefined,
    request:{postData?:()=>string|null;method?:()=>string}){
   if(finished||!documentToken||!request.postData||!request.method||!event.requestId)return null;
   const recipient=californiaProofRecipient(event.requestUrl);if(!recipient)return null;
   if(!budget.available(true,recipient.entityId)){skipped++;return null;}
   budget.retained(true,recipient.entityId);inspected++;pending++;statuses.set(event.eventId,null);
   let body:string|null|undefined;
   try{body=request.postData();}catch{body=undefined;}
   // Do not retain arbitrarily large bodies while waiting for an existing read.
   const hasBody=body!==null;
   if(body && Buffer.byteLength(body)>32768)body=undefined;
   let resolved=false;
   return (headers?:Record<string,string>)=>{
    if(finished||resolved)return;resolved=true;pending--;
    try{
     const fact=captureCaliforniaRejectRequest({url:event.requestUrl,method:request.method!(),requestId:event.requestId!,startedAtMs:event.timestampMs,
      httpStatus:statuses.get(event.eventId)??undefined,hasBody,body,headers,headerPolicy:"supplemental",qualificationContext:{gpcDelivered:true,requestAtMs:event.timestampMs}});
     if(!fact){failed++;failureOutcomes.noProof++;return;}
     const proof=gpcRequestProofSchema.parse({...fact,contractVersion:"gpc_request_proof.v1"});
     const capturedAtMs=now();rows.push({eventId:event.eventId,documentToken,capturedAtMs,proof});
     // Absence/limits of supplemental proof are not a new URL eligibility gate.
     // Keep only positively observed restrictions/conflicts, not generated
     // headers-unavailable markers. Independent sibling requests remain eligible.
     const signals=proof.qualification.processingSignals;
     if(signals.length)restrictions.push({eventId:event.eventId,documentToken,urlSha256:proof.urlSha256,timestampMs:event.timestampMs,capturedAtMs,processingSignals:signals});
    }catch{failed++;failureOutcomes.captureException++;}finally{body=undefined;}
   };
  },
  finish(documentToken?:string):Capture{
   finished=true;
   const current=documentToken?rows.filter(r=>r.documentToken===documentToken):rows;
   const selected=prioritizeGpcRecipients(current,r=>r.proof.entity.entityId,r=>isQualifyingSaleSharingRequest(r.proof.qualification)&&(r.proof.httpStatus??0)>=200&&(r.proof.httpStatus??600)<400,32);
   const bodyOutcomes={absent:0,complete:0,unavailable:0,limited:0,unsupported:0};
   for(const row of rows)bodyOutcomes[row.proof.proof!.bodyStatus]++;
   return {contractVersion:"gpc_request_capture.v2",inspected,skipped,pending,failed,retentionDropped:rows.length-selected.length,rows:selected,restrictions,
    diagnostics:{contractVersion:"gpc_request_capture_diagnostics.v1",documentFilterApplied:!!documentToken,
     obsoleteDocumentDropped:rows.length-current.length,capEvicted:current.length-selected.length,bodyOutcomes,failureOutcomes:{...failureOutcomes}}};
  },
 };
}

/** Supplements discover recipients; missing/incomplete supplements never erase
 * independently eligible URL facts. Real restrictions affect only this event. */
export function qualifyGpcRequest(event:Pick<NetworkEvent,"eventId"|"requestId"|"method"|"requestUrl"|"timestampMs">,
 session:GpcObservationSession,context:Parameters<typeof inspectGpcRequestQualification>[1]){
 const base=inspectGpcRequestQualification(event.requestUrl,context);
 const capture=session.requestProofCapture;
 const expected=californiaProofRecipient(event.requestUrl),url=new URL(event.requestUrl);
 const row=capture?.rows.find(r=>r.eventId===event.eventId&&r.documentToken===session.mainDocument?.documentToken&&
  r.proof.requestId===event.requestId&&r.proof.method===event.method&&r.proof.startedAtMs===event.timestampMs&&
  r.proof.urlSha256===gpcDocumentHash(event.requestUrl)&&r.proof.origin===url.origin&&r.proof.path===url.pathname&&r.proof.entity.entityId===expected?.entityId);
 const restriction=capture?.restrictions.find(r=>r.eventId===event.eventId&&r.documentToken===session.mainDocument?.documentToken&&r.urlSha256===gpcDocumentHash(event.requestUrl)&&r.timestampMs===event.timestampMs);
 const complete=row?.proof.proof?.headersStatus==="complete"&&["absent","complete"].includes(row.proof.proof.bodyStatus);
 const supplemental=row?{...structuredClone(row.proof.qualification),policyVersion:["bounded_ca_request_proof.v13","bounded_ca_request_proof.v14"].includes(row.proof.proof?.policyVersion??"")&&row.proof.qualification.basis==="magnite_exchange_bid_user_identifier"?"ca_sale_sharing_qualification.v5-magnite-auction" as const:row.proof.proof?.policyVersion==="bounded_ca_request_proof.v12"&&row.proof.qualification.basis==="index_exchange_bid_user_identifier"?"ca_sale_sharing_qualification.v4-index-auction" as const:"ca_sale_sharing_qualification.v3" as const}:undefined;
 if(supplemental?.gpp){
  supplemental.gpp=applyGppRequestCmpContext(supplemental.gpp,context??{});
  if(supplemental.gpp.cmpComparison==="same_time_conflicting"&&!supplemental.processingSignals.includes("privacy_signal_conflict"))supplemental.processingSignals.push("privacy_signal_conflict");
 }
 const qualified=complete&&supplemental&&(isQualifyingSaleSharingRequest(supplemental)||supplemental.basis==="magnite_exchange_bid_user_identifier"&&supplemental.policyVersion==="ca_sale_sharing_qualification.v5-magnite-auction"||supplemental.basis==="index_exchange_bid_user_identifier"&&supplemental.policyVersion==="ca_sale_sharing_qualification.v4-index-auction")?supplemental:base;
 // Full, exact-request supplemental inspection may observe GPP only in the
 // body. Keep that positive processing evidence even when the request role
 // remains unresolved; role fallback must not relabel it as not_present.
 const gpp=complete&&supplemental?.gpp&&supplemental.gpp.status!=="not_present"?supplemental.gpp:qualified.gpp;
 return {...qualified,...(gpp?{gpp}:{}),processingSignals:[...new Set([...base.processingSignals,...qualified.processingSignals,...(complete?supplemental?.processingSignals??[]:[]),...(restriction?.processingSignals??[]),...(supplemental?.gpp?.cmpComparison==="same_time_conflicting"?["privacy_signal_conflict" as const]:[])])]};
}
