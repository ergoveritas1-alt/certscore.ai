import { z } from "zod";
import { googleConsentModeAssessmentSchema } from "@certscore/contracts";
import { readRetainedGoogleConsentMode } from "./google-consent-mode-assessment";
import { buildPromotionGradePreconsentRequests } from "./preconsent-public-evidence";

const requestSchema = z.object({
  requestUrl: z.string().url().regex(/^https?:\/\//),
  vendorName: z.string().min(1),
  vendorCategory: z.enum(["advertising", "advertising_measurement", "analytics", "dmp", "identity",
    "identity_resolution", "marketing_automation", "retargeting", "sale_share", "session_replay", "tracking"]),
  firstSeenMs: z.number().finite().nonnegative(), runtimePhase: z.literal("pre_consent"),
  evidenceRefs: z.array(z.string()),
  googleConsentMode: googleConsentModeAssessmentSchema.optional(),
  requestId: z.string().max(160).optional(),
  eventId: z.string().max(160).optional(),
  tsMs: z.number().finite().nonnegative().optional(),
});
export const preconsentTrackingTimingSchema = z.object({
  version: z.literal("classified-request-timing.v1"), requests: z.array(requestSchema).max(12),
});

/** Called at concern/checklist projection, never from raw observations in a display. */
export function projectPreconsentTrackingTiming(rows: unknown[]) {
  const requests = buildPromotionGradePreconsentRequests({ rows, maxItems: 12 }).filter(request =>
    request.runtimePhase && ["pre_consent", "before_consent", "before_consent_request"].includes(request.runtimePhase) &&
    request.firstSeenMs !== null);
  return preconsentTrackingTimingSchema.parse({ version: "classified-request-timing.v1", requests: requests.map(request => ({
    requestUrl: request.requestUrl, vendorName: request.vendorName, vendorCategory: request.vendorCategory,
    firstSeenMs: request.firstSeenMs, runtimePhase: "pre_consent", evidenceRefs: request.evidenceRefs,
    ...(request.googleConsentMode ? { googleConsentMode: request.googleConsentMode,
      requestId: request.requestId, eventId: request.eventId, tsMs: request.tsMs } : {}),
  })) });
}

/** Read already-projected request/time pairs. Legacy aggregate timestamps are not proof. */
export function readPreconsentTrackingTiming(value: unknown) {
  const parsed = preconsentTrackingTimingSchema.safeParse(value);
  return parsed.success ? parsed.data.requests.map(request => {
    const { googleConsentMode: retained, ...rest } = request;
    const googleConsentMode = readRetainedGoogleConsentMode(request);
    return { ...rest, ...(googleConsentMode ? { googleConsentMode } : {}) };
  }) : [];
}

export function describePreconsentTrackingTiming(value: unknown) {
  const requests = readPreconsentTrackingTiming(value);
  if (!requests.length) return "Tracking was established by the retained finding, but its precise request timing is unavailable.";
  const first = requests.reduce((a, b) => a.firstSeenMs <= b.firstSeenMs ? a : b);
  const vendors = [...new Set(requests.map(request => request.vendorName))];
  const denied = requests.filter(request => request.googleConsentMode?.storageDeclaration === "denied");
  const context = denied.length ? ` ${denied.length} Google Analytics measurement request${denied.length === 1 ? "" : "s"} declared advertising and analytics storage consent denied. Request declarations and observed cookie use are separate evidence.` : "";
  return `Tracking-classified requests were observed before consent: ${vendors.slice(0, 3).join(", ")}. The first retained qualifying request was ${first.vendorName} at ${(first.firstSeenMs / 1000).toPrecision(3)}s after scan start.${context}`;
}
