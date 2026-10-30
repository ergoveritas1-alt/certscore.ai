import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium, type ElementHandle, type Locator } from "playwright";
import { projectPostAcceptEvidenceForReport, projectPostRefusalEvidenceForReport } from "@certscore/contracts";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";

// A deliberately delayed browser reply models the missing bounded-read case,
// not OrangeLogic's or FidoAlliance's unproven live cause. Real DOM, canonical
// recipes, both observers and the normal retained projector remain in the loop.
for (const action of ["accept", "reject"] as const) {
  for (const mode of ["ready", "opposite"] as const) {
    test(`${action}: a delayed readiness reply requires a fresh ${mode} control within the same search`, {timeout: 10_000}, async t => {
      let clicks = 0, injected = false;
      const server = createServer((request, response) => {
        if (request.url === "/clicked") { clicks++; response.writeHead(204).end(); return; }
        response.setHeader("content-type", "text/html");
        response.end(`<!doctype html><section id="hs-eu-cookie-confirmation" style="opacity:0;position:fixed;left:20px;top:30px;background:white;padding:20px">
          <p>Choose optional cookies.</p><div id="hs-eu-cookie-confirmation-buttons-area"><button id="${action === "accept" ? "hs-eu-confirmation-button" : "hs-eu-decline-button"}">${action === "accept" ? "Accept" : "Decline"}</button></div></section>
          <script>document.querySelector('button').onclick=()=>{fetch('/clicked');document.querySelector('section').hidden=true;};</script>`);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address(); assert.ok(address && typeof address !== "string");
      const browser = await chromium.launch({headless: true});
      const newContext = browser.newContext.bind(browser);
      t.mock.method(browser, "newContext", async (...args: Parameters<typeof browser.newContext>) => {
        const context = await newContext(...args), newPage = context.newPage.bind(context);
        t.mock.method(context, "newPage", async () => {
          const page = await newPage();
          const prototype = Object.getPrototypeOf(page.locator("button"));
          const elementHandle = prototype.elementHandle;
          t.mock.method(prototype, "elementHandle", async function(this: Locator, options?: Parameters<Locator["elementHandle"]>[0]) {
            const handle = await elementHandle.call(this, options) as ElementHandle | null;
            if (!handle) return handle;
            const evaluate = handle.evaluate.bind(handle);
            t.mock.method(handle, "evaluate", async (...parameters: Parameters<typeof handle.evaluate>) => {
              const result = await evaluate(...parameters);
              if (!injected && String(parameters[0]).includes("scopeInteractive")) {
                injected = true;
                await page.evaluate(({mode, action}) => {
                  setTimeout(() => {
                    document.querySelector<HTMLElement>("section")!.style.opacity = "1";
                    if (mode === "opposite") document.querySelector("button")!.textContent = action === "accept" ? "Reject all" : "Accept all";
                  }, 100);
                }, {mode, action});
                await new Promise(resolve => setTimeout(resolve, 900));
              }
              return result;
            });
            return handle;
          });
          return page;
        });
        return context;
      });
      const started = Date.now();
      try {
        const common = {browser, url: `http://127.0.0.1:${address.port}/`, scanId: `bounded-read-${action}-${mode}`,
          interactionAuthorization: {kind: "loopback", authorizationId: "loopback_local_lab"} as const,
          actionSearchTimeoutMs: 2_500, resultBudgetMs: 6_000, confirmationTimeoutMs: 100, observationWindowMs: 100};
        const packet = action === "accept"
          ? await runPostAcceptObserver({...common, recipe: buildCanonicalPostAcceptActionRecipes().find(r => r.cmpId === "HubSpot Consent Banner")!})
          : await runPostRefusalObserver({...common, recipe: buildCanonicalPostRefusalActionRecipes().find(r => r.cmpId === "HubSpot Consent Banner")!});
        const projection = "acceptanceRegistration" in packet
          ? projectPostAcceptEvidenceForReport({packet, packetSha256: "a".repeat(64)})
          : projectPostRefusalEvidenceForReport({packet, packetSha256: "a".repeat(64)});
        assert.equal(injected, true);
        assert.equal(clicks, mode === "ready" ? 1 : 0, JSON.stringify(packet.interactionDiagnostics));
        assert.equal(projection.execution?.clickCompleted, mode === "ready");
        assert.equal(projection.execution?.observationCompleted, mode === "ready");
        assert.equal(projection.execution?.consentConfirmed, false, "no receipt/event was produced by this fixture");
        assert.ok(Date.now() - started < 6_000, "the search/result deadlines are not renewed");
      } finally {
        t.mock.restoreAll(); await browser.close(); server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
    });
  }
}
