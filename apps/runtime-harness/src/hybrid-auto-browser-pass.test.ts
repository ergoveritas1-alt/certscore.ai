import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createDefaultHybridAutoBrowserPassRunner,
  createHybridAutoDecisionSummary,
  markAutoEscalatedRuntimeResult,
  runHybridAutoSession,
  type HybridAutoBrowserPassRunner
} from "./hybrid-auto-browser-pass";
import { buildBrowserPassResult } from "./test-helpers/browser-pass-result";
import { buildRuntimeRunResult } from "./test-helpers/runtime-run-result";
import type { RuntimeFactory } from "./core/capture";
import type { RuntimeLogger, RuntimeOptions, UnifiedRuntime } from "./core/types";

class StubRuntime implements UnifiedRuntime {
  constructor(private readonly result = buildRuntimeRunResult()) {}

  async close() {}
  async init() {}
  async navigate(_url: string) {}
  async observe(_ms: number) {}
  async snapshot() {
    return this.result;
  }
}

test("default hybrid auto browser-pass runner returns runtime result, browser pass, and persisted artifact", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "runtime-harness-browser-pass-"));
  try {
    const runner = createDefaultHybridAutoBrowserPassRunner();
    const logger: RuntimeLogger = {
      log() {}
    };
    const options: RuntimeOptions = {
      chromeRemoteDebuggingUrl: null,
      mode: "playwright-local",
      observeMs: 10_000,
      outputDir,
      remoteCdpWsEndpoint: null,
      timeoutMs: 30_000,
      userAgent: null
    };
    const runtimeFactory: RuntimeFactory = () =>
      new StubRuntime(
        buildRuntimeRunResult({
          mode: "playwright-local",
          outputDir: path.join(outputDir, "playwright-local")
        })
      );

    const run = await runner.execute({
      logger,
      mode: "playwright-local",
      options,
      requestedUrl: "https://example.com",
      runtimeFactory
    });

    assert.equal(run.runtimeResult.mode, "playwright-local");
    assert.equal(run.browserPass.initialDocumentStatus, 200);
    assert.equal(run.decision.reason, "not_needed");

    const persisted = JSON.parse(await readFile(path.join(outputDir, "playwright-local", "browser-pass.json"), "utf8")) as {
      initialDocumentStatus: number | null;
    };
    assert.equal(persisted.initialDocumentStatus, 200);
  } finally {
    await rm(outputDir, { force: true, recursive: true });
  }
});

test("runHybridAutoSession escalates to cdp and annotates the cdp runtime result", async () => {
  const localResult = buildRuntimeRunResult({
    mode: "playwright-local"
  });
  const cdpResult = buildRuntimeRunResult({
    mode: "playwright-cdp"
  });
  const runner: HybridAutoBrowserPassRunner = {
    async execute(input) {
      return {
        browserPass:
          input.mode === "playwright-local"
            ? buildBrowserPassResult({
                cookieCountTotal: 0,
                hybridRuntimeEvidence: {
                  networkSummary: {
                    totalRequestCount: 1
                  }
                },
                thirdPartyRequestDomains: []
              })
            : buildBrowserPassResult({
                hybridRuntimeEvidence: {
                  networkSummary: {
                    totalRequestCount: 10
                  }
                }
              }),
        decision:
          input.mode === "playwright-local"
            ? {
                detail: "Local pass did not collect enough runtime depth.",
                reason: "thin_runtime",
                shouldEscalate: true
              }
            : {
                detail: "CDP pass collected enough runtime depth.",
                reason: "not_needed",
                shouldEscalate: false
              },
        runtimeResult: input.mode === "playwright-local" ? localResult : cdpResult
      };
    }
  };
  const loggerMessages: string[] = [];
  const logger: RuntimeLogger = {
    log(message) {
      loggerMessages.push(message);
    }
  };
  const options: RuntimeOptions = {
    chromeRemoteDebuggingUrl: null,
    mode: "playwright-local",
    observeMs: 10_000,
    outputDir: "/tmp/runtime-harness",
    remoteCdpWsEndpoint: null,
    timeoutMs: 30_000,
    userAgent: null
  };
  const session = await runHybridAutoSession({
    buildOptions(mode) {
      return { ...options, mode };
    },
    logger,
    requestedUrl: "https://example.com",
    runner,
    runtimeFactories: {
      "playwright-cdp": () => new StubRuntime(cdpResult),
      "playwright-local": () => new StubRuntime(localResult)
    }
  });

  assert.equal(session.autoDecisionSummary.decision, "escalated_to_cdp");
  assert.equal(session.results.length, 2);
  assert.equal(session.results[1]?.runtimeMetadata.autoEscalated, true);
  assert.equal(session.results[1]?.runQualitySummary.usedEscalation, true);
  assert.match(loggerMessages[0] ?? "", /escalating from playwright-local to playwright-cdp/);
});

test("createHybridAutoDecisionSummary maps hybrid auto decisions to persisted summary shape", () => {
  const summary = createHybridAutoDecisionSummary("https://example.com", {
    detail: "Local pass did not collect enough runtime depth.",
    reason: "thin_runtime",
    shouldEscalate: true
  });

  assert.equal(summary.targetUrl, "https://example.com");
  assert.equal(summary.decision, "escalated_to_cdp");
  assert.equal(summary.reasonDetail, "Local pass did not collect enough runtime depth.");
});

test("markAutoEscalatedRuntimeResult marks runtime metadata and run quality", () => {
  const result = buildRuntimeRunResult({
    mode: "playwright-cdp"
  });
  const marked = markAutoEscalatedRuntimeResult(result);

  assert.equal(marked.runtimeMetadata.autoEscalated, true);
  assert.equal(marked.runQualitySummary.usedEscalation, true);
  assert.match(marked.runQualitySummary.rationale.at(-1) ?? "", /auto escalation/);
});
