import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,mkdir,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {chromium,type Browser} from "playwright";
import {canonicalEvidenceBundleSchema,consentUiObservationSchema,type ScreenshotArtifact} from "@certscore/contracts";
import {captureConsentControlGeometry} from "../../../../packages/certscore-scan-core/src/consent-control-geometry";
import {createFinalConsentGeometryRefresh,prepareFinalConsentGeometryArtifact} from "../../../../packages/certscore-scan-core/src/consent-final-geometry-refresh";
import {readRapidFirstLayerConsentUiObservation,reconcileConsentUiObservationWithCompletedGeometry,finalizeBoundedSameSessionConsentPacket} from "../../../../packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner";
import {deriveMaterializedConsentControlAssessment} from "./consent-control-assessment-projector";
import {projectPublicFirstLayerConsentEvidence} from "../../lib/scans/public-first-layer-consent-evidence";
import fixtures from "../../../../packages/certscore-scan-core/src/test-fixtures/retained-final-geometry-recovery.json";

let browser:Browser;const results:unknown[]=[];
const escape=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
test.before(async()=>{browser=await chromium.launch({headless:true});});
test.after(async()=>{await browser?.close();if(process.env.CERTSCORE_GEOMETRY_RECOVERY_OUT){const out=process.env.CERTSCORE_GEOMETRY_RECOVERY_OUT;await mkdir(out,{recursive:true});await writeFile(join(out,"recovery-browser-results.json"),JSON.stringify({scope:"Owned controlled fixtures, not historical layouts, original frame replay or current public scans",results},null,2)+"\n",{flag:"wx"});}});

async function fixture(source:typeof fixtures[number]){
 const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:"block"}),page=await context.newPage(),root=await mkdtemp(join(tmpdir(),"certscore-geometry-recovery-")),url="https://recovery-fixture.test/";
 const ae=source.site==="ae.com";let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
 const started=Date.now();
 try{
  const controls=source.controls.map(c=>`<button ${c.ariaLabel?`aria-label="${escape(c.ariaLabel)}"`:""} ${c.role?`role="${escape(c.role)}"`:""}>${escape(c.label)}</button>`).join("");
  await page.route("**/*",async route=>{
   if(route.request().url()===url)return route.fulfill({contentType:"text/html",body:`<!doctype html><meta charset="utf-8"><style>body{margin:0;font:16px Arial}#cookie-banner{position:fixed;bottom:0;left:0;right:0;padding:20px;background:white;z-index:10}p{max-height:150px;overflow:hidden}button{padding:10px}</style><section id="cookie-banner" role="dialog"><p>${escape(source.context)}</p>${controls}</section>${Array.from({length:source.retainedCoverage.frameCount-1},()=>'<iframe srcdoc="<p>Owned child</p>"></iframe>').join("")}${ae?'<img src="/pending.svg">':""}<script>window.fixtureClicks=0;document.addEventListener('click',()=>window.fixtureClicks++)</script>`});
   if(ae&&route.request().url()===url+"pending.svg"){await pending;return route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg"/>'});}return route.abort();
  });
  await page.goto(url,{waitUntil:ae?"domcontentloaded":"load"});
  await page.waitForFunction(()=>Array.from(document.querySelectorAll("iframe")).every(f=>f.contentDocument?.readyState==="complete"));
  assert.equal(page.frames().length,source.retainedCoverage.frameCount);
  const cdp=await context.newCDPSession(page),tree=await cdp.send("Page.getFrameTree"),identity={source:"cdp_loader_id" as const,token:tree.frameTree.frame.loaderId};
  let revision=0;page.on("framenavigated",()=>revision++);
  const imagePath=join(root,"retained.png"),pixels=await cdp.send("Page.captureScreenshot",{format:"png",fromSurface:true,captureBeyondViewport:false});await writeFile(imagePath,Buffer.from(pixels.data,"base64"));
  const image:ScreenshotArtifact={artifactId:"retained",path:imagePath,url,documentIdentity:identity,capturedAtMs:Date.now()-started,captureMethod:"primary_viewport_fallback",consentStateAtTime:"pre_consent",pagePhase:"dom_content_loaded"};
  let observation=ae?await readRapidFirstLayerConsentUiObservation(page,started,900):undefined;
  const failed=ae?page.frames().filter(f=>f!==page.mainFrame()).slice(0,2):[];
  const originalEvaluators=failed.map(f=>f.evaluate.bind(f));
  for(const [i,f] of failed.entries())f.evaluate=(async()=>{if(i===0)await f.goto("about:blank");throw Error("Owned unavailable child");}) as typeof f.evaluate;
  const old=await captureConsentControlGeometry(page,{documentIdentity:identity,screenshotArtifactRef:imagePath,timeoutMs:900});
  for(const [i,f] of failed.entries())f.evaluate=originalEvaluators[i]!;
  if(ae){assert.equal(old.controlInspection?.captureCoverage?.capturedFrameCount,10);assert.equal(old.controlInspection?.captureCoverage?.documentAndFramesStable,false);assert.equal(old.controlInspection?.captureCoverage?.documentReadyState,"interactive");release();await page.waitForLoadState("load");}
  else observation=await readRapidFirstLayerConsentUiObservation(page,started,900);
  observation=consentUiObservationSchema.parse({...observation,documentUrl:url,documentIdentity:identity,
   ...(source.site==="routenote.com"?{inventoryOutcome:"partial",basis:[...observation!.basis,"inventory:bounded_semantic_partial_channels","unresolved_visible_consent_decision"]}:{}),
   ...(ae?{inventoryOutcome:"complete_with_controls"}:{}),
  });
  const path=join(root,"ConsentControlGeometryEvidence.json");await writeFile(path,JSON.stringify(old));
  const paired=ae?observation:reconcileConsentUiObservationWithCompletedGeometry({current:observation,geometry:old,geometryAccessLoaded:true,pageUrl:url,scanStartedAtMs:started,artifactPath:path});
  // Preserve the retained latest typed outcome for this scheduling fixture.
  // Geometry ambiguity is retained independently and rechecked after refresh.
  const current=consentUiObservationSchema.parse({...paired,inventoryOutcome:source.latestTypedInventoryOutcome});
  assert.equal(current.boundedSameSessionRecoveryOutcome,undefined,"Fixture represents the final gate before legacy recovery; no previous attempt may be retried.");
  return {source,context,page,root,url,started,identity,image,path,old,current,release,
   state:()=>({url:page.url(),documentIdentity:identity,frameRevision:revision,frames:page.frames()}),
   close:async()=>{release();await context.close();await rm(root,{recursive:true,force:true});}};
 }catch(error){release();await context.close();await rm(root,{recursive:true,force:true});throw error;}
}

for(const source of fixtures)test(`${source.site}: one current geometry read repairs only structural freshness and preserves unknown Reject`,async()=>{
 const f=await fixture(source);try{
  const original=await readFile(f.path,"utf8");let reads=0;
  const refresh=createFinalConsentGeometryRefresh({scanStartedAtMs:f.started,moduleDeadlineAtMs:Date.now()+3000,readState:f.state,
   capture:options=>{reads++;return captureConsentControlGeometry(f.page,{...options,avoidOverlappingFrameReads:true,readFrameRevision:()=>f.state().frameRevision});},prepare:g=>prepareFinalConsentGeometryArtifact(f.path,g)});
  const result=await refresh({observation:f.current,geometry:f.old,screenshot:f.image});
  results.push({site:source.site,scenario:"before-legacy-recovery",outcome:result.outcome,reads,elapsedMs:result.elapsedMs,sourceGeometry:source.sources.find(s=>s.kind==="ConsentControlGeometryEvidence.json"),originalCoverage:f.old.controlInspection?.captureCoverage,originalInventoryOutcome:f.current.inventoryOutcome,originalDocumentReadyState:f.current.documentReadyState,freshCoverage:result.geometry?.controlInspection?.captureCoverage});
  assert.equal(result.outcome,"retained",JSON.stringify(result));assert.equal(reads,1);assert.ok(result.elapsedMs<1500);
  assert.equal(result.geometry!.controlInspection?.structuralCoverage,"complete");assert.equal(result.geometry!.controlInspection?.captureCoverage?.capturedFrameCount,source.retainedCoverage.frameCount);
  assert.notEqual(await readFile(f.path,"utf8"),original);assert.ok(Date.parse(result.geometry!.capturedAt)>=f.started+f.current.observedAtMs);
  const merged=finalizeBoundedSameSessionConsentPacket({current:f.current,recoveryInventory:f.current,geometry:result.geometry!,artifactPath:result.artifactPath!,pageUrl:f.url,scanStartedAtMs:f.started});
  const bundle=canonicalEvidenceBundleSchema.parse({scanId:`fixture-${source.site}`,url:f.url,normalizedUrl:f.url,startedAt:new Date(f.started).toISOString(),completedAt:new Date().toISOString(),
   scanProfile:{profileId:"consent",label:"CertScore.ai final geometry recovery fixture",targetDurationMs:1500,internalBudgetMs:1500,enabledModules:[]},modulesRun:[],runtimeTimeline:[],networkEvents:[],cookieEvents:[],cookieSnapshots:[],storageSnapshots:[],scriptEvents:[],iframeEvents:[],consentUiObservations:[merged],screenshots:[f.image],normalizedVendorObservations:[],derivedRuntimeSignals:{},artifactRefs:[],scannerVersion:"owned-fixture",schemaVersion:"2.0",domSnapshots:[{artifactId:"fixture-dom",capturedAtMs:f.current.observedAtMs,documentIdentity:f.identity,path:"fixture-dom.html",url:f.url,consentStateAtTime:"pre_consent",pagePhase:"dom_content_loaded"}]});
  const assessment=deriveMaterializedConsentControlAssessment({bundle,consentControlGeometryEvidence:result.geometry! as unknown as Record<string,unknown>,finalUrl:f.url,noGo:false});
  const publicEvidence=projectPublicFirstLayerConsentEvidence(assessment,bundle.scanId);
  assert.equal(merged.inventoryOutcome,"partial","Fresh structure cannot resolve ambiguous acknowledgment intent.");
  assert.equal(assessment.controls.reject.state,"unknown");assert.equal(publicEvidence?.rejectControlObserved,null);assert.equal(assessment.controls.accept.state,"unknown");
  if(source.site!=="airandspaceforces.com")assert.equal(assessment.controls.privacyOptOut.state,"observed");
  assert.equal((await refresh({observation:f.current,geometry:f.old,screenshot:f.image})).outcome,"already_considered");assert.equal(reads,1);
  assert.equal(await f.page.evaluate(()=>(window as unknown as {fixtureClicks:number}).fixtureClicks),0);
  results.push({site:source.site,scenario:"fresh-proof",geometry:result.geometry,observation:merged,assessment,publicEvidence,reads,elapsedMs:result.elapsedMs});
 }finally{await f.close();}
});

test("AE-shaped missing fresh frame and a thirteenth current frame cannot replace old evidence or acquire a retry",async()=>{
 for(const mode of ["missing_fresh_frame","over_cap"]){
  const f=await fixture(fixtures.find(x=>x.site==="ae.com")!);try{
   const original=await readFile(f.path,"utf8");let reads=0;
   if(mode==="over_cap")await f.page.evaluate(()=>{const frame=document.createElement("iframe");frame.srcdoc="<p>Owned thirteenth frame</p>";document.body.append(frame);});
   const refresh=createFinalConsentGeometryRefresh({scanStartedAtMs:f.started,moduleDeadlineAtMs:Date.now()+3000,readState:f.state,
    capture:async options=>{reads++;const child=f.page.frames().find(x=>x!==f.page.mainFrame())!,evaluate=child.evaluate.bind(child);
     child.evaluate=(async()=>{throw Error("Owned still-unavailable frame");}) as typeof child.evaluate;
     try{return await captureConsentControlGeometry(f.page,options);}finally{child.evaluate=evaluate;}},
    prepare:g=>prepareFinalConsentGeometryArtifact(f.path,g)});
   const result=await refresh({observation:f.current,geometry:f.old,screenshot:f.image});
   assert.equal(result.outcome,mode==="over_cap"?"ineligible":"invalid_capture");assert.equal(reads,mode==="over_cap"?0:1);
   assert.equal(await readFile(f.path,"utf8"),original);
   assert.equal((await refresh({observation:f.current,geometry:f.old,screenshot:f.image})).outcome,"already_considered");
   assert.equal(reads,mode==="over_cap"?0:1);assert.equal(f.current.documentReadyState,"interactive");
   results.push({site:"ae.com",scenario:mode,outcome:result.outcome,reads,originalArtifactPreserved:true});
  }finally{await f.close();}
 }
});
