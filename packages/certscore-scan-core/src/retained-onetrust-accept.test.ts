import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import { chromium, type Page } from "playwright";
import {
  ONETRUST_ITALIAN_ACCEPT_CONTROL, postAcceptEvidencePacketSchema, projectPostAcceptEvidenceForReport, type CanonicalEvidenceBundle,
} from "@certscore/contracts";
import { deriveAcceptFirstLayerProof } from "./accept-first-layer-gate.js";
import { capturePassiveConsentControlGeometry } from "./consent-control-geometry.js";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { readRapidFirstLayerConsentUiObservation, reconcileConsentUiObservationWithCompletedGeometry } from "./scanners/pre-consent-runtime-scanner.js";

const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

test("a retained exact OneTrust Accept selector resolves after a deferred localhost render", t =>
  verifyDeferredAccept(t));

test("a transient native actionability retry returns one exact Accept receipt", t =>
  verifyDeferredAccept(t, {interruptClick:true}));

test("the registered Italian OneTrust button retains one Accept receipt with 200 ms to spare", t =>
  verifyDeferredAccept(t, {italian:true}));

for (const changedControl of ["moved", "form_bound", "conflicting_aria"] as const) {
  test(`the Italian OneTrust worker withholds Accept when the live button is ${changedControl}`, t =>
    verifyDeferredAccept(t, {italian:true, changedControl}));
}

async function verifyDeferredAccept(t: TestContext, options: {
  interruptClick?: boolean; italian?: boolean; changedControl?: "moved" | "form_bound" | "conflicting_aria";
} = {}) {
  const {interruptClick, italian, changedControl} = options;
  const scoped = ONETRUST_ITALIAN_ACCEPT_CONTROL;
  const flag="CERTSCORE_ACCEPT_GATE_PRODUCTION_SHADOW";
  const previous=process.env[flag];
  process.env[flag]="1";
  t.after(() => { if (previous === undefined) delete process.env[flag]; else process.env[flag]=previous; });
  const clicks: string[] = [];
  const server = createServer((request,response) => {
    if (request.url === "/clicked") {
      clicks.push(request.method!);
      response.writeHead(204).end();
      return;
    }
    if (request.url !== "/") {
      response.writeHead(404).end();
      return;
    }
    const changed = request.headers["x-fixture-passive"] === "1" ? undefined : changedControl;
    const label = italian ? scoped.label : "Accept All Cookies";
    const button = `<button id="onetrust-accept-btn-handler"${changed === "conflicting_aria" ? ' aria-label="Reject all"' : ""}>${label}</button>`;
    const markup = `<section role="dialog" id="onetrust-banner-sdk"><p>We use cookies. Choose optional cookies.</p><div id="onetrust-button-group"><div>${
      changed === "moved" ? "" : changed === "form_bound" ? `<form>${button}</form>` : button}</div></div>${
      changed === "moved" ? button : ""}${italian ? '<button aria-label="Rifiuto tutti i cookie">Rifiuto tutti i cookie</button>' : ""}</section>`;
    response.setHeader("content-type","text/html; charset=utf-8");
    response.end(`<main><h1>Fixture</h1></main><script>
      window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:'C0001',Status:'always active'},{CustomGroupId:'C0002',Status:'inactive'}]})};
      window.__tcfapi=()=>{};
      document.cookie='OptanonConsent=groups=C0001:1,C0002:0&receipt=before;path=/';
      setTimeout(()=>{
        const banner=document.createElement('div');
        banner.innerHTML=${JSON.stringify(markup)};
        document.body.append(banner);
        banner.querySelector('#onetrust-accept-btn-handler').onclick=(event)=>{
          if (!event.isTrusted) return;
          event.preventDefault();
          fetch('/clicked',{method:'POST'});
          document.cookie='OptanonConsent=groups=C0001:1,C0002:1&receipt=after;path=/';
          banner.hidden=true;
        };
      }, ${request.headers["x-fixture-passive"] === "1" ? 0 : 400});
    </script>`);
  });
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  server.listen(0,"127.0.0.1");
  await once(server,"listening");
  const address=server.address();
  assert.ok(address && typeof address !== "string");
  const url=`http://127.0.0.1:${address.port}/`;
  const browser=await chromium.launch({args:["--disable-background-networking","--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"]});
  t.after(() => browser.close());
  const newContext=browser.newContext.bind(browser);
  let contexts=0;
  let workerPage: Page | undefined;
  let interruption: Promise<void> | undefined;
  t.mock.method(browser,"newContext",async (options:Parameters<typeof newContext>[0]) => {
    const passive=++contexts===1;
    const context=await newContext({...options,serviceWorkers:"block",
      extraHTTPHeaders:{...options?.extraHTTPHeaders,...(passive?{"x-fixture-passive":"1"}:{})}});
    if (!passive) context.on("page", page => { workerPage = page; });
    await context.route("**/*",route => new URL(route.request().url()).origin===new URL(url).origin ? route.continue() : route.abort());
    return context;
  });
  const passive=await browser.newContext();
  const page=await passive.newPage();
  await page.goto(url);
  await page.locator("#onetrust-accept-btn-handler").waitFor();
  const committedUrl=page.url();
  const cdp=await passive.newCDPSession(page);
  const documentIdentity={source:"cdp_loader_id" as const,token:(await cdp.send("Page.getFrameTree")).frameTree.frame.loaderId};
  const startedAtMs=Date.now();
  const rawInventory=await readRapidFirstLayerConsentUiObservation(page,startedAtMs,1500);
  const geometry=await capturePassiveConsentControlGeometry(page,{documentIdentity,timeoutMs:1500});
  const inventory=italian ? reconcileConsentUiObservationWithCompletedGeometry({
    current:{...rawInventory,documentIdentity,documentUrl:committedUrl}, geometry, geometryAccessLoaded:true,
    pageUrl:committedUrl, scanStartedAtMs:startedAtMs,
  }) : rawInventory;
  await passive.close();
  const scanId="retained-onetrust-accept";
  const snapshot={url:committedUrl,consentStateAtTime:"pre_consent"};
  const bundle={
    scanId,url,domSnapshots:[{...snapshot,documentIdentity,artifactId:"dom_text_pre_consent"},
      {...snapshot,artifactId:"dom_text_pre_consent_recovery"}],
    consentSurfaceInspection:{inspectedPreInteraction:true,actionableControlObserved:true},
    consentUiObservations:[italian ? inventory : {...inventory,documentIdentity,documentUrl:committedUrl,captureDiagnostics:{
      ...inventory.captureDiagnostics,completedChannels:[...inventory.captureDiagnostics!.completedChannels,"geometry"],
    }}],
  } as CanonicalEvidenceBundle;
  const bytes=Buffer.from(JSON.stringify(geometry));
  const nowMs=Date.now();
  let blockReason:string|undefined;
  const proof=deriveAcceptFirstLayerProof({bundle,scanId,targetUrl:url,sourceSha256:sha(JSON.stringify(bundle)),
    parentDispatchSha256:sha(scanId),nowMs,deadlineAtMs:nowMs+6000,requireExactSelector:true,
    geometry:{bytes,sizeBytes:bytes.length,sha256:sha(bytes)},onDecision:decision=>{
      if(decision.outcome==="blocked") blockReason=decision.reason;
    }});
  assert.ok(proof, JSON.stringify({blockReason, candidates:geometry.candidates, inspection:geometry.controlInspection, inventory:inventory.controls}));
  assert.equal(proof.exactSelector,"#onetrust-accept-btn-handler");
  const rechecks:string[]=[];
  const verifiedClicks: Array<{completedAtMs:number}> = [];
  const packet=await runPostAcceptObserver({
    browser,url,scanId,parentScanId:scanId,allowCanonicalAcceptDiscovery:true,firstLayerProof:proof,
    recipe:buildCanonicalPostAcceptActionRecipes().find(recipe=>recipe.cmpId==="OneTrust")!,
    interactionAuthorization:{kind:"loopback",authorizationId:"loopback_local_lab"},
    actionSearchTimeoutMs:3500,resultBudgetMs:6500,confirmationTimeoutMs:400,observationWindowMs:350,
    onAcceptGateFinalRecheck: outcome => {
      rechecks.push(outcome);
      if (interruptClick && outcome === "passed") {
        assert.ok(workerPage);
        interruption = workerPage.evaluate(() => {
          const button = document.querySelector<HTMLButtonElement>("#onetrust-accept-btn-handler")!;
          button.disabled = true;
          setTimeout(() => { button.disabled = false; }, 125);
        });
      }
    },
    onExactAcceptClickCompleted: receipt => verifiedClicks.push(receipt),
  });
  const retainedAtMs=Date.now();
  const retained=postAcceptEvidencePacketSchema.parse(packet);
  const projection=projectPostAcceptEvidenceForReport({packet:retained,packetSha256:sha(JSON.stringify(retained))});
  if (changedControl) {
    assert.deepEqual(clicks,[]);
    assert.deepEqual(verifiedClicks,[]);
    assert.ok(!rechecks.includes("passed"));
    assert.notEqual(projection.execution?.clickCompleted,true);
    return;
  }
  assert.deepEqual(rechecks,["passed"],JSON.stringify({resolver:packet.resolver,limitations:packet.limitations}));
  if (interruptClick) {
    assert.ok(interruption);
    await interruption;
  }
  assert.deepEqual(clicks,["POST"]);
  assert.equal(verifiedClicks.length,1);
  assert.ok(packet.interactionDiagnostics?.resolver?.snapshots.every(s => s.source !== "canonical_geometry"));
  assert.equal(projection.execution?.clickCompleted,true);
  if (italian) {
    assert.equal(retained.actionControlProof?.accessibleLabel,scoped.label);
    assert.ok(retained.actionControlProof?.classifierReasonCodes.includes(scoped.proofReason));
    assert.ok(proof.expiresAtMs-verifiedClicks[0]!.completedAtMs>=200);
    assert.ok(proof.expiresAtMs-retainedAtMs>=200);
  }
}
