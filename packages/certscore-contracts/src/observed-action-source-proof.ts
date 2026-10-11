import { z } from "zod";
import type { ActionMainDocumentWriteCoverage } from "./after-action-capture";

export const OBSERVED_ACTION_EXCLUDED_CHANNELS = ["workers", "subframes", "response_set_cookie", "cookie_store", "storage_named_properties", "storage_define_property", "other_browser_channels"] as const;
const count = z.number().int().nonnegative();
/** Prospective diagnostic proof only; never browser-wide completeness or finding eligibility. */
export type ObservedActionSourceProof = {
  policyVersion: "bounded_observed_action_sources.v1";
  scope: "primary_page_request_listener_and_main_document_setter_hooks";
  excludedChannels: Array<typeof OBSERVED_ACTION_EXCLUDED_CHANNELS[number]>;
  authorization: { kind: "loopback" | "owned_canary" | "explicit_allowlist" | "scan_target" | "scan_target_resolution";
    authorizationId: string; scanId: string; requestedTargetSha256: string; authorizedBeforeAction: true };
  scanClockOriginAtMs: number; targetUrlSha256: string; documentTimeOriginMs: number | null; hookInstalledAtMs: number | null;
  actionDocumentStable: boolean; requestListenerInstalledBeforeAction: boolean;
  requestWindowStartedAtMs: number; windowStartedAtMs: number; windowEndedAtMs: number;
  configuredWindowCompleted: boolean; semanticDecisionConfirmed: boolean;
  requests: { handlerReceivedCount: number; retainedCount: number; droppedCount: number; pendingCount: number; pendingClassificationCount: 0;
    unresolvedIdentityCount: number; unresolvedClassificationCount: number; projectionOmittedCount: number;
    retainedRequestIds: string[] };
};
export const observedActionSourceProofSchema: z.ZodType<ObservedActionSourceProof> = z.object({
  policyVersion: z.literal("bounded_observed_action_sources.v1"),
  scope: z.literal("primary_page_request_listener_and_main_document_setter_hooks"),
  excludedChannels: z.array(z.enum(OBSERVED_ACTION_EXCLUDED_CHANNELS)).length(OBSERVED_ACTION_EXCLUDED_CHANNELS.length)
    .refine(v => new Set(v).size === OBSERVED_ACTION_EXCLUDED_CHANNELS.length),
  authorization: z.object({ kind: z.enum(["loopback", "owned_canary", "explicit_allowlist", "scan_target", "scan_target_resolution"]),
    authorizationId: z.string().min(1).max(160), scanId: z.string().min(1).max(160),
    requestedTargetSha256: z.string().regex(/^[a-f0-9]{64}$/), authorizedBeforeAction: z.literal(true) }).strict(),
  scanClockOriginAtMs: z.number().nonnegative(),
  targetUrlSha256: z.string().regex(/^[a-f0-9]{64}$/),
  documentTimeOriginMs: z.number().nonnegative().nullable(),
  hookInstalledAtMs: z.number().nonnegative().nullable(),
  actionDocumentStable: z.boolean(),
  requestListenerInstalledBeforeAction: z.boolean(),
  requestWindowStartedAtMs: z.number().nonnegative(),
  windowStartedAtMs: z.number().nonnegative(), windowEndedAtMs: z.number().nonnegative(),
  configuredWindowCompleted: z.boolean(), semanticDecisionConfirmed: z.boolean(),
  requests: z.object({ handlerReceivedCount: count, retainedCount: count, droppedCount: count,
    pendingCount: count, pendingClassificationCount: z.literal(0), unresolvedIdentityCount: count, unresolvedClassificationCount: count,
    projectionOmittedCount: count, retainedRequestIds: z.array(z.string().min(1).max(120)).max(192) }).strict(),
}).strict().superRefine((v, ctx) => {
  if (v.requestWindowStartedAtMs > v.windowStartedAtMs || v.windowStartedAtMs > v.windowEndedAtMs ||
    v.requests.retainedRequestIds.length !== v.requests.retainedCount || new Set(v.requests.retainedRequestIds).size !== v.requests.retainedCount ||
    v.requests.handlerReceivedCount !== v.requests.retainedCount + v.requests.droppedCount ||
    [v.requests.pendingCount, v.requests.unresolvedIdentityCount, v.requests.unresolvedClassificationCount,
      v.requests.projectionOmittedCount].some(n => n > v.requests.retainedCount)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Scoped source proof must preserve its clocks and exact handler accounting." });
  }
});

type BoundSource = {
  observedActionSourceProof?: ObservedActionSourceProof;
  storage: { mainDocumentWriteCoverage?: ActionMainDocumentWriteCoverage };
};
/** Only for calibration after original typed packet validation and checksum verification. */
export function hasCompleteObservedActionSources(packet: BoundSource): boolean {
  const p = packet.observedActionSourceProof, w = packet.storage.mainDocumentWriteCoverage;
  if (!p || !w || !observedActionSourceProofSchema.safeParse(p).success) return false;
  return p.requestListenerInstalledBeforeAction && p.actionDocumentStable && p.configuredWindowCompleted &&
    p.semanticDecisionConfirmed && p.documentTimeOriginMs !== null && p.hookInstalledAtMs !== null &&
    p.hookInstalledAtMs >= p.documentTimeOriginMs && p.hookInstalledAtMs <= p.requestWindowStartedAtMs &&
    w.status === "complete_within_scope" && w.targetUrlSha256 === p.targetUrlSha256 &&
    w.documentTimeOriginMs === p.documentTimeOriginMs && w.windowStartedAtMs === p.windowStartedAtMs &&
    w.windowEndedAtMs === p.windowEndedAtMs && p.requests.droppedCount === 0 && p.requests.pendingCount === 0 && p.requests.pendingClassificationCount === 0 &&
    p.requests.unresolvedIdentityCount === 0 && p.requests.unresolvedClassificationCount === 0 &&
    p.requests.projectionOmittedCount === 0;
}

export function validateObservedActionSourceProof(p: ObservedActionSourceProof | undefined, ctx: z.RefinementCtx, source: {
  scanId: string; navigationAuthorized: boolean; targetSha256?: string; dispatchedAtMs?: number; registeredAtMs?: number; endedAtMs?: number; scanStartedAtMs: number;
  configuredWindowMs: number; exitReason?: string; confirmed: boolean; decisionConfirmed: boolean; clickCompleted: boolean;
  writeCoverage?: ActionMainDocumentWriteCoverage;
  retention?: { requestsObserved: number; requestsRetained: number };
  requests: Array<{ requestId: string; startedAtMs: number; completedAtMs?: number; hostname?: string; purpose?: string }>;
}) {
  if (!p) return; // Historical bytes never acquire prospective proof on read.
  const w = source.writeCoverage;
  const rows = source.requests.filter(r => p.requests.retainedRequestIds.includes(r.requestId));
  if (p.authorization.scanId !== source.scanId || !source.navigationAuthorized || p.scanClockOriginAtMs > source.scanStartedAtMs || p.requestWindowStartedAtMs < source.scanStartedAtMs || !w || !source.retention || p.targetUrlSha256 !== source.targetSha256 ||
    p.documentTimeOriginMs !== w.documentTimeOriginMs || p.windowStartedAtMs !== w.windowStartedAtMs ||
    p.windowEndedAtMs !== w.windowEndedAtMs || source.dispatchedAtMs === undefined || source.registeredAtMs === undefined ||
    source.endedAtMs === undefined || Math.abs(p.requestWindowStartedAtMs - p.scanClockOriginAtMs - source.dispatchedAtMs) > 1 ||
    Math.abs(p.windowStartedAtMs - p.scanClockOriginAtMs - source.registeredAtMs) > 1 ||
    Math.abs(p.windowEndedAtMs - p.scanClockOriginAtMs - source.endedAtMs) > 1 ||
    p.requests.handlerReceivedCount !== source.retention.requestsObserved ||
    p.requests.retainedCount !== source.retention.requestsRetained ||
    p.requests.projectionOmittedCount !== Math.max(0, p.requests.retainedCount - rows.length) ||
    p.requests.pendingCount < rows.filter(r => r.completedAtMs === undefined || r.completedAtMs > source.endedAtMs!).length ||
    p.requests.unresolvedIdentityCount !== rows.filter(r => !r.hostname).length ||
    p.requests.unresolvedClassificationCount !== rows.filter(r => (!r.purpose || r.purpose === "unknown")).length ||
    (p.semanticDecisionConfirmed && (!source.confirmed || !source.decisionConfirmed || !source.clickCompleted)) ||
    (p.configuredWindowCompleted && (!w.windowCompleted || source.exitReason !== "window_elapsed" ||
      p.windowEndedAtMs - p.windowStartedAtMs < source.configuredWindowMs))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["observedActionSourceProof"],
      message: "Prospective scoped source proof must match the original confirmed action, packet inventory and configured window." });
  }
}
