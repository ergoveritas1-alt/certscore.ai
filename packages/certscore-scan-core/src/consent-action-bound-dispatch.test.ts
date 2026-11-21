import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {createServer} from "node:http";
import {chromium, type Page} from "playwright";
import {runPostAcceptObserver} from "./post-accept-observer";
import {runPostRefusalObserver} from "./post-refusal-observer";
import type {RejectFirstLayerProof} from "./reject-gate-shadow-receipt";

for (const action of ["accept", "reject"] as const) {
  for (const dispatchMode of ["enabled", "unset"] as const) test(`${action}: ${dispatchMode} cancellation at the final lifecycle boundary sends no input command`, async () => {
    const previousFlag = process.env.CERTSCORE_AR_BOUND_CONTROL_DISPATCH_ENABLED;
    if (dispatchMode === "unset") delete process.env.CERTSCORE_AR_BOUND_CONTROL_DISPATCH_ENABLED;
    let clicks = 0;
    const server = createServer((req, res) => {
      if (req.url === "/clicked") {clicks++;res.end("ok");return;}
      res.setHeader("content-type", "text/html");res.end(`<section id="banner" role="dialog" aria-label="Cookie consent"><p>Choose optional cookies.</p>
        <button type="button" id="choice" onclick="fetch('/clicked')">${action === "accept" ? "Accept all" : "Reject all"}</button></section>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const controller = new AbortController();
    try {
      const recipe = {recipeId: "cancel-boundary-fixture-v1", resolverMethod: "local_fixture_recipe" as const, controlSelector: "#choice", bannerSelector: "#banner",
        confirmation: {kind: "local_storage_equals" as const, key: "consent", expectedValue: action === "accept" ? "granted" : "denied"}};
      const input = {scanId: `cancel-boundary-${action}`, url: `http://127.0.0.1:${(server.address() as {port:number}).port}/`,
        ...(dispatchMode === "enabled" ? {boundControlDispatch: true} : {}),
        actionSearchTimeoutMs: 1500, confirmationTimeoutMs: 100, observationWindowMs: 150, signal: controller.signal,
        interactionAuthorization: {kind: "loopback", authorizationId: "loopback_local_lab"} as const, onLifecycleEvent: () => controller.abort()};
      const packet = action === "accept"
        ? await runPostAcceptObserver({...input, recipe: {...recipe, artifactVersion: "certscore.post_accept_action_recipe.v1"}})
        : await runPostRefusalObserver({...input, recipe: {...recipe, artifactVersion: "certscore.post_refusal_action_recipe.v1"}});
      const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
      assert.equal(clicks, 0);
      assert.equal(registration.status, "aborted");
      assert.equal(registration.actionDispatchedAtMs, undefined);
      assert.equal(packet.cancellation.outcome, "aborted_before_action");
    } finally {
      if (previousFlag === undefined) delete process.env.CERTSCORE_AR_BOUND_CONTROL_DISPATCH_ENABLED;
      else process.env.CERTSCORE_AR_BOUND_CONTROL_DISPATCH_ENABLED = previousFlag;
      await new Promise<void>(resolve => server.close(()=>resolve()));
    }
  });
  for (const boundControlDispatch of [false, true]) {
    test(`${action}: ${boundControlDispatch ? "bound" : "legacy"} dispatch retains rerender outcomes without retry`, async () => {
      const clicked: string[] = [];
      const opposite = action === "accept" ? "reject" : "accept";
      const server = createServer((req, res) => {
        if (req.url?.startsWith("/clicked/")) {clicked.push(req.url.split("/").pop()!);res.end("ok");return;}
        res.setHeader("content-type", "text/html");
        res.end(`<section id="banner" role="dialog" aria-label="Cookie consent"><p>Choose optional analytics cookies.</p>
          <button id="choice" type="button">${action === "accept" ? "Accept all" : "Reject all"}</button></section>
          <script>document.querySelector('button').onclick=()=>fetch('/clicked/${action}')</script>`);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const browser = await chromium.launch({headless: true});
      let page: Page | undefined, mutation: Promise<void> | undefined;
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async options => {
        const context = await newContext(options), newPage = context.newPage.bind(context);
        context.newPage = async () => {page = await newPage();return page;};
        return context;
      };
      try {
        const recipe = {recipeId: "bound-fixture-v1", resolverMethod: "local_fixture_recipe" as const,
          controlSelector: "#choice", bannerSelector: "#banner",
          confirmation: {kind: "local_storage_equals" as const, key: "consent", expectedValue: action === "accept" ? "granted" : "denied"}};
        const input = {browser, boundControlDispatch, url: `http://127.0.0.1:${(server.address() as {port: number}).port}/`,
          scanId: `bound-${action}-${boundControlDispatch}`, actionSearchTimeoutMs: 1500, confirmationTimeoutMs: 40, observationWindowMs: 80,
          interactionAuthorization: {authorizationId: "loopback_local_lab", kind: "loopback"} as const,
          onLifecycleEvent: () => {
            mutation = page!.evaluate(opposite => {
              const replacement = document.createElement("button");replacement.id = "choice";replacement.type = "button";
              replacement.textContent = opposite === "accept" ? "Accept all" : "Reject all";
              replacement.onclick = () => {void fetch(`/clicked/${opposite}`);};
              document.querySelector("#choice")!.replaceWith(replacement);
            }, opposite);
          }};
        const packet = action === "accept"
          ? await runPostAcceptObserver({...input, recipe: {...recipe, artifactVersion: "certscore.post_accept_action_recipe.v1"}})
          : await runPostRefusalObserver({...input, recipe: {...recipe, artifactVersion: "certscore.post_refusal_action_recipe.v1"}});
        await mutation;
        assert.deepEqual(clicked, boundControlDispatch ? [] : [opposite]);
        const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
        assert.notEqual(registration.status, "confirmed");
        if (boundControlDispatch) {
          assert.equal(packet.interactionDiagnostics?.click.outcome, "failed_after_dispatch");
          assert.notEqual(packet.afterActionCapture?.activationStatus, "completed");
        }
      } finally {await browser.close();await new Promise<void>(resolve => server.close(() => resolve()));}
    });
  }
}

test("local exact Reject rechecks the original element and label before committing input", async t => {
  const flag = "CERTSCORE_LOCAL_REJECT_EXACT_CONTROL";
  const previous = process.env[flag];
  process.env[flag] = "1";
  const url = "http://127.0.0.1:12345/";
  const browser = await chromium.launch({headless: true, args: ["--disable-background-networking",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"]});
  try {
    for (const mode of ["stable", "replacement", "relabel", "duplicate",
      "proof_stable", "proof_replacement", "proof_selector_mismatch", "proof_selector_ambiguous"] as const) await t.test(mode, async subtest => {
      const withProof = mode.startsWith("proof_");
      if (withProof) delete process.env[flag]; else process.env[flag] = "1";
      const change = mode.replace(/^proof_/, "");
      let clicks = 0;
      let committed = 0;
      const rechecks: string[] = [];
      let page: Page | undefined;
      let mutation: Promise<void> | undefined;
      const open = browser.newContext.bind(browser);
      subtest.mock.method(browser, "newContext", async (...args: Parameters<typeof open>) => {
        const context = await open({...args[0], serviceWorkers: "block"});
        const newPage = context.newPage.bind(context);
        await context.route("**/*", route => {
          if (route.request().url() === url + "clicked") { clicks++; return route.fulfill({status:204}); }
          if (route.request().url() !== url) return route.abort();
          return route.fulfill({contentType:"text/html", body:`<section id="banner" role="dialog" aria-label="Cookie consent">
            <p>Choose your optional cookies.</p><button id="choice" type="button" onclick="localStorage.setItem('consent','denied');fetch('/clicked')">Reject all</button>
            <button id="other" type="button">Preferences</button>
          </section>`});
        });
        context.newPage = async () => (page = await newPage());
        return context;
      });
      const scanId = `exact-reject-${mode}`;
      const now = Date.now();
      const hash = (text: string) => createHash("sha256").update(text).digest("hex");
      const exactSelector = change === "selector_mismatch" ? "#other" :
        change === "selector_ambiguous" ? "#banner button" : "#choice";
      const firstLayerProof: RejectFirstLayerProof = {
        outcome: "qualified", scanId, exactSelector, issuedAtMs: now, expiresAtMs: now + 6_000,
        binding: {
          parentDispatchSha256: hash("parent"), sourceSha256: hash("bundle"), geometrySha256: hash("geometry"),
          requestedTargetSha256: hash(url), documentSha256: hash(url), documentTokenSha256: hash("passive-loader"),
          selectorSha256: hash(exactSelector), selectorEvidence: "verified_geometry",
          labelSha256: hash("Reject all"), labelMatch: "exact",
        },
      };
      const packet = await runPostRefusalObserver({
        browser, url, scanId,
        ...(withProof ? {firstLayerProof} : {}),
        actionSearchTimeoutMs: 1500, confirmationTimeoutMs: 300, observationWindowMs: 250,
        interactionAuthorization: {kind:"loopback", authorizationId:"loopback_local_lab"},
        recipe: {artifactVersion:"certscore.post_refusal_action_recipe.v1", recipeId:"reject-exact-fixture-v1",
          resolverMethod:"local_fixture_recipe", controlSelector:withProof ? ":is(#choice):is(#banner, #banner *)" : "#choice", bannerSelector:"#banner",
          confirmation:{kind:"local_storage_equals", key:"consent", expectedValue:"denied"}},
        onLifecycleEvent: () => {
          mutation = page!.evaluate(mode => {
            const button = document.querySelector("#choice")!;
            if (mode === "replacement") button.replaceWith(button.cloneNode(true));
            if (mode === "relabel") button.textContent = "Reject optional cookies";
            if (mode === "duplicate") button.after(button.cloneNode(true));
          }, change);
        },
        onActionDispatchCommitted: () => { committed++; },
        onRejectGateFinalRecheck: outcome => { rechecks.push(outcome); },
      });
      const unbound = change === "selector_mismatch" || change === "selector_ambiguous";
      if (unbound) assert.equal(mutation, undefined);
      else assert.ok(mutation, "reached the final lifecycle boundary");
      await mutation;
      assert.equal(clicks, change === "stable" ? 1 : 0);
      assert.equal(committed, change === "stable" ? 1 : 0);
      assert.deepEqual(rechecks,unbound ? [] : [change === "stable" ? "passed" : "failed"]);
      if (change !== "stable") {
        assert.ok(packet.limitations.includes(unbound ? "passive_reject_button_binding_unverified" : "reviewed_reject_dispatch_guard_failed"));
        assert.equal(packet.refusalRegistration.actionDispatchedAtMs, undefined);
      }
      if (withProof && !unbound) assert.equal(packet.actionControlProof?.selectorHint,exactSelector);
    });
  } finally {
    if (previous === undefined) delete process.env[flag];
    else process.env[flag] = previous;
    await browser.close();
  }
});
