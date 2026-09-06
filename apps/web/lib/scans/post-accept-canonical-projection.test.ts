import assert from "node:assert/strict";
import test from "node:test";
import {
  postAcceptEvidencePacketSchema,
  projectPostAcceptEvidenceForReport,
  type PostAcceptEvidencePacket,
} from "@certscore/contracts";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import {
  buildNormalizedConcerns,
  buildUnifiedFindingCandidatesFromConcerns,
} from "./normalized-concerns";
import { buildPostAcceptRuntimeProjection } from "./post-accept-runtime-projection";
import { deriveRegulatoryCoverageScore } from "./regulatory-coverage-score";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";

function packet(overrides: Partial<PostAcceptEvidencePacket> = {}) {
  return postAcceptEvidencePacketSchema.parse({
    artifactVersion: "certscore.post_accept_evidence.v1",
    artifactOnly: true,
    productionProjectable: true,
    scanId: "scan-post-accept-canonical",
    parentScanId: "scan-post-accept-canonical",
    targetUrl: "https://example.test/",
    normalizedUrl: "https://example.test/",
    observationBranch: "accept_only",
    phase: "post_action",
    consentAction: "accept",
    startedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-09-01T00:00:02.000Z",
    resolver: {
      found: true,
      method: "cmp_registry_recipe",
      confidence: 1,
      recipeId: "canonical-cmp:fixture:accept:v1",
      cmpId: "fixture",
    },
    actionControlProof: {
      contractVersion: "certscore.consent_action_control_proof.v1",
      action: "accept",
      observedAtMs: 490,
      accessibleLabel: "Accept all",
      labelSource: "visible_text",
      actionSemantics: "direct_label",
      classifierIntent: "accept",
      classifierConfidence: 1,
      matchedLocale: "en",
      matchStrength: "direct",
      classifierReasonCodes: ["matched_accept"],
      cmpId: "fixture",
      recipeId: "canonical-cmp:fixture:accept:v1",
      selectorHint: "#accept-all",
      visible: true,
      enabled: true,
      uniquelyActionable: true,
    },
    acceptanceRegistration: {
      status: "confirmed",
      acceptanceExercised: true,
      actionDispatchedAtMs: 500,
      acceptanceRegisteredAtMs: 550,
      witnesses: [{
        witnessType: "cmp_storage_state",
        observedAtMs: 550,
        key: "fixture-consent",
        expectedState: "granted",
        observedStateHash: "a".repeat(64),
        corroboratingOnly: false,
      }],
    },
    observationWindowMs: 8_000,
    timing: {
      dispatchDelayMs: 1_000,
      navigationMs: 200,
      resolverMs: 20,
      confirmationMs: 50,
      observationMs: 200,
      totalMs: 1_470,
      readyAtMs: 1_470,
    },
    network: {
      requests: [],
      postAcceptNonEssentialRequests: [],
      activeRequestIdsAtAcceptanceRegistration: [],
    },
    storage: {
      preAction: [],
      postAction: [],
      writesAfterAccept: [],
      itemsCreatedOrChangedAfterAccept: [],
    },
    observations: [],
    cancellation: { requested: false, outcome: "not_requested" },
    limitations: [],
    ...overrides,
  });
}

function canonicalProjection(inputPacket: PostAcceptEvidencePacket) {
  const projection = projectPostAcceptEvidenceForReport({
    packet: inputPacket,
    packetSha256: "b".repeat(64),
  });
  const runtimeArtifacts = buildPostAcceptRuntimeProjection(projection);
  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: [],
  });
  const displayPackets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: [],
    validationFindingLookup: new Map(),
  });
  return {
    candidates: buildUnifiedFindingCandidatesFromConcerns(concerns),
    concerns,
    displayPackets,
    projection,
    runtimeArtifacts,
  };
}

test("confirmed post-Accept activity reaches canonical review findings without score effect", () => {
  const request = {
    requestId: "post-accept-request",
    sanitizedUrl: "https://analytics.example.test/collect",
    hostname: "analytics.example.test",
    resourceType: "fetch",
    startedAtMs: 670,
    completedAtMs: 690,
    inFlightAtAcceptanceRegistration: false,
    msOffsetFromAccept: 120,
    vendor: "Example Analytics",
    purpose: "analytics" as const,
    nonEssential: true,
  };
  const result = canonicalProjection(packet({
    network: {
      requests: [request],
      postAcceptNonEssentialRequests: [request],
      activeRequestIdsAtAcceptanceRegistration: [],
    },
    observations: [{
      observationType: "post_accept_non_essential_activity",
      observedAtMs: 670,
      requestId: request.requestId,
      msOffsetFromAccept: 120,
      vendor: request.vendor,
      hostname: request.hostname,
      evidenceKeys: ["network.postAcceptNonEssentialRequests"],
    }],
  }));

  assert.deepEqual(result.concerns.map((concern) => concern.originKey), [
    "privacy.post_accept_consent_dependent_activity",
  ]);
  assert.equal(result.concerns[0]?.regulatoryChecklistEligibility, "review_signal");
  assert.equal(result.concerns[0]?.evidenceBundle.rawEvidence?.scoreEffect, "none");
  assert.deepEqual(result.candidates.map((candidate) => candidate.signalKey), [
    "privacy.post_accept_consent_dependent_activity",
  ]);
  const reportFinding = result.displayPackets.find((finding) =>
    finding.unifiedFindingId === "post_accept_consent_dependent_activity"
  );
  assert.equal(reportFinding?.presentationDecision.status, "surface");
  assert.equal(reportFinding?.severity, "low");

  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    normalizedConcerns: result.concerns,
    runtimeArtifacts: result.runtimeArtifacts,
    scanCompleted: true,
    snapshot: {},
  });
  const checklist = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes,
    projectedFindings: [],
    scanCompleted: true,
    unifiedFindings: [],
  });
  const scoreWithAccept = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: checklist,
  });
  const baselineOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    normalizedConcerns: [],
    runtimeArtifacts: {},
    scanCompleted: true,
    snapshot: {},
  });
  const baselineChecklist = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: baselineOutcomes,
    projectedFindings: [],
    scanCompleted: true,
    unifiedFindings: [],
  });
  const baselineScore = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: baselineChecklist,
  });
  assert.equal(scoreWithAccept.score, baselineScore.score);
});

test("non-projectable or unconfirmed Accept evidence cannot create a concern", () => {
  const result = canonicalProjection(packet({ productionProjectable: false }));
  assert.equal(result.concerns.length, 0);
  assert.equal(result.candidates.length, 0);
});

test("an Accept worker failure stays explicit limited coverage and cannot create successful consent or scoring evidence", () => {
  const runtimeArtifacts = buildPostAcceptRuntimeProjection(null, {
    contractVersion: "certscore.post_accept_lane_outcome.v1",
    completedAt: "2026-09-06T00:28:04.000Z",
    evidenceJoined: false,
    maxTailWaitMs: 6_000,
    status: "failed",
    limitationCode: "accept_path_worker_failed",
  });
  assert.equal(runtimeArtifacts.postAcceptObservationCoverage?.status, "limited");
  assert.equal(runtimeArtifacts.postAcceptObservationCoverage?.evidenceJoined, false);
  assert.equal(runtimeArtifacts.postAcceptObservationCoverage?.limitationCode, "accept_path_worker_failed");
  assert.equal("postAcceptBehaviorEvidence" in runtimeArtifacts, false);
  const concerns = buildNormalizedConcerns({ reviewFindingCandidates: [], runtimeArtifacts, validationFindings: [] });
  assert.equal(concerns.length, 0);
  assert.equal(buildUnifiedFindingCandidatesFromConcerns(concerns).length, 0);
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ coverageLimited: false, normalizedConcerns: concerns,
    runtimeArtifacts, scanCompleted: true, snapshot: {} });
  const baseline = deriveGdprEprivacyCoveragePolicyOutcomes({ coverageLimited: false, normalizedConcerns: [],
    runtimeArtifacts: {}, scanCompleted: true, snapshot: {} });
  const score = (coverageOutcomes: typeof outcomes) => deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy",
    rows: deriveGdprEprivacyCoverageChecklist({ coverageLimited: false, coverageOutcomes,
      projectedFindings: [], scanCompleted: true, unifiedFindings: [] }) });
  assert.equal(score(outcomes).score, score(baseline).score);
});

test("a joined packet with a truncated Accept window retains limited coverage", () => {
  const projection = projectPostAcceptEvidenceForReport({
    packet: packet({
      limitations: ["observer_result_budget_exhausted_after_confirmed_acceptance"],
      productionProjectable: false,
    }),
  });
  const runtimeArtifacts = buildPostAcceptRuntimeProjection(projection, {
    contractVersion: "certscore.post_accept_lane_outcome.v1",
    completedAt: "2026-09-01T00:00:02.000Z",
    evidenceJoined: true,
    maxTailWaitMs: 6_000,
    status: "joined",
  });
  const coverage = runtimeArtifacts.postAcceptObservationCoverage;

  assert.ok(coverage);
  assert.equal(coverage.status, "limited");
  assert.equal(coverage.evidenceJoined, true);
  assert.equal(coverage.limitationCode, "accept_observation_window_truncated");
});

test("exact activity after both Accept and Reject creates one corroborating review signal without scoring", () => {
  const request = {
    requestId: "post-accept-shared-request",
    sanitizedUrl: "https://analytics.example.test/collect",
    hostname: "analytics.example.test",
    resourceType: "fetch",
    startedAtMs: 670,
    inFlightAtAcceptanceRegistration: false,
    msOffsetFromAccept: 120,
    vendor: "Example Analytics",
    purpose: "analytics" as const,
    nonEssential: true,
  };
  const accepted = canonicalProjection(packet({
    network: {
      requests: [request],
      postAcceptNonEssentialRequests: [request],
      activeRequestIdsAtAcceptanceRegistration: [],
    },
    observations: [{
      observationType: "post_accept_non_essential_activity",
      observedAtMs: 670,
      requestId: request.requestId,
      msOffsetFromAccept: 120,
      vendor: request.vendor,
      hostname: request.hostname,
      evidenceKeys: ["network.postAcceptNonEssentialRequests"],
    }],
  }));
  const runtimeArtifacts = {
    ...accepted.runtimeArtifacts,
    postRefusalEvidenceProjection: {
      productionProjectable: true,
      refusalExercised: true,
      registrationStatus: "confirmed",
      postRefusalActivity: [{
        activityType: "network_request",
        category: "analytics",
        hostname: request.hostname,
        url: request.sanitizedUrl,
        vendor: request.vendor,
      }],
    },
  };
  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: [],
  });

  assert.deepEqual(concerns.map((concern) => concern.originKey), [
    "privacy.post_refusal_non_essential_activity",
    "privacy.post_accept_consent_dependent_activity",
    "privacy.accept_reject_outcomes_indistinguishable",
  ]);
  const corroborating = concerns.find((concern) =>
    concern.originKey === "privacy.accept_reject_outcomes_indistinguishable"
  );
  assert.equal(corroborating?.regulatoryChecklistEligibility, "review_signal");
  assert.equal(corroborating?.evidenceBundle.rawEvidence?.scoreEffect, "none");
  assert.equal(corroborating?.evidenceBundle.rawEvidence?.corroboratesPostRefusalFinding, true);
  assert.equal(corroborating?.title, "Shared observed activity after Accept and Reject");
  assert.equal(corroborating?.evidenceBundle.rawEvidence?.accept_reject_shared_observed_activity, true);
  assert.equal(corroborating?.evidenceBundle.rawEvidence?.accept_reject_outcomes_indistinguishable, undefined);
});

test("a confirmed contradictory acceptance signal remains a score-neutral review signal", () => {
  const result = canonicalProjection(packet({
    observations: [{
      observationType: "acceptance_signal_contradicts_action",
      observedAtMs: 700,
      msOffsetFromAccept: 150,
      evidenceKeys: ["post_accept_tcf_denial_state"],
    }],
  }));

  assert.deepEqual(result.concerns.map((concern) => concern.originKey), [
    "privacy.acceptance_signal_contradicts_action",
  ]);
  assert.equal(result.concerns[0]?.regulatoryChecklistEligibility, "review_signal");
  assert.equal(result.concerns[0]?.evidenceBundle.rawEvidence?.scoreEffect, "none");
});
test("legacy opaque accept confirmation cannot survive canonical projection as a finding", () => {
  const legacy = packet();
  legacy.acceptanceRegistration.witnesses[0]!.expectedState = "canonical_cmp_consent_state_changed_after_accept";
  const result = canonicalProjection(legacy);
  assert.equal(result.projection.productionProjectable, false);
  assert.deepEqual(result.concerns, []);
  assert.deepEqual(result.candidates, []);
});

test("registered contextual activation preserves canonical proof without fabricating confirmed consent or findings", () => {
  const source = packet();
  const result = canonicalProjection(packet({
    artifactVersion: "certscore.post_accept_evidence.v2",
    productionProjectable: false,
    decisionEvidence: { policyVersion: "semantic_consent_registration.v2", decision: "unknown", basis: "unverified" },
    captureCoverage: { requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 0 },
    acceptanceRegistration: { status: "unconfirmed", acceptanceExercised: false, actionDispatchedAtMs: 500,
      reason: "acceptance_registration_not_confirmed", witnesses: [] },
    actionControlProof: {
      ...source.actionControlProof!, contractVersion: "certscore.consent_action_control_proof.v2",
      actionSemantics: "registered_contextual_accept", accessibleLabel: "VERSTANDEN",
      classifierConfidence: 0.78, matchStrength: "contextual", matchedLocale: "de",
      cmpId: "BST DSGVO Cookie notice plugin, non-TCF", recipeId: "canonical-cmp:BST DSGVO Cookie notice plugin, non-TCF:accept:v2",
      selectorHint: ".bst-panel .bst-accept, .bst-panel .bst-accept-btn",
      frameIdentitySha256: "a".repeat(64), authorizedTargetSha256: "c".repeat(64),
      contextualApproval: { policyVersion: "registered_contextual_accept.v1",
        bannerSelector: ".bst-panel", expectedNormalizedLabel: "verstanden" },
    },
  }));
  assert.equal(result.projection.registrationStatus, "unconfirmed");
  assert.equal(result.projection.productionProjectable, false);
  assert.equal(result.projection.packetSha256, "b".repeat(64));
  assert.ok("postAcceptEvidenceProjection" in result.runtimeArtifacts);
  assert.ok("postAcceptBehaviorEvidence" in result.runtimeArtifacts);
  assert.equal(result.runtimeArtifacts.postAcceptEvidenceProjection?.actionControlProof?.contextualApproval?.policyVersion,
    "registered_contextual_accept.v1");
  assert.equal(result.runtimeArtifacts.postAcceptBehaviorEvidence?.acceptanceInteractionConfirmed, false);
  assert.deepEqual(result.concerns, []);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.displayPackets, []);
});
