import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { buildCanonicalPostRefusalActionRecipes } from "@certscore/scan-core/post-refusal-cmp-recipes";
import { runPostRefusalObserver } from "@certscore/scan-core/post-refusal-observer";
import { RESOLVED_SCAN_TARGET_AUTHORIZATION_ID } from "@certscore/scan-core/post-refusal-target-authorization";

test("Second Life’s retained Reject remains ineligible when the banner bundles agreement to terms", {timeout: 16_000}, async t => {
  const target = "https://secondlife.com/";
  const browser = await chromium.launch({args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"]});
  t.after(() => browser.close());
  const open = browser.newContext.bind(browser);
  let clicks = 0;
  let receipts = 0;
  // The original worker first recorded the actionable button about 3.3 s into
  // resolution. Both the button labels and the banner instructions are retained.
  const banner = `<section id="onetrust-banner-sdk" role="dialog" aria-label="Cookie consent">
    <p>We, and our third-party partners, use cookies, pixels, and other technologies to collect, record, and share information you provide,
    as well as information about your interactions with our site for ad targeting, analytics, personalization, and site functionality purposes.
    By clicking one of the buttons, you agree to the use of these technologies (as described in our Privacy Policy and subject to your settings),
    our Terms of Service (which contains important waivers), and our Terms and Conditions.</p>
    <div id="onetrust-button-group">
      <button type="button" id="onetrust-pc-btn-handler">Manage Settings</button>
      <button type="button" id="onetrust-reject-all-handler">Reject Non-Necessary Cookies</button>
      <button type="button" id="onetrust-accept-btn-handler">Accept All</button>
    </div></section>`;
  const html = `<!doctype html><meta charset="utf-8"><main>Retained Second Life replay</main>
    <script>
      setTimeout(() => document.body.insertAdjacentHTML("beforeend", ${JSON.stringify(banner)}), 3275);
      document.addEventListener("click", event => {
        if (event.isTrusted && event.target.closest("#onetrust-banner-sdk button")) fetch("/fixture-click", {method:"POST"});
      });
    </script>`;
  t.mock.method(browser, "newContext", async options => {
    const context = await open({...options, serviceWorkers: "block"});
    await context.addInitScript("globalThis.__name ??= value => value;");
    await context.route("**/*", route => {
      if (route.request().url() === target) return route.fulfill({contentType: "text/html", body: html});
      if (route.request().url() === target + "fixture-click" && route.request().method() === "POST") {
        clicks++;
        return route.fulfill({status: 204});
      }
      return route.abort("blockedbyclient");
    });
    return context;
  });
  const scanId = "second-life-retained-refusal";
  const recipes = buildCanonicalPostRefusalActionRecipes();
  const packet = await runPostRefusalObserver({
    browser, url: target, scanId, parentScanId: scanId, productionProjectable: true,
    recipe: recipes[0]!, recipeCandidates: recipes, recipeSetId: "second-life-retained",
    allowCanonicalRejectDiscovery: true, actionSearchTimeoutMs: 5_500, resultBudgetMs: 7_500,
    confirmationTimeoutMs: 400, observationWindowMs: 300,
    interactionAuthorization: {kind: "scan_target_resolution", authorizationId: RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,
      scanId, requestedUrl: target, maxRedirects: 8, resolutionTimeoutMs: 1_400},
    onWorkerDiscoveredClick: () => {receipts++;},
  });
  assert.ok(packet.interactionDiagnostics?.resolver?.snapshots.some(row =>
    row.state === "single_actionable" && row.controlLabels.includes("reject non-necessary cookies")));
  assert.equal(packet.resolver?.reason, "label_unverifiable");
  assert.equal(packet.interactionDiagnostics?.click?.outcome, "not_attempted");
  assert.equal(clicks, 0);
  assert.equal(receipts, 0);
});
