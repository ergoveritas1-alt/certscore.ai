import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import { buildConsentActionControlProof } from "./cmp-action-control-proof.js";
import { captureConsentControlGeometry } from "./consent-control-geometry.js";
import { readCmpScopeInventory } from "./cmp-scope-inventory.js";
import { readRapidFirstLayerConsentUiObservation } from "./scanners/pre-consent-runtime-scanner.js";

const notice = `<div id="didomi-host"><section class="didomi-notice-banner" role="dialog" aria-label="Cookie choices"><p>We use cookies for analytics. Choose your consent preferences.</p><button id="didomi-notice-agree-button">Accept all</button><button id="didomi-notice-disagree-button">Reject all</button><button id="didomi-notice-learn-more-button">Learn more</button></section></div>`;
const demo = `<div role="dialog" aria-label="Step 1 of 13"><p>Welcome to the Didomi CMP Creating a cookie consent notice is both easy and customizable.</p><button>Next</button><a id="nv-powered-by-navattic">Powered by Navattic</a></div><consent-notices-didomi-skeleton nv_id="captured"><p>Consent notices</p><button>My account</button><button>Go to next step</button></consent-notices-didomi-skeleton>`;

test("Didomi scope binds actual notices, not its empty host, Console IDs, or hidden competing SDK", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const definitions = KNOWN_CMP_REGISTRY.filter(d => ["Didomi", "HubSpot Consent Banner"].includes(d.canonicalName));
    for (const html of ['<div id="didomi-host" aria-hidden="true"></div>', '<div id="single-spa-application:@didomi-spa/navigation"><button>My account</button></div>']) {
      await page.setContent(html);
      assert.deepEqual((await readCmpScopeInventory(page, definitions)).indices, []);
    }
    await page.setContent(notice + '<div hidden id="hs-eu-cookie-confirmation"><button>Accept</button></div>');
    const scope = await readCmpScopeInventory(page, definitions);
    assert.deepEqual(scope.indices.map(i => definitions[i]!.canonicalName), ["Didomi"]);
    assert.equal(scope.scopeStates.find(s => definitions[s.index]!.canonicalName === "Didomi")?.state, "visible");
    await page.setContent(notice.replace('class="didomi-notice-banner"', 'class="didomi-notice-popup"'));
    assert.deepEqual((await readCmpScopeInventory(page, definitions)).indices.map(i => definitions[i]!.canonicalName), ["Didomi"]);
  } finally { await browser.close(); }
});

test("positive Navattic demo markers exclude demo controls from geometry and typed inventory while preserving real first-layer controls", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: {width: 1366, height: 900} });
    await page.route("**/*", route => route.fulfill({contentType:"text/html",body:route.request().url().startsWith("https://capture.navattic.com/") ? demo : notice + '<iframe src="https://capture.navattic.com/captured" style="width:600px;height:300px"></iframe>'}));
    await page.goto("https://publisher.test/");
    const geometry = await captureConsentControlGeometry(page);
    assert.equal(geometry.controlInspection?.captureCoverage.capturedFrameCount, 2, "the demo frame is inspected, not skipped");
    assert.equal(geometry.controlInspection?.structuralCoverage, "complete");
    assert.ok(geometry.candidates.some(c => c.label === "Accept all"));
    assert.ok(geometry.candidates.some(c => c.label === "Reject all"));
    assert.ok(!geometry.candidates.some(c => /Next|My account|Go to next step/.test(c.label)));
    const observation = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 1500);
    assert.ok(observation.controls.some(c => c.label === "Reject all"));
    assert.ok(!observation.controls.some(c => /Next|My account|Go to next step/.test(c.label)));
    assert.equal(await page.locator("iframe").count(), 1, "runtime iframe evidence remains available");
    const frame = page.frames().find(f => f !== page.mainFrame())!;
    await frame.locator("body").evaluate((body, markup) => body.insertAdjacentHTML("beforeend", markup), notice);
    const withActualFrameCmp = await captureConsentControlGeometry(page);
    assert.ok(withActualFrameCmp.candidates.some(c => c.label === "Reject all" && c.frameContext.frameKind === "child_frame"), "an actual CMP alongside demo surfaces remains in inventory");
  } finally { await browser.close(); }
});

test("demo exclusion requires child frame, exact origin AND positive marker; genuine iframe CMP remains", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const variant of ["main_marker", "wrong_origin", "missing_marker", "genuine_cmp"]) {
      const childOrigin = variant === "wrong_origin" ? "https://capture.navattic.com.evil.test" : "https://capture.navattic.com";
      await page.route("**/*", route => route.fulfill({contentType:"text/html",body:route.request().url().startsWith(childOrigin) || variant === "main_marker" ? notice + (variant === "missing_marker" || variant === "genuine_cmp" ? "" : '<a id="nv-powered-by-navattic">Demo marker</a>') : `<main>Publisher</main><iframe src="${childOrigin}/fixture"></iframe>`}));
      await page.goto("https://publisher.test/" + variant);
      const geometry = await captureConsentControlGeometry(page);
      assert.ok(geometry.candidates.some(c => c.label === "Reject all"), variant);
      await page.unroute("**/*");
    }
  } finally { await browser.close(); }
});


test("Didomi exact descriptive aria label remains authoritative and contradictory visible text prevents Accept proof", async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    const markup = notice.replace('id="didomi-notice-agree-button"', 'id="didomi-notice-agree-button" aria-label="I agree: Agree to our data processing and close"');
    await page.setContent(markup);
    const prove = () => buildConsentActionControlProof({action: "accept", cmpId: "Didomi", page,
      control: page.locator("#didomi-notice-agree-button"), selectorHint: "#didomi-notice-agree-button",
      observedAtMs: 1, recipeId: "canonical-cmp:Didomi:accept:v1"});
    const proof = await prove();
    assert.equal(proof.status, "verified");
    if (proof.status === "verified") assert.equal(proof.proof.labelSource, "aria_label");
    await page.locator("#didomi-notice-agree-button").evaluate(button => button.textContent = "Reject all");
    assert.equal((await prove()).status, "label_mismatch");
    await page.locator("#didomi-notice-agree-button").evaluate(button => {button.textContent = "Accept all"; button.setAttribute("aria-label", "Unrecognized action");});
    assert.equal((await prove()).status, "label_unverifiable", "never replace an unknown accessible label with visible text");
  } finally {await browser.close();}
});
