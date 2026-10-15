import assert from "node:assert/strict";
import test from "node:test";
import { captureGoogleConsentModeRequest } from "@certscore/vendor-resolver";
import { projectGoogleConsentModeRequest, readRetainedGoogleConsentMode } from "./google-consent-mode-assessment";
import { buildPromotionGradePreconsentRequests, isPromotionGradePreconsentRequestRow } from "./preconsent-public-evidence";
import { describePreconsentTrackingTiming, projectPreconsentTrackingTiming, readPreconsentTrackingTiming } from "./preconsent-tracking-timing";
import { buildUnifiedFindingPackets, type UnifiedFindingCandidate } from "./unified-findings";

const rawUrl = "https://www.google-analytics.com/g/collect?gcs=G100&gcd=13p3p3p2p5l1&npa=1";
const event = { requestUrl: rawUrl, requestId: "req_1", timestampMs: 4929 };
const observation = captureGoogleConsentModeRequest({ url: rawUrl, ...event });
const assessment = projectGoogleConsentModeRequest({ ...event, googleConsentMode: observation });
const row = { requestUrl: "https://www.google-analytics.com/g/collect?redacted=1", requestId: "req_1", eventId: "net_1", tsMs: 4929,
  evidenceRefs: ["net_1"], category: "analytics", vendorName: "Google Analytics", classification: "tracking", essentiality: "non_essential",
  confidence: 0.96, collectionEndpointObserved: true, runtimePhase: "pre_consent", cookieNamesSent: ["_ga"] };

test("typed denied-storage context survives canonical projection without changing eligibility or cookie facts", () => {
  assert.equal(assessment?.storageDeclaration, "denied");
  const enriched = { ...row, googleConsentMode: assessment };
  assert.equal(isPromotionGradePreconsentRequestRow(enriched), isPromotionGradePreconsentRequestRow(row));
  const original = buildPromotionGradePreconsentRequests({ rows: [row] });
  const requests = buildPromotionGradePreconsentRequests({ rows: [enriched] });
  assert.equal(requests.length, 1);
  const { googleConsentMode, requestId, eventId, tsMs, ...rest } = requests[0]!;
  assert.deepEqual(rest, original[0]);
  assert.deepEqual(requests[0]?.cookieNamesSent, ["_ga"], "declared denied storage must not erase independently observed cookies");
  assert.equal(googleConsentMode?.scoreEffect, "none");
  assert.deepEqual(readRetainedGoogleConsentMode(requests[0]!), assessment);
  const timing = projectPreconsentTrackingTiming([enriched]);
  assert.match(describePreconsentTrackingTiming(timing), /1 Google Analytics measurement request declared advertising and analytics storage consent denied/);
  assert.equal(timing.requests[0]?.firstSeenMs, 4929);
  const drifted = structuredClone(timing);
  drifted.requests[0]!.firstSeenMs = 5000;
  assert.equal(readPreconsentTrackingTiming(drifted)[0]?.googleConsentMode, undefined);
  assert.doesNotMatch(describePreconsentTrackingTiming(drifted), /storage consent denied/);
});

test("legacy URL flags, missing references, binding drift and forged interpretations never change context", () => {
  assert.equal(readRetainedGoogleConsentMode({ ...row, requestUrl: rawUrl }), undefined);
  for (const change of [{ requestId: "other" }, { tsMs: 4930 }, { evidenceRefs: [] }, { eventId: "other" },
    { requestUrl: "https://evil.test/g/collect" }, { googleConsentMode: { ...assessment, storageDeclaration: "granted" } }]) {
    assert.equal(readRetainedGoogleConsentMode({ ...row, googleConsentMode: assessment, ...change }), undefined);
  }
  assert.doesNotMatch(describePreconsentTrackingTiming(projectPreconsentTrackingTiming([row])), /declared/);
  assert.equal(projectGoogleConsentModeRequest({ ...event, requestUrl: "https://evil.test/g/collect", googleConsentMode: { ...observation, requestOrigin: "https://evil.test" } }), undefined);
});

test("consent-mode interpretation passes through normalized concern and policy without changing the unified finding", () => {
  const candidate = (request: Record<string, unknown>): UnifiedFindingCandidate => ({
    title: "Pre-consent tracking detected", description: "A measurement request was observed before a choice.",
    signalKey: "privacy.preconsent_tracking_detected", signalLabel: "Pre-consent tracking detected",
    signalSource: "snapshot_signal", sourceType: "signal", observedValue: "Yes", severity: "high",
    fallbackEvidence: { signalKey: "privacy.preconsent_tracking_detected", signalValue: true,
      requestPurposeClassificationConfidence: [request], runtimeRequestUrls: [row.requestUrl] },
  });
  const before = buildUnifiedFindingPackets({ reviewFindingCandidates: [candidate(row)], validationFindings: [] });
  const after = buildUnifiedFindingPackets({ reviewFindingCandidates: [candidate({ ...row, googleConsentMode: assessment })], validationFindings: [] });
  assert.equal(after.length, 1);
  assert.equal(after[0]?.unifiedFindingId, "preconsent_tracking");
  assert.deepEqual(after.map(packet => [packet.unifiedFindingId, packet.severity, packet.confidenceBand]),
    before.map(packet => [packet.unifiedFindingId, packet.severity, packet.confidenceBand]));
  assert.match(JSON.stringify(after), /google-consent-mode-interpretation.v1/);
});
