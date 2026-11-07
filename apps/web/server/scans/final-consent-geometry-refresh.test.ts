import assert from "node:assert/strict";
import test, {mock} from "node:test";
import {mkdtemp, writeFile, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createServer} from "node:http";
import {chromium, type Browser, type Frame} from "playwright";
import {canonicalEvidenceBundleSchema, consentUiObservationSchema, type ScreenshotArtifact} from "@certscore/contracts";
import {captureConsentControlGeometry} from "../../../../packages/certscore-scan-core/src/consent-control-geometry";
import {createFinalConsentGeometryRefresh, prepareFinalConsentGeometryArtifact} from "../../../../packages/certscore-scan-core/src/consent-final-geometry-refresh";
import {reconcileConsentGeometryInventoryCoverage} from "../../../../packages/certscore-scan-core/src/consent-geometry-inventory-coverage";
import {readRapidFirstLayerConsentUiObservation, reconcileConsentUiObservationWithCompletedGeometry,
  finalizeBoundedSameSessionConsentPacket, isStableConsentProofPacket} from "../../../../packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner";
import {preConsentRuntimeScanner} from "../../../../packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner";
import {createArtifactWriter} from "../../../../packages/certscore-scan-core/src/artifact-writer";
import {deriveMaterializedConsentControlAssessment} from "./consent-control-assessment-projector";
import {projectPublicFirstLayerConsentEvidence} from "../../lib/scans/public-first-layer-consent-evidence";

let browser: Browser;
test.before(async()=>{
  // All scanner-created contexts are local-only, including fallback requests.
  const launch=chromium.launch.bind(chromium);
  mock.method(chromium,"launch",async(options:Parameters<typeof chromium.launch>[0])=>{
    const instance=await launch(options),newContext=instance.newContext.bind(instance);
    mock.method(instance,"newContext",async(options:Parameters<typeof instance.newContext>[0])=>{
      const context=await newContext({...options,serviceWorkers:"block"});
      await context.route("**/*",route=>new URL(route.request().url()).hostname==="127.0.0.1"?route.continue():route.abort());
      return context;
    });return instance;
  });
  browser=await chromium.launch({headless:true});
});
test.after(async()=>{await browser?.close();mock.restoreAll();});
async function fixture() {
  const root=await mkdtemp(join(tmpdir(),"certscore-late-geometry-fixture-"));
  const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:"block"});
  const page=await context.newPage(),url="https://late-geometry.test/",started=Date.now();
  await page.route("**/*",route=>route.request().url()===url?route.fulfill({contentType:"text/html",body:`<!doctype html><meta charset="utf-8">
    <style>body{margin:0;font:16px Arial}#cookie-banner{position:fixed;bottom:0;left:0;padding:24px;background:white}button{padding:12px;margin:4px}</style>
    <section id="cookie-banner" role="dialog"><p>We use cookies for analytics. Choose your cookie consent.</p><button>Accept all cookies</button><button>Cookie settings</button></section>
    <script>window.fixtureClicks=0;document.addEventListener('click',()=>window.fixtureClicks++)</script>`}):route.abort());
  await page.goto(url);
  const cdp=await context.newCDPSession(page),tree=await cdp.send("Page.getFrameTree");
  const identity={source:"cdp_loader_id" as const,token:tree.frameTree.frame.loaderId};
  let revision=0;page.on("framenavigated",()=>revision++);
  const path=join(root,"ConsentControlGeometryEvidence.json"),imagePath=join(root,"retained.png");
  await page.screenshot({path:imagePath});
  const screenshot:ScreenshotArtifact={artifactId:"retained",path:imagePath,url,documentIdentity:identity,
    capturedAtMs:Date.now()-started,consentStateAtTime:"pre_consent",pagePhase:"dom_content_loaded",captureMethod:"primary_viewport_fallback"};
  const oldGeometry=await captureConsentControlGeometry(page,{documentIdentity:identity,screenshotArtifactRef:imagePath,timeoutMs:900});
  await writeFile(path,JSON.stringify(oldGeometry));
  const typed=await readRapidFirstLayerConsentUiObservation(page,started,900);
  const afterTree=await cdp.send("Page.getFrameTree");assert.equal(afterTree.frameTree.frame.loaderId,identity.token);
  const observation=consentUiObservationSchema.parse({...typed,documentUrl:url,documentIdentity:identity});
  const stale=reconcileConsentUiObservationWithCompletedGeometry({current:observation,geometry:oldGeometry,
    geometryAccessLoaded:true,pageUrl:url,scanStartedAtMs:started,artifactPath:path});
  assert.ok(stale.observedAtMs>Date.parse(oldGeometry.capturedAt)-started);
  assert.equal(stale.inventoryOutcome,"complete_with_controls");
  assert.equal(isStableConsentProofPacket({geometryArtifactWritten:true,observation:stale,representativeScreenshotAvailable:true}),true);
  const limited=reconcileConsentGeometryInventoryCoverage({observation:stale,geometry:oldGeometry,scanStartedAtMs:started});
  assert.equal(isStableConsentProofPacket({geometryArtifactWritten:true,observation:limited,representativeScreenshotAvailable:true}),false);
  const assess=(o:typeof stale,g:typeof oldGeometry)=>{
    const bundle=canonicalEvidenceBundleSchema.parse({scanId:"late-geometry-fixture",url,normalizedUrl:url,
      startedAt:new Date(started).toISOString(),completedAt:new Date().toISOString(),
      scanProfile:{profileId:"consent",label:"CertScore.ai late geometry fixture",targetDurationMs:1500,internalBudgetMs:1500,enabledModules:[]},
      modulesRun:[],runtimeTimeline:[],networkEvents:[],cookieEvents:[],cookieSnapshots:[],storageSnapshots:[],scriptEvents:[],iframeEvents:[],
      consentUiObservations:[o],screenshots:[screenshot],normalizedVendorObservations:[],derivedRuntimeSignals:{},artifactRefs:[],scannerVersion:"local-fixture",schemaVersion:"2.0",
      domSnapshots:[{artifactId:"fixture-dom",capturedAtMs:observation.observedAtMs,documentIdentity:identity,path:"fixture-dom.html",url,consentStateAtTime:"pre_consent",pagePhase:"dom_content_loaded"}],
    });
    const assessment=deriveMaterializedConsentControlAssessment({bundle,consentControlGeometryEvidence:g as unknown as Record<string,unknown>,finalUrl:url,noGo:false});
    return {assessment,publicEvidence:projectPublicFirstLayerConsentEvidence(assessment,bundle.scanId)};
  };
  return {root,context,page,started,identity,oldGeometry,stale,limited,path,screenshot,assess,
    state:()=>({url:page.url(),documentIdentity:identity,frameRevision:revision,frames:page.frames()}),
    close:async()=>{await context.close();await rm(root,{recursive:true,force:true});}};
}

test("late-rendered Reject is captured once inside the approved refresh, retained and publicly observed",async()=>{
  const f=await fixture();try {
    const before=f.assess(f.limited,f.oldGeometry);assert.equal(before.assessment.controls.reject.state,"unknown");
    await f.page.evaluate(()=>{const button=document.createElement("button");button.textContent="Reject all cookies";document.querySelector("#cookie-banner")!.append(button);});
    let captures=0;
    const refresh=createFinalConsentGeometryRefresh({scanStartedAtMs:f.started,moduleDeadlineAtMs:Date.now()+3000,readState:f.state,
      capture:options=>{captures++;return captureConsentControlGeometry(f.page,{...options,avoidOverlappingFrameReads:true});},
      prepare:geometry=>prepareFinalConsentGeometryArtifact(f.path,geometry)});
    const result=await refresh({observation:f.stale,geometry:f.oldGeometry,screenshot:f.screenshot});
    assert.equal(result.outcome,"retained",JSON.stringify(result));assert.ok(result.elapsedMs<1500);assert.equal(captures,1);
    const retained=JSON.parse(await readFile(f.path,"utf8"));assert.equal(retained.capturedAt,result.geometry!.capturedAt);
    const observation=finalizeBoundedSameSessionConsentPacket({current:f.stale,recoveryInventory:f.stale,geometry:result.geometry!,
      artifactPath:result.artifactPath!,pageUrl:f.page.url(),scanStartedAtMs:f.started});
    const after=f.assess(observation,result.geometry!);
    assert.equal(after.assessment.controls.reject.state,"observed");assert.equal(after.publicEvidence?.rejectControlObserved,true);
    assert.equal(after.assessment.controls.accept.state,"observed");
    assert.equal(isStableConsentProofPacket({geometryArtifactWritten:true,observation,representativeScreenshotAvailable:true}),true);
    assert.equal((await refresh({observation:f.stale,geometry:f.oldGeometry,screenshot:f.screenshot})).outcome,"already_considered");
    assert.equal(await f.page.evaluate(()=>(window as unknown as {fixtureClicks:number}).fixtureClicks),0);
    if(process.env.CERTSCORE_FINAL_GEOMETRY_REFRESH_OUT){const out=process.env.CERTSCORE_FINAL_GEOMETRY_REFRESH_OUT;
      await import("node:fs/promises").then(fs=>fs.mkdir(out,{recursive:true}));
      await writeFile(join(out,"late-reject-browser.json"),JSON.stringify({scope:"Owned controlled browser fixture, not a public scan",elapsedMs:result.elapsedMs,captures,
        beforeReject:before.assessment.controls.reject.state,afterReject:after.assessment.controls.reject.state,publicReject:after.publicEvidence?.rejectControlObserved,
        oldCapturedAt:f.oldGeometry.capturedAt,newCapturedAt:result.geometry!.capturedAt,geometry:result.geometry,assessment:after.assessment},null,2)+"\n",{flag:"wx"});}
  }finally{await f.close();}
});

test("a same-URL document reload while staging cannot replace the earlier geometry or clear its limit",async()=>{
  const f=await fixture();try {
    const original=await readFile(f.path,"utf8");let committed=0;
    const refresh=createFinalConsentGeometryRefresh({scanStartedAtMs:f.started,moduleDeadlineAtMs:Date.now()+3000,readState:f.state,
      capture:options=>captureConsentControlGeometry(f.page,options),prepare:async geometry=>{
        const prepared=await prepareFinalConsentGeometryArtifact(f.path,geometry);await f.page.reload();
        return {...prepared,commitIfCurrent:current=>{const path=prepared.commitIfCurrent(current);if(path)committed++;return path;}};
      }});
    const result=await refresh({observation:f.stale,geometry:f.oldGeometry,screenshot:f.screenshot});
    assert.equal(result.outcome,"document_changed");assert.equal(committed,0);assert.equal(await readFile(f.path,"utf8"),original);
    assert.equal(f.limited.inventoryOutcome,"partial");
  }finally{await f.close();}
});

test("scanner final scheduling refreshes stale proof once without entering legacy recovery or taking another screenshot",async()=>{
  const root=await mkdtemp(join(tmpdir(),"certscore-final-refresh-scanner-"));
  const server=createServer((_request,response)=>{response.setHeader("content-type","text/html");response.end(`<!doctype html><meta charset="utf-8">
    <style>body{margin:0}#cookie-banner{position:fixed;bottom:0;left:0;background:white;padding:24px}button{padding:12px}</style>
    <section id="cookie-banner" role="dialog"><p>We use cookies for analytics. Choose your cookie consent.</p>
    <button>Accept all cookies</button><button>Cookie settings</button></section><script>window.OneTrust={}</script>`);});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();assert.ok(address&&typeof address!=="string");
  const url=`http://127.0.0.1:${address.port}/`;
  try {
    const scanStartedAtMs=Date.now();
    const result=await preConsentRuntimeScanner({url,normalizedUrl:url,scanStartedAtMs,internalBudgetMs:15000,
      artifactWriter:await createArtifactWriter(root),captureScope:"consent_proof",screenshotCaptureMode:"viewport_first",screenshotMode:"always",waitMode:"fast"});
    assert.equal(result.moduleRun.status,"completed",result.moduleRun.errors.join("; "));
    const timings=result.moduleRun.timingBreakdown??[];
    const refresh=timings.filter(t=>t.label==="final consent geometry refresh");
    assert.equal(refresh.length,1);assert.match(refresh[0]!.detail??"",/outcome=retained/);assert.ok(refresh[0]!.durationMs<1500);
    assert.equal(timings.some(t=>t.label.startsWith("bounded same-session consent packet")),false);
    assert.equal(timings.some(t=>t.label==="late consent control screenshot"),false);
    const geometry=JSON.parse(await readFile(join(root,"ConsentControlGeometryEvidence.json"),"utf8"));
    const observation=result.consentUiObservations.at(-1)!;
    assert.equal(observation.captureDiagnostic?.outcome, "retained");
    assert.equal(observation.captureDiagnostic.attempted, true);
    assert.equal(observation.captureDiagnostic.documentToken, observation.documentIdentity?.token);
    assert.equal(observation.captureDiagnostic.inventoryObservedAtMs, observation.observedAtMs);
    assert.ok(observation.captureDiagnostic.geometryMinusInventoryMs! >= 0);
    assert.ok(Date.parse(geometry.capturedAt)>=scanStartedAtMs+observation.observedAtMs);
    assert.ok(observation.captureDiagnostics?.completedChannels.includes("geometry"));
    assert.equal(geometry.refresh.policyVersion,"final_consent_geometry_refresh.v3");
    assert.equal(geometry.refresh.accessSource,"previous_same_loader_geometry_access");
    if(process.env.CERTSCORE_FINAL_GEOMETRY_REFRESH_OUT)await writeFile(join(process.env.CERTSCORE_FINAL_GEOMETRY_REFRESH_OUT,"scanner-final-refresh.json"),
      JSON.stringify({scope:"Owned loopback fixture only",refresh:refresh[0],observation,geometry,timings},null,2)+"\n",{flag:"wx"});
  }finally {await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});

for (const semanticPartial of [false, true]) test(`scanner substitutes one geometry-only read after two owned child-frame failures; semantic partial=${semanticPartial}`,async t=>{
  const root=await mkdtemp(join(tmpdir(),"certscore-frame-refresh-scanner-"));
  let epochs=0;const failedFrames=new Set<Frame>();
  let releasePending: (() => void) | undefined;
  let initialReadiness: string | undefined;
  const launch=chromium.launch.bind(chromium);
  t.mock.method(chromium,"launch",async (options:Parameters<typeof chromium.launch>[0])=>{
    const b=await launch(options),newContext=b.newContext.bind(b);
    t.mock.method(b,"newContext",async (options:Parameters<typeof b.newContext>[0])=>{
      const context=await newContext(options),newPage=context.newPage.bind(context);
      t.mock.method(context,"newPage",async()=>{
        const page=await newPage(),wrapped=new Set<Frame>();
        const wrap=(frame:Frame)=>{if(wrapped.has(frame))return;wrapped.add(frame);const evaluate=frame.evaluate.bind(frame);
          frame.evaluate=(async(...args:Parameters<typeof frame.evaluate>)=>{
            if(typeof args[0]==="function"&&args[0].name==="collectConsentGeometryInPage"){
              if(frame===page.mainFrame()) {
                epochs++;
                if (semanticPartial && epochs === 1) initialReadiness = await page.evaluate(() => document.readyState);
                if (semanticPartial && epochs === 3) {releasePending?.(); await page.waitForLoadState("load", {timeout: 500});}
              }
              else if((epochs===1&&failedFrames.size<2)||(semanticPartial&&epochs===2&&failedFrames.has(frame))){failedFrames.add(frame);throw Error("Owned initial geometry frame unavailable");}
            }
            return (evaluate as (...a:unknown[])=>Promise<unknown>)(...args);
          }) as typeof frame.evaluate;
        };
        wrap(page.mainFrame());page.on("frameattached",wrap);return page;
      });return context;
    });return b;
  });
  const server=createServer((request,response)=>{
    if (request.url === "/pending.svg") {response.setHeader("content-type", "image/svg+xml"); releasePending = () => {if (!response.writableEnded && !response.destroyed) response.end('<svg xmlns="http://www.w3.org/2000/svg"/>');}; return;}
    response.setHeader("content-type","text/html");response.end(`<!doctype html><meta charset="utf-8">
    <style>body{margin:0}#cookie-banner{position:fixed;bottom:0;left:0;background:white;padding:24px;z-index:10}button{padding:12px}</style>
    <section id="cookie-banner" role="dialog"><p>We use cookies for analytics. Choose your cookie consent.</p>
    ${semanticPartial ? '<a href="#privacy">Your Privacy Choices</a><button aria-label="dismiss cookie message">OK</button>' : '<button>Accept all cookies</button><button>Cookie settings</button>'}</section>${'<iframe srcdoc="<p>Owned child</p>"></iframe>'.repeat(11)}${semanticPartial ? '<img src="/pending.svg">' : ''}<script>window.OneTrust={}</script>`);});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();assert.ok(address&&typeof address!=="string");
  try{
    const scanStartedAtMs=Date.now(),url=`http://127.0.0.1:${address.port}/`;
    const result=await preConsentRuntimeScanner({url,normalizedUrl:url,scanStartedAtMs,internalBudgetMs:15000,
      artifactWriter:await createArtifactWriter(root),captureScope:"consent_proof",screenshotCaptureMode:"viewport_first",screenshotMode:"always",waitMode:"fast"});
    assert.equal(result.moduleRun.status,"completed",result.moduleRun.errors.join("; "));
    assert.equal(failedFrames.size,2);assert.equal(epochs,semanticPartial ? 3 : 2,
      "Exactly one final substitution after existing initial reads (early plus paired-settled geometry for the partial case), with no retry.");
    const timings=result.moduleRun.timingBreakdown??[],refresh=timings.filter(t=>t.label==="final consent geometry refresh");
    assert.equal(refresh.length,1);assert.match(refresh[0]!.detail??"",/outcome=retained/);assert.ok(refresh[0]!.durationMs<1500);
    assert.equal(timings.some(t=>t.label.startsWith("bounded same-session consent packet")),false);
    assert.equal(timings.some(t=>t.label==="late consent control screenshot"),false);
    const geometry=JSON.parse(await readFile(join(root,"ConsentControlGeometryEvidence.json"),"utf8"));
    assert.equal(geometry.controlInspection.structuralCoverage,"complete");assert.equal(geometry.controlInspection.captureCoverage.capturedFrameCount,12);
    assert.equal(geometry.controlInspection.captureCoverage.frameCount,12);assert.equal(geometry.refresh.policyVersion,"final_consent_geometry_refresh.v3");
    if (semanticPartial) {
      assert.equal(initialReadiness, "interactive");
      const observation = result.consentUiObservations.at(-1)!;
      assert.equal(observation.inventoryOutcome, "partial", "Complete fresh structure does not resolve ambiguous acknowledgment intent.");
      const bundle = canonicalEvidenceBundleSchema.parse({scanId:"owned-partial-frame-refresh",url,normalizedUrl:url,
        startedAt:new Date(scanStartedAtMs).toISOString(),completedAt:new Date().toISOString(),scanProfile:{profileId:"consent",label:"CertScore.ai owned partial-frame fixture",targetDurationMs:15000,internalBudgetMs:15000,enabledModules:[]},
        modulesRun:[result.moduleRun],runtimeTimeline:[],networkEvents:[],cookieEvents:[],cookieSnapshots:[],storageSnapshots:[],scriptEvents:[],iframeEvents:[],consentUiObservations:result.consentUiObservations,
        screenshots:result.screenshots,domSnapshots:result.domSnapshots,normalizedVendorObservations:[],derivedRuntimeSignals:{},artifactRefs:result.artifactRefs,scannerVersion:"owned-fixture",schemaVersion:"2.0"});
      const assessment = deriveMaterializedConsentControlAssessment({bundle,consentControlGeometryEvidence:geometry,finalUrl:url,noGo:false});
      assert.deepEqual(assessment.coverage.captureDiagnostic, observation.captureDiagnostic);
      assert.equal(assessment.coverage.captureDiagnostic?.outcome, "retained");
      assert.equal(assessment.controls.reject.state, "unknown");
      assert.equal(projectPublicFirstLayerConsentEvidence(assessment,bundle.scanId)?.rejectControlObserved, null);
    }
    if(process.env.CERTSCORE_FINAL_GEOMETRY_REFRESH_OUT)await writeFile(join(process.env.CERTSCORE_FINAL_GEOMETRY_REFRESH_OUT,semanticPartial ? "scanner-partial-frame-refresh.json" : "scanner-frame-refresh.json"),JSON.stringify({scope:"Owned 12-frame scanner fixture, two injected initial read failures; not original AE frame replay",semanticPartial,initialReadiness,epochs,failedFrames:failedFrames.size,refresh:refresh[0],geometry,timings},null,2)+"\n",{flag:"wx"});
  }finally{releasePending?.();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});

test("late CMP frame outranks query-only hints while omitted frames keep absence unproved", async () => {
  const f = await fixture();
  try {
    const cmpUrl = "https://fundingchoicesmessages.google.com/fixture";
    await f.page.route("https://frame-decoy.test/**", route => route.fulfill({
      contentType: "text/html", body: "<!doctype html><p>Unrelated content</p>",
    }));
    await f.page.route(cmpUrl, route => route.fulfill({contentType: "text/html", body: `
      <!doctype html><section id="fundingchoices-notice" role="dialog">
      <p>We use cookies for analytics. Choose your cookie consent.</p>
      <button>Reject all cookies</button></section>`}));
    await f.page.evaluate(url => {
      for (let i = 0; i < 14; i++) {
        const iframe = document.createElement("iframe");
        iframe.src = `https://frame-decoy.test/${i}?reference=googlefc`;
        iframe.style.display = "none";
        document.body.append(iframe);
      }
      const cmp = document.createElement("iframe");
      cmp.src = url;
      cmp.style.cssText = "position:fixed;top:20px;left:20px;width:480px;height:210px;z-index:99";
      document.body.append(cmp);
    }, cmpUrl);
    await f.page.frameLocator(`iframe[src="${cmpUrl}"]`).getByRole("button", {name: "Reject all cookies"}).waitFor();
    const cmpFrame = f.page.frame({url: cmpUrl});
    assert.ok(cmpFrame);
    const captured = await captureConsentControlGeometry(f.page, {
      documentIdentity: f.identity, screenshotArtifactRef: f.screenshot.path, timeoutMs: 1100,
    });
    assert.equal(captured.controlInspection?.captureCoverage.frameCount, 16);
    assert.equal(captured.controlInspection?.captureCoverage.capturedFrameCount, 12);
    assert.equal(captured.controlInspection?.structuralCoverage, "limited");
    assert.ok(captured.candidates.some(candidate => candidate.label === "Reject all cookies"));
    const limited = f.assess(f.limited, captured).assessment;
    assert.equal(limited.controls.reject.state, "observed");
    const childButton = cmpFrame.getByRole("button", {name: "Reject all cookies"});
    await childButton.evaluate(button => button.remove());
    const withoutReject = await captureConsentControlGeometry(f.page, {
      documentIdentity: f.identity, screenshotArtifactRef: f.screenshot.path, timeoutMs: 1100,
    });
    assert.equal(withoutReject.controlInspection?.structuralCoverage, "limited");
    assert.equal(f.assess(f.limited, withoutReject).assessment.controls.reject.state, "unknown");

    await f.page.locator("#cookie-banner button").evaluateAll(buttons => buttons.forEach(button => button.remove()));
    const prior = await captureConsentControlGeometry(f.page, {
      documentIdentity: f.identity, screenshotArtifactRef: f.screenshot.path, timeoutMs: 1100,
    });
    const observation = consentUiObservationSchema.parse({
      ...f.stale, observedAtMs: Date.parse(prior.capturedAt) - f.started + 1, controls: [],
    });
    await f.page.screenshot({path: f.screenshot.path});
    const screenshot = {...f.screenshot, capturedAtMs: Date.now() - f.started};
    const refresh = () => createFinalConsentGeometryRefresh({
      scanStartedAtMs: f.started, moduleDeadlineAtMs: Date.now() + 3000, readState: f.state,
      allowLimitedPositiveRefresh: true,
      capture: options => captureConsentControlGeometry(f.page, options),
      prepare: geometry => prepareFinalConsentGeometryArtifact(f.path, geometry),
    })({observation, geometry: prior, screenshot});
    const previousBytes = await readFile(f.path);
    const empty = await refresh();
    assert.equal(empty.outcome, "no_positive_control");
    assert.deepEqual(await readFile(f.path), previousBytes);

    await cmpFrame.locator("section").evaluate(section => {
      const button = document.createElement("button");
      button.textContent = "Reject all cookies";
      section.append(button);
    });
    const positive = await refresh();
    assert.equal(positive.outcome, "retained");
    assert.equal(positive.limitedPositiveOnly, true);
    const partial = reconcileConsentGeometryInventoryCoverage({observation, geometry: prior, scanStartedAtMs: f.started});
    const assessed = f.assess(partial, positive.geometry!).assessment;
    assert.equal(assessed.controls.reject.state, "observed");
    assert.equal(assessed.controls.accept.state, "unknown");
    assert.equal(assessed.controls.options.state, "unknown");
  } finally {
    await f.close();
  }
});
