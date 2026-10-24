import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {chromium} from "playwright";
import {waitForSaleSharingSettingsDocument} from "./sale-sharing-settings-readiness";

const stub="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js";
const banner="https://cdn.cookielaw.org/scripttemplates/202609.1.0/otBannerSdk.js";
const recipes=[{entranceSelector:"button#onetrust-pc-btn-handler",dialogSelector:"#onetrust-pc-sdk"}];
const control="document.body.insertAdjacentHTML('beforeend','<button id=onetrust-pc-btn-handler>Cookie Settings</button>');";
const gpp="window.__gpp=()=>{window.apiCalls=(window.apiCalls||0)+1;};";

// Only loopback and locally fulfilled resources. Public script names are inert
// fixture identities, never downloaded or executed from the public network.
test("scoped script readiness remains bounded, cleans up and preserves early GPP",{timeout:30000},async t=>{
  let mode="";
  const server=createServer((_req,res)=>{
    res.setHeader('Content-Type','text/html');
    const initial=mode==="initial"?control+gpp:"";
    const scripts=mode==="initial"?'':`<script async src="${mode==="foreign"?'https://other.test/otSDKStub.js':stub}"></script>${["two-loads","exhausted","cpu-budget","cancelled"].includes(mode)?`<script async src="${banner}"></script>`:''}${mode==="exhausted"?`<script async src="${stub}"></script>`:''}`;
    res.end(`<!doctype html><html><body><script>window.apiCalls=0;${initial}${mode==="cpu-budget"?`const original=document.querySelector.bind(document);document.querySelector=(s)=>{const end=performance.now()+12;while(performance.now()<end){}return original(s);};`:''}</script>${scripts}${mode==="after-dcl"?'':'<script defer src="/slow.js"></script>'}</body></html>`);
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');
  const target=`http://127.0.0.1:${address.port}/`,browser=await chromium.launch({headless:true});
  try{
    for(const scenario of ["initial","script-before-dcl","two-loads","after-dcl","no-gpp","foreign","late","exhausted","cpu-budget","document-change","cancelled","already-expired"])await t.test(scenario,async()=>{
      mode=scenario;const context=await browser.newContext();const calls:string[]=[];
      try{
        await context.route('**/*',async route=>{
          const url=route.request().url();calls.push(url);
          if(url===target){await route.fallback();return;}
          if(url===target+'slow.js'){
            await new Promise(r=>setTimeout(r,1000));await route.fulfill({contentType:'text/javascript',body:''}).catch(()=>{});return;
          }
          const isStub=url===stub,delay=mode==="late"?700:isStub||mode==="foreign"?150:300;
          await new Promise(r=>setTimeout(r,delay));
          let body=control+gpp;
          if(mode==="no-gpp"||mode==="after-dcl")body=control;
          if(mode==="two-loads"&&isStub)body=gpp;
          if(["exhausted","cpu-budget","cancelled"].includes(mode))body=gpp;
          if(mode==="document-change")body="history.pushState({},'', '/away');"+body;
          await route.fulfill({contentType:'text/javascript',body}).catch(()=>{});
        });
        const page=await context.newPage();await page.goto(target,{waitUntil:'commit'});
        const started=Date.now();
        if(mode==="cancelled"){
          const work=waitForSaleSharingSettingsDocument(page,recipes,started+500,target);
          const timer=setTimeout(()=>void context.close(),50);
          await assert.rejects(work);clearTimeout(timer);return;
        }
        const result=await waitForSaleSharingSettingsDocument(page,recipes,mode==="already-expired"?started-1:started+500,target);
        const success=["initial","script-before-dcl","two-loads","after-dcl"].includes(mode);
        assert.equal(Boolean(result.state),success,JSON.stringify(result));
        assert.ok(result.diagnostics.checks<=2);assert.ok(Date.now()-started<650);
        if(mode==="initial"){assert.equal(result.diagnostics.checks,0);assert.equal(result.diagnostics.reason,'parsed_recipe');}
        if(mode==="two-loads")assert.equal(result.diagnostics.checks,2);
        if(mode==="script-before-dcl")assert.equal(result.diagnostics.reason,'script_recipe');
        if(mode==="after-dcl"){assert.equal(result.state,'domcontentloaded');assert.equal(result.diagnostics.gpp,false);}
        if(mode==="no-gpp"){assert.equal(result.state,null);assert.equal(result.diagnostics.reason,'cutoff');}
        if(mode==="foreign"||mode==="already-expired")assert.equal(result.diagnostics.checks,0);
        if(mode==="exhausted")assert.equal(result.diagnostics.checks,2);
        if(mode==="cpu-budget"){assert.equal(result.diagnostics.reason,'probe_budget');assert.equal(result.diagnostics.checks,1);assert.ok(result.diagnostics.probeMs>=10);}
        if(mode==="document-change")assert.equal(result.diagnostics.reason,'document_changed');
        assert.equal(await page.evaluate(()=> (window as unknown as {apiCalls:number}).apiCalls),0,'readiness never invokes GPP');
        // Check listener cleanup without another wait: a subsequent trusted load
        // must not cause a selector read after the readiness promise is terminal.
        await page.evaluate(()=>{
          (window as unknown as {lateReads:number}).lateReads=0;
          document.querySelector=()=>{(window as unknown as {lateReads:number}).lateReads++;return null;};
        });
        await page.addScriptTag({url:banner});
        assert.equal(await page.evaluate(()=> (window as unknown as {lateReads:number}).lateReads),0);
        assert.ok(calls.every(url=>url.startsWith(target)||url.startsWith('https://cdn.cookielaw.org/')||url.startsWith('https://other.test/')));
      }finally{await context.close();}
    });
  }finally{await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
