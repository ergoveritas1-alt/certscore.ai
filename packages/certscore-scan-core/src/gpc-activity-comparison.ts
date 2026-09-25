import { gpcActivityComparisonSchema, type GpcActivityComparison } from "@certscore/contracts";
import { buildGpcImpactAssessment, type GpcImpactSource } from "./gpc-impact-assessment.js";

/** Reuse verified original bytes at the existing barrier; no reads or browser work. */
export function buildGpcActivityComparison(input: {
  scanId: string; baseline?: GpcImpactSource; gpc?: GpcImpactSource;
}): GpcActivityComparison | undefined {
  const result = buildGpcImpactAssessment(input);
  if (result.status !== "measured" || !result.activity) return undefined;
  const project = (activity: NonNullable<typeof result.activity>["advertisingMarketing"]) => ({
    baselineRequests: activity.baselineRequests, gpcRequests: activity.gpcRequests,
    baselineServices: activity.baselineCount, gpcServices: activity.gpcCount,
  });
  const parsed = gpcActivityComparisonSchema.safeParse({
    contractVersion: "certscore.gpc-activity-comparison.v1", scanId: result.scanId,
    status: "measured", scope: "matched_post_commit_request_window", durationMs: result.durationMs,
    sourceHashes: result.sourceHashes,
    activity: { advertisingMarketing: project(result.activity.advertisingMarketing), analyticsReplay: project(result.activity.analyticsReplay) },
    scoreEffect: "none", causedByGpc: "not_established",
  });
  return parsed.success ? parsed.data : undefined;
}
