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
