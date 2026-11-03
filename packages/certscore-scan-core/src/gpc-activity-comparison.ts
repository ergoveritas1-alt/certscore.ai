import { buildGpcCollectionComparison } from "./gpc-collection-comparison.js";
import { gpcActivityComparisonSchema, type GpcActivityComparison, type GpcBoundedObservation } from "@certscore/contracts";
import { buildGpcImpactAssessment, readVerifiedGpcImpactSource, type GpcImpactSource } from "./gpc-impact-assessment.js";

/** Reuse verified original bytes at the existing barrier; no reads or browser work. */
export function buildGpcActivityComparison(input: {
  scanId: string; baseline?: GpcImpactSource; gpc?: GpcImpactSource; observation?: GpcBoundedObservation;
}): GpcActivityComparison | undefined {
  const baseline = readVerifiedGpcImpactSource(input.baseline), gpc = readVerifiedGpcImpactSource(input.gpc);
  const pageHttpOnly = [baseline, gpc].every(bundle =>
    ["page_http_signal.v1", "page_http_signal.v2"].includes(bundle?.gpcImpactCapture?.comparisonPolicy ?? ""));
  const result = buildGpcImpactAssessment({ ...input, pageHttpOnly });
  if (result.status !== "measured" || !result.activity || !baseline || !gpc) return undefined;
  const project = (activity: NonNullable<typeof result.activity>["advertisingMarketing"]) => ({
    baselineRequests: activity.baselineRequests, gpcRequests: activity.gpcRequests,
    baselineServices: activity.baselineCount, gpcServices: activity.gpcCount,
  });
  const parsed = gpcActivityComparisonSchema.safeParse({
    contractVersion: "certscore.gpc-activity-comparison.v1", ...(pageHttpOnly ? { evidencePolicy: gpc.gpcImpactCapture?.comparisonPolicy } : {}), scanId: result.scanId,
    status: "measured", scope: "matched_post_commit_request_window", durationMs: result.durationMs,
    sourceHashes: result.sourceHashes,
    activity: { advertisingMarketing: project(result.activity.advertisingMarketing), analyticsReplay: project(result.activity.analyticsReplay) },
    scoreEffect: "none", causedByGpc: "not_established",
  });
  if (!parsed.success) return undefined;
  const collectionComparison = buildGpcCollectionComparison(input, result.durationMs!, { baseline, gpc });
  const enriched = collectionComparison && gpcActivityComparisonSchema.safeParse({ ...parsed.data, collectionComparison });
  // Optional samples cannot invalidate an independently measured request pair.
  return enriched && enriched.success ? enriched.data : parsed.data;
}
