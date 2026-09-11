import type { ProductAnalyticsPayload } from "./contract";

/** The server must additionally verify an authenticated session. */
export function isAuthenticatedActivity(payload: ProductAnalyticsPayload) {
  return (payload.route === "/app" || payload.route.startsWith("/app/"))
    && payload.eventName !== "analytics_opted_in"
    && payload.eventName !== "analytics_opted_out";
}

/** Operational attribution uses the server user, not optional browser identities. */
export function operationalActivityPayload(payload: ProductAnalyticsPayload): ProductAnalyticsPayload {
  return {
    ...payload,
    actorId: undefined,
    sessionId: undefined,
    campaignSource: undefined,
    campaignMedium: undefined,
    campaignName: undefined,
    entryRoute: undefined,
  };
}

export function resolveActivityAttribution(
  payload: ProductAnalyticsPayload,
  authenticatedUserId: string | null,
  optionalConsentState: "opted_out" | "granted" | "measurement",
) {
  const operational = Boolean(authenticatedUserId) && isAuthenticatedActivity(payload);
  return {
    operational,
    consentState: operational ? "operational" as const : optionalConsentState,
    userId: operational || optionalConsentState !== "opted_out" ? authenticatedUserId : null,
    payload: operational ? operationalActivityPayload(payload) : payload,
  };
}
