import assert from "node:assert/strict";
import test from "node:test";
import { assertProductionLoadTestClassifierProof, summarizeLoadTestQuality } from "./load-test-safety";

test("classifier proof rejects malformed force-rescan batch ids", () => {
  assert.throws(
    () =>
      assertProductionLoadTestClassifierProof({
        batchId: "prod-manifest-2501-7000-force-rescan-load-test-20260522-0457",
        domain: "example.invalid",
        manifestRow: 2501,
        trancoGenerated: "2026-05-22",
        trancoList: "tranco-test",
        trancoRank: 2501
      }),
    /Invalid production load-test batch id/
  );
});

test("classifier proof accepts generated canonical production load-test metadata", () => {
  const source = assertProductionLoadTestClassifierProof({
    batchId: "prod-manifest-2501-7000-load-test-20260522-0457",
    domain: "example.invalid",
    manifestRow: 2501,
    trancoGenerated: "2026-05-22",
    trancoList: "tranco-test",
    trancoRank: 2501
  });

  assert.match(source, /^prod-manifest-2501-7000-load-test-20260522-0457;/);
});

test("summarizes load-test quality by egress, time bucket, task, and slot", () => {
  const summary = summarizeLoadTestQuality([
    {
      accessPostureClass: "broad",
      completedAt: "2026-05-22T05:03:00.000Z",
      egressId: "aws-default",
      findingCounts: { a: 1 },
      interruptionLabels: [],
      pagesScanned: 4,
      queueWaitMs: 1000,
      runDurationMs: 9000,
      scannerSlot: 1,
      scannerTaskArn: "task-a",
      status: "completed"
    },
    {
      accessPostureClass: "blocked",
      completedAt: "2026-05-22T05:11:00.000Z",
      egressId: "aws-default",
      errorCounters: { cdp_timeout: 1 },
      findingCounts: {},
      interruptionLabels: ["captcha"],
      pagesScanned: 0,
      queueWaitMs: 3000,
      runDurationMs: 11000,
      scannerSlot: 1,
      scannerTaskArn: "task-a",
      status: "completed"
    },
    {
      accessPostureClass: "blocked",
      completedAt: "2026-05-22T05:12:00.000Z",
      egressId: "aws-default",
      findingCounts: {},
      interruptionLabels: ["runtime_error"],
      pagesScanned: 0,
      queueWaitMs: 4000,
      runDurationMs: 12000,
      scannerSlot: 1,
      scannerTaskArn: "task-a",
      status: "failed"
    }
  ]);

  assert.equal(summary.length, 1);
  assert.equal(summary[0]?.completedCount, 2);
  assert.equal(summary[0]?.topFindingCount, 1);
  assert.equal(summary[0]?.zeroFindingCount, 1);
  assert.equal(summary[0]?.pagesScanned, 4);
  assert.equal(summary[0]?.zeroFindingRate, 0.5);
  assert.equal(summary[0]?.queueWaitMsAverage, 8000 / 3);
  assert.deepEqual(summary[0]?.interruptionLabels, { none: 1, captcha: 1, runtime_error: 1 });
  assert.deepEqual(summary[0]?.errorCounters, { cdp_timeout: 1 });
});
