import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {chromium} from "playwright";
import {createArtifactWriter} from "./artifact-writer";
import {preConsentRuntimeScanner} from "./scanners/pre-consent-runtime-scanner";
import {captureConsentControlGeometry} from "./consent-control-geometry";
import {buildCanonicalPostAcceptActionRecipes} from "./post-accept-cmp-recipes";
import {buildCanonicalPostRefusalActionRecipes} from "./post-refusal-cmp-recipes";

const cases=[
 {name:"CIVIC Cookie Control",banner:'id="ccc-notify"',accept:'id="ccc-notify-accept"',reject:'id="ccc-notify-reject"',script:""},
 {name:"Piwik PRO Consent Manager",banner:'id="PiwikPROConsentForm-container"',accept:'id="PiwikPROConsentForm-agree-to-all"',reject:'id="PiwikPROConsentForm-reject-all"',script:""},
 {name:"Piwik PRO Consent Manager",banner:'id="ppms_cm_popup_overlay"',accept:'id="ppms_cm_agree-to-all"',reject:'id="ppms_cm_reject-all"',script:""},
 {name:"WPConsent",banner:'id="wpconsent-container"',accept:'id="wpconsent-accept-all"',reject:'id="wpconsent-cancel-all"',script:""},
 {name:"Shopify Customer Privacy",banner:'id="shopify-pc__banner"',accept:'id="shopify-pc__banner__btn-accept"',reject:'id="shopify-pc__banner__btn-decline"',script:""},
 {name:"Klaro",banner:'class="klaro"',accept:'class="cm-btn-success"',reject:'class="cm-btn-decline"',script:""},
 {name:"Ensighten Privacy",banner:'id="ensNotifyBanner"',accept:'id="ensAcceptAll"',reject:'id="ensRejectAll"',script:""},
 {name:"CookieHub",banner:'class="ch2-dialog"',accept:'class="ch2-allow-all-btn"',reject:'class="ch2-deny-all-btn"',script:""},
 {name:undefined,banner:'class="cn-buttons"',accept:'id="accept"',reject:'id="reject"',script:""},
 {name:"CookieScript",banner:'id="cookiescript_injected"',accept:'id="cookiescript_accept"',reject:'id="cookiescript_reject"',script:""},
 {name:"Complianz",banner:'class="cmplz-buttons"',accept:'class="cmplz-accept"',reject:'class="cmplz-deny"',script:""},
 {name:"CookieHub",banner:'class="ch2-dialog-actions"',accept:'id="accept"',reject:'id="reject"',script:"document.cookie='cookiehub=opaque;path=/';"},
 {name:undefined,banner:'class="ch2-dialog-actions"',accept:'id="accept"',reject:'id="reject"',script:""},
] as const;
for(const [index,fixture] of cases.entries()) test(`passive retained marker ${fixture.name??fixture.banner} preserves lane proof and action boundaries`,{timeout:20000},async()=>{
 let mutations=0;
 const html=`<main>Public example content</main><section ${fixture.banner}><p>Choose optional cookies for analytics and advertising.</p><button ${fixture.accept}>Accept all</button><button ${fixture.reject}>Reject all</button><button>Cookie settings</button></section><script>${fixture.script}document.addEventListener('click',()=>fetch('/mutation'));document.addEventListener('submit',()=>fetch('/mutation'));</script>`;
 const server=createServer((req,res)=>{if(req.url==='/mutation'){mutations++;res.end();return;}res.setHeader('content-type','text/html');res.end(html);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
 const url=`http://127.0.0.1:${address.port}/`,dir=await mkdtemp(`${tmpdir()}/cmp-library-`),browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();await page.goto(url);
  const geometry=await captureConsentControlGeometry(page,{timeoutMs:1000,documentIdentity:{source:'cdp_loader_id',token:'local-fixture'}});
  assert.equal(geometry.cmp.name,fixture.name,JSON.stringify(geometry.cmp));
  await page.close();
  const result=await preConsentRuntimeScanner({url,normalizedUrl:url,scanStartedAtMs:Date.now(),internalBudgetMs:6000,artifactWriter:await createArtifactWriter(dir),captureScope:'consent_proof',screenshotMode:'never'});
  if(fixture.name){
   const observation=result.cmpRuntimeObservations.find(x=>x.vendor===(fixture.name === "Shopify Customer Privacy" ? "Shopify" : fixture.name));assert.ok(observation,JSON.stringify(result.cmpRuntimeObservations));
   assert.equal(observation.sourceScanner,'pre_consent_runtime');assert.ok(observation.evidenceRefs.length>0);
   assert.ok(observation.signals.some(s=>s.sourceEventId&&s.sourceEventType));
  }else assert.equal(result.cmpRuntimeObservations.length,0);
  assert.equal(mutations,0);
  for(const recipes of [buildCanonicalPostAcceptActionRecipes(),buildCanonicalPostRefusalActionRecipes()])assert.equal(recipes.some(r=>r.cmpId===fixture.name),false);
 }finally{await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
