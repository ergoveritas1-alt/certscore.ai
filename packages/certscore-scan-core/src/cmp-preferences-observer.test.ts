import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { runCmpPreferencesObserver } from "./cmp-preferences-observer.js";
import { cmpPreferencesEvidenceSchema, cmpPreferenceBudgetMs } from "@certscore/contracts";

// The former panel-opening assertions are superseded by the owner-approved
// passive-only policy. Fixtures retain tempting controls and SDK open methods
// so a reintroduced action fails these end-to-end checks.
test("passive CMP visit captures loaded facts without opening panels, submitting, scrolling or calling SDK open methods", { timeout: 30000 }, async () => {
  let mode="loaded", mutations=0;
  const server=createServer((req,res)=>{
    if(req.url==="/mutated"){mutations++;res.end();return;}
    res.setHeader("Content-Type","text/html");
    if(mode==="blocked"){res.statusCode=403;res.end("Access denied");return;}
    const groups=[{CustomGroupId:"C0002",GroupName:"Analytics",VendorServices:[{CustomVendorServiceId:"v1",ServiceName:"Explicit Analytics Service"}],FirstPartyCookies:[{Name:"_ga",description:"Audience measurement",IsSession:false,Length:"730",DurationType:365}]}];
    const sdk=mode==="unknown"?"":`window.OneTrust={ToggleInfoDisplay:()=>fetch('/mutated'),GetDomainData:()=>{${mode==="drift"?"history.replaceState({},'', '/drift');":""}return ${JSON.stringify({Groups:groups})};}};`;
    res.end(`<section id="${mode==="unknown"?"custom-cookie-panel":"onetrust-banner-sdk"}"><button id="onetrust-pc-btn-handler" onclick="fetch('/mutated');prefs.hidden=false">Cookie settings</button><button onclick="fetch('/mutated')">Accept all</button><button onclick="fetch('/mutated')">Reject all</button><form action="/mutated"><button>Save</button></form><label><input type="checkbox" checked>Analytics</label><a href="/privacy">Privacy policy</a><section id="prefs" hidden><label><input type="checkbox">Hidden marketing</label><table><tr><th>Provider</th><th>Cookie</th></tr><tr><td>Hidden Vendor</td><td>secret_cookie</td></tr></table></section></section>${mode==="ambiguous"?'<section id="CybotCookiebotDialog"><button>Customize</button></section>':''}<script>${sdk}document.addEventListener('click',()=>fetch('/mutated'));document.addEventListener('submit',()=>fetch('/mutated'));addEventListener('scroll',()=>fetch('/mutated'));</script>`);
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();assert.ok(address&&typeof address!=="string");
  const browser=await chromium.launch({headless:true});
  try {
    for(mode of ["loaded","ambiguous","unknown","drift","blocked"]){
      mutations=0;
      const packet=await runCmpPreferencesObserver({browser,parentDispatchSha256:"a".repeat(64),config:{policyVersion:"bounded_cmp_preferences.v1",enabled:true,scanId:mode,exactTargetUrl:`http://127.0.0.1:${address.port}/`,computeBudgetPolicy:"coverage_25_gb_seconds.v1"}});
      assert.equal(mutations,0,mode);assert.deepEqual(packet.action,{count:0,intent:"options",label:null,opened:false});
      assert.equal(packet.captureMode,"passive_cmp_inventory.v1");assert.equal(packet.controlInventoryComplete,false);assert.equal(packet.declarationInventoryComplete,false);
      assert.equal(packet.accessibilityAudit,undefined);assert.equal(packet.linkedPreferenceNavigation,undefined);
      assert.ok(cmpPreferencesEvidenceSchema.safeParse(packet).success);
      if(mode==="loaded"){
        assert.equal(packet.status,"completed",JSON.stringify(packet));assert.equal(packet.support.provider,"OneTrust");
        assert.deepEqual(packet.serviceNames,["Explicit Analytics Service"]);assert.deepEqual(packet.configuredCategories,["Analytics"]);
        assert.equal(packet.declarations[0]?.name,"_ga");assert.equal(packet.declarations[0]?.duration,"2 years");
        assert.deepEqual(packet.controls.map(r=>r.label),["Analytics"]);assert.ok(packet.privacyLinks.some(r=>r.hitTargetBeforeAction));
        assert.equal(packet.checkpoints?.controlsSurface,"first_layer");assert.ok(packet.captureProgress?.declarationsAtMs!==undefined);
        assert.ok(!JSON.stringify(packet).includes("Hidden Vendor"));
        for(const mutate of [(p:typeof packet)=>{p.action.count=1;},p=>{p.action.opened=true;},p=>{p.controlInventoryComplete=true;},p=>{p.checkpoints!.controlsSurface="preferences";},p=>{p.inspectionDiagnostic!.revision="cmp_preferences.v18";}]){
          const invalid=structuredClone(packet);mutate(invalid);assert.equal(cmpPreferencesEvidenceSchema.safeParse(invalid).success,false);
        }
      }else if(mode==="drift"){
        assert.equal(packet.status,"limited");assert.equal(packet.documentToken,null);assert.equal(packet.declarations.length,0);assert.equal(packet.controls.length,0);
      }else{
        assert.equal(packet.status,"limited");assert.equal(packet.serviceNames?.length??0,0);
        if(mode==="blocked")assert.equal(packet.support.reason,"preference_page_access_limited");
        if(mode==="ambiguous")assert.equal(packet.support.reason,"cmp_identity_ambiguous");
      }
    }
    const controller=new AbortController();controller.abort();
    const cancelled=await runCmpPreferencesObserver({browser,signal:controller.signal,parentDispatchSha256:"b".repeat(64),config:{policyVersion:"bounded_cmp_preferences.v1",enabled:true,scanId:"cancelled",exactTargetUrl:`http://127.0.0.1:${address.port}/`}});
    assert.equal(cancelled.action.count,0);assert.equal(cancelled.support.reason,"preference_inspection_cancelled");
    assert.equal(cmpPreferenceBudgetMs(3008,"coverage_25_gb_seconds.v1"),6510);
  }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('passive readiness recovers DOM-present OneTrust with delayed SDK data inside the existing budget', {timeout:15000}, async()=>{
 let mutations=0;
 const server=createServer((req,res)=>{
  if(req.url==='/mutated'){mutations++;res.end();return;}
  res.setHeader('Content-Type','text/html');
  res.end(`<div id="onetrust-banner-sdk"><button id="onetrust-pc-btn-handler" onclick="fetch('/mutated')">Options</button></div><script>
  let ready=false; window.OneTrust={ToggleInfoDisplay:()=>fetch('/mutated'),GetDomainData:()=>{
    if(!ready&&!window.scheduled){window.scheduled=true;setTimeout(()=>{ready=true},35)}
    return {Groups:ready?[{CustomGroupId:'C0002',GroupName:'Analytics',FirstPartyCookies:[{Name:'_ga',description:'Analytics'}]}]:[]};
  }}; document.addEventListener('click',()=>fetch('/mutated'));document.addEventListener('submit',()=>fetch('/mutated'));
  </script>`);
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
 const browser=await chromium.launch({headless:true});
 try{
  const p=await runCmpPreferencesObserver({browser,parentDispatchSha256:'a'.repeat(64),config:{policyVersion:'bounded_cmp_preferences.v1',enabled:true,scanId:'passive-delayed',exactTargetUrl:`http://127.0.0.1:${address.port}/`,computeBudgetPolicy:'coverage_25_gb_seconds.v1'}});
  assert.equal(p.inspectionDiagnostic?.revision,'cmp_preferences.v20');assert.equal(p.inspectionDiagnostic?.budgetMs,6510);
  assert.equal(p.declarations[0]?.name,'_ga',JSON.stringify(p));assert.equal(p.action.count,0);assert.equal(p.action.opened,false);assert.equal(mutations,0);
 }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
