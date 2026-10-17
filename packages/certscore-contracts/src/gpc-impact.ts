import { z } from "zod";

const time = z.number().int().nonnegative();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const GPC_IMPACT_HORIZONS_MS = [250, 500, 1000] as const;

/** Producer evidence about complete fixed intervals. It does not assert that GPC
 * caused a change and does not replace the historical quiet-window assessment. */
export const gpcImpactCaptureSchema = z.object({
  contractVersion: z.literal("certscore.gpc-impact-capture.v1"),
  scope: z.literal("page_http_request_attempts_after_document_commit"),
  expectedEnabled: z.boolean(),
  captureStartedAtMs: time, capturedAtMs: time,
  readbackDocumentToken: z.string().min(1).max(160).nullable(),
  document: z.object({ token: z.string().min(1).max(160), urlSha256: hash,
    committedAtMs: time, secGpc: z.string().max(8).nullable() }).strict().nullable(),
  requestsDropped: time,
  // Optional on historical records. New producers freeze this metadata at the
  // same signal readback; it adds no wait and cannot repair a changed document.
  quietCheckpoint: z.object({
    contractVersion: z.literal("certscore.gpc-comparison-quiet.v1"),
    documentToken: z.string().min(1).max(160), signalReadbackAtMs: time,
    quietForMs: time, inFlightRequestCount: time,
  }).strict().optional(),
  retentionStatus: z.enum(["incomplete"]).optional(),
  invalidationReasons: z.array(z.enum(["document_requested_after_commit", "document_recommitted", "commit_binding_mismatch", "same_document_url_changed", "same_document_identity_unverified", "renderer_crash", "unspecified"])).max(7).optional(),
  windows: z.array(z.object({ durationMs: z.union([z.literal(250), z.literal(500), z.literal(1000)]),
    requestCount: time, requestSetSha256: hash }).strict()).max(3),
  limitationKeys: z.array(z.string().min(1).max(160)).max(16),
}).strict().superRefine((c, ctx) => {
  if (c.quietCheckpoint && (!c.document || c.readbackDocumentToken !== c.document.token ||
      c.quietCheckpoint.documentToken !== c.document.token ||
      c.quietCheckpoint.signalReadbackAtMs < c.document.committedAtMs ||
      c.quietCheckpoint.signalReadbackAtMs > c.capturedAtMs ||
      c.quietCheckpoint.quietForMs > c.quietCheckpoint.signalReadbackAtMs - c.document.committedAtMs)) {
    ctx.addIssue({code: "custom", message: "Quiet checkpoint requires this capture's document-bound readback."});
  }
  if (c.capturedAtMs < c.captureStartedAtMs ||
      (c.document && (c.document.committedAtMs < c.captureStartedAtMs || c.document.committedAtMs > c.capturedAtMs)) ||
      new Set(c.windows.map(w => w.durationMs)).size !== c.windows.length ||
      c.windows.some((w, i) => !c.document || c.capturedAtMs < c.document.committedAtMs + w.durationMs ||
        (i > 0 && (w.durationMs <= c.windows[i - 1]!.durationMs || w.requestCount < c.windows[i - 1]!.requestCount))) ||
      (c.windows.length > 0 && (c.requestsDropped > 0 || c.limitationKeys.length > 0 || (c.invalidationReasons?.length ?? 0) > 0))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Impact intervals require bounded, complete, document-bound request sets." });
  }
});
export type GpcImpactCapture = z.infer<typeof gpcImpactCaptureSchema>;

const activity = z.object({
  baselineCount: time, gpcCount: time, removedCount: time, newCount: time, sharedCount: time,
  netChange: z.number().int(), relativeReduction: z.number().finite().nullable(),
  outcome: z.enum(["lower", "unchanged", "higher", "no_activity_observed", "new_activity_observed"]),
  baselineRequests: time, gpcRequests: time, baselineCollectionRequests: time, gpcCollectionRequests: time,
}).strict().superRefine((v, ctx) => {
  const expectedOutcome = v.baselineCount === 0 ? (v.gpcCount === 0 ? "no_activity_observed" : "new_activity_observed") :
    v.gpcCount < v.baselineCount ? "lower" : v.gpcCount > v.baselineCount ? "higher" : "unchanged";
  if (v.sharedCount + v.removedCount !== v.baselineCount || v.sharedCount + v.newCount !== v.gpcCount ||
    v.netChange !== v.gpcCount - v.baselineCount || v.outcome !== expectedOutcome ||
    v.relativeReduction !== (v.baselineCount ? (v.baselineCount - v.gpcCount) / v.baselineCount : null) ||
    v.baselineCollectionRequests > v.baselineRequests || v.gpcCollectionRequests > v.gpcRequests) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Impact counts and direction must reconcile." });
  }
});
export const gpcImpactAssessmentSchema = z.object({
  contractVersion: z.literal("certscore.gpc-impact-assessment.v1"),
  mode: z.literal("internal_only"), productionProjectable: z.literal(false),
  scoreEffect: z.literal("none"), causedByGpc: z.literal("not_established"),
  scanId: z.string().min(1).max(200), status: z.enum(["measured", "insufficient_evidence"]),
  delivery: z.object({ baselineVerified: z.boolean(), gpcVerified: z.boolean() }).strict(),
  cmpRecordedState: z.object({
    received: z.enum(["received", "not_received", "unknown"]),
    sale: z.enum(["opted_out", "not_opted_out", "unknown"]),
    sharing: z.enum(["opted_out", "not_opted_out", "unknown"]),
    basis: z.literal("current_gpc_session_state"), baselineState: z.enum(["not_captured", "captured", "unverified"]),
  }).strict(),
  cmpComparison: z.object({
    basis: z.literal("paired_current_recorded_states"),
    comparable: z.boolean(),
    baseline: z.object({ sale: z.enum(["opted_out", "not_opted_out", "unknown"]), sharing: z.enum(["opted_out", "not_opted_out", "unknown"]), received: z.enum(["received", "not_received", "unknown"]) }).strict(),
    saleChange: z.enum(["opt_out_appeared", "opt_out_disappeared", "unchanged", "unknown"]),
    sharingChange: z.enum(["opt_out_appeared", "opt_out_disappeared", "unchanged", "unknown"]),
    limitationKeys: z.array(z.string().min(1).max(160)).max(16),
  }).strict().optional(),
  durationMs: z.union([z.literal(250), z.literal(500), z.literal(1000)]).nullable(),
  sourceHashes: z.object({ baseline: hash.nullable(), gpc: hash.nullable() }).strict(),
  requestAttempts: z.object({ baseline: time, gpc: time }).strict().nullable(),
  activity: z.object({ advertisingMarketing: activity, analyticsReplay: activity, trackers: activity }).strict().nullable(),
  limitationKeys: z.array(z.string().min(1).max(160)).max(32),
}).strict().superRefine((a, ctx) => {
  if ((a.status === "measured") !== (a.durationMs !== null && a.activity !== null && a.requestAttempts !== null &&
    a.sourceHashes.baseline !== null && a.sourceHashes.gpc !== null && a.delivery.baselineVerified && a.delivery.gpcVerified && a.limitationKeys.length === 0) ||
    (a.status === "insufficient_evidence" && (a.durationMs !== null || a.activity !== null || a.requestAttempts !== null || !a.limitationKeys.length))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Measured impact requires two verified captures and a common interval." });
  }
});
export type GpcImpactAssessment = z.infer<typeof gpcImpactAssessmentSchema>;
