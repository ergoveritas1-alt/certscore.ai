import {createHash} from "node:crypto";
import type {CanonicalEvidenceBundle} from "@certscore/contracts";

/** Protect source events for already-selected proofs within existing event
 * caps. No event is reconstructed from a digest, label or proof row. */
export function gpcProofEventPriorities(bundle: CanonicalEvidenceBundle): Set<string> {
  const session=bundle.gpcObservationSession, selected=new Set<string>();
  if(!session?.mainDocument)return selected;
  const byId=new Map<string,typeof bundle.networkEvents>();
  const requestCounts=new Map<string,number>();
  for(const event of bundle.networkEvents){const rows=byId.get(event.eventId)??[];rows.push(event);byId.set(event.eventId,rows);requestCounts.set(event.requestId,(requestCounts.get(event.requestId)??0)+1);}
  for(const row of session.requestProofCapture?.rows??[]){
    const matches=byId.get(row.eventId), event=matches?.length===1?matches[0]:undefined,p=row.proof;
    if(!event||requestCounts.get(event.requestId)!==1||row.documentToken!==session.mainDocument.documentToken||event.requestId!==p.requestId||event.method!==p.method||event.timestampMs!==p.startedAtMs)continue;
    try{
      const url=new URL(event.requestUrl);
      if(url.origin!==p.origin||url.pathname!==p.path||createHash("sha256").update(event.requestUrl).digest("hex")!==p.urlSha256)continue;
    }catch{continue;}
    selected.add(event.eventId);
    const responses=bundle.networkResponseEvents.filter(r=>r.requestId===event.requestId);
    if(responses.length===1&&responses[0]!.responseUrl===event.requestUrl&&responses[0]!.status===p.httpStatus)selected.add(responses[0]!.eventId);
  }
  return selected;
}
