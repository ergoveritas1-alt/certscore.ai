import assert from "node:assert/strict";
import test from "node:test";
import {consentConfirmationDiagnosticsSchema,consentConfirmationReasonSchema,decodeCanonicalConsentDecision} from "@certscore/contracts";
import {confirmationDiagnostics} from "./consent-confirmation-diagnostics";
import {captureOneTrustBaseline,verifyOneTrustCookieDecision} from "./onetrust-consent-state";
import {verifiedCookieDecision,verifiedCanonicalStateWrite} from "./consent-action-semantic-state";
function fixture(){
 let reads=0,cookieReads=0;
 let config:any=[{id:"C0001",status:"always active"},{id:"C0002",status:"inactive"}];
 let cookies:any[]=[{name:"OptanonConsent",value:"groups=C0001:1,C0002:0",domain:"example.test",path:"/"}];
 const scope:any={url:()=>"https://example.test/",evaluate:async()=>{reads++;return config;}};
 const context:any={cookies:async()=>{cookieReads++;return cookies;}};
 return {scope,context,setConfig:(v:any)=>{config=v;},setCookies:(v:any[])=>{cookies=v;},cookie:()=>cookies[0],counts:()=>({reads,cookieReads})};
}
test("phase callbacks stay separate even when independent reads settle later, and inventories are bounded",async()=>{
 const d=confirmationDiagnostics();const delayed=Promise.resolve().then(()=>d.reason("receipt_missing"));
 d.pass(false);d.pass(true);d.terminalReason("verified_decision");await delayed;
 let r=d.retained();assert.equal(r.policyVersion,"consent_confirmation_diagnostics.v3");if(r.policyVersion!=="consent_confirmation_diagnostics.v3")throw Error();
 assert.deepEqual(r.initialReasons,["receipt_missing"]);assert.deepEqual(r.terminalReasons,["verified_decision"]);
 for(const reason of consentConfirmationReasonSchema.options)d.reason(reason);
 r=d.retained();assert.ok(consentConfirmationDiagnosticsSchema.safeParse(r).success);assert.equal(r.reasons.length,12);assert.ok("reasonsTruncated" in r&&r.reasonsTruncated);
});
test("OneTrust diagnoses configuration, receipt and group failures from the existing reads",async()=>{
 for(const [kind,expected] of [["ambiguous","receipt_ambiguous"],["absent","receipt_missing"],["stale","no_fresh_decision"],["missing","configuration_missing"],["malformed","configuration_malformed"],["changed","configuration_changed"],["partial","group_universe_incomplete"],["foreign","receipt_groups_unconfigured"],["bad_receipt","receipt_malformed"],["identity","receipt_identity_changed"],["valid",undefined]] as const){
  const f=fixture(),baseline=await captureOneTrustBaseline(f.context,f.scope);assert.equal(baseline?.status,"verified");
  if(kind==="missing")f.setConfig(undefined);
  if(kind==="malformed")f.setConfig("invalid");
  if(kind==="changed")f.setConfig([{id:"C0001",status:"always active"},{id:"C0003",status:"inactive"}]);
  if(kind==="partial")f.cookie().value="groups=C0001:1";
  if(kind==="foreign")f.cookie().value="groups=C0001:1,OTHER:0";
  if(kind==="bad_receipt")f.cookie().value="groups=C0001:1,C0002:0,C0002:1";
  if(kind==="identity")f.cookie().path="/changed";
  if(kind==="ambiguous")f.setCookies([f.cookie(),{...f.cookie(),path:"/other"}]);
  if(kind==="absent")f.setCookies([]);
  if(kind==="valid")f.cookie().value+="&receipt=after";
  const reasons:string[]=[];const state=await verifyOneTrustCookieDecision(f.context,f.scope,baseline!,r=>reasons.push(r));
  assert.equal(!!state,kind==="valid",kind);assert.ok(reasons.includes("sdk_capture_unavailable"));assert.deepEqual(reasons.filter(r=>r!=="sdk_capture_unavailable"),expected?[expected]:[],kind);
  // Missing/invalid/drifted configuration exits before the existing cookie read.
  assert.equal(f.counts().reads,2);assert.ok(f.counts().cookieReads<=2);
 }
});
test("known malformed syntax, incomplete groups and unsupported formats never become decisions",()=>{
 for(const [key,value,reason] of [["OptanonConsent","groups=C0001:1,C0002:0,C0002:1","receipt_malformed"],["OptanonConsent","groups=C0001:1","group_universe_incomplete"],["CookieConsent","{preferences:false}","group_universe_incomplete"],["CookieConsent","{preferences:false,,}","receipt_malformed"],["cookieyes-consent","analytics:no,advertisement:no,extra:no","receipt_format_unsupported"],["uc_settings","opaque-receipt","receipt_format_unsupported"]]){
  const reasons:string[]=[];assert.equal(decodeCanonicalConsentDecision(key!,value!,true,r=>reasons.push(r)),"unknown");assert.deepEqual(reasons,[reason]);
 }
});
test("semantic reads retain unsupported diagnostics but never retain raw receipts",async()=>{
 const d=confirmationDiagnostics();const context:any={cookies:async()=>[{name:"CookieConsent",value:"{malformed-private-value"}]};
 const scope:any={url:()=>"https://example.test/",evaluate:async()=>[]};
 assert.equal(await verifiedCookieDecision({context,scope,cookieName:"CookieConsent",actionAt:1,onDiagnostic:d.reason}),undefined);
 const malformed = d.retained();assert.equal(malformed.policyVersion,"consent_confirmation_diagnostics.v3");
  if(malformed.policyVersion!=="consent_confirmation_diagnostics.v3")throw Error("Expected v3 diagnostics");
  assert.ok(malformed.reasons.includes("receipt_malformed"));assert.doesNotMatch(JSON.stringify(malformed),/private-value/);
 scope.evaluate=async()=>[{storageType:"local_storage",name:"uc_settings",value:"opaque-private-value",sequence:1,observedAtEpochMs:10}];
 assert.equal(await verifiedCanonicalStateWrite({context,scope,actionAt:1,registeredKeys:["uc_settings"],onDiagnostic:d.reason}),undefined);
 const unsupported = d.retained();assert.equal(unsupported.policyVersion,"consent_confirmation_diagnostics.v3");
  if(unsupported.policyVersion!=="consent_confirmation_diagnostics.v3")throw Error("Expected v3 diagnostics");
  assert.ok(unsupported.reasons.includes("receipt_format_unsupported"));assert.doesNotMatch(JSON.stringify(unsupported),/private-value/);
});
