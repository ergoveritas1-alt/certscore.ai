import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { readPrivacyLinkAccess } from "./privacy-link-access.js";

test("existing link read diagnoses reachability without clicks, scrolling or navigation", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const fixtures = [
      ["reachable", '<a href="https://example.test/privacy"><span>Privacy policy</span></a>'],
      ["outside_viewport", '<a style="position:absolute;top:1500px" href="https://example.test/privacy">Privacy policy</a>'],
      ["not_rendered", '<a style="display:none" href="https://example.test/privacy">Privacy policy</a>'],
      ["hidden", '<a style="visibility:hidden" href="https://example.test/privacy">Privacy policy</a>'],
      ["hidden", '<div aria-hidden="true"><a href="https://example.test/privacy">Privacy policy</a></div>'],
      ["transparent", '<div style="opacity:0"><a href="https://example.test/privacy">Privacy policy</a></div>'],
      ["inactive", '<div inert><a href="https://example.test/privacy">Privacy policy</a></div>'],
      ["pointer_disabled", '<a style="pointer-events:none" href="https://example.test/privacy">Privacy policy</a>'],
      ["hit_target_missed", '<a href="https://example.test/privacy">Privacy policy</a><div style="position:fixed;inset:0;z-index:10"></div>'],
      ["reachable", '<div style="pointer-events:none"><a style="pointer-events:auto" href="https://example.test/privacy">Privacy policy</a></div>'],
    ];
    for (const [outcome, html] of fixtures) {
      await page.setContent(`${html}<script>window.clicks=0;document.addEventListener('click',()=>window.clicks++);</script>`);
      const rows = await page.locator("a[href]").evaluateAll(readPrivacyLinkAccess, {});
      assert.equal(rows[0]?.access.outcome, outcome, html);
      assert.equal(rows[0]?.hitTargetBeforeAction, outcome === "reachable");
      assert.equal(await page.evaluate(() => scrollY), 0);
      assert.equal(await page.evaluate(() => (window as any).clicks), 0);
      assert.equal(page.url(), "about:blank");
    }
    await page.setContent('<div id="host"></div>');
    await page.evaluate(() => document.querySelector("#host")!.attachShadow({ mode: "open" }).innerHTML = '<a href="https://example.test/privacy">Privacy policy</a>');
    assert.equal((await page.locator("a[href]").evaluateAll(readPrivacyLinkAccess, {}))[0]?.access.outcome, "reachable");
    const candidates = [{ index: 0, url: "https://example.test/other", label: "Privacy policy" }];
    assert.deepEqual(await page.locator("a[href]").evaluateAll(readPrivacyLinkAccess, { candidates }), []);
    candidates[0]!.url = "https://example.test/privacy"; candidates[0]!.label = "Changed label";
    assert.deepEqual(await page.locator("a[href]").evaluateAll(readPrivacyLinkAccess, { candidates }), []);
    await page.evaluate("{ let time = 0; Object.defineProperty(performance, 'now', { value: () => time += 100 }); }");
    assert.equal((await page.locator("a[href]").evaluateAll(readPrivacyLinkAccess, {}))[0]?.access.outcome, "inspection_incomplete");
  } finally { await browser.close(); }
});
