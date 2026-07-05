import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Browser, type Page } from "playwright";
import { detectConsentUi } from "./scanners/pre-consent-runtime-scanner.js";

let browser: Browser | undefined;

test.before(async () => {
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
});

test("detectConsentUi exits bounded wait when delayed Polish controls appear", async () => {
  const page = await newPageWithDelayedBanner(`
    <div id="banner" role="dialog" aria-modal="true" style="position: fixed; left: 160px; top: 120px; width: 760px; padding: 24px; background: white;">
      <h1>Dbamy o Twoją prywatność</h1>
      <p>Używamy plików cookie i prosimy o zgodę na personalizację reklam oraz pomiar statystyk.</p>
      <button type="button" aria-label="USTAWIENIA ZAAWANSOWANE">USTAWIENIA ZAAWANSOWANE</button>
      <button type="button">AKCEPTUJĘ</button>
    </div>
  `);
  try {
    const startedAt = Date.now();
    const observation = await detectConsentUi(page, startedAt, 4_000, {
      waitForActionableChoiceControls: true,
      waitForControlsOnTextOnlySurface: true,
    });
    const durationMs = Date.now() - startedAt;

    assert.equal(observation.acceptControlObserved, true);
    assert.equal(observation.managePreferencesControlObserved, true);
    assert.equal(observation.visibleChoiceLabels.includes("AKCEPTUJĘ"), true);
    assert.equal(
      observation.visibleChoiceLabels.some((label) => label.startsWith("USTAWIENIA ZAAWANSOWANE")),
      true,
    );
    assert.ok(durationMs < 3_000, `delayed Polish controls should not burn the full wait window (${durationMs}ms)`);
  } finally {
    await page.close();
  }
});

test("detectConsentUi exits bounded wait when delayed Dutch controls appear", async () => {
  const page = await newPageWithDelayedBanner(`
    <div id="banner" role="dialog" aria-modal="true" style="position: fixed; left: 160px; top: 120px; width: 720px; padding: 24px; background: white;">
      <h1>Wij gebruiken cookies</h1>
      <p>Wij vragen toestemming voor cookies, privacy-instellingen en advertentievoorkeuren.</p>
      <button type="button">Cookie-instellingen</button>
      <button type="button">Alles weigeren</button>
      <button type="button">Alles accepteren</button>
    </div>
  `);
  try {
    const startedAt = Date.now();
    const observation = await detectConsentUi(page, startedAt, 4_000, {
      waitForActionableChoiceControls: true,
      waitForControlsOnTextOnlySurface: true,
    });
    const durationMs = Date.now() - startedAt;

    assert.equal(observation.acceptControlObserved, true);
    assert.equal(observation.rejectControlObserved, true);
    assert.equal(observation.managePreferencesControlObserved, true);
    assert.deepEqual(
      observation.visibleChoiceLabels,
      ["Cookie-instellingen", "Alles weigeren", "Alles accepteren"],
    );
    assert.ok(durationMs < 3_000, `delayed Dutch controls should not burn the full wait window (${durationMs}ms)`);
  } finally {
    await page.close();
  }
});

async function newPageWithDelayedBanner(bannerHtml: string): Promise<Page> {
  assert.ok(browser);
  const page = await browser.newPage();
  await page.setContent(`
    <!doctype html>
    <html>
      <head><meta charset="utf-8"></head>
      <body>
        <main><h1>Publisher page</h1><p>Article content.</p></main>
        <script>
          setTimeout(() => {
            const root = document.createElement("section");
            root.id = "consent-root";
            root.innerHTML = ${JSON.stringify(bannerHtml)};
            document.body.appendChild(root);
          }, 180);
        </script>
      </body>
    </html>
  `);
  return page;
}
