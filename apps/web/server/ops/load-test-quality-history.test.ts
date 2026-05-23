import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRollingBaseline,
  buildScannerQualityWindows,
  buildWarningDedupeKey,
  shouldNotifyQualityWarning,
  windowToMetricValues
} from "./load-test-quality-history";
import type { LoadTestQualityWarning } from "@website-signal-risk-scanner/shared";
import type { LoadTestSummaryEntry } from "../../scripts/load-test-safety";

function entry(overrides: Partial<LoadTestSummaryEntry> = {}): LoadTestSummaryEntry {
  return {
    accessPostureClass: "tolerant",
    completedAt: "2026-05-22T20:00:00.000Z",
    egressId: "aws-default",
    egressProvider: "aws-default",
    findingCounts: { semantic_labeling_accessibility_issue: 1 },
    interruptionLabels: [],
    pagesScanned: 2,
    queueWaitMs: 1000,
    runDurationMs: 9000,
    scannerSlot: 1,
    scannerTaskArn: "task-a",
    status: "completed",
    ...overrides
  };
}

function warning(overrides: Partial<LoadTestQualityWarning> = {}): LoadTestQualityWarning {
  return {
    batchId: "prod-manifest-1-25-load-test-20260522-1300",
    code: "quality_regression_vs_baseline",
    comparisonTier: "rolling",
    completionWindow: { completedCount: 25 },
    egressProvider: "aws-default",
    egress_id: "aws-default",
    explanation: "regression",
    generatedAt: "2026-05-22T20:00:00.000Z",
    metrics: {
      completedCount: 25,
      findingsPerCompleted: 0.6,
      pagesScanned: 50,
      zeroFindingRate: 0.5
    },
    severity: "warn",
    warningId: "prod-manifest-1-25-load-test-20260522-1300:aws-default:quality_regression_vs_baseline",
    ...overrides
  };
}

test("serializes run entries into per-egress scanner quality windows", () => {
  const windows = buildScannerQualityWindows({
    batchId: "prod-manifest-1-25-load-test-20260522-1300",
    endRow: 25,
    entries: [
      entry(),
      entry({
        accessPostureClass: "early_loss",
        findingCounts: {},
        interruptionLabels: ["authentication_wall", "early_loss"],
        pagesScanned: 0,
        scannerSlot: 2,
        scannerTaskArn: "task-b"
      }),
      entry({
        status: "failed"
      })
    ],
    rejectedCount: 1,
    startRow: 1
  });

  assert.equal(windows.length, 1);
  assert.equal(windows[0]?.completedCount, 2);
  assert.equal(windows[0]?.failedCount, 1);
  assert.equal(windows[0]?.rejectedCount, 1);
  assert.equal(windows[0]?.findingsPerCompleted, 0.5);
  assert.equal(windows[0]?.zeroFindingCount, 1);
  assert.equal(windows[0]?.findingCountsAvailable, true);
  assert.deepEqual(windows[0]?.findingCounts, { semantic_labeling_accessibility_issue: 1 });
  assert.deepEqual(windows[0]?.findingScanCounts, { semantic_labeling_accessibility_issue: 1 });
  assert.deepEqual(windows[0]?.accessPostureCounts, { early_loss: 1, tolerant: 1 });
  assert.deepEqual(windows[0]?.labelCounts, { authentication_wall: 1, early_loss: 1, none: 1 });
  assert.deepEqual(windows[0]?.scannerSlotCounts, { "1": 1, "2": 1 });
});

test("builds rolling same-egress baseline from persisted windows", () => {
  const windows = [
    {
      ...buildScannerQualityWindows({ batchId: "a", entries: Array.from({ length: 25 }, () => entry()) })[0]!,
      labelCounts: { authentication_wall: 5 }
    },
    {
      ...buildScannerQualityWindows({
        batchId: "b",
        entries: Array.from({ length: 25 }, (_, index) => entry({ findingCounts: index < 5 ? {} : { a: 2 } }))
      })[0]!,
      labelCounts: { authentication_wall: 10 }
    }
  ];

  const baseline = buildRollingBaseline(windows);

  assert.equal(baseline?.tier, "rolling");
  assert.equal(baseline?.completedCount, 50);
  assert.equal(baseline?.zeroFindingRate, 0.1);
  assert.equal(baseline?.blockerLabelRate, 0.3);
  assert.ok((baseline?.findingsPerCompleted ?? 0) > 1);
});

test("builds rolling baseline from smaller normal-scan windows once they total 25 scans", () => {
  const windows = Array.from({ length: 3 }, (_, windowIndex) =>
    buildScannerQualityWindows({
      batchId: `normal-${windowIndex}`,
      entries: Array.from({ length: 10 }, (_, index) =>
        entry({
          findingCounts: windowIndex === 0 && index < 5 ? {} : { a: 1 }
        })
      )
    })[0]!
  );

  const baseline = buildRollingBaseline(windows);

  assert.equal(baseline?.completedCount, 30);
  assert.equal(baseline?.zeroFindingRate, 5 / 30);
});

test("converts persisted window to evaluator metric values", () => {
  const window = buildScannerQualityWindows({
    batchId: "a",
    entries: Array.from({ length: 25 }, (_, index) =>
      entry({
        findingCounts: index < 10 ? {} : { a: 1 },
        interruptionLabels: index < 8 ? ["captcha_or_security_challenge"] : [],
        pagesScanned: 2
      })
    )
  })[0]!;

  const metrics = windowToMetricValues(window);

  assert.equal(metrics.completedCount, 25);
  assert.equal(metrics.zeroFindingRate, 0.4);
  assert.equal(metrics.blockerLabelRate, 0.32);
});

test("uses stable warning dedupe keys and keeps notification disabled by default", async () => {
  const item = warning();

  assert.equal(buildWarningDedupeKey(item), "aws-default:quality_regression_vs_baseline:warn");

  const decision = await shouldNotifyQualityWarning({
    warning: item
  });

  assert.equal(decision.shouldNotify, false);
  assert.equal(decision.reason, "email_disabled");
});
