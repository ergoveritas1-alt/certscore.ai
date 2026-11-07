import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { assessConsentActionStages, postAcceptReportProjectionSchema, postRefusalReportProjectionSchema, projectPostAcceptEvidenceForReport, projectPostRefusalEvidenceForReport } from "@certscore/contracts";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";
import { consentActionBindingDeadline, prioritizeConsentActionRecipes } from "./consent-action-recipe-priority.js";
import { captureConsentControlGeometry } from "./consent-control-geometry.js";

test("a stalled cookie routing hint cannot block retained button geometry", { timeout: 10_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const originalCookies = context.cookies.bind(context);
  try {
    const page = await context.newPage();
    await page.setContent('<section id="cookie-banner"><p>Choose optional cookies.</p><button>Accept all</button><button>Reject all</button></section>');
    context.cookies = () => new Promise(() => undefined);
    const started = Date.now();
    const geometry = await captureConsentControlGeometry(page, { timeoutMs: 500 });
    // Allow runner/Chromium scheduling contention; the never-settling cookie
    // read would otherwise block indefinitely, regardless of frame completion.
    assert.ok(Date.now() - started < 5000);
    assert.equal(geometry.summary.firstLayerAccept, true);
    assert.equal(geometry.summary.firstLayerReject, true);
  } finally { context.cookies = originalCookies; await browser.close(); }
});

test("Accept recovers an already committed authorized navigation replacement, while timeout remains limited", async () => {
  const browser = await chromium.launch({ headless: true });
  let clicks = 0;
  let navigationError = "Navigation to target is interrupted by another navigation";
  const server = createServer((request, response) => {
    if (request.url === "/click") { clicks++; response.writeHead(204).end(); return; }
    response.setHeader("Content-Type", "text/html");
    response.end('<section id="cookie-banner"><p>Choose optional cookies.</p><button id="accept" onclick="fetch(\'/click\')">Accept all</button></section>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async options => {
    const context = await newContext(options);
    const newPage = context.newPage.bind(context);
    context.newPage = async () => {
      const page = await newPage();
      const goto = page.goto.bind(page);
      page.goto = async (url, options) => { await goto(url, { ...options, waitUntil: "domcontentloaded" }); throw new Error(navigationError); };
      return page;
    };
    return context;
  };
  try {
    const run = () => runPostAcceptObserver({ browser, url: `http://127.0.0.1:${address.port}/`, scanId: "navigation-recovery",
      actionSearchTimeoutMs: 500, confirmationTimeoutMs: 50, observationWindowMs: 100,
      interactionAuthorization: { kind: "loopback", authorizationId: "loopback_local_lab" },
      recipe: { artifactVersion: "certscore.post_accept_action_recipe.v1", recipeId: "fixture:navigation",
        resolverMethod: "local_fixture_recipe", controlSelector: "#accept", bannerSelector: "#cookie-banner",
        confirmation: { kind: "local_storage_equals", key: "consent", expectedValue: "granted" } } });
    const recovered = await run();
    assert.equal(recovered.interactionDiagnostics?.navigation.outcome, "recovered_after_error");
    assert.equal(recovered.afterActionCapture?.stopReason, "window_elapsed");
    assert.equal(clicks, 1);
    navigationError = "Timeout 15000ms exceeded";
    assert.equal((await run()).acceptanceRegistration.status, "not_attempted");
    assert.equal(clicks, 1);
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("a live CMP and conflicting script hint are both considered within the original search budget", () => {
  const recipes = [{ cmpId: "Cookiebot" }, { cmpId: "OneTrust" }, { cmpId: "HubSpot" }];
  assert.deepEqual(prioritizeConsentActionRecipes(recipes, [recipes[2]!], "OneTrust"), [recipes[1], recipes[2]]);
  assert.equal(consentActionBindingDeadline(100, 1000, 200), 950);
  assert.equal(consentActionBindingDeadline(100, 300, 200), 300);
  assert.equal(consentActionBindingDeadline(100, undefined, 200), 100);
});

for (const action of ["accept", "reject"] as const) {
  test(`${action}: reviewed label, late semantic decision and completed capture retain separate evidence`, async () => {
    const browser = await chromium.launch({ headless: true });
    let clicks = 0;
    let decision = action === "accept" ? "granted" : "denied";
    let delay = 200;
    const label = action === "accept" ? "Accept additional cookies" : "Nur erforderliche";
    const server = createServer((request, response) => {
      if (request.url === "/click") { clicks++; response.writeHead(204).end(); return; }
      response.setHeader("Content-Type", "text/html");
      response.end(`<section id="banner" class="cookie-banner"><p>We use optional cookies. Choose your cookie preferences.</p>
        <button id="choice">${label}</button></section><script>document.querySelector('button').onclick=()=>{
          fetch('/click');document.querySelector('section').hidden=true;
          setTimeout(()=>localStorage.setItem('consent','${decision}'),${delay});
        };</script>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const run = async () => {
      const common = { browser, url: `http://127.0.0.1:${address.port}/`, scanId: `late-${action}`,
        actionSearchTimeoutMs: 2000, confirmationTimeoutMs: 30, observationWindowMs: 700,
        productionProjectable: true, interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" as const } };
      const recipe = { recipeId: "fixture:late", resolverMethod: "local_fixture_recipe" as const,
        controlSelector: "#choice", bannerSelector: "#banner", confirmation: {
          kind: "local_storage_equals" as const, key: "consent", expectedValue: action === "accept" ? "granted" : "denied",
        } };
      return action === "accept"
        ? runPostAcceptObserver({ ...common, recipe: { ...recipe, artifactVersion: "certscore.post_accept_action_recipe.v1" } })
        : runPostRefusalObserver({ ...common, recipe: { ...recipe, artifactVersion: "certscore.post_refusal_action_recipe.v1" } });
    };
    try {
      const packet = await run();
      assert.equal(clicks, 1, JSON.stringify(packet.interactionDiagnostics));
      assert.equal(packet.afterActionCapture?.stopReason, "window_elapsed");
      assert.equal(packet.productionProjectable, false);
      assert.equal("acceptanceRegistration" in packet ? packet.acceptanceRegistration.status : packet.refusalRegistration.status, "unconfirmed");
      assert.equal(packet.terminalDecisionEvidence?.evidence.decision, decision, JSON.stringify(packet.limitations));
      assert.deepEqual(packet.observations, []);
      const projection = "acceptanceRegistration" in packet
        ? projectPostAcceptEvidenceForReport({ packet, packetSha256: "a".repeat(64) })
        : projectPostRefusalEvidenceForReport({ packet, packetSha256: "a".repeat(64) });
      assert.equal(projection.execution?.status, "succeeded_with_confirmation");
      assert.ok(packet.afterActionCapture!.captureEndedAtMs - packet.afterActionCapture!.actionDispatchedAtMs < 1400);
      decision = action === "accept" ? "denied" : "granted";
      assert.equal((await run()).terminalDecisionEvidence, undefined);
      decision = action === "accept" ? "granted" : "denied"; delay = 1000;
      assert.equal((await run()).terminalDecisionEvidence, undefined);
      assert.equal(clicks, 3);
    } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  test(`${action}: live OneTrust is not excluded by an unrelated HubSpot script`, async () => {
    let clicks = 0;
    const server = createServer((request, response) => {
      if (request.url === "/click") { clicks++; response.writeHead(204).end(); return; }
      if (request.url?.includes("hs-banner")) { response.setHeader("Content-Type", "text/javascript"); response.end(""); return; }
      response.setHeader("Content-Type", "text/html");
      response.end(`<script src="/js.hs-banner.com/v2/consent.js"></script>
        <div id="onetrust-banner-sdk"><p>We use cookies. Choose your cookie preferences.</p>
        <button id="onetrust-${action === "accept" ? "accept-btn" : "reject-all"}-handler">${action === "accept" ? "Accept all" : "Reject all"}</button></div>
        <script>document.querySelector('button').onclick=()=>{fetch('/click');document.querySelector('div').hidden=true}</script>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const common = { url: `http://127.0.0.1:${address.port}/`, scanId: `cmp-conflict-${action}`,
      actionSearchTimeoutMs: 2500, confirmationTimeoutMs: 20, observationWindowMs: 50,
      interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" as const } };
    try {
      const packet = action === "accept"
        ? await runPostAcceptObserver({ ...common, recipe: buildCanonicalPostAcceptActionRecipes()[0]!, recipeCandidates: buildCanonicalPostAcceptActionRecipes(), allowCanonicalAcceptDiscovery: true })
        : await runPostRefusalObserver({ ...common, recipe: buildCanonicalPostRefusalActionRecipes()[0]!, recipeCandidates: buildCanonicalPostRefusalActionRecipes(), recipeSetId: "canonical-recovery-fixture", allowCanonicalRejectDiscovery: true });
      assert.equal(clicks, 1, JSON.stringify(packet.interactionDiagnostics));
      assert.equal(packet.resolver.cmpId, "OneTrust");
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
}

test("busy-page geometry reuses snapshot queries and refreshes late Agree controls", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<section id="cookie-banner"><p>We use optional cookies.</p></section>
      ${Array.from({ length: 80 }, (_, i) => `<div class="cookie-decoration">Cookie information ${i}<span>Details</span></div>`).join("")}`);
    await page.evaluate(() => {
      const counts = new Map<string, number>();
      (window as any).__geometryQueries = counts;
      (window as any).__geometryClones = 0;
      const clone = Node.prototype.cloneNode;
      Node.prototype.cloneNode = function(deep?: boolean) {
        (window as any).__geometryClones++;
        return clone.call(this, deep);
      };
      const query = Document.prototype.querySelectorAll;
      Document.prototype.querySelectorAll = function(selector: string) {
        counts.set(selector, (counts.get(selector) ?? 0) + 1);
        return query.call(this, selector);
      } as typeof query;
    });
    const first = await captureConsentControlGeometry(page, { timeoutMs: 750 });
    assert.equal(first.summary.firstLayerAccept, false);
    const repeats = await page.evaluate(() => [...(window as any).__geometryQueries.entries()]
      .filter(([selector, count]: [string, number]) => selector !== "*" && count > 1));
    assert.deepEqual(repeats, [], "identical document queries should run once per synchronous capture");
    assert.ok(await page.evaluate(() => (window as any).__geometryClones) <= 16,
      "discarded containers must not consume time building HTML evidence");
    await page.evaluate(() => {
      document.querySelector("#cookie-banner")!.insertAdjacentHTML("beforeend", '<a role="button" tabindex="0">Agree</a>');
    });
    const second = await captureConsentControlGeometry(page, { timeoutMs: 750 });
    assert.equal(second.summary.firstLayerAccept, true, "a later capture must see newly rendered controls");
  } finally { await browser.close(); }
});

test("Accept captures after a late Agree control on a busy page without semantic confirmation", async () => {
  const browser = await chromium.launch({ headless: true });
  let clicks = 0;
  const server = createServer((request, response) => {
    if (request.url === "/click") { clicks++; response.writeHead(204).end(); return; }
    response.setHeader("Content-Type", "text/html");
    response.end(`<main>${Array.from({ length: 120 }, (_, i) => `<article><a href="#story${i}">News story ${i}</a></article>`).join("")}</main>
      <script>setTimeout(() => {
        const banner = document.createElement('section'); banner.id = 'cookie-banner';
        banner.innerHTML = '<p>By clicking Agree, you agree to collection and use of your information by cookies and similar technologies.</p><a role="button" tabindex="0">Agree</a>';
        banner.style.cssText='position:fixed;bottom:0;background:white;padding:20px;z-index:9999';
        banner.querySelector('a').onclick=()=>{fetch('/click');banner.remove()};
        document.body.append(banner);
      }, 500);</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const packet = await runPostAcceptObserver({ browser, url: `http://127.0.0.1:${address.port}/`,
      scanId: "late-agree-busy-page", allowCanonicalAcceptDiscovery: true,
      recipe: buildCanonicalPostAcceptActionRecipes()[0]!, recipeCandidates: buildCanonicalPostAcceptActionRecipes(), actionSearchTimeoutMs: 3000,
      confirmationTimeoutMs: 50, observationWindowMs: 300,
      interactionAuthorization: { kind: "loopback", authorizationId: "loopback_local_lab" } });
    assert.equal(clicks, 1);
    assert.equal(packet.interactionDiagnostics?.click.outcome, "completed");
    assert.equal(packet.afterActionCapture?.stopReason, "window_elapsed");
    assert.notEqual(packet.acceptanceRegistration.status, "confirmed");
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

for (const action of ["accept", "reject"] as const) {
  test(`${action}: terminal read verifies current state after initial registration within the original window`, async () => {
    const browser = await chromium.launch({ headless: true });
    const decision = action === "accept" ? "granted" : "denied";
    let mode: "stable" | "changed" | "reloaded" = "stable";
    const server = createServer((request, response) => {
      response.setHeader("Content-Type", "text/html");
      response.end(`<section id="banner"><p>Choose optional cookies.</p>
        <button id="choice">${action === "accept" ? "Accept all" : "Reject all"}</button></section>
        <script>document.querySelector('button').onclick=()=>{
          localStorage.setItem('consent','${decision}');document.querySelector('section').hidden=true;
          ${mode === "changed" ? "setTimeout(()=>localStorage.removeItem('consent'),450);" : ""}
          ${mode === "reloaded" ? "setTimeout(()=>location.reload(),450);" : ""}
        };</script>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/`;
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async options => {
      const context = await newContext({ ...options, serviceWorkers: "block" });
      await context.route("**/*", route => new URL(route.request().url()).origin === new URL(url).origin
        ? route.continue() : route.abort());
      return context;
    };
    const run = () => {
      const common = { browser, url, scanId: `registered-terminal-${action}`,
        actionSearchTimeoutMs: 2000, confirmationTimeoutMs: 350, observationWindowMs: 800,
        productionProjectable: true, interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" as const } };
      const recipe = { recipeId: "fixture:registered-terminal", resolverMethod: "local_fixture_recipe" as const,
        controlSelector: "#choice", bannerSelector: "#banner", confirmation: {
          kind: "local_storage_equals" as const, key: "consent", expectedValue: decision,
        } };
      return action === "accept"
        ? runPostAcceptObserver({ ...common, recipe: { ...recipe, artifactVersion: "certscore.post_accept_action_recipe.v1" } })
        : runPostRefusalObserver({ ...common, recipe: { ...recipe, artifactVersion: "certscore.post_refusal_action_recipe.v1" } });
    };
    try {
      const packet = await run();
      const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
      assert.equal(registration.status, "confirmed");
      assert.equal(packet.afterActionCapture, undefined);
      const witness = packet.terminalDecisionEvidence;
      assert.ok(witness, JSON.stringify(packet.confirmationDiagnostics));
      assert.equal(witness.policyVersion, "bounded_registered_terminal_consent_decision.v1");
      assert.equal(witness.evidence.decision, decision);
      const projection = "acceptanceRegistration" in packet
        ? projectPostAcceptEvidenceForReport({ packet, packetSha256: "a".repeat(64) })
        : projectPostRefusalEvidenceForReport({ packet, packetSha256: "a".repeat(64) });
      assert.equal(projection.execution?.status, "succeeded_with_confirmation");
      assert.equal(projection.registeredObservationCompletion?.termination, "window_elapsed");
      assert.deepEqual(projection.terminalDecisionEvidence, witness);
      assert.equal(assessConsentActionStages(projection).evidenceStages.terminalChoiceStateVerified, true);
      const schema = action === "accept" ? postAcceptReportProjectionSchema : postRefusalReportProjectionSchema;
      assert.equal(schema.safeParse({ ...projection, registeredObservationCompletion: undefined }).success, false);
      assert.equal(schema.safeParse({ ...projection, terminalDecisionEvidence: {
        ...witness, authorizedTargetSha256: "b".repeat(64),
      } }).success, false);
      assert.equal(packet.confirmationDiagnostics?.terminalPasses, 1);
      const deadline = projection.registeredObservationCompletion!.startedAtMs + 800;
      assert.ok(witness.readStartedAtMs >= deadline - 250 && witness.readCompletedAtMs <= deadline);
      mode = "changed";
      const changed = await run();
      assert.equal("acceptanceRegistration" in changed ? changed.acceptanceRegistration.status : changed.refusalRegistration.status, "confirmed");
      assert.equal(changed.terminalDecisionEvidence, undefined);
      mode = "reloaded";
      assert.equal((await run()).terminalDecisionEvidence, undefined);
    } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
}
