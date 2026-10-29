import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import type { CDPSession, Request } from "playwright";
import { createGpcRequestDiagnostics } from "./gpc-request-diagnostics.js";
import { gpcDocumentHash } from "./gpc-signal-capture.js";
import {createGpcRequestProofCapture} from "./gpc-request-proof";
import {gpcProductionRuntimeFixture} from "../../certscore-contracts/src/test-fixtures/gpc-production";
import {gpcObservationSessionSchema} from "@certscore/contracts";
import {buildGpcProductionObservation} from "./gpc-production-observation";
import {resolveCanonicalVendor} from "@certscore/vendor-resolver";
import {createHash} from "node:crypto";

const url = "https://example.test/resource?private=value";
const handle = (startTime = 1000) => ({ timing: () => ({ startTime }), method: () => "GET",
  resourceType: () => "script", serviceWorker: () => null, failure: () => null }) as Request;
const request = (id = "request-1", time = 1) => ({ requestId: id, loaderId: "loader", frameId: "main", type: "Script", wallTime: time,
  request: { url, method: "GET", headers: { "Sec-GPC": "1", Cookie: "secret" } } });
const missing = () => [{ eventId: "event-1", timestampMs: 10, urlSha256: gpcDocumentHash(url), secGpc: null }];

test("out-of-order wire headers remain bounded diagnostic evidence without replacing Playwright proof", () => {
  const cdp = new EventEmitter(); const capture = createGpcRequestDiagnostics(cdp as unknown as CDPSession, "main");
  cdp.emit("Network.requestWillBeSentExtraInfo", { requestId: "request-1", headers: { "sec-gpc": "1", Authorization: "secret" }, associatedCookies: ["secret"] });
  cdp.emit("Network.requestWillBeSent", request()); capture.track("event-1", handle(), true);
  const rows = missing(), result = capture.finish(rows), diagnostic = result.missingHeaders[0]!;
  assert.equal(diagnostic.correlation, "unique_url_method_start_time");
  assert.equal(diagnostic.cdp?.extraInfoHeader, "1");
  assert.equal(diagnostic.cdp?.extraInfoStatus, "single_request_single_extra_info");
  assert.equal(rows[0]!.secGpc, null);
  assert(!JSON.stringify(result).includes("secret")); assert(!JSON.stringify(result).includes("private=value"));
  const frozen = JSON.stringify(result); cdp.emit("Network.requestWillBeSentExtraInfo", { requestId: "request-1", headers: { "sec-gpc": "0" } });
  assert.equal(JSON.stringify(result), frozen); capture.close();
});

test("duplicate timing candidates and redirect extra-info never borrow a header from a guessed request", () => {
  const cdp = new EventEmitter(); const capture = createGpcRequestDiagnostics(cdp as unknown as CDPSession, "main");
  cdp.emit("Network.requestWillBeSent", request()); cdp.emit("Network.requestWillBeSent", request("request-2"));
  capture.track("event-1", handle(), true);
  assert.equal(capture.finish(missing()).missingHeaders[0]?.correlation, "ambiguous"); capture.close();
  const other = new EventEmitter(); const redirects = createGpcRequestDiagnostics(other as unknown as CDPSession, "main");
  other.emit("Network.requestWillBeSent", request()); other.emit("Network.requestWillBeSent", request("request-1", 2));
  other.emit("Network.requestWillBeSentExtraInfo", { requestId: "request-1", headers: { "Sec-GPC": "1" } });
  redirects.track("event-1", handle(), true);
  const d = redirects.finish(missing()).missingHeaders[0]!;
  assert.equal(d.cdp?.extraInfoStatus, "ambiguous_redirect_or_extra_info"); assert.equal(d.cdp?.extraInfoHeader, null); redirects.close();
});

test("absent and zero wire headers stay distinct and unavailable timing stays unmatched", () => {
  for (const wire of [null, "0"]) {
    const cdp = new EventEmitter(); const capture = createGpcRequestDiagnostics(cdp as unknown as CDPSession, "main");
    cdp.emit("Network.requestWillBeSent", request());
    cdp.emit("Network.requestWillBeSentExtraInfo", { requestId: "request-1", headers: wire === null ? {} : { "Sec-GPC": wire } });
    capture.track("event-1", handle(), true);
    assert.equal(capture.finish(missing()).missingHeaders[0]?.cdp?.extraInfoHeader, wire); capture.close();
  }
  const cdp = new EventEmitter(); const capture = createGpcRequestDiagnostics(cdp as unknown as CDPSession, "main");
  cdp.emit("Network.requestWillBeSent", request()); capture.track("event-1", handle(-1), true);
  assert.equal(capture.finish(missing()).missingHeaders[0]?.correlation, "timing_unavailable"); capture.close();
});

test("diagnostic memory and retention are bounded and explicitly count overflow", () => {
  const cdp = new EventEmitter(); const capture = createGpcRequestDiagnostics(cdp as unknown as CDPSession, "main");
  for (let i = 0; i < 5010; i++) cdp.emit("Network.requestWillBeSent", request(`request-${i}`));
  const result = capture.finish(Array.from({length: 300}, (_, i) => ({...missing()[0]!, eventId: `event-${i}`})));
  assert.equal(result.observedCdpRequests, 5010); assert.equal(result.droppedCdpEvents, 10);
  assert.equal(result.missingHeaders.length, 256); assert.equal(result.droppedDiagnostics, 44); capture.close();
});

test("selected header-present requests retain existing failure/CORS observations without raw parameters",()=>{
 const cdp=new EventEmitter(),capture=createGpcRequestDiagnostics(cdp as unknown as CDPSession,"main");
 cdp.emit("Network.requestWillBeSent",request());capture.track("event-1",handle(),true);
 cdp.emit("Network.loadingFailed",{requestId:"request-1",errorText:"net::ERR_FAILED",corsErrorStatus:{corsError:"HeaderDisallowedByPreflightResponse",failedParameter:"Sec-GPC"}});
 const rows=[{...missing()[0]!,secGpc:"1"}],result=capture.finish(rows,new Set(["event-1"])),d=result.selectedRequests![0]!;
 assert.equal(result.contractVersion,"certscore.gpc-request-diagnostics.v2");assert.equal(result.missingHeaders.length,0);
 assert.equal(d.correlation,"unique_url_method_start_time");assert.equal(d.cdp?.terminal,"failed");assert.equal(d.cdp?.failureCode,"ERR_FAILED");
 assert.equal(d.cdp?.corsError,"HeaderDisallowedByPreflightResponse");assert.equal(d.cdp?.corsHeader,"sec-gpc");assert.equal(d.cdp?.responseStatus,null);
 assert.doesNotMatch(JSON.stringify(result),/private=value|secret/);assert.equal(rows[0]!.secGpc,"1");
 const frozen=JSON.stringify(result);cdp.emit("Network.responseReceived",{requestId:"request-1",response:{status:200}});assert.equal(JSON.stringify(result),frozen);capture.close();
});
test("selected lifecycle diagnostics share unused 256 slots and preserve all existing missing-header rows",()=>{
 const cdp=new EventEmitter(),capture=createGpcRequestDiagnostics(cdp as unknown as CDPSession,"main");
 const missingRows=Array.from({length:250},(_,i)=>({...missing()[0]!,eventId:`missing-${i}`}));
 const selected=Array.from({length:32},(_,i)=>({...missing()[0]!,eventId:`selected-${i}`,secGpc:"1"}));
 const r=capture.finish([...missingRows,...selected],new Set(selected.map(r=>r.eventId)));
 assert.equal(r.missingHeaders.length,250);assert.equal(r.selectedRequests!.length,6);assert.equal(r.droppedDiagnostics,26);
 assert.equal(r.missingHeaders.length+r.selectedRequests!.length,256);capture.close();
});
test("response, finish and unknown lifecycle states remain distinct; future CORS values stay closed",()=>{
 for(const mode of ["response","finished","unknown","future_cors"] as const){
  const cdp=new EventEmitter(),capture=createGpcRequestDiagnostics(cdp as unknown as CDPSession,"main");
  cdp.emit("Network.requestWillBeSent",request());capture.track("event-1",handle(),true);
  if(mode==="response"||mode==="finished")cdp.emit("Network.responseReceived",{requestId:"request-1",response:{status:204}});
  if(mode==="finished")cdp.emit("Network.loadingFinished",{requestId:"request-1"});
  if(mode==="future_cors")cdp.emit("Network.loadingFailed",{requestId:"request-1",corsErrorStatus:{corsError:"private future message",failedParameter:"private-visitor-value"}});
  const r=capture.finish([{...missing()[0]!,secGpc:"1"}],new Set(["event-1"])),d=r.selectedRequests![0]!.cdp!;
  assert.equal(d.terminal,mode==="response"?"response_received":mode==="finished"?"finished":mode==="future_cors"?"failed":"unknown");
  assert.equal(d.responseStatus,mode==="response"||mode==="finished"?204:null);
  assert.equal(d.corsError,mode==="future_cors"?"other":null);assert.equal(d.corsHeader,undefined);
  assert.doesNotMatch(JSON.stringify(r),/private future|private-visitor-value/);capture.close();
 }
});
test("selected diagnostics bind to proof rows and never turn CDP status into collection response proof",()=>{
 const b=gpcProductionRuntimeFixture(),s=b.gpcObservationSession!,event=b.networkEvents[1]!;
 const target="https://px.ads.linkedin.com/collect?pid=publisher&li_adsId=private-visitor";
 event.url=event.requestUrl=target;event.collectionEndpointObserved=true;event.method="GET";
 s.requests.find(r=>r.eventId===event.eventId)!.urlSha256=gpcDocumentHash(target);
 b.normalizedVendorObservations=[resolveCanonicalVendor({type:"request",url:target,evidenceId:event.eventId,sourceScanner:"fixture",matchSource:"network_request"}).observation!];
 const proof=createGpcRequestProofCapture(()=>501),done=proof.reserve(event,s.mainDocument!.documentToken,{method:()=>"GET",postData:()=>null});assert.ok(done);done({"sec-gpc":"1"});s.requestProofCapture=proof.finish(s.mainDocument!.documentToken);
 const cdp=new EventEmitter(),capture=createGpcRequestDiagnostics(cdp as unknown as CDPSession,"main");
 const req=request();req.request.url=target;cdp.emit("Network.requestWillBeSent",req);capture.track(event.eventId,handle(),true);
 cdp.emit("Network.responseReceived",{requestId:"request-1",response:{status:200}});cdp.emit("Network.loadingFinished",{requestId:"request-1"});
 s.requestDiagnostics=capture.finish(s.requests,new Set(s.requestProofCapture.rows.map(r=>r.eventId)));
 assert.equal(s.requestDiagnostics.selectedRequests![0]!.cdp!.responseStatus,200);assert.equal(s.requestProofCapture.rows[0]!.proof.httpStatus,null);
 const parsed=gpcObservationSessionSchema.parse(s);
 for(const change of [
  (p:typeof parsed)=>{p.requestDiagnostics!.selectedRequests![0]!.urlSha256="a".repeat(64);},
  (p:typeof parsed)=>{p.requestProofCapture!.rows=[];},
  (p:typeof parsed)=>{p.requestDiagnostics!.contractVersion="certscore.gpc-request-diagnostics.v1";},
 ]){const next=structuredClone(parsed);change(next);assert.equal(gpcObservationSessionSchema.safeParse(next).success,false);}
 b.gpcObservationSession=parsed;b.gpcPrototypeSessionBinding!.sessionSha256=createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
 const bytes=Buffer.from(JSON.stringify(b)),pointer={uri:"fixture.json",sha256:createHash("sha256").update(bytes).digest("hex"),sizeBytes:bytes.length};
 const observation=buildGpcProductionObservation({scanId:b.scanId,source:{bytes,pointer}});
 assert.notEqual(observation.status,"unavailable");assert.equal(observation.requests.advertisingCollectionCount,0,"diagnostic status cannot manufacture canonical successful collection");capture.close();
});

test("zero timing on a failed request keeps bounded candidates explicitly unbound", () => {
  const cdp = new EventEmitter(); const capture = createGpcRequestDiagnostics(cdp as unknown as CDPSession, "main");
  cdp.emit("Network.requestWillBeSent", request());
  cdp.emit("Network.loadingFailed", {requestId:"request-1",blockedReason:"csp"});
  const failed = {...handle(0), failure: () => ({errorText:"net::ERR_BLOCKED_BY_CLIENT"})} as Request;
  capture.track("event-1", failed, true);
  const d = capture.finish(missing()).missingHeaders[0]!;
  assert.equal(d.requestStartEpochMs, null); assert.equal(d.correlation, "timing_unavailable");
  assert.equal(d.cdp, null); assert.equal(d.failureCode, "ERR_BLOCKED_BY_CLIENT");
  assert.equal(d.unboundCandidates?.[0]?.failureCode, "unknown");
  assert.equal(d.unboundCandidates?.[0]?.blockedReason, "csp");
  assert.equal(d.unboundCandidates?.[0]?.extraInfoStatus, "unavailable"); capture.close();
});
