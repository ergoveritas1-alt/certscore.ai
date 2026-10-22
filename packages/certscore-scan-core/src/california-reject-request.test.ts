import assert from "node:assert/strict";
import test from "node:test";
import {captureCaliforniaRejectRequest} from "./california-reject-request";
import {isQualifyingSaleSharingRequest,californiaRejectRequestEvidenceSchema} from "@certscore/contracts";
test("bounded California Reject capture preserves request-local qualification without retaining identifiers",()=>{
 const capture=(url:string)=>captureCaliforniaRejectRequest({url,method:"GET",requestId:"request-1",startedAtMs:200,httpStatus:204,hasBody:false});
 const url="https://px.ads.linkedin.com/collect?pid=publisher&li_adsId=private-visitor-id";
 const result=capture(url)!;assert.ok(result);assert.equal(result.entity.label,"LinkedIn Corporation");
 assert.equal(isQualifyingSaleSharingRequest(result.qualification),true);
 assert.ok(!JSON.stringify(result).includes("private-visitor-id"));assert.equal(result.httpStatus,204);
 assert.equal(californiaRejectRequestEvidenceSchema.safeParse({...result,payload:"inspected_body"}).success,false,"v1 cannot claim body inspection without v2 proof");
 for(const suffix of ["&us_privacy=1NYN","&gpp=DBAA&gpp_sid=8","&gpp=DBABBg~BVWSSSVY.YA&gpp_sid=8"])
  assert.equal(isQualifyingSaleSharingRequest(capture(url+suffix)!.qualification),false);
 assert.equal(capture("https://snap.licdn.com/li.lms-analytics/insight.min.js"),null);
 assert.equal(capture("https://www.google-analytics.com/g/collect?v=2&tid=G-ABC&cid=private"),null);
 assert.equal(capture("http://px.ads.linkedin.com/collect?li_adsId=private"),null);
 assert.equal(capture(url+"x".repeat(16385)),null);
});

import {prioritizeCaliforniaRequests} from "./california-reject-request";
import {measurementInspectionBudget} from "./measurement-capture";
import {gzipSync} from "node:zlib";
const post=(body:string|null,headers:Record<string,string>|undefined={"content-type":"application/x-www-form-urlencoded"})=>
 captureCaliforniaRejectRequest({url:"https://px.ads.linkedin.com/wa/",method:"POST",requestId:"post-1",startedAtMs:200,httpStatus:204,hasBody:body!==null,body,headers})!;
test("LinkedIn wa bodies and advertising-cookie headers retain closed proof without raw identifiers or security-cookie promotion",()=>{
 const form=post("pid=123&li_adsid=private-body-identifier");
 assert.equal(form.contractVersion,"california_reject_request.v2");assert.equal(form.payload,"inspected_body");
 assert.equal(isQualifyingSaleSharingRequest(form.qualification),true);assert.equal(form.proof?.identifiers[0]?.source,"body");
 assert.ok(!JSON.stringify(form).includes("private-body-identifier"));
 const json=post(JSON.stringify({pid:123,li_fat_id:"private-json-identifier"}),{"content-type":"application/json"});
 assert.equal(json.proof?.bodyFormat,"json");assert.equal(isQualifyingSaleSharingRequest(json.qualification),true);
 const cookie=post(null,{cookie:"li_sugr=private-cookie-identifier; lidc=route"});
 assert.equal(isQualifyingSaleSharingRequest(cookie.qualification),true);
 assert.equal(cookie.proof?.identifiers[0]?.field,"li_sugr");assert.equal(cookie.proof?.identifiers[0]?.source,"cookie_header");
 assert.ok(!JSON.stringify(cookie).includes("private-cookie-identifier"));
 assert.equal(isQualifyingSaleSharingRequest(post(null,{cookie:"li_sugr=private-advertising-id; BizographicsOptOut=true"}).qualification),false);
 assert.equal(isQualifyingSaleSharingRequest(post(null,{cookie:"bcookie=private-security-identifier; lidc=route; __cf_bm=bot"}).qualification),false);
 assert.equal(isQualifyingSaleSharingRequest(post("li_adsid=private&us_privacy=1NYN").qualification),false);
 assert.equal(isQualifyingSaleSharingRequest(post(JSON.stringify({li_adsid:"private",gpp:"DBABBg~BVWSSSVY.YA",gpp_sid:"8"}),{"content-type":"application/json"}).qualification),false);
});
test("missing, oversized, ambiguous and unsupported body/header proof stays explicitly incomplete",()=>{
 for(const body of ['{"li_adsid":"first","li_adsid":"second"}','{"event":{"li_adsid":"private"}}',"li_adsid=%ZZ", "x".repeat(32769),"li_adsid=private&unreviewed_privacy_state=yes"]){
  const result=post(body);assert.equal(result.payload,"uninspected_body",body.slice(0,50));
 }
 const missing=captureCaliforniaRejectRequest({url:"https://px.ads.linkedin.com/wa/?li_adsid=private",method:"POST",requestId:"post-2",startedAtMs:200,httpStatus:204,hasBody:true,body:undefined,headers:{}})!;
 assert.equal(missing.proof?.bodyStatus,"unavailable");
 const noHeaders=captureCaliforniaRejectRequest({url:"https://px.ads.linkedin.com/wa/?li_adsid=private",method:"GET",requestId:"get-2",startedAtMs:200,httpStatus:204,hasBody:false,body:null})!;
 assert.equal(noHeaders.proof?.headersStatus,"unavailable");assert.equal(isQualifyingSaleSharingRequest(noHeaders.qualification),false);
 for(const h of [{cookie:"li_sugr=a123; li_sugr=b456"},{"x-consent":"denied"},{cookie:"bad-cookie"}])assert.equal(post(null,h).proof?.headersStatus,"limited");
 const binary=post("li_adsid=private",{"content-type":"application/octet-stream"});assert.equal(binary.payload,"uninspected_body");
 for(const [body,mime]of [["li_adsid=private","application/json"],['{"li_adsid":"private"}',"application/x-www-form-urlencoded"]])
  assert.equal(post(body!,{"content-type":mime!}).payload,"uninspected_body","MIME and observed body format must agree");
 const duplicate=captureCaliforniaRejectRequest({url:"https://px.ads.linkedin.com/wa/?li_adsid=one",method:"POST",requestId:"dup",startedAtMs:200,httpStatus:204,hasBody:true,body:"li_adsid=two",headers:{"content-type":"application/x-www-form-urlencoded"}})!;
 assert.equal(duplicate.payload,"uninspected_body");
});
test("distinct recipients and unrestricted proof survive duplicate traffic inside the same 32-row cap",()=>{
 const create=(url:string,id:string,startedAtMs:number)=>({startedAtMs,californiaCollection:captureCaliforniaRejectRequest({url,method:"GET",requestId:id,startedAtMs,httpStatus:204,hasBody:false})!});
 const google="https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC&cid=private";
 const linkedin=create("https://px.ads.linkedin.com/collect?li_adsid=private","linkedin",1);
 const good=create(google,"google-good",2);
 const noise=Array.from({length:100},(_,i)=>create(google+"&rdp=1",`duplicate-${i}`,i+3));
 const selected=prioritizeCaliforniaRequests([linkedin,good,...noise]);
 assert.equal(selected.length,32);assert.equal(new Set(selected.map(row=>row.californiaCollection.entity.entityId)).size,2);
 assert.ok(selected.includes(linkedin));assert.ok(selected.includes(good));
 const budget=measurementInspectionBudget({distinctRecipients:true});for(let i=0;i<16;i++){assert.ok(budget.available(false));budget.retained(false);}
 for(let i=0;i<24;i++){assert.ok(budget.available(true,"google"));budget.retained(true,"google");}
 assert.equal(budget.available(true,"google"),false,"reserve remains for unseen entities");
 assert.equal(budget.available(true),false,"unattributed measurement cannot consume the distinct-recipient reserve");
 for(let i=0;i<8;i++){assert.ok(budget.available(true,`recipient-${i}`));budget.retained(true,`recipient-${i}`);}
 assert.equal(budget.available(true,"one-more"),false);
});

test("omitted transport bodies and zero advertising cookies cannot manufacture complete proof",()=>{
 const omitted=post(null,{"content-length":"42",cookie:"li_sugr=private-ad-id"});
 assert.equal(omitted.payload,"uninspected_body");assert.equal(omitted.proof?.bodyStatus,"unavailable");
 const compressed=post("li_adsid=private",{"content-type":"application/x-www-form-urlencoded","content-encoding":"gzip"});
 assert.equal(compressed.payload,"uninspected_body");
 assert.equal(isQualifyingSaleSharingRequest(post(null,{cookie:"li_sugr=0000-0000"}).qualification),false);
});

const waEvent=(extra:Record<string,unknown>={})=>({pids:[123],scriptVersion:1,time:123456,domain:"fixture.test",url:"https://fixture.test/",websiteSignalRequestId:"page-request-id",pageLoadId:"page-id",isTranslated:false,liFatId:null,liGiant:null,misc:{psbState:-4},isLinkedInApp:false,pageTitle:"Fixture",pageInstanceId:"page-instance",signalType:"CLICK",href:"",domAttributes:{tagName:"BUTTON",innerText:"Reject All Cookies",elementValue:null,elementType:null,imageSrc:null},innerElements:null,elementCrumbsTree:[{tagName:"button",nthChild:0,id:"reject",classes:["choice"],attributes:{"data-action":"reject"}}],isFilteredByClient:false,...extra});
const encodedWa=(json:string,fmt="g",suffix="",headers:Record<string,string>={"content-type":"text/plain;charset=UTF-8"})=>captureCaliforniaRejectRequest({url:`https://px.ads.linkedin.com/wa/?medium=fetch&fmt=${fmt}${suffix}`,method:"POST",requestId:"encoded-wa",startedAtMs:200,httpStatus:204,hasBody:true,body:fmt==="g"?gzipSync(json).toString("base64"):fmt==="b"?Buffer.from(json).toString("base64"):json,headers})!;
test("LinkedIn encoded click payloads inspect all fields and preserve exact advertising identity spelling",()=>{
 for(const fmt of ["g","b","a"]){
  const fact=encodedWa(JSON.stringify(waEvent({liFatId:"fixture-advertising-id",pageTitle:'A "quoted" title'})),fmt);
  assert.equal(fact.proof?.policyVersion,"bounded_ca_request_proof.v3");assert.equal(fact.proof?.bodyStatus,"complete");
  assert.equal(fact.proof?.bodyFormat,"linkedin_wa_json");assert.ok(fact.proof?.decodedBodySha256);
  assert.equal(isQualifyingSaleSharingRequest(fact.qualification),true);
  assert.deepEqual(fact.proof?.identifiers.map(({field,source})=>({field,source})),[{field:"liFatId",source:"body"}]);
  assert.ok(!JSON.stringify(fact).includes("fixture-advertising-id"));assert.ok(!JSON.stringify(fact).includes("quoted"));
 }
 const neutral=encodedWa(JSON.stringify(waEvent()));assert.equal(neutral.payload,"inspected_body");assert.equal(isQualifyingSaleSharingRequest(neutral.qualification),false,"page/request/DOM/publisher identifiers are not advertising identity");
 const restricted=encodedWa(JSON.stringify(waEvent({liFatId:"fixture-advertising-id",us_privacy:"1NYN"})));
 assert.equal(restricted.proof?.bodyStatus,"complete");assert.equal(isQualifyingSaleSharingRequest(restricted.qualification),false);
 assert.equal(encodedWa(JSON.stringify(waEvent()),"g","",{"content-type":"application/json"}).payload,"uninspected_body");
});
test("encoded unknown privacy state, duplicate/escaped keys, malformed streams and inflation limits stay neutral",()=>{
 for(const json of [JSON.stringify(waEvent({unreviewedConsent:{optOut:true}})),JSON.stringify(waEvent({misc:{psbState:-4,privacy:"restricted"}})),JSON.stringify(waEvent({misc:{psbState:1}})),JSON.stringify(waEvent({npa:1,liFatId:"fixture-advertising-id"})),JSON.stringify(waEvent({liFatId:123})), '{"signalType":"CLICK","liFatId":"one","li\\u0046atId":"two"}',JSON.stringify(waEvent({pageTitle:"x".repeat(32769)})),JSON.stringify(waEvent({elementCrumbsTree:Array(65).fill({tagName:"button",id:"x"})}))]){
  const fact=encodedWa(json);assert.equal(fact.payload,"uninspected_body");assert.equal(isQualifyingSaleSharingRequest(fact.qualification),false);
 }
 assert.equal(encodedWa(JSON.stringify(waEvent({liFatId:"fixture-advertising-id"})),"g","&liFatId=other-id").payload,"uninspected_body");
 for(const body of ["!notbase64",Buffer.from("not gzip").toString("base64"),gzipSync('{"signalType":"CLICK"').toString("base64")]){
  const fact=captureCaliforniaRejectRequest({url:"https://px.ads.linkedin.com/wa/?fmt=g",method:"POST",requestId:"invalid",startedAtMs:200,hasBody:true,body,headers:{"content-type":"text/plain"}})!;
  assert.equal(fact.payload,"uninspected_body");
 }
 const old=post("li_adsid=private-id");assert.equal(old.proof?.policyVersion,"bounded_ca_request_proof.v4");
 assert.equal(californiaRejectRequestEvidenceSchema.safeParse({...old,proof:{...old.proof,policyVersion:"bounded_ca_request_proof.v1",bodyEncoding:"base64_gzip"}}).success,false,"v1 proof vocabulary remains unchanged");
});

test("reviewed matching hashes retain source proof and explicit LinkedIn field dispositions", () => {
 const hash="a1".repeat(32);
 const fact=encodedWa(JSON.stringify(waEvent({hem:hash})));
 assert.equal(fact.proof?.policyVersion,"bounded_ca_request_proof.v3");
 assert.equal(fact.qualification.basis,"linkedin_hashed_email");
 assert.equal(isQualifyingSaleSharingRequest(fact.qualification),true);
 assert.deepEqual(fact.proof?.identifiers.map(id=>[id.field,id.source]),[["hem","body"]]);
 assert.ok(!JSON.stringify(fact).includes(hash));
 assert.deepEqual(fact.proof?.identifierDispositions,[{field:"liFatId",status:"null"},{field:"hem",status:"valid"},{field:"liGiant",status:"null"}]);
 for(const [hem,status] of [[undefined,"absent"],[null,"null"],["","empty"],["raw@example.test","invalid"],["0".repeat(64),"invalid"],["a".repeat(2049),"invalid"]] as const){
  const value=encodedWa(JSON.stringify(waEvent({hem,liGiant:"excluded-identifier"})));
  assert.equal(isQualifyingSaleSharingRequest(value.qualification),false);
  assert.equal(value.proof?.identifierDispositions?.find(row=>row.field==="hem")?.status,status);
  assert.equal(value.proof?.identifierDispositions?.find(row=>row.field==="liGiant")?.status,"excluded");
 }
 assert.equal(isQualifyingSaleSharingRequest(encodedWa(JSON.stringify(waEvent({hem:hash,us_privacy:"1NYN"}))).qualification),false);
 assert.equal(californiaRejectRequestEvidenceSchema.safeParse({...fact,proof:{...fact.proof,policyVersion:"bounded_ca_request_proof.v2"}}).success,false,"old proof cannot claim newly supported identity");
 assert.equal(post(`hem=${hash}`).payload,"uninspected_body","LinkedIn hem requires reviewed decoded WA body");
 for(const field of ["ud[em]","ud[ph]"]){
  const body=new URLSearchParams({id:"123",ev:"PageView",[field]:hash}).toString();
  const meta=captureCaliforniaRejectRequest({url:"https://www.facebook.com/tr/",method:"POST",requestId:"meta",startedAtMs:200,httpStatus:200,hasBody:true,body,headers:{"content-type":"application/x-www-form-urlencoded"}})!;
  assert.equal(meta.qualification.basis,"meta_advanced_matching_identifier");
  assert.equal(meta.proof?.policyVersion,"bounded_ca_request_proof.v3");
  assert.equal(meta.proof?.identifiers[0]?.field,field);
  assert.ok(!JSON.stringify(meta).includes(hash));
 }
});

test("new identity proof remains bounded and body invalidation stays neutral rather than failing the lane",()=>{
 const json=JSON.stringify(waEvent({hem:"a1".repeat(32)}));
 const wrongLength=encodedWa(json,"g","",{"content-type":"text/plain","content-length":"1"});
 assert.equal(wrongLength.payload,"uninspected_body");
 assert.equal(isQualifyingSaleSharingRequest(wrongLength.qualification),false);
 assert.deepEqual(wrongLength.proof?.identifiers,[]);
 const crowded=encodedWa(json,"g","&cid=visitor&auid=visitor&gacid=visitor&gclid=visitor&fbp=visitor&fbc=visitor&vid=visitor&msclkid=visitor&d_uuid=visitor");
 assert.equal(crowded.proof?.identifiers.length,8);
 assert.equal(crowded.proof?.identifiers[0]?.field,"hem");
 assert.equal(isQualifyingSaleSharingRequest(crowded.qualification),true);
 const foreign=captureCaliforniaRejectRequest({url:`https://px.ads.linkedin.com/collect?ud%5Bem%5D=${"a1".repeat(32)}`,method:"GET",requestId:"foreign",startedAtMs:1,hasBody:false,body:null,headers:{}})!;
 assert.equal(isQualifyingSaleSharingRequest(foreign.qualification),false);
 assert.deepEqual(foreign.proof?.identifiers,[]);
});
