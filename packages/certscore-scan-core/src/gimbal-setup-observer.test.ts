import assert from "node:assert/strict";
import test from "node:test";
import type { Browser } from "playwright";
import { SALE_SHARING_EXACT_ROUTE_POLICY, saleSharingExactRouteAuthorization, type SaleSharingOptOutDispatch } from "@certscore/contracts";
import { runSaleSharingOptOutObserver } from "./sale-sharing-opt-out-observer";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => {resolve=yes;});
  return {promise, resolve};
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

// No browser is launched and no route callback/DNS/request is executed. These
// doubles exercise the real observer's installer wiring and navigation barrier.
test("observer overlaps only Gimbal and awaits setup plus redirect guards before goto", async t => {
  const keys=["CERTSCORE_HTTP_USER_AGENT", "CERTSCORE_V2_DAG_LAMBDA_HTTP_USER_AGENT"] as const;
  const saved=keys.map(key=>process.env[key]);
  for (const key of keys) process.env[key]="CertScore.ai offline fixture";
  try {
    for (const row of [
      {target:"https://gimbal.com/", v3:true, overlap:true, pageFirst:true},
      {target:"https://gimbal.com/", v3:true, overlap:true, pageFirst:false},
      {target:"https://readcube.com/", v3:true, overlap:false, pageFirst:false},
      {target:"https://infillion.com/", v3:false, overlap:false, pageFirst:false},
      {target:"https://gimbal.com/", v3:false, overlap:false, pageFirst:false},
    ]) await t.test(`${row.target} ${row.v3?'v3':'v1'} pageFirst=${row.pageFirst}`,async()=>{
      const identity=deferred(), pageCreated=deferred(), events:string[]=[];
      let routeCount=0, gotoCount=0;
      const cdp={on:()=>{},send:async(command:string)=>{
        events.push(command);
        if (command==="Page.getFrameTree") return {frameTree:{frame:{id:"main",loaderId:"blank",url:"about:blank"}}};
        return {};
      }};
      const page={url:()=>"about:blank",setDefaultTimeout:()=>{},close:async()=>{events.push("page.close");},
        mainFrame:()=>({}),goto:async()=>{
          gotoCount++;
          assert.ok(events.includes("identity.done")); assert.ok(events.includes("page.done"));
          assert.ok(events.includes("navigation.guard")); assert.ok(events.includes("Page.enable"));
          if(row.v3)assert.ok(events.includes("Fetch.enable"));
          throw Error("offline fixture terminal");
        }};
      const context={route:async()=>{
        if(routeCount++===0){events.push("identity.start");await identity.promise;events.push("identity.done");}
        else events.push("navigation.guard");
      },newPage:async()=>{events.push("page.start");await pageCreated.promise;events.push("page.done");return page;},
      on:()=>{},newCDPSession:async()=>cdp,close:async()=>{events.push("context.close");}};
      const browser={newContext:async(options:{ignoreHTTPSErrors?:boolean;serviceWorkers?:string})=>{
        if(row.v3){assert.equal(options.ignoreHTTPSErrors,false);assert.equal(options.serviceWorkers,"block");}
        return context;
      }} as unknown as Browser;
      const config={enabled:true,policyVersion:row.v3?SALE_SHARING_EXACT_ROUTE_POLICY:"bounded_sale_sharing_opt_out.v1",
        scanId:"offline-setup",exactTargetUrl:row.target,...(row.v3?{exactRouteAuthorization:saleSharingExactRouteAuthorization(row.target)}:{})} as SaleSharingOptOutDispatch;
      const work=runSaleSharingOptOutObserver({config,browser,parentDispatchSha256:"a".repeat(64),deadlineAtMs:Date.now()+3000});
      await flush(); assert.ok(events.includes("identity.start"));
      assert.equal(events.includes("page.start"),row.overlap);
      assert.equal(gotoCount,0); assert.equal(events.includes("navigation.guard"),false);
      if(row.pageFirst){pageCreated.resolve();await flush();assert.equal(gotoCount,0);identity.resolve();}
      else{identity.resolve();await flush();assert.equal(gotoCount,0);pageCreated.resolve();}
      const packet=await work;
      assert.equal(gotoCount,1); assert.equal(packet.actionCount,0); assert.equal(packet.status,"limited");
      assert.equal(packet.registration,"not_attempted"); assert.ok(events.includes("context.close"));
      if(packet.executionDiagnostics?.timing)assert.ok(packet.executionDiagnostics.timing.captureMs<=2750);
    });
  } finally {
    keys.forEach((key,i)=>{if(saved[i]===undefined)delete process.env[key];else process.env[key]=saved[i];});
  }
});
