import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { capturePassiveConsentControlGeometry } from "./consent-control-geometry.js";
import { evaluateFinalConsentGeometryEligibility } from "./consent-final-geometry-refresh.js";
import { readRapidFirstLayerConsentUiObservation, reconcileConsentUiObservationWithCompletedGeometry } from "./scanners/pre-consent-runtime-scanner.js";

test("a settled four-frame inventory can refresh a previously observed exact button and preserves the arrow on a refusal", async t => {
  const flags = ["CERTSCORE_ACCEPT_GATE_PRODUCTION_SHADOW", "CERTSCORE_REJECT_GATE_PRODUCTION_SHADOW"];
  for (const flag of flags) {
    const prior = process.env[flag];
    process.env[flag] = "1";
    t.after(() => { if (prior === undefined) delete process.env[flag]; else process.env[flag] = prior; });
  }
  const browser = await chromium.launch({ args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"] });
  t.after(() => browser.close());
  const page = await browser.newPage({ serviceWorkers: "block" });
  const url = "http://127.0.0.1/retained-fixture";
  let releaseImage!: () => void;
  const image = new Promise<void>(resolve => { releaseImage = resolve; });
  await page.route("**/*", async route => {
    if (route.request().url() === url + "/loading-image") {
      await image;
      await route.fulfill({ status: 204 });
    } else if (route.request().url() === url) {
      await route.fulfill({ contentType: "text/html; charset=utf-8", body: `
        <div id="onetrust-banner-sdk" role="dialog"><p>We use cookies. Choose optional cookies.</p>
          <div id="onetrust-button-group"><button id="onetrust-accept-btn-handler">I Accept</button></div>
          <div id="onetrust-close-btn-container"><button class="onetrust-close-btn-handler">Continue without Accepting →</button></div>
        </div>
        <iframe srcdoc="one"></iframe><iframe srcdoc="two"></iframe><iframe srcdoc="three"></iframe>
        <img src="/retained-fixture/loading-image"><script>window.OneTrust = {};</script>` });
    } else {
      await route.abort();
    }
  });
  const started = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const cdp = await page.context().newCDPSession(page);
  const identity = { source: "cdp_loader_id" as const, token: (await cdp.send("Page.getFrameTree")).frameTree.frame.loaderId };
  const early = await capturePassiveConsentControlGeometry(page, { documentIdentity: identity, timeoutMs: 1500 });
  releaseImage();
  await page.waitForLoadState("load");
  assert.equal(early.controlInspection?.captureCoverage.documentReadyState, "interactive");
  assert.equal(early.controlInspection?.captureCoverage.capturedFrameCount, 4);
  const inventory = await readRapidFirstLayerConsentUiObservation(page, started, 1500);
  const observation = { ...inventory, documentIdentity: identity, documentUrl: url, documentReadyState: "complete" as const,
    inventoryOutcome: "partial" as const, basis: [...inventory.basis, "settled_control_inventory_completed"] };
  const eligibility = (row: typeof observation) => evaluateFinalConsentGeometryEligibility({ observation: row, geometry: early, scanStartedAtMs: started });
  assert.ok("reason" in eligibility(observation));
  assert.deepEqual(eligibility({ ...observation, controls: [] }), { blocker: "inventory_outcome_unsupported" });
  assert.deepEqual(eligibility({ ...observation, documentIdentity: { ...identity, token: "different" } }), { blocker: "geometry_document_mismatch" });
  const fresh = await capturePassiveConsentControlGeometry(page, { documentIdentity: identity, timeoutMs: 1500 });
  const updated = reconcileConsentUiObservationWithCompletedGeometry({ current: observation, geometry: fresh,
    geometryAccessLoaded: true, pageUrl: url, scanStartedAtMs: started });
  assert.ok(updated.controls.some(control => control.actionType === "reject_all" &&
    control.selectorHint === "button.onetrust-close-btn-handler" && control.label === "Continue without Accepting →"));
});
