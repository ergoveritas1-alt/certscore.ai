import assert from "node:assert/strict";
import test from "node:test";
import {chromium,type Request} from "playwright";
import {chromiumLaunchOptions} from "./playwright-runtime";
import {captureCaliforniaRejectRequest} from "./california-reject-request";
import {isQualifyingSaleSharingRequest} from "@certscore/contracts";
import {gzipSync} from "node:zlib";
test("same Chromium POST Request supplies body and full cookie headers without a public-site visit",async()=>{
 const browser=await chromium.launch(chromiumLaunchOptions({headless:true}));
 try{
  const context=await browser.newContext();
  await context.addCookies([{name:"li_sugr",value:"fixture-header-advertising-id",domain:"px.ads.linkedin.com",path:"/",secure:true,sameSite:"None"}]);
  const page=await context.newPage();let post:Request|undefined;let routed=0;
  await page.route("**/*",async route=>{routed++;if(route.request().method()==="POST")post=route.request();
   await route.fulfill(route.request().method()==="POST"?{status:204}:{status:200,contentType:"text/html",body:"<!doctype html><html><body>Local intercepted fixture</body></html>"});});
  await page.goto("https://px.ads.linkedin.com/");
  await page.evaluate(async()=>{await fetch("/wa/",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:"pid=123&li_adsid=fixture-body-advertising-id"});});
  assert.ok(post);const response=await post.response();assert.equal(response?.status(),204);
  const headers=await post.allHeaders();assert.ok(headers.cookie?.includes("li_sugr="));
  const body=post.postData(),proof=captureCaliforniaRejectRequest({url:post.url(),method:post.method(),requestId:"browser-post",startedAtMs:200,httpStatus:response!.status(),hasBody:body!==null,body,headers})!;
  assert.equal(proof.proof?.headersStatus,"complete");assert.equal(proof.proof?.bodyStatus,"complete");
  assert.equal(isQualifyingSaleSharingRequest(proof.qualification),true);
  assert.ok(proof.proof?.identifiers.some(row=>row.source==="body"));assert.ok(proof.proof?.identifiers.some(row=>row.source==="cookie_header"));
  assert.ok(!JSON.stringify(proof).includes("fixture-body-advertising-id"));assert.ok(!JSON.stringify(proof).includes("fixture-header-advertising-id"));
  assert.equal(routed,2);await context.close();
 }finally{await browser.close();}
});

test("same Chromium Request captures LinkedIn gzip/base64 event POST and exact full headers within existing proof limits",async()=>{
 const browser=await chromium.launch(chromiumLaunchOptions({headless:true}));
 try{
  const page=await browser.newPage();let post:Request|undefined;
  await page.route("**/*",async route=>{if(route.request().method()==="POST")post=route.request();await route.fulfill({status:route.request().method()==="POST"?204:200,contentType:"text/html",body:route.request().method()==="POST"?undefined:"<button>Fixture</button>"});});
  await page.goto("https://px.ads.linkedin.com/");
  const body=gzipSync(JSON.stringify({pids:[123],signalType:"CLICK",liFatId:null,hem:"a1".repeat(32),domAttributes:{tagName:"BUTTON",innerText:"Reject All Cookies"},innerElements:null,elementCrumbsTree:[]})).toString("base64");
  await page.evaluate(async body=>{await fetch("/wa/?medium=fetch&fmt=g",{method:"POST",headers:{"content-type":"text/plain;charset=UTF-8"},body});},body);
  assert.ok(post);const response=await post.response();
  const fact=captureCaliforniaRejectRequest({url:post.url(),method:post.method(),requestId:"encoded-browser",startedAtMs:200,httpStatus:response!.status(),hasBody:true,body:post.postData(),headers:await post.allHeaders()})!;
  assert.equal(fact.proof?.bodyStatus,"complete");assert.equal(fact.proof?.headersStatus,"complete");assert.equal(fact.proof?.bodyEncoding,"base64_gzip");
  assert.equal(isQualifyingSaleSharingRequest(fact.qualification),true);assert.equal(fact.qualification.basis,"linkedin_hashed_email");assert.ok(!JSON.stringify(fact).includes("a1".repeat(32)));
 }finally{await browser.close();}
});
