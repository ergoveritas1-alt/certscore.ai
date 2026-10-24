import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { privacyChoiceInspectionSchema } from "@certscore/contracts";
import { createArtifactWriter } from "./artifact-writer";
import { policySurfaceScanner } from "./scanners/policy-surface-scanner";
import { redirectedPolicyText } from "./test-fixtures/redirected-policy-recovery";

for (const scenario of ["complete", "unnamed", "hidden_frame", "inventory_failure", "inventory_timeout", "optional_timeout", "cancelled"] as const) {
  test(`speculative analysis follows retained inspection: ${scenario}`, { timeout: 18000 }, async () => {
    const controller = new AbortController();
    const requests: string[] = [];
    const extra = scenario === "unnamed" ? '<button style="width:25px;height:25px"></button>'
      : scenario === "hidden_frame" ? '<iframe style="display:none" srcdoc="<p>Hidden</p>"></iframe>' : "";
    const server = createServer((req, res) => {
      requests.push(req.url ?? ""); res.setHeader("content-type", "text/html");
      if (req.url === "/privacy") res.end(`<html lang="en"><title>Privacy Policy</title><body><main>${redirectedPolicyText.repeat(4)}</main></body></html>`);
      else if (req.url === "/") res.end(`<html lang="en"><body><main>${"Cloud Security offers website security tools, support and documentation for businesses. ".repeat(25)}</main><footer><a href="/privacy">Privacy Policy</a>${extra}</footer></body></html>`);
      else { res.statusCode = 404; res.end("Not found"); }
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/`;
    const root = await mkdtemp(path.join(tmpdir(), "certscore-analysis-gate-"));
    const browser = await chromium.launch({ headless: true });
    const newContext = browser.newContext.bind(browser);
    let release!: () => void, inventoryReads = 0, externalRequests = 0;
    const hold = new Promise<void>(resolve => { release = resolve; });
    browser.newContext = async (...args) => {
      const context = await newContext(...args);
      await context.route("**/*", async route => {
        if (new URL(route.request().url()).origin !== new URL(url).origin) { externalRequests++; await route.abort(); }
        else await route.fallback();
      });
      const newPage = context.newPage.bind(context);
      context.newPage = async () => {
        const page = await newPage(), evaluate = page.evaluate.bind(page);
        page.evaluate = (async (fn: unknown, arg: unknown) => {
          if (typeof fn === "string" && fn.includes("unnamedControlCount")) {
            inventoryReads++;
            if (scenario === "inventory_failure") throw new Error("Offline inventory failure");
            if (scenario === "cancelled") { controller.abort(); throw new Error("Offline cancellation"); }
            if (scenario === "inventory_timeout") await hold;
          }
          if (scenario === "optional_timeout" && typeof fn === "function" && fn.name === "readDidomiPublisherPolicy") await hold;
          return evaluate(fn as never, arg as never);
        }) as typeof page.evaluate;
        return page;
      };
      return context;
    };
    try {
      const started = Date.now();
      const result = await policySurfaceScanner({ url, normalizedUrl: url, scanStartedAtMs: started,
        internalBudgetMs: 3000, absoluteDeadlineAtMs: started + 8000, discoveryMode: "fast", browser,
        signal: controller.signal, artifactWriter: await createArtifactWriter(root), enableNanoPolicyAssist: false,
        nanoAssistProvider: { async classifyLinks() { throw new Error("Model calls forbidden in offline test"); } } });
      const timings = result.moduleRun.timingBreakdown ?? [];
      const warmIndex = timings.findIndex(row => row.label === "static policy analysis warmup");
      const allow = ["complete", "unnamed", "hidden_frame"].includes(scenario);
      assert.equal(warmIndex >= 0, allow);
      if (allow) {
        assert.ok(warmIndex > timings.findIndex(row => row.label === "rendered discovery"));
        assert.equal(privacyChoiceInspectionSchema.parse(result.privacyChoiceInspection).coverage,
          scenario === "complete" ? "complete" : "limited");
      } else if (scenario === "optional_timeout") {
        assert.equal(result.privacyChoiceInspection?.coverage, "complete", "Retain valid evidence even though timed-out capture discards speculation");
      } else assert.notEqual(result.privacyChoiceInspection?.coverage, "complete");
      if (scenario !== "cancelled") {
        assert.ok(result.policySurfaceObservations.some(row => row.surfaceType === "privacy_policy" && row.status === "fetched"),
          "Discarding speculative analysis must preserve selected-document analysis from the same fetch cache");
      }
      assert.equal(inventoryReads, 1); assert.equal(externalRequests, 0);
      assert.equal(requests.filter(request => request === "/privacy").length, 1, "No policy retry or additional fetch");
      assert.ok(Date.now() - started < 8000);
      const terminal = JSON.stringify(result); release(); await new Promise(resolve => setTimeout(resolve, 40));
      assert.equal(JSON.stringify(result), terminal, "Late completion cannot restart speculation or mutate terminal evidence");
    } finally {
      release(); controller.abort(); await browser.close(); server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true });
    }
  });
}
