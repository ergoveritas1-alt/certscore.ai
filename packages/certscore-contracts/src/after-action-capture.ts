import { z } from "zod";
import { CONSENT_ACTION_POST_CLICK_REQUEST_LIMIT } from "./consent-action-evidence-policy";

export const afterActionWriteDiagnosticsSchema = z.object({
  policyVersion: z.literal("after_action_write_diagnostics.v1"),
  scope: z.literal("main_document_setter_hooks"), diagnosticOnly: z.literal(true),
  probeAvailable: z.boolean(), documentMatches: z.boolean(), cookieHookHealthy: z.boolean(), storageHookHealthy: z.boolean(),
  observedLifetimeCount: z.number().int().nonnegative().nullable(),
  ringEvictedCount: z.number().int().nonnegative().nullable(), readbackOmittedCount: z.number().int().nonnegative().nullable(),
  windowRecordsObserved: z.number().int().nonnegative(), windowRecordsRetained: z.number().int().nonnegative(),
  nonEssentialRecordsObserved: z.number().int().nonnegative(), nonEssentialRecordsRetained: z.number().int().nonnegative(),
  unclassifiedRecordsObserved: z.number().int().nonnegative(),
}).strict().superRefine((v, ctx) => {
  if (v.windowRecordsRetained > v.windowRecordsObserved || v.nonEssentialRecordsObserved > v.windowRecordsObserved ||
    v.nonEssentialRecordsRetained > v.nonEssentialRecordsObserved || v.nonEssentialRecordsRetained > v.windowRecordsRetained ||
    v.unclassifiedRecordsObserved > v.windowRecordsObserved ||
    (v.probeAvailable && (v.observedLifetimeCount === null || v.ringEvictedCount === null || v.readbackOmittedCount === null ||
      v.ringEvictedCount + v.readbackOmittedCount + v.windowRecordsObserved > v.observedLifetimeCount)) ||
    (!v.probeAvailable && (v.observedLifetimeCount !== null || v.ringEvictedCount !== null || v.readbackOmittedCount !== null ||
      v.documentMatches || v.cookieHookHealthy || v.storageHookHealthy)))
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"After-click write diagnostics must preserve bounded readback accounting."});
});
export type AfterActionWriteDiagnostics = z.infer<typeof afterActionWriteDiagnosticsSchema>;

/** Factual capture after a control action; never a claim of registered consent. */
export const afterActionCaptureSchema = z.object({
  writeDiagnostics: afterActionWriteDiagnosticsSchema.optional(),
  policyVersion: z.enum(["bounded_after_action_capture.v1", "bounded_after_action_capture.v2"]),
  action: z.enum(["accept", "reject"]),
  activationStatus: z.enum(["completed", "uncertain"]),
  actionDispatchedAtMs: z.number().int().nonnegative(),
  captureEndedAtMs: z.number().int().nonnegative(),
  requestedWindowMs: z.number().int().min(0).max(30_000),
  stopReason: z.enum(["window_elapsed", "aborted", "target_changed", "click_uncertain"]),
  requestsDropped: z.number().int().nonnegative(),
  storageSnapshotRetained: z.boolean(),
  storageWriteCoverage: z.literal("bounded_main_document_sample"),
  storageWrites: z.array(z.object({
    storageType: z.enum(["cookie", "local_storage", "session_storage"]),
    name: z.string().min(1).max(180),
    hostname: z.string().max(255).optional(),
    observedAtMs: z.number().int().nonnegative(),
    nonEssential: z.boolean(),
    vendor: z.string().max(160).optional(),
  }).strict()).max(48),
  requestIds: z.array(z.string().min(1).max(120)).max(CONSENT_ACTION_POST_CLICK_REQUEST_LIMIT),
  // Earliest start in each redirect chain, including ancestors outside retention.
  requestAncestry: z.array(z.object({
    requestId: z.string().min(1).max(120),
    rootStartedAtMs: z.number().int().nonnegative(),
  }).strict()).max(CONSENT_ACTION_POST_CLICK_REQUEST_LIMIT).optional(),
}).strict().superRefine((capture, context) => {
  if (capture.policyVersion === "bounded_after_action_capture.v2" && (
    !capture.requestAncestry || capture.requestAncestry.length !== capture.requestIds.length ||
    new Set(capture.requestAncestry.map((row) => row.requestId)).size !== capture.requestIds.length ||
    capture.requestAncestry.some((row) => !capture.requestIds.includes(row.requestId))
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "V2 after-action capture requires exact retained request ancestry." });
  }
  if (capture.captureEndedAtMs < capture.actionDispatchedAtMs ||
    (capture.stopReason === "window_elapsed" && (
      capture.activationStatus !== "completed" ||
      capture.captureEndedAtMs - capture.actionDispatchedAtMs < capture.requestedWindowMs
    )) || new Set(capture.requestIds).size !== capture.requestIds.length ||
    capture.storageWrites.some((write) => write.observedAtMs < capture.actionDispatchedAtMs || write.observedAtMs > capture.captureEndedAtMs)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "After-action capture requires consistent action timing, completion and unique retained request references." });
  }
  if (capture.writeDiagnostics && (capture.writeDiagnostics.windowRecordsRetained !== capture.storageWrites.length ||
    capture.writeDiagnostics.nonEssentialRecordsRetained !== capture.storageWrites.filter(row => row.nonEssential).length))
    context.addIssue({code:z.ZodIssueCode.custom,message:"Write diagnostics must count the exact retained after-click writes."});
});

export type AfterActionCapture = z.infer<typeof afterActionCaptureSchema>;

function validAncestry(capture: AfterActionCapture, requests: Array<{ requestId: string; startedAtMs: number }>) {
  return !capture.requestAncestry || capture.requestAncestry.every((ancestor) =>
    requests.some((row) => row.requestId === ancestor.requestId && ancestor.rootStartedAtMs <= row.startedAtMs));
}

export function validateAfterActionProjection(capture: AfterActionCapture | undefined, context: z.RefinementCtx, source: {
  action: "accept" | "reject";
  proof?: { action: string; observedAtMs: number };
  requests?: Array<{ requestId: string; startedAtMs: number }>;
  storage?: unknown[];
}) {
  if (!capture && source.requests === undefined && source.storage === undefined) return;
  if (!capture || !source.proof || source.proof.action !== source.action || capture.action !== source.action ||
    source.proof.observedAtMs > capture.actionDispatchedAtMs || !source.requests || !source.storage ||
    (!capture.storageSnapshotRetained && source.storage.length > 0) ||
    source.requests.length !== capture.requestIds.length || !validAncestry(capture, source.requests) ||
    new Set(source.requests.map((row) => row.requestId)).size !== source.requests.length ||
    source.requests.some((row) => !capture.requestIds.includes(row.requestId) ||
      row.startedAtMs < capture.actionDispatchedAtMs || row.startedAtMs > capture.captureEndedAtMs)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["afterActionCapture"], message: "After-action projection must preserve control, time and retained evidence references." });
  }
}

/** The packet, not the display, binds after-click facts to the retained control. */
export function validateAfterActionCapture(capture: AfterActionCapture | undefined, context: z.RefinementCtx, source: {
  action: "accept" | "reject";
  dispatchedAtMs?: number;
  proof?: { action: string; observedAtMs: number };
  clickOutcome?: string;
  navigationAuthorized?: boolean;
  requests: Array<{ requestId: string; startedAtMs: number }>;
  requestsDropped?: number;
  postActionCapturedAtMs?: number;
  requestedWindowMs: number;
  readyAtMs: number;
}) {
  if (!capture) return; // Legacy packets retain their original conclusions.
  if (capture.policyVersion === "bounded_after_action_capture.v2" && source.navigationAuthorized !== true) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["afterActionCapture"], message: "V2 capture requires a committed authorized action document." });
  }
  if (capture.action !== source.action || !source.proof || source.proof.action !== capture.action ||
    source.proof.observedAtMs > capture.actionDispatchedAtMs ||
    capture.actionDispatchedAtMs !== source.dispatchedAtMs ||
    capture.requestedWindowMs !== source.requestedWindowMs || capture.captureEndedAtMs > source.readyAtMs ||
    (capture.activationStatus === "completed" && source.clickOutcome !== "completed") ||
    capture.requestsDropped !== source.requestsDropped || !validAncestry(capture, source.requests) ||
    (capture.storageSnapshotRetained && (source.postActionCapturedAtMs === undefined ||
      source.postActionCapturedAtMs < capture.actionDispatchedAtMs || source.postActionCapturedAtMs > capture.captureEndedAtMs)) ||
    (capture.storageSnapshotRetained && capture.stopReason === "window_elapsed" &&
      source.postActionCapturedAtMs! < capture.actionDispatchedAtMs + capture.requestedWindowMs) ||
    capture.requestIds.some((id) => !source.requests.some((row) => row.requestId === id &&
      row.startedAtMs >= capture.actionDispatchedAtMs && row.startedAtMs <= capture.captureEndedAtMs))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["afterActionCapture"],
      message: "After-action capture must be bound to retained control, dispatch, request and snapshot evidence." });
  }
}

/** Completeness of retained records emitted by existing main-document setter hooks.
 * Terminal hook readback is not proof of continuous instrumentation, other APIs,
 * server cookies, child frames or workers; this field cannot establish a whole-finding negative.
 */
export type ActionMainDocumentWriteCoverage = {
  policyVersion: "action_main_document_write_coverage.v1"; scope: "main_document_setter_hooks";
  status: "complete_within_scope" | "limited"; targetUrlSha256: string; documentTimeOriginMs: number | null;
  windowStartedAtMs: number; windowEndedAtMs: number; probeAvailable: boolean; cookieHookHealthy: boolean;
  storageHookHealthy: boolean; documentMatches: boolean; windowCompleted: boolean;
  observedLifetimeCount: number; ringEvictedCount: number; readbackOmittedCount: number;
  retainedWindowCount: number; eligibleWindowCount: number; retainedEligibleCount: number;
  finalCapOmittedCount: number; deduplicatedEligibleCount: number; unresolvedWindowCount: number;
};
export const actionMainDocumentWriteCoverageSchema: z.ZodType<ActionMainDocumentWriteCoverage> = z.object({
  policyVersion: z.literal("action_main_document_write_coverage.v1"),
  scope: z.literal("main_document_setter_hooks"),
  status: z.enum(["complete_within_scope", "limited"]),
  targetUrlSha256: z.string().regex(/^[a-f0-9]{64}$/),
  documentTimeOriginMs: z.number().nonnegative().nullable(),
  // Epoch milliseconds: confirmed registration (exclusive) through observation end (inclusive).
  windowStartedAtMs: z.number().nonnegative(), windowEndedAtMs: z.number().nonnegative(),
  probeAvailable: z.boolean(), cookieHookHealthy: z.boolean(), storageHookHealthy: z.boolean(),
  documentMatches: z.boolean(), windowCompleted: z.boolean(),
  observedLifetimeCount: z.number().int().nonnegative(),
  ringEvictedCount: z.number().int().nonnegative(), readbackOmittedCount: z.number().int().nonnegative(),
  retainedWindowCount: z.number().int().nonnegative(), eligibleWindowCount: z.number().int().nonnegative(),
  retainedEligibleCount: z.number().int().nonnegative(), finalCapOmittedCount: z.number().int().nonnegative(),
  deduplicatedEligibleCount: z.number().int().nonnegative(),
  unresolvedWindowCount: z.number().int().nonnegative(),
}).strict().superRefine((v, ctx) => {
  const complete = v.probeAvailable && v.cookieHookHealthy && v.storageHookHealthy && v.documentMatches &&
    v.windowCompleted && v.ringEvictedCount === 0 && v.readbackOmittedCount === 0 &&
    v.finalCapOmittedCount === 0 && v.deduplicatedEligibleCount === 0 && v.unresolvedWindowCount === 0;
  if (v.windowEndedAtMs < v.windowStartedAtMs || v.eligibleWindowCount > v.retainedWindowCount ||
    v.retainedEligibleCount + v.finalCapOmittedCount + v.deduplicatedEligibleCount !== v.eligibleWindowCount ||
    (v.probeAvailable && v.retainedWindowCount + v.ringEvictedCount + v.readbackOmittedCount > v.observedLifetimeCount) ||
    v.ringEvictedCount + v.readbackOmittedCount > v.observedLifetimeCount ||
    v.unresolvedWindowCount > v.retainedWindowCount ||
    (v.status === "complete_within_scope" && (!complete || v.documentTimeOriginMs === null || v.documentTimeOriginMs > v.windowStartedAtMs))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Main-document write coverage requires bound, loss-free counters and healthy completed capture." });
  }
});
