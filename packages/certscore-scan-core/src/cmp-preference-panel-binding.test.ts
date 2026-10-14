import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { verifyDeferredPreferencePanel } from "./cmp-preference-panel-binding.js";

test("deferred HubSpot dialog hydration retains exact parent/panel identity and waits only inside the opening allowance", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const mode of ["ready", "delayed", "wrong-role", "missing-name", "outside-label", "replace-parent", "replace-panel", "outside-parent"]) {
      await page.setContent(`<div id="hs-banner-parent"><section id="hs-modal-content"><h2 id="hs-modal-introduction">Manage cookies</h2></section></div><h2 id="outside">Other content</h2>`);
      const parent = (await page.locator("#hs-banner-parent").elementHandle())!;
      const panel = page.locator("#hs-modal-content");
      if (mode !== "delayed") await panel.evaluate((el, mode) => { el.setAttribute("role", mode === "wrong-role" ? "article" : "alertdialog"); if (mode !== "missing-name") el.setAttribute("aria-labelledby", mode === "outside-label" ? "outside" : "hs-modal-introduction"); }, mode);
      if (mode === "delayed") await panel.evaluate(el => { setTimeout(() => { el.setAttribute("role", "alertdialog"); el.setAttribute("aria-labelledby", "hs-modal-introduction"); }, 80); });
      if (mode === "replace-parent") await parent.evaluate(el => { el.outerHTML = el.outerHTML; });
      if (mode === "replace-panel") await panel.evaluate(el => { setTimeout(() => { el.outerHTML = el.outerHTML; }, 10); el.removeAttribute("role"); });
      if (mode === "outside-parent") await panel.evaluate(el => document.body.append(el));
      const started = Date.now();
      const result = await verifyDeferredPreferencePanel({ panel, parent, roles: ["alertdialog"], remainingMs: 150 });
      assert.ok(Date.now() - started < 500, mode);
      assert.equal(result.result, mode === "ready" || mode === "delayed" ? "verified" : mode === "replace-parent" ? "parent_missing_or_replaced" : mode === "replace-panel" ? "panel_replaced" : mode === "outside-parent" ? "outside_parent" : mode === "wrong-role" ? "role_not_ready" : "name_not_ready", mode);
      await parent.dispose();
    }
  } finally { await browser.close(); }
});
