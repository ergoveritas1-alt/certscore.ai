import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {mkdtemp,rm} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {chromium} from "playwright";
import {createArtifactWriter} from "./artifact-writer";
import {preConsentRuntimeScanner} from "./scanners/pre-consent-runtime-scanner";
import {PAIRED_RUNTIME_SETTLE_MAX_MS,waitForLoadingRuntimeDocument} from "./runtime-document-settle";
import {createPassiveEvidenceActivityTracker} from "./passive-evidence-quiet-window";
import {EventEmitter} from "node:events";
import type {Page} from "playwright";
import {createLocalGpcAdaptivePair} from "./local-gpc-adaptive";

test("adaptive peers extend one common interval for both request streams and preserve initial forms",{timeout:20000},async()=>{
 const server=createServer((_req,res)=>{
  res.setHeader("Content-Type","text/html");
  res.end(`<!doctype html><html lang="en"><body><h1>Public information</h1><p>${"Public services information. ".repeat(30)}</p><form id="early"><label for="email">Email</label><input id="email" type="email"></form><script>setTimeout(()=>document.querySelector('#early')?.remove(),3000);for(const wait of (navigator.globalPrivacyControl?[5500]:[4000,6500]))setTimeout(()=>fetch('https://www.facebook.com/tr/?id=fixture&ev=PageView&wait='+wait),wait)</script></body></html>`);
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url=`http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/`;
 const browser=await chromium.launch({headless:true}),root=await mkdtemp(path.join(tmpdir(),"gpc-adaptive-"));
 const pair=createLocalGpcAdaptivePair({scanId:"adaptive-fixture"});
 try {
  const results=await Promise.all([false,true].map(async enabled=>preConsentRuntimeScanner({browser,url,normalizedUrl:url,captureScope:"runtime_evidence",screenshotMode:"never",waitMode:"fast",
    globalPrivacyControlEnabled:enabled,gpcComparisonMinDurationMs:15000,localGpcAdaptiveParticipant:pair.participant("adaptive-fixture",enabled?"gpc_observation":"runtime_evidence"),scanStartedAtMs:Date.now(),internalBudgetMs:30000,
    artifactWriter:await createArtifactWriter(path.join(root,String(enabled))),routeFulfillers:[{urlPattern:/^https:\/\/www\.facebook\.com\/tr\//,status:204,body:""}]})));
  const baseline=results[0]!.gpcImpactCapture!,gpc=results[1]!.gpcImpactCapture!;
  assert.ok(baseline.adaptiveObservation!.durationMs>=8400&&baseline.adaptiveObservation!.durationMs<9500);
  assert.equal(baseline.adaptiveObservation!.durationMs,gpc.adaptiveObservation!.durationMs);
  assert.equal(baseline.adaptiveObservation!.peerDocumentToken,gpc.document!.token);
  for(const result of results){
    assert.equal(result.gpcImpactCapture!.localRetention,"local_gpc_complete.v2");
    assert.deepEqual(result.gpcImpactCapture!.limitationKeys,[]);
    assert.equal(result.gpcImpactCapture!.windows.at(-1)!.durationMs,result.gpcImpactCapture!.adaptiveObservation!.durationMs);
    assert.ok(result.collectionSurfaceObservations.length>0);
  }
 }finally{await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});

test("local fifteen-second diagnostics retain late requests and all four checkpoints in both conditions", {timeout:45000}, async () => {
 const server=createServer((_req,res)=>{
  res.setHeader("Content-Type","text/html");
  res.end(`<!doctype html><html lang="en"><body><h1>Public information</h1><p>${"Public services information. ".repeat(30)}</p><form id="initial"><label for="email">Email</label><input id="email" type="email"></form><script>for(const wait of [6000,9000,13000])setTimeout(()=>{document.querySelector('#initial')?.remove();fetch('https://www.facebook.com/tr/?id=fixture&ev=PageView&wait='+wait)},wait)</script></body></html>`);
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url=`http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/`;
 const browser=await chromium.launch({headless:true}),root=await mkdtemp(path.join(tmpdir(),"gpc-fifteen-second-"));
 try {
  for(const enabled of [false,true]) {
   const result=await preConsentRuntimeScanner({browser,url,normalizedUrl:url,captureScope:"runtime_evidence",screenshotMode:"never",waitMode:"fast",
    globalPrivacyControlEnabled:enabled,gpcComparisonMinDurationMs:15000,scanStartedAtMs:Date.now(),internalBudgetMs:30000,
    artifactWriter:await createArtifactWriter(path.join(root,String(enabled))),routeFulfillers:[{urlPattern:/^https:\/\/www\.facebook\.com\/tr\//,status:204,body:""}]});
   const capture=result.gpcImpactCapture!;
   assert.deepEqual(capture.windows.slice(-4).map(window=>window.durationMs),[5000,8000,10000,15000]);
   assert.ok(result.gpcSignalObservation!.capturedAtMs-capture.document!.committedAtMs>=15000);
   const late=result.networkEvents.filter(event=>event.requestUrl.startsWith("https://www.facebook.com/tr/"));
   assert.equal(late.length,3);
   assert.ok(late.every(event=>event.requestHeaders?.secGpc===(enabled?"1":undefined)));
   assert.ok(result.collectionSurfaceObservations.length>0,"initial form survives later removal");
   assert.deepEqual(capture.limitationKeys,[]);
  }
 } finally {await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});

test("local five-second captures preserve initial forms and retain delayed collection in both conditions", {timeout:30000}, async () => {
 const server=createServer((_req,res)=>{
  res.setHeader("Content-Type","text/html");
  res.end(`<!doctype html><html lang="en"><body><h1>Public company information</h1><p>${"Public services and contact information. ".repeat(30)}</p><form id="fixture-form"><label for="email">Email</label><input id="email" type="email" name="email"></form><script>document.cookie='early_fixture=1; path=/';setTimeout(()=>{document.querySelector('#fixture-form').remove();document.cookie='late_fixture=1; path=/';fetch('https://www.facebook.com/tr/?id=fixture&ev=PageView')},3600)</script></body></html>`);
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url=`http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/`;
 const browser=await chromium.launch({headless:true}),root=await mkdtemp(path.join(tmpdir(),"gpc-five-second-"));
 try {
  for (const enabled of [false,true]) {
   const result=await preConsentRuntimeScanner({browser,url,normalizedUrl:url,captureScope:"runtime_evidence",screenshotMode:"never",waitMode:"fast",
    globalPrivacyControlEnabled:enabled,gpcComparisonMinDurationMs:5000,scanStartedAtMs:Date.now(),internalBudgetMs:15000,
    artifactWriter:await createArtifactWriter(path.join(root,String(enabled))),
    routeFulfillers:[{urlPattern:/^https:\/\/www\.facebook\.com\/tr\//,status:204,body:""}]});
   assert.deepEqual(result.gpcImpactCapture?.windows.map(window=>window.durationMs),[250,500,1000,3000,5000]);
   assert.ok(result.gpcSignalObservation!.capturedAtMs-result.gpcImpactCapture!.document!.committedAtMs>=5000);
   const late=result.networkEvents.find(event=>event.requestUrl.startsWith("https://www.facebook.com/tr/"));
   assert.ok(late);assert.equal(late.requestHeaders?.secGpc,enabled?"1":undefined);
   assert.ok(result.collectionSurfaceObservations.length>0,"initial form survives removal during the longer observation");
   assert.ok(result.cookieSnapshots.some(snapshot=>snapshot.cookieNames.includes("early_fixture")));
   assert.ok(result.cookieSnapshots.some(snapshot=>snapshot.cookieNames.includes("late_fixture")));
   assert.equal(result.moduleRun.timingBreakdown?.filter(row=>row.label==="GPC signal readback").length,1);
   assert.equal(result.moduleRun.timingBreakdown?.filter(row=>row.label==="GPC matched observation minimum").length,1);
  }
 } finally {
  await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});
 }
});

test("local matched observation still obeys parent cancellation", {timeout:10000}, async () => {
 const server=createServer((_req,res)=>{res.setHeader("Content-Type","text/html");res.end(`<!doctype html><html lang="en"><body><h1>Public company information</h1><p>${"Public services and contact information. ".repeat(30)}</p></body></html>`);});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url=`http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/`;
 const browser=await chromium.launch({headless:true}),root=await mkdtemp(path.join(tmpdir(),"gpc-five-second-abort-"));
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try {
  const startedAt=Date.now();
  await assert.rejects(preConsentRuntimeScanner({browser,url,normalizedUrl:url,captureScope:"runtime_evidence",screenshotMode:"never",waitMode:"fast",
   globalPrivacyControlEnabled:true,gpcComparisonMinDurationMs:5000,scanStartedAtMs:Date.now(),internalBudgetMs:15000,signal:controller.signal,
   artifactWriter:await createArtifactWriter(root),onLifecycleCheckpoint:checkpoint=>{
    if(checkpoint.label==="passive_quiet_gate_started")timer=setTimeout(()=>controller.abort(new Error("fixture parent cancellation")),500);
   }}),/fixture parent cancellation/);
  assert.ok(Date.now()-startedAt<5000);
 } finally {
  if(timer)clearTimeout(timer);await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});
 }
});

test("both passive conditions retain late activity across same-document history updates beyond the initial gate",{timeout:30000},async()=>{
 const timers=new Set<ReturnType<typeof setTimeout>>();
 let pendingResponse: import("node:http").ServerResponse|undefined;
 const server=createServer((req,res)=>{
  if(req.method === "HEAD"){res.end();return;}
  if(req.url === "/late-script"){
   pendingResponse=res;return;
  }
  res.setHeader("Content-Type","text/html");res.end(`<!doctype html><html lang="en"><body><h1>Public site information</h1><p>${"Ordinary public content. ".repeat(30)}</p><script>setTimeout(()=>history.replaceState(null,'',location.href),2000);fetch('/late-script').then(r=>r.json()).then(()=>fetch('https://www.facebook.com/tr/?id=fixture&ev=PageView'));</script></body></html>`);
 });
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 const url=`http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/`;
 const browser=await chromium.launch({headless:true});const root=await mkdtemp(path.join(tmpdir(),"gpc-matched-settle-"));
 try{
  for(const enabled of [false,true]){
   const writer=await createArtifactWriter(path.join(root,String(enabled)));let scheduled=false;
   const result=await preConsentRuntimeScanner({browser,url,normalizedUrl:url,captureScope:"runtime_evidence",screenshotMode:"never",waitMode:"fast",
    globalPrivacyControlEnabled:enabled,scanStartedAtMs:Date.now(),internalBudgetMs:15000,
    artifactWriter:writer,
    onLifecycleCheckpoint: checkpoint=>{
     if(checkpoint.label === "passive_quiet_gate_started"){scheduled=true;
      const timer=setTimeout(()=>{assert.ok(pendingResponse);pendingResponse.setHeader("Content-Type","application/json");pendingResponse.end('{"loaded":true}');},2300);timers.add(timer);
     }
    },routeFulfillers:[{urlPattern:/^https:\/\/www\.facebook\.com\/tr\//,contentType:"text/plain",body:"ok"}]});
   assert.equal(scheduled,true);
   assert.equal(result.moduleRun.timingBreakdown?.find(t=>t.label === "passive evidence quiet wait")?.outcome,"timed_out",JSON.stringify({events:result.networkEvents.map(e=>[e.requestUrl,e.timestampMs]),timings:result.moduleRun.timingBreakdown,errors:result.moduleRun.errors}));
   const settle=result.moduleRun.timingBreakdown?.find(t=>t.label === "paired passive comparison settle");
   assert.equal(settle?.outcome,"completed",JSON.stringify(settle));
   assert.ok((settle?.durationMs ?? 0)<=PAIRED_RUNTIME_SETTLE_MAX_MS+100);
   assert.ok(result.networkEvents.some(e=>e.requestUrl.startsWith("https://www.facebook.com/tr/")),"late collection is captured in both conditions");
   const checkpoint=result.gpcImpactCapture?.quietCheckpoint;
   assert.ok(checkpoint);assert.equal(checkpoint.inFlightRequestCount,0);assert.ok(checkpoint.quietForMs>=250);
   assert.equal(result.gpcSignalObservation?.expectedEnabled,enabled);
  }
 }finally{for(const t of timers)clearTimeout(t);await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});}
});

test("parsed pending-only settling cannot exceed the approved three-second allowance",async(t)=>{
 t.mock.timers.enable({apis:["Date","setTimeout"]});
 const events=new EventEmitter(),frame={};
 const page=Object.assign(events,{evaluate:()=>Promise.resolve("complete"),mainFrame:()=>frame}) as unknown as Page;
 const tracker=createPassiveEvidenceActivityTracker();tracker.markRequestStarted({});
 const wait=waitForLoadingRuntimeDocument({page,tracker,timeoutMs:PAIRED_RUNTIME_SETTLE_MAX_MS,awaitPendingActivity:true});
 await Promise.resolve();t.mock.timers.tick(PAIRED_RUNTIME_SETTLE_MAX_MS);
 assert.deepEqual(await wait,{status:"timed_out",elapsedMs:3000,pendingActivityOnly:true});
 assert.equal(events.listenerCount("domcontentloaded"),0);
});

test("direct collection responses survive stalled asynchronous header reads",{timeout:20000},async t=>{
 const server=createServer((_req,res)=>{res.setHeader("Content-Type","text/html");res.end(`<!doctype html><html><body><h1>Public company information</h1><p>${"Services and customer support. ".repeat(30)}</p><script>fetch('https://www.facebook.com/tr/?id=fixture&ev=PageView')</script></body></html>`);});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url=`http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/`;
 const browser=await chromium.launch({headless:true}),root=await mkdtemp(path.join(tmpdir(),"gpc-direct-response-"));
 const newContext=browser.newContext.bind(browser);
 t.mock.method(browser,"newContext",async(...args)=>{
  const context=await newContext(...args),newPage=context.newPage.bind(context);
  t.mock.method(context,"newPage",async()=>{const page=await newPage();page.on("response",response=>{
   if(response.url().startsWith("https://www.facebook.com/tr/"))t.mock.method(response,"allHeaders",()=>new Promise(()=>{}));
  });return page;});return context;
 });
 try{
  for(const enabled of [false,true]){
   const result=await preConsentRuntimeScanner({browser,url,normalizedUrl:url,captureScope:"runtime_evidence",screenshotMode:"never",waitMode:"fast",globalPrivacyControlEnabled:enabled,
    scanStartedAtMs:Date.now(),internalBudgetMs:10000,artifactWriter:await createArtifactWriter(path.join(root,String(enabled))),
    routeFulfillers:[{urlPattern:/^https:\/\/www\.facebook\.com\/tr\//,status:204,body:""}]});
   const request=result.networkEvents.find(event=>event.requestUrl.startsWith("https://www.facebook.com/tr/"))!;
   const responses=result.networkResponseEvents.filter(event=>event.requestId===request.requestId);
   assert.equal(responses.length,1);assert.equal(responses[0]!.status,204);assert.equal(responses[0]!.metadataCapture,"pending");
   assert.equal(request.requestHeaders?.secGpc,enabled?"1":undefined);
   assert.equal(result.gpcImpactCapture?.quietCheckpoint?.inFlightRequestCount,0);
   assert.ok(!result.moduleRun.timingBreakdown?.some(row=>row.label==="GPC matched observation minimum"));
  }
 }finally{await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});


test("the single GPC terminal read includes CMP readiness reached during existing cookie capture", { timeout: 20000 }, async t => {
  const server = createServer((_req, res) => { res.setHeader("Content-Type", "text/html"); res.end(`<!doctype html><html><body><h1>Company information</h1><p>${"Ordinary public content and services. ".repeat(30)}</p></body></html>`); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/`;
  const browser = await chromium.launch({ headless: true }), root = await mkdtemp(path.join(tmpdir(), "gpc-terminal-cmp-"));
  const newContext = browser.newContext.bind(browser);
  let installed = false;
  t.mock.method(browser, "newContext", async (...args) => {
    const context = await newContext(...args), cookies = context.cookies.bind(context);
    t.mock.method(context, "cookies", async (...cookieArgs) => {
      const page = context.pages()[0];
      if (!installed && page?.url() === url) {
        installed = true;
        // The fixture makes the existing cookie read the readiness boundary;
        // no new delay, request, retry or capture is introduced by the scanner.
        await page.evaluate(() => {
          (window as unknown as { __gpp: unknown }).__gpp = (command: string, callback: (value: unknown, success: boolean) => void) => {
            const ping = { gppVersion: "1.1", cmpStatus: "loaded", signalStatus: "ready", sectionList: [8], applicableSections: [8],
              parsedSections: { usca: [{ Version: 1, SaleOptOutNotice: 1, SharingOptOutNotice: 1, SaleOptOut: 1, SharingOptOut: 1 }, { GpcSegmentType: 1, Gpc: true }] } };
            if (command === "ping") callback(ping, true);
            if (command === "addEventListener") callback({ eventName: "listenerRegistered", data: true, listenerId: 1, pingData: ping }, true);
          };
        });
      }
      return cookies(...cookieArgs);
    });
    return context;
  });
  try {
    const result = await preConsentRuntimeScanner({ browser, url, normalizedUrl: url, captureScope: "runtime_evidence", screenshotMode: "never", waitMode: "fast",
      globalPrivacyControlEnabled: true, gpcOptOutPrototype: { scanId: "terminal-cmp" }, scanStartedAtMs: Date.now(), internalBudgetMs: 10000,
      artifactWriter: await createArtifactWriter(root) });
    assert.ok(installed);
    assert.equal(result.gpcOptOutObservation?.gppStatus, "observed");
    assert.equal(result.gpcOptOutObservation?.usca?.saleOptOut, 1);
    const timings = result.moduleRun.timingBreakdown ?? [];
    assert.equal(timings.filter(row => row.label === "GPC opt-out prototype").length, 1);
    assert.ok(timings.findIndex(row => row.label === "cookie capture") < timings.findIndex(row => row.label === "GPC opt-out prototype"));
    assert.ok(result.gpcImpactCapture!.capturedAtMs <= result.gpcOptOutObservation!.capturedAtMs);
  } finally { await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});
