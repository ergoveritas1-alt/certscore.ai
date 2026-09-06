import { z } from "zod";

/** Factual capture after a control action; never a claim of registered consent. */
export const afterActionCaptureSchema = z.object({
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
  requestIds: z.array(z.string().min(1).max(120)).max(96),
  // Earliest start in each redirect chain, including ancestors outside retention.
  requestAncestry: z.array(z.object({
    requestId: z.string().min(1).max(120),
    rootStartedAtMs: z.number().int().nonnegative(),
  }).strict()).max(96).optional(),
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
