import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { derivePolicySurfaceInspectionOutcome, privacyChoiceInspectionSchema } from "@certscore/contracts";
import { createArtifactWriter } from "./artifact-writer";
import { policySurfaceScanner, type PolicyNanoAssistProvider } from "./scanners/policy-surface-scanner";
import { redirectedPolicyText } from "./test-fixtures/redirected-policy-recovery";

// Everything stays on loopback; model calls are replaced by deterministic fixtures.
const nanoAssistProvider: PolicyNanoAssistProvider = { async classifyLinks(input) {
  return { assistId: input.assistId, rankedCandidates: input.candidates.slice(0, 8).map((candidate, i) => ({
    candidateId: candidate.candidateId, likelySurfaceType: candidate.deterministicSurfaceType,
    shouldFetch: candidate.fetchable, priorityRank: i + 1, confidence: 0.95, uncertaintyNotes: [],
  })) };
} };
const body = `<main><h1>Riverside Restaurant</h1><p>${"Visit our family restaurant for lunch and dinner. Explore our seasonal menu, opening hours, reservations and local catering services. ".repeat(12)}</p></main>`;

async function fixture(options: { recovery?: boolean; blocked?: boolean; extra?: string } = {}) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
    response.setHeader("content-type", "text/html");
    if (request.url === "/") {
      if (options.blocked || options.recovery && !/Mozilla/.test(request.headers["user-agent"] ?? "")) {
        response.statusCode = 403; response.end("Access denied"); return;
      }
      response.end(`<html lang="en"><body>${body}<footer><a href="/privacy">Privacy Policy</a>${options.extra ?? ""}</footer></body></html>`);
    } else if (request.url === "/privacy") {
      response.end(`<html lang="en"><title>Privacy Policy</title><body><main>${redirectedPolicyText.repeat(4)}</main></body></html>`);
    } else { response.statusCode = 404; response.end("Not found"); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/`;
  const root = await mkdtemp(path.join(tmpdir(), "certscore-choice-retention-"));
  return { url, root, requests, async close() {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  } };
}

for (const scenario of ["absence", "observed", "unnamed", "blocked"] as const) {
  test(`choice retention: homepage recovery preserves ${scenario} without relaxing absence`, { timeout: 20_000 }, async () => {
    const f = await fixture({ recovery: true, blocked: scenario === "blocked", extra: scenario === "observed"
      ? '<a href="/choices">Do Not Sell or Share My Personal Information</a>'
      : scenario === "unnamed" ? '<button style="width:24px;height:24px"></button>' : undefined });
    try {
      const result = await policySurfaceScanner({ url: f.url, normalizedUrl: f.url, scanStartedAtMs: Date.now(),
        internalBudgetMs: 8_000, discoveryMode: "fast", artifactWriter: await createArtifactWriter(f.root), nanoAssistProvider });
      assert.ok(result.moduleRun.timingBreakdown?.some(t => t.label === "homepage-failed rendered discovery"));
      const inspection = derivePolicySurfaceInspectionOutcome({ modulesRun: [result.moduleRun], normalizedUrl: f.url,
        privacyChoiceInspection: result.privacyChoiceInspection, policySurfaceObservations: result.policySurfaceObservations });
      if (scenario === "blocked") {
        assert.notEqual(inspection.privacyChoiceInspection?.coverage, "complete");
      } else {
        const proof = privacyChoiceInspectionSchema.parse(result.privacyChoiceInspection);
        assert.deepEqual(inspection.privacyChoiceInspection, proof, "Canonical projection retains the same typed proof");
        assert.equal(proof.documentUrl, f.url);
        assert.equal(proof.coverage, scenario === "unnamed" ? "limited" : "complete");
        assert.equal(proof.namedChoiceCandidateCount, scenario === "observed" ? 1 : 0);
        if (scenario === "unnamed") assert.equal(proof.unnamedControlCount, 1);
        if (scenario === "observed") assert.ok(result.policySurfaceObservations.some(row => row.surfaceType === "do_not_sell_or_share" && row.linkVisibility === "visible"));
        assert.ok(result.policySurfaceObservations.some(row => row.url.endsWith("/privacy") && row.documentFetchState === "fetched"));
      }
      assert.equal(result.negativeSearchEvidence, undefined, "Recovery proof must not manufacture a complete static policy search");
    } finally { await f.close(); }
  });
}

for (const {recovery, limited} of [{recovery:false,limited:false}, {recovery:true,limited:false}, {recovery:true,limited:true}]) {
  test(`choice capture order: ${limited ? "limited" : "validated"} inventory survives stalled optional CMP read (${recovery ? "recovery" : "ordinary"})`, { timeout: 15_000 }, async () => {
    const f = await fixture({ recovery, extra: limited ? '<button style="width:24px;height:24px"></button>' : undefined });
    const browser = await chromium.launch({ headless: true });
    const originalNewContext = browser.newContext.bind(browser);
    let optionalReads = 0, inventoryReads = 0, releaseOptional!: () => void;
    let contextCount = 0;
    const pending = new Promise<void>(resolve => { releaseOptional = resolve; });
    browser.newContext = async (...args) => {
      contextCount++;
      const context = await originalNewContext(...args), originalNewPage = context.newPage.bind(context);
      context.newPage = async () => {
        const page = await originalNewPage(), evaluate = page.evaluate.bind(page);
        const evaluateHandle = page.evaluateHandle.bind(page);
        page.evaluateHandle = (async (fn: unknown, arg: unknown) => {
          if (typeof fn === "string" && fn.includes("unnamedControlCount")) inventoryReads++;
          return evaluateHandle(fn as never, arg as never);
        }) as typeof page.evaluateHandle;
        page.evaluate = (async (fn: unknown, arg: unknown) => {
          if (typeof fn === "string" && fn.includes("unnamedControlCount")) inventoryReads++;
          if (typeof fn === "function" && fn.name === "readDidomiPublisherPolicy") {
            optionalReads++;
            assert.equal(inventoryReads, 1, "The original inventory read must precede optional CMP work");
            await pending;
            return undefined;
          }
          return evaluate(fn as never, arg as never);
        }) as typeof page.evaluate;
        return page;
      };
      return context;
    };
    try {
      const started = Date.now();
      const result = await policySurfaceScanner({ url: f.url, normalizedUrl: f.url, scanStartedAtMs: started,
        internalBudgetMs: 5_000, absoluteDeadlineAtMs: started + 6_000, discoveryMode: "fast", browser,
        artifactWriter: await createArtifactWriter(f.root), nanoAssistProvider });
      assert.equal(optionalReads, 1); assert.equal(inventoryReads, 1); assert.equal(contextCount, 1);
      assert.equal(result.privacyChoiceInspection?.coverage, limited ? "limited" : "complete");
      if (limited) assert.equal(result.privacyChoiceInspection?.unnamedControlCount, 1);
      assert.equal(result.privacyChoiceInspection?.namedChoiceCandidateCount, 0);
      assert.equal(result.negativeSearchEvidence, undefined);
      assert.ok(Date.now() - started < 7_000, "No deadline extension or new tail wait");
      const terminal = JSON.stringify(result);
      releaseOptional(); await new Promise(resolve => setTimeout(resolve, 40));
      assert.equal(JSON.stringify(result), terminal, "Late optional work cannot mutate the returned result");
    } finally { releaseOptional(); await browser.close(); await f.close(); }
  });
}
