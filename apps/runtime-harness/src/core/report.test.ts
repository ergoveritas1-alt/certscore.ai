import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createComparisonReport, writeHybridAutoReportBundle } from "./report";
import { buildRuntimeRunResult } from "../test-helpers/runtime-run-result";
import type { AutoDecisionSummary } from "./types";

test("writeHybridAutoReportBundle persists comparison report and auto decision together", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "runtime-harness-report-"));
  try {
    const report = createComparisonReport(
      "https://example.com",
      [
        buildRuntimeRunResult({
          fingerprinting: {
            confidence: "medium",
            reasons: [
              "Observed 1 requests carrying device or browser attribute hints.",
              "Observed 4 identifier-like requests.",
              "Matched known anti-bot or bot-detection pattern: cloudflare_bot_management."
            ],
            signals: {
              attributeCategories: [],
              attributeCategoryCount: 0,
              burstDetected: false,
              collectionPattern: "isolated",
              firstPartyInvolved: null,
              identifierShapingDetected: false,
              knownBotLibraryMatch: "cloudflare_bot_management",
              knownFingerprintLibraryMatch: null,
              networkAfterCollection: false,
              preConsent: "unknown",
              thirdPartyAfterCollection: false,
              thirdPartyInvolved: null
            },
            summary: "The page loaded known anti-bot or fingerprint-related tooling and emitted identifier or device-oriented telemetry, which is suspicious but not enough to confirm active fingerprinting.",
            tier: 1
          }
        })
      ]
    );
    const autoDecisionSummary: AutoDecisionSummary = {
      decision: "escalated_to_cdp",
      localMode: "playwright-local",
      reason: "thin_runtime",
      reasonDetail: "Local pass did not collect enough runtime depth.",
      targetUrl: "https://example.com",
      timestamp: "2026-04-02T20:00:00.000Z"
    };

    const written = await writeHybridAutoReportBundle(outputDir, report, autoDecisionSummary);

    assert.equal(path.basename(written.jsonPath), "comparison.json");
    assert.equal(path.basename(written.markdownPath), "comparison.md");
    assert.equal(path.basename(written.autoDecisionPath ?? ""), "auto-decision.json");

    const persistedDecision = JSON.parse(await readFile(path.join(outputDir, "auto-decision.json"), "utf8")) as AutoDecisionSummary;
    assert.equal(persistedDecision.reason, "thin_runtime");

    const markdown = await readFile(path.join(outputDir, "comparison.md"), "utf8");
    assert.match(markdown, /fingerprinting summary:/i);
    assert.match(markdown, /cloudflare_bot_management/i);
  } finally {
    await rm(outputDir, { force: true, recursive: true });
  }
});
