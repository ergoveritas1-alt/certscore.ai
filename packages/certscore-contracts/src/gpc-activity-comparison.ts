import { z } from "zod";

const count = z.number().int().nonnegative().max(5000);
const activity = z.object({
  baselineRequests: count, gpcRequests: count,
  baselineServices: count, gpcServices: count,
}).strict();

/** Approved measured facts only. Independent of response eligibility and scoring. */
export const gpcActivityComparisonSchema = z.object({
  contractVersion: z.literal("certscore.gpc-activity-comparison.v1"),
  scanId: z.string().min(1).max(200),
  status: z.literal("measured"),
  scope: z.literal("matched_post_commit_request_window"),
  durationMs: z.union([z.literal(250), z.literal(500), z.literal(1000)]),
  sourceHashes: z.object({ baseline: z.string().regex(/^[a-f0-9]{64}$/), gpc: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  activity: z.object({ advertisingMarketing: activity, analyticsReplay: activity }).strict(),
  scoreEffect: z.literal("none"),
  causedByGpc: z.literal("not_established"),
}).strict();
export type GpcActivityComparison = z.infer<typeof gpcActivityComparisonSchema>;

export function describeGpcActivityComparison(value: GpcActivityComparison): string {
  const a = value.activity.advertisingMarketing, b = value.activity.analyticsReplay;
  return `Baseline -> GPC, first ${value.durationMs} ms: advertising/marketing requests ${a.baselineRequests} -> ${a.gpcRequests}; analytics/replay requests ${b.baselineRequests} -> ${b.gpcRequests}.`;
}
