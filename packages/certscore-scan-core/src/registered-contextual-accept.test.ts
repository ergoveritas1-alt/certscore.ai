import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { consentActionControlProofSchema, projectPostAcceptEvidenceForReport } from "@certscore/contracts";
import { buildConsentActionControlProof } from "./cmp-action-control-proof.js";
import { buildCanonicalPostAcceptActionRecipes, CANONICAL_POST_ACCEPT_RECIPE_SET_ID } from "./post-accept-cmp-recipes.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { captureConsentControlGeometry } from "./consent-control-geometry.js";

const cmpId = "BST DSGVO Cookie notice plugin, non-TCF";
const recipe = () => buildCanonicalPostAcceptActionRecipes().find((row) => row.cmpId === cmpId)!;
const authorization = { kind: "loopback", authorizationId: "loopback_local_lab" } as const;
const button = '<button type="button" class="bst-accept"><a href="#">VERSTANDEN</a></button>';
const banner = (control = button) => `<div class="bst-panel"><div class="bst-wrapper"><div class="bst-msg">Diese Webseite verwendet Cookies.</div><div class="bst-links">${control}</div></div></div>`;

async function fixture(run: (url: string, clicks: () => number) => Promise<void>, control = button, frames = "") {
  let clicks = 0;
  const server = createServer((req, res) => {
    if (req.url === "/clicked") clicks++;
    if (req.url !== "/") { res.writeHead(204).end(); return; }
    res.setHeader("content-type", "text/html");
    // Published BST structure/behavior: button or fragment link, no preference
    // decision, acknowledgment receipt only. All resources remain loopback.
    res.end(`<!doctype html><html><body>${frames}${banner(control)}
      <script src="/wp-content/plugins/bst-dsgvo-cookie/includes/js/scripts.js"></script>
      <script>document.querySelector('.bst-accept, .bst-accept-btn').onclick = () => {
        document.cookie='bst_dsgvo_cookie=1; path=/'; document.querySelector('.bst-panel').hidden=true;
        fetch('/clicked'); setTimeout(()=>fetch('/after-acknowledgment'), 150);
      };</script></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try { await run(`http://127.0.0.1:${address.port}/`, () => clicks); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

for (const [name, control] of [["button with nested fragment link", button], ["fragment link", '<a class="bst-accept-btn" href="#">VERSTANDEN</a>']] as const) {
  test(`canonical BST ${name}: one activation and full capture, acknowledgment is not granted consent`, async () => {
    await fixture(async (url, clicks) => {
      const recipes = buildCanonicalPostAcceptActionRecipes();
      const packet = await runPostAcceptObserver({ url, scanId: "bst-contextual-accept", interactionAuthorization: authorization,
        recipe: recipes[0]!, recipeCandidates: recipes, recipeSetId: CANONICAL_POST_ACCEPT_RECIPE_SET_ID,
        allowCanonicalAcceptDiscovery: true, actionSearchTimeoutMs: 3_000, resultBudgetMs: 5_000,
        confirmationTimeoutMs: 100, observationWindowMs: 500, productionProjectable: true });
      assert.equal(clicks(), 1, JSON.stringify(packet));
      assert.equal(packet.resolver.recipeId, recipe().recipeId);
      assert.equal(packet.interactionDiagnostics?.click.outcome, "completed");
      assert.equal(packet.actionControlProof?.actionSemantics, "registered_contextual_accept");
      assert.equal(packet.actionControlProof?.classifierConfidence, 0.78);
      assert.equal(packet.acceptanceRegistration.status, "unconfirmed");
      assert.equal(packet.decisionEvidence?.decision, "unknown");
      assert.equal(packet.productionProjectable, false);
      assert.equal(packet.observations.length, 0);
      assert.equal(packet.afterActionCapture?.activationStatus, "completed");
      assert.equal(packet.afterActionCapture?.stopReason, "window_elapsed");
      assert.ok(packet.timing.totalMs < 5_000);
      const projected = projectPostAcceptEvidenceForReport({ packet, packetSha256: "a".repeat(64) });
      assert.equal(projected.registrationStatus, "unconfirmed");
      assert.equal(projected.actionControlProof?.contextualApproval?.policyVersion, "registered_contextual_accept.v1");
      assert.ok(projected.afterActionRequests?.some((row) => row.sanitizedUrl.endsWith("/after-acknowledgment")));
      assert.ok(projected.afterActionStorage?.some((row) => row.name === "bst_dsgvo_cookie"));
    }, control);
  });
}

test("BST passive geometry retains the same canonical first-layer scope", async () => {
  await fixture(async (url) => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url);
      const geometry = await captureConsentControlGeometry(page);
      const candidate = geometry.candidates.find((row) => row.normalizedLabel === "verstanden" && row.decisionStatus === "confirmed_visible");
      assert.ok(candidate);
      assert.equal(geometry.cmp.name, cmpId);
      assert.ok(candidate.containerSelectorHint, "canonical banner scope must be retained");
    } finally { await browser.close(); }
  });
});

test("BST resolution completes a named-selector sweep despite browser protocol latency", async (t) => {
  await fixture(async (url, clicks) => {
    const browser = await chromium.launch({ headless: true });
    const newContext = browser.newContext.bind(browser);
    t.mock.method(browser, "newContext", async (...args: Parameters<typeof browser.newContext>) => {
      const context = await newContext(...args);
      context.on("page", page => {
        const locate = page.locator.bind(page);
        t.mock.method(page, "locator", (...args: Parameters<typeof page.locator>) => {
          const locator = locate(...args);
          const count = locator.count.bind(locator);
          t.mock.method(locator, "count", async () => {
            await new Promise(resolve => setTimeout(resolve, 80));
            return count();
          });
          return locator;
        });
      });
      return context;
    });
    try {
      const recipes = buildCanonicalPostAcceptActionRecipes();
      const packet = await runPostAcceptObserver({ browser, url, scanId: "bst-latency-accept",
        interactionAuthorization: authorization, recipe: recipes[0]!, recipeCandidates: recipes,
        allowCanonicalAcceptDiscovery: true, actionSearchTimeoutMs: 4_000, resultBudgetMs: 10_000,
        confirmationTimeoutMs: 100, observationWindowMs: 500, productionProjectable: true });
      assert.equal(clicks(), 1, JSON.stringify({ resolver: packet.resolver, timing: packet.timing }));
      assert.equal(packet.interactionDiagnostics?.click.outcome, "completed");
      assert.equal(packet.acceptanceRegistration.status, "unconfirmed");
    } finally { await browser.close(); }
  }, button, '<iframe srcdoc="<p>Map frame</p>"></iframe><iframe srcdoc="<p>Social frame</p>"></iframe>');
});

test("contextual activation fails closed outside its exact non-transactional canonical scope", async () => {
  await fixture(async (url) => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url);
      const canonical = recipe();
      const prove = (overrides = {}) => buildConsentActionControlProof({ action: "accept", cmpId,
        page, control: page.locator(canonical.controlSelector).first(), selectorHint: canonical.controlSelector,
        recipeId: canonical.recipeId, observedAtMs: 0, authorizedTargetSha256: createHash("sha256").update(url).digest("hex"), ...overrides });
      await page.setContent(banner());
      const good = await prove();
      assert.equal(good.status, "verified");
      if (good.status === "verified") assert.equal(consentActionControlProofSchema.safeParse(good.proof).success, true);
      for (const [name, html, overrides] of [
        ["outside banner", button, {}],
        ["form", `<form>${banner()}</form>`, {}],
        ["submission button", banner(button.replace('type="button"', 'type="submit"')), {}],
        ["transaction link", banner('<a class="bst-accept-btn" href="/checkout">VERSTANDEN</a>'), {}],
        ["nested transaction link", banner(button.replace('href="#"', 'href="/checkout"')), {}],
        ["two banners", banner() + banner(), {}],
        ["two controls", banner(button + button), {}],
        ["unregistered CMP", banner(), { cmpId: "Unknown CMP" }],
        ["forged recipe", banner(), { recipeId: "local-improvised-recipe" }],
        ["missing target proof", banner(), { authorizedTargetSha256: undefined }],
        ["weak OK", banner(button.replace("VERSTANDEN", "OK")), {}],
        ["opposite label", banner(button.replace("VERSTANDEN", "Reject all")), {}],
        ["conflicting label sources", banner(button.replace('type="button"', 'type="button" aria-label="Reject all"')), {}],
      ] as const) {
        await page.setContent(html);
        const result = await prove(overrides);
        assert.notEqual(result.status, "verified", name);
      }
    } finally { await browser.close(); }
  });
});
