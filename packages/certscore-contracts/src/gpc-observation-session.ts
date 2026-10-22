import { z } from "zod";
import { gpcRequestProofSchema } from "./california-reject-evidence";
import { saleSharingRequestQualificationSchema } from "./gpc-bounded-observation";
import { gpcOptOutObservationSchema } from "./gpc-opt-out-prototype";
const time = z.number().int().nonnegative();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const gpcRequestFailureCodeSchema = z.enum(["none", "unknown", "ERR_ABORTED", "ERR_BLOCKED_BY_CLIENT", "ERR_FAILED",
  "ERR_NAME_NOT_RESOLVED", "ERR_CONNECTION_REFUSED", "ERR_CONNECTION_CLOSED", "ERR_CONNECTION_RESET",
  "ERR_TIMED_OUT", "ERR_CERT_AUTHORITY_INVALID", "other_network_error"]);
export const gpcRequestBlockedReasonSchema = z.enum(["other", "csp", "mixed-content", "origin", "inspector", "subresource-filter",
  "content-type", "coep-frame-resource-needs-coep-header", "corp-not-same-origin", "corp-not-same-site", "unknown"]);
const cdpDiagnostic = z.object({ requestId: z.string().min(1).max(160), loaderId: z.string().max(160),
  isMainFrame: z.boolean(), resourceType: z.string().max(32),
  requestStartEpochMs: z.number().nonnegative(), timingBasis: z.enum(["request_event", "response_timing"]),
  requestHeader: z.string().max(8).nullable(),
  terminal: z.enum(["unknown", "response_received", "finished", "failed"]), canceled: z.boolean(),
  failureCode: gpcRequestFailureCodeSchema.optional(),
  blockedReason: gpcRequestBlockedReasonSchema.nullable().optional(),
  extraInfoCount: time, chainRequestCount: time,
  extraInfoHeader: z.string().max(8).nullable(),
  extraInfoStatus: z.enum(["single_request_single_extra_info", "unavailable", "ambiguous_redirect_or_extra_info"]),
}).strict();
export const gpcObservationSessionSchema = z.object({
  contractVersion: z.enum(["certscore.gpc-observation-session.v1", "certscore.gpc-observation-session.v2"]),
  scanId: z.string().min(1).max(200), captureId: z.string().uuid(),
  observationScope: z.literal("main_document_and_retained_http_requests"),
  captureStartedAtMs: time, captureEndedAtMs: time,
  terminal: z.enum(["completed", "aborted", "incomplete"]),
  finalization: z.object({
    contractVersion: z.literal("certscore.gpc-overlapped-finalization.v1"),
    readbackStartedAtMs: time.nullable(), readbackCompletedAtMs: time.nullable(),
    requestedGeneration: time.nullable(), terminalGeneration: time, documentUnchanged: z.boolean(),
    invalidationReasons: z.array(z.enum(["document_request", "document_commit", "same_document_url_changed", "same_document_identity_unverified", "renderer_crash", "page_closed"])).max(6).optional(),
  }).strict().optional(),
  mainDocument: z.object({
    documentToken: z.string().min(1).max(160), documentUrlSha256: hash, requestUrlSha256: hash,
    requestId: z.string().min(1).max(160), requestAtMs: time,
    secGpc: z.string().max(8).nullable(), committedAtMs: time,
  }).strict().nullable(),
  semanticObservation: gpcOptOutObservationSchema.nullable(),
  requests: z.array(z.object({ eventId: z.string().min(1).max(160), timestampMs: time,
    urlSha256: hash, secGpc: z.string().max(8).nullable(),
    headerSource: z.enum(["request_snapshot", "all_headers_readback", "readback_pending", "readback_failed"]).optional(),
    headerReadbackAtMs: time.optional(),
    preTransmissionBlock: z.object({ reason: z.enum(["csp", "mixed-content"]),
      source: z.literal("same_playwright_request_failure"), observedAtMs: time,
      documentToken: z.string().min(1).max(160), secGpcHeaderRetained: z.literal(false),
      responseReceived: z.literal(false), networkTimingAvailable: z.literal(false), serviceWorker: z.literal(false),
    }).strict().optional() }).strict()).max(5000),
  /** Supplemental discovery only. Missing proof never vetoes URL evidence. */
  requestProofCapture: z.object({
    contractVersion:z.literal("gpc_request_capture.v1"), inspected:time.max(48), skipped:time,
    pending:time.max(48), failed:time.max(48), retentionDropped:time.max(48),
    rows:z.array(z.object({eventId:z.string().min(1).max(160),documentToken:z.string().min(1).max(160),
      capturedAtMs:time,proof:gpcRequestProofSchema}).strict()).max(32),
    // Keep known same-request restrictions even if detailed proof loses a slot.
    restrictions:z.array(z.object({eventId:z.string().min(1).max(160),documentToken:z.string().min(1).max(160),
      urlSha256:hash,timestampMs:time,capturedAtMs:time,
      processingSignals:saleSharingRequestQualificationSchema.shape.processingSignals.min(1),
    }).strict()).max(48),
  }).strict().optional(),
  requestsObserved: time, requestsDropped: time,
  listener: z.object({ callbacks: time, dropped: time, registered: z.boolean() }).strict(),
  /** Correlation aids only. These never replace the request's original header proof. */
  requestDiagnostics: z.object({
    contractVersion: z.literal("certscore.gpc-request-diagnostics.v1"),
    observedCdpRequests: time, droppedCdpEvents: time, droppedDiagnostics: time,
    missingHeaders: z.array(z.object({
      eventId: z.string().min(1).max(160), urlSha256: hash,
      method: z.string().max(32), resourceType: z.string().max(32),
      isMainFrame: z.boolean().nullable(), serviceWorker: z.boolean().nullable(),
      requestStartEpochMs: z.number().nonnegative().nullable(),
      failure: z.enum(["none", "aborted", "network_error", "unknown"]),
      failureCode: gpcRequestFailureCodeSchema.optional(),
      candidateCount: time,
      correlation: z.enum(["unique_url_method_start_time", "ambiguous", "unmatched", "timing_unavailable"]),
      cdp: cdpDiagnostic.nullable(),
      urlMethodCandidateCount: time.optional(),
      /** Candidate details remain explicitly unbound when exact timing is absent. */
      unboundCandidates: z.array(cdpDiagnostic).max(3).optional(),
    }).strict()).max(256),
  }).strict().optional(),
  limitationKeys: z.array(z.string().min(1).max(160)).max(32),
}).strict().superRefine((p, ctx) => {
  const capture=p.requestProofCapture;
  if(capture){
    const bound=(eventId:string,url:string,at:number,captured:number)=>p.requests.some(r=>r.eventId===eventId&&r.urlSha256===url&&r.timestampMs===at)&&captured>=at&&captured<=p.captureEndedAtMs;
    if(p.contractVersion!=="certscore.gpc-observation-session.v2" ||
      capture.rows.length+capture.retentionDropped+capture.pending+capture.failed!==capture.inspected ||
      new Set(capture.rows.map(r=>r.eventId)).size!==capture.rows.length ||
      new Set(capture.restrictions.map(r=>r.eventId)).size!==capture.restrictions.length ||
      capture.restrictions.length>capture.inspected ||
      capture.rows.some(r=>!bound(r.eventId,r.proof.urlSha256,r.proof.startedAtMs,r.capturedAtMs)) ||
      capture.restrictions.some(r=>!bound(r.eventId,r.urlSha256,r.timestampMs,r.capturedAtMs)))
      ctx.addIssue({code:z.ZodIssueCode.custom,message:"GPC supplemental proof requires bounded same-request capture."});
  }
  const f = p.finalization;
  if (f && ((f.readbackStartedAtMs !== null && (f.readbackStartedAtMs < p.captureStartedAtMs || f.readbackStartedAtMs > p.captureEndedAtMs)) ||
    (f.readbackCompletedAtMs !== null && (f.readbackStartedAtMs === null || f.readbackCompletedAtMs < f.readbackStartedAtMs || f.readbackCompletedAtMs > p.captureEndedAtMs)) ||
    (f.documentUnchanged && (f.requestedGeneration !== f.terminalGeneration || f.readbackCompletedAtMs === null || (f.invalidationReasons?.length ?? 0) > 0)) ||
    (p.terminal === "completed" && !f.documentUnchanged))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Overlapping finalization must retain its timing and unchanged document generation." });
  }
  if ((p.terminal === "completed" && p.limitationKeys.length > 0) ||
    p.captureEndedAtMs < p.captureStartedAtMs || p.requestsObserved !== p.requests.length + p.requestsDropped ||
    new Set(p.requests.map(r => r.eventId)).size !== p.requests.length ||
    p.requests.some(r => r.timestampMs < p.captureStartedAtMs || r.timestampMs > p.captureEndedAtMs || (r.headerReadbackAtMs !== undefined && (r.headerReadbackAtMs < r.timestampMs || r.headerReadbackAtMs > p.captureEndedAtMs))) ||
    (p.mainDocument && (p.mainDocument.requestAtMs > p.mainDocument.committedAtMs || p.mainDocument.committedAtMs > p.captureEndedAtMs))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "GPC session coverage requires consistent retained identities and intervals." });
  }
  if (p.requests.some(r => r.preTransmissionBlock && (p.contractVersion !== "certscore.gpc-observation-session.v2" ||
    r.secGpc !== null || !p.mainDocument || r.preTransmissionBlock.documentToken !== p.mainDocument.documentToken || r.preTransmissionBlock.observedAtMs < r.timestampMs || r.preTransmissionBlock.observedAtMs > p.captureEndedAtMs)))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pre-transmission blocks require v2, unchanged missing header and same-request bounded readback." });
  if (p.requestDiagnostics?.missingHeaders.some(d => {
    const request = p.requests.find(r => r.eventId === d.eventId);
    return !request || request.urlSha256 !== d.urlSha256 || request.secGpc === "1" ||
      (d.correlation === "unique_url_method_start_time") !== (d.cdp !== null && d.candidateCount === 1) ||
      (d.cdp?.extraInfoStatus === "single_request_single_extra_info" && (d.cdp.chainRequestCount !== 1 || d.cdp.extraInfoCount !== 1));
  })) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Request diagnostics must retain an existing missing-header identity and honest correlation." });
});
export const retainedGpcObservationSessionSchema = z.object({
  contractVersion: z.literal("certscore.retained-gpc-observation-session.v1"),
  gpcArtifactSha256: hash, session: gpcObservationSessionSchema,
}).strict();
export interface GpcObservationSession extends z.infer<typeof gpcObservationSessionSchema> {}

/** Producer-owned binding independent of the legacy all-frame snapshot. */
export const gpcPrototypeSessionBindingSchema = z.object({
  contractVersion: z.literal("certscore.gpc-prototype-session-binding.v1"),
  captureId: z.string().uuid(), sessionSha256: hash,
  documentToken: z.string().min(1).max(160).nullable(), documentUrlSha256: hash.nullable(),
}).strict();
