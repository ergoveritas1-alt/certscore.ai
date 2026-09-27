import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Browser } from "playwright";
import { captureConsentControlGeometry } from "./consent-control-geometry.js";
import { consentControlsFromAccessibilityTree, detectConsentUi, mergeConsentUiObservations, readRapidFirstLayerConsentUiObservation } from "./scanners/pre-consent-runtime-scanner.js";
let browser: Browser;
test.before(async () => { browser = await chromium.launch({ headless: true }); });
test.after(async () => { await browser?.close(); });

const banner = (content: string) => `<section role="dialog" aria-label="Cookie consent" id="cookie-banner" style="position:fixed;bottom:0;background:white;padding:20px"><p>We use cookies for analytics and advertising. Choose your cookie preferences.</p>${content}</section>`;

for (const [name, html, accept, reject] of [
  ["necessary-only label", banner('<button>Use necessary cookies</button><button>Customize</button><button>Allow all cookies</button>'), true, true],
  ["Cookiebot tabs", banner('<a role="tab">Consent</a><a role="tab">Details</a>'), false, false],
  ["vendor-specific refusal", banner('<p>Ihre Einwilligung für Utiq können Sie <a href="#utiq">jetzt ablehnen</a>.</p><button>Akzeptieren und weiter</button>'), true, false],
  ["separate notification dialog", `<div id="app"><section role="dialog" style="position:fixed;top:0"><p>Receive notifications about offers</p><button>Accept</button><button aria-label="Deny">Deny all</button></section>${banner('<button>Accept all</button><button>Settings</button>')}</div>`, true, false],
] as const) {
  test(`retained review regression: ${name} agrees across passive DOM and geometry`, async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(html);
      const observation = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 1500);
      assert.equal(observation.acceptControlObserved, accept, JSON.stringify(observation.controls));
      assert.equal(observation.rejectControlObserved, reject, JSON.stringify(observation.controls));
      const geometry = await captureConsentControlGeometry(page, { timeoutMs: 2000 });
      assert.equal(geometry.summary.firstLayerAccept, accept, JSON.stringify(geometry.candidates));
      assert.equal(geometry.summary.firstLayerReject, reject, JSON.stringify(geometry.candidates));
    } finally { await page.close(); }
  });
}

test("later partial or failed inventory cannot borrow completeness from an earlier read", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent("<main>Loaded content</main>");
    const complete = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 1500);
    assert.equal(complete.inventoryOutcome, "complete_empty");
    for (const outcome of ["partial", "timed_out"] as const) {
      const partial = { ...complete, observedAtMs: complete.observedAtMs + 1, inventoryOutcome: outcome, captureStatus: "incomplete" as const };
      assert.equal(mergeConsentUiObservations(complete, partial, "test").inventoryOutcome, outcome);
      assert.equal(mergeConsentUiObservations(partial, complete, "test").inventoryOutcome, outcome);
      const recovered = { ...complete, observedAtMs: partial.observedAtMs + 1 };
      assert.equal(mergeConsentUiObservations(partial, recovered, "test").inventoryOutcome, "complete_empty");
    }
  } finally { await page.close(); }
});

test("rapid candidate truncation remains partial even when browser evaluation completes", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(banner(Array.from({ length: 13 }, (_, i) => `<button>${["Accept", "Accept all", "Allow all", "Agree", "Consent", "Reject", "Reject all", "Decline", "Deny", "Refuse", "Customize", "Settings", "Preferences"][i]}</button>`).join("")));
    const observation = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 1500);
    assert.equal(observation.inventoryOutcome, "partial");
    assert.ok(observation.inventoryDiagnostics?.timingMarkers.includes("rapid_inventory_truncated"));
    assert.equal(mergeConsentUiObservations(observation, observation, "test").inventoryOutcome, "partial");
  } finally { await page.close(); }
});

test("a child error document never becomes the main consent surface text", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<main>Storefront</main><iframe srcdoc="<p>shop.app is blocked ERR_BLOCKED_BY_RESPONSE</p>"></iframe>');
    const observation = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 1500);
    assert.ok(!observation.textExcerpt?.includes("ERR_BLOCKED_BY_RESPONSE"));
    await page.locator("main").evaluate(el => el.insertAdjacentHTML("afterend", `<section role="dialog" id="cookie-banner"><p>We use cookies for analytics.</p><button>Accept all</button><button>Accept essentials only</button></section>`));
    const later = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 1500);
    assert.equal(later.acceptControlObserved, true);
    assert.equal(later.rejectControlObserved, true);
  } finally { await page.close(); }
});

test("accessibility notification dialog cannot borrow a sibling cookie banner", () => {
  const node = (nodeId: string, role: string, name: string, childIds: string[] = []) => ({ nodeId, role: { value: role }, name: { value: name }, childIds, visibilityEvidence: "box_model_verified" as const });
  const result = consentControlsFromAccessibilityTree([
    node("root", "RootWebArea", "", ["app"]), node("app", "generic", "", ["notice", "cookie"]),
    node("notice", "dialog", "Receive notifications", ["deny", "yes"]), node("deny", "button", "Deny"), node("yes", "button", "Accept"),
    node("cookie", "dialog", "Cookie preferences", ["accept", "settings"]), node("accept", "button", "Accept all"), node("settings", "button", "Settings"),
  ]);
  assert.deepEqual(result.controls.map(c => c.label), ["Accept all", "Settings"]);
});

test("Macedonian first-layer controls are retained without English context or clicks", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<section role="dialog" style="position:fixed;bottom:0;padding:20px;background:white"><h2>Поставки за колачиња</h2><p>Оваа веб-страница користи колачиња.</p><button>Подесување</button><button>Не се согласувам</button><button>Се согласувам</button></section>');
    const observation = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 1500);
    assert.equal(observation.acceptControlObserved, true);
    assert.equal(observation.rejectControlObserved, true);
    assert.equal(observation.managePreferencesControlObserved, true);
    const geometry = await captureConsentControlGeometry(page, { timeoutMs: 2000 });
    assert.equal(geometry.summary.firstLayerAccept, true);
    assert.equal(geometry.summary.firstLayerReject, true);
  } finally { await page.close(); }
});

test("CMP selector alone does not promote an acknowledgment into Accept", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<section id="onetrust-banner-sdk" role="dialog"><p>We use cookies and process personal information. Exercise your privacy rights in settings.</p><button id="onetrust-accept-btn-handler">OK</button><button>Cookie settings</button></section>');
    const observation = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 1500);
    assert.equal(observation.acceptControlObserved, false);
    const geometry = await captureConsentControlGeometry(page, { timeoutMs: 2000 });
    assert.equal(geometry.summary.firstLayerAccept, false);
  } finally { await page.close(); }
});

test("vendor context does not suppress a separate banner-wide refusal", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(banner('<p>Ihre Einwilligung für Utiq können Sie <a href="#utiq">jetzt ablehnen</a>.</p><button>jetzt ablehnen</button><button>Accept all</button>'));
    const observation = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 1500);
    assert.equal(observation.rejectControlObserved, true);
    assert.equal(observation.controls.find(c => c.actionType === "reject_all")?.tagName, "button");
    const geometry = await captureConsentControlGeometry(page, { timeoutMs: 2000 });
    assert.equal(geometry.summary.firstLayerReject, true);
  } finally { await page.close(); }
});

test("a text-only prefilter neither proves absence nor invalidates a completed empty inventory", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent("<main>A complete page with no consent surface</main>");
    const result = await detectConsentUi(page, Date.now(), 0, { returnAfterCheapNoEvidence: true });
    assert.equal(result.inventoryOutcome, "complete_empty");
  } finally { await page.close(); }
});

test("successful text read cannot repair failed structured capture", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent("<main>Loaded content</main>");
    const evaluate = page.evaluate.bind(page);
    page.evaluate = ((fn: unknown, ...args: unknown[]) => {
      if (typeof fn === "string") return Promise.reject(new Error("structured capture failed"));
      return (evaluate as Function)(fn, ...args);
    }) as typeof page.evaluate;
    page.context = (() => ({ newCDPSession: async () => { throw new Error("AX unavailable"); } })) as typeof page.context;
    const result = await detectConsentUi(page, Date.now(), 0, { returnAfterCheapNoEvidence: true });
    assert.ok(result.basis.includes("inventory:cheap_text_prefilter"));
    assert.notEqual(result.inventoryOutcome, "complete_empty");
    assert.equal(result.captureStatus, "incomplete");
  } finally { await page.close(); }
});
