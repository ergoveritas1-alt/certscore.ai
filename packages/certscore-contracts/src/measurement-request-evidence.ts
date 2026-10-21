import { z } from "zod";

const cookieIdentifierBindingSchema = z.object({
  policyVersion: z.literal("measurement_cookie_identifier.v1"),
  parameter: z.enum(["cid", "u", "vi"]),
  source: z.literal("pre_action_cookie_snapshot"),
  targetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  cookieName: z.string().regex(/^(?:_ga|hubspotutk|_hp2_id\.[0-9]{1,20})$/),
  hostname: z.string().min(1).max(255),
  identityHash: z.string().regex(/^[a-f0-9]{64}$/),
  valueHash: z.string().regex(/^[a-f0-9]{64}$/),
  identifierSha256: z.string().regex(/^[a-f0-9]{64}$/),
  capturedAtMs: z.number().int().nonnegative(),
}).strict();
export type MeasurementCookieIdentifierBinding = z.infer<typeof cookieIdentifierBindingSchema>;
export type MeasurementStoredIdentifier = MeasurementCookieIdentifierBinding;

/** Bounded producer inspection. No raw body, header, identifier or query value. */
export const measurementRequestEvidenceSchema = z.object({
  version: z.enum(["measurement_request_evidence.v1", "measurement_request_evidence.v2", "measurement_request_evidence.v3"]),
  requestId: z.string().min(1).max(120),
  timestampMs: z.number().int().nonnegative(),
  requestOrigin: z.string().url().max(255),
  requestPath: z.string().min(1).max(255),
  profile: z.enum(["google_analytics_collection.v1", "cloudflare_rum.v1", "heap_collection.v1", "hubspot_collection.v1", "shopify_mixed_telemetry.v1"]),
  method: z.enum(["GET", "POST", "OPTIONS", "other"]),
  payloadInspection: z.enum(["complete", "unknown"]),
  identifierEvidence: z.enum(["not_observed", "persistent_observed", "unknown"]),
  cookieHeader: z.enum(["absent", "present", "unknown"]),
  authorizationHeader: z.enum(["absent", "present", "unknown"]),
  cookieIdentifierBinding: cookieIdentifierBindingSchema.optional(),
  diagnostics: z.object({
    policyVersion: z.literal("bounded_measurement_inspection.v1"),
    reasons: z.array(z.enum(["payload_size_limit", "unsupported_payload", "unsupported_fields", "duplicate_fields",
      "field_limit", "ambiguous_client_identifier", "headers_unavailable", "unsupported_headers", "body_unavailable", "purpose_unresolved"])).max(10),
    bodyDisposition: z.enum(["empty", "inspected", "limited"]),
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if ((["heap_collection.v1", "hubspot_collection.v1"].includes(value.profile) &&
    value.identifierEvidence === "persistent_observed" && !value.cookieIdentifierBinding) ||
    value.profile === "shopify_mixed_telemetry.v1" && (value.identifierEvidence !== "unknown" || value.payloadInspection !== "unknown"))
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"New collector profiles require exact stored-identifier proof and cannot infer mixed-purpose absence."});
  if (value.version === "measurement_request_evidence.v1" && (value.diagnostics || value.cookieIdentifierBinding) ||
    value.version !== "measurement_request_evidence.v1" && !value.diagnostics ||
    value.version !== "measurement_request_evidence.v3" && !["google_analytics_collection.v1", "cloudflare_rum.v1"].includes(value.profile) ||
    value.cookieIdentifierBinding && (value.identifierEvidence !== "persistent_observed" || !(
      value.profile === "google_analytics_collection.v1" && value.cookieIdentifierBinding.parameter === "cid" && value.cookieIdentifierBinding.cookieName === "_ga" ||
      value.version === "measurement_request_evidence.v3" && value.profile === "heap_collection.v1" && value.cookieIdentifierBinding.parameter === "u" && /^_hp2_id\.[0-9]+$/.test(value.cookieIdentifierBinding.cookieName) ||
      value.version === "measurement_request_evidence.v3" && value.profile === "hubspot_collection.v1" && value.cookieIdentifierBinding.parameter === "vi" && value.cookieIdentifierBinding.cookieName === "hubspotutk")))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Versioned measurement provenance must match its identifier conclusion." });
});
export type MeasurementRequestEvidence = z.infer<typeof measurementRequestEvidenceSchema>;
export type MeasurementStorageBindingContext = {
  targetSha256?: string;
  actionDispatchedAtMs?: number;
  preActionCapturedAtMs?: number;
  preActionStorage: ReadonlyArray<{ storageType: string; name: string; hostname?: string; identityHash?: string;
    valueHash?: string; expiresAtEpochSeconds?: number; capturedAtEpochSeconds?: number; nonEssential: boolean }>;
};
export function readBoundMeasurementRequestEvidence(value: unknown, request: {
  requestId: string; startedAtMs: number; sanitizedUrl: string; method?: string;
}, storage?: MeasurementStorageBindingContext): MeasurementRequestEvidence | null {
  const parsed = measurementRequestEvidenceSchema.safeParse(value);
  if (!parsed.success) return null;
  const evidence = parsed.data;
  const match = evidence.cookieIdentifierBinding;
  if (match && (!storage || match.targetSha256 !== storage.targetSha256 || match.capturedAtMs !== storage.preActionCapturedAtMs ||
    storage.actionDispatchedAtMs === undefined || match.capturedAtMs > storage.actionDispatchedAtMs ||
    storage.actionDispatchedAtMs > request.startedAtMs || !storage.preActionStorage.some(item => item.storageType === "cookie" &&
      item.name === match.cookieName && item.hostname === match.hostname && item.identityHash === match.identityHash &&
      item.valueHash === match.valueHash && item.nonEssential && item.expiresAtEpochSeconds !== undefined &&
      item.capturedAtEpochSeconds !== undefined && item.expiresAtEpochSeconds > item.capturedAtEpochSeconds + (request.startedAtMs - match.capturedAtMs) / 1000))) return null;
  try {
    const url = new URL(request.sanitizedUrl);
    return url.protocol === "https:" && !url.username && !url.password && evidence.requestId === request.requestId &&
      evidence.timestampMs === request.startedAtMs && evidence.requestOrigin === url.origin && evidence.requestPath === url.pathname &&
      evidence.method === request.method &&
      (evidence.profile !== "cloudflare_rum.v1" || url.origin === "https://cloudflareinsights.com" && url.pathname === "/cdn-cgi/rum") &&
      (evidence.profile !== "heap_collection.v1" || url.origin === "https://heapanalytics.com" && url.pathname === "/h") &&
      (evidence.profile !== "hubspot_collection.v1" || /^https:\/\/track(?:-eu1)?\.hubspot\.com$/.test(url.origin) && /^\/(?:__pt[qc]|ptq)\.gif$/.test(url.pathname)) &&
      (evidence.profile !== "shopify_mixed_telemetry.v1" || url.origin === "https://monorail-edge.shopifysvc.com" && ["/v1/produce", "/unstable/produce_batch"].includes(url.pathname)) &&
      (evidence.profile !== "google_analytics_collection.v1" || ["/g/collect", "/collect", "/j/collect"].includes(url.pathname)) ? evidence : null;
  } catch { return null; }
}
