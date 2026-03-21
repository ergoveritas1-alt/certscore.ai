import assert from "node:assert/strict";
import test from "node:test";
import {
  categorizeScannerExecutionError,
  createScannerExecutionSummary,
  finalizeScannerExecutionSummary,
  getScannerExecutionSummary,
  isScannerExecutionErrorTransient,
  isScannerStageRecoverable,
  recordScannerStageOutcome
} from "./scanner-execution";

test("categorizeScannerExecutionError maps timeout-style errors to transient navigation failures", () => {
  assert.equal(categorizeScannerExecutionError(new Error("Initial navigation timed out after 30000ms")), "navigation_timeout");
  assert.equal(isScannerExecutionErrorTransient("navigation_timeout"), true);
});

test("baseline lookup failures are treated as recoverable", () => {
  assert.equal(isScannerStageRecoverable("baseline_lookup", "baseline_lookup"), true);
  assert.equal(isScannerStageRecoverable("baseline_lookup", "database"), true);
  assert.equal(isScannerStageRecoverable("baseline_lookup", "missing_record"), false);
});

test("recordScannerStageOutcome tracks degraded stages and final failure category", () => {
  const startedAt = "2026-03-21T20:00:00.000Z";
  const degradedSummary = recordScannerStageOutcome(
    createScannerExecutionSummary({ startedAt }),
    {
      attempts: 1,
      completedAt: "2026-03-21T20:00:05.000Z",
      durationMs: 5000,
      errorCategory: "baseline_lookup",
      message: "Previous snapshot lookup failed.",
      metadata: { fallbackUsed: true },
      outcome: "degraded",
      recoverable: true,
      stage: "baseline_lookup",
      startedAt
    }
  );

  assert.deepEqual(degradedSummary.degradedStages, ["baseline_lookup"]);
  assert.equal(degradedSummary.failureCategory, null);

  const failedSummary = recordScannerStageOutcome(degradedSummary, {
    attempts: 2,
    completedAt: "2026-03-21T20:01:00.000Z",
    durationMs: 10000,
    errorCategory: "persistence",
    message: "Failed to persist scan output.",
    metadata: null,
    outcome: "failed",
    recoverable: false,
    stage: "persistence_diff_finalization",
    startedAt: "2026-03-21T20:00:50.000Z"
  });

  assert.equal(failedSummary.failureCategory, "persistence");
  assert.deepEqual(failedSummary.degradedStages, ["baseline_lookup"]);
});

test("finalizeScannerExecutionSummary preserves the contract shape for scan config parsing", () => {
  const summary = finalizeScannerExecutionSummary(
    createScannerExecutionSummary({ startedAt: "2026-03-21T20:00:00.000Z" }),
    {
      completedAt: "2026-03-21T20:00:10.000Z",
      lifecycle: "completed"
    }
  );

  const parsed = getScannerExecutionSummary({
    execution: {
      summary
    }
  });

  assert.deepEqual(parsed, summary);
});
