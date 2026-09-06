import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { readRapidFirstLayerConsentUiObservation, mergeConsentUiObservations } from "./scanners/pre-consent-runtime-scanner.js";

test("DOM inventory retains readiness without waiting and never turns a loading empty document into absence", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext(); const page = await context.newPage();
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/*", async (route) => {
      if (route.request().url().endsWith("blocking.js")) {
        await released; await route.fulfill({ contentType: "application/javascript", body: "" }).catch(() => undefined);
      } else await route.fulfill({ contentType: "text/html", body: '<!doctype html><body><section id="consent-banner" role="dialog" aria-label="Cookie consent" hidden><p>Choose analytics and advertising cookies.</p><button>Accept all</button></section><script src="/blocking.js"></script></body>' });
    });
    await page.goto("https://consent-readiness.test/", { waitUntil: "commit" });
    await page.waitForFunction(() => document.querySelector("#consent-banner") !== null);
    try {
      const empty = await readRapidFirstLayerConsentUiObservation(page, Date.now());
      assert.equal(empty.documentReadyState, "loading");
      assert.equal(empty.inventoryOutcome, "partial");
      assert.equal(empty.captureStatus, "incomplete");
      assert.equal(mergeConsentUiObservations(empty, empty, "same-document").inventoryOutcome, "partial");
      await page.locator("#consent-banner").evaluate((element) => { (element as HTMLElement).hidden = false; });
      const visible = await readRapidFirstLayerConsentUiObservation(page, Date.now());
      assert.equal(visible.documentReadyState, "loading");
      assert.equal(visible.acceptControlObserved, true, "positive visible proof does not wait for full page load");
      await page.locator("#consent-banner").evaluate((element) => { (element as HTMLElement).hidden = true; });
    } finally { release(); }
    await page.waitForLoadState("domcontentloaded");
    const settled = await readRapidFirstLayerConsentUiObservation(page, Date.now());
    assert.notEqual(settled.documentReadyState, "loading");
    assert.equal(settled.inventoryOutcome, "complete_empty");
  } finally { await browser.close(); }
});
