import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { inspectRecoverableCommittedDocument, runPostRefusalObserver } from "./post-refusal-observer.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";

const authorization = { kind: "loopback", authorizationId: "loopback_local_lab" } as const;
test("a stalled recovery read returns unknown within its bounded probe", async () => {
  const start = Date.now();
  const result = await inspectRecoverableCommittedDocument({
    url: () => "http://127.0.0.1:1234/",
    evaluate: () => new Promise(() => {}),
  } as never, authorization, "navigation_replaced", undefined, 0);
  assert.deepEqual(result, { recovered: false, documentCommitted: false, finalUrlAuthorized: true });
  assert.ok(Date.now() - start < 1000);
});
for (const action of ["accept", "reject"] as const) {
  test(`${action}: stalled navigation respects terminal budget and preserves caller browser`, async () => {
    let navigations = 0;
    const server = createServer(() => { navigations++; });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();assert.ok(address && typeof address !== "string");
    const browser = await chromium.launch({headless:true});
    const start = Date.now();
    const common = { scanId: `budget-${action}`, url: `http://127.0.0.1:${address.port}/`,
      interactionAuthorization: authorization, browser, resultBudgetMs: 250, actionSearchTimeoutMs: 500 };
    try {
      const packet = action === "accept" ? await runPostAcceptObserver({...common,
        recipe:{artifactVersion:"certscore.post_accept_action_recipe.v1",recipeId:"budget-accept",controlSelector:"button",confirmation:{kind:"local_storage_equals",key:"consent",expectedValue:"granted"}}})
        : await runPostRefusalObserver({...common,
        recipe:{artifactVersion:"certscore.post_refusal_action_recipe.v1",recipeId:"budget-reject",controlSelector:"button",confirmation:{kind:"local_storage_equals",key:"consent",expectedValue:"denied"}}});
      assert.ok(Date.now()-start < 2000, `elapsed ${Date.now()-start}`);
      assert.equal(packet.interactionDiagnostics?.click.outcome,"not_attempted");
      assert.equal(packet.decisionEvidence?.decision,"unknown");
      assert.equal(packet.observations.length,0);
      assert.ok(packet.limitations.some(reason=>reason.includes("budget_exhausted")));
      assert.equal(navigations,1);
      assert.ok(browser.isConnected());
      assert.equal(browser.contexts().length,0);
    } finally { await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve())); }
  });
}
