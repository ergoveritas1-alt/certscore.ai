import type { GpcActivityComparison } from "../gpc-activity-comparison";

export function gpcActivityComparisonFixture(overrides: Partial<GpcActivityComparison> = {}): GpcActivityComparison {
  return {
    contractVersion: "certscore.gpc-activity-comparison.v1", scanId: "gpc-activity-fixture",
    status: "measured", scope: "matched_post_commit_request_window", durationMs: 1000,
    sourceHashes: { baseline: "a".repeat(64), gpc: "b".repeat(64) },
    activity: {
      advertisingMarketing: { baselineRequests: 2, gpcRequests: 1, baselineServices: 2, gpcServices: 1 },
      analyticsReplay: { baselineRequests: 1, gpcRequests: 1, baselineServices: 1, gpcServices: 1 },
    },
    scoreEffect: "none", causedByGpc: "not_established", ...overrides,
  };
}
