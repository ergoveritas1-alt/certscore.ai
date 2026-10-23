import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {gpcObservationSessionSchema,isQualifyingSaleSharingRequest} from "@certscore/contracts";
import {gpcProductionRuntimeFixture} from "../../certscore-contracts/src/test-fixtures/gpc-production";
import {createGpcRequestProofCapture,qualifyGpcRequest} from "./gpc-request-proof";

const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
const url="https://px.ads.linkedin.com/wa/?pid=123&fmt=a";
const headers={"content-type":"text/plain","sec-gpc":"1"};
const body=JSON.stringify({signalType:"PAGE_VISIT",hem:"a".repeat(64)});
const event=(i:number,requestUrl=url)=>({eventId:`event-${i}`,requestId:`request-${i}`,timestampMs:100,method:"POST",requestUrl});
const request=(value:string|null=body)=>({postData:()=>value,method:()=>"POST"});
function sessionFor(events:ReturnType<typeof event>[],capture:ReturnType<ReturnType<typeof createGpcRequestProofCapture>["finish"]>){
 const session=gpcProductionRuntimeFixture().gpcObservationSession!;
 session.captureStartedAtMs=0;session.captureEndedAtMs=1000;
 session.mainDocument!.documentToken="current";session.mainDocument!.requestAtMs=10;session.mainDocument!.committedAtMs=50;
 session.requests=events.map(e=>({eventId:e.eventId,timestampMs:e.timestampMs,urlSha256:sha(e.requestUrl),secGpc:"1"}));
 session.requestsObserved=events.length;session.requestsDropped=0;session.requestProofCapture=capture;
 return session;
}

test("six proofs distinguish obsolete-document filtering from cap eviction, including unsupported outcomes before filtering",()=>{
 const cap=createGpcRequestProofCapture(()=>150),events=Array.from({length:6},(_,i)=>event(i));
 for(const [i,e]of events.entries())cap.reserve(e,i<2?"old":"current",request(i===0?"unsupported":body))!(headers);
 const result=cap.finish("current"),d=result.diagnostics!;
 assert.equal(result.contractVersion,"gpc_request_capture.v2");
 assert.equal(result.retentionDropped,2);assert.equal(result.rows.length,4);
 assert.equal(d.obsoleteDocumentDropped,2);assert.equal(d.capEvicted,0);
 assert.deepEqual(d.bodyOutcomes,{absent:0,complete:5,unavailable:0,limited:0,unsupported:1});
 assert.equal(result.rows.filter(r=>r.proof.proof?.bodyStatus==="unsupported").length,0);
 assert.equal(gpcObservationSessionSchema.safeParse(sessionFor(events,result)).success,true);
 assert.doesNotMatch(JSON.stringify(d),/hem|event-\d|request-\d|linkedin|unsupported_body/);
});

test("cap counts exclude obsolete proofs, preserve diverse recipients and maintain existing 48/32 bounds",()=>{
 const cap=createGpcRequestProofCapture(()=>150),events=Array.from({length:40},(_,i)=>event(i));
 for(const [i,e]of events.entries())cap.reserve(e,i<2?"old":"current",request())!(headers);
 const distinct=event(100,"https://www.google.com/pagead/conversion/123/?gclid=visitor-fixture");events.push(distinct);
 cap.reserve(distinct,"current",request(null))!({});cap.response(distinct.eventId,204);
 const result=cap.finish("current");
 assert.equal(result.inspected,41);assert.equal(result.rows.length,32);
 assert.equal(result.diagnostics?.obsoleteDocumentDropped,2);assert.equal(result.diagnostics?.capEvicted,7);
 assert.equal(result.rows.some(r=>r.eventId===distinct.eventId),true);
 assert.equal(gpcObservationSessionSchema.safeParse(sessionFor(events,result)).success,true);
});

test("failed inspections, pending reads, unavailable bodies and unsupported bodies remain separate",()=>{
 const cap=createGpcRequestProofCapture(()=>150),events=[event(0),event(1),event(2),event(3),event(4),event(5,`${url}#fragment`)];
 cap.reserve(events[0]!,"current",request("unsupported"))!(headers);
 cap.reserve(events[1]!,"current",{postData:()=>{throw Error("private read error");},method:()=>"POST"})!(headers);
 cap.reserve(events[2]!,"current",{postData:()=>null,method:()=>{throw Error("private method error");}})!(headers);
 const late=cap.reserve(events[3]!,"current",request())!;
 cap.reserve(events[4]!,"current",request(null))!(headers);
 cap.reserve(events[5]!,"current",request())!(headers);
 const result=cap.finish("current"),before=JSON.stringify(result);late(headers);cap.response(events[4]!.eventId,200);
 assert.equal(JSON.stringify(result),before);
 assert.equal(result.failed,2);assert.equal(result.pending,1);assert.equal(result.retentionDropped,0);
 assert.deepEqual(result.diagnostics?.failureOutcomes,{noProof:1,captureException:1});
 assert.deepEqual(result.diagnostics?.bodyOutcomes,{absent:1,complete:0,unavailable:1,limited:0,unsupported:1});
 assert.equal(gpcObservationSessionSchema.safeParse(sessionFor(events,result)).success,true);
 assert.doesNotMatch(before,/private read error|private method error/);
});

test("v2 diagnostics reject contradictory counts and document attribution while historical v1 remains unchanged",()=>{
 const e=event(1),cap=createGpcRequestProofCapture(()=>150);cap.reserve(e,"current",request())!(headers);
 const current=sessionFor([e],cap.finish("current"));
 for(const mutate of [
  (s:typeof current)=>{delete s.requestProofCapture!.diagnostics;},
  s=>{s.requestProofCapture!.diagnostics!.capEvicted=1;},
  s=>{s.requestProofCapture!.diagnostics!.bodyOutcomes.complete=0;},
  s=>{s.requestProofCapture!.diagnostics!.failureOutcomes.noProof=1;},
  s=>{s.requestProofCapture!.diagnostics!.bodyOutcomes={absent:1,complete:0,unavailable:0,limited:0,unsupported:0};},
  s=>{s.requestProofCapture!.rows[0]!.documentToken="wrong";},
  s=>{s.requestProofCapture!.contractVersion="gpc_request_capture.v1";},
 ] as Array<(s:typeof current)=>void>){const changed=structuredClone(current);mutate(changed);assert.equal(gpcObservationSessionSchema.safeParse(changed).success,false);}
 const legacy=structuredClone(current);legacy.requestProofCapture!.contractVersion="gpc_request_capture.v1";delete legacy.requestProofCapture!.diagnostics;
 assert.deepEqual(gpcObservationSessionSchema.parse(legacy),legacy);
 const incomplete=structuredClone(current);incomplete.mainDocument=null;incomplete.terminal="incomplete";incomplete.limitationKeys=["terminal_document_unverified"];
 assert.deepEqual(gpcObservationSessionSchema.parse(incomplete),incomplete,"diagnostic filtering must not require or invent verified main-document delivery");
 const unfiltered=createGpcRequestProofCapture(()=>150);unfiltered.reserve(e,"other",request())!(headers);
 const result=unfiltered.finish();assert.equal(result.diagnostics?.documentFilterApplied,false);
 assert.equal(gpcObservationSessionSchema.safeParse(sessionFor([e],result)).success,true);
});

test("diagnostics do not change URL qualification or same-request restrictions after proof eviction",()=>{
 const restricted=event(0,"https://www.google.com/pagead/conversion/123/?gclid=visitor-fixture"),cap=createGpcRequestProofCapture(()=>150);
 cap.reserve(restricted,"current",request("rdp=1"))!({"content-type":"application/x-www-form-urlencoded"});
 const events=[restricted];
 for(let i=1;i<=40;i++){const e=event(i,restricted.requestUrl);events.push(e);cap.reserve(e,"current",request(null))?.(headers);cap.response(e.eventId,204);}
 const session=sessionFor(events,cap.finish("current"));
 assert.equal(session.requestProofCapture!.rows.some(r=>r.eventId===restricted.eventId),false);
 assert.ok(session.requestProofCapture!.diagnostics!.capEvicted>0);
 assert.equal(isQualifyingSaleSharingRequest(qualifyGpcRequest(restricted,session,{gpcDelivered:true})),false);
 const independent={...restricted,eventId:"sibling",requestId:"sibling"};
 assert.equal(isQualifyingSaleSharingRequest(qualifyGpcRequest(independent,session,{gpcDelivered:true})),true);
 const unsupported=event(99,"https://px.ads.linkedin.com/collect/?pid=123&li_fat_id=visitor-fixture"),other=createGpcRequestProofCapture(()=>150);
 other.reserve(unsupported,"current",request("unsupported"))!(headers);
 const unknown=sessionFor([unsupported],other.finish("current"));
 assert.equal(unknown.requestProofCapture!.diagnostics!.bodyOutcomes.unsupported,1);
 assert.equal(isQualifyingSaleSharingRequest(qualifyGpcRequest(unsupported,unknown,{gpcDelivered:true})),true);
});
