import { z } from "zod";
import { consentActionControlProofSchema, postRefusalReportProjectionSchema } from "@certscore/contracts";

export const REJECT_CLICK_TRACKING_POLICY = "reject_click_tracking.v1" as const;
export const REJECT_CLICK_TRACKING_FINDING = "post_reject_click_tracking" as const;
export const REJECT_CLICK_TRACKING_SIGNAL = `privacy.${REJECT_CLICK_TRACKING_FINDING}` as const;

/** WC01 policy over retained observations. This does not verify refusal registration. */
const trackingRequestSchema = z.object({
  requestId: z.string().min(1).max(120),
  url: z.string().url().max(500),
  vendor: z.string().max(160).optional(),
  category: z.enum(["analytics", "advertising", "session_replay"]),
  nonEssential: z.literal(true),
  startedAtMs: z.number().int().nonnegative(),
  rootStartedAtMs: z.number().int().nonnegative(),
}).strict();

export const rejectClickTrackingAssessmentSchema = z.object({
  policyVersion: z.literal(REJECT_CLICK_TRACKING_POLICY),
  sourcePacketSha256: z.string().regex(/^[a-f0-9]{64}$/),
  controlProof: consentActionControlProofSchema,
  activationStatus: z.literal("completed"),
  registrationStatus: z.literal("unconfirmed"),
  capturePolicyVersion: z.literal("bounded_after_action_capture.v2"),
  captureStopReason: z.literal("window_elapsed"),
  requestsDropped: z.literal(0),
  actionDispatchedAtMs: z.number().int().nonnegative(),
  captureEndedAtMs: z.number().int().nonnegative(),
  requestedWindowMs: z.number().int().min(1).max(30_000),
  eligibleRequestCount: z.number().int().min(1).max(96),
  // Bounded assessment references; all request evidence stays in the source projection.
  requests: z.array(trackingRequestSchema).min(1).max(8),
}).strict().superRefine((assessment, context) => {
  if (assessment.controlProof.action !== "reject" || !assessment.controlProof.authorizedTargetSha256 ||
    !assessment.controlProof.frameIdentitySha256 ||
    assessment.controlProof.observedAtMs > assessment.actionDispatchedAtMs ||
    assessment.captureEndedAtMs < assessment.actionDispatchedAtMs + assessment.requestedWindowMs ||
    assessment.eligibleRequestCount < assessment.requests.length ||
    new Set(assessment.requests.map((row) => row.requestId)).size !== assessment.requests.length ||
    assessment.requests.some((row) => row.rootStartedAtMs <= assessment.actionDispatchedAtMs ||
      row.rootStartedAtMs > row.startedAtMs || row.startedAtMs > assessment.captureEndedAtMs)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Reject-click tracking requires an authorized completed action and direct, bounded after-click tracking evidence." });
  }
});

export type RejectClickTrackingAssessment = z.infer<typeof rejectClickTrackingAssessmentSchema>;

export function readRejectClickTrackingAssessment(value: unknown): RejectClickTrackingAssessment | null {
  const parsed = rejectClickTrackingAssessmentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Called only while materializing the verified packet's canonical runtime projection. */
export function assessRejectClickTracking(value: unknown): RejectClickTrackingAssessment | null {
  const parsed = postRefusalReportProjectionSchema.safeParse(value);
  if (!parsed.success) return null;
  const projection = parsed.data;
  const capture = projection.afterActionCapture;
  if (projection.productionProjectable || projection.refusalExercised || projection.status !== "unconfirmed" ||
    projection.registrationStatus !== "unconfirmed" || !projection.packetSha256 ||
    !projection.decisionEvidence || projection.captureCoverage?.requestsDroppedAfterAction !== 0 ||
    !capture || capture.policyVersion !== "bounded_after_action_capture.v2" || capture.action !== "reject" ||
    capture.activationStatus !== "completed" || capture.stopReason !== "window_elapsed" || capture.requestsDropped !== 0) return null;
  const requests = (projection.afterActionRequests ?? []).flatMap((row) => {
    const ancestor = capture.requestAncestry?.find((entry) => entry.requestId === row.requestId);
    const request = trackingRequestSchema.safeParse({
      requestId: row.requestId, url: row.sanitizedUrl, vendor: row.vendor, category: row.purpose,
      nonEssential: row.nonEssential, startedAtMs: row.startedAtMs, rootStartedAtMs: ancestor?.rootStartedAtMs,
    });
    return request.success && request.data.rootStartedAtMs > capture.actionDispatchedAtMs ? [request.data] : [];
  });
  return readRejectClickTrackingAssessment({
    policyVersion: REJECT_CLICK_TRACKING_POLICY, sourcePacketSha256: projection.packetSha256,
    controlProof: projection.actionControlProof, activationStatus: capture.activationStatus,
    registrationStatus: projection.registrationStatus, capturePolicyVersion: capture.policyVersion,
    captureStopReason: capture.stopReason, requestsDropped: capture.requestsDropped,
    actionDispatchedAtMs: capture.actionDispatchedAtMs, captureEndedAtMs: capture.captureEndedAtMs,
    requestedWindowMs: capture.requestedWindowMs, eligibleRequestCount: requests.length,
    requests: requests.sort((a, b) => a.startedAtMs - b.startedAtMs || a.requestId.localeCompare(b.requestId)).slice(0, 8),
  });
}
