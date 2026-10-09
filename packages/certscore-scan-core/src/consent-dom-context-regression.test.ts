import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { captureConsentControlGeometry } from "./consent-control-geometry";
import {
  consentUiObservationFromConfirmedGeometryControls,
  consentGateStablePartialDisposition,
  isStableConsentProofPacket,
  readRapidFirstLayerConsentUiObservation,
  shouldExitStablePartialConsentGate,
} from "./scanners/pre-consent-runtime-scanner";

test("quoted privacy control resolves inspection while the gate independently requires retained geometry", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await page.route("**/*", route => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><body></body>" }));
    await page.goto("https://consent-fixture.test/");
    // Virtual checkpoint times exercise the gate without adding a real wait.
    // The near-match remains unresolved; only the exact reviewed label resolves.
    for (const [label, resolved] of [
      ['"Do Not Sell My Personal Information please"', false],
      ['"Do Not Sell My Personal Information"', true],
    ] as const) {
      await page.setContent(`<section id="truste-consent-track" role="dialog" aria-label="Cookie choices" style="position:fixed;bottom:0;background:white;padding:20px">
        <div id="truste-consent-text"><p>We use cookies and similar technologies. Choose your preferences.</p>
        <button id="truste-consent-button">Accept all</button><button id="truste-show-consent">${label}</button></div></section>`);
      const startedAt = Date.now();
      const dom = await readRapidFirstLayerConsentUiObservation(page, startedAt, 1_500, "retry");
      assert.equal(dom.acceptControlObserved, true);
      assert.equal(dom.rejectControlObserved, false);
      assert.equal(dom.managePreferencesControlObserved, false);
      // Rapid DOM inventory exposes A/R/O; geometry owns unresolved decision
      // completeness. Unknown decisions must remain partial.
      if (resolved) assert.equal(dom.inventoryOutcome, "complete_with_controls");
      const geometry = await captureConsentControlGeometry(page, { screenshotArtifactRef: "fixture.png" });
      const screenshot = await page.screenshot();
      const observation = consentUiObservationFromConfirmedGeometryControls({ geometry, scanStartedAtMs: startedAt });
      assert.ok(observation);
      assert.equal(observation.basis.includes("unresolved_visible_consent_decision"), !resolved);
      assert.equal(observation.inventoryOutcome, resolved ? "complete_with_controls" : "partial");
      if (resolved) {
        for (const geometryArtifactWritten of [false, true]) {
          const proofStable = isStableConsentProofPacket({ geometryArtifactWritten, observation, representativeScreenshotAvailable: screenshot.length > 0 });
          assert.equal(proofStable, geometryArtifactWritten);
          assert.equal(shouldExitStablePartialConsentGate({ controlCount: observation.controls.length, progressObserved: false, proofStable, stableForMs: 1_999 }), false);
          assert.equal(shouldExitStablePartialConsentGate({ controlCount: observation.controls.length, progressObserved: false, proofStable, stableForMs: 2_000 }), geometryArtifactWritten);
        }
        assert.equal(consentGateStablePartialDisposition(10_000, false), "exit");
      }
    }
  } finally {
    await browser.close();
  }
});

test("A/R/O DOM inventory excludes navigation labels as their own consent context", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await page.route("https://consent-fixture.test/", route => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><body></body>" }));
    await page.goto("https://consent-fixture.test/");
    for (const offset of [100, 934]) {
      await page.setContent(`<main><h1>Log into your account</h1></main>
        <div style="position:absolute;top:${offset}px"><div><a href="/privacy">Privacy Policy</a></div>
        <div class="privacy-center"><a href="/privacy-center">Privacy Center</a></div><div><a href="/cookies">Cookies</a></div></div>`);
      const observation = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 1_500, "retry");
      assert.equal(observation.controls.some(control => control.actionType === "manage_preferences"), false, `navigation at y=${offset}`);
    }
    await page.setContent(`<section role="dialog" aria-label="Cookie notice"><p>We use cookies to personalize content.</p><a href="/privacy">Learn more</a></section>`);
    const informational = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 1_500, "retry");
    assert.equal(informational.controls.some(control => control.actionType === "manage_preferences"), false);
    await page.setContent(`<section role="dialog" aria-label="Cookie choices">
      <p>We use cookies and similar technologies. Choose your preferences.</p>
      <button>Accept all</button><button>Reject all</button><a href="#privacy-center">Privacy Center</a></section>`);
    const observation = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 1_500, "retry");
    assert.ok(observation.controls.some(control => control.actionType === "manage_preferences" && control.visible));
    assert.equal(observation.acceptControlObserved, true);
    assert.equal(observation.rejectControlObserved, true);
    await page.setContent(`<section role="dialog" aria-label="Cookie consent"><p>We use cookies and let you choose preferences.</p><a href="http://www.example.test/privacy">Privacy Center</a></section>`);
    const navigation = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 1_500, "retry");
    assert.equal(navigation.managePreferencesControlObserved, false);
    assert.ok(navigation.basis.includes("unresolved_visible_consent_decision"));
    assert.equal(navigation.inventoryOutcome, "partial");
  } finally {
    await browser.close();
  }
});
