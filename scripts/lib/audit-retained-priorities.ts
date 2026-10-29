/** Operational review candidates only. These never create or upgrade findings. */
import {consentConfirmationDiagnosticsSchema} from "../../packages/certscore-contracts/src/consent-confirmation-diagnostics";
import {obj,arr,type Obj} from "./audit-progress";
export function actionConfirmationReview(packet:Obj,action:"accept"|"reject"){
  const registration=obj(packet[action==="accept"?"acceptanceRegistration":"refusalRegistration"]),click=obj(obj(packet.interactionDiagnostics).click).outcome;
  const diagnostic=consentConfirmationDiagnosticsSchema.safeParse(packet.confirmationDiagnostics);
  return {action,provider:String(obj(packet.resolver).cmpId??"not_identified"),click:String(click??"not_checked"),registration:String(registration.status??"not_checked"),
    reasons:diagnostic.success?diagnostic.data.reasons:["diagnostics_not_retained"],terminalRead:diagnostic.success?diagnostic.data.terminalRead:"not_checked",
    // A late operational decision never rewrites initial semantic registration.
    terminalDecisionRetained:!!packet.terminalDecisionEvidence,diagnosticOnly:true};
}
export function unsupportedProtocolReview(bundle:Obj){
  const session=obj(bundle.gpcObservationSession),capture=obj(session.requestProofCapture),events=arr(bundle.networkEvents),rows:Obj[]=[];
  for(const row of arr(capture.rows)){
    const proof=obj(row.proof),details=obj(proof.proof);
    if(details.bodyStatus!=="unsupported")continue;
    const event=events.find(e=>e.eventId===row.eventId&&e.requestId===proof.requestId);
    const joined=!!event&&row.documentToken===obj(session.mainDocument).documentToken;
    const metadata=obj(event?.requestPayloadSignals),fieldNames=joined?arr(metadata.bodyFieldNames).filter(v=>typeof v==="string"&&/^[A-Za-z_$][\w.$-]{0,63}$/.test(v as any)).slice(0,32):[];
    rows.push({entityId:String(obj(proof.entity).entityId??"unknown"),origin:String(proof.origin),path:String(proof.path),method:String(proof.method),
      proofVersion:String(details.policyVersion),bodyFormat:String(details.bodyFormat),reasons:arr(details.reasons),bodyFieldNames:fieldNames,
      sourceEventJoined:joined,httpStatus:proof.httpStatus??null,bodySha256:details.bodySha256??null,
      processingSignals:arr(obj(proof.qualification).processingSignals),
      // Retained hashes/field names cannot reconstruct a body or prove new collection.
      rawBodyRetained:false,disposition:"requires_reviewed_protocol_and_original_eligible_bytes",newFinding:false});
  }
  return rows;
}
export function rankProtocolReviews(rows:Obj[]){
  const groups=new Map<string,Obj>();
  for(const row of rows){const key=JSON.stringify([row.origin,row.path,row.proofVersion,row.bodyFormat,row.reasons]);let group=groups.get(key);
    if(!group){group={origin:row.origin,path:row.path,proofVersion:row.proofVersion,bodyFormat:row.bodyFormat,reasons:row.reasons,requests:0,scanIds:new Set(),bodyFieldNames:new Set(),rawBodyRetained:false,newFindings:0};groups.set(key,group);}
    group.requests++;group.scanIds.add(row.scanId);for(const name of row.bodyFieldNames)group.bodyFieldNames.add(name);
  }
  return [...groups.values()].map((g):Obj=>({...g,scanIds:[...g.scanIds].sort(),bodyFieldNames:[...g.bodyFieldNames].sort()})).sort((a,b)=>b.requests-a.requests||a.origin.localeCompare(b.origin));
}
