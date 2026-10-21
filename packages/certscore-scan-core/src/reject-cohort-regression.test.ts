import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";
import { classifyNavigationFailure, inspectRecoverableCommittedDocument, runPostRefusalObserver } from "./post-refusal-observer.js";

async function fixture(html: string, run: (url: string, actions: () => number) => Promise<void>) {
  let actions = 0;
  const server = createServer((request, response) => {
    if (request.url === "/action") { actions++; response.end("ok"); return; }
    response.setHeader("content-type", "text/html; charset=utf-8"); response.end(html);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try { await run(`http://127.0.0.1:${address.port}/`, () => actions); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

test("103.by exact Russian label passes canonical discovery and dispatches one semantically verified Reject", async () => {
  await fixture(`<section aria-label="Cookie preferences"><p>We use cookies. Choose optional cookies.</p>
    <button onclick="localStorage.setItem('consent','rejected');fetch('/action');this.parentElement.hidden=true">Отклонить</button></section>`, async (url, actions) => {
    const packet = await runPostRefusalObserver({ scanId: "russian-reject-fixture", url,
      recipe: { artifactVersion: "certscore.post_refusal_action_recipe.v1", recipeId: "absent-fixture-recipe",
        controlSelector: "#absent", confirmation: {kind: "local_storage_equals", key: "consent", expectedValue: "rejected"} },
      interactionAuthorization: {kind: "loopback", authorizationId: "loopback_local_lab"},
      allowCanonicalRejectDiscovery: true, actionSearchTimeoutMs: 3000,
      confirmationTimeoutMs: 300, observationWindowMs: 350, fulfillThirdPartyRequestsLocally: true });
    assert.equal(packet.actionControlProof?.action, "reject", JSON.stringify(packet.limitations));
    assert.equal(packet.interactionDiagnostics?.click.outcome, "completed");
    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(actions(), 1);
  });
});

test("TheFA-style two visible OneTrust refusal controls remain ambiguous with zero clicks", async () => {
  await fixture(`<section id="onetrust-banner-sdk" class="ot-close-btn-link"><p>We use optional cookies</p>
    <button id="onetrust-reject-all-handler" onclick="fetch('/action')">Reject All</button>
    <button class="onetrust-close-btn-handler banner-close-button" onclick="fetch('/action')">Continue without Accepting</button></section>`, async (url, actions) => {
    const recipe = buildCanonicalPostRefusalActionRecipes().find(recipe => recipe.cmpId === "OneTrust");
    assert.ok(recipe);
    const packet = await runPostRefusalObserver({ scanId: "ambiguous-onetrust-fixture", url, recipe,
      interactionAuthorization: {kind: "loopback", authorizationId: "loopback_local_lab"},
      actionSearchTimeoutMs: 3000, confirmationTimeoutMs: 100, observationWindowMs: 350 });
    assert.equal(packet.resolver.reason, "multiple_deterministic_reject_controls_found");
    assert.equal(packet.refusalRegistration.status, "not_attempted");
    assert.equal(actions(), 0);
  });
});

test("Japan.travel TLS failure cannot recover into an actionable document even with an otherwise usable page", async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.route("http://127.0.0.1:12345/", route => route.fulfill({body: "<body><button>Reject All</button></body>"}));
    await page.goto("http://127.0.0.1:12345/");
    const failure = classifyNavigationFailure(new Error("net::ERR_SSL_VERSION_OR_CIPHER_MISMATCH"));
    assert.equal(failure, "tls");
    const result = await inspectRecoverableCommittedDocument(page, {kind: "loopback", authorizationId: "loopback_local_lab"}, failure, undefined, 0);
    assert.equal(result.documentCommitted, true);
    assert.equal(result.finalUrlAuthorized, true);
    assert.equal(result.recovered, false);
  } finally { await browser.close(); }
});
