import assert from "node:assert/strict";
import test from "node:test";
import {californiaRejectRequestEvidenceSchema} from "@certscore/contracts";
import {captureCaliforniaRejectRequest} from "./california-reject-request";
import {decodeCanonicalCollectionBody} from "@certscore/vendor-resolver";
const url="https://analytics.tiktok.com/api/v2/pixel";
const input={url,method:"POST",requestId:"diagnostic",startedAtMs:1,httpStatus:204,hasBody:true,headers:{"content-type":"application/json"}};
test("a failing diagnostic observer cannot change collector decoding",()=>{
 const body='{"event":"PageView","pixel_code":"publisher","ttp":"private"}';
 const expected=decodeCanonicalCollectionBody(new URL(url),body);
 assert.ok(expected);
 const actual=decodeCanonicalCollectionBody(new URL(url),body,()=>{throw Error("observer failed");});
 assert.equal(actual?.format,expected.format);
 assert.deepEqual([...actual!.fields],[...expected.fields]);
});
for(const [body,stage,kind,status] of [
 ['{"event":"PageView","context":{"user":{"ttp":"private"}},"_inspection":{"private":"value"}}','collector_fields','json_object_like','unsupported'],
 ['{"event":','json_structure','json_object_like','unsupported'],
 ['{"event":"A","event":"B"}','field_uniqueness','json_object_like','unsupported'],
 ['opaque-private','envelope_selection','opaque','unsupported'],
 ['x'.repeat(32769),'input_limit','uninspected','limited'],
 [undefined,'input_unavailable','unavailable','unavailable'],
 ['{"event":"PageView","pixel_code":"publisher","ttp":"private"}','complete','json_object_like','complete'],
 ] as const)test(`body diagnostic: ${stage}`,()=>{
 const row=captureCaliforniaRejectRequest({...input,body})!;assert.equal(row.proof?.bodyStatus,status);assert.equal(row.proof?.bodyDiagnostic?.stage,stage);assert.equal(row.proof?.bodyDiagnostic?.inputKind,kind);assert.ok(californiaRejectRequestEvidenceSchema.safeParse(row).success);
 assert.doesNotMatch(JSON.stringify(row),/private/);
 assert.equal(californiaRejectRequestEvidenceSchema.safeParse({...row,proof:{...row.proof,bodyDiagnostic:{...row.proof!.bodyDiagnostic,rawBody:'private'}}}).success,false);
 if(status==='unsupported')assert.equal(californiaRejectRequestEvidenceSchema.safeParse({...row,proof:{...row.proof,bodyDiagnostic:{...row.proof!.bodyDiagnostic,stage:'complete'}}}).success,false);
});
test("absent bodies and historical proofs keep their original outcome",()=>{
 const row=captureCaliforniaRejectRequest({...input,hasBody:false,body:null})!;assert.equal(row.proof?.bodyDiagnostic?.stage,"not_applicable");assert.equal(row.proof?.bodyStatus,"absent");
 const old=structuredClone(row);delete old.proof!.bodyDiagnostic;delete old.proof!.processingCoverage;assert.ok(californiaRejectRequestEvidenceSchema.safeParse(old).success);
});

test("body framing, encoding and MIME failures remain separate from decoding",()=>{
 const body='{"event":"PageView","pixel_code":"publisher","ttp":"private"}';
 for(const [headers,stage,status] of [[{"content-type":"unknown/type"},"content_type","unsupported"],[{"content-encoding":"gzip"},"content_encoding","unsupported"],[{"content-length":"9999"},"header_body_framing","unavailable"]] as const){
  const row=captureCaliforniaRejectRequest({...input,body,headers})!;assert.equal(row.proof?.bodyDiagnostic?.stage,stage);assert.equal(row.proof?.bodyStatus,status);
 }
});
