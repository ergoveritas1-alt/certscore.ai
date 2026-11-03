import { createHash } from "node:crypto";
import { gpcObservationSessionSchema, observedJourneySchema } from "@certscore/contracts";
import { collectionPairFixture } from "./gpc-collection-pair.cases";
import { canonicalWideJourneyFixture } from "../../../certscore-contracts/src/test-fixtures/canonical-wide-journeys";
export function gpcCookieReadFixture(scanId?: string) {
  const bundle = collectionPairFixture(undefined, scanId).gpc;
  const s = bundle.gpcObservationSession!;
  s.captureEndedAtMs = 7000;
  s.semanticObservation!.capturedAtMs = 6600;
  s.finalization = { contractVersion: "certscore.gpc-overlapped-finalization.v1", readbackStartedAtMs: 6500,
    readbackCompletedAtMs: 6550, requestedGeneration: 2, terminalGeneration: 2, documentUnchanged: true, invalidationReasons: [] };
  bundle.completedAt = "2026-09-05T12:00:08.000Z";
  bundle.gpcObservationSession = gpcObservationSessionSchema.parse(s);
  bundle.gpcPrototypeSessionBinding!.sessionSha256 = createHash("sha256").update(JSON.stringify(bundle.gpcObservationSession)).digest("hex");
  const snapshot = { artifactId: "cookie_snapshot_pre_consent", capturedAtMs: 6105, consentStateAtTime: "pre_consent" as const,
    cookies: [{ name: "PRIVATE_COOKIE", domain: ".example.test", path: "/" }], cookieNames: ["PRIVATE_COOKIE"], evidenceRefs: [] };
  bundle.cookieSnapshots = [snapshot];
  const input = { scanId: bundle.scanId, targetUrl: bundle.url, captureId: s.captureId, session: bundle.gpcObservationSession,
    impact: bundle.gpcImpactCapture, signal: bundle.gpcSignalObservation, enabled: true, succeeded: true, aborted: false,
    before: { url: bundle.url, documentIdentity: { source: "cdp_loader_id" as const, token: s.mainDocument!.documentToken } },
    after: { url: bundle.url, documentIdentity: { source: "cdp_loader_id" as const, token: s.mainDocument!.documentToken } },
    startedAtMs: 6100, completedAtMs: 6105, snapshot };
  return { bundle, input };
}

/** Newly constructed oversized worker fixture. Its original session receipt is
 * created here; never apply this stamping to historical retained evidence. */
export function gpcCookieReadRetentionFixture(scanId?: string) {
  const f = gpcCookieReadFixture(scanId), prototype = f.bundle.networkEvents[0]!;
  for (let i = 0; i < 400; i++) {
    const url = `https://static.example.test/${"asset".repeat(280)}/${i}.js`;
    const event = { ...prototype, eventId: `padding-${i}`, requestId: `padding-${i}`, timestampMs: 6001,
      url, requestUrl: url, resourceType: "script", isMainFrame: false };
    f.bundle.networkEvents.push(event);
    f.bundle.gpcObservationSession!.requests.push({ eventId: event.eventId, timestampMs: event.timestampMs,
      urlSha256: createHash("sha256").update(url).digest("hex"), secGpc: "1", headerSource: "request_snapshot" });
  }
  f.bundle.gpcObservationSession!.requestsObserved = f.bundle.gpcObservationSession!.requests.length;
  f.bundle.gpcPrototypeSessionBinding!.sessionSha256 = createHash("sha256")
    .update(JSON.stringify(f.bundle.gpcObservationSession)).digest("hex");
  f.bundle.cookieSnapshots.push({ ...f.bundle.cookieSnapshots[0]!, artifactId: "other-cookie-snapshot", capturedAtMs: 6200 });
  return f;
}

/** Fixed retained context remains oversized even after existing event caps. */
export function gpcCookieReadOversizedFixture(scanId?: string) {
  const f = gpcCookieReadRetentionFixture(scanId);
  for (let i = 0; i < 8; i++) f.bundle.observedJourneys.push(observedJourneySchema.parse({
    journeyId: `infrastructure-${i}`, journeyType: "script", key: `script-${i}`, displayName: "Fixture infrastructure",
    purpose: "infrastructure", sourceScanner: "pre_consent_runtime", firstObservedAtMs: 6001, lastObservedAtMs: 6001,
    firstObservedConsentState: "pre_consent", firstPartyOrThirdParty: "first_party",
    confidence: 1, directVsInferred: "direct",
    relatedScripts: Array.from({length:200},(_,n)=>`https://static.example.test/${"asset".repeat(100)}/${i}/${n}.js`),
  }));
  return f;
}

export function gpcCookieReadWideDictionaryFixture(scanId?: string) {
  const f=gpcCookieReadOversizedFixture(scanId);
  f.bundle.observedJourneys.push(...canonicalWideJourneyFixture(6001));
  return f;
}
