import assert from 'node:assert/strict';
import test from 'node:test';
import {chromium} from 'playwright';
import {waitForExplicitOptOutControl} from './explicit-opt-out-readiness';
import {runSaleSharingOptOutObserver} from './sale-sharing-opt-out-observer';

const url='https://readiness-fixture.test/';
const control='<div id="onetrust-banner-sdk"><button id="onetrust-pc-btn-handler">Your Privacy Choices</button></div>';
const recipes=[{entranceSelector:'button#onetrust-pc-btn-handler',dialogSelector:'#onetrust-pc-sdk'}];

test('explicit readiness uses bounded events, preserves cutoff, and performs no SDK calls',async t=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const mode of ['initial','after-dcl','before-dcl','visible-later','mutation-noise','absent','changed','ambiguous','check-limit','probe-budget','expired','cancelled'])await t.test(mode,async()=>{
   const context=await browser.newContext();let release:(()=>void)|undefined;
   const held=new Promise<void>(resolve=>{release=resolve;});
   try{
    await context.route('**/*',async route=>{
     if(route.request().url().endsWith('/slow.js')){await held;await route.fulfill({contentType:'text/javascript',body:''}).catch(()=>{});return;}
     const body=`<!doctype html><body>${['initial','before-dcl','probe-budget','ambiguous'].includes(mode)?control:mode==='visible-later'?'<div id="onetrust-banner-sdk" hidden><button id="onetrust-pc-btn-handler">Your Privacy Choices</button></div>':''}
       <script>window.calls=0;window.__gpp=()=>{window.calls++};${mode==='probe-budget'?'const nativeStyle=window.getComputedStyle;window.getComputedStyle=(el)=>{const until=performance.now()+15;while(performance.now()<until){};return nativeStyle(el)};':''}</script>${mode==='before-dcl'?'<script defer src="/slow.js"></script>':''}`;
     await route.fulfill({contentType:'text/html',body});
    });
    const page=await context.newPage();await page.goto(url,{waitUntil:mode==='before-dcl'?'commit':'domcontentloaded'});
    if(['after-dcl','visible-later','mutation-noise','changed','check-limit'].includes(mode))await page.evaluate(({mode,control})=>{
     setTimeout(()=>{
      if(mode==='after-dcl')document.body.insertAdjacentHTML('beforeend',control);
      if(mode==='visible-later')document.getElementById('onetrust-banner-sdk')!.removeAttribute('hidden');
      if(mode==='changed'){history.pushState({},'','/other');document.body.insertAdjacentHTML('beforeend',control);}
      if(mode==='check-limit'){for(let i=0;i<40;i++)document.dispatchEvent(new Event('readystatechange'));}
      if(mode==='mutation-noise'){let count=0;const timer=setInterval(()=>{document.body.appendChild(document.createElement('span'));if(++count===100)clearInterval(timer);},1);setTimeout(()=>document.body.insertAdjacentHTML('beforeend',control),150);}
     },50);
    },{mode,control});
    const start=Date.now(),cutoff=start+(mode==='expired'?-1:350);
    const pending=waitForExplicitOptOutControl(page,mode==='ambiguous'?[...recipes,...recipes]:recipes,cutoff,start+1750,url);
    if(mode==='cancelled'){const rejected=assert.rejects(pending);await context.close();await rejected;return;}
    const result=await pending;
    const success=['initial','after-dcl','before-dcl','visible-later','mutation-noise'].includes(mode);
    assert.equal(Boolean(result.state),success,JSON.stringify(result));assert.ok(Date.now()-start<550);
    assert.ok(result.diagnostics.checks<=32);assert.ok(result.diagnostics.remainingCaptureMs>=1200);
    assert.equal(await page.evaluate(()=>(window as any).calls),0);
    if(mode==='before-dcl')assert.equal(result.state,'parsed_recipe');
    if(mode==='after-dcl'||mode==='visible-later')assert.equal(result.diagnostics.trigger,'mutation');
    if(mode==='absent'||mode==='expired')assert.equal(result.diagnostics.reason,'cutoff');
    if(mode==='changed')assert.equal(result.diagnostics.reason,'document_changed');
    if(mode==='ambiguous')assert.equal(result.diagnostics.reason,'ambiguous_recipe');
    if(mode==='check-limit')assert.equal(result.diagnostics.reason,'check_limit');
    if(mode==='probe-budget')assert.equal(result.diagnostics.reason,'probe_budget');
   }finally{release?.();await context.close();}
  });
 }finally{await browser.close();}
});

test('late opt-out controls complete within unchanged capture and preserve legacy early stop',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const mode of ['bound','legacy','absent']){
   const bound=mode!=='legacy',success=mode==='bound';
   let opens=0,submits=0;
   const launch=browser.newContext.bind(browser);
   // Production observer owns isolated contexts; intercept only this fixture's traffic.
   browser.newContext=async options=>{const context=await launch(options);await context.route('**/*',async route=>{
    if(route.request().url().endsWith('/open')){opens++;await route.fulfill({body:''});return;}
    if(route.request().url().endsWith('/submit')){submits++;await route.fulfill({body:''});return;}
    await route.fulfill({contentType:'text/html',body:`<!doctype html><body><script>
     let choice=2;window.__gpp=(cmd,cb)=>cb({gppVersion:'1.1',cmpStatus:'loaded',signalStatus:'ready',applicableSections:[8],sectionList:[8],parsedSections:{usca:{Version:1,SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:choice,SharingOptOut:choice}}},true);
     addEventListener('DOMContentLoaded',()=>setTimeout(()=>{
      document.body.innerHTML='<button class="ot-sdk-show-settings">Your Privacy Choices</button><div id="onetrust-pc-sdk" hidden><button class="save-preference-btn-handler onetrust-close-btn-handler">Do Not Sell My Personal Information</button></div>';
      document.querySelector('.ot-sdk-show-settings').onclick=()=>{fetch('/open');document.getElementById('onetrust-pc-sdk').hidden=false};
      document.querySelector('.save-preference-btn-handler').onclick=()=>{choice=1;fetch('/submit')};
     },${mode==='absent'?5000:200}));</script>`});
   });return context;};
   try{
    const packet=await runSaleSharingOptOutObserver({browser,parentDispatchSha256:'a'.repeat(64),deadlineAtMs:Date.now()+5000,config:{enabled:true,scanId:bound?'bound':'legacy',exactTargetUrl:url,policyVersion:'bounded_sale_sharing_opt_out.v1',...(bound?{controlPolicy:'explicit_opt_out_controls.v1' as const}:{})}});
    assert.equal(packet.registration==='confirmed',success,JSON.stringify(packet));
    assert.equal(submits,success?1:0);assert.equal(opens,success?1:0);
    if(success){assert.equal(packet.observationWindowMs,500);assert.equal(packet.status,'complete');assert.equal(packet.executionDiagnostics?.boundControlReadiness?.trigger,'mutation');assert.ok(Date.parse(packet.completedAt)-Date.parse(packet.startedAt)<=3000);}
    else if(bound){assert.equal(packet.status,'limited');assert.ok(packet.limitations.includes('explicit_readiness_cutoff'));assert.ok(packet.executionDiagnostics!.boundControlReadiness!.remainingCaptureMs>=1300);assert.equal(packet.actionCount,0);assert.ok(Date.parse(packet.completedAt)-Date.parse(packet.startedAt)<2000);}
    else{assert.equal(packet.executionDiagnostics?.boundControlReadiness,undefined);assert.ok(packet.limitations.includes('no_unique_registered_recipe'));}
   }finally{browser.newContext=launch;}
  }
 }finally{await browser.close();}
});
