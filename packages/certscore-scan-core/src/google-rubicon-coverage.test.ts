import assert from "node:assert/strict";
import test from "node:test";
import {californiaRejectRequestEvidenceSchema, isQualifyingSaleSharingRequest} from "@certscore/contracts";
import {captureCaliforniaRejectRequest} from "./california-reject-request";
import {createGpcRequestProofCapture} from "./gpc-request-proof";
const ga = "https://analytics.google.com/g/collect?v=2&tid=G-FIXTURE01&cid=1234567890.1234567890";
const rubicon = "https://fastlane.rubiconproject.com/a/api/prebid-exchange.json";
const auction = () => ({id:"auction",at:1,site:{page:"https://publisher.test/"},imp:[{id:"bid",banner:{w:300,h:250}}],
  user:{ext:{eids:[{source:"pubcid.org",uids:[{id:"private-visitor-fixture",atype:1}]}]}},regs:{ext:{us_privacy:"1NNN"}}});
const capture = (url: string, body: string, method="POST", mime="text/plain") => captureCaliforniaRejectRequest({url,body,method,hasBody:true,
  requestId:"request",startedAtMs:10,httpStatus:200,headers:{"content-type":mime},qualificationContext:{gpcDelivered:true}})!;

test("Google custom scalar metadata parses without becoming an advertising finding",()=>{
  const row=capture(ga,"en=page_view&_ee=1&_et=12&ep.author=private&ep.surface=home&epn.aioseo_truseo_score=90");
  assert.equal(row.proof?.bodyStatus,"complete");assert.equal(row.proof?.policyVersion,"bounded_ca_request_proof.v8");
  assert.equal(row.propertyBinding?.policyVersion,"google_analytics_property.v2-browser");
  assert.equal(row.qualification.activity,"unresolved");assert.equal(isQualifyingSaleSharingRequest(row.qualification),false);
  assert.doesNotMatch(JSON.stringify(row),/private|page_view|home/);
  assert.deepEqual(californiaRejectRequestEvidenceSchema.parse(row),row);
});
test("Google batched events preserve boundaries instead of unioning identities or restrictions",()=>{
  assert.equal(capture(ga,"en=page_view&ep.surface=home\r\nen=user_engagement&_et=123").proof?.bodyStatus,"complete");
  for(const body of ["en=A&cid=1234567890.1234567890\nen=B", "en=A&rdp=1\nen=B&rdp=0", "en=A&rdp=1\nen=B", "en=A&en=B", "en=A&%65n=B", "en=A&tid=G-FIXTURE01", "en=A\n", "en=A&bad=%XX", "en=A&", "en=A&unreviewed=1"])
    assert.notEqual(capture(ga,body).proof?.bodyStatus,"complete",body);
  const rdp=capture(ga,"en=A&rdp=1\nen=B&rdp=1");
  assert.equal(rdp.proof?.bodyStatus,"complete");assert.ok(rdp.qualification.processingSignals.includes("google_rdp"));
  const partial=capture(ga,"en=A&unreviewed=1&rdp=1");
  assert.equal(partial.proof?.bodyStatus,"unsupported");assert.ok(partial.qualification.processingSignals.includes("google_rdp"));
  const noSharedId=ga.replace("&cid=1234567890.1234567890","");
  assert.notEqual(capture(noSharedId,"en=A&cid=1234567890.1234567890\nen=B").proof?.bodyStatus,"complete");
  assert.equal(capture(noSharedId,"en=A&cid=1234567890.1234567890\nen=B&cid=1234567890.1234567890").proof?.bodyStatus,"complete");
  const conflict=capture(ga+"&rdp=0","en=A&rdp=1");
  assert.equal(conflict.proof?.bodyStatus,"unsupported");assert.ok(conflict.qualification.processingSignals.includes("privacy_signal_invalid"));
  const duplicate=capture(ga,"en=A&rdp=1&rdp=0");assert.ok(duplicate.qualification.processingSignals.includes("privacy_signal_invalid"));
  const noEvent=capture(ga,"unreviewed=1&rdp=1");assert.equal(noEvent.proof?.bodyStatus,"unsupported");assert.ok(noEvent.qualification.processingSignals.includes("google_rdp"));
});
test("Google browser parsing is bound to reviewed HTTPS endpoints and POST transport",()=>{
  for(const host of ["www.google-analytics.com","google-analytics.com","analytics.google.com","region1.analytics.google.com","region1.google-analytics.com"])
    assert.equal(capture(ga.replace("analytics.google.com",host),"en=page_view&ep.surface=home").proof?.bodyStatus,"complete");
  for(const target of [ga.replace("/g/collect","/mp/collect"),ga.replace("analytics.google.com","other.analytics.google.com"),ga.replace("v=2","v=1"),ga.replace("G-FIXTURE01","UA-123"),ga+"&v=2"])
    assert.notEqual(capture(target,"en=A&ep.surface=home")?.proof?.bodyStatus,"complete");
  assert.notEqual(capture(ga,"en=A&ep.surface=home","GET").proof?.bodyStatus,"complete");
  assert.notEqual(capture(ga,"en=A&ep.surface=home","POST","application/json").proof?.bodyStatus,"complete");
});
test("Google event and field caps include shared query fields and all records",()=>{
  assert.equal(capture(ga,Array(17).fill("en=A").join("\n")).proof?.bodyStatus,"limited");
  assert.equal(capture(ga,"en=A&"+Array.from({length:126},(_,i)=>`ep.f${i}=1`).join("&")).proof?.bodyStatus,"limited");
  assert.equal(capture(ga,"en=A&ep.large="+"x".repeat(32769)).proof?.bodyStatus,"limited");
});
test("new Google proof and property versions cannot be relabeled onto other collectors",()=>{
  const row=capture(ga,"en=page_view&ep.surface=home");
  for(const change of [{origin:"https://other.analytics.google.com"},{path:"/mp/collect"},{method:"GET"},
    {qualification:{...row.qualification,activity:"identified_advertising_collection"}},
    {propertyBinding:{...row.propertyBinding,policyVersion:"google_analytics_property.v1"}}])
    assert.equal(californiaRejectRequestEvidenceSchema.safeParse({...row,...change}).success,false);
  // Previously supported flat JSON/body-only identity keeps its original path.
  const legacy=capture("https://www.google-analytics.com/g/collect",'{"v":2,"tid":"G-FIXTURE01","cid":"123.456"}',"POST","application/json");
  assert.equal(legacy.proof?.bodyStatus,"complete");assert.equal(legacy.proof?.policyVersion,"bounded_ca_request_proof.v4");
  assert.equal(legacy.propertyBinding?.policyVersion,"google_analytics_property.v1");
});
test("Rubicon auction inspection retains bounded hashed EIDs without inventing purpose",()=>{
  const row=capture(rubicon,JSON.stringify(auction()));
  assert.equal(row.proof?.policyVersion,"bounded_ca_request_proof.v14");assert.equal(row.proof?.bodyStatus,"complete");
  assert.ok(row.proof?.identifiers.some(id=>id.field==="eid_pubcid.org"&&id.source==="body"));
  assert.equal(row.qualification.activity,"unresolved");assert.equal(isQualifyingSaleSharingRequest(row.qualification),false);
  assert.doesNotMatch(JSON.stringify(row),/private-visitor|publisher\.test|auction/);
  for(const change of [{origin:"https://other.rubiconproject.com"},{path:"/other"},{method:"GET"},{qualification:{...row.qualification,activity:"identified_advertising_collection"}}])
    assert.equal(californiaRejectRequestEvidenceSchema.safeParse({...row,...change}).success,false);
});
test("Magnite's reviewed dvplus routing and channel metadata remain metadata",()=>{
  const body={...auction(),ext:{prebid:{channel:{name:"pbjs",version:"10.28.0"}}},imp:[{...auction().imp[0],ext:{prebid:{bidder:{dvplus:{accountId:1,siteId:2,zoneId:3}}}}}]};
  const row=capture(rubicon,JSON.stringify(body));assert.equal(row.proof?.bodyStatus,"complete");assert.equal(row.qualification.activity,"unresolved");
  assert.notEqual(capture(rubicon,JSON.stringify({...body,imp:[{...body.imp[0],ext:{prebid:{bidder:{dvplus:{accountId:1,visitor:{unreviewed:["value"]}}}}}}]})).proof?.bodyStatus,"complete");
  const topPrivacy=capture(rubicon,JSON.stringify({...body,regs:{us_privacy:"1NYN"}}));assert.ok(topPrivacy.qualification.processingSignals.includes("us_privacy_sale_opt_out"));
});
test("Rubicon privacy restrictions survive unknown sibling metadata without identity promotion",()=>{
  for(const body of [{...auction(),regs:{ext:{us_privacy:"1NYN"}}},{...auction(),regs:{ext:{us_privacy:"1NYN"}},unreviewed:{data:true}}]){
    const row=capture(rubicon,JSON.stringify(body));assert.ok(row.qualification.processingSignals.includes("us_privacy_sale_opt_out"));
    assert.equal(isQualifyingSaleSharingRequest(row.qualification),false);
  }
  const bad=capture(rubicon,JSON.stringify({...auction(),regs:{gpp:"bad",gpp_sid:[7]}}));assert.ok(bad.qualification.processingSignals.includes("gpp_unresolved"));
});
test("Rubicon rejects duplicate, ambiguous, unsupported and oversized envelopes",()=>{
  const base=auction();
  for(const body of [JSON.stringify(base).replace('"id":"auction"','"id":"auction","\\u0069d":"other"'),JSON.stringify({...base,privacy_mode:"allow"}),
    JSON.stringify({...base,imp:Array(17).fill(base.imp[0])}),JSON.stringify({...base,user:{eids:base.user.ext.eids,ext:{eids:[{source:"pubcid.org",uids:[{id:"conflicting",atype:1}]}]}}}),
    JSON.stringify({...base,user:{ext:{eids:[...base.user.ext.eids,...base.user.ext.eids]}}}),JSON.stringify({...base,imp:[{id:"video",video:{mimes:["video/mp4"]}}]})])
    assert.notEqual(capture(rubicon,body).proof?.bodyStatus,"complete");
  assert.notEqual(capture(rubicon,JSON.stringify(base),"GET").proof?.bodyStatus,"complete");
});
test("both parsers use the existing shared GPC inspection and proof caps",()=>{
  const proof=createGpcRequestProofCapture(()=>20);let reads=0;
  for(let i=0;i<60;i++){
    const target=i%2?ga:rubicon,body=i%2?"en=page_view&ep.surface=home":JSON.stringify(auction());
    const done=proof.reserve({eventId:`event-${i}`,requestId:`request-${i}`,method:"POST",timestampMs:10,requestUrl:target},"loader",{method:()=>"POST",postData:()=>{reads++;return body;}});
    if(done){proof.response(`event-${i}`,200);done({"content-type":"text/plain"});}
  }
  const result=proof.finish("loader");assert.equal(reads,result.inspected);assert.ok(reads<=48);assert.ok(result.rows.length<=32);
  assert.ok(result.rows.every(row=>row.proof.proof?.bodyStatus==="complete"&&row.proof.qualification.activity==="unresolved"));
});
