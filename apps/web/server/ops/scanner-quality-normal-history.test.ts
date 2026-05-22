import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAccumulatedScannerQualityWindow,
  buildNormalScannerQualityWindow,
  buildScannerQualityTrendSummary,
  type NormalScanQualityRow
} from "./scanner-quality-normal-history";

function row(overrides: Partial<NormalScanQualityRow> = {}): NormalScanQualityRow {
  return {
    accessPostureClass: "tolerant",
    completedAt: "2026-05-22T20:00:00.000Z",
    egressId: "aws-default",
    egressProvider: "aws-default",
    findingCount: 1,
    pagesScanned: 2,
    scanId: "00000000-0000-0000-0000-000000000001",
    status: "completed",
    ...overrides
  };
}

test("builds durable normal-scan windows from completed production scans", () => {
  const rows = Array.from({ length: 25 }, (_, index) =>
    row({
      accessPostureClass: index < 3 ? "early_loss" : "tolerant",
      blockedFlag: index < 4,
      completedAt: `2026-05-22T20:${String(index).padStart(2, "0")}:00.000Z`,
      findingCount: index < 10 ? 0 : 2,
      pagesScanned: index < 3 ? 0 : 2,
      scanId: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`
    })
  );

  const window = buildNormalScannerQualityWindow({ egressId: "aws-default", rows });

  assert.equal(window?.sourceType, "normal_scan");
  assert.equal(window?.completedCount, 5);
  assert.equal(window?.zeroFindingCount, 5);
  assert.equal(window?.findingsPerCompleted, 0);
  assert.equal(window?.accessPostureCounts.early_loss, 3);
  assert.equal(window?.labelCounts.bot_block_or_forbidden, 4);
  assert.equal(window?.windowStartCompletedAt, "2026-05-22T20:00:00.000Z");
  assert.equal(window?.windowEndCompletedAt, "2026-05-22T20:04:00.000Z");
});

test("does not build a normal-scan quality window until the completed-scan threshold is met", () => {
  const window = buildNormalScannerQualityWindow({
    egressId: "aws-default",
    rows: Array.from({ length: 4 }, () => row())
  });

  assert.equal(window, null);
});

test("defaults normal scan graph windows to 5 scans", () => {
  const window = buildNormalScannerQualityWindow({
    egressId: "aws-default",
    rows: Array.from({ length: 5 }, (_, index) =>
      row({
        completedAt: `2026-05-22T20:${String(index).padStart(2, "0")}:00.000Z`,
        scanId: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`
      })
    )
  });

  assert.equal(window?.completedCount, 5);
});

test("accumulates 5-scan graph windows into conservative warning windows", () => {
  const windows = Array.from({ length: 5 }, (_, windowIndex) =>
    buildNormalScannerQualityWindow({
      egressId: "aws-default",
      rows: Array.from({ length: 5 }, (_, index) =>
        row({
          completedAt: `2026-05-22T2${windowIndex}:${String(index).padStart(2, "0")}:00.000Z`,
          findingCount: windowIndex === 0 ? 0 : 2,
          scanId: `00000000-0000-0000-0000-${String(windowIndex * 5 + index + 1).padStart(12, "0")}`
        })
      )
    })!
  );

  const accumulated = buildAccumulatedScannerQualityWindow({
    batchId: "normal-scan-aws-default-window",
    egressId: "aws-default",
    windows
  });

  assert.equal(accumulated?.completedCount, 25);
  assert.equal(accumulated?.zeroFindingCount, 5);
  assert.equal(accumulated?.findingsPerCompleted, 40 / 25);
});

test("summarizes rolling trend selectors from durable windows without reading raw scans", () => {
  const windows = [
    {
      ...buildNormalScannerQualityWindow({
        egressId: "aws-default",
        rows: Array.from({ length: 25 }, (_, index) =>
          row({
            completedAt: `2026-05-22T20:${String(index).padStart(2, "0")}:00.000Z`,
            findingCount: index < 5 ? 0 : 2,
            scanId: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`
          })
        )
      })!,
      createdAt: "2026-05-22T20:30:00.000Z"
    },
    {
      ...buildNormalScannerQualityWindow({
        egressId: "aws-default",
        rows: Array.from({ length: 25 }, (_, index) =>
          row({
            completedAt: `2026-05-22T19:${String(index).padStart(2, "0")}:00.000Z`,
            findingCount: index < 15 ? 0 : 1,
            scanId: `00000000-0000-0000-0000-${String(index + 26).padStart(12, "0")}`
          })
        )
      })!,
      createdAt: "2026-05-22T19:30:00.000Z"
    }
  ];

  const summary = buildScannerQualityTrendSummary({ scanTargets: [20, 50], windows });

  assert.equal(summary[0]?.completedCount, 10);
  assert.equal(summary[0]?.zeroFindingRate, 1);
  assert.equal(summary[1]?.completedCount, 10);
  assert.equal(summary[1]?.zeroFindingRate, 1);
  assert.equal(summary[1]?.windowCount, 2);
});
