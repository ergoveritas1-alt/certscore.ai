import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { chromium, type Page } from "playwright";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { deriveAcceptFirstLayerProof } from "./accept-first-layer-gate.js";
import { capturePassiveConsentControlGeometry } from "./consent-control-geometry.js";
import { readDocumentedConsentApi } from "./documented-consent-api.js";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";
import { evaluateRejectGate, readRejectFirstLayerProof } from "./reject-gate-shadow-receipt.js";
import { readRapidFirstLayerConsentUiObservation } from "./scanners/pre-consent-runtime-scanner.js";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const url = "https://cookie-information-button.example/";

for (const action of ["accept", "reject"] as const) {
  test(`Cookie Information ${action} binds the rendered caption and rechecks the exact ARIA-labelled button`, async t => {
    const accept = action === "accept";
    const ariaLabel = accept ? "Accept all" : "Decline all";
    const className = accept ? "coi-banner__accept" : "coi-banner__decline";
    const buttonId = accept ? "choice" : "declineButton";
    const selector = "#" + buttonId;
    const browser = await chromium.launch({args:["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"]});
    t.after(() => browser.close());
    let page: Page;
    let clicks = 0;
    let contexts = 0;
    const newContext = browser.newContext.bind(browser);
    t.mock.method(browser, "newContext", async (options: Parameters<typeof newContext>[0]) => {
      const context = await newContext({...options, serviceWorkers:"block"});
      const passiveCapture = ++contexts === 1;
      context.on("page", opened => {page = opened;});
      await context.route("**/*", route => {
        if (route.request().url() === url + "click") {
          clicks++;
          return route.fulfill({status:204});
        }
        if (route.request().url() === url + "hold.js") {
          if (passiveCapture) return route.fulfill({contentType:"text/javascript",body:""});
          return; // Leave the worker's unrelated deferred script pending.
        }
        if (route.request().url() !== url) return route.abort();
        return route.fulfill({contentType:"text/html", body:`<!doctype html>
          <div id="coiOverlay" role="banner" style="padding: 24px"><div id="coi-banner-wrapper" class="coi-banner__wrapper" style="width: 420px"
              role="dialog" aria-modal="true" aria-label="Cookie preferences">
          <p>We use optional cookies to measure website performance.</p>
          <button id="${buttonId}" class="${className}" aria-label="${ariaLabel}">${ariaLabel.toUpperCase()}</button>
          </div></div><aside id="cookie-information-help" hidden>Cookie information</aside><script>
          window.cicl=['cookie_cat_necessary','cookie_cat_functional'];
          window.cicc={cookie_cat_necessary:true};
          window.CookieInformation={getConsentGivenFor:key=>window.cicc[key]};
          document.addEventListener('click',e=>{if(e.target.id==='${buttonId}'){
            fetch('/click');
            window.cicc.cookie_cat_functional=${accept};
            document.querySelector('#coiOverlay').remove();
            dispatchEvent(new Event('CookieInformationConsentGiven'));
          }});
          </script>${accept ? "" : '<script defer src="/hold.js"></script>'}`});
      });
      return context;
    });
    const passive = await browser.newContext();
    const capturedPage = await passive.newPage();
    await capturedPage.goto(url);
    const client = await passive.newCDPSession(capturedPage);
    const documentIdentity = {source:"cdp_loader_id" as const, token:(await client.send("Page.getFrameTree")).frameTree.frame.loaderId};
    const observation = await readRapidFirstLayerConsentUiObservation(capturedPage, Date.now(), 1500);
    const geometry = await capturePassiveConsentControlGeometry(capturedPage, {documentIdentity, timeoutMs:1500});
    await passive.close();
    const candidate = geometry.candidates.find(row => row.selectorHint === selector);
    assert.equal(candidate?.label, ariaLabel.toUpperCase());
    assert.equal(candidate.ariaLabel, ariaLabel);
    assert.equal(candidate.containerSelectorHint, "#coi-banner-wrapper");
    assert.ok(observation.controls.some(row => row.selectorHint === selector));
    // The retained Appodeal inventory used the rendered caption for this selector.
    const controls = observation.controls.map(row => row.selectorHint === selector ? {...row,label:candidate.label} : row);
    const scanId = `cookie-information-${action}`;
    const bundle = {
      url, scanId, domSnapshots:[{url,documentIdentity,artifactId:"dom_text_pre_consent",consentStateAtTime:"pre_consent"}],
      consentSurfaceInspection:{inspectedPreInteraction:true,actionableControlObserved:true},
      consentUiObservations:[{...observation,controls,documentIdentity,documentUrl:url,captureDiagnostics:{
        ...observation.captureDiagnostics,completedChannels:[...observation.captureDiagnostics!.completedChannels,"geometry"]}}],
    } as CanonicalEvidenceBundle;
    const parentDispatchSha256 = hash(scanId);
    for (const replacement of [false,true]) {
      const bytes = Buffer.from(JSON.stringify(geometry));
      const nowMs = Date.now();
      const proofInput = {bundle,scanId,targetUrl:url,parentDispatchSha256,sourceSha256:hash(JSON.stringify(bundle)),nowMs,
        deadlineAtMs:nowMs+6000,requireExactSelector:true,geometry:{bytes,sha256:hash(bytes),sizeBytes:bytes.length}};
      const checks: string[] = [];
      let replaced: Promise<void> | undefined;
      let readinessAtDispatch: Promise<string> | undefined;
      const baselineClicks = clicks;
      const options = {
        browser,url,scanId,parentScanId:scanId,
        interactionAuthorization:{kind:"scan_target" as const,normalizedUrl:url,scanId,authorizationId:"sharded_scan_exact_target.v1" as const},
        actionSearchTimeoutMs:2500,resultBudgetMs:6500,confirmationTimeoutMs:400,observationWindowMs:300,
        onLifecycleEvent:() => {
          if (!accept && !readinessAtDispatch) readinessAtDispatch = page.evaluate(() => document.readyState);
          if (replacement && !replaced) replaced = page.locator(selector).evaluate(button => button.replaceWith(button.cloneNode(true)));
        },
      };
      const packet = await (async () => {
        if (accept) {
          const recipe = buildCanonicalPostAcceptActionRecipes().find(row => row.cmpId === "Cookie Information");
          const proof = deriveAcceptFirstLayerProof(proofInput);
          assert.ok(recipe && proof);
          assert.equal(proof.labelSource, "aria_label");
          assert.equal(proof.labelSha256, hash(ariaLabel));
          assert.equal(proof.expiresAtMs - proof.issuedAtMs, 6000);
          return runPostAcceptObserver({...options,recipe,firstLayerProof:proof,onAcceptGateFinalRecheck:value=>checks.push(value)});
        }
        const recipe = buildCanonicalPostRefusalActionRecipes().find(row => row.cmpId === "Cookie Information");
        const proof = readRejectFirstLayerProof({...evaluateRejectGate(proofInput),scanId});
        assert.ok(recipe && proof);
        assert.equal(proof.binding.labelSource, "aria_label");
        assert.equal(proof.binding.labelSha256, hash(ariaLabel));
        assert.equal(proof.expiresAtMs - proof.issuedAtMs, 6000);
        return runPostRefusalObserver({...options,recipe,firstLayerProof:proof,onRejectGateFinalRecheck:value=>checks.push(value)});
      })();
      await replaced;
      if (!accept) assert.equal(await readinessAtDispatch, "interactive");
      assert.deepEqual(checks,[replacement ? "failed" : "passed"],JSON.stringify(packet.limitations));
      assert.equal(packet.interactionDiagnostics?.click.outcome,replacement ? "not_attempted" : "completed");
      assert.equal(clicks-baselineClicks,replacement ? 0 : 1);
      const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
      if (!replacement) {
        assert.ok(registration.actionDispatchedAtMs! < 6000);
        assert.equal(registration.status,"confirmed",JSON.stringify(packet.confirmationDiagnostics));
        assert.ok(registration.witnesses.some(witness=>witness.witnessType==="cmp_api_state" && witness.key==="cookie_information"));
      }
    }
  });
}

test("Cookie Information SDK state must follow a trusted click on the original owning button", async t => {
  const browser = await chromium.launch({args:["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"]});
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route("**/*", route => route.abort());
  await page.setContent(`
    <div id="coiOverlay"><button id="choice">Accept all</button></div>
    <div id="cookie-information-help"><button id="other">Accept all</button></div>
    <script>
      window.cicl=['cookie_cat_necessary','cookie_cat_functional'];
      window.cicc={cookie_cat_necessary:true};
      window.CookieInformation={getConsentGivenFor:key=>window.cicc[key]};
      document.addEventListener('click',event=>{
        if(event.target.id==='choice') document.querySelector('#coiOverlay').remove();
        window.cicc.cookie_cat_functional=true;
        dispatchEvent(new Event('CookieInformationConsentGiven'));
      });
    </script>`);
  const read = (actionDispatchedAtEpochMs: number) =>
    readDocumentedConsentApi(page, "cookie_information", undefined, {actionDispatchedAtEpochMs});
  const choice = page.locator("#choice");
  const other = page.locator("#other");
  assert.equal(await readDocumentedConsentApi(page, "cookie_information", undefined, {control:other}), undefined);
  const baseline = await readDocumentedConsentApi(page, "cookie_information", undefined, {control:choice});
  assert.equal(baseline?.eventSequence, 0);
  const dispatchTime = Date.now();
  await other.click();
  assert.equal(await read(dispatchTime), undefined);
  await choice.evaluate(button => button.dispatchEvent(new MouseEvent("click", {bubbles:true})));
  assert.equal(await read(dispatchTime), undefined);
  // The synthetic click removed the original owner. A new matching node cannot inherit the binding.
  await page.locator("body").evaluate(body => body.insertAdjacentHTML("afterbegin", '<div id="coiOverlay"><button id="choice">Accept all</button></div>'));
  await choice.click();
  assert.equal(await read(dispatchTime), undefined);
  await page.evaluate(() => document.body.insertAdjacentHTML("afterbegin",
    '<div id="coiOverlay"><button id="choice">Accept all</button></div><div id="coiOverlay"></div>'));
  const reasons: string[] = [];
  assert.equal(await readDocumentedConsentApi(page, "cookie_information", reason => reasons.push(reason), {control:choice}), undefined);
  assert.deepEqual(reasons, ["receipt_ambiguous"]);
});
