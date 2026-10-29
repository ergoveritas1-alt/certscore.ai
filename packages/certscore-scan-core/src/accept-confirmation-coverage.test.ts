import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {consentConfirmationDiagnosticsSchema,projectPostAcceptEvidenceForReport} from "@certscore/contracts";
import {buildCanonicalPostAcceptActionRecipes} from "./post-accept-cmp-recipes.js";
import {runPostAcceptObserver} from "./post-accept-observer.js";

for(const mode of ["granted","opposite","partial","late"] as const)test(`Accept: silent TCF cannot delay a ${mode} OneTrust terminal receipt`,async()=>{
 let clicks=0;
 const groups=mode==="opposite"?"C0001:1,C0002:0":mode==="partial"?"C0001:1":"C0001:1,C0002:1";
 const delay=mode==="late"?1600:600;
 const server=createServer((req,res)=>{
  if(req.url==="/click"){clicks++;res.writeHead(204).end();return;}
  res.setHeader("content-type","text/html");res.end(`<section id="onetrust-banner-sdk"><p>Choose optional cookies</p><button id="onetrust-accept-btn-handler" onclick="fetch('/click');this.parentElement.hidden=true;setTimeout(()=>document.cookie='OptanonConsent=groups=${groups}&receipt=after;path=/',${delay})">Accept all</button></section><script>document.cookie='OptanonConsent=groups=C0001:1,C0002:0&receipt=before;path=/';window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:'C0001',Status:'always active'},{CustomGroupId:'C0002',Status:'inactive'}]})};window.__tcfapi=()=>{};</script>`);
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const address=server.address();assert.ok(address&&typeof address!=="string");
 try{
  const packet=await runPostAcceptObserver({scanId:"accept-confirmation-coverage",url:`http://127.0.0.1:${address.port}/`,recipe:buildCanonicalPostAcceptActionRecipes().find(r=>r.cmpId==="OneTrust")!,interactionAuthorization:{kind:"loopback",authorizationId:"loopback_local_lab"},allowCanonicalAcceptDiscovery:true,fulfillThirdPartyRequestsLocally:true,actionSearchTimeoutMs:3000,confirmationTimeoutMs:100,observationWindowMs:1200});
  assert.equal(clicks,1);assert.equal(packet.acceptanceRegistration.status,"unconfirmed");
  assert.equal(packet.terminalDecisionEvidence?.evidence.decision==="granted",mode==="granted",JSON.stringify(packet.confirmationDiagnostics));
  assert.ok(consentConfirmationDiagnosticsSchema.safeParse(packet.confirmationDiagnostics).success);
  if(mode==="granted"){
   assert.equal(packet.afterActionCapture?.requestedWindowMs,1200);
   assert.ok(packet.terminalDecisionEvidence!.readCompletedAtMs<=packet.afterActionCapture!.actionDispatchedAtMs+1200);
   assert.equal(packet.confirmationDiagnostics?.terminalRead,"verified");
   assert.equal(packet.confirmationDiagnostics?.policyVersion,"consent_confirmation_diagnostics.v2");
   if(packet.confirmationDiagnostics?.policyVersion==="consent_confirmation_diagnostics.v2"){assert.ok(packet.confirmationDiagnostics.terminalReasons.includes("verified_decision"));assert.ok(!packet.confirmationDiagnostics.initialReasons.includes("verified_decision"));}
   const projected=projectPostAcceptEvidenceForReport({packet});assert.equal(projected.registrationStatus,"unconfirmed");assert.equal(projected.acceptanceExercised,false);
  }
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

for(const value of ["accepted","opaque-receipt"] as const)test(`Accept: registered storage ${value} remains independent of silent TCF`,async()=>{
 const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end(`<section><p>Choose optional cookies</p><button id="accept" onclick="this.parentElement.hidden=true;setTimeout(()=>localStorage.setItem('uc_settings','${value}'),600)">Accept all</button></section><script>localStorage.setItem('uc_settings','rejected');window.__tcfapi=()=>{};</script>`);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
 try{
  const packet=await runPostAcceptObserver({scanId:'accept-storage-confirmation',url:`http://127.0.0.1:${address.port}/`,recipe:{artifactVersion:'certscore.post_accept_action_recipe.v1',recipeId:'local-registered-storage',controlSelector:'#accept',confirmation:{kind:'tcf_purposes_granted_or_cmp_storage_keys_changed',purposeIds:[1],storageType:'local_storage',keys:['uc_settings']}},interactionAuthorization:{kind:'loopback',authorizationId:'loopback_local_lab'},fulfillThirdPartyRequestsLocally:true,confirmationTimeoutMs:100,actionSearchTimeoutMs:3000,observationWindowMs:1200});
  assert.equal(packet.acceptanceRegistration.status,'unconfirmed');assert.equal(packet.terminalDecisionEvidence?.evidence.decision==='granted',value==='accepted',JSON.stringify(packet.confirmationDiagnostics));
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
