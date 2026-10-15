import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Browser } from "playwright";
import { verifyConsentControlInspection } from "@certscore/contracts";
import { captureConsentControlGeometry } from "./consent-control-geometry";
import { consentUiObservationFromConfirmedGeometryControls } from "./scanners/pre-consent-runtime-scanner";

let browser: Browser;
test.before(async () => { browser = await chromium.launch({ headless: true }); });
test.after(async () => { await browser?.close(); });

// Structure retained from the independent Ireland visit. No live site requests,
// cookie values or interactions are needed to exercise the passive recipe.
const panel = `<style>section{position:fixed;bottom:20px;left:20px;background:white;padding:24px;width:420px}label{display:block}input{width:20px;height:20px}button{padding:12px;margin:4px}</style>
<section role="dialog" aria-label="Cookie preferences"><p>We use cookies for analytics. Choose your cookie preferences.</p>
<label>Toggle all<input type="checkbox"></label><label>Google Analytics 4<input type="checkbox"></label><label>Hubspot<input type="checkbox"></label>
<input id="axeptio_consent_checkbox" type="checkbox" hidden>
<button id="axeptio_btn_close" aria-label="Close cookie settings">Close</button>
<button id="axeptio_btn_acceptAllAndNext">OK, accept all</button>
<button id="axeptio_btn_next" aria-label="Go to the next cookie settings page">Next</button>
<button id="axeptio_main_button" aria-label="Close the widget without accepting cookie settings">Cookies</button></section>`;

async function capture(change: (html: string) => string = html => html, shadow = true) {
  const page = await browser.newPage();
  try {
    await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><main>Public website</main><div id='host'></div>" }));
    await page.goto("https://axeptio-fixture.test/");
    await page.evaluate(({ html, shadow }) => {
      const host = document.querySelector("#host")!;
      const root = shadow ? host.attachShadow({ mode: "open" }) : host;
      root.innerHTML = html;
      (window as unknown as { clicks: number }).clicks = 0;
      root.addEventListener("click", () => { (window as unknown as { clicks: number }).clicks++; });
    }, { html: change(panel), shadow });
    const geometry = await captureConsentControlGeometry(page, { timeoutMs: 2000 });
    assert.equal(await page.evaluate(() => (window as unknown as { clicks: number }).clicks), 0);
    return geometry;
  } finally { await page.close(); }
}

test("Axeptio all-off Close is a retained necessary-only control, without a click or registration claim", async () => {
  const geometry = await capture();
  const close = geometry.candidates.find(candidate => candidate.label === "Close")!;
  assert.equal(close.initialSelection?.recipe, "axeptio.initial_optional_off_close.v1");
  assert.equal(close.actionType, "reject_all");
  assert.ok(close.classifierReasonCodes?.includes("observation_only_label"));
  assert.equal(geometry.summary.firstLayerReject, true);
  assert.ok(verifyConsentControlInspection(geometry.controlInspection, geometry.candidates));
  const observation = consentUiObservationFromConfirmedGeometryControls({ geometry, scanStartedAtMs: Date.now() - 1000 });
  assert.equal(observation?.rejectControlObserved, false, "simple bundle controls cannot discard the required category proof");
  assert.equal(geometry.candidates.find(candidate => candidate.label === "Cookies")?.actionType === "reject_all", false);
});

test("custom checkbox paint does not hide its visible labelled Axeptio category", async () => {
  const geometry = await capture(html => html.replaceAll('type="checkbox"', 'type="checkbox" style="opacity:0;position:absolute"'));
  assert.equal(geometry.summary.firstLayerReject, true);
});

for (const [name, change, shadow] of [
  ["checked optional input", (html: string) => html.replace('type="checkbox"', 'type="checkbox" checked'), true],
  ["disabled optional input", (html: string) => html.replace('type="checkbox"', 'type="checkbox" disabled'), true],
  ["unexpected radio input", (html: string) => html.replace('type="checkbox"', 'type="radio"'), true],
  ["hidden optional category", (html: string) => html.replace('<label>', '<label style="display:none">'), true],
  ["explicitly hidden optional input", (html: string) => html.replace('type="checkbox"', 'type="checkbox" hidden'), true],
  ["missing labels", (html: string) => html.replaceAll("<label>", "<div>").replaceAll("</label>", "</div>"), true],
  ["duplicate Close", (html: string) => html.replace("</section>", '<button id="axeptio_btn_close" aria-label="Close cookie settings">Close</button></section>'), true],
  ["wrong accessible label", (html: string) => html.replace("Close cookie settings", "Close dialog"), true],
  ["missing registered widget", (html: string) => html.replace("axeptio_main_button", "unrelated_widget"), true],
  ["ordinary document Close", (html: string) => html, false],
] as const) {
  test(`Axeptio Close fails closed with ${name}`, async () => {
    const geometry = await capture(change, shadow);
    assert.equal(geometry.summary.firstLayerReject, false, JSON.stringify(geometry.candidates));
  });
}
