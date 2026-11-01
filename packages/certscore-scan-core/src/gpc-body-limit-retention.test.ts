import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {gpcObservationSessionSchema} from "@certscore/contracts";
import {gpcProductionRuntimeFixture} from "../../certscore-contracts/src/test-fixtures/gpc-production";
import {captureCaliforniaRejectRequest} from "./california-reject-request";
import {createGpcRequestProofCapture,qualifyGpcRequest} from "./gpc-request-proof";

const url="https://px.ads.linkedin.com/wa/?pid=123&fmt=a";
const event=(requestUrl=url)=>({eventId:"event",requestId:"request",timestampMs:100,method:"POST",requestUrl});
function session(e:ReturnType<typeof event>,capture:ReturnType<ReturnType<typeof createGpcRequestProofCapture>["finish"]>){
  const s=gpcProductionRuntimeFixture().gpcObservationSession!;
  s.captureStartedAtMs=0;s.captureEndedAtMs=1000;s.mainDocument!.documentToken="doc";s.mainDocument!.requestAtMs=10;s.mainDocument!.committedAtMs=50;
  s.requests=[{eventId:e.eventId,timestampMs:e.timestampMs,urlSha256:createHash("sha256").update(e.requestUrl).digest("hex"),secGpc:"1"}];
  s.requestsObserved=1;s.requestsDropped=0;s.requestProofCapture=capture;return s;
}

for(const body of ["x".repeat(32769),"é".repeat(16385)]){
  test(`GPC preserves a known ${Buffer.byteLength(body)}-byte body limit after discarding the payload`,()=>{
    const e=event(),headers={"content-type":"text/plain","content-length":String(Buffer.byteLength(body))};
    const cap=createGpcRequestProofCapture(()=>150);let reads=0;
    cap.reserve(e,"doc",{postData:()=>{reads++;return body;},method:()=>"POST"})!(headers);
    const result=cap.finish("doc"),proof=result.rows[0]!.proof;
    const direct=captureCaliforniaRejectRequest({url:e.requestUrl,method:e.method,requestId:e.requestId,startedAtMs:e.timestampMs,hasBody:true,body,headers,headerPolicy:"supplemental",qualificationContext:{gpcDelivered:true,requestAtMs:100}})!;
    assert.equal(proof.proof!.bodyStatus,"limited");
    assert.deepEqual(proof.proof,direct.proof,"Evicting raw bytes must not erase the known input limit");
    assert.equal(proof.payload,"uninspected_body");assert.equal(proof.proof!.bodySha256,null);
    assert.equal(proof.proof!.identifiers.some(x=>x.source==="body"),false);
    assert.equal(result.diagnostics!.bodyOutcomes.limited,1);assert.equal(result.diagnostics!.bodyOutcomes.unavailable,0);
    assert.equal(gpcObservationSessionSchema.safeParse(session(e,result)).success,true);
    assert.equal(reads,1);assert.doesNotMatch(JSON.stringify(result),/observedBodyByteLength/);
    assert.ok(!JSON.stringify(result).includes(body));
  });
}

test("byte-limit diagnostics do not create or remove independent URL qualification",()=>{
  for(const requestUrl of [url,"https://px.ads.linkedin.com/collect/?pid=123&li_fat_id=fixture-visitor","https://www.google.com/pagead/conversion/123/?gclid=fixture-visitor&rdp=1"]){
    const e=event(requestUrl),make=(oversized:boolean)=>{
      const cap=createGpcRequestProofCapture(()=>150);
      cap.reserve(e,"doc",{postData:()=>{if(!oversized)throw Error("private read failure");return "x".repeat(32769);},method:()=>"POST"})!({});
      return session(e,cap.finish("doc"));
    };
    const before=make(false),after=make(true);
    assert.deepEqual(qualifyGpcRequest(e,after,{gpcDelivered:true}),qualifyGpcRequest(e,before,{gpcDelivered:true}));
  }
});

test("pending oversized reads cannot publish late data or invent a completed outcome",()=>{
  const cap=createGpcRequestProofCapture(()=>150),e=event();
  const late=cap.reserve(e,"doc",{postData:()=>"x".repeat(32769),method:()=>"POST"})!;
  const result=cap.finish("doc"),before=JSON.stringify(result);late({});
  assert.equal(JSON.stringify(result),before);assert.equal(result.pending,1);
  assert.equal(result.rows.length,0);assert.equal(result.diagnostics!.bodyOutcomes.limited,0);
});

test("discarded size metadata preserves existing framing, encoding and privacy-header outcomes",()=>{
  const body="x".repeat(32769),e=event();
  const cases:Record<string,string>[]=[{},{"content-length":"32769"},{"transfer-encoding":"chunked"},{"content-length":"32770"},
    {"content-length":"invalid"},{"content-encoding":"gzip"},{"unreviewed-consent":"private"}];
  for(const headers of cases){
    const common={url:e.requestUrl,method:e.method,requestId:e.requestId,startedAtMs:e.timestampMs,hasBody:true,headers,headerPolicy:"supplemental" as const,qualificationContext:{gpcDelivered:true,requestAtMs:100}};
    const direct=captureCaliforniaRejectRequest({...common,body})!;
    const discarded=captureCaliforniaRejectRequest({...common,body:undefined,observedBodyByteLength:Buffer.byteLength(body)})!;
    assert.deepEqual(discarded,direct,"Retaining only the size must not override an independent header restriction or framing failure");
  }
});

test("size metadata cannot create a body, complete proof, or override actual bytes",()=>{
  const e=event(),common={url:e.requestUrl,method:e.method,requestId:e.requestId,startedAtMs:e.timestampMs,hasBody:true,headers:{}};
  for(const size of [-1,0,32768,32768.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
    const proof=captureCaliforniaRejectRequest({...common,body:undefined,observedBodyByteLength:size})!.proof!;
    assert.equal(proof.bodyStatus,"unavailable");assert.equal(proof.bodySha256,null);
  }
  assert.equal(captureCaliforniaRejectRequest({...common,hasBody:false,body:undefined,observedBodyByteLength:40000})!.proof!.bodyStatus,"absent");
  const body=JSON.stringify({signalType:"PAGE_VISIT",hem:"a".repeat(64)});
  assert.deepEqual(captureCaliforniaRejectRequest({...common,body,observedBodyByteLength:40000}),captureCaliforniaRejectRequest({...common,body}));
});

test("the exact byte boundary and obsolete-document accounting remain distinct",()=>{
  const cap=createGpcRequestProofCapture(()=>150),e=event();
  cap.reserve(e,"old",{postData:()=>"x".repeat(32769),method:()=>"POST"})!({});
  const result=cap.finish("doc");
  assert.equal(result.rows.length,0);assert.equal(result.retentionDropped,1);
  assert.equal(result.diagnostics!.obsoleteDocumentDropped,1);assert.equal(result.diagnostics!.capEvicted,0);
  assert.equal(result.diagnostics!.bodyOutcomes.limited,1);
  const exact=createGpcRequestProofCapture(()=>150);
  exact.reserve(e,"doc",{postData:()=>"é".repeat(16384),method:()=>"POST"})!({});
  const proof=exact.finish("doc").rows[0]!.proof.proof!;
  assert.notEqual(proof.bodyStatus,"limited");assert.ok(!proof.reasons.includes("body_limit"));
});
