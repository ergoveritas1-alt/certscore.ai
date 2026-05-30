import type { BrowserScanEventInput } from "./schema";

export type BrowserScanEventRow = {
  event_type: string;
  event_json: BrowserScanEventInput;
  observed_at_ms: number;
};

export type BrowserScanArtifactRow = {
  artifact_json: Record<string, unknown>;
  artifact_type: string;
  content_type: string;
};

function uniqueStrings(values: Array<string | null | undefined>, limit = 250) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))]
    .slice(0, limit);
}

function isLikelyThirdParty(hostname: string, targetHostname: string) {
  return hostname !== targetHostname && !hostname.endsWith(`.${targetHostname}`);
}

function isBrowserCookieEvent(
  event: BrowserScanEventInput
): event is Extract<BrowserScanEventInput, { eventType: "cookie_added" | "cookie_changed" | "cookie_observed" }> {
  return event.eventType === "cookie_added" || event.eventType === "cookie_changed" || event.eventType === "cookie_observed";
}

export function summarizeBrowserEvidence(input: {
  artifacts: BrowserScanArtifactRow[];
  events: BrowserScanEventRow[];
  targetHostname: string;
}) {
  const eventPayloads = input.events.map((row) => row.event_json);
  const networkEvents = eventPayloads.filter((event) => event.eventType === "network_request");
  const cookieEvents = eventPayloads.filter(isBrowserCookieEvent);
  const consentEvents = eventPayloads.filter((event) => event.eventType === "consent_ui_observed");
  const thirdPartyNetworkEvents = networkEvents.filter((event) => isLikelyThirdParty(event.hostname, input.targetHostname));
  const consentSummary = consentEvents.find((event) => event.bannerObserved) ?? consentEvents[0] ?? null;
  const firstThirdPartyRequestMs = thirdPartyNetworkEvents[0]?.observedAtMs ?? null;
  const firstConsentBannerMs = consentSummary?.observedAtMs ?? null;

  return {
    bannerObserved: consentSummary?.bannerObserved === true,
    consentSummary,
    cookieDomains: uniqueStrings(cookieEvents.map((event) => event.domain)),
    cookieNames: uniqueStrings(cookieEvents.map((event) => event.cookieName)),
    cookies: cookieEvents,
    networkEvidence: networkEvents.slice(0, 500).map((event) => ({
      consentInteractionObserved: event.consentInteractionObserved === true,
      hostname: event.hostname,
      initiator: event.initiator ?? null,
      observedAtMs: event.observedAtMs,
      referrer: event.referrer ?? null,
      resourceType: event.resourceType ?? null,
      url: event.url
    })),
    screenshotArtifactCount: input.artifacts.filter((artifact) => artifact.artifact_type === "screenshot").length,
    timelineMarkers: {
      consentBannerDetectedMs: firstConsentBannerMs,
      firstRequestMs: networkEvents[0]?.observedAtMs ?? null,
      firstThirdPartyRequestMs
    },
    thirdPartyRequestCount: thirdPartyNetworkEvents.length,
    thirdPartyRequestDomains: uniqueStrings(thirdPartyNetworkEvents.map((event) => event.hostname))
  };
}
