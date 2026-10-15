import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import { waitForPreferencePortalContent } from "./cmp-preference-portal.js";

test("TrustArc readiness supports exact light and shadow content without accepting hidden or duplicate panels", async () => {
  const browser = await chromium.launch({headless: true});
  const recipe = KNOWN_CMP_REGISTRY.find(row => row.canonicalName === "TrustArc")!.preferencePortalBinding!;
  try {
    const page = await browser.newPage();
    for (const mode of ["light", "shadow", "delayed", "hidden", "duplicate", "outside"]) {
      await page.setContent(`<section class="truste_box_overlay_inner" role="dialog" ${mode === "hidden" ? 'aria-hidden="true"' : ''}>
        <div name="trustarc_cm" class="trustarc_newcm_container truste_popframe"></div></section>`);
      await page.evaluate(mode => {
        const host = document.querySelector('[name="trustarc_cm"]')!;
        const content = document.createElement("div");
        content.className = "gdprAccessiblePrefPanel";
        content.textContent = "Functional cookies";
        const root = mode === "shadow" || mode === "delayed" ? host.attachShadow({mode: "open"}) : host;
        if (mode === "outside") document.body.append(content);
        else if (mode === "delayed") setTimeout(() => root.append(content), 60);
        else root.append(content);
        if (mode === "duplicate") document.body.append(document.querySelector("section")!.cloneNode(true));
      }, mode);
      if (["light", "shadow", "delayed"].includes(mode)) await waitForPreferencePortalContent(page, recipe, 300);
      else await assert.rejects(waitForPreferencePortalContent(page, recipe, 100), mode);
    }
  } finally { await browser.close(); }
});
