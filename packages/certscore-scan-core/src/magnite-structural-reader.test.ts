import assert from "node:assert/strict";
import test from "node:test";
import {californiaRejectRequestEvidenceSchema,protocolJsonLimitContextSchema,isQualifyingSaleSharingRequest} from "@certscore/contracts";
import {readBoundedProtocolJson,ProtocolLimitError,readCanonicalBodyProcessing} from "@certscore/vendor-resolver";
import {readMagniteProtocolJson} from "../../certscore-vendor-resolver/src/bounded-protocol-json";
import {magniteAuctionBody,magniteAuctionUrl} from "../../certscore-contracts/src/test-fixtures/magnite-auction";
import {captureCaliforniaRejectRequest} from "./california-reject-request";

// Representative supported structures, not recovered publisher payloads.
const crowded=()=>{
 const base=magniteAuctionBody();
 return {...base,imp:Array.from({length:3},(_,i)=>({...structuredClone(base.imp[0]!),id:`impression-${i}`,
  banner:{format:Array.from({length:12},()=>({w:300,h:250}))}}))};
};
const url=magniteAuctionUrl.replace("&s=1","&s=3");
const capture=(body:string|object=crowded(),target=url,method="POST",headers:Record<string,string>={"content-type":"text/plain"})=>captureCaliforniaRejectRequest({
 url:target,method,body:typeof body==="string"?body:JSON.stringify(body),hasBody:true,headers,
 requestId:"fixture-request",startedAtMs:10,httpStatus:200,qualificationContext:{gpcDelivered:true},
})!;
const reason=(fn:()=>unknown,expected:string,version:string)=>{
 assert.throws(fn,(e:unknown)=>e instanceof ProtocolLimitError&&e.limitReason===expected&&
  (expected==="bytes"?e.limitContext===undefined:e.limitContext?.contractVersion===version));
};

test("Magnite structural allowance has exact member/depth/byte boundaries; generic bounds stay unchanged",()=>{
 assert.equal((readMagniteProtocolJson(JSON.stringify(Array(256).fill(0)),0) as number[]).length,256);
 reason(()=>readMagniteProtocolJson(JSON.stringify(Array(257).fill(0)),0),"members","bounded_json_limit_context.v2-magnite");
 reason(()=>readMagniteProtocolJson(JSON.stringify(Array(254).fill(0)),3),"members","bounded_json_limit_context.v2-magnite");
 assert.ok(readMagniteProtocolJson("[".repeat(10)+"0"+"]".repeat(10),0));
 reason(()=>readMagniteProtocolJson("[".repeat(11)+"0"+"]".repeat(11),0),"depth","bounded_json_limit_context.v2-magnite");
 assert.equal((readMagniteProtocolJson('"'+"x".repeat(32766)+'"',0) as string).length,32766);
 reason(()=>readMagniteProtocolJson('"'+"x".repeat(32767)+'"',0),"bytes","");
 reason(()=>readMagniteProtocolJson('"'+"é".repeat(16384)+'"',0),"bytes","");
 reason(()=>readBoundedProtocolJson(JSON.stringify(Array(129).fill(0)),0),"members","bounded_json_limit_context.v1");
 reason(()=>readBoundedProtocolJson("[".repeat(9)+"0"+"]".repeat(9),0),"depth","bounded_json_limit_context.v1");
});

test("Magnite v14 fully validates a supported multi-impression body above the old member cap",()=>{
 const body=JSON.stringify(crowded());
 reason(()=>readBoundedProtocolJson(body,3),"members","bounded_json_limit_context.v1");
 const row=capture(body);
 assert.equal(row.proof?.policyVersion,"bounded_ca_request_proof.v14");
 assert.equal(row.proof?.bodyStatus,"complete");assert.equal(row.proof?.bodyDiagnostic?.contractVersion,"bounded_ca_body_diagnostic.v4-magnite");
 assert.equal(row.proof?.bodyDiagnostic?.structuralPolicy,"magnite_json_structure.v1");
 assert.equal(row.proof?.processingCoverage?.body,"inspected");assert.equal(row.proof?.openRtbContext?.magniteAuction?.bannerImpressions,3);
 assert.ok(isQualifyingSaleSharingRequest(row.qualification));
 assert.doesNotMatch(JSON.stringify(row),/synthetic-private-visitor|publisher\.test|"accountId"|"format"/);
 assert.deepEqual(californiaRejectRequestEvidenceSchema.parse(row),row);
});

test("larger Magnite bodies preserve independent GPP, opt-out and identity-conflict gates",()=>{
 for(const regs of [{gpp:"DBAA",gpp_sid:[7]},{gpp:"invalid",gpp_sid:[7]},{ext:{us_privacy:"1NYN"}},{ext:{gpc:0}}]){
  const row=capture({...crowded(),regs});assert.equal(row.proof?.bodyStatus,"complete");
  assert.equal(row.qualification.activity,"identified_advertising_collection");assert.equal(isQualifyingSaleSharingRequest(row.qualification),false);
 }
 const b=crowded();
 const conflict=capture({...b,user:{eids:[{source:"pubcid.org",uids:[{id:"other-visitor",atype:1}]}],ext:b.user.ext}});
 assert.equal(conflict.proof?.bodyStatus,"unsupported");assert.equal(conflict.qualification.activity,"unresolved");
 assert.equal(conflict.proof?.identifiers.some(i=>i.source==="body"),false);
});

test("no metadata is skipped: late escaped duplicates, malformed JSON and unknown fields fail closed",()=>{
 const body=JSON.stringify(crowded());
 for(const bad of [body.slice(0,-1)+',"\\u0069d":"duplicate"}',body.slice(0,-1),body.slice(0,-1)+',"constructor":0}',
  JSON.stringify({...crowded(),unreviewed:{privacy_override:true}})]){
  const row=capture(bad);assert.equal(row.proof?.bodyStatus,"unsupported");assert.equal(row.qualification.activity,"unresolved");
 }
 const b=crowded(),raw=JSON.stringify({...b,regs:{gpp:"DBAA",gpp_sid:[7]}});
 const duplicate=raw.replace('"gpp":"DBAA"','"gpp":"DBAA","\\u0067pp":"different"');
 assert.equal(capture(duplicate).proof?.bodyStatus,"unsupported");
});

test("depth expansion cannot approve unknown routing shapes and can preserve separately read processing context",()=>{
 const b=magniteAuctionBody(),imp=b.imp[0]!;
 const body={...b,imp:[{...imp,ext:{prebid:{bidder:{dvplus:{...imp.ext.prebid.bidder.dvplus,position:{nested:{leaf:"private-value"}}}}}}}],regs:{ext:{us_privacy:"1NYN"}}};
 const text=JSON.stringify(body);
 reason(()=>readBoundedProtocolJson(text,3),"depth","bounded_json_limit_context.v1");
 assert.ok(readMagniteProtocolJson(text,3));
 const row=capture(text,magniteAuctionUrl);assert.equal(row.proof?.bodyStatus,"unsupported");
 assert.equal(row.qualification.activity,"unresolved");assert.ok(row.qualification.processingSignals.includes("us_privacy_sale_opt_out"));
 assert.equal(row.proof?.processingCoverage?.body,"not_assessed");assert.doesNotMatch(JSON.stringify(row),/private-value|"nested"/);
 assert.equal(readCanonicalBodyProcessing(new URL(magniteAuctionUrl),text),null,"old partial reader retains old bounds");
 assert.ok(readCanonicalBodyProcessing(new URL(magniteAuctionUrl),text,"magnite_json_structure.v1")?.has("us_privacy"));
});

test("new limited outcomes retain expanded counters and cannot relabel old diagnostic/proof versions",()=>{
 const row=capture(JSON.stringify({imp:Array(257).fill(0)}));
 assert.equal(row.proof?.bodyStatus,"limited");assert.equal(row.proof?.bodyDiagnostic?.limitContext?.contractVersion,"bounded_json_limit_context.v2-magnite");
 const c=row.proof!.bodyDiagnostic!.limitContext!;assert.ok(c.membersInspected>129);assert.deepEqual(protocolJsonLimitContextSchema.parse(c),c);
 assert.equal(protocolJsonLimitContextSchema.safeParse({...c,contractVersion:"bounded_json_limit_context.v1"}).success,false);
 for(const change of [
  (r:typeof row)=>{r.proof!.policyVersion="bounded_ca_request_proof.v13";},
  (r:typeof row)=>{r.proof!.bodyDiagnostic!.contractVersion="bounded_ca_body_diagnostic.v3";},
  (r:typeof row)=>{delete r.proof!.bodyDiagnostic!.structuralPolicy;},
  (r:typeof row)=>{delete r.proof!.processingCoverage;},
  (r:typeof row)=>{r.path="/different";},(r:typeof row)=>{r.method="GET";},
 ]){const bad=structuredClone(row);change(bad);assert.equal(californiaRejectRequestEvidenceSchema.safeParse(bad).success,false);}
 const framed=capture(JSON.stringify({imp:Array(257).fill(0)}),url,"POST",{"content-encoding":"gzip"});
 assert.equal(framed.proof?.bodyStatus,"unsupported");assert.equal(framed.proof?.bodyDiagnostic?.limitContext,undefined);
 const generic=capture(JSON.stringify({imp:Array(129).fill(0)}),"https://htlb.casalemedia.com/openrtb/pbjs","POST",{"content-encoding":"gzip"});
 assert.equal(generic.proof?.bodyStatus,"unsupported");assert.equal(generic.proof?.bodyDiagnostic?.limitContext,undefined);
});

test("larger profile never applies to Index, other collectors or non-POST Magnite captures",()=>{
 const body=crowded(),index=capture(body,"https://htlb.casalemedia.com/openrtb/pbjs");
 assert.equal(index.proof?.bodyStatus,"limited");assert.equal(index.proof?.bodyDiagnostic?.contractVersion,"bounded_ca_body_diagnostic.v3");
 assert.equal(index.proof?.bodyDiagnostic?.limitContext?.contractVersion,"bounded_json_limit_context.v1");
 const get=capture(body,url,"GET");assert.equal(get.proof?.bodyStatus,"unsupported");
 assert.equal(get.proof?.bodyDiagnostic?.structuralPolicy,undefined);assert.notEqual(get.proof?.policyVersion,"bounded_ca_request_proof.v14");
 const other=capture(body,"https://px.ads.linkedin.com/collect?pid=p");
 assert.notEqual(other.proof?.policyVersion,"bounded_ca_request_proof.v14");assert.equal(other.proof?.bodyDiagnostic?.structuralPolicy,undefined);
});

test("historical supported v13 proof remains readable without acquiring the new structural policy",()=>{
 const minimal=JSON.stringify(magniteAuctionBody());assert.ok(readBoundedProtocolJson(minimal,3));
 const old=capture(minimal,magniteAuctionUrl);old.proof!.policyVersion="bounded_ca_request_proof.v13";
 old.proof!.bodyDiagnostic!.contractVersion="bounded_ca_body_diagnostic.v3";delete old.proof!.bodyDiagnostic!.structuralPolicy;
 assert.deepEqual(californiaRejectRequestEvidenceSchema.parse(old),old);assert.ok(isQualifyingSaleSharingRequest(old.qualification));
});
