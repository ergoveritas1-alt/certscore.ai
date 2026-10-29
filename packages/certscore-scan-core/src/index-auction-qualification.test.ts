import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {californiaRejectRequestEvidenceSchema,isQualifyingSaleSharingRequest,type GpcObservationSession} from "@certscore/contracts";
import {inspectGpcRequestQualification} from "@certscore/vendor-resolver";
import {indexAuctionBody,indexAuctionUrl as url} from "../../certscore-contracts/src/test-fixtures/index-auction";
import {gpcProductionRuntimeFixture} from "../../certscore-contracts/src/test-fixtures/gpc-production";
import {captureCaliforniaRejectRequest} from "./california-reject-request";
import {qualifyGpcRequest} from "./gpc-request-proof";

const capture=(body:unknown=indexAuctionBody(),target=url,headers:Record<string,string>|null={"content-type":"text/plain"})=>captureCaliforniaRejectRequest({
 url:target,method:"POST",body:JSON.stringify(body),hasBody:true,headers:headers??undefined,requestId:"request",startedAtMs:10,httpStatus:200,qualificationContext:{gpcDelivered:true},
})!;
test("v12 Index auction and body EID support an exact role without retaining raw identity",()=>{
 for(const source of ["pubcid.org","sharedid.org","id5-sync.com","liveramp.com"]){
  const body=indexAuctionBody();body.user.eids[0]!.source=source;
  const row=capture(body);
  assert.equal(row.proof?.policyVersion,"bounded_ca_request_proof.v12");
  assert.equal(row.qualification.basis,"index_exchange_bid_user_identifier");
  assert.equal(row.qualification.policyVersion,"ca_sale_sharing_qualification.v4-index-auction");
  assert.ok(isQualifyingSaleSharingRequest(row.qualification));
  assert.deepEqual(row.proof?.openRtbContext?.indexAuction,{contractVersion:"index_banner_auction.v1",publisherRouting:"consistent_site_id",bannerImpressions:1});
  assert.doesNotMatch(JSON.stringify(row),/synthetic-private-visitor|publisher\.test|12345/);
 }
 const formatOnly=capture(indexAuctionBody(),url.split("?")[0]);assert.ok(isQualifyingSaleSharingRequest(formatOnly.qualification));
});
test("routing, geometry, page and EID gaps remain unresolved without increasing parser limits",()=>{
 const base=indexAuctionBody();
 const cases:unknown[]=[
  {...base,site:{}},{...base,site:{page:"data:text/plain,fixture"}},
  {...base,imp:[{id:"banner",banner:{}}]},
  {...base,imp:[{id:"banner",banner:{w:0,h:250}}]},
  {...base,imp:[{id:"banner",banner:{w:300,h:-1}}]},
  {...base,imp:[{id:"banner",banner:{format:[{w:300,h:250,ext:{siteID:"54321"}}]}}]},
  {...base,user:{}},{...base,user:{eids:[{source:"unreviewed.test",uids:[{id:"private"}]}]}},
  {...base,user:{eids:[{source:"pubcid.org",uids:[{id:""}]}]}},
  {...base,user:{...base.user,ext:{eids:[{source:"pubcid.org",uids:[{id:"conflict",atype:1}]}]}}},
  {...base,imp:[...base.imp,...base.imp]},
 ];
 for(const body of cases)assert.equal(capture(body).qualification.activity,"unresolved");
 for(const target of [url+"&s=12345",url.replace("12345","0"),url.replace("12345","other"),url.replace("12345","54321")])assert.equal(capture(base,target).qualification.activity,"unresolved");
 assert.equal(capture(base,url,null).qualification.activity,"unresolved");
 const withoutId={...base,user:{}};
 assert.equal(capture(withoutId,url+"&eid_pubcid.org=query-forgery").qualification.activity,"unresolved");
 assert.equal(inspectGpcRequestQualification(url,{},new URLSearchParams({"eid_pubcid.org":"body-without-witness"})).activity,"unresolved");
});
test("GPP and request-local restrictions remain independent of the auction role",()=>{
 for(const regs of [{gpp:"DBAA",gpp_sid:[7]},{ext:{us_privacy:"1NYN"}},{gpp:"bad",gpp_sid:[7]},{ext:{gpc:0}},{ext:{gpc:"invalid"}}]){
  const row=capture({...indexAuctionBody(),regs});
  assert.equal(row.qualification.activity,"identified_advertising_collection");
  assert.equal(isQualifyingSaleSharingRequest(row.qualification),false);
 }
 const row=capture({...indexAuctionBody(),regs:{gpp:"DBAA",gpp_sid:[7]}});
 assert.deepEqual(row.qualification.gpp?.reasons,["applicable_section_missing"]);
});
test("new role cannot be smuggled into old, unrelated or incomplete proof contracts",()=>{
 const row=capture();
 const changes:((r:typeof row)=>void)[]=[
  r=>{r.proof!.policyVersion="bounded_ca_request_proof.v10";},
  r=>{delete r.proof!.openRtbContext!.indexAuction;},
  r=>{r.proof!.headersStatus="unavailable";},r=>{r.proof!.bodyStatus="unsupported";},
  r=>{r.proof!.identifiers=[];},r=>{r.origin="https://other.casalemedia.com";},
  r=>{r.method="GET";},r=>{r.qualification.policyVersion="ca_sale_sharing_qualification.v3";},
 ];
 for(const change of changes){const next=structuredClone(row);change(next);assert.equal(californiaRejectRequestEvidenceSchema.safeParse(next).success,false);}
 assert.equal(isQualifyingSaleSharingRequest({...row.qualification,policyVersion:"ca_sale_sharing_qualification.v3"}),false);
 const old=structuredClone(row);old.qualification=inspectGpcRequestQualification(url);old.proof!.policyVersion="bounded_ca_request_proof.v10";delete old.proof!.openRtbContext!.indexAuction;
 assert.deepEqual(californiaRejectRequestEvidenceSchema.parse(old),old);
 assert.equal(old.qualification.activity,"unresolved");
});
test("exact GPC joins retain the role plus invalid GPP, while wrong source joins cannot qualify",()=>{
 const row=capture({...indexAuctionBody(),regs:{gpp:"DBAA",gpp_sid:[7]}}),session=gpcProductionRuntimeFixture().gpcObservationSession!;
 const event={eventId:"event",requestId:row.requestId,method:"POST",timestampMs:row.startedAtMs,requestUrl:url};
 session.requestProofCapture={contractVersion:"gpc_request_capture.v1",inspected:1,skipped:0,pending:0,failed:0,retentionDropped:0,restrictions:[],rows:[{eventId:"event",documentToken:session.mainDocument!.documentToken,capturedAtMs:20,proof:{...row,contractVersion:"gpc_request_proof.v1"}}]};
 const result=qualifyGpcRequest(event,session,{gpcDelivered:true});
 assert.equal(result.activity,"identified_advertising_collection");assert.equal(result.gpp?.status,"invalid");assert.equal(isQualifyingSaleSharingRequest(result),false);
 for(const change of [
  (s:GpcObservationSession)=>{s.requestProofCapture!.rows[0]!.documentToken="other";},
  (s:GpcObservationSession)=>{s.requestProofCapture!.rows[0]!.proof.urlSha256=createHash("sha256").update("wrong").digest("hex");},
  (s:GpcObservationSession)=>{s.requestProofCapture!.rows[0]!.proof.proof!.headersStatus="unavailable";},
 ]){const next=structuredClone(session);change(next);assert.equal(qualifyGpcRequest(event,next,{}).activity,"unresolved");}
});
