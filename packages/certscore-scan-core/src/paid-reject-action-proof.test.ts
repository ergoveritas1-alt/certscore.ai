import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { normalizeConsentControlText } from "@certscore/contracts";
import { buildConsentActionControlProof } from "./cmp-action-control-proof";
import { runPostRefusalObserver } from "./post-refusal-observer";

test("action proof blocks retained Spanish paid Reject labels in every label source", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const paid = "Rechazar por 36€ / año: Denegar nuestro procesamiento de datos y cerrar";
    for (const html of [
      `<button>${paid}</button>`,
      `<button aria-label="Rechazar todo">${paid}</button>`,
      `<button aria-label="${paid}">Rechazar todo</button>`,
    ]) {
      await page.setContent(html);
      const proof = await buildConsentActionControlProof({ action: "reject", page,
        control: page.locator("button"), observedAtMs: 1,
        recipeId: "fixture:paid-reject", selectorHint: "button" });
      assert.equal(proof.status, "label_mismatch", JSON.stringify(proof));
    }
    await page.setContent('<p>Subscribe for 36€ / year, or choose your cookie preferences.</p><button>Rechazar todo</button>');
    const free = await buildConsentActionControlProof({ action: "reject", page,
      control: page.locator("button"), observedAtMs: 1,
      recipeId: "fixture:free-reject", selectorHint: "button" });
    assert.equal(free.status, "verified", JSON.stringify(free));
  } finally { await browser.close(); }
});

test("Reject observer never dispatches the retained paid choice", async () => {
  const paid = "Rechazar por 36€ / año: Denegar nuestro procesamiento de datos y cerrar";
  let clicks = 0;
  const server = createServer((request, response) => {
    if (request.url === "/clicked") { clicks++; response.writeHead(204).end(); return; }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<section class="cookie-banner"><p>Choose your optional cookie preferences.</p>
      <button id="reject">${paid}</button></section>
      <script>document.querySelector('button').onclick=()=>fetch('/clicked')</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const recipe = { artifactVersion: "certscore.post_refusal_action_recipe.v1" as const, recipeId: "fixture:paid-reject",
      resolverMethod: "local_fixture_recipe" as const, controlSelector: "#reject", bannerSelector: ".cookie-banner",
      controlExpectedNormalizedLabel: normalizeConsentControlText(paid),
      confirmation: { kind: "local_storage_equals" as const, key: "consent", expectedValue: "denied" } };
    // The unmatched recipe forces the canonical generic-discovery route.
    for (const selectedRecipe of [recipe, { ...recipe, recipeId: "fixture:unmatched",
      controlSelector: "#absent", controlExpectedNormalizedLabel: "reject all" }]) {
      const packet = await runPostRefusalObserver({ url: `http://127.0.0.1:${address.port}/`,
        scanId: "paid-reject-dispatch-fixture", actionSearchTimeoutMs: 600,
        confirmationTimeoutMs: 50, observationWindowMs: 50, allowCanonicalRejectDiscovery: true,
        interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
        recipe: selectedRecipe });
      assert.equal(clicks, 0);
      assert.notEqual(packet.interactionDiagnostics?.click.outcome, "completed");
      assert.notEqual(packet.refusalRegistration.status, "confirmed");
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
