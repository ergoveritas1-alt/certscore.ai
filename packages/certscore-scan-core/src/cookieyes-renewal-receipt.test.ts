import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {consentReceiptChangeValue,decodeCanonicalConsentDecision,projectPostAcceptEvidenceForReport,projectPostRefusalEvidenceForReport} from "@certscore/contracts";
import {buildCanonicalPostAcceptActionRecipes} from "./post-accept-cmp-recipes";
import {buildCanonicalPostRefusalActionRecipes} from "./post-refusal-cmp-recipes";
import {runPostAcceptObserver} from "./post-accept-observer";
import {runPostRefusalObserver} from "./post-refusal-observer";
const receipt=(state:string,date="1780997203000")=>`consentid:fixture,consent:${state},action:yes,necessary:yes,functional:${state},analytics:${state},performance:${state},advertisement:${state},other:${state},lastRenewedDate:${date}`;
test("CookieYes renewal metadata never participates in category decisions",()=>{
 assert.equal(consentReceiptChangeValue("cookieyes-consent",receipt("yes")),consentReceiptChangeValue("cookieyes-consent",receipt("yes","1780997203001").split(",").reverse().join(",")));
 assert.equal(consentReceiptChangeValue("CookieConsent","unchanged"),"unchanged");
 assert.equal(decodeCanonicalConsentDecision("cookieyes-consent",receipt("yes"),true),"granted");
 assert.equal(decodeCanonicalConsentDecision("cookieyes-consent",encodeURIComponent(receipt("no")),true),"denied");
 assert.equal(decodeCanonicalConsentDecision("cookieyes-consent",receipt("yes").replace("analytics:yes","analytics:no"),true),"mixed");
 for(const value of [receipt("yes", "yes"),receipt("yes", ""),receipt("yes", "1e12"),receipt("yes")+",lastRenewedDate:1780997203000",receipt("yes")+",newCategory:no",receipt("yes").replace("analytics:yes,", ""),"lastRenewedDate:1780997203000"]){
  assert.equal(decodeCanonicalConsentDecision("cookieyes-consent",value,true),"unknown",value);
 }
});
for(const action of ["accept","reject"] as const)for(const mode of ["valid","unchanged","metadata_only","metadata_only_expected","unknown_category","opposite"] as const){
 test(`CookieYes ${action}: ${mode} renewal receipt preserves action and freshness proof`,async()=>{
  const expected=action==="accept"?"yes":"no",other=action==="accept"?"no":"yes";
  const before=receipt(["unchanged","metadata_only_expected"].includes(mode)?expected:other);
  const after=mode==="unchanged"?before:mode==="metadata_only_expected"?receipt(expected,"1780997203001").split(",").reverse().join(","):mode==="metadata_only"?receipt(other,"1780997203001"):mode==="opposite"?receipt(other,"1780997203001"):receipt(expected)+(mode==="unknown_category"?",newCategory:no":"");
  let clicks=0;
  const server=createServer((req,res)=>{
   if(req.url==="/click"){clicks++;res.writeHead(204).end();return;}
   res.setHeader("content-type","text/html");res.end(`<section class="cky-consent-container"><p>Choose optional cookies</p><button class="cky-btn-${action}">${action==="accept"?"Accept all":"Reject all"}</button></section><script>document.cookie=${JSON.stringify('cookieyes-consent='+before+';path=/')};document.querySelector('button').onclick=()=>{fetch('/click');document.querySelector('section').hidden=true;document.cookie=${JSON.stringify('cookieyes-consent='+after+';path=/')};};</script>`);
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();assert.ok(address&&typeof address!=="string");
  try{
   const common={productionProjectable:true,scanId:`cookieyes-${action}-${mode}`,url:`http://127.0.0.1:${address.port}/`,interactionAuthorization:{kind:"loopback" as const,authorizationId:"loopback_local_lab" as const},actionSearchTimeoutMs:3000,confirmationTimeoutMs:150,observationWindowMs:300};
   if(action==="accept"){
    const packet=await runPostAcceptObserver({...common,recipe:buildCanonicalPostAcceptActionRecipes().find(r=>r.cmpId==="CookieYes")!});
    const p=projectPostAcceptEvidenceForReport({packet,packetSha256:"a".repeat(64)});assert.equal(p.execution?.consentConfirmed,mode==="valid",JSON.stringify(packet.confirmationDiagnostics));assert.equal(p.execution?.observationCompleted,true,JSON.stringify({execution:p.execution,capture:packet.afterActionCapture,limitations:packet.limitations,timing:packet.timing}));
   }else{
    const packet=await runPostRefusalObserver({...common,recipe:buildCanonicalPostRefusalActionRecipes().find(r=>r.cmpId==="CookieYes")!});
    const p=projectPostRefusalEvidenceForReport({packet,packetSha256:"a".repeat(64)});assert.equal(p.execution?.consentConfirmed,mode==="valid",JSON.stringify(packet.confirmationDiagnostics));assert.equal(p.execution?.observationCompleted,true,JSON.stringify({execution:p.execution,capture:packet.afterActionCapture,limitations:packet.limitations,timing:packet.timing}));
   }
   assert.equal(clicks,1);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
}
