import { z } from "zod";
import { gpcOptOutObservationSchema } from "./gpc-opt-out-prototype";
const time = z.number().int().nonnegative();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const gpcObservationSessionSchema = z.object({
  contractVersion: z.literal("certscore.gpc-observation-session.v1"),
  scanId: z.string().min(1).max(200), captureId: z.string().uuid(),
  observationScope: z.literal("main_document_and_retained_http_requests"),
  captureStartedAtMs: time, captureEndedAtMs: time,
  terminal: z.enum(["completed", "aborted", "incomplete"]),
  mainDocument: z.object({
    documentToken: z.string().min(1).max(160), documentUrlSha256: hash, requestUrlSha256: hash,
    requestId: z.string().min(1).max(160), requestAtMs: time,
    secGpc: z.string().max(8).nullable(), committedAtMs: time,
  }).strict().nullable(),
  semanticObservation: gpcOptOutObservationSchema.nullable(),
  requests: z.array(z.object({ eventId: z.string().min(1).max(160), timestampMs: time,
    urlSha256: hash, secGpc: z.string().max(8).nullable(),
    headerSource: z.enum(["request_snapshot", "all_headers_readback", "readback_pending", "readback_failed"]).optional(),
    headerReadbackAtMs: time.optional() }).strict()).max(5000),
  requestsObserved: time, requestsDropped: time,
  listener: z.object({ callbacks: time, dropped: time, registered: z.boolean() }).strict(),
  limitationKeys: z.array(z.string().min(1).max(160)).max(32),
}).strict().superRefine((p, ctx) => {
  if ((p.terminal === "completed" && p.limitationKeys.length > 0) ||
    p.captureEndedAtMs < p.captureStartedAtMs || p.requestsObserved !== p.requests.length + p.requestsDropped ||
    new Set(p.requests.map(r => r.eventId)).size !== p.requests.length ||
    p.requests.some(r => r.timestampMs < p.captureStartedAtMs || r.timestampMs > p.captureEndedAtMs || (r.headerReadbackAtMs !== undefined && (r.headerReadbackAtMs < r.timestampMs || r.headerReadbackAtMs > p.captureEndedAtMs))) ||
    (p.mainDocument && (p.mainDocument.requestAtMs > p.mainDocument.committedAtMs || p.mainDocument.committedAtMs > p.captureEndedAtMs))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "GPC session coverage requires consistent retained identities and intervals." });
  }
});
export const retainedGpcObservationSessionSchema = z.object({
  contractVersion: z.literal("certscore.retained-gpc-observation-session.v1"),
  gpcArtifactSha256: hash, session: gpcObservationSessionSchema,
}).strict();
export type GpcObservationSession = z.infer<typeof gpcObservationSessionSchema>;

/** Producer-owned binding independent of the legacy all-frame snapshot. */
export const gpcPrototypeSessionBindingSchema = z.object({
  contractVersion: z.literal("certscore.gpc-prototype-session-binding.v1"),
  captureId: z.string().uuid(), sessionSha256: hash,
  documentToken: z.string().min(1).max(160).nullable(), documentUrlSha256: hash.nullable(),
}).strict();
