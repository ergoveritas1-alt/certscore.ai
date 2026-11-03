import { z } from "zod";
import { gpcCollectionComparisonSchema, describeGpcCollectionComparison, type GpcCollectionComparison } from "./gpc-collection-comparison.js";
const collectionSchema: z.ZodType<GpcCollectionComparison> = gpcCollectionComparisonSchema;

const count = z.number().int().nonnegative().max(5000);
const activity = z.object({
  baselineRequests: count, gpcRequests: count,
  baselineServices: count, gpcServices: count,
}).strict();

/** Approved measured facts only. Independent of response eligibility and scoring. */
export const gpcActivityComparisonSchema = z.object({
  contractVersion: z.literal("certscore.gpc-activity-comparison.v1"),
  evidencePolicy: z.enum(["page_http_signal.v1", "page_http_signal.v2"]).optional(),
  scanId: z.string().min(1).max(200),
  status: z.literal("measured"),
  scope: z.literal("matched_post_commit_request_window"),
  durationMs: z.number().int().min(1).max(15000),
  sourceHashes: z.object({ baseline: z.string().regex(/^[a-f0-9]{64}$/), gpc: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  collectionComparison: collectionSchema.optional(),
  activity: z.object({ advertisingMarketing: activity, analyticsReplay: activity }).strict(),
  scoreEffect: z.literal("none"),
  causedByGpc: z.literal("not_established"),
}).strict().superRefine((p, ctx) => {
  const c = p.collectionComparison;
  if (c && (c.scanId !== p.scanId || c.durationMs !== p.durationMs ||
    c.sourceHashes.baseline !== p.sourceHashes.baseline || c.sourceHashes.gpc !== p.sourceHashes.gpc ||
    c.baseline.rows.length > p.activity.advertisingMarketing.baselineRequests || c.gpc.rows.length > p.activity.advertisingMarketing.gpcRequests))
    ctx.addIssue({code:"custom",message:"Collection comparison must bind to its parent source pair and window."});
});
export interface GpcActivityComparison extends z.infer<typeof gpcActivityComparisonSchema> {}

export function describeGpcActivityComparison(value: GpcActivityComparison): string {
  const a = value.activity.advertisingMarketing, b = value.activity.analyticsReplay;
  return `Baseline -> GPC${value.evidencePolicy ? " page HTTP requests" : ""}, first ${value.durationMs} ms after each document commit: advertising/marketing requests ${a.baselineRequests} -> ${a.gpcRequests}; analytics/replay requests ${b.baselineRequests} -> ${b.gpcRequests}.${value.collectionComparison ? ` ${describeGpcCollectionComparison(value.collectionComparison)}` : ""}`;
}
