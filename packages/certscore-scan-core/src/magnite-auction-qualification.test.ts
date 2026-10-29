import assert from "node:assert/strict";
import test from "node:test";
import {californiaRejectRequestEvidenceSchema,isQualifyingSaleSharingRequest} from "@certscore/contracts";
import {inspectGpcRequestQualification} from "@certscore/vendor-resolver";
import {magniteAuctionBody,magniteAuctionUrl as url} from "../../certscore-contracts/src/test-fixtures/magnite-auction";
import {captureCaliforniaRejectRequest} from "./california-reject-request";
import {createGpcRequestProofCapture,qualifyGpcRequest} from "./gpc-request-proof";
import {gpcProductionRuntimeFixture} from "../../certscore-contracts/src/test-fixtures/gpc-production";
const capture=(body:unknown=magniteAuctionBody(),target=url,headers:Record<string,string>|null={"content-type":"text/plain"})=>captureCaliforniaRejectRequest({
 url:target,method:"POST",body:JSON.stringify(body),hasBody:true,headers:headers??undefined,requestId:"request",startedAtMs:10,httpStatus:200,qualificationContext:{gpcDelivered:true},
})!;
test("Magnite v14 exact banner routing plus supported body EID qualifies without retaining raw fields",()=>{
 for(const source of ["pubcid.org","sharedid.org","id5-sync.com","liveramp.com"]){
  const body=magniteAuctionBody();body.user.ext.eids[0]!.source=source;
  const row=capture(body);assert.equal(row.proof?.policyVersion,"bounded_ca_request_proof.v14");
  assert.equal(row.qualification.basis,"magnite_exchange_bid_user_identifier");assert.equal(row.qualification.policyVersion,"ca_sale_sharing_qualification.v5-magnite-auction");
  assert.ok(isQualifyingSaleSharingRequest(row.qualification));
  assert.deepEqual(row.proof?.openRtbContext?.magniteAuction,{contractVersion:"magnite_banner_auction.v1",publisherRouting:"same_request_account_site_zone",bannerImpressions:1});
  assert.doesNotMatch(JSON.stringify(row),/synthetic-private-visitor|publisher\.test|"accountId"|"zoneId"/);
 }
 const body=magniteAuctionBody(),second=structuredClone(body.imp[0]!);second.id="second";second.ext.prebid.bidder.dvplus.zoneId=790;body.imp.push(second);
 assert.ok(isQualifyingSaleSharingRequest(capture(body,url.replace("&s=1","&s=2")).qualification));
});
test("Magnite routing must corroborate each complete DV+ tuple and cannot combine aliases or carriers",()=>{
 const base=magniteAuctionBody();
 const cases:unknown[]=[
  {...base,ext:{prebid:{channel:{name:"unreviewed"}}}},
  {...base,site:{}},{...base,site:{page:"data:text/plain,fixture"}},
  {...base,imp:[{id:"a",banner:{}}]},
  {...base,imp:[{...base.imp[0],banner:{format:[{w:0,h:250}]}}]},
  {...base,imp:[{...base.imp[0],ext:{prebid:{bidder:{rubicon:{accountId:123,siteId:456,zoneId:789}}}}}]},
  {...base,imp:[{...base.imp[0],ext:{prebid:{bidder:{dvplus:{accountId:123,siteId:456}}}}}]},
  {...base,imp:[{...base.imp[0],ext:{prebid:{bidder:{dvplus:{accountId:123,siteId:456,zoneId:789,account_id:123}}}}}]},
  {...base,imp:[{...base.imp[0],ext:{prebid:{bidder:{dvplus:{accountId:123,siteId:456,zoneId:789},rubicon:{accountId:123,siteId:456,zoneId:789}}}}}]},
  {...base,imp:[base.imp[0],base.imp[0]]},
 ];
 for(const body of cases)assert.equal(capture(body).qualification.activity,"unresolved");
 for(const target of [url.replace("123-456","124-456"),url.replace("banner","video"),url.replace("&s=1","&s=2"),url+"&as=123-456",url+"&m=banner",url+"&s=1",url.split("?")[0]])assert.equal(capture(base,target).qualification.activity,"unresolved");
 const conflict=magniteAuctionBody(),second=structuredClone(conflict.imp[0]!);second.id="second";second.ext.prebid.bidder.dvplus.accountId=124;conflict.imp.push(second);
 assert.equal(capture(conflict,url.replace("&s=1","&s=2")).qualification.activity,"unresolved");
});
test("Magnite body identity and complete inspection remain prerequisites; query IDs cannot substitute",()=>{
 const base=magniteAuctionBody();
 for(const user of [{},{ext:{eids:[]}},{ext:{eids:[{source:"unreviewed.test",uids:[{id:"private"}]}]}},
  {eids:[{source:"pubcid.org",uids:[{id:"other",atype:1}]}],ext:base.user.ext}])assert.equal(capture({...base,user}).qualification.activity,"unresolved");
 assert.equal(capture({...base,user:{}},url+"&eid_pubcid.org=query-substitute").qualification.activity,"unresolved");
 assert.equal(capture(base,url,null).qualification.activity,"unresolved");
 assert.equal(inspectGpcRequestQualification(url,{},new URLSearchParams({"eid_pubcid.org":"missing-witness"})).activity,"unresolved");
 const duplicate=JSON.stringify(base).replace('"id":"auction-fixture"','"id":"auction-fixture","id":"duplicate"');
 const row=captureCaliforniaRejectRequest({url,method:"POST",body:duplicate,hasBody:true,headers:{"content-type":"text/plain"},requestId:"r",startedAtMs:10});
 assert.equal(row?.proof?.bodyStatus,"unsupported");assert.equal(row?.qualification.activity,"unresolved");
 const tooMany=capture({...base,imp:Array(17).fill({})});assert.equal(tooMany.proof?.bodyDiagnostic?.limitReason,"array_items");
});
test("Magnite role is factual when GPP or processing declarations prevent full eligibility",()=>{
 for(const regs of [{gpp:"DBAA",gpp_sid:[7]},{gpp:"bad",gpp_sid:[7]},{ext:{us_privacy:"1NYN"}},{ext:{gpc:0}},{ext:{gpc:"invalid"}}]){
  const row=capture({...magniteAuctionBody(),regs});assert.equal(row.qualification.activity,"identified_advertising_collection");assert.equal(isQualifyingSaleSharingRequest(row.qualification),false);
 }
 const row=capture({...magniteAuctionBody(),unreviewed:{privacy_override:true},regs:{ext:{us_privacy:"1NYN"}}});
 assert.equal(row.proof?.bodyStatus,"unsupported");assert.ok(row.qualification.processingSignals.includes("us_privacy_sale_opt_out"));
});
test("Magnite witness cannot be attached to historical, incomplete or unrelated proofs",()=>{
 const row=capture();
 const changes:((r:typeof row)=>void)[]=[
  (r:typeof row)=>{r.proof!.policyVersion="bounded_ca_request_proof.v11";},r=>{delete r.proof!.openRtbContext!.magniteAuction;},
  r=>{r.proof!.identifiers=[];},r=>{r.proof!.headersStatus="unavailable";},r=>{r.proof!.bodyStatus="unsupported";},
  r=>{r.path="/a/api/fastlane.json";},r=>{r.method="GET";},r=>{r.qualification.policyVersion="ca_sale_sharing_qualification.v3";},
 ];
 for(const change of changes){const next=structuredClone(row);change(next);assert.equal(californiaRejectRequestEvidenceSchema.safeParse(next).success,false);}
 const old=structuredClone(row);old.proof!.bodyDiagnostic!.contractVersion="bounded_ca_body_diagnostic.v3";delete old.proof!.bodyDiagnostic!.structuralPolicy;old.proof!.policyVersion="bounded_ca_request_proof.v11";delete old.proof!.openRtbContext!.magniteAuction;old.qualification=inspectGpcRequestQualification(url);
 assert.deepEqual(californiaRejectRequestEvidenceSchema.parse(old),old);assert.equal(old.qualification.activity,"unresolved");
 assert.equal(isQualifyingSaleSharingRequest({...row.qualification,policyVersion:"ca_sale_sharing_qualification.v4-index-auction"}),false);
});
test("Magnite GPC keeps the exact role and GPP warning with unchanged one-read and 48/32 caps",()=>{
 const c=createGpcRequestProofCapture(()=>20);let reads=0;
 for(let i=0;i<60;i++){
  const done=c.reserve({eventId:`e${i}`,requestId:`r${i}`,method:"POST",timestampMs:10,requestUrl:url},"fixture-loader",{method:()=>"POST",postData:()=>{reads++;return JSON.stringify({...magniteAuctionBody(),regs:{gpp:"DBAA",gpp_sid:[7]}});}});
  if(done){c.response(`e${i}`,200);done({"content-type":"text/plain"});}
 }
 const captured=c.finish("fixture-loader");assert.ok(captured.inspected<=48);assert.equal(reads,captured.inspected);assert.ok(captured.rows.length<=32);
 const s=gpcProductionRuntimeFixture().gpcObservationSession!;s.requestProofCapture=captured;s.mainDocument!.documentToken="fixture-loader";
 const e={eventId:"e0",requestId:"r0",method:"POST",timestampMs:10,requestUrl:url};
 const q=qualifyGpcRequest(e,s,{gpcDelivered:true});assert.equal(q.basis,"magnite_exchange_bid_user_identifier");assert.equal(q.gpp?.status,"invalid");assert.equal(isQualifyingSaleSharingRequest(q),false);
 const bad=structuredClone(s);bad.requestProofCapture!.rows[0]!.documentToken="other";assert.equal(qualifyGpcRequest(e,bad,{}).activity,"unresolved");
});
