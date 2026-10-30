import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { projectPostRefusalEvidenceForReport } from "@certscore/contracts";
import { runPostRefusalObserver } from "./post-refusal-observer.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";

for (const mode of ["after_action", "before_action", "missing_receipt"] as const) {
  test(`Reject collection proof retains the same native request clock: ${mode}`, { timeout: 10000 }, async () => {
    const server = createServer((_req, res) => {
      res.setHeader("content-type", "text/html");
      res.end(`<!doctype html><body><section class="cky-consent-container" style="position:fixed;top:10px;background:white"><p>Choose optional analytics cookies</p><button class="cky-btn-reject">Reject all</button></section><script>
        document.querySelector('button').onclick=()=>{
          setTimeout(()=>fetch('https://stats.g.doubleclick.net/g/collect?v=2&tid=G-OWNED&cid=123456.789&en=page_view').catch(()=>{}),100);
          if(${mode !== "missing_receipt"})setTimeout(()=>{document.cookie='cookieyes-consent=consentid:fixture,action:reject,necessary:yes,analytics:no,advertisement:no;path=/';document.querySelector('section').hidden=true;},250);
        };</script>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const browser = await chromium.launch({ headless: true }), original = browser.newContext.bind(browser);
    let captured = false;
    browser.newContext = async options => {
      const context = await original(options);
      await context.route("https://stats.g.doubleclick.net/**", route => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
      context.on("page", page => page.on("request", request => {
        if (!request.url().startsWith("https://stats.g.doubleclick.net/")) return;
        captured = true;
        const timing = request.timing.bind(request), epoch = Date.now(), offset = mode === "before_action" ? 1000 : 10;
        let calls = 0;
        request.timing = () => ({ ...timing(), startTime: calls++ === 0 ? 0 : epoch - offset });
      }));
      return context;
    };
    try {
      const runtime = process.env.CMP_CLOCK_RUNTIME_ROOT;
      const run = runtime ? (await import(runtime + "/packages/certscore-scan-core/dist/post-refusal-observer.js")).runPostRefusalObserver : runPostRefusalObserver;
      const input = { browser, url: `http://127.0.0.1:${address.port}/`, scanId: `clock-${mode}`,
        interactionAuthorization: { kind: "loopback", authorizationId: "loopback_local_lab" } as const,
        recipe: buildCanonicalPostRefusalActionRecipes().find(r => r.cmpId === "CookieYes")!,
        actionSearchTimeoutMs: 1000, resultBudgetMs: 6000, confirmationTimeoutMs: 600, observationWindowMs: 3000,
        productionProjectable: true, outDir: process.env.CMP_CLOCK_OUTPUT_DIR ? process.env.CMP_CLOCK_OUTPUT_DIR + "/" + mode : undefined };
      if (process.env.CMP_CLOCK_EXPECT_FAILURE && mode !== "missing_receipt") {
        await assert.rejects(() => run(input), /California collection proof must bind to its exact retained request/);
        console.log("CLOCK_MISMATCH_REPRODUCED " + mode); return;
      }
      const packet = await run(input); assert.equal(captured, true);
      const projection = projectPostRefusalEvidenceForReport({ packet, packetSha256: createHash("sha256").update(JSON.stringify(packet)).digest("hex") });
      const row = packet.network.requests.find((r: { californiaCollection?: unknown }) => r.californiaCollection)!;
      assert.ok(row); assert.equal(row.startedAtMs, row.californiaCollection!.startedAtMs);
      assert.equal(projection.execution?.observationCompleted, true);
      assert.equal(projection.execution?.consentConfirmed, mode !== "missing_receipt");
      if (mode === "before_action") {
        assert.ok(row.startedAtMs < packet.refusalRegistration.actionDispatchedAtMs!);
        assert.equal(row.inFlightAtRefusalRegistration, true);
        assert.ok(!packet.network.postRefusalNonEssentialRequests.some((r: { requestId: string }) => r.requestId === row.requestId));
      }
      console.log("CLOCK_BINDING_RESULT " + JSON.stringify({ mode, execution: projection.execution, requestStartedAtMs: row.startedAtMs, proofStartedAtMs: row.californiaCollection!.startedAtMs, dispatchedAtMs: packet.refusalRegistration.actionDispatchedAtMs }));
    } finally { await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
}
