import assert from "node:assert/strict";
import test from "node:test";
import type { ConsentActionAttempt, ConsentFlowObservation, CookieEvent, NetworkEvent } from "@certscore/contracts";
import { buildConsentFlowComparisonsFromEvidence } from "./scanners/consent-flow-runtime-scanner.js";

test("buildConsentFlowComparisonsFromEvidence synthesizes accept versus reject from persisted shard evidence", () => {
  const comparisons = buildConsentFlowComparisonsFromEvidence({
    consentActionAttempts: [
      actionAttempt("reject_all_flow", "reject_all", false),
      actionAttempt("accept_all_flow", "accept_all", false),
    ],
    consentFlowObservations: [
      consentObservation("reject_all_flow"),
      consentObservation("accept_all_flow"),
    ],
    cookieEvents: [],
    networkEvents: [],
    normalizedVendorObservations: [],
  });

  const comparison = comparisons.find((candidate) => candidate.comparedScenarios === "after_reject_vs_after_accept");
  assert.ok(comparison);
  assert.equal(comparison.comparisonId, "consent_comparison_after_reject_vs_after_accept");
  assert.equal(comparison.comparableMeasurement?.comparable, false);
  assert.match(comparison.comparableMeasurement?.reason ?? "", /reject_all_not_confidently_executed/);
  assert.match(comparison.comparableMeasurement?.reason ?? "", /accept_all_not_confidently_executed/);
});

test("buildConsentFlowComparisonsFromEvidence retains scenario-specific endpoint and cookie deltas", () => {
  const comparisons = buildConsentFlowComparisonsFromEvidence({
    consentActionAttempts: [
      actionAttempt("reject_all_flow", "reject_all", true),
      actionAttempt("accept_all_flow", "accept_all", true),
    ],
    consentFlowObservations: [
      consentObservation("reject_all_flow", "post_reject"),
      consentObservation("accept_all_flow", "post_accept"),
    ],
    cookieEvents: [
      cookieEvent("cookie_reject", "reject_all_flow", "_ga"),
      cookieEvent("cookie_accept", "accept_all_flow", "_fbp"),
    ],
    networkEvents: [
      networkEvent("network_reject", "reject_all_flow", "analytics.example"),
      networkEvent("network_accept", "accept_all_flow", "ads.example"),
    ],
    normalizedVendorObservations: [],
  });

  const comparison = comparisons.find((candidate) => candidate.comparedScenarios === "after_reject_vs_after_accept");
  assert.ok(comparison);
  assert.equal(comparison.comparableMeasurement?.comparable, true);
  assert.deepEqual(comparison.cookiesSetAfterAccept, ["_fbp"]);
  assert.deepEqual(comparison.collectionEndpointsAppearingOnlyAfterAccept, ["ads.example"]);
});

function actionAttempt(
  scenario: ConsentActionAttempt["scenario"],
  actionType: ConsentActionAttempt["actionType"],
  succeeded: boolean,
): ConsentActionAttempt {
  return {
    actionType,
    attempted: true,
    attemptId: `attempt_${scenario}_${actionType}`,
    evidenceRefs: [],
    failureReason: succeeded ? undefined : "candidate_not_observed",
    scenario,
    succeeded,
    timestampMs: 10,
  };
}

function consentObservation(
  scenario: ConsentFlowObservation["scenario"],
  consentStateAtTime: ConsentFlowObservation["consentStateAtTime"] = "pre_consent",
): ConsentFlowObservation {
  return {
    actionAttempts: [],
    actionCandidates: [],
    artifactRefs: [],
    bannerLikelyPresent: true,
    confidence: 0.7,
    consentStateAtTime,
    directVsInferred: "direct",
    evidenceRefs: [],
    observationId: `consent_flow_${scenario}`,
    scenario,
    sourceScanner: "consent_flow_runtime",
  };
}

function networkEvent(eventId: string, scenario: NetworkEvent["scenario"], hostname: string): NetworkEvent {
  return {
    attributionStatus: "resolved",
    collectionEndpointObserved: true,
    confidence: 0.8,
    consentStateAtTime: scenario === "accept_all_flow" ? "post_accept" : "post_reject",
    cookieHeaderPresent: false,
    cookieNamesSent: [],
    directVsInferred: "direct",
    eventId,
    eventType: "network_request",
    evidenceRefs: [],
    firstParty: false,
    hasAdvertisingClickIdParameters: false,
    hasIdentifierLikeParameters: false,
    hasTagContainerParameters: false,
    hostname,
    identifierParamNames: [],
    method: "GET",
    pagePhase: "post_interaction",
    path: "/collect",
    queryParamNames: [],
    requestHostname: hostname,
    requestId: eventId,
    requestUrl: `https://${hostname}/collect`,
    resourceType: "fetch",
    scenario,
    sourceScanner: "consent_flow_runtime",
    thirdParty: true,
    timestampMs: 20,
  };
}

function cookieEvent(eventId: string, scenario: CookieEvent["scenario"], cookieName: string): CookieEvent {
  return {
    confidence: 0.8,
    consentStateAtTime: scenario === "accept_all_flow" ? "post_accept" : "post_reject",
    cookieClassificationBasis: ["test"],
    cookieDomain: ".example.com",
    cookieName,
    cookieParty: "third_party",
    cookiePath: "/",
    cookiePurpose: cookieName === "_ga" ? "analytics" : "advertising",
    directVsInferred: "direct",
    eventId,
    eventType: "cookie",
    evidenceRefs: [],
    firstParty: false,
    hostname: "example.com",
    operation: "browser_snapshot",
    pagePhase: "post_interaction",
    scenario,
    sourceScanner: "consent_flow_runtime",
    thirdParty: true,
    timestampMs: 30,
    valueRedacted: true,
    vendorAssociated: true,
  };
}
