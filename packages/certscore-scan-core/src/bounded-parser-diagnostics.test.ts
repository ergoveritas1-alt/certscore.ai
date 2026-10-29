import assert from "node:assert/strict";
import test from "node:test";
import {californiaRejectRequestEvidenceSchema,protocolJsonLimitContextSchema,isQualifyingSaleSharingRequest} from "@certscore/contracts";
import {readBoundedProtocolJson,ProtocolLimitError} from "@certscore/vendor-resolver";
import {captureCaliforniaRejectRequest} from "./california-reject-request";
import {magniteAuctionBody,magniteAuctionUrl} from "../../certscore-contracts/src/test-fixtures/magnite-auction";

const limit=(body:unknown,query=0)=>{
 try{readBoundedProtocolJson(JSON.stringify(body),query);assert.fail("Expected structural limit");}
 catch(error){assert.ok(error instanceof ProtocolLimitError);assert.equal(error.message,"body_limit");assert.ok(error.limitContext);return error;}
};
test("member-limit counters identify only closed sections and preserve the same 128-member threshold",()=>{
 assert.equal((readBoundedProtocolJson(JSON.stringify(Array(128).fill(0)),0) as number[]).length,128);
 const e=limit({imp:[{banner:{format:Array(64).fill({w:1})}}]});
 assert.equal(e.limitReason,"members");assert.equal(e.limitContext!.section,"banner");assert.equal(e.limitContext!.membersInspected,129);
 assert.deepEqual(protocolJsonLimitContextSchema.parse(e.limitContext),e.limitContext);
 const q=limit(Array(128).fill(0),4);assert.equal(q.limitContext!.membersInspected,125);
 assert.equal(q.limitContext!.sectionMembers.reduce((sum,r)=>sum+r.members,0),125);
});
test("depth-limit diagnostics distinguish identity and publisher FPD without retaining field names or values",()=>{
 const identity=limit({user:{ext:{eids:[{uids:[{ext:{privateKey:{privateVisitor:"secret"}}}]}]}}});
 assert.equal(identity.limitReason,"depth");assert.equal(identity.limitContext!.depth,9);assert.equal(identity.limitContext!.section,"identity");
 const fpd=limit({imp:[{ext:{prebid:{bidder:{dvplus:{visitor:{segment:{privateVisitor:"secret"}}}}}}}]});
 assert.equal(fpd.limitReason,"depth");assert.equal(fpd.limitContext!.section,"publisher_fpd");
 assert.doesNotMatch(JSON.stringify([identity.limitContext,fpd.limitContext]),/privateKey|privateVisitor|secret|segment/);
 assert.ok(readBoundedProtocolJson("[".repeat(8)+"0"+"]".repeat(8),0));
 assert.throws(()=>readBoundedProtocolJson("[".repeat(9)+"0"+"]".repeat(9),0),(e:unknown)=>e instanceof ProtocolLimitError&&e.limitReason==="depth");
});
test("parser diagnostics cannot accept raw paths, arbitrary sections or invented counter totals",()=>{
 const context=limit(Array(129).fill(0)).limitContext!;
 for(const c of [{...context,section:"private-field"},{...context,path:"user.privateVisitor"},{...context,membersInspected:128},
  {...context,sectionMembers:[...context.sectionMembers,...context.sectionMembers]}])assert.equal(protocolJsonLimitContextSchema.safeParse(c).success,false);
});
test("new body diagnostics preserve stopped processing coverage and historical proof meaning",()=>{
 const body={...magniteAuctionBody(),user:{ext:{eids:[{uids:[{ext:{nested:{privateKey:"secret"}}}]}]}}};
 const row=captureCaliforniaRejectRequest({url:"https://htlb.casalemedia.com/openrtb/pbjs",method:"POST",body:JSON.stringify(body),hasBody:true,headers:{"content-type":"text/plain"},requestId:"request",startedAtMs:10,httpStatus:200})!;
 assert.equal(row.proof?.bodyDiagnostic?.contractVersion,"bounded_ca_body_diagnostic.v3");assert.equal(row.proof?.bodyStatus,"limited");
 assert.equal(row.proof?.bodyDiagnostic?.limitContext?.section,"identity");assert.equal(row.proof?.processingCoverage?.body,"not_assessed");
 assert.equal(row.qualification.activity,"unresolved");assert.equal(isQualifyingSaleSharingRequest(row.qualification),false);
 assert.doesNotMatch(JSON.stringify(row),/privateKey|secret/);
 const old=structuredClone(row);old.proof!.bodyDiagnostic!.contractVersion="bounded_ca_body_diagnostic.v2";delete old.proof!.bodyDiagnostic!.limitContext;delete old.proof!.processingCoverage;
 assert.deepEqual(californiaRejectRequestEvidenceSchema.parse(old),old);
 const mislabeled=structuredClone(row);mislabeled.proof!.bodyDiagnostic!.contractVersion="bounded_ca_body_diagnostic.v2";
 assert.equal(californiaRejectRequestEvidenceSchema.safeParse(mislabeled).success,false);
 const invented=structuredClone(row);invented.proof!.processingCoverage!.body="inspected";assert.equal(californiaRejectRequestEvidenceSchema.safeParse(invented).success,false);
});
test("unread supplemental body remains an explicit unknown without vetoing independently qualified URL evidence",()=>{
 const row=captureCaliforniaRejectRequest({url:"https://stats.g.doubleclick.net/g/collect?v=2&tid=G-FIXTURE&cid=private-visitor",method:"POST",hasBody:true,
  body:"x".repeat(32769),headers:{"content-type":"text/plain"},requestId:"request",startedAtMs:10,httpStatus:204,headerPolicy:"supplemental"})!;
 assert.equal(row.proof?.bodyDiagnostic?.limitReason,"bytes");assert.equal(row.proof?.bodyDiagnostic?.limitContext,undefined);
 assert.equal(row.proof?.processingCoverage?.body,"not_assessed");assert.equal(row.qualification.activity,"identified_advertising_collection");
 assert.ok(isQualifyingSaleSharingRequest(row.qualification),"coverage metadata adds no new qualification gate");
 const noBody=captureCaliforniaRejectRequest({url:"https://px.ads.linkedin.com/collect?pid=p&li_adsId=visitor",method:"GET",hasBody:false,body:null,headers:{},requestId:"request",startedAtMs:10})!;
 assert.equal(noBody.proof?.processingCoverage?.body,"absent");
});
