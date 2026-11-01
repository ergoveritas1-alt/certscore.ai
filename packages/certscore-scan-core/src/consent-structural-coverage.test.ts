import assert from "node:assert/strict";
import test from "node:test";
import {writeFile,mkdir} from "node:fs/promises";
import {join} from "node:path";
import {chromium,type Browser,type Page} from "playwright";
import {isControlInspectionComplete} from "@certscore/contracts";
import {captureConsentControlGeometry} from "./consent-control-geometry";
import {createFinalConsentGeometryRefresh,prepareFinalConsentGeometryArtifact} from "./consent-final-geometry-refresh";
import {finalizeBoundedSameSessionConsentPacket} from "./scanners/pre-consent-runtime-scanner";
import retained from "./test-fixtures/retained-structural-coverage.json";
import {readinessFixture} from "./test-fixtures/structural-browser";

let browser:Browser;
const results:unknown[]=[];
const escape=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
test.before(async()=>{browser=await chromium.launch({headless:true});});
test.after(async()=>{await browser?.close();if(process.env.CERTSCORE_STRUCTURAL_OUT){await mkdir(process.env.CERTSCORE_STRUCTURAL_OUT,{recursive:true});await writeFile(join(process.env.CERTSCORE_STRUCTURAL_OUT,"structural-browser-results.json"),JSON.stringify({scope:"Controlled owned fixtures; not historical rematerialization or current public site scans",results},null,2)+"\n",{flag:"wx"});}});
async function pageFor(body:string) {
 const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:"block"}),page=await context.newPage(),url="https://structural-fixture.test/";
 await page.route("**/*",route=>route.request().url()===url?route.fulfill({contentType:"text/html",body:`<!doctype html><meta charset="utf-8"><style>body{margin:0;font:16px Arial}button,a[role=button]{display:inline-block;padding:10px}</style>${body}<script>window.fixtureClicks=0;document.addEventListener('click',()=>window.fixtureClicks++)</script>`}):route.abort());
 await page.goto(url);
 const client=await context.newCDPSession(page),tree=await client.send("Page.getFrameTree");
 const identity={source:"cdp_loader_id" as const,token:tree.frameTree.frame.loaderId};
 return {context,page,url,identity};
}
async function assertNoClicks(page:Page){assert.equal(await page.evaluate(()=>(window as unknown as {fixtureClicks:number}).fixtureClicks),0);}

test("Relution-shaped nested wrappers do not displace an independent visible consent region",async()=>{
 const source=retained.find(x=>x.site==="relution.io")!;
 const wrapped=Array.from({length:18},(_,i)=>`<div class="cmp-wrapper" id="cmp-nested-${i}">`).join("")+`<span>Funktion</span>`+"</div>".repeat(18);
 const f=await pageFor(`<section id="cmpbox" role="dialog" style="position:fixed;top:20px;left:20px;width:650px;background:white;padding:20px"><p>${escape(source.context)}</p>${wrapped}<div id="cmpwelcomebtnyes"><a role="button" href="#">Okay</a></div></section>
  <div id="cmpboxrecall" style="position:fixed;bottom:20px;left:20px;padding:12px;background:white"><a role="button" href="#">Privacy settings</a></div>`);
 try{const g=await captureConsentControlGeometry(f.page,{documentIdentity:f.identity,timeoutMs:900});
  results.push({site:source.site,scenario:"nested-region-native-capture",geometry:g});
  assert.ok(g.containers.length<=12);assert.ok(g.candidates.length<=48);
  assert.equal(g.controlInspection?.captureCoverage?.inventoryTruncated,false);
  assert.equal(g.controlInspection?.structuralCoverage,"complete");
  assert.ok(g.containers.some(c=>c.id==="cmpboxrecall"));
  const okay=g.candidates.find(c=>c.label==="Okay");assert.equal(okay?.actionType,"other");assert.equal(okay?.consentContextConfirmed,true);
  assert.equal(isControlInspectionComplete(g.controlInspection!,"reject"),false,"Complete structure cannot resolve the ambiguous Okay decision.");
  await assertNoClicks(f.page);results.push({site:source.site,scenario:"nested-region-priority",geometry:g,publicRejectRecoveryClaim:false});
 }finally{await f.context.close();}
});

test("independent region and actual control overflow remain limited under the same caps",async()=>{
 for(const kind of ["regions","controls"]){
  const html=kind==="regions"?Array.from({length:13},(_,i)=>`<section id="cookie-region-${i}" style="position:fixed;top:${i*50}px;left:20px;width:600px;height:45px"><p>Cookie consent</p><button>Accept all</button></section>`).join(""):
   `<section id="cookie-banner" role="dialog" style="position:fixed;inset:0;display:flex;flex-wrap:wrap;align-content:start"><p>We use cookies.</p>${Array.from({length:60},(_,i)=>`<button style="width:130px;height:40px">Reject all ${i}</button>`).join("")}</section>`;
  const f=await pageFor(html);try{const g=await captureConsentControlGeometry(f.page,{documentIdentity:f.identity,timeoutMs:900});
   assert.ok(g.containers.length<=12);assert.ok(g.candidates.length<=48);assert.equal(g.controlInspection?.structuralCoverage,"limited",kind);assert.equal(g.controlInspection?.captureCoverage?.inventoryTruncated,true,kind);await assertNoClicks(f.page);
  }finally{await f.context.close();}
 }
});


for(const site of ["ab.pl","portaldecompraspublicas.com.br"] as const)test(`${site}: a completed ready DOM channel reuses the existing one-refresh budget without resolving unknown intent`,async()=>{
 const f=await readinessFixture(browser,site);try{
  assert.equal(f.stale.documentReadyState,"complete");assert.ok(f.stale.captureDiagnostics?.completedChannels.includes("dom_inventory"));
  let reads=0;const refresh=createFinalConsentGeometryRefresh({scanStartedAtMs:f.started,moduleDeadlineAtMs:Date.now()+3000,
   readState:()=>({url:f.page.url(),documentIdentity:f.identity,frameRevision:0,frames:f.page.frames()}),
   capture:options=>{reads++;return captureConsentControlGeometry(f.page,options);},prepare:geometry=>prepareFinalConsentGeometryArtifact(f.path,geometry)});
  const result=await refresh({observation:f.stale,geometry:f.old,screenshot:f.image});
  results.push({site,scenario:"readiness-admission",outcome:result.outcome,attempted:result.attempted,inventoryOutcome:f.stale.inventoryOutcome,oldCoverage:f.old.controlInspection?.captureCoverage,freshCoverage:result.geometry?.controlInspection?.captureCoverage});
  assert.equal(result.outcome,"retained",JSON.stringify({result,inventory:f.stale.inventoryOutcome,basis:f.stale.basis}));assert.equal(reads,1);assert.ok(result.elapsedMs<1500);
  assert.equal(result.geometry!.controlInspection?.structuralCoverage,"complete");
  const merged=finalizeBoundedSameSessionConsentPacket({current:f.stale,recoveryInventory:f.stale,geometry:result.geometry!,artifactPath:result.artifactPath!,pageUrl:f.url,scanStartedAtMs:f.started});
  assert.equal(merged.rejectControlObserved,false,"Options and sale/sharing wording cannot create a Reject observation.");
  if(site==="ab.pl")assert.equal(isControlInspectionComplete(result.geometry!.controlInspection!,"options"),false);
  await assertNoClicks(f.page);results.push({site,scenario:"interactive-to-ready",previousOutcome:f.stale.inventoryOutcome,oldCoverage:f.old.controlInspection?.captureCoverage,
    refreshedCoverage:result.geometry!.controlInspection?.captureCoverage,elapsedMs:result.elapsedMs,reads,geometry:result.geometry,observation:merged});
 }finally{await f.close();}
});

test("Niedziela-shaped failed frame and Pure Xbox-shaped frame churn remain limited until a fresh stable read",async()=>{
 for(const kind of ["failed-frame","frame-churn"]){
  const childCount=kind==="failed-frame"?11:6;
  const f=await pageFor('<section id="cookie-banner" role="dialog" style="position:fixed;top:0;left:0;background:white;padding:20px"><p>We use cookies.</p><button>Accept all</button></section>'+Array.from({length:childCount},()=>'<iframe srcdoc="<p>Owned child</p>"></iframe>').join(""));
  try{const child=f.page.frames().find(x=>x!==f.page.mainFrame())!,evaluate=child.evaluate.bind(child);
   child.evaluate=(async(...args:Parameters<typeof child.evaluate>)=>{if(kind==="failed-frame"){await child.goto("about:blank");throw Error("owned unavailable frame");}const value=await (evaluate as (...a:unknown[])=>Promise<unknown>)(...args);await child.goto('about:blank');return value;}) as typeof child.evaluate;
   const old=await captureConsentControlGeometry(f.page,{documentIdentity:f.identity,timeoutMs:900});
   assert.equal(old.controlInspection?.structuralCoverage,"limited",kind);
   assert.equal(old.controlInspection?.captureCoverage?.frameCount,childCount+1);
   assert.equal(old.controlInspection?.captureCoverage?.capturedFrameCount,kind==="failed-frame"?11:7);
   assert.equal(old.controlInspection?.captureCoverage?.documentAndFramesStable,false);
   child.evaluate=evaluate;
   const fresh=await captureConsentControlGeometry(f.page,{documentIdentity:f.identity,timeoutMs:900});
   assert.equal(fresh.controlInspection?.structuralCoverage,"complete",kind);
   assert.equal(fresh.summary.firstLayerReject,false);await assertNoClicks(f.page);
   results.push({site:kind==="failed-frame"?"niedziela.pl":"purexbox.com",scenario:kind,oldCoverage:old.controlInspection?.captureCoverage,freshCoverage:fresh.controlInspection?.captureCoverage,
    scope:"Separate owned reads showing retained structural state; not extra production retries or original frame replay"});
  }finally{await f.context.close();}
 }
});

test("Pure Xbox-shaped offscreen controls stay non-positive even after structural readiness improves",async()=>{
 const source=retained.find(x=>x.site==="purexbox.com")!;
 const f=await pageFor(`<section id="onetrust-banner-sdk" role="dialog" style="position:fixed;top:0;left:0;width:700px;background:white"><p>${escape(source.context)}</p><div style="position:absolute;top:1100px"><button id="onetrust-accept-btn-handler">I Consent</button><button id="onetrust-pc-btn-handler">More Options</button></div></section>`);
 try{const g=await captureConsentControlGeometry(f.page,{documentIdentity:f.identity,timeoutMs:900});
  assert.equal(g.controlInspection?.structuralCoverage,"complete");
  assert.equal(g.summary.firstLayerAccept,false);assert.equal(g.summary.firstLayerOptions,false);assert.equal(g.summary.firstLayerReject,false);
  for(const label of ["I Consent","More Options"]){const c=g.candidates.find(c=>c.label===label);assert.ok(c);assert.notEqual(c.decisionStatus,"confirmed_visible");}
  await assertNoClicks(f.page);results.push({site:source.site,scenario:"offscreen-controls",geometry:g,observedControlGain:0});
 }finally{await f.context.close();}
});

test("a frame beyond the existing 12-frame cap cannot silently become a complete inventory",async()=>{
 const f=await pageFor('<section id="cookie-banner"><p>We use cookies.</p><button>Accept all</button></section>'+Array.from({length:12},()=>'<iframe srcdoc="<p>Owned frame</p>"></iframe>').join(""));
 try{const g=await captureConsentControlGeometry(f.page,{documentIdentity:f.identity,timeoutMs:900});
  assert.equal(f.page.frames().length,13);assert.equal(g.controlInspection?.structuralCoverage,"limited");assert.ok((g.controlInspection?.captureCoverage?.capturedFrameCount??0)<=12);
 }finally{await f.context.close();}
});
