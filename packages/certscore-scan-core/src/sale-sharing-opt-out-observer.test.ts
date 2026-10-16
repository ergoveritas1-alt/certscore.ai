import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { chromium, type Browser } from "playwright";
import { runSaleSharingOptOutObserver } from "./sale-sharing-opt-out-observer";
import { saleSharingOptOutEvidenceSchema } from "@certscore/contracts";

test("isolated California observer confirms explicit choice; cookie Reject, generic Save, forms and absent semantic proof stay neutral", {timeout:30000}, async()=>{
  let mode="valid",clicks=0;
  const server=createServer((req,res)=>{
    if(req.url==="/clicked"){clicks++;res.end();return;}
    res.setHeader("Content-Type","text/html");
    const label=mode==="cookie"?"Reject all":mode==="save"?"Confirm my choices":"Do Not Sell or Share My Personal Information";
    res.end(`<!doctype html><html lang="en"><body><button type="button" id="ot-sdk-btn" class="ot-sdk-show-settings">Your Privacy Choices</button><div id="onetrust-pc-sdk" hidden>${mode==="form"?'<input name="email">':''}<button type="button" class="save-preference-btn-handler onetrust-close-btn-handler">${label}</button>${mode==="duplicate"?'<button type="button" class="save-preference-btn-handler onetrust-close-btn-handler">'+label+'</button>':''}</div><script>
    let choice=2;window.__gpp=(command,cb)=>cb({gppVersion:'1.1',cmpStatus:'loaded',signalStatus:'ready',applicableSections:[8],sectionList:[8],parsedSections:{usca:{Version:1,SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:choice,SharingOptOut:choice}}},true);
    document.getElementById('ot-sdk-btn').onclick=()=>document.getElementById('onetrust-pc-sdk').hidden=false;
    document.querySelector('.save-preference-btn-handler').onclick=()=>{fetch('/clicked');${mode==="unconfirmed"?'':'choice=1;'}${mode==="activity"?`setTimeout(()=>fetch('https://googleads.g.doubleclick.net/pagead/viewthroughconversion/123/?secret=never-retain'),350);`:''}${mode==="navigation"?'location.href="/other";':''}};</script></body></html>`);
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();assert.ok(address&&typeof address!=="string");
  const browser=await chromium.launch({headless:true});
  try{
    const fixtureBrowser={newContext:async(options:unknown)=>{const context=await browser.newContext(options as Parameters<Browser["newContext"]>[0]);await context.route("https://googleads.g.doubleclick.net/**",route=>route.fulfill({status:204}));return context;}} as unknown as Browser;
    for(const scenario of ["valid","activity","cookie","save","form","duplicate","unconfirmed"]){
      mode=scenario;clicks=0;
      const packet=await runSaleSharingOptOutObserver({browser:fixtureBrowser,parentDispatchSha256:"a".repeat(64),config:{enabled:true,policyVersion:"bounded_sale_sharing_opt_out.v1",scanId:`case-${mode}`,exactTargetUrl:`http://127.0.0.1:${address.port}/`}});
      assert.ok(saleSharingOptOutEvidenceSchema.safeParse(packet).success);
      if(mode==="valid" || mode==="activity"){
        assert.equal(packet.status,"complete",JSON.stringify(packet));assert.equal(packet.registration,"confirmed");assert.equal(packet.actionCount,2);assert.equal(clicks,1);assert.equal(packet.observationWindowMs,500);
        assert.equal(packet.requests.length,mode==="activity"?1:0,JSON.stringify(packet));assert.doesNotMatch(JSON.stringify(packet),/secret|never-retain/);
      }else{
        assert.notEqual(packet.status,"complete",JSON.stringify(packet));assert.equal(packet.captureComplete,false);assert.deepEqual(packet.requests,[]);
        assert.equal(clicks,mode==="unconfirmed"?1:0,mode);
      }
    }
    const controller=new AbortController();controller.abort();
    const cancelled=await runSaleSharingOptOutObserver({browser,signal:controller.signal,parentDispatchSha256:"a".repeat(64),config:{enabled:true,policyVersion:"bounded_sale_sharing_opt_out.v1",scanId:"cancelled",exactTargetUrl:`http://127.0.0.1:${address.port}/`}});
    assert.equal(cancelled.actionCount,0);assert.equal(cancelled.status,"limited");
  }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
