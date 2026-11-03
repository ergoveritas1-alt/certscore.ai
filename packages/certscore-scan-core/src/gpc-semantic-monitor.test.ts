import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { chromiumLaunchOptions } from "./playwright-runtime";
import { installGpcSemanticMonitor } from "./gpc-semantic-monitor";
import { captureGpcOptOutObservation } from "./gpc-opt-out-capture";
test("loaded CMP replacing a stub retains ready transitions without accepting stale stub callbacks", async()=>{
 const browser=await chromium.launch(chromiumLaunchOptions({headless:true}));
 try {const context=await browser.newContext();await installGpcSemanticMonitor(context,'fixtureMonitor');
 await context.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body>Monitor fixture</body>'}));
 const page=await context.newPage(),started=Date.now();await page.goto('https://fixture.test/');
 await page.evaluate(async()=>{
   const w=window as any;let oldCallback:any;
   w.__gpp=(cmd:string,cb:any)=>{if(cmd==='addEventListener')oldCallback=cb;};
   document.dispatchEvent(new Event('load'));
   const ping={gppVersion:'1.1',cmpStatus:'loaded',signalStatus:'ready',sectionList:[8],applicableSections:[8],parsedSections:{usca:[{Version:1,SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:1,SharingOptOut:1},{GpcSegmentType:1,Gpc:true}]}};
   w.__gpp=(cmd:string,cb:any)=>{if(cmd==='addEventListener')cb({eventName:'listenerRegistered',data:true,listenerId:1,pingData:ping},true);if(cmd==='ping')cb(ping,true);};
   document.dispatchEvent(new Event('load'));
   oldCallback?.({eventName:'signalStatus',pingData:{...ping,signalStatus:'not ready'}},true);
 });
 const result=await captureGpcOptOutObservation(page,{scanId:'monitor',scanStartedAtMs:started,monitorKey:'fixtureMonitor',semanticOnly:true});
 assert.equal(result.gppStatus,'observed');assert.deepEqual(result.stateTransitions?.map(x=>x.status),['observed']);
 } finally {await browser.close();}
});

test("terminal GPP availability uses the current top document without waits or stale listener promotion", async t => {
  const browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  try {
    for (const scenario of ["absent", "provider_only", "iframe_only", "queued_stub", "ready_before_terminal", "api_removed"] as const) {
      await t.test(scenario, async () => {
        const context = await browser.newContext({ serviceWorkers: "block" });
        try {
          await installGpcSemanticMonitor(context, "availabilityMonitor");
          await context.route("**/*", route => {
            assert.equal(new URL(route.request().url()).hostname, "availability.test", "unexpected external traffic");
            return route.fulfill({ contentType: "text/html", body: "<!doctype html><body>Local CMP lifecycle fixture</body>" });
          });
          const page = await context.newPage(), started = Date.now();
          await page.goto("https://availability.test/");
          const initialize = (scenario: string) => {
            const w = window as any;
            const ping = { gppVersion: "1.1", cmpStatus: "loaded", signalStatus: "ready", sectionList: [8], applicableSections: [8],
              parsedSections: { usca: [{ Version: 1, SaleOptOutNotice: 1, SharingOptOutNotice: 1, SaleOptOut: 1, SharingOptOut: 2 }, { GpcSegmentType: 1, Gpc: true }] } };
            w.fixtureCommands = [];
            const api = (command: string, callback: any) => {
              w.fixtureCommands.push(command);
              if (command === "ping") callback(ping, true);
              if (command === "addEventListener") {
                w.fixtureCallback = callback;
                callback({ eventName: "listenerRegistered", data: true, listenerId: 1, pingData: ping }, true);
              }
            };
            if (scenario === "provider_only") w.OneTrust = { fixture: true };
            if (scenario === "iframe_only") {
              const frame = document.createElement("iframe"); document.body.append(frame);
              (frame.contentWindow as any).__gpp = api;
            }
            if (scenario === "queued_stub") w.__gpp = (command: string) => w.fixtureCommands.push(command);
            if (scenario === "ready_before_terminal" || scenario === "api_removed") {
              // Simulate initialization during existing page work, with no new
              // checkpoint, polling, sleep or navigation in the producer.
              w.__gpp = api;
              document.dispatchEvent(new Event("DOMContentLoaded"));
              if (scenario === "api_removed") delete w.__gpp;
            }
          };
          await page.evaluate(`(() => { const __name = (fn) => fn; return (${initialize.toString()})(${JSON.stringify(scenario)}); })()`);
          const result = await captureGpcOptOutObservation(page, {
            scanId: "availability", scanStartedAtMs: started, monitorKey: "availabilityMonitor", semanticOnly: true,
          });
          const expected = scenario === "ready_before_terminal" ? "observed" : scenario === "queued_stub" ? "not_ready" : "unavailable";
          assert.equal(result.gppStatus, expected);
          if (expected !== "observed") {
            assert.equal(result.usca, null); assert.equal(result.usnat, null); assert.equal(result.stateSha256, null);
          }
          if (scenario === "api_removed") assert.equal(result.stateTransitions?.at(-1)?.status, "observed", "history is distinct from unavailable terminal state");
          const frozen = JSON.stringify(result);
          await page.evaluate(() => {
            const w = window as any;
            w.fixtureCallback?.({ eventName: "signalStatus", pingData: { cmpStatus: "loaded", signalStatus: "ready" } }, true);
            document.dispatchEvent(new Event("load"));
          });
          assert.equal(JSON.stringify(result), frozen, "callbacks after finalization cannot mutate retained proof");
          const commands = await page.evaluate(() => (window as any).fixtureCommands as string[]);
          assert.ok(commands.every(c => ["ping", "addEventListener", "removeEventListener"].includes(c)));
          assert.equal(commands.filter(c => c === "ping").length, ["queued_stub", "ready_before_terminal"].includes(scenario) ? 1 : 0);
        } finally { await context.close(); }
      });
    }
  } finally { await browser.close(); }
});
