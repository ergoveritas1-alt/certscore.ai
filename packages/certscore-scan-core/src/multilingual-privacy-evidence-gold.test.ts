import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyConsentControlLabel,
  classifyPrivacySurface,
  SUPPORTED_PRIVACY_EVIDENCE_LOCALES,
} from "@certscore/contracts";
import { chromium, type Browser } from "playwright";
import { captureConsentControlGeometry } from "./consent-control-geometry.js";
import {
  MULTILINGUAL_GOLD_NEGATIVE_CONTROLS,
  MULTILINGUAL_PRIVACY_EVIDENCE_GOLD_FIXTURES,
} from "./test-fixtures/multilingual-privacy-evidence-gold.js";

let browser: Browser | undefined;

test.before(async () => {
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
});

test("multilingual privacy-evidence gold corpus is complete and independently exercises all 40 locales", () => {
  assert.equal(MULTILINGUAL_PRIVACY_EVIDENCE_GOLD_FIXTURES.length, 40);
  assert.deepEqual(
    MULTILINGUAL_PRIVACY_EVIDENCE_GOLD_FIXTURES.map((fixture) => fixture.locale),
    [...SUPPORTED_PRIVACY_EVIDENCE_LOCALES],
  );

  for (const fixture of MULTILINGUAL_PRIVACY_EVIDENCE_GOLD_FIXTURES) {
    const privacy = classifyPrivacySurface({
      linkText: fixture.privacyPolicy,
      localeHints: [fixture.locale],
    });
    assert.equal(privacy.surfaceType, "privacy_policy", `${fixture.locale} privacy policy`);
    assert.equal(privacy.matchedLocale, fixture.locale, `${fixture.locale} privacy locale`);

    const cookies = classifyPrivacySurface({
      linkText: fixture.cookiePolicy,
      localeHints: [fixture.locale],
    });
    assert.equal(cookies.surfaceType, "cookie_policy", `${fixture.locale} cookie policy`);
    assert.equal(cookies.matchedLocale, fixture.locale, `${fixture.locale} cookie locale`);

    for (const [expectedIntent, label] of [
      ["accept", fixture.accept],
      ["reject", fixture.reject],
      ["options", fixture.options],
    ] as const) {
      const classification = classifyConsentControlLabel({
        label,
        localeHints: [fixture.locale],
      });
      assert.equal(classification.intent, expectedIntent, `${fixture.locale} ${label}`);
      assert.equal(classification.matchedLocale, fixture.locale, `${fixture.locale} ${label} locale`);
    }

    const necessaryOnly = classifyConsentControlLabel({
      label: fixture.necessaryOnly,
      contextText: `${fixture.consentContext} ${fixture.cookiePolicy}`,
      localeHints: [fixture.locale],
    });
    assert.equal(necessaryOnly.intent, "reject", `${fixture.locale} necessary-only intent`);
    assert.equal(necessaryOnly.variant, "necessary_only", `${fixture.locale} necessary-only variant`);
  }
});

test("multilingual gold corpus retains first-layer controls through browser geometry capture", async () => {
  assert.ok(browser, "browser not initialized");

  for (const fixture of MULTILINGUAL_PRIVACY_EVIDENCE_GOLD_FIXTURES) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    try {
      await page.setContent(`<!doctype html>
        <html lang="${fixture.locale}">
          <head><meta charset="utf-8"></head>
          <body>
            <main><h1>Fixture ${fixture.locale}</h1></main>
            <footer>
              <a href="/${fixture.locale}/privacy-policy">${fixture.privacyPolicy}</a>
              <a href="/${fixture.locale}/cookie-policy">${fixture.cookiePolicy}</a>
            </footer>
            <section role="dialog" aria-modal="true" aria-label="${fixture.consentContext} cookies"
              style="position:fixed;left:80px;bottom:40px;width:720px;padding:24px;background:white;border:1px solid #111;z-index:1000">
              <p>${fixture.consentContext}. Cookies and consent preferences.</p>
              <button type="button">${fixture.reject}</button>
              <button type="button">${fixture.options}</button>
              <button type="button">${fixture.accept}</button>
            </section>
          </body>
        </html>`, { waitUntil: "domcontentloaded" });

      const artifact = await captureConsentControlGeometry(page, {
        screenshotArtifactRef: `gold-${fixture.locale}.png`,
      });
      assert.equal(artifact.summary.firstLayerAccept, true, `${fixture.locale} accept retained`);
      assert.equal(artifact.summary.firstLayerReject, true, `${fixture.locale} reject retained`);
      assert.equal(artifact.summary.firstLayerOptions, true, `${fixture.locale} options retained`);

      for (const [label, actionType] of [
        [fixture.accept, "accept_all"],
        [fixture.reject, "reject_all"],
        [fixture.options, "manage_preferences"],
      ] as const) {
        const candidate = artifact.candidates.find((item) => item.label === label);
        assert.equal(candidate?.actionType, actionType, `${fixture.locale} ${label} action`);
        assert.equal(candidate?.matchedLocale, fixture.locale, `${fixture.locale} ${label} locale`);
        assert.equal(candidate?.decisionStatus, "confirmed_visible", `${fixture.locale} ${label} visibility`);
        assert.equal(candidate?.screenshotArtifactRef, `gold-${fixture.locale}.png`, `${fixture.locale} ${label} evidence ref`);
      }
    } finally {
      await page.close();
    }
  }
});

test("generic page controls remain outside multilingual consent evidence", async () => {
  assert.ok(browser, "browser not initialized");
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  try {
    await page.setContent(`<!doctype html><html><body>
      <main>
        <h1>Account dashboard</h1>
        <p>Choose newsletter and account preferences.</p>
        <button>${MULTILINGUAL_GOLD_NEGATIVE_CONTROLS.accept}</button>
        <button>${MULTILINGUAL_GOLD_NEGATIVE_CONTROLS.reject}</button>
        <button>${MULTILINGUAL_GOLD_NEGATIVE_CONTROLS.options}</button>
      </main>
    </body></html>`, { waitUntil: "domcontentloaded" });
    const artifact = await captureConsentControlGeometry(page);
    assert.equal(artifact.summary.firstLayerAccept, false);
    assert.equal(artifact.summary.firstLayerReject, false);
    assert.equal(artifact.summary.firstLayerOptions, false);
  } finally {
    await page.close();
  }
});
