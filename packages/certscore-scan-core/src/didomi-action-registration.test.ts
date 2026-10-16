import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {runPostAcceptObserver} from "./post-accept-observer.js";
import {runPostRefusalObserver} from "./post-refusal-observer.js";
import {buildCanonicalPostAcceptActionRecipes} from "./post-accept-cmp-recipes.js";
import {buildCanonicalPostRefusalActionRecipes} from "./post-refusal-cmp-recipes.js";
import {postAcceptEvidencePacketSchema,postRefusalEvidencePacketSchema} from "@certscore/contracts";

for (const action of ["accept","reject"] as const) for (const mode of ["complete","no_event","external","partial","opposite","configuration_drift"]) test(`Didomi ${action} ${mode}: one click with semantic registration kept separate`, {timeout:20000}, async()=>{
  let clicks=0, options=0;
  const server=createServer((req,res)=>{
    if(req.url==='/action'){clicks++;res.end('ok');return;}
    if(req.url==='/options'){options++;res.end('ok');return;}
    res.setHeader('content-type','text/html');res.end(`<!doctype html><html><body>
      <section id="didomi-host"><div class="didomi-notice-banner" role="dialog" aria-label="Cookie choices"><p>We use cookies for analytics and advertising.</p>
      <button id="didomi-notice-agree-button" onclick="choose(true)">I agree</button>
      <button id="didomi-notice-disagree-button" onclick="choose(false)">I disagree</button>
      <button id="didomi-notice-learn-more-button" onclick="fetch('/options')">Configure</button></div></section>
      <script>window.partial=true;window.enabled=false;window.purposeIds=['analytics','ads'];
      window.Didomi={getUserStatus:()=>({purposes:{essential:[]}}),getRequiredPurposeIds:()=>window.purposeIds,getRequiredVendors:()=>[{id:'vendor',purposeIds:['analytics','ads']}],isUserStatusPartial:()=>window.partial,
      getCurrentUserStatus:()=>({regulation:'GDPR',purposes:{analytics:{enabled:window.enabled},ads:{enabled:window.enabled}},vendors:{vendor:{enabled:window.enabled}}})};
      window.didomiOnReady={push:cb=>cb(window.Didomi)};window.listeners=[];window.didomiEventListeners={push:row=>window.listeners.push(row)};
      function choose(value){fetch('/action');window.enabled=${mode==='opposite'?'!value':'value'};window.partial=${mode==='partial'?'true':'false'};
      ${mode==='configuration_drift'?'window.purposeIds=["analytics"];':''}
      document.cookie='didomi_token=opaque-updated-receipt; path=/';document.getElementById('didomi-host').hidden=true;
      ${mode==='no_event'?'':`window.listeners.forEach(row=>row.listener({action:'${mode==='external'?'external':'click'}'}));`}}
      </script></body></html>`);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const url=`http://127.0.0.1:${(server.address() as any).port}/`;
    const common={url,interactionAuthorization:{authorizationId:'loopback_local_lab',kind:'loopback' as const},
      scanId:`didomi-${action}-${mode}`,actionSearchTimeoutMs:700,confirmationTimeoutMs:200,observationWindowMs:250};
    const packet=action==='accept'?await runPostAcceptObserver({...common,recipe:buildCanonicalPostAcceptActionRecipes().find(r=>r.cmpId==='Didomi')!})
      :await runPostRefusalObserver({...common,recipe:buildCanonicalPostRefusalActionRecipes().find(r=>r.cmpId==='Didomi')!});
    const registration='acceptanceRegistration' in packet?packet.acceptanceRegistration:packet.refusalRegistration;
    assert.equal(clicks,1);assert.equal(options,0);
    assert.equal(registration.status,mode==='complete'?'confirmed':'unconfirmed');
    if(mode==='complete'){
      assert.equal(packet.decisionEvidence?.decision,action==='accept'?'granted':'denied');
      assert.equal(packet.decisionEvidence?.timestampBasis,'verified_state_observed');
      assert.equal(registration.witnesses[0]?.witnessType,'cmp_api_state');
    }
    assert.ok(action==='accept'?postAcceptEvidencePacketSchema.safeParse(packet).success:postRefusalEvidencePacketSchema.safeParse(packet).success);
  } finally {await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
