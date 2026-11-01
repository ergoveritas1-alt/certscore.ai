import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {Browser} from "playwright";
import {consentUiObservationSchema,type ScreenshotArtifact} from "@certscore/contracts";
import {captureConsentControlGeometry} from "../consent-control-geometry";
import {readRapidFirstLayerConsentUiObservation,reconcileConsentUiObservationWithCompletedGeometry} from "../scanners/pre-consent-runtime-scanner";
import retained from "./retained-structural-coverage.json";
const escape=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

export async function readinessFixture(browser:Browser,site:"ab.pl"|"portaldecompraspublicas.com.br") {
 const source=retained.find(x=>x.site===site)!;
 const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:"block"}),page=await context.newPage(),url="https://readiness-fixture.test/";
 let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
 const controls=site==="ab.pl"?'<a role="button" tabindex="0" class="cli_settings_button">Ustawienia plików cookies</a><a role="button" id="wt-cli-accept-all-btn">Zaakceptuj wszystkie</a>':'<button>Aceitar</button><button>Minhas opções</button><button>Não venda</button>';
 await page.route("**/*",async route=>{if(route.request().url()===url)return route.fulfill({contentType:"text/html",body:`<!doctype html><meta charset="utf-8"><style>body{margin:0}#cookie-law-info-bar{position:fixed;bottom:0;left:0;right:0;padding:20px;background:white}a[role=button],button{display:inline-block;padding:12px}</style><section id="cookie-law-info-bar" role="dialog"><p>${escape(source.context)}</p>${controls}</section><img src="/pending.svg"><script>window.fixtureClicks=0;document.addEventListener('click',()=>window.fixtureClicks++)</script>`});
  if(route.request().url()===url+"pending.svg"){await pending;return route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg"/>'});}return route.abort();});
 const started=Date.now();await page.goto(url,{waitUntil:"domcontentloaded"});
 const cdp=await context.newCDPSession(page),tree=await cdp.send("Page.getFrameTree"),identity={source:"cdp_loader_id" as const,token:tree.frameTree.frame.loaderId};
 const root=await mkdtemp(join(tmpdir(),"certscore-structural-readiness-")),path=join(root,"ConsentControlGeometryEvidence.json"),imagePath=join(root,"retained.png");
 const pixels=await cdp.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true});await writeFile(imagePath,Buffer.from(pixels.data,"base64"));const image:ScreenshotArtifact={artifactId:"retained",path:imagePath,url,documentIdentity:identity,capturedAtMs:Date.now()-started,captureMethod:"primary_viewport_fallback",consentStateAtTime:"pre_consent",pagePhase:"dom_content_loaded"};
 const old=await captureConsentControlGeometry(page,{documentIdentity:identity,screenshotArtifactRef:imagePath,timeoutMs:900});
 assert.equal(old.controlInspection?.captureCoverage?.documentReadyState,"interactive");assert.equal(old.controlInspection?.structuralCoverage,"limited");
 release();await page.waitForLoadState("load");
 const rapid=await readRapidFirstLayerConsentUiObservation(page,started,900);
 const after=await cdp.send("Page.getFrameTree");assert.equal(after.frameTree.frame.loaderId,identity.token);
 const observation=consentUiObservationSchema.parse({...rapid,documentUrl:url,documentIdentity:identity});
 const stale=reconcileConsentUiObservationWithCompletedGeometry({current:observation,geometry:old,pageUrl:url,scanStartedAtMs:started,geometryAccessLoaded:true,artifactPath:path});
 await writeFile(path,JSON.stringify(old));
 return {source,context,page,url,started,identity,root,path,image,old,stale,close:async()=>{release();await context.close();await rm(root,{recursive:true,force:true});}};
}

