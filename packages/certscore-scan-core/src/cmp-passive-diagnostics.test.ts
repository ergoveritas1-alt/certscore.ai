import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { chromium } from "playwright";
import { cmpPassiveDiagnosticsSchema } from "@certscore/contracts";
import { installCmpPassiveDiagnostics, cmpPassiveReadToken, recordCmpPassiveRead, CMP_PASSIVE_EVENT_INIT_SCRIPT } from "./cmp-passive-diagnostics";
import { readActionStateWrites } from "./consent-action-semantic-state";
function fixture(){const frame={},child={};let url="https://example.org/";const page=Object.assign(new EventEmitter(),{mainFrame:()=>frame,url:()=>url}) as any;const capture=installCmpPassiveDiagnostics(page);
 function request(patch:Record<string,unknown>={}){const r={method:()=>"POST",url:()=>"https://privacyportal.onetrust.com/request/v1/consentreceipts",frame:()=>frame,redirectedFrom:()=>null,resourceType:()=>"xhr",...patch};page.emit("request",r);return r;}
 return {page,capture,frame,child,request,navigate:()=>page.emit("framenavigated",frame)};}
test("passive network diagnostics bind the existing main-frame request and retain no URLs or bodies",()=>{
 const f=fixture();const r=f.request();f.page.emit("response",{request:()=>r,status:()=>204,fromServiceWorker:()=>false});
 const result=f.capture.finish()!;assert.equal(result.network.length,1);assert.equal(result.network[0]?.status,204);assert.equal(result.eventRead,"not_read");assert.ok(cmpPassiveDiagnosticsSchema.safeParse(result).success);assert.doesNotMatch(JSON.stringify(result),/privacyportal|consentreceipts|cookieValue|decision/);
 assert.equal(f.page.listenerCount("response"),0);f.request();assert.equal(f.capture.finish()!.network.length,1);
});
test("foreign, redirected, unreviewed and late-epoch receipts cannot contaminate a new document",()=>{
 const f=fixture();f.request({frame:()=>f.child});f.request({redirectedFrom:()=>({})});f.request({url:()=>"https://unknown.test/request/v1/consentreceipts"});assert.equal(f.capture.finish()!.network.length,0);
 const g=fixture(),r=g.request(),token=cmpPassiveReadToken(g.page);g.navigate();
 g.page.emit("response",{request:()=>r,status:()=>200,fromServiceWorker:()=>false});recordCmpPassiveRead(token,{documentUrl:g.page.url(),events:[],truncated:false});
 const result=g.capture.finish()!;assert.equal(result.network.length,0);assert.equal(result.eventRead,"not_read");
});
test("network retention and event payload rejection are bounded",()=>{
 const f=fixture();for(let i=0;i<10;i++)f.request();const token=cmpPassiveReadToken(f.page);
 recordCmpPassiveRead(token,{documentUrl:f.page.url(),events:Array(9).fill({name:"OTConsentApplied",atEpochMs:Date.now()}),truncated:false});
 const r=f.capture.finish()!;assert.equal(r.network.length,8);assert.ok(r.networkTruncated);assert.equal(r.eventRead,"not_read");
 assert.equal(cmpPassiveDiagnosticsSchema.safeParse({...r,decision:"granted"}).success,false);
});
test("browser events are observed through existing reads and never become consent decisions",async()=>{
 const browser=await chromium.launch({headless:true});try{
  const context=await browser.newContext();await context.route("**/*",r=>r.fulfill({contentType:"text/html",body:"<html>fixture</html>"}));
  const page=await context.newPage(),capture=installCmpPassiveDiagnostics(page);
  await page.addInitScript({content:CMP_PASSIVE_EVENT_INIT_SCRIPT+`;Object.defineProperty(window,"__certscoreReadPostAcceptWrites",{value:()=>[]});`});
  await page.goto("https://example.org/");await page.evaluate(()=>{window.dispatchEvent(new CustomEvent("OneTrustGroupsUpdated",{detail:["sensitive-value"]}));window.dispatchEvent(new Event("OTConsentApplied"));});
  assert.deepEqual(await readActionStateWrites(page),[]);
  const result=capture.finish()!;assert.equal(result.eventRead,"read");assert.deepEqual(result.events.map(e=>e.name),["OneTrustGroupsUpdated","OTConsentApplied"]);assert.doesNotMatch(JSON.stringify(result),/sensitive-value/);
 }finally{await browser.close();}
});

test("clock-invalid diagnostics are omitted without failing action finalization",()=>{const f=fixture();f.request();assert.equal(f.capture.finish(0),undefined);assert.equal(f.page.listenerCount("request"),0);assert.equal(f.capture.finish(),undefined);});
