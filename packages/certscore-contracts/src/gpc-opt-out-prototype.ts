import { z } from "zod";
import { gpcArtifactPointerSchema, gpcResponseAssessmentV2Schema, gpcPrototypeCaptureBindingSchema } from "./gpc-observation";

export const GPC_OPT_OUT_PROTOTYPE_VERSION = "certscore.gpc-opt-out-assessment.prototype.v1" as const;
export const GPC_OPT_OUT_ADAPTER_VERSION = "gpc_usca_and_live_status.v1" as const;
// Exact current-visitor status messages only, in visible live-status elements
// inside a registered CMP scope. Policy promises and receipt wording are excluded.
export const GPC_STATUS_MESSAGES = [
  "Opt-Out Request Honored",
  "Your Global Privacy Control signal is honored.",
  "Your opt-out preference signal has been honored.",
] as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.number().int().nonnegative();
const codes = z.array(z.string().min(1).max(160)).max(32);
export const gpcUscaStateSchema = z.object({
  apiVersion: z.literal("1.1"), sectionId: z.literal(8), sectionVersion: z.literal(1),
  cmpStatus: z.literal("loaded"), signalStatus: z.literal("ready"),
  saleNotice: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  sharingNotice: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  saleOptOut: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  sharingOptOut: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  gpc: z.boolean().nullable(),
}).strict();
export const gpcOptOutObservationSchema = z.object({
  contractVersion: z.literal("certscore.gpc-opt-out-observation.prototype.v1"),
  adapterVersion: z.literal(GPC_OPT_OUT_ADAPTER_VERSION),
  scanId: z.string().min(1).max(160), documentUrlSha256: hash,
  captureBinding: gpcPrototypeCaptureBindingSchema.nullable(),
  documentStartedAtMs: time, capturedAtMs: time, navigatorGpc: z.boolean().nullable(),
  gppStatus: z.enum(["observed", "unavailable", "not_ready", "unsupported", "invalid"]),
  usca: gpcUscaStateSchema.nullable(), stateSha256: hash.nullable(),
  acknowledgment: z.array(z.object({
    cmp: z.string().min(1).max(100), scopeSelector: z.string().min(1).max(200),
    message: z.enum(GPC_STATUS_MESSAGES), source: z.literal("visible_cmp_live_status"),
  }).strict()).max(8),
  limitationKeys: codes,
}).strict().superRefine((p, ctx) => {
  if (p.capturedAtMs < p.documentStartedAtMs ||
    (p.gppStatus === "observed") !== (p.usca !== null && p.stateSha256 !== null) ||
    (p.gppStatus !== "observed" && (p.usca !== null || p.stateSha256 !== null))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "GPC semantic observation must retain consistent state and timing." });
  }
});
export const retainedGpcOptOutObservationSchema = z.object({
  contractVersion: z.literal("certscore.retained-gpc-opt-out-observation.prototype.v1"),
  gpcArtifactSha256: hash,
  observation: gpcOptOutObservationSchema,
}).strict();
const facet = z.object({
  status: z.enum(["observed", "unknown"]), evidenceRefs: z.array(z.string().min(1).max(500)).max(100),
  limitationKeys: codes,
}).strict().superRefine((f, ctx) => {
  if (f.status === "observed" && !f.evidenceRefs.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Observed facets require retained evidence." });
});
export const gpcOptOutPrototypeSchema = z.object({
  contractVersion: z.literal(GPC_OPT_OUT_PROTOTYPE_VERSION),
  mode: z.literal("internal_only"), productionProjectable: z.literal(false),
  scoreEffect: z.literal("none"), legalInterpretation: z.literal("not_assessed"),
  scanId: z.string().min(1).max(160), generatedAt: z.string().datetime(),
  sources: z.array(z.union([
    gpcArtifactPointerSchema.extend({ kind: z.literal("runtime_bundle") }).strict(),
    gpcArtifactPointerSchema.omit({ lane: true }).extend({ kind: z.literal("semantic_readback"), gpcArtifactSha256: hash }).strict(),
  ])).max(3),
  documentUrlSha256: hash.nullable(),
  delivery: z.object({ http: facet, mainNavigator: facet, fullContext: facet }).strict(),
  registration: z.object({
    basis: z.literal("current_recorded_state"), causedByGpc: z.literal("not_established"),
    cmpGpcSignal: z.enum(["received", "not_received", "unknown"]),
    status: z.enum(["opt_out_recorded", "opt_out_not_recorded", "mixed_or_incomplete", "unknown"]),
    sale: z.enum(["opted_out", "not_opted_out", "unknown"]),
    sharing: z.enum(["opted_out", "not_opted_out", "unknown"]),
    observation: gpcOptOutObservationSchema.nullable(), evidenceRefs: z.array(z.string().max(500)).max(8),
    limitationKeys: codes,
  }).strict(),
  acknowledgment: facet,
  behavior: z.object({
    status: z.enum(["activity_observed", "no_qualified_activity_observed_in_capture", "unknown"]),
    captureComplete: z.boolean(), requestCount: time, collectionRequestCount: time,
    samplesTruncated: z.boolean(),
    requests: z.array(z.object({
      eventId: z.string().min(1).max(160), timestampMs: time,
      vendorObservationId: z.string().min(1).max(160), vendor: z.string().max(200),
      purpose: z.enum(["advertising", "marketing", "analytics", "session_replay"]),
      collectionEndpointObserved: z.boolean(),
    }).strict()).max(100),
    limitationKeys: codes,
  }).strict(),
  baselineComparison: gpcResponseAssessmentV2Schema.nullable(),
  substantiveEvidence: z.object({ registration: z.boolean(), collectionActivity: z.boolean() }).strict(),
  release: z.object({ eligible: z.literal(false), reasons: codes }).strict(),
}).strict().superRefine((a, ctx) => {
  const r = a.registration, b = a.behavior;
  const expected = r.sale === "opted_out" && r.sharing === "opted_out" ? "opt_out_recorded" :
    r.sale === "not_opted_out" && r.sharing === "not_opted_out" ? "opt_out_not_recorded" :
    r.observation ? "mixed_or_incomplete" : "unknown";
  const expectedSignal = r.observation?.usca?.gpc === true ? "received" : r.observation?.usca?.gpc === false ? "not_received" : "unknown";
  const axis = (notice?: number, value?: number) => notice === 1 && value === 1 ? "opted_out" : notice === 1 && value === 2 ? "not_opted_out" : "unknown";
  if (r.status !== expected || r.cmpGpcSignal !== expectedSignal || (r.observation && (!r.evidenceRefs.length || a.delivery.http.status !== "observed")) ||
    r.sale !== axis(r.observation?.usca?.saleNotice, r.observation?.usca?.saleOptOut) ||
    r.sharing !== axis(r.observation?.usca?.sharingNotice, r.observation?.usca?.sharingOptOut) ||
    (a.delivery.fullContext.status === "observed" && (a.delivery.http.status !== "observed" || a.delivery.mainNavigator.status !== "observed")) ||
    (b.captureComplete && a.delivery.fullContext.status !== "observed") ||
    b.collectionRequestCount > b.requestCount || b.requests.length !== Math.min(100, b.requestCount) ||
    b.samplesTruncated !== (b.requestCount > 100) ||
    new Set(b.requests.map(x => x.eventId)).size !== b.requests.length ||
    (b.status === "activity_observed") !== (b.requestCount > 0) ||
    (b.status === "no_qualified_activity_observed_in_capture" && !b.captureComplete) ||
    a.substantiveEvidence.registration !== (r.sale !== "unknown" && r.sharing !== "unknown") ||
    a.substantiveEvidence.collectionActivity !== (b.collectionRequestCount > 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "GPC prototype facets and completion counters must agree with retained evidence." });
  }
});
export type GpcOptOutObservation = z.infer<typeof gpcOptOutObservationSchema>;
export type GpcOptOutPrototype = z.infer<typeof gpcOptOutPrototypeSchema>;
