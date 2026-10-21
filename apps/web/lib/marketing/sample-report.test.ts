import assert from "node:assert/strict";
import test from "node:test";
import { resolveSampleReport } from "./sample-report";

const localScanId = "69848191-d632-4d4b-94b1-294b8f3aa93b";
const localInput = { nodeEnv: "development", appUrl: "http://localhost:3000", localScanId };

test("localhost sample links to the configured completed test1 scan on the same origin", () => {
  assert.deepEqual(resolveSampleReport(localInput), {
    scanId: localScanId,
    targetUrl: "https://ergoveritas.com/test1.html",
    url: `/scan/${localScanId}`
  });
});

test("production and non-local environments never link to a local-only scan", () => {
  const production = resolveSampleReport({});
  assert.equal(production.url, "https://certscore.ai/scan/bfbe7f5b-d46f-438e-a898-411e44d2571b");
  assert.equal(production.targetUrl, "https://ergoveritas.com/test1.html");
  for (const nodeEnv of ["production", "test", undefined]) {
    assert.deepEqual(resolveSampleReport({ ...localInput, nodeEnv }), production);
  }
  assert.deepEqual(resolveSampleReport({ ...localInput, appUrl: "https://certscore.ai" }), production);
});

test("unset or malformed local scan IDs preserve the existing sample", () => {
  const fallback = resolveSampleReport({});
  for (const localScanId of [undefined, "", "bad-id", "https://example.com/report"]) {
    assert.deepEqual(resolveSampleReport({ ...localInput, localScanId }), fallback);
  }
});
