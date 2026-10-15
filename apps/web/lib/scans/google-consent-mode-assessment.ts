import { assessGoogleConsentModeRequest, readGoogleConsentModeAssessment } from "@certscore/contracts";
import { isCanonicalGoogleAnalyticsCollectionUrl } from "@certscore/vendor-resolver";

/** Called only for producer evidence in the verified canonical bundle. The
 * existing bundle source hash/provenance continues to own persistence. */
export function projectGoogleConsentModeRequest(event: {
  googleConsentMode?: unknown; requestUrl: string; requestId: string; timestampMs: number;
}) {
  if (!isCanonicalGoogleAnalyticsCollectionUrl(event.requestUrl)) return undefined;
  return assessGoogleConsentModeRequest({
    observation: event.googleConsentMode, requestId: event.requestId,
    timestampMs: event.timestampMs, requestUrl: event.requestUrl,
  });
}

/** Typed interpretation survives concern/policy projection only with the same
 * request identity, endpoint, time and retained evidence reference. */
export function readRetainedGoogleConsentMode(row: Record<string, unknown>) {
  if (typeof row.requestUrl !== "string" || !isCanonicalGoogleAnalyticsCollectionUrl(row.requestUrl) ||
    typeof row.requestId !== "string" || typeof row.eventId !== "string" ||
    !Array.isArray(row.evidenceRefs) || !row.evidenceRefs.includes(row.eventId) ||
    (row.firstSeenMs !== undefined && row.firstSeenMs !== row.tsMs)) return undefined;
  return readGoogleConsentModeAssessment(row.googleConsentMode, {
    requestId: row.requestId, timestampMs: row.tsMs, requestUrl: row.requestUrl,
  });
}
