import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { chromium } from "playwright";
import { projectPostAcceptEvidenceForReport, projectPostRefusalEvidenceForReport, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { deriveAcceptFirstLayerProof, readAcceptFirstLayerProof } from "@certscore/scan-core/accept-first-layer-gate";
import { evaluateRejectGate, readRejectFirstLayerProof } from "@certscore/scan-core/reject-gate-shadow-receipt";
import { capturePassiveConsentControlGeometry } from "../../../packages/certscore-scan-core/src/consent-control-geometry.js";
import { readRapidFirstLayerConsentUiObservation, reconcileConsentUiObservationWithCompletedGeometry } from "../../../packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner.js";
import { runPostAcceptObserver } from "@certscore/scan-core/post-accept-observer";
import { runPostRefusalObserver } from "@certscore/scan-core/post-refusal-observer";
import { buildCanonicalPostAcceptActionRecipes } from "../../../packages/certscore-scan-core/src/post-accept-cmp-recipes.js";
import { buildCanonicalPostRefusalActionRecipes } from "../../../packages/certscore-scan-core/src/post-refusal-cmp-recipes.js";
import { RESOLVED_SCAN_TARGET_AUTHORIZATION_ID } from "../../../packages/certscore-scan-core/src/post-refusal-target-authorization.js";
import { awaitPostRefusalWorkerWithinTailBudget, awaitRejectWorkerWithLateClickAllowance } from "./handler.js";
import { buildConsentClickCheckpoint, verifyConsentClickCheckpoint, type VerifiedConsentClickCheckpoint } from "./reject-click-checkpoint.js";
import { deriveMaterializedConsentControlAssessment } from "../../web/server/scans/consent-control-assessment-projector.js";
import { projectPostAcceptForms } from "../../web/lib/scans/post-accept-form-projection.js";
import { proofForReadyAction } from "./dedicated-action-release.js";

const url = "https://sits.com/";
const target = url + "en/";
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const caption = "Mit diesem Button wird der Dialog geschlossen. Seine Funktionalität ist identisch mit der des Buttons Accept essential cookies.";
const formsScript = "https://js-eu1.hsforms.net/forms/embed/v2.js";
const html = `<!doctype html><meta charset="utf-8"><body><script src="/borlabs-cookie.js"></script>
<div class="brlbs-dialog-positioner"><section id="BorlabsCookieBox" class="brlbs-cmpnt-dialog brlbs-cmpnt-dialog-box-entrance" role="dialog" aria-label="Cookie preferences">
<p>We use optional cookies for analytics and marketing.</p>
<button aria-label="Dialog schließen">${caption}</button>
<button class="brlbs-btn-accept-all">Accept all</button>
<button class="brlbs-btn-accept-only-essential">Accept essential cookies</button>
<button>Individual preferences</button></section></div>
<script>
document.querySelector('section').addEventListener('click', event => {
  if (!event.isTrusted) return;
  const action = event.target.classList.contains('brlbs-btn-accept-all') ? 'accept' :
    event.target.classList.contains('brlbs-btn-accept-only-essential') ? 'reject' : 'wrong';
  fetch('/clicked/' + action);
  window.grants = {essential:true, analytics:action === 'accept'};
  dispatchEvent(new Event('borlabs-cookie-consent-saved'));
  document.querySelector('section').hidden = true;
  if (action === 'accept') {
    const script = document.createElement('script'); script.src = '${formsScript}'; document.head.append(script);
  } else if (action === 'reject') setTimeout(() => fetch('https://track.hubspot.com/__ptq.gif?k=1'), 6500);
  if (action === 'accept' || action === 'reject') location.reload();
});
</script>`;
const init = `window.grants={essential:false,analytics:false};
window.borlabsCookieConfig={settings:{dialogShowDialog:true},services:{essential:{id:'essential',serviceGroupId:'essential'},analytics:{id:'analytics',serviceGroupId:'statistics'}}};
window.BorlabsCookie={Consents:{hasConsent:id=>window.grants[id]}};`;

function checkpointRecorder(binding: Parameters<typeof buildConsentClickCheckpoint>[0]) {
  let recheckedAtMs: number | undefined;
  let receipt: VerifiedConsentClickCheckpoint | undefined;
  return {
    recheck(outcome: "passed" | "failed") {
      recheckedAtMs = outcome === "passed" ? Date.now() : undefined;
    },
    complete(event: {control: Parameters<typeof buildConsentClickCheckpoint>[1]; dispatchedAtMs: number; completedAtMs: number}) {
      if (recheckedAtMs === undefined) return;
      const body = buildConsentClickCheckpoint(binding, event.control, {
        recheckedAtMs, dispatchedAtMs: event.dispatchedAtMs, completedAtMs: event.completedAtMs,
      });
      if (body) receipt = verifyConsentClickCheckpoint({
        body, binding, metadataSha256: hash(body), coordinatorDispatchAtMs: binding.proof.issuedAtMs,
        verifiedAtMs: Date.now(), deadlineAtMs: binding.proof.expiresAtMs,
      });
    },
    read: () => receipt,
  };
}

test("SITS mixed-language close, late Borlabs choices and post-choice report evidence", {timeout:65_000}, async t => {
  for (const flag of ["CERTSCORE_ACCEPT_GATE_PRODUCTION_ENFORCE","CERTSCORE_REJECT_GATE_PRODUCTION_ENFORCE"]) {
    const previous = process.env[flag]; process.env[flag] = "1";
    t.after(() => { if (previous === undefined) delete process.env[flag]; else process.env[flag] = previous; });
  }
  // All URLs are fulfilled in-process. The November 25 production geometry
  // supplied the button names/selectors; the healthy capture supplied field counts.
  const browser = await chromium.launch({args:["--disable-background-networking","--host-resolver-rules=MAP * ~NOTFOUND"]});
  t.after(() => browser.close());
  let passive = true;
  const clicks: string[] = [];
  let pendingReloads = 0;
  const open = browser.newContext.bind(browser);
  t.mock.method(browser,"newContext",async (...args: Parameters<typeof open>) => {
    const context = await open({...args[0], serviceWorkers:"block"});
    let initialDocumentServed = false;
    await context.route("**/*",async route => {
      const u = route.request().url();
      if (u === url) return route.fulfill({contentType:"text/html",body:`<script>location.replace(${JSON.stringify(target)})</script>`});
      if (u === target) {
        if (!initialDocumentServed) {
          initialDocumentServed = true;
          return route.fulfill({contentType:"text/html",body:html});
        }
        // The trusted click has already run. Keep the original document active
        // while Chromium waits for the pending navigation to finish.
        pendingReloads += 1;
        await new Promise(resolve => setTimeout(resolve, 1250));
        return route.abort("aborted");
      }
      if (u === url+"borlabs-cookie.js") {
        if (!passive) await new Promise(resolve => setTimeout(resolve,10_000));
        return route.fulfill({contentType:"text/javascript",body:init});
      }
      if (u === formsScript) return route.fulfill({contentType:"text/javascript",body:
        "for (const [name,n] of [['Contact',8],['Newsletter',1]]) {const f=document.createElement('form');f.setAttribute('aria-label',name);for(let i=0;i<n;i++)f.insertAdjacentHTML('beforeend','<label>Field '+i+'<input name=field'+i+'></label>');document.body.append(f);}"});
      if (u.startsWith(url+"clicked/")) clicks.push(new URL(u).pathname);
      return route.fulfill({status:200,body:""});
    });
    return context;
  });
  const ctx = await browser.newContext();
  const page = await ctx.newPage(); await page.goto(target);
  const client = await ctx.newCDPSession(page);
  const documentIdentity = {source:"cdp_loader_id" as const,token:(await client.send("Page.getFrameTree")).frameTree.frame.loaderId};
  const started = Date.now();
  const observation = await readRapidFirstLayerConsentUiObservation(page,started,1500);
  const geometry = await capturePassiveConsentControlGeometry(page,{documentIdentity,timeoutMs:1500});
  const close = geometry.candidates.find(c=>c.ariaLabel==="Dialog schließen");
  assert.ok(close?.classifierReasonCodes.includes("borlabs_explanatory_close"), JSON.stringify({close,cmp:geometry.cmp,controls:geometry.candidates.map(c=>[c.label,c.selectorHint])}));
  // Production's DOM inventory capped the close caption and had only "button"
  // for the Reject selector. Reconcile using the verified same-document capture.
  const retainedControls: typeof observation.controls = JSON.parse(await readFile(
    path.join(__dirname,"test-fixtures/sits-91704-consent-controls.json"),"utf8"));
  const controls = [...observation.controls.filter(row=>row.actionType!=="accept_all" && row.actionType!=="reject_all"),...retainedControls];
  const truncated = controls.find(row=>row.selectorHint===close.selectorHint);
  assert.equal(truncated?.label, caption.slice(0,120));
  const reconciled = reconcileConsentUiObservationWithCompletedGeometry({current:{...observation,controls,documentUrl:target,documentIdentity},
    geometry,geometryAccessLoaded:true,pageUrl:target,scanStartedAtMs:started});
  const dedicated = reconciled.controls.find(control=>control.label==="Accept essential cookies");
  assert.equal(dedicated?.selectorHint,"button.brlbs-btn-accept-only-essential");
  const scanId = "sits-retained-regression";
  const bundle = {url,scanId,domSnapshots:[{url:target,documentIdentity,artifactId:"dom_text_pre_consent",consentStateAtTime:"pre_consent"}],
    consentSurfaceInspection:{inspectedPreInteraction:true,actionableControlObserved:true},consentUiObservations:[reconciled]} as CanonicalEvidenceBundle;
  const bytes = Buffer.from(JSON.stringify(geometry));
  const input = {bundle,scanId,targetUrl:url,parentDispatchSha256:hash(scanId),sourceSha256:hash(JSON.stringify(bundle)),requireExactSelector:true,
    geometry:{bytes,sha256:hash(bytes),sizeBytes:bytes.length}};
  const duplicate = {...reconciled,controls:[...reconciled.controls,{...dedicated!,selectorHint:"#different-reject"}]};
  const ambiguous = evaluateRejectGate({...input,nowMs:Date.now(),bundle:{...bundle,consentUiObservations:[duplicate]}});
  assert.equal(ambiguous.outcome === "blocked" && ambiguous.reason,"control_ambiguous");
  await ctx.close(); passive = false;
  const common = {browser,url,scanId,parentScanId:scanId,recipeSetId:"sits-borlabs-replay",actionSearchTimeoutMs:14_000,resultBudgetMs:20_000,
    confirmationTimeoutMs:2000,observationWindowMs:3000,productionProjectable:true,
    interactionAuthorization:{kind:"scan_target_resolution" as const,authorizationId:RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,requestedUrl:url,scanId,maxRedirects:1,resolutionTimeoutMs:1000}};
  const accept = deriveAcceptFirstLayerProof({...input,nowMs:Date.now(),deadlineAtMs:Infinity});
  assert.ok(accept);
  const a = proofForReadyAction(accept,Infinity);
  assert.equal(a.expiresAtMs-a.issuedAtMs,16_000);
  assert.ok(!readAcceptFirstLayerProof({...a,documentSha256:hash(url+"another-page/")}));
  assert.ok(!readAcceptFirstLayerProof({...a,labelSha256:hash("Subscribe")}));
  assert.ok(!readAcceptFirstLayerProof({...a,expiresAtMs:a.expiresAtMs+1}));
  assert.throws(()=>proofForReadyAction(accept,Infinity,accept.expiresAtMs), /expired/);
  const aRecipes = buildCanonicalPostAcceptActionRecipes();
  const acceptCheckpoint = checkpointRecorder({action:"accept", proof:a});
  const acceptWorker = runPostAcceptObserver({...common,firstLayerProof:a,recipe:aRecipes[0]!,recipeCandidates:aRecipes,allowCanonicalAcceptDiscovery:true,
    formSnapshotReviewer:async()=>({safeForDisplay:true}),
    onAcceptGateFinalRecheck:acceptCheckpoint.recheck, onExactAcceptClickCompleted:acceptCheckpoint.complete});
  const acceptJoined = await awaitPostRefusalWorkerWithinTailBudget({
    abortController:new AbortController(), passiveLaneBarrierCompletedAtMs:a.issuedAtMs,
    maxTailWaitMs:a.expiresAtMs-a.issuedAtMs, workerPromise:acceptWorker.then(()=>undefined),
  });
  const accepted = await acceptWorker;
  assert.equal(acceptJoined,true);
  const acceptReceipt = acceptCheckpoint.read();
  assert.ok(acceptReceipt);
  assert.equal(accepted.interactionDiagnostics?.click.outcome,"completed",JSON.stringify(accepted.limitations));
  assert.equal(accepted.acceptanceRegistration.status,"confirmed");
  const aReport = projectPostAcceptEvidenceForReport({packet:accepted,packetSha256:hash(JSON.stringify(accepted))});
  assert.deepEqual(aReport.formCapture?.frames.flatMap(f=>f.forms.map(form=>form.fields.length)),[8,1]);
  assert.equal(aReport.formSnapshotCapture?.snapshots.filter(s=>s.status==="available").length,2);
  const consentControlAssessment = deriveMaterializedConsentControlAssessment({
    bundle, scanId, noGo:false, requestedUrl:url, finalUrl:target,
  });
  const rows = projectPostAcceptForms({consentControlAssessment,postAcceptEvidenceProjection:aReport}).rows;
  assert.deepEqual(rows.map(row=>row.form.fields.length),[8,1]);
  assert.ok(acceptReceipt.completedAtMs <= a.expiresAtMs-200 && acceptReceipt.completedAtMs > a.issuedAtMs+6000);
  const decision = evaluateRejectGate({...input,nowMs:Date.now()});
  const reject = readRejectFirstLayerProof({...decision,scanId});
  assert.ok(reject,JSON.stringify(decision));
  const r = proofForReadyAction(reject,Infinity);
  assert.equal(r.expiresAtMs-r.issuedAtMs,16_000);
  assert.ok(!readRejectFirstLayerProof({...r,binding:{...r.binding,requestedTargetSha256:hash("https://other.example/")}}));
  assert.ok(!readRejectFirstLayerProof({...r,binding:{...r.binding,labelSha256:hash("Other")}}));
  assert.throws(()=>proofForReadyAction(reject,Infinity,reject.expiresAtMs), /expired/);
  const rRecipes = buildCanonicalPostRefusalActionRecipes();
  const rejectCheckpoint = checkpointRecorder({action:"reject", proof:r});
  const rejectWorker = runPostRefusalObserver({...common,observationWindowMs:8000,firstLayerProof:r,recipe:rRecipes[0]!,recipeCandidates:rRecipes,allowCanonicalRejectDiscovery:true,
    onRejectGateFinalRecheck:rejectCheckpoint.recheck, onExactRejectClickCompleted:rejectCheckpoint.complete});
  const initialTailMs = r.expiresAtMs-r.issuedAtMs;
  const rejectJoin = await awaitRejectWorkerWithLateClickAllowance({
    abortController:new AbortController(), passiveLaneBarrierCompletedAtMs:r.issuedAtMs,
    absoluteDeadlineAtMs:r.issuedAtMs+30_000, maxTailWaitMs:initialTailMs, initialTailMs,
    verifiedClickAtMs:()=>rejectCheckpoint.read()?.completedAtMs, readDedicatedRejectCheckpoint:rejectCheckpoint.read,
    workerPromise:rejectWorker.then(()=>undefined),
  });
  const rejected = await rejectWorker;
  assert.equal(rejectJoin.completed,true,JSON.stringify({rejectJoin,timing:rejected.timing,receipt:rejectCheckpoint.read()}));
  assert.ok(rejectJoin.maxTailWaitMs > initialTailMs, "The late HubSpot packet must join using the verified click checkpoint");
  t.diagnostic(`Reject join budget ${rejectJoin.maxTailWaitMs} ms, observation ${rejected.timing.observationMs} ms (${rejected.timing.observationExitReason})`);
  const rejectReceipt = rejectCheckpoint.read();
  assert.ok(rejectReceipt);
  assert.equal(rejected.interactionDiagnostics?.click.outcome,"completed",JSON.stringify(rejected.limitations));
  assert.equal(rejected.refusalRegistration.status,"confirmed");
  const rReport = projectPostRefusalEvidenceForReport({packet:rejected,packetSha256:hash(JSON.stringify(rejected))});
  assert.equal(rReport.execution?.clickCompleted,true);
  assert.ok(rReport.postRefusalActivity.some(row=>row.hostname==="track.hubspot.com" && row.msAfterReject>0),JSON.stringify(rReport.postRefusalActivity));
  assert.ok(rejected.network.requests.some(req=>req.hostname==="track.hubspot.com" && req.startedAtMs! > rejected.refusalRegistration.actionDispatchedAtMs!));
  t.diagnostic(`Accept receipt at ${acceptReceipt.completedAtMs - a.issuedAtMs} ms, Reject receipt at ${rejectReceipt.completedAtMs - r.issuedAtMs} ms`);
  assert.deepEqual(clicks,["/clicked/accept","/clicked/reject"]);
  assert.equal(pendingReloads,2);
  t.diagnostic(`EU-IE replay: 1 verified Accept receipt, 1 verified Reject receipt, ${rows.length} after-Accept forms, ${rows.reduce((count, row) => count + row.form.fields.length, 0)} fields`);
  assert.ok(rejectReceipt.completedAtMs <= r.expiresAtMs-200 && rejectReceipt.completedAtMs > r.issuedAtMs+6000);
});
