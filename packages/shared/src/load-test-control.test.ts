import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProductionLoadTestBatchId,
  buildProductionLoadTestSource,
  isProductionLoadTestBatchId,
  parseProductionLoadTestBatchId
} from "./load-test-control";

test("validates canonical production load-test batch ids only", () => {
  assert.equal(isProductionLoadTestBatchId("prod-manifest-2501-7000-load-test-20260522-0457"), true);
  assert.equal(isProductionLoadTestBatchId("prod-manifest-2501-7000-force-rescan-load-test-20260522-0457"), false);
  assert.equal(isProductionLoadTestBatchId("prod-manifest-7000-2501-load-test-20260522-0457"), false);
});

test("builds and parses canonical production load-test batch ids", () => {
  const batchId = buildProductionLoadTestBatchId({
    end: 630,
    now: new Date("2026-05-08T00:25:31.000Z"),
    start: 601
  });

  assert.equal(batchId, "prod-manifest-601-630-load-test-20260508-0025");
  assert.deepEqual(parseProductionLoadTestBatchId(batchId), {
    batchId,
    end: 630,
    start: 601,
    timestamp: "20260508-0025"
  });
});

test("builds source metadata tied to the canonical batch id", () => {
  assert.equal(
    buildProductionLoadTestSource({
      batchId: "prod-manifest-601-630-load-test-20260508-0025",
      domain: "example.invalid",
      manifestRow: 601,
      trancoGenerated: "2026-05-06",
      trancoList: "tranco-3Q2VL",
      trancoRank: 601
    }),
    "prod-manifest-601-630-load-test-20260508-0025;manifest_row=601;tranco_rank=601;tranco_list=tranco-3Q2VL;tranco_generated=2026-05-06;domain=example.invalid"
  );
});

