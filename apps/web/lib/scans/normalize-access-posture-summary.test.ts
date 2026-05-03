import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAccessPostureSummary } from "./normalize-access-posture-summary";

test("normalizes malformed recoverable finding classes to an empty list", () => {
  const summary = normalizeAccessPostureSummary({
    accessPostureClass: "robots_limited",
    highestSuccessfulTier: null,
    homepageFetchHttpStatus: 200,
    homepageFetchStatus: null,
    pagesScanned: 1,
    recoverableFindingClasses: { malformed: true },
    stopTier: "tier1_front_door",
    totalSignals: 0
  });

  assert.deepEqual(summary.recoverableFindingClasses, []);
});

test("keeps string recoverable finding classes and drops malformed entries", () => {
  const summary = normalizeAccessPostureSummary({
    accessPostureClass: "robots_limited",
    highestSuccessfulTier: "tier2_browser_surface",
    homepageFetchHttpStatus: 200,
    homepageFetchStatus: null,
    pagesScanned: 2,
    recoverableFindingClasses: ["privacy_surface", 123, null, "cmp_presence"],
    stopTier: "tier3_runtime_observation",
    totalSignals: 8
  });

  assert.deepEqual(summary.recoverableFindingClasses, ["privacy_surface", "cmp_presence"]);
});
