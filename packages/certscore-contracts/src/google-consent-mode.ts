import { z } from "zod";

/** Request declarations, not proof of a visitor decision or actual storage use. */
export const googleConsentModeObservationSchema = z.object({
  version: z.literal("google-consent-mode-request.v1"),
  source: z.literal("request_query"),
  requestId: z.string().min(1).max(160),
  timestampMs: z.number().finite().nonnegative(),
  requestOrigin: z.string().url().max(255),
  requestPath: z.enum(["/g/collect", "/collect", "/j/collect"]),
  gcs: z.enum(["G100", "G101", "G110", "G111", "not_present", "unrecognized"]),
  gcdPresent: z.boolean(),
  nonPersonalizedAds: z.enum(["declared", "not_declared", "unknown"]),
}).strict();
export type GoogleConsentModeObservation = z.infer<typeof googleConsentModeObservationSchema>;

export const googleConsentModeAssessmentSchema = z.object({
  version: z.literal("google-consent-mode-interpretation.v1"),
  observation: googleConsentModeObservationSchema,
  storageDeclaration: z.enum(["denied", "granted", "mixed", "unknown"]),
  scoreEffect: z.literal("none"),
}).strict();
export type GoogleConsentModeAssessment = z.infer<typeof googleConsentModeAssessmentSchema>;

/** Only assess typed producer evidence bound to the same retained request.
 * Never recover declarations from historical, redacted request URLs on read. */
export function assessGoogleConsentModeRequest(input: {
  observation: unknown;
  requestId: unknown;
  timestampMs: unknown;
  requestUrl: unknown;
}): GoogleConsentModeAssessment | undefined {
  const parsed = googleConsentModeObservationSchema.safeParse(input.observation);
  if (!parsed.success || typeof input.requestUrl !== "string") return undefined;
  const observation = parsed.data;
  try {
    const url = new URL(input.requestUrl);
    if (url.protocol !== "https:" || url.username || url.password ||
      url.origin !== observation.requestOrigin || url.pathname !== observation.requestPath ||
      input.requestId !== observation.requestId || input.timestampMs !== observation.timestampMs) return undefined;
  } catch { return undefined; }
  return {
    version: "google-consent-mode-interpretation.v1",
    observation,
    storageDeclaration: observation.gcs === "G100" ? "denied" : observation.gcs === "G111" ? "granted" :
      observation.gcs === "G101" || observation.gcs === "G110" ? "mixed" : "unknown",
    scoreEffect: "none",
  };
}

/** Reads only a persisted typed interpretation; no interpretation of URL query values. */
export function readGoogleConsentModeAssessment(value: unknown, binding: {
  requestId: unknown; timestampMs: unknown; requestUrl: unknown;
}): GoogleConsentModeAssessment | undefined {
  const parsed = googleConsentModeAssessmentSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const assessed = assessGoogleConsentModeRequest({ ...binding, observation: parsed.data.observation });
  return assessed?.storageDeclaration === parsed.data.storageDeclaration ? assessed : undefined;
}
