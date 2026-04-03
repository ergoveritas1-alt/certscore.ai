import type { CookieDetectionRecord, ResponseRecord, RuntimeRunResult, TimingSummary } from "./types";

const HIGH_SIGNAL_COOKIE_NAMES = new Set(["_gcl_au", "_ga", "_fbp", "IDE", "_rdt_uuid", "_tt_enable_cookie", "_ttp"]);

function firstDocumentStatuses(responses: ResponseRecord[]) {
  const documents = responses.filter((response) => response.resourceType === "document").sort((left, right) => left.timestampMs - right.timestampMs);
  return {
    final: documents.at(-1) ?? null,
    first: documents[0] ?? null,
    firstChallenge: documents.find((response) => [401, 403, 429, 503].includes(response.status ?? -1)) ?? null,
    firstRecovery: documents.find((response) => response.status === 200) ?? null
  };
}

function firstHighSignalCookie(cookies: CookieDetectionRecord[]) {
  return cookies.find((cookie) => HIGH_SIGNAL_COOKIE_NAMES.has(cookie.cookieName) || cookie.cookieName.startsWith("_ga_")) ?? null;
}

export function buildTimingSummary(input: {
  consentUiFirstDetectedTimestampMs: number | null;
  cookiesBeforeConsent: CookieDetectionRecord[];
  requests: RuntimeRunResult["requests"];
  responses: RuntimeRunResult["responses"];
  wallTimeMs: number;
}) {
  const documents = firstDocumentStatuses(input.responses);
  const firstThirdPartyRequest = input.requests.find((request) => {
    try {
      const hostname = new URL(request.url).hostname.toLowerCase();
      return hostname.length > 0;
    } catch {
      return false;
    }
  }) ?? null;
  const firstCookie = input.cookiesBeforeConsent[0] ?? null;
  const highSignalCookie = firstHighSignalCookie(input.cookiesBeforeConsent);

  return {
    challengeToRecoveryMs:
      documents.firstChallenge && documents.firstRecovery ? Math.max(documents.firstRecovery.timestampMs - documents.firstChallenge.timestampMs, 0) : null,
    finalDocumentStatus: documents.final?.status ?? null,
    firstChallengeTimestampMs: documents.firstChallenge?.timestampMs ?? null,
    firstConsentUiTimestampMs: input.consentUiFirstDetectedTimestampMs,
    firstCookieTimestampMs: firstCookie?.firstSeenTimestampMs ?? null,
    firstHighSignalCookieTimestampMs: highSignalCookie?.firstSeenTimestampMs ?? null,
    firstRecoveryTimestampMs: documents.firstRecovery?.timestampMs ?? null,
    firstThirdPartyRequestTimestampMs: firstThirdPartyRequest?.timestampMs ?? null,
    initialDocumentStatus: documents.first?.status ?? null,
    navigationStartTimestampMs: 0,
    observationEndedTimestampMs: input.wallTimeMs
  } satisfies TimingSummary;
}
