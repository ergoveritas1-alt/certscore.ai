import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium, type Browser, type Page } from "playwright";
import { runPostAcceptObserver, type PostAcceptActionRecipe } from "./post-accept-observer.js";
import { runPostRefusalObserver, type PostRefusalActionRecipe } from "./post-refusal-observer.js";

const acceptRecipe: PostAcceptActionRecipe = {
  artifactVersion: "certscore.post_accept_action_recipe.v1",
  recipeId: "late-recovery-accept-fixture",
  resolverMethod: "local_fixture_recipe",
  controlSelector: ".consent-action",
  confirmation: { kind: "local_storage_equals", key: "consent", expectedValue: "granted" },
};

const rejectRecipe: PostRefusalActionRecipe = {
  artifactVersion: "certscore.post_refusal_action_recipe.v1",
  recipeId: "late-recovery-reject-fixture",
  cmpId: "late_recovery_fixture",
  controlSelector: ".consent-action",
  confirmation: { kind: "local_storage_equals", key: "consent", expectedValue: "rejected" },
};

async function withHookedBrowser(
  action: "accept" | "reject",
  { delayBaselineMs = 0, replacementCount = 1 }: { delayBaselineMs?: number; replacementCount?: number },
  run: (input: { browser: Browser; url: string; clicks: { original: number; replacement: number } }) => Promise<void>,
) {
  const clicks = { original: 0, replacement: 0 };
  const decision = action === "accept" ? "granted" : "rejected";
  const server = createServer((request, response) => {
    const button = request.url === "/original" ? "original" : request.url === "/replacement" ? "replacement" : undefined;
    if (button && request.method === "POST") {
      clicks[button]++;
      response.writeHead(204).end();
      return;
    }
    if (request.url !== "/" || request.method !== "GET") {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><body>
      <section aria-label="Cookie preferences">
        <p>Choose whether to allow optional cookies.</p>
        <button type="button" class="consent-action" data-fixture-button="original">${action === "accept" ? "Accept all" : "Reject all"}</button>
      </section>
      <script>
        document.querySelector('section').addEventListener('click', event => {
          const button = event.target.closest('button[data-fixture-button]');
          if (!event.isTrusted || !button) return;
          localStorage.setItem('consent', '${decision}');
          fetch('/' + button.dataset.fixtureButton, {method: 'POST'});
        });
      </script>
    </body></html>`);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind");
  const url = `http://127.0.0.1:${address.port}/`;
  const browser = await chromium.launch({ headless: true,
    args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"] });
  const originalNewContext = browser.newContext.bind(browser);
  let replaced = false;
  browser.newContext = async options => {
    const context = await originalNewContext({ ...options, serviceWorkers: "block" });
    const origin = new URL(url).origin;
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const originalNewPage = context.newPage.bind(context);
    context.newPage = async () => {
      const page = await originalNewPage();
      const originalEvaluate = page.evaluate.bind(page);
      page.evaluate = (async (pageFunction: unknown, arg?: unknown) => {
        const source = String(pageFunction);
        const marker = action === "accept"
          ? "__certscoreReadPostAcceptWrites"
          : "__certscoreReadPostRefusalWrites";
        if (!replaced && source.includes(marker)) {
          await originalEvaluate(count => {
            const original = document.querySelector<HTMLButtonElement>('[data-fixture-button="original"]');
            if (!original) throw new Error("The original fixture button must be present at baseline capture.");
            original.hidden = true;
            for (let index = 0; index < count; index++) {
              const replacement = original.cloneNode(true) as HTMLButtonElement;
              replacement.hidden = false;
              replacement.dataset.fixtureButton = "replacement";
              original.after(replacement);
            }
          }, replacementCount);
          replaced = true;
          if (delayBaselineMs > 0) await new Promise((resolve) => setTimeout(resolve, delayBaselineMs));
        }
        return originalEvaluate(pageFunction as never, arg as never);
      }) as Page["evaluate"];
      return page;
    };
    return context;
  };
  try {
    await run({ browser, url, clicks });
    assert.equal(replaced, true, "the replacement must occur after the initial control resolution");
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("Accept late stale recovery replaces the control and dispatches once", async () => {
  await withHookedBrowser("accept", {}, async ({ browser, url, clicks }) => {
    const packet = await runPostAcceptObserver({
      browser, url, recipe: acceptRecipe, allowCanonicalAcceptDiscovery: true,
      actionSearchTimeoutMs: 1_000, confirmationTimeoutMs: 300, observationWindowMs: 100,
      interactionAuthorization: { kind: "loopback", authorizationId: "loopback_local_lab" },
      scanId: "late-recovery-accept", productionProjectable: true,
    });
    assert.deepEqual(clicks, { original: 0, replacement: 1 }, JSON.stringify(packet.limitations));
    assert.equal(packet.acceptanceRegistration.acceptanceExercised, true);
    assert.equal(packet.interactionDiagnostics?.click.reResolvedBeforeDispatch, true);
  });
});

test("Reject late stale recovery replaces the control and dispatches once", async () => {
  await withHookedBrowser("reject", {}, async ({ browser, url, clicks }) => {
    const packet = await runPostRefusalObserver({
      browser, url, recipe: rejectRecipe,
      actionSearchTimeoutMs: 1_000, confirmationTimeoutMs: 300, observationWindowMs: 100,
      interactionAuthorization: { kind: "loopback", authorizationId: "loopback_local_lab" },
      scanId: "late-recovery-reject", productionProjectable: true,
    });
    assert.deepEqual(clicks, { original: 0, replacement: 1 }, JSON.stringify(packet.limitations));
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(packet.interactionDiagnostics?.click.reResolvedBeforeDispatch, true);
  });
});

test("expired search and readiness windows do not start a fresh recovery wait", async () => {
  // The baseline starts after the readiness clock. Exhaust both the 1 s
  // search and the existing 3 s canonical readiness allowance.
  await withHookedBrowser("accept", { delayBaselineMs: 3_100 }, async ({ browser, url, clicks }) => {
    const packet = await runPostAcceptObserver({
      browser, url, recipe: acceptRecipe,
      actionSearchTimeoutMs: 1_000, confirmationTimeoutMs: 100, observationWindowMs: 50,
      interactionAuthorization: { kind: "loopback", authorizationId: "loopback_local_lab" },
      scanId: "late-recovery-budget", productionProjectable: true,
    });
    assert.deepEqual(clicks, { original: 0, replacement: 0 });
    assert.equal(packet.acceptanceRegistration.acceptanceExercised, false);
    assert.equal(packet.interactionDiagnostics?.click.reResolvedBeforeDispatch, false);
    assert.ok(packet.limitations.includes("late_control_recovery_search_budget_exhausted"));
  });
});

test("Reject late stale recovery leaves two actionable replacements untouched", async () => {
  await withHookedBrowser("reject", { replacementCount: 2 }, async ({ browser, url, clicks }) => {
    const packet = await runPostRefusalObserver({
      browser, url, recipe: rejectRecipe,
      actionSearchTimeoutMs: 1_000, confirmationTimeoutMs: 300, observationWindowMs: 100,
      interactionAuthorization: { kind: "loopback", authorizationId: "loopback_local_lab" },
      scanId: "late-recovery-ambiguous", productionProjectable: true,
    });
    assert.deepEqual(clicks, { original: 0, replacement: 0 });
    assert.equal(packet.interactionDiagnostics?.click.outcome, "not_attempted");
    assert.equal(packet.refusalRegistration.status, "not_attempted");
  });
});
