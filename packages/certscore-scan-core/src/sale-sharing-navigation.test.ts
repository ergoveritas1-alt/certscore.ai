import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {chromium} from "playwright";
import {runSaleSharingOptOutObserver} from "./sale-sharing-opt-out-observer";
import {saleSharingOptOutEvidenceSchema} from "@certscore/contracts";

test("exact-target navigation, parsed CMP readiness and unchanged absolute budget",{timeout:35000},async t=>{
  let mode="",clicks=0,domLoaded=false;
  const api=`let choice=2;window.__gpp=(cmd,cb)=>cb({gppVersion:'1.1',cmpStatus:'loaded',signalStatus:'ready',applicableSections:[8],sectionList:[8],parsedSections:{usca:{Version:1,SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:choice,SharingOptOut:choice}}},true);document.querySelector('.save-preference-btn-handler').onclick=()=>{choice=1;fetch('/clicked');};`;
  const timers=new Set<ReturnType<typeof setTimeout>>();
  const later=(fn:()=>void,ms:number)=>{const timer=setTimeout(()=>{timers.delete(timer);fn();},ms);timers.add(timer);};
  const server=createServer((req,res)=>{
    if(req.url==="/clicked"){clicks++;res.end();return;}
    if(req.url==="/loaded"){domLoaded=true;res.end();return;}
    if(req.url==="/deferred.js"){
      res.setHeader("Content-Type","text/javascript");
      later(()=>{if(!res.destroyed)res.end(mode==="deferred-cmp"?api:"");},mode==="deferred-cmp"?150:4500);return;
    }
    if(mode==="no-response"){return;}
    if(mode==="network-failure"){req.socket.destroy();return;}
    if(mode==="redirect"&&req.url==="/"){res.writeHead(302,{Location:"/destination"});res.end();return;}
    if(mode==="http-error")res.statusCode=403;
    res.setHeader("Content-Type","text/html");
    const html=`<!doctype html><html><body><div id="onetrust-pc-sdk"><button type="button" class="save-preference-btn-handler onetrust-close-btn-handler">Do Not Sell or Share My Personal Information</button></div><script>${mode==="deferred-cmp"||mode==="missing-cmp"?"":api}document.addEventListener('DOMContentLoaded',()=>fetch('/loaded'));${mode==="history-bounce"?"history.pushState({},'', '/away');history.replaceState({},'', '/');":mode==="client-navigation"?"location.href='/destination';":mode==="same-url-reload"?"location.reload();":""}</script>${mode==="subframe"?'<iframe src="/child"></iframe>':''}<script defer src="/deferred.js"></script></body></html>`;
    if(mode==="streaming"){res.write(html.slice(0,-14));return;}
    res.end(html);
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();assert.ok(address&&typeof address!=="string");
  const browser=await chromium.launch({headless:true});
  try{
    for(const scenario of ["parsed-cmp","deferred-cmp","missing-cmp","streaming","http-error","redirect","history-bounce","client-navigation","same-url-reload","subframe","no-response","network-failure"]){
      await t.test(scenario,async()=>{
        mode=scenario;clicks=0;domLoaded=false;
        const start=Date.now();
        const packet=await runSaleSharingOptOutObserver({browser,parentDispatchSha256:"a".repeat(64),config:{enabled:true,policyVersion:"bounded_sale_sharing_opt_out.v1",scanId:scenario,exactTargetUrl:`http://127.0.0.1:${address.port}/`}});
        assert.ok(saleSharingOptOutEvidenceSchema.safeParse(JSON.parse(JSON.stringify(packet))).success);
        assert.ok(Date.now()-start<3250,"capture plus original cleanup reserve");
        assert.ok(Buffer.byteLength(JSON.stringify(packet))<32000);
        const nav=packet.executionDiagnostics!.navigation!;
        assert.ok(Buffer.byteLength(JSON.stringify(nav))<320);
        const success=["parsed-cmp","deferred-cmp","subframe"].includes(scenario);
        assert.equal(packet.status==="complete",success,JSON.stringify(packet));
        assert.equal(clicks,success?1:0);
        if(success){
          assert.equal(packet.observationWindowMs,500);assert.equal(packet.actionCount,1);assert.equal(nav.targetState,"exact");assert.equal(nav.failure,"none");
          if(scenario==="parsed-cmp"){assert.equal(nav.readiness,"parsed_recipe");assert.equal(domLoaded,false,"unrelated defer script remains pending");}
          if(scenario==="deferred-cmp")assert.equal(nav.readiness,"domcontentloaded");
          if(scenario==="subframe")assert.equal(nav.blockedNavigation,"subframe");
        }else{
          assert.equal(packet.captureComplete,false);assert.equal(packet.actionCount,0);assert.deepEqual(packet.requests,[]);
          if(["streaming","missing-cmp","no-response"].includes(scenario))assert.equal(nav.failure,"deadline");
          if(scenario==="network-failure")assert.equal(nav.failure,"network_failure");
          if(scenario==="http-error"){assert.equal(nav.responseStatus,403);assert.equal(nav.failure,"http_error");assert.ok(Date.now()-start<1500,"HTTP rejection precedes deferred script wait");}
          if(scenario==="redirect"){assert.equal(nav.targetState,"different");assert.equal(nav.failure,"target_mismatch");assert.equal(packet.documentToken,null);}
          if(scenario==="history-bounce")assert.equal(nav.failure,"document_changed");
          if(scenario==="client-navigation")assert.equal(nav.blockedNavigation,"main_frame");
        }
        t.diagnostic(`${scenario}: ${Date.now()-start} ms, ${Buffer.byteLength(JSON.stringify(nav))} navigation diagnostic bytes`);
      });
    }
  }finally{for(const timer of timers)clearTimeout(timer);await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
