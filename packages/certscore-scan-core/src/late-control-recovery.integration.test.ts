import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { runPostAcceptObserver, type PostAcceptActionRecipe } from "./post-accept-observer.js";
import { runPostRefusalObserver, type PostRefusalActionRecipe } from "./post-refusal-observer.js";

const acceptRecipe: PostAcceptActionRecipe = {
  artifactVersion: "certscore.post_accept_action_recipe.v1",
  recipeId: "late-recovery-accept-fixture",
  resolverMethod: "local_fixture_recipe",
  controlSelector: "#consent-action",
  confirmation: { kind: "local_storage_equals", key: "consent", expectedValue: "granted" },
};

const rejectRecipe: PostRefusalActionRecipe = {
  artifactVersion: "certscore.post_refusal_action_recipe.v1",
  recipeId: "late-recovery-reject-fixture",
  cmpId: "late_recovery_fixture",
  controlSelector: "#consent-action",
  confirmation: { kind: "local_storage_equals", key: "consent", expectedValue: "rejected" },
};

async function withHookedBrowser(
  action: "accept" | "reject",
  delayBaselineMs: number,
  run: (input: { browser: Browser; url: string; actionCount: () => number }) => Promise<void>,
) {
  let actions = 0;
  const server = createServer((request, response) => {
    if (request.url === `/${action}`) {
      actions += 1;
      response.writeHead(204).end();
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><body>
      <button id="consent-action">${action === "accept" ? "Accept" : "Reject all"}</button>
      <script>
        window.__actionClicks = 0;
        document.querySelector('#consent-action').addEventListener('click', () => {
          window.__actionClicks++;
          fetch('/${action}');
          localStorage.setItem('consent', '${action === "accept" ? "granted" : "rejected"}');
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
  const browser = await chromium.launch({ headless: true });
  const originalNewContext = browser.newContext.bind(browser);
  (browser as unknown as { newContext: typeof browser.newContext }).newContext = async (...args) => {
    const context = await originalNewContext(...args);
    const originalNewPage = context.newPage.bind(context);
    (context as unknown as { newPage: typeof context.newPage }).newPage = async () => {
      const page = await originalNewPage();
      const originalEvaluate = page.evaluate.bind(page);
      let mutated = false;
      (page as unknown as { evaluate: Page["evaluate"] }).evaluate = (async (pageFunction: unknown, arg?: unknown) => {
        const source = String(pageFunction);
        const marker = action === "accept"
          ? "__certscoreReadPostAcceptWrites"
          : "__certscoreReadPostRefusalWrites";
        if (!mutated && source.includes(marker)) {
          mutated = true;
          await originalEvaluate(({ endpoint, value }) => {
            const original = document.querySelector("#consent-action") as HTMLElement | null;
            if (!original) return;
            original.hidden = true;
            const replacement = original.cloneNode(true) as HTMLElement;
            replacement.hidden = false;
            replacement.addEventListener("click", () => {
              (window as unknown as { __actionClicks: number }).__actionClicks++;
              void fetch(endpoint);
              localStorage.setItem("consent", value);
            });
            document.body.appendChild(replacement);
          }, { endpoint: `/${action}`, value: action === "accept" ? "granted" : "rejected" });
          if (delayBaselineMs > 0) await new Promise((resolve) => setTimeout(resolve, delayBaselineMs));
        }
        return originalEvaluate(pageFunction as never, arg as never);
      }) as Page["evaluate"];
      return page;
    };
    return context;
  };
  try {
    await run({ browser, url, actionCount: () => actions });
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("Accept late stale recovery replaces the control and dispatches once", async () => {
  await withHookedBrowser("accept", 0, async ({ browser, url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      browser, url, recipe: acceptRecipe, allowCanonicalAcceptDiscovery: true,
      actionSearchTimeoutMs: 1_000, confirmationTimeoutMs: 300, observationWindowMs: 100,
      interactionAuthorization: { kind: "loopback", authorizationId: "loopback_local_lab" },
      scanId: "late-recovery-accept", productionProjectable: true,
    });
    assert.equal(actionCount(), 1);
    assert.equal(packet.acceptanceRegistration.acceptanceExercised, true);
    assert.equal(packet.interactionDiagnostics?.click.reResolvedBeforeDispatch, true);
  });
});

test("Reject late stale recovery replaces the control and dispatches once", async () => {
  await withHookedBrowser("reject", 0, async ({ browser, url, actionCount }) => {
    const packet = await runPostRefusalObserver({
      browser, url, recipe: rejectRecipe,
      actionSearchTimeoutMs: 1_000, confirmationTimeoutMs: 300, observationWindowMs: 100,
      interactionAuthorization: { kind: "loopback", authorizationId: "loopback_local_lab" },
      scanId: "late-recovery-reject", productionProjectable: true,
    });
    assert.equal(actionCount(), 1);
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(packet.interactionDiagnostics?.click.reResolvedBeforeDispatch, true);
  });
});

test("exhausted original search budget does not start a fresh recovery wait", async () => {
  // Reach the pre-click baseline reliably, then exhaust the original budget.
  // A 1 ms search can stop before the hook under normal test-runner load.
  await withHookedBrowser("accept", 1_100, async ({ browser, url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      browser, url, recipe: acceptRecipe,
      actionSearchTimeoutMs: 1_000, confirmationTimeoutMs: 100, observationWindowMs: 50,
      interactionAuthorization: { kind: "loopback", authorizationId: "loopback_local_lab" },
      scanId: "late-recovery-budget", productionProjectable: true,
    });
    assert.equal(actionCount(), 0);
    assert.equal(packet.acceptanceRegistration.acceptanceExercised, false);
    assert.ok(packet.limitations.includes("late_control_recovery_search_budget_exhausted"));
  });
});
