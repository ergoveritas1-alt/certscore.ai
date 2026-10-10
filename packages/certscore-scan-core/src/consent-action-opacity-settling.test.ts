import assert from "node:assert/strict";
import test from "node:test";
import {chromium} from "playwright";
import {waitForTransparentConsentControl} from "./cmp-action-control-proof.js";
import {readConsentActionLabelFields} from "./consent-action-label-fields.js";
import {readConsentActionSettlingSnapshot} from "./consent-action-settling-snapshot.js";

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

for (const action of ["accept", "reject"] as const) {
  test(`${action}: a duplicate arriving at the visibility-read boundary cannot settle`, async () => {
    const browser = await chromium.launch({headless:true});
    try {
      const page = await browser.newPage();
      await page.setContent(`<section style="opacity:0"><button class="choice">${action === "accept" ? "Accept all" : "Reject all"}</button></section>`);
      const control = page.locator(".choice");
      const originalLocator = page.locator.bind(page);
      let inserted = false;
      const insertDuplicate = async () => {
        inserted = true;
        await page.evaluate(() => {
          const button = document.querySelector("button")!;
          button.after(button.cloneNode(true));
          document.querySelector<HTMLElement>("section")!.style.opacity = "1";
        });
      };
      // Simulate DOM mutation between Playwright resolving a strict locator and
      // running its visibility callback. The old count + evaluate sequence
      // retained a single handle even though the selector now matched twice.
      const originalEvaluate = control.evaluate.bind(control);
      control.evaluate = (async (callback: Parameters<typeof control.evaluate>[0], ...args: unknown[]) => {
        if (String(callback).includes("getComputedStyle")) {
          const handle = await control.elementHandle();
          assert.ok(handle);
          try {await insertDuplicate(); return await handle.evaluate(callback, args[0]);}
          finally {await handle.dispose();}
        }
        return originalEvaluate(callback, ...args as [undefined]);
      }) as typeof control.evaluate;
      // With the atomic reader the mutation happens before the all-match
      // snapshot, so its duplicate check and visibility read share one turn.
      page.locator = ((...args: Parameters<typeof page.locator>) => {
        const locator = originalLocator(...args);
        const evaluateAll = locator.evaluateAll.bind(locator);
        locator.evaluateAll = (async (...readArgs: Parameters<typeof locator.evaluateAll>) => {
          await insertDuplicate();
          return evaluateAll(...readArgs);
        }) as typeof locator.evaluateAll;
        return locator;
      }) as typeof page.locator;
      assert.equal(await waitForTransparentConsentControl({action, page, control, selectorHint:".choice",
        deadlineAtMs:Date.now() + 3000}), false);
      assert.equal(inserted, true, "the mutation must exercise the visibility-read boundary");
      assert.equal(await originalLocator(".choice").count(), 2);
    } finally {await browser.close();}
  });
}

test("settling snapshot keeps canonical label sources, including input-only rendered values", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent('<button aria-label="Accept all" title="Consent" value="payload">Accept all</button><input type="submit" value="Reject all">');
    for (const selector of ["button", "input"]) {
      const control = page.locator(selector);
      const snapshot = await control.evaluateAll(readConsentActionSettlingSnapshot);
      assert.equal(snapshot.state, "interactive");
      assert.deepEqual(snapshot.labels, await control.evaluate(readConsentActionLabelFields));
    }
  } finally {await browser.close();}
});

test("a stalled atomic snapshot cannot exceed the original search deadline", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent('<button class="choice">Accept all</button>');
    const control = page.locator(".choice");
    page.locator = (() => {
      const locator = control;
      locator.evaluateAll = (() => new Promise(() => {})) as typeof locator.evaluateAll;
      return locator;
    }) as typeof page.locator;
    const started = Date.now();
    assert.equal(await waitForTransparentConsentControl({action:"accept", page, control,
      selectorHint:".choice", deadlineAtMs:started + 100}), false);
    assert.ok(Date.now() - started < 400, "a stalled browser read must stay bounded");
  } finally {await browser.close();}
});
