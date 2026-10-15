import { z } from "zod";

/** Bounded producer inspection. No raw body, header, identifier or query value. */
export const measurementRequestEvidenceSchema = z.object({
  version: z.literal("measurement_request_evidence.v1"),
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
}).strict();
export type MeasurementRequestEvidence = z.infer<typeof measurementRequestEvidenceSchema>;
export function readBoundMeasurementRequestEvidence(value: unknown, request: {
  requestId: string; startedAtMs: number; sanitizedUrl: string; method?: string;
}): MeasurementRequestEvidence | null {
  const parsed = measurementRequestEvidenceSchema.safeParse(value);
  if (!parsed.success) return null;
  const evidence = parsed.data;
  try {
    const url = new URL(request.sanitizedUrl);
    return url.protocol === "https:" && !url.username && !url.password && evidence.requestId === request.requestId &&
      evidence.timestampMs === request.startedAtMs && evidence.requestOrigin === url.origin && evidence.requestPath === url.pathname &&
      evidence.method === request.method &&
      (evidence.profile !== "cloudflare_rum.v1" || url.origin === "https://cloudflareinsights.com" && url.pathname === "/cdn-cgi/rum") &&
      (evidence.profile !== "google_analytics_collection.v1" || ["/g/collect", "/collect", "/j/collect"].includes(url.pathname)) ? evidence : null;
  } catch { return null; }
}
