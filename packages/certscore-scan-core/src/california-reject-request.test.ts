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
