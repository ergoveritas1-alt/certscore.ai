import test from "node:test";
import assert from "node:assert/strict";
import { canonicalEvidenceBundleSchema, networkResponseEventSchema } from "@certscore/contracts";
import { cmpStatePairFixture, fixtureHash, originalFixtureSource } from "./test-fixtures/gpc-cmp-state-pair.cases";
import { hasRetainedCmpApexWwwBinding } from "./gpc-cmp-document-binding";
import { buildGpcCmpStateComparison } from "./gpc-cmp-state-comparison";

function redirectPair(from = "https://example.com/", to = "https://www.example.com/") {
  const pair = cmpStatePairFixture();
  for (const b of [pair.baseline, pair.gpc]) {
    b.url = b.normalizedUrl = from;
    const final = b.networkEvents[0]!;
    final.url = final.requestUrl = to; final.timestampMs = 10;
    const root = structuredClone(final);
    root.eventId = root.requestId = `${final.requestId}_root`;
    root.url = root.requestUrl = from; root.timestampMs = 0;
    final.parentRequestId = root.requestId; final.redirectChainRequestIds = [root.requestId];
    root.networkConnection = {source:"response_request_binding",status:"server_observed",requestId:root.requestId,fromServiceWorker:false};
    final.networkConnection = {...root.networkConnection, requestId:final.requestId,redirectedFromRequestId:root.requestId};
    b.networkEvents = [root, final];
    b.networkResponseEvents = [root,final].map((r,i)=>networkResponseEventSchema.parse({...r,eventType:"network_response",eventId:`response_${r.eventId}`,
      responseUrl:r.requestUrl,timestampMs:i?15:5,status:i?200:301,metadataCapture:"complete",
      ...(i?{}:{locationRedirectHeader:to,responseHeaders:{location:to}})}));
    const hash = fixtureHash(to);
    b.gpcImpactCapture!.document!.urlSha256 = hash;
    b.gpcImpactCapture!.document!.committedAtMs = 20;
    b.gpcSignalObservation!.documentUrlSha256 = hash;
    b.gpcSignalObservation!.frames[0]!.documentUrlSha256 = hash;
    if (b.gpcImpactSemanticObservation) b.gpcImpactSemanticObservation.documentUrlSha256 = hash;
    if (b.gpcObservationSession) {
      const s=b.gpcObservationSession;
      s.mainDocument!.documentUrlSha256 = s.mainDocument!.requestUrlSha256 = hash;
      s.mainDocument!.requestAtMs = 10; s.mainDocument!.committedAtMs = 20;
      s.semanticObservation!.documentUrlSha256 = hash;
      s.requests = b.networkEvents.map(r=>({eventId:r.eventId,timestampMs:r.timestampMs,urlSha256:fixtureHash(r.requestUrl),secGpc:"1"}));
      s.requestsObserved = 2;
      b.gpcPrototypeSessionBinding!.documentUrlSha256 = hash;
      b.gpcPrototypeSessionBinding!.sessionSha256 = fixtureHash(JSON.stringify(s));
    }
  }
  return {baseline:canonicalEvidenceBundleSchema.parse(pair.baseline),gpc:canonicalEvidenceBundleSchema.parse(pair.gpc)};
}
const project = (p:ReturnType<typeof redirectPair>)=>buildGpcCmpStateComparison({scanId:p.gpc.scanId,targetUrl:p.baseline.url,
  baseline:originalFixtureSource(p.baseline),gpc:originalFixtureSource(p.gpc)});

test("one retained apex/www server hop in both directions produces only a scoped pair",()=>{
  for (const [from,to] of [["https://example.com/","https://www.example.com/"],["https://www.example.co.uk/","https://example.co.uk/"]]) {
    const p=redirectPair(from,to);
    assert.equal(hasRetainedCmpApexWwwBinding(p.baseline),true);
    assert.equal(hasRetainedCmpApexWwwBinding(p.gpc),true);
    const result=project(p);assert.ok(result);
    assert.equal(result.contractVersion,"certscore.gpc-cmp-state-comparison.v2");
    assert.equal(result.baseline.sale,"not_opted_out");assert.equal(result.gpc.sale,"opted_out");
    assert.equal(result.scoreEffect,"none");
  }
  const direct=cmpStatePairFixture();
  assert.equal(project(direct)?.contractVersion,"certscore.gpc-cmp-state-comparison.v1");
});

test("homepage shape, PSL and exact counterpart prevent unrelated redirect binding",()=>{
  for (const [from,to] of [
    ["https://example.com/","https://other.com/"], ["https://example.com/","https://cdn.example.com/"],
    ["https://tenant.github.io/","https://www.tenant.github.io/"], ["https://example.test/","https://www.example.test/"],
    ["https://example.com/path","https://www.example.com/path"], ["https://example.com/?x=1","https://www.example.com/?x=1"],
    ["https://example.com/","https://www.example.com/#changed"], ["http://example.com/","http://www.example.com/"],
    ["https://example.com:8443/","https://www.example.com:8443/"], ["https://user@example.com/","https://www.example.com/"],
  ]) {const p=redirectPair(from,to);assert.equal(project(p),undefined,`${from} -> ${to}`);}
});

test("redirect proof rejects incomplete, ambiguous, conflicting and wrong-time retained ancestry on either lane",()=>{
  const defects = ["parent","chain","extra_hop","missing_root","duplicate_request","duplicate_response","missing_response","missing_location","conflicting_location","wrong_location","not_redirect","terminal_error","missing_status","metadata","response_url","response_time","root_after_final","commit","header","connection","service_worker","response_connection","method","dispatch","loader","semantic_hash"] as const;
  for (const lane of ["baseline","gpc"] as const) for (const defect of defects) {
    const p=redirectPair(),b=p[lane],root=b.networkEvents[0]!,final=b.networkEvents[1]!,redirect=b.networkResponseEvents[0]!,terminal=b.networkResponseEvents[1]!;
    if(defect==="parent")final.parentRequestId="foreign";
    if(defect==="chain")final.redirectChainRequestIds=[];
    if(defect==="extra_hop")b.networkEvents.push({...final,eventId:"extra",requestId:"extra",timestampMs:30});
    if(defect==="missing_root")b.networkEvents.shift();
    if(defect==="duplicate_request")b.networkEvents.push({...root,isMainFrame:false});
    if(defect==="duplicate_response")b.networkResponseEvents.push({...redirect,eventId:"duplicate"});
    if(defect==="missing_response")b.networkResponseEvents.shift();
    if(defect==="missing_location"){delete redirect.locationRedirectHeader;delete redirect.responseHeaders!.location;}
    if(defect==="conflicting_location")redirect.responseHeaders!.location="https://other.com/";
    if(defect==="wrong_location")redirect.locationRedirectHeader=redirect.responseHeaders!.location="https://other.com/";
    if(defect==="not_redirect")redirect.status=200;
    if(defect==="terminal_error")terminal.status=500;
    if(defect==="missing_status")delete terminal.status;
    if(defect==="metadata")redirect.metadataCapture="pending";
    if(defect==="response_url")redirect.responseUrl="https://other.com/";
    if(defect==="response_time")redirect.timestampMs=15;
    if(defect==="root_after_final")root.timestampMs=11;
    if(defect==="commit")terminal.timestampMs=21;
    if(defect==="header")root.requestHeaders=lane==="baseline"?{secGpc:"1"}:{};
    if(defect==="connection")final.networkConnection!.redirectedFromRequestId="foreign";
    if(defect==="service_worker")redirect.networkConnection!.fromServiceWorker=true;
    if(defect==="response_connection")terminal.networkConnection!.requestId="foreign";
    if(defect==="method")root.method="POST";
    if(defect==="dispatch")b.url=b.normalizedUrl="https://unrelated.com/";
    if(defect==="loader")b.gpcImpactCapture!.readbackDocumentToken="foreign";
    if(defect==="semantic_hash")(b.gpcImpactSemanticObservation??b.gpcObservationSession!.semanticObservation)!.stateSha256="f".repeat(64);
    assert.equal(project(p),undefined,`${lane}/${defect}`);
  }
});
