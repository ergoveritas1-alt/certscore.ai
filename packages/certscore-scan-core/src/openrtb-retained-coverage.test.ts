import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {californiaRejectRequestEvidenceSchema,isQualifyingSaleSharingRequest} from "@certscore/contracts";
import {readBoundedProtocolJson,ProtocolLimitError} from "@certscore/vendor-resolver";
import {captureCaliforniaRejectRequest} from "./california-reject-request";
import {qualifyGpcRequest} from "./gpc-request-proof";
import {gpcProductionRuntimeFixture} from "../../certscore-contracts/src/test-fixtures/gpc-production";
import {createHash} from "node:crypto";

const fixture=(name:string)=>JSON.parse(readFileSync(new URL(`./test-fixtures/openrtb/${name}-redacted.json`,import.meta.url),"utf8")).fixture;
const index=fixture("index-jta"),rubicon=fixture("rubicon-bournemouth");
const capture=(f:typeof index,body:string=f.body)=>captureCaliforniaRejectRequest({url:f.url,method:"POST",body,hasBody:true,requestId:"request",startedAtMs:10,httpStatus:200,headers:{"content-type":f.mime},qualificationContext:{gpcDelivered:true}})!;

for(const [name,f,version]of [["Index",index,"bounded_ca_request_proof.v12"],["Rubicon",rubicon,"bounded_ca_request_proof.v14"]] as const){
  test(`${name}: redacted retained structure decodes without purpose promotion`,()=>{
    const row=capture(f);assert.equal(row.proof?.bodyStatus,"complete");assert.equal(row.proof?.policyVersion,version);
    assert.equal(row.qualification.activity,"unresolved");assert.equal(isQualifyingSaleSharingRequest(row.qualification),false);
    assert.deepEqual(californiaRejectRequestEvidenceSchema.parse(row),row);
    assert.doesNotMatch(JSON.stringify(row),/"fixture"|private-visitor|rawBody/);
  });
  test(`${name}: mirrored identity is same-request equality, not cross-carrier merging`,()=>{
    const base=JSON.parse(f.body),eid={source:"pubcid.org",uids:[{id:"private-visitor",atype:1}]};
    for(const [user,carriers]of [[{eids:[eid]},"user"],[{ext:{eids:[eid]}},"user_ext"],[{eids:[eid],ext:{eids:[{uids:[{atype:1,id:"private-visitor"}],source:"pubcid.org"}]}},"mirrored_equal"]] as const){
      const row=capture(f,JSON.stringify({...base,user}));assert.equal(row.proof?.bodyStatus,"complete");
      assert.equal(row.proof?.openRtbContext?.identityCarriers,carriers);assert.equal(row.proof?.identifiers.filter(x=>x.field==="eid_pubcid.org").length,1);
    }
    for(const user of [
      {eids:[eid],ext:{eids:[{...eid,uids:[{id:"other-visitor",atype:1}]}]}},
      {eids:[eid],ext:{eids:[{...eid,source:"sharedid.org"}]}},
      {eids:[eid],ext:{eids:[]}},
      {eids:[eid,eid]},
      {eids:[{...eid,uids:[...eid.uids,...eid.uids]}]},
      {eids:[eid],ext:{eids:[{...eid,uids:[{id:"private-visitor"}]}]}},
    ]){
      const row=capture(f,JSON.stringify({...base,user}));assert.notEqual(row.proof?.bodyStatus,"complete");assert.equal(row.proof?.identifiers.some(x=>x.source==="body"),false);
    }
  });
  test(`${name}: GPC carrier remains factual context and known GPP/US privacy survives unknown metadata`,()=>{
    const base=JSON.parse(f.body);
    for(const [gpc,expected]of [[true,"enabled"],["1","enabled"],[0,"disabled"],["0","disabled"],["unknown","invalid"],[null,"invalid"]] as const){
      const row=capture(f,JSON.stringify({...base,regs:{ext:{gpc}}}));assert.equal(row.proof?.bodyStatus,"complete");assert.equal(row.proof?.openRtbContext?.gpcSignal,expected);
      assert.equal(row.qualification.activity,"unresolved");assert.equal(isQualifyingSaleSharingRequest(row.qualification),false);
    }
    const row=capture(f,JSON.stringify({...base,unreviewed:{privacy_override:true},regs:{ext:{us_privacy:"1NYN"},gpp:"unsupported",gpp_sid:[7]}}));
    assert.equal(row.proof?.bodyStatus,"unsupported");assert.ok(row.qualification.processingSignals.includes("us_privacy_sale_opt_out"));assert.ok(row.qualification.processingSignals.includes("gpp_unresolved"));
  });
  test(`${name}: malformed and unreviewed payloads remain unsupported and limits remain explicit`,()=>{
    const base=JSON.parse(f.body);
    for(const body of [f.body.replace('"id":','"\\u0069d":"duplicate","id":'),JSON.stringify({...base,privacy_override:"allow"}),JSON.stringify({...base,imp:[{id:"video",video:{mimes:["video/mp4"]}}]})])assert.notEqual(capture(f,body).proof?.bodyStatus,"complete");
    const minimal={id:"auction",site:{page:"https://fixture.test/"},imp:Array(17).fill({}),ext:{source:"prebid"}};
    const limited=capture(f,JSON.stringify(minimal));assert.equal(limited.proof?.bodyStatus,"limited");assert.equal(limited.proof?.bodyDiagnostic?.limitReason,"array_items");
    const bytes=capture(f,'x'.repeat(32769));assert.equal(bytes.proof?.bodyDiagnostic?.limitReason,"bytes");
    const serialized=JSON.stringify({...base,user:{eids:[{source:"pubcid.org",uids:[{id:"secret",atype:1}]}]}});
    assert.doesNotMatch(JSON.stringify(capture(f,serialized)),/secret/);
  });
}
test("bounded JSON preserves exact byte, member and depth limits with closed reasons",()=>{
  const expect=(body:string,q:number,reason:string)=>assert.throws(()=>readBoundedProtocolJson(body,q),(e:unknown)=>e instanceof ProtocolLimitError&&e.message==="body_limit"&&e.limitReason===reason);
  assert.equal(readBoundedProtocolJson('"'+'x'.repeat(32766)+'"',0),'x'.repeat(32766));
  expect('"'+'x'.repeat(32767)+'"',0,"bytes");
  assert.equal((readBoundedProtocolJson(JSON.stringify(Array(128).fill(0)),0) as unknown[]).length,128);
  expect(JSON.stringify(Array(129).fill(0)),0,"members");expect(JSON.stringify(Array(128).fill(0)),1,"members");
  assert.ok(readBoundedProtocolJson('['.repeat(8)+'0'+']'.repeat(8),0));expect('['.repeat(9)+'0'+']'.repeat(9),0,"depth");
});
test("new context and limit reasons cannot be attached to historical or unrelated proofs",()=>{
  const row=capture(index);assert.equal(row.proof?.bodyDiagnostic?.contractVersion,"bounded_ca_body_diagnostic.v3");
  assert.equal(californiaRejectRequestEvidenceSchema.safeParse({...row,proof:{...row.proof,policyVersion:"bounded_ca_request_proof.v7"}}).success,false);
  const old=structuredClone(row);old.proof!.policyVersion="bounded_ca_request_proof.v7";delete old.proof!.openRtbContext;delete old.proof!.bodyDiagnostic;delete old.proof!.processingCoverage;
  assert.ok(californiaRejectRequestEvidenceSchema.safeParse(old).success);
  const limited=capture(index,'x'.repeat(32769));assert.equal(californiaRejectRequestEvidenceSchema.safeParse({...limited,proof:{...limited.proof,bodyDiagnostic:{...limited.proof!.bodyDiagnostic,contractVersion:"bounded_ca_body_diagnostic.v1"}}}).success,false);
  assert.equal(californiaRejectRequestEvidenceSchema.safeParse({...row,proof:{...row.proof,openRtbContext:{...row.proof!.openRtbContext,gpcSignal:"honored"}}}).success,false);
});
test("body-only GPP details survive unresolved-purpose fallback without qualification promotion",()=>{
  const body=JSON.parse(index.body);body.regs={gpp:"DBAA",gpp_sid:[7]};
  const fact=capture(index,JSON.stringify(body)),session=gpcProductionRuntimeFixture().gpcObservationSession!;
  const event={eventId:"event",requestId:fact.requestId,method:"POST",timestampMs:fact.startedAtMs,requestUrl:index.url};
  session.requestProofCapture={contractVersion:"gpc_request_capture.v1",inspected:1,skipped:0,pending:0,failed:0,retentionDropped:0,restrictions:[],rows:[{eventId:event.eventId,documentToken:session.mainDocument!.documentToken,capturedAtMs:20,proof:{...fact,contractVersion:"gpc_request_proof.v1"}}]};
  assert.ok(fact.qualification.gpp);
  assert.equal(fact.qualification.gpp.status,"invalid");assert.deepEqual(fact.qualification.gpp.reasons,["applicable_section_missing"]);
  const result=qualifyGpcRequest(event,session,{gpcDelivered:true,requestAtMs:event.timestampMs});
  assert.equal(result.activity,"unresolved");assert.equal(result.gpp?.status,"invalid");assert.deepEqual(result.gpp?.applicableSections,[7]);assert.ok(result.processingSignals.includes("gpp_unresolved"));assert.equal(isQualifyingSaleSharingRequest(result),false);
  for(const mode of ["document","hash","headers"]){
    const bad=structuredClone(session),row=bad.requestProofCapture!.rows[0]!;
    if(mode==="document")row.documentToken="other";
    if(mode==="hash")row.proof.urlSha256=createHash("sha256").update("other").digest("hex");
    if(mode==="headers")row.proof.proof!.headersStatus="unavailable";
    assert.equal(qualifyGpcRequest(event,bad,{gpcDelivered:true}).gpp?.status,"not_present",mode);
  }
});
