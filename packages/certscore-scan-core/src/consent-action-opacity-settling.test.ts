import assert from "node:assert/strict";
import test from "node:test";
import {chromium} from "playwright";
import {waitForTransparentConsentControl} from "./cmp-action-control-proof.js";

// Read-only settling must not dispatch or broaden the decision it was given.
for (const action of ["accept", "reject"] as const) {
  for (const scenario of ["fade", "persistent", "late", "deadline", "duplicate", "opposite", "weak", "hidden", "inert", "disabled", "removed", "abort"] as const) {
    test(`${action}: opacity settling ${scenario} remains bounded and fail-closed`, async () => {
      const browser = await chromium.launch({headless:true});
      try {
        const page = await browser.newPage();
        const label = scenario === "weak" ? "OK" : action === "accept" ? "Accept all" : "Reject all";
        await page.setContent(`<section style="opacity:0" ${scenario === "hidden" ? "hidden" : ""} ${scenario === "inert" ? "inert" : ""}><button class="choice" ${scenario === "disabled" ? "disabled" : ""}>${label}</button></section>`);
        const controller = new AbortController();
        if (["fade", "deadline", "duplicate", "opposite", "removed"].includes(scenario)) {
          await page.evaluate(({scenario, action}) => {
            setTimeout(() => {
              const button = document.querySelector("button")!;
              if (scenario === "duplicate") button.after(button.cloneNode(true));
              if (scenario === "opposite") button.textContent = action === "accept" ? "Reject all" : "Accept all";
              if (scenario === "removed") button.remove();
              document.querySelector<HTMLElement>("section")!.style.opacity = "1";
            }, scenario === "deadline" ? 500 : 150);
          }, {scenario, action});
        } else if (scenario === "late") {
          await page.evaluate(() => setTimeout(() => {document.querySelector<HTMLElement>("section")!.style.opacity = "1";}, 1300));
        }
        const abortTimer = scenario === "abort" ? setTimeout(() => controller.abort(), 100) : undefined;
        const started = Date.now();
        const result = await waitForTransparentConsentControl({action, page, control:page.locator(".choice"), selectorHint:".choice",
          deadlineAtMs:started + (scenario === "deadline" ? 200 : 3000), signal:controller.signal});
        if (abortTimer) clearTimeout(abortTimer);
        assert.equal(result, scenario === "fade");
        const elapsed = Date.now() - started;
        assert.ok(elapsed < (scenario === "deadline" ? 450 : 1300), `${scenario} exceeded bound: ${elapsed}ms`);
        if (["weak", "hidden", "inert", "disabled"].includes(scenario)) assert.ok(elapsed < 400, `${scenario} must not settle`);
      } finally {await browser.close();}
    });
  }
}
