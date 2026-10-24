import assert from "node:assert/strict";
import test from "node:test";
import {chromium} from "playwright";
import {waitForSaleSharingSettingsDocument} from "./sale-sharing-settings-readiness";

const banner = "https://cdn.cookielaw.org/scripttemplates/202604.1.0/otBannerSdk.js";
const stub = "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js";
const previous = "https://cdn.cookielaw.org/scripttemplates/202609.1.0/otBannerSdk.js";
const source = "https://gimbal.com/";
const destination = "https://infillion.com/";
const recipes = [{entranceSelector:"#onetrust-pc-btn-handler",dialogSelector:"#onetrust-pc-sdk"}];
const control = "document.body.insertAdjacentHTML('beforeend','<button id=onetrust-pc-btn-handler>Cookie Settings</button>');";
const gpp = "window.__gpp=()=>{window.apiCalls++;};";

// Every request, including the named HTTPS pages/scripts, is locally fulfilled.
// The helper receives a verified source from its caller; redirect authorization
// itself is covered by the exact-route and observer integration suites.
test("Gimbal's exact retained banner is source-scoped and shares readiness limits", {timeout:30000}, async t => {
  const browser = await chromium.launch({headless:true});
  const cases = [
    {name:"approved original route",ok:true},
    {name:"direct final dispatch",original:destination},
    {name:"missing original proof",missing:true},
    {name:"different source",original:"https://readcube.com/"},
    {name:"different destination",target:"https://about.readcube.com/"},
    {name:"different destination path",target:destination+"privacy/"},
    {name:"different version",script:banner.replace("202604.1.0","202604.1.1")},
    {name:"foreign host",script:banner.replace("cdn.cookielaw.org","other.test")},
    {name:"query variant",script:banner+"?v=1"},
    {name:"fragment variant",script:banner+"#copy"},
    {name:"late script",late:true},
    {name:"missing early GPP",noGpp:true},
    {name:"after DCL without GPP",noGpp:true,afterDcl:true,ok:true},
    {name:"shared two-probe cap",exhaust:true},
    {name:"shared CPU cap",cpu:true},
    {name:"changed document",changed:true},
  ];
  try {
    for (const row of cases) await t.test(row.name, async () => {
      const context = await browser.newContext();
      const target = row.target ?? destination, script = row.script ?? banner;
      const original = row.missing ? undefined : row.original ?? source;
      let releaseScript!: () => void;
      const scriptGate = new Promise<void>(resolve => {releaseScript=resolve;});
      try {
        await context.addInitScript(() => {
          const w=window as unknown as {apiCalls:number;readinessListening:boolean};
          w.apiCalls=0;w.readinessListening=false;
          const add=document.addEventListener.bind(document);
          document.addEventListener=((...args:Parameters<typeof document.addEventListener>)=>{
            if(args[0]==="load")w.readinessListening=true;
            return add(...args);
          }) as typeof document.addEventListener;
        });
        await context.route("**/*",async route=>{
          const url=route.request().url();
          if(url===target){
            const scripts=row.exhaust ? [stub,previous,script] : [script];
            await route.fulfill({contentType:"text/html",body:`<!doctype html><body>${scripts.map(src=>`<script async src="${src}"></script>`).join("")}${row.afterDcl?"":'<script defer src="/slow-fixture.js"></script>'}</body>`});
          }else if(url===new URL("/slow-fixture.js",target).href){
            await new Promise(r=>setTimeout(r,1000));
            await route.fulfill({contentType:"text/javascript",body:""}).catch(()=>{});
          }else{
            await scriptGate;
            const delay=row.late?600:row.exhaust?(url===stub?20:url===previous?60:120):20;
            await new Promise(r=>setTimeout(r,delay));
            let body=(row.exhaust && url!==script ? "" : control)+(row.noGpp?"":gpp);
            if(row.changed)body="history.replaceState({},'', '/away');"+body;
            if(row.cpu)body+="const q=document.querySelector.bind(document);document.querySelector=s=>{const end=performance.now()+12;while(performance.now()<end){}return q(s);};";
            await route.fulfill({contentType:"text/javascript",body}).catch(()=>{});
          }
        });
        const page=await context.newPage();
        await page.goto(target,{waitUntil:row.afterDcl?"domcontentloaded":"commit"});
        const resultPromise=waitForSaleSharingSettingsDocument(page,recipes,Date.now()+400,target,original);
        await page.waitForFunction(()=> (window as unknown as {readinessListening:boolean}).readinessListening);
        releaseScript();
        const result=await resultPromise;
        assert.equal(Boolean(result.state),row.ok===true,JSON.stringify(result));
        assert.ok(result.diagnostics.checks<=2);
        if(row.ok){assert.equal(result.diagnostics.reason,"script_recipe");assert.equal(result.diagnostics.checks,1);}
        if(row.afterDcl){assert.equal(result.state,"domcontentloaded");assert.equal(result.diagnostics.gpp,false);}
        if(row.exhaust)assert.equal(result.diagnostics.checks,2);
        if(row.cpu){assert.equal(result.diagnostics.reason,"probe_budget");assert.equal(result.diagnostics.checks,1);}
        if(row.changed)assert.equal(result.diagnostics.reason,"document_changed");
        if(row.late)assert.equal(result.diagnostics.checks,0);
        if(!row.ok&&!row.exhaust&&!row.cpu&&!row.changed&&!row.noGpp)assert.equal(result.diagnostics.checks,0);
        assert.equal(await page.evaluate(()=> (window as unknown as {apiCalls:number}).apiCalls),0);
        // A later trusted load of the newly supported version must not inspect
        // the DOM once readiness has completed, including cutoff/CPU failure.
        await page.evaluate(()=>{
          (window as unknown as {lateReads:number}).lateReads=0;
          document.querySelector=()=>{(window as unknown as {lateReads:number}).lateReads++;return null;};
        });
        await page.addScriptTag({url:banner});
        assert.equal(await page.evaluate(()=> (window as unknown as {lateReads:number}).lateReads),0);
      }finally{releaseScript();await context.close();}
    });
  }finally{await browser.close();}
});
