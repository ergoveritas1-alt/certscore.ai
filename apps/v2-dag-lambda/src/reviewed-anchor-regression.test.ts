import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { chromium } from "playwright";
import { deriveAcceptFirstLayerProof } from "@certscore/scan-core/accept-first-layer-gate";
import { evaluateRejectGate, readRejectFirstLayerProof } from "@certscore/scan-core/reject-gate-shadow-receipt";
import { runPostAcceptObserver } from "@certscore/scan-core/post-accept-observer";
import { runPostRefusalObserver } from "@certscore/scan-core/post-refusal-observer";
import { capturePassiveConsentControlGeometry } from "../../../packages/certscore-scan-core/src/consent-control-geometry.js";
import { readRapidFirstLayerConsentUiObservation, reconcileConsentUiObservationWithCompletedGeometry } from "../../../packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner.js";
import { buildCanonicalPostAcceptActionRecipes } from "../../../packages/certscore-scan-core/src/post-accept-cmp-recipes.js";
import { buildCanonicalPostRefusalActionRecipes } from "../../../packages/certscore-scan-core/src/post-refusal-cmp-recipes.js";
import { RESOLVED_SCAN_TARGET_AUTHORIZATION_ID } from "../../../packages/certscore-scan-core/src/post-refusal-target-authorization.js";
import { exactNativeConsentButtonSelector } from "../../../packages/certscore-scan-core/src/exact-native-consent-button-selector.js";
import { buildConsentClickCheckpoint, verifyConsentClickCheckpoint } from "./reject-click-checkpoint.js";
import { proofForReadyAction } from "./dedicated-action-release.js";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const adikteev = "https://www.adikteev.com/";
const navigraph = "https://navigraph.com/";
const iobit = "https://www.iobit.com/en/index.php?s";
const hubSpot = `<div id="hs-eu-cookie-confirmation" role="dialog" aria-label="Cookie preferences">
  <p>Choose whether to allow optional cookies for analytics and marketing.</p>
  <div id="hs-eu-cookie-confirmation-button-group">
    <a role="button" id="hs-eu-confirmation-button" data-choice="accept" href="javascript:void(0);">Accept all</a>
    <a role="button" id="hs-eu-decline-button" data-choice="reject" href="javascript:void(0);">Decline all</a>
  </div></div>`;
const consent = `<section id="consent" role="dialog" aria-label="Cookie preferences"><p>Choose whether to allow optional cookies.</p>
  <div class="inner"><div class="buttons">
    <a class="btn cta" data-testid="acceptAllCookies" data-choice="accept" style="text-transform: uppercase">Accept all cookies</a>
  </div></div></section>`;

// The retained snapshot identifies these two anchors and the final route
// but omits the Accept link destination. This fixture supplies the safe shape
// that a future capture must independently verify.
const iobitNotice = `<div class="float-bar" role="dialog" aria-label="Cookie consent">
  <div>We use optional cookies. Read our <a href="/privacy">privacy policy</a>.
    <a data-choice="accept">I Accept</a>
  </div></div>`;

for (const [url, action] of [[adikteev, "accept"], [adikteev, "reject"], [navigraph, "accept"], [iobit, "accept"]] as const) {
  test(`${new URL(url).hostname} binds and retains the reviewed ${action} click`, {timeout: 20_000}, async t => {
    for (const flag of ["CERTSCORE_ACCEPT_GATE_PRODUCTION_ENFORCE", "CERTSCORE_REJECT_GATE_PRODUCTION_ENFORCE"]) {
      const previous = process.env[flag];
      process.env[flag] = "1";
      t.after(() => { if (previous === undefined) delete process.env[flag]; else process.env[flag] = previous; });
    }
    const browser = await chromium.launch({args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"]});
    t.after(() => browser.close());
    const requested = url === adikteev ? "https://adikteev.com/" : url === iobit ? "https://iobit.com/" : url;
    const clickPrefix = new URL("/clicked/", url).href;
    const clicks: string[] = [];
    let changedDestination = false;
    const open = browser.newContext.bind(browser);
    t.mock.method(browser, "newContext", async (...args: Parameters<typeof open>) => {
      const context = await open({...args[0], serviceWorkers: "block"});
      await context.route("**/*", async route => {
        const target = route.request().url();
        if (target === requested && requested !== url) return route.fulfill({ contentType: "text/html", body: `<script>location.replace(${JSON.stringify(url)})</script>` });
        if (target === url) return route.fulfill({ contentType: "text/html", body: `<!doctype html><style>a{display:inline-block;padding:12px}</style>
          ${url === adikteev ? hubSpot : url === iobit ? iobitNotice : consent}
          <script>
          if (${changedDestination}) document.querySelector('[data-choice="${action}"]').setAttribute('href','/changed-destination');
          document.querySelector('[role=dialog]').addEventListener('click',event=>{
            if (!event.isTrusted || !event.target.dataset.choice) return;
            const choice = event.target.dataset.choice;
            fetch('/clicked/' + choice);
            event.target.closest('[role=dialog]').hidden = true;
          });</script>` });
        if (target.startsWith(clickPrefix)) {
          clicks.push(new URL(target).pathname);
          return route.fulfill({status: 200, body: ""});
        }
        return route.abort();
      });
      return context;
    });
    const passive = await browser.newContext();
    const page = await passive.newPage();
    await page.goto(url);
    const client = await passive.newCDPSession(page);
    const documentIdentity = {source:"cdp_loader_id" as const, token:(await client.send("Page.getFrameTree")).frameTree.frame.loaderId};
    const start = Date.now();
    const observation = await readRapidFirstLayerConsentUiObservation(page, start, 1500);
    const geometry = await capturePassiveConsentControlGeometry(page, {documentIdentity, timeoutMs:1500});
    const reconciled = reconcileConsentUiObservationWithCompletedGeometry({
      current:{...observation, documentUrl:url, documentIdentity}, geometry, pageUrl:url,
      geometryAccessLoaded:true, scanStartedAtMs:start,
    });
    const scanId = "fresh-anchor-replay";
    const bytes = Buffer.from(JSON.stringify(geometry));
    const input = {
      bundle: {
        url:requested, scanId, consentUiObservations:[reconciled],
        domSnapshots:[{url, documentIdentity, artifactId:"dom_text_pre_consent", consentStateAtTime:"pre_consent" as const}],
        consentSurfaceInspection:{inspectedPreInteraction:true, actionableControlObserved:true},
      },
      scanId, targetUrl:requested, sourceSha256:hash("source"), parentDispatchSha256:hash(scanId),
      requireExactSelector:true, geometry:{bytes, sha256:hash(bytes), sizeBytes:bytes.length}, deadlineAtMs:Infinity,
    };
    const original = Date.now();
    let failure: string | undefined;
    const accept = action === "accept" ? deriveAcceptFirstLayerProof({...input, nowMs:original, onDecision:d=>{
      if(d.outcome==="blocked") failure=d.reason;
    }}) : undefined;
    const reject = action === "reject" ? evaluateRejectGate({...input, nowMs:original}) : undefined;
    const rejectProof = reject?.outcome === "qualified" ? readRejectFirstLayerProof({...reject, scanId}) : undefined;
    const candidate = page.locator(`[data-choice="${action}"]`);
    assert.ok(await candidate.evaluate(exactNativeConsentButtonSelector));
    await page.evaluate(() => document.head.insertAdjacentHTML("beforeend", '<base target="_blank">'));
    assert.equal(await candidate.evaluate(exactNativeConsentButtonSelector), undefined);
    await page.locator("base").evaluate(element => element.remove());
    if (url === iobit) {
      await candidate.evaluate(element => {
        const duplicate = element.cloneNode(true) as HTMLElement;
        duplicate.removeAttribute("data-choice");
        duplicate.setAttribute("data-test-duplicate", "");
        element.after(duplicate);
      });
      assert.equal(await candidate.evaluate(exactNativeConsentButtonSelector), undefined);
      await page.locator("[data-test-duplicate]").evaluate(element => element.remove());
    }
    await candidate.evaluate(element => element.setAttribute("href", "/changed-destination"));
    assert.equal(await candidate.evaluate(exactNativeConsentButtonSelector), undefined);
    await passive.close();

    assert.ok(accept || rejectProof, JSON.stringify({failure,reject,choices:reconciled.controls,geometry:geometry.summary}));
    const binding = accept ? {action:"accept" as const, proof:proofForReadyAction(accept,Infinity)}
      : {action:"reject" as const, proof:proofForReadyAction(rejectProof!,Infinity)};
    let recheckedAtMs: number | undefined;
    const receipt: {completedAtMs?:number} = {};
    const recheck = (outcome:"passed"|"failed") => { recheckedAtMs = outcome === "passed" ? Date.now() : undefined; };
    const complete = (event:{control:Parameters<typeof buildConsentClickCheckpoint>[1];dispatchedAtMs:number;completedAtMs:number}) => {
      if(recheckedAtMs === undefined) return;
      const body = buildConsentClickCheckpoint(binding,event.control,{recheckedAtMs,
        dispatchedAtMs:event.dispatchedAtMs,completedAtMs:event.completedAtMs});
      if(body) receipt.completedAtMs = verifyConsentClickCheckpoint({
        body,binding,metadataSha256:hash(body),coordinatorDispatchAtMs:binding.proof.issuedAtMs,
        verifiedAtMs:Date.now(),deadlineAtMs:binding.proof.expiresAtMs,
      })?.completedAtMs;
    };
    const observer = {
      browser, scanId, parentScanId:scanId, url:requested, recipeSetId:"fresh-anchor-replay",
      actionSearchTimeoutMs:5000, resultBudgetMs:9000, confirmationTimeoutMs:500, observationWindowMs:100,
      interactionAuthorization:{kind:"scan_target_resolution" as const, authorizationId:RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,
        scanId, requestedUrl:requested, maxRedirects:1, resolutionTimeoutMs:1000},
    };
    const a = buildCanonicalPostAcceptActionRecipes();
    const r = buildCanonicalPostRefusalActionRecipes();
    const run = (settings: typeof observer) => binding.action === "accept"
      ? runPostAcceptObserver({...settings, firstLayerProof:binding.proof, recipe:a[0]!, recipeCandidates:a,
          allowCanonicalAcceptDiscovery:true, onExactAcceptClickCompleted:complete, onAcceptGateFinalRecheck:recheck})
      : runPostRefusalObserver({...settings, firstLayerProof:binding.proof, recipe:r[0]!, recipeCandidates:r,
          allowCanonicalRejectDiscovery:true, onExactRejectClickCompleted:complete, onRejectGateFinalRecheck:recheck});
    const packet = await run(observer);
    assert.equal(packet.interactionDiagnostics?.click.outcome, "completed", JSON.stringify(packet.limitations));
    assert.ok(receipt.completedAtMs);
    assert.ok(binding.proof.expiresAtMs - receipt.completedAtMs >= 200);
    assert.deepEqual(clicks,[`/clicked/${action}`]);
    t.diagnostic(`Verified ${action} receipt with ${binding.proof.expiresAtMs - receipt.completedAtMs} ms reserve`);
    changedDestination = true;
    receipt.completedAtMs = undefined;
    const denied = await run({...observer, actionSearchTimeoutMs:600, resultBudgetMs:1800});
    assert.notEqual(denied.interactionDiagnostics?.click.outcome, "completed");
    assert.equal(receipt.completedAtMs, undefined);
    assert.deepEqual(clicks,[`/clicked/${action}`]);
  });
}
