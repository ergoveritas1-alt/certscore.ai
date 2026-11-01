import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {chromium, type Page} from "playwright";
import {runPostAcceptObserver} from "./post-accept-observer";
import {runPostRefusalObserver} from "./post-refusal-observer";

for (const action of ["accept", "reject"] as const) {
  test(`${action}: cancellation at the final lifecycle boundary sends no input command`, async () => {
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
      const input = {scanId: `cancel-boundary-${action}`, url: `http://127.0.0.1:${(server.address() as {port:number}).port}/`, boundControlDispatch: true,
        actionSearchTimeoutMs: 1500, confirmationTimeoutMs: 100, observationWindowMs: 150, signal: controller.signal,
        interactionAuthorization: {kind: "loopback" as const, authorizationId: "loopback_local_lab"}, onLifecycleEvent: () => controller.abort()};
      const packet = action === "accept"
        ? await runPostAcceptObserver({...input, recipe: {...recipe, artifactVersion: "certscore.post_accept_action_recipe.v1"}})
        : await runPostRefusalObserver({...input, recipe: {...recipe, artifactVersion: "certscore.post_refusal_action_recipe.v1"}});
      const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
      assert.equal(clicks, 0);
      assert.equal(registration.status, "aborted");
      assert.equal(registration.actionDispatchedAtMs, undefined);
      assert.equal(packet.cancellation.outcome, "aborted_before_action");
    } finally {await new Promise<void>(resolve => server.close(()=>resolve()));}
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
          interactionAuthorization: {authorizationId: "loopback_local_lab", kind: "loopback" as const},
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
