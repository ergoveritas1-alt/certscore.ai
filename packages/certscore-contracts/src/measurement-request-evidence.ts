import { z } from "zod";

const cookieIdentifierBindingSchema = z.object({
  policyVersion: z.literal("measurement_cookie_identifier.v1"),
  parameter: z.literal("cid"),
  source: z.literal("pre_action_cookie_snapshot"),
  targetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  cookieName: z.literal("_ga"),
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
  version: z.enum(["measurement_request_evidence.v1", "measurement_request_evidence.v2"]),
  requestId: z.string().min(1).max(120),
  timestampMs: z.number().int().nonnegative(),
  requestOrigin: z.string().url().max(255),
  requestPath: z.string().min(1).max(255),
  profile: z.enum(["google_analytics_collection.v1", "cloudflare_rum.v1"]),
  method: z.enum(["GET", "POST", "OPTIONS", "other"]),
  payloadInspection: z.enum(["complete", "unknown"]),
  identifierEvidence: z.enum(["not_observed", "persistent_observed", "unknown"]),
  cookieHeader: z.enum(["absent", "present", "unknown"]),
  authorizationHeader: z.enum(["absent", "present", "unknown"]),
  cookieIdentifierBinding: cookieIdentifierBindingSchema.optional(),
  diagnostics: z.object({
    policyVersion: z.literal("bounded_measurement_inspection.v1"),
    reasons: z.array(z.enum(["payload_size_limit", "unsupported_payload", "unsupported_fields", "duplicate_fields",
      "field_limit", "ambiguous_client_identifier", "headers_unavailable", "unsupported_headers", "body_unavailable"])).max(9),
    bodyDisposition: z.enum(["empty", "inspected", "limited"]),
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.version === "measurement_request_evidence.v1" && (value.diagnostics || value.cookieIdentifierBinding) ||
    value.version === "measurement_request_evidence.v2" && !value.diagnostics ||
    value.cookieIdentifierBinding && (value.identifierEvidence !== "persistent_observed" || value.profile !== "google_analytics_collection.v1"))
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
      (evidence.profile !== "google_analytics_collection.v1" || ["/g/collect", "/collect", "/j/collect"].includes(url.pathname)) ? evidence : null;
  } catch { return null; }
}
