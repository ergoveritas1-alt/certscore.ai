import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { readRapidFirstLayerConsentUiObservation } from "./scanners/pre-consent-runtime-scanner";

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
