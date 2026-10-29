import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Browser } from "playwright";
import { captureConsentControlGeometry } from "./consent-control-geometry";
import { liveConsentActionCmp } from "./consent-action-recipe-priority";

let browser: Browser;
test.before(async () => { browser = await chromium.launch({headless: true}); });
test.after(async () => { await browser.close(); });

const identity = {source: "cdp_loader_id", token: "attribution-fixture-loader"} as const;
for (const [name, marker] of [
  ["WPConsent", 'id="wpconsent-container"'],
  ["Complianz", 'class="cmplz-cookiebanner"'],
  ["CookieHub", 'class="ch2-dialog"'],
  ["Klaro", 'class="klaro"'],
  ["OneTrust", 'id="onetrust-banner-sdk"'],
] as const) test(`shadow-root ${name} identity stays with its live controls`, async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`<main>Public content</main><div id="host"></div>`);
    await page.evaluate(marker => {
      const root = document.getElementById("host")!.attachShadow({mode: "open"});
      root.innerHTML = `<section ${marker} role="dialog"><p>Choose optional analytics cookies.</p><button>Accept all</button><button>Reject all</button></section>`;
      (window as any).fixtureClicks = 0;
      document.addEventListener("click", () => { (window as any).fixtureClicks++; });
    }, marker);
    const geometry = await captureConsentControlGeometry(page, {documentIdentity: identity, timeoutMs: 1000});
    assert.equal(geometry.cmp.name, name);
    assert.deepEqual(geometry.documentIdentity, identity);
    assert.ok(geometry.cmp.matchedSignals.some(signal => signal.source === "dom"));
    assert.ok(geometry.candidates.some(candidate => candidate.label === "Accept all"));
    assert.equal(await liveConsentActionCmp(page.getByRole("button", {name: "Accept all", exact: true}), [], Date.now() + 1000), name);
    assert.equal(await page.evaluate(() => (window as any).fixtureClicks), 0);
  } finally { await page.close(); }
});

for (const name of ["cookiehub", "CookieScript"] as const) test(`canonical global ${name} is captured without invoking its getter or binding an unrelated control`, async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`<section role="dialog"><p>Choose optional cookies.</p><button>Accept all</button></section>`);
    await page.evaluate(name => {
      (window as any).getterCalls = 0;
      Object.defineProperty(window, name, {configurable: true, get() { (window as any).getterCalls++; throw Error("SDK getter must not run"); }});
    }, name);
    const geometry = await captureConsentControlGeometry(page, {timeoutMs: 1000});
    assert.equal(geometry.cmp.name, name === "cookiehub" ? "CookieHub" : "CookieScript");
    assert.equal(await page.evaluate(() => (window as any).getterCalls), 0);
    assert.equal(await liveConsentActionCmp(page.getByRole("button"), [], Date.now() + 1000), undefined);
  } finally { await page.close(); }
});

test("inherited globals and uncorroborated shadow classes remain unidentified", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<div id="host"></div>');
    await page.evaluate(() => {
      Object.defineProperty(Object.getPrototypeOf(window), "cookiehub", {configurable: true, value: {}});
      const root = document.getElementById("host")!.attachShadow({mode: "open"});
      root.innerHTML = '<section role="dialog" class="ch2-dialog-actions"><p>Optional cookies</p><button>Accept all</button></section>';
    });
    const geometry = await captureConsentControlGeometry(page, {timeoutMs: 1000});
    assert.equal(geometry.cmp.detected, false);
    assert.equal(await liveConsentActionCmp(page.getByRole("button"), [], Date.now() + 1000), undefined);
  } finally { await page.close(); }
});

test("a named CMP root with inaccessible controls cannot establish a completed choice", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<div id="wpconsent-container"></div>');
    await page.evaluate(() => {
      document.getElementById("wpconsent-container")!.attachShadow({mode: "closed"}).innerHTML = '<button>Accept all</button>';
    });
    const geometry = await captureConsentControlGeometry(page, {timeoutMs: 1000});
    assert.equal(geometry.cmp.name, "WPConsent");
    assert.equal(geometry.summary.firstLayerAccept, false);
    assert.equal(geometry.candidates.length, 0);
  } finally { await page.close(); }
});
