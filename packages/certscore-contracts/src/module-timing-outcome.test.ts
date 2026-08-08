import assert from "node:assert/strict";
import test from "node:test";
import { scanModuleRunSchema } from "./index.js";

test("scan module timing retains typed completed, timeout, failure, recovery, and skipped outcomes", () => {
  const parsed = scanModuleRunSchema.parse({
    moduleName: "preConsentRuntimeScanner",
    status: "partial",
    startedAt: "2026-08-08T20:00:00.000Z",
    timingBreakdown: [
      { label: "inventory", durationMs: 10, outcome: "completed" },
      { label: "probe", durationMs: 20, outcome: "timed_out" },
      { label: "primary screenshot", durationMs: 30, outcome: "failed" },
      { label: "visual fallback", durationMs: 40, outcome: "recovered" },
      { label: "optional diagnostic", durationMs: 0, outcome: "skipped" },
    ],
    evidenceRefs: [],
    errors: ["Primary screenshot failed."],
  });

  assert.deepEqual(
    parsed.timingBreakdown?.map((entry) => entry.outcome),
    ["completed", "timed_out", "failed", "recovered", "skipped"],
  );
});

test("scan module timing remains backward-compatible with retained bundles that predate typed outcomes", () => {
  const parsed = scanModuleRunSchema.parse({
    moduleName: "preConsentRuntimeScanner",
    status: "completed",
    startedAt: "2026-08-08T20:00:00.000Z",
    timingBreakdown: [{ label: "legacy timing", durationMs: 10 }],
    evidenceRefs: [],
    errors: [],
  });

  assert.equal(parsed.timingBreakdown?.[0]?.outcome, undefined);
});
