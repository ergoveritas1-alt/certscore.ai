import {createHash} from "node:crypto";
import type {CanonicalEvidenceBundle, GpcImpactCapture} from "@certscore/contracts";
import {gpcEndpointEvidence} from "./gpc-vendor-evidence.js";
import {gpcDocumentHash} from "./gpc-signal-capture.js";
import {gpcImpactIdentityHash} from "./gpc-impact-capture.js";

/** Freeze complete, compact request facts before ordinary display samples are
 * pruned. No URLs, headers, values or new browser work enter this ledger. */
export function retainGpcComparisonLedger(bundle:CanonicalEvidenceBundle):GpcImpactCapture|undefined {
  const capture=bundle.gpcImpactCapture;
  if (!capture || capture.comparisonPolicy!=="page_http_signal.v2" || !capture.document || capture.requestLedger) return capture;
  const start=capture.document.committedAtMs;
  for(const window of [...capture.windows].reverse()) {
    const events=bundle.networkEvents.filter(e=>e.timestampMs>=start && e.timestampMs<start+window.durationMs);
    if(events.length>1000 || events.length!==window.requestCount)continue;
    const rows=events.map(e=>{
      const advertising=new Set<string>(),analytics=new Set<string>();let attributionUnknown=false;
      for(const v of bundle.normalizedVendorObservations) {
        if(!["advertising","marketing","analytics","session_replay"].includes(v.purpose)||!v.matchedEvidenceIds.includes(e.eventId))continue;
        const proof=gpcEndpointEvidence(v,e.eventId);
        if(proof==="unknown")attributionUnknown=true;
        if(proof!=="verified")continue;
        const id=createHash("sha256").update(JSON.stringify([v.vendor,v.product??"unspecified",v.purpose])).digest("hex");
        (["advertising","marketing"].includes(v.purpose)?advertising:analytics).add(id);
      }
      return {eventId:e.eventId,timestampMs:e.timestampMs,urlSha256:gpcDocumentHash(e.requestUrl),headersVerified:e.requestHeaders!==undefined,
        secGpc:e.requestHeaders?.secGpc===undefined?null:e.requestHeaders.secGpc==="1"?"1" as const:"other" as const,
        advertising:[...advertising],analytics:[...analytics],collection:e.collectionEndpointObserved===true,attributionUnknown};
    });
    if(rows.some(r=>r.advertising.length>8||r.analytics.length>8) || Buffer.byteLength(JSON.stringify(rows))>64*1024 ||
      new Set(rows.map(r=>r.eventId)).size!==rows.length || gpcImpactIdentityHash(rows)!==window.requestSetSha256)continue;
    return {...capture,requestLedger:{policyVersion:"gpc_compact_requests.v1",rows}};
  }
  return capture;
}
