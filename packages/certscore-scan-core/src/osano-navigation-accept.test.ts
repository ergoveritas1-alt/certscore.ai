import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test, {type TestContext} from "node:test";
import {chromium} from "playwright";
import {projectPostAcceptEvidenceForReport, type CanonicalEvidenceBundle} from "@certscore/contracts";
import {deriveAcceptFirstLayerProof} from "./accept-first-layer-gate.js";
import {capturePassiveConsentControlGeometry} from "./consent-control-geometry.js";
import {readRapidFirstLayerConsentUiObservation} from "./scanners/pre-consent-runtime-scanner.js";
import {buildCanonicalPostAcceptActionRecipes} from "./post-accept-cmp-recipes.js";
import {runPostAcceptObserver} from "./post-accept-observer.js";

const script = "https://cmp.osano.com/test/config/osano.js";
const hash = (data: string|Buffer) => createHash("sha256").update(data).digest("hex");
async function verifyNavigation(t: TestContext, url: string, modes: string[]) {
  const browser = await chromium.launch();
  t.after(()=>browser.close());
  const oldAccept=process.env.CERTSCORE_ACCEPT_GATE_PRODUCTION_ENFORCE,oldReject=process.env.CERTSCORE_REJECT_GATE_PRODUCTION_ENFORCE;
  process.env.CERTSCORE_ACCEPT_GATE_PRODUCTION_ENFORCE=process.env.CERTSCORE_REJECT_GATE_PRODUCTION_ENFORCE="1";
  t.after(()=>{for(const [k,v] of [["CERTSCORE_ACCEPT_GATE_PRODUCTION_ENFORCE",oldAccept],["CERTSCORE_REJECT_GATE_PRODUCTION_ENFORCE",oldReject]] as const){
    if(v===undefined)delete process.env[k];else process.env[k]=v;}});
  const newContext = browser.newContext.bind(browser);
  let mode="saved";
  t.mock.method(browser,"newContext",async options=>{
    const context=await newContext({...options,serviceWorkers:"block"});
    await context.route("**/*",route=>{
      const href=route.request().url();
      if(href===script)return route.fulfill({contentType:"text/javascript",body:`
        const denied={ESSENTIAL:'ACCEPT',STORAGE:'DENY',OPT_OUT:'DENY',ANALYTICS:'DENY',MARKETING:'DENY',PERSONALIZATION:'DENY'};
        const granted={...denied,ANALYTICS:'ACCEPT',MARKETING:'ACCEPT',PERSONALIZATION:'ACCEPT'};
        let state=denied; const listeners=[];
        window.Osano={cm:{getConsent:()=>({...state}),addEventListener:(name,fn)=>listeners.push(fn)}};
        function emit(){listeners.forEach(fn=>fn({...granted}));}
      `});
      if(href===url+"next")return route.fulfill({contentType:"text/html",body:`<script src="${script}"></script><script>state=granted;emit()</script>`});
      if(href!==url)return route.abort();
      return route.fulfill({contentType:"text/html",body:`<script src="${script}"></script>
        <div role="dialog" class="osano-cm-window" aria-label="Cookie consent"><p>We use optional cookies. Choose your preferences.</p>
        <button id="accept" class="osano-cm-accept-all">Accept</button><button id="deny" class="osano-cm-deny-all">Deny Non-Essential</button></div>
        <script>document.querySelector('button').onclick=()=>{
          const mode=${JSON.stringify(mode)};
          if(mode==='full_navigation'){state=granted;emit();location.replace('next');return;}
          if(mode==='destination'){location.replace('next');return;}
          history.replaceState(null,'',location.href);
          setTimeout(()=>{state=mode==='disagree'?denied:granted;
            if(mode==='new_api')window.Osano.cm={...window.Osano.cm};
            if(mode==='changed_config')document.querySelector('script[src]').remove();
            if(mode==='tcf')window.__tcfapi=()=>{};
            if(mode!=='getter_only')emit();
          },20);
        };</script>`});
    });
    return context;
  });
  const context=await browser.newContext(),page=await context.newPage();await page.goto(url);
  const cdp=await context.newCDPSession(page);
  const documentIdentity={source:"cdp_loader_id" as const,token:(await cdp.send("Page.getFrameTree")).frameTree.frame.loaderId};
  const inventory=await readRapidFirstLayerConsentUiObservation(page,Date.now(),1500);
  const geometry=Buffer.from(JSON.stringify(await capturePassiveConsentControlGeometry(page,{documentIdentity,timeoutMs:1500})));
  const scanId="osano-navigating-accept";
  const bundle={url,scanId,domSnapshots:[{url,documentIdentity,artifactId:"dom_text_pre_consent",consentStateAtTime:"pre_consent"}],
    consentSurfaceInspection:{inspectedPreInteraction:true,actionableControlObserved:true},
    consentUiObservations:[{...inventory,documentIdentity,documentUrl:url,captureDiagnostics:{...inventory.captureDiagnostics,
      completedChannels:[...inventory.captureDiagnostics!.completedChannels,"geometry"]}}]} as CanonicalEvidenceBundle;
  await context.close();
  for(mode of modes){
    const firstLayerProof=deriveAcceptFirstLayerProof({bundle,targetUrl:url,scanId,parentDispatchSha256:hash(scanId),sourceSha256:hash(JSON.stringify(bundle)),
      nowMs:Date.now(),deadlineAtMs:Date.now()+6000,requireExactSelector:true,geometry:{bytes:geometry,sizeBytes:geometry.length,sha256:hash(geometry)}});
    assert.ok(firstLayerProof,JSON.stringify({controls:inventory.controls.map(c=>[c.label,c.selectorHint]),geometry:JSON.parse(geometry.toString()).candidates.map((c:any)=>[c.label,c.selectorHint,c.decisionStatus])}));
    const recipes=buildCanonicalPostAcceptActionRecipes(),checks:string[]=[];
    const packet=await runPostAcceptObserver({browser,url,scanId,parentScanId:scanId,firstLayerProof,
      interactionAuthorization:{kind:"scan_target",normalizedUrl:url,scanId,authorizationId:"sharded_scan_exact_target.v1"},
      recipe:recipes[0]!,recipeCandidates:recipes,allowCanonicalAcceptDiscovery:true,onAcceptGateFinalRecheck:v=>checks.push(v),
      actionSearchTimeoutMs:3500,confirmationTimeoutMs:450,observationWindowMs:300,resultBudgetMs:6500,productionProjectable:true});
    assert.deepEqual(checks,["passed"],mode);
    assert.equal(packet.interactionDiagnostics?.click.outcome,"completed",mode);
    assert.equal(packet.interactionDiagnostics?.postClickNavigation?.outcome,"main_frame_navigated",mode);
    assert.equal(packet.acceptanceRegistration.status==="confirmed",(mode==="saved"||mode==="full_navigation"),JSON.stringify({mode,limitations:packet.limitations,registration:packet.acceptanceRegistration}));
    if(mode==="saved" || mode==="full_navigation"){
      assert.equal(packet.decisionEvidence?.decision,"granted");
      assert.equal(packet.acceptanceRegistration.witnesses[0]?.witnessType,"cmp_api_state");
      assert.equal(packet.acceptanceRegistration.witnesses[0]?.key,"osano");
      assert.equal(packet.storage.postActionCapturedAtMs,undefined);
      assert.equal(packet.afterActionCapture?.storageSnapshotRetained,false);
      assert.equal(packet.afterActionCapture?.stopReason,"aborted");
      assert.equal(projectPostAcceptEvidenceForReport({packet}).acceptanceRegisteredAtMs,packet.acceptanceRegistration.acceptanceRegisteredAtMs);
      assert.equal(packet.productionProjectable,false);
      assert.equal(packet.decisionEvidence?.osanoReceiptEvidence,undefined);
      assert.ok(packet.limitations.includes("osano_saved_event_and_sdk_read_in_original_document"));
    }
  }
}

test("You.com still confirms Osano Accept when the original document saves the choice", async t => {
  await verifyNavigation(t, "https://you.com/", ["full_navigation"]);
});

test("a different Osano site can confirm a navigating Accept only from the bound source", async t => {
  await verifyNavigation(t, "https://osano-customer.example/privacy/", [
    "saved", "full_navigation", "getter_only", "disagree", "tcf", "new_api", "changed_config", "destination",
  ]);
});
