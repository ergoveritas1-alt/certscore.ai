/** Operational review candidates only. These never create or upgrade findings. */
import {consentConfirmationDiagnosticsSchema} from "../../packages/certscore-contracts/src/consent-confirmation-diagnostics";
import {createHash} from "node:crypto";
import {gpcRequestProofSchema,californiaBodyDiagnosticSchema} from "../../packages/certscore-contracts/src/california-reject-evidence";
import {isQualifyingSaleSharingRequest} from "../../packages/certscore-contracts/src/gpc-bounded-observation";
import {obj,arr,type Obj} from "./audit-progress";
export function actionConfirmationReview(packet:Obj,action:"accept"|"reject"){
  const registration=obj(packet[action==="accept"?"acceptanceRegistration":"refusalRegistration"]),click=obj(obj(packet.interactionDiagnostics).click).outcome;
  const diagnostic=consentConfirmationDiagnosticsSchema.safeParse(packet.confirmationDiagnostics);
  const phases=diagnostic.success && diagnostic.data.policyVersion !== "consent_confirmation_diagnostics.v1" ? diagnostic.data : null;
  return {action,provider:String(obj(packet.resolver).cmpId??"not_identified"),click:String(click??"not_checked"),registration:String(registration.status??"not_checked"),
    reasons:diagnostic.success?diagnostic.data.reasons:["diagnostics_not_retained"],terminalRead:diagnostic.success?diagnostic.data.terminalRead:"not_checked",
    diagnosticVersion:diagnostic.success?diagnostic.data.policyVersion:null,
    initialReasons:phases?.initialReasons??null,terminalReasons:phases?.terminalReasons??null,
    reasonsTruncated:phases?.reasonsTruncated??null,
    // A late operational decision never rewrites initial semantic registration.
    terminalDecisionRetained:!!packet.terminalDecisionEvidence,diagnosticOnly:true};
}
/** Triage only. The caller separately verifies original parent/worker receipts. */
export function unsupportedProtocolReview(bundle:Obj){
  const session=obj(bundle.gpcObservationSession),capture=obj(session.requestProofCapture),events=arr(bundle.networkEvents),rows:Obj[]=[];
  for(const row of arr(capture.rows)){
    if(obj(obj(row.proof).proof).bodyStatus!=="unsupported")continue;
    const parsed=gpcRequestProofSchema.safeParse(row.proof),proof=parsed.success?parsed.data:null,details=proof?.proof;
    const matches=proof?events.filter(e=>e.eventId===row.eventId&&e.requestId===proof.requestId):[];
    const event=matches.length===1?matches[0]:undefined;
    const documentJoined=typeof row.documentToken==="string"&&row.documentToken.length>0&&row.documentToken===obj(session.mainDocument).documentToken;
    let eventBound=false;
    if(event&&proof)try{
      const url=new URL(event.requestUrl);
      eventBound=event.method===proof.method&&event.timestampMs===proof.startedAtMs&&
        url.origin===proof.origin&&url.pathname===proof.path&&
        createHash("sha256").update(event.requestUrl).digest("hex")===proof.urlSha256;
    }catch{/* A malformed retained URL is not a source join. */}
    const joined=!!proof&&documentJoined&&eventBound;
    const joinStatus=!parsed.success?"invalid_proof":matches.length===0?"missing_event":
      matches.length!==1?"ambiguous_event":!documentJoined||!eventBound?"binding_conflict":"bound";
    const signals=proof?.qualification.processingSignals??[],qualified=!!proof&&isQualifyingSaleSharingRequest(proof.qualification);
    const queue=joinStatus!=="bound"?"source_binding_review":signals.length?"processing_signal_review":
      qualified?"already_qualified":proof?.qualification.activity!=="unresolved"?"qualification_review":"unresolved_protocol";
    const metadata=obj(event?.requestPayloadSignals),fieldNames=joined?[...new Set(arr(metadata.bodyFieldNames).filter(v=>typeof v==="string"&&/^[A-Za-z_$][\w.$-]{0,63}$/.test(v as any)))].slice(0,32):[];
    const diagnostic=californiaBodyDiagnosticSchema.safeParse(details?.bodyDiagnostic);
    rows.push({eventId:typeof row.eventId==="string"?row.eventId:null,entityId:proof?.entity.entityId??"unknown",
      origin:proof?.origin??"invalid",path:proof?.path??"invalid",method:proof?.method??"invalid",
      proofVersion:details?.policyVersion??null,bodyFormat:details?.bodyFormat??null,reasons:details?.reasons??[],bodyFieldNames:fieldNames,
      sourceEventJoined:joined,joinStatus,queue,activity:proof?.qualification.activity??null,qualificationBasis:proof?.qualification.basis??null,
      retainedQualificationSupported:qualified,httpStatus:proof?.httpStatus??null,bodySha256:details?.bodySha256??null,
      bodyDiagnostic:diagnostic.success?diagnostic.data:null,processingSignals:signals,
      rawBodyRetained:false,disposition:queue==="unresolved_protocol"?"requires_reviewed_protocol_and_original_eligible_bytes":
        queue==="already_qualified"?"preserve_existing_url_qualification":queue==="source_binding_review"?"resolve_original_source_binding":"preserve_processing_or_qualification_limits",
      newFinding:false});
  }
  return rows;
}
const queueOrder:Record<string,number>={unresolved_protocol:0,processing_signal_review:1,qualification_review:2,already_qualified:3,source_binding_review:4};
function protocolOrder(origin:string,path:string){
  return origin==="https://analytics.tiktok.com"&&/^\/api\/v2\/pixel(?:\/act)?$/.test(path)?0:
    origin==="https://analytics.google.com"&&path==="/g/collect"?1:
    origin==="https://fastlane.rubiconproject.com"&&path==="/a/api/prebid-exchange.json"?2:
    origin==="https://htlb.casalemedia.com"&&path==="/openrtb/pbjs"?3:4;
}
export function rankProtocolReviews(rows:Obj[]){
  const groups=new Map<string,Obj>();
  for(const row of rows){const key=JSON.stringify([row.queue,row.joinStatus,row.origin,row.path,row.method,row.proofVersion,row.bodyFormat,row.bodyDiagnostic,row.activity,row.processingSignals,row.reasons]);let group=groups.get(key);
    if(!group){group={queue:row.queue,joinStatus:row.joinStatus,origin:row.origin,path:row.path,method:row.method,proofVersion:row.proofVersion,bodyFormat:row.bodyFormat,bodyDiagnostic:row.bodyDiagnostic,activity:row.activity,processingSignals:row.processingSignals,reasons:row.reasons,requests:0,scanIds:new Set(),bodyFieldNames:new Set(),rawBodyRetained:false,newFindings:0};groups.set(key,group);}
    group.requests++;group.scanIds.add(row.scanId);for(const name of row.bodyFieldNames)group.bodyFieldNames.add(name);
  }
  return [...groups.values()].map((g):Obj=>({...g,scanIds:[...g.scanIds].sort(),bodyFieldNames:[...g.bodyFieldNames].sort().slice(0,32)})).sort((a,b)=>
    (queueOrder[a.queue]??9)-(queueOrder[b.queue]??9)||protocolOrder(a.origin,a.path)-protocolOrder(b.origin,b.path)||b.requests-a.requests||a.origin.localeCompare(b.origin)||a.path.localeCompare(b.path));
}
