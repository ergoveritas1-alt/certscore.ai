import assert from "node:assert/strict";
import test from "node:test";
import {
  postRefusalEvidencePacketSchema,
  projectPostRefusalEvidenceForReport,
  type PostRefusalEvidencePacket,
} from "@certscore/contracts";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import {
  buildNormalizedConcerns,
  buildUnifiedFindingCandidatesFromConcerns,
} from "./normalized-concerns";
import { buildPostRefusalRuntimeProjection } from "./post-refusal-runtime-projection";
import { deriveRegulatoryCoverageScore } from "./regulatory-coverage-score";

const VALUE_HASH = "a".repeat(64);
const STORAGE_IDENTITY_HASH = "d".repeat(64);

function packet(overrides: Partial<PostRefusalEvidencePacket> = {}) {
  return postRefusalEvidencePacketSchema.parse({
    artifactVersion: "certscore.post_refusal_evidence.v1",
    artifactOnly: true,
    productionProjectable: true,
    scanId: "scan-post-refusal-canonical",
    parentScanId: "scan-post-refusal-canonical",
    targetUrl: "https://example.test/",
    normalizedUrl: "https://example.test/",
    observationBranch: "reject_only",
    phase: "post_action",
    consentAction: "reject",
    startedAt: "2026-08-26T00:00:00.000Z",
    completedAt: "2026-08-26T00:00:02.000Z",
    resolver: {
      found: true,
      method: "cmp_registry_recipe",
      confidence: 1,
      recipeId: "onetrust-reject-all-v1",
      cmpId: "onetrust",
    },
    refusalRegistration: {
      status: "confirmed",
      refusalExercised: true,
      actionDispatchedAtMs: 500,
      refusalRegisteredAtMs: 550,
      witnesses: [{
        witnessType: "cmp_cookie_state",
        observedAtMs: 550,
        key: "OptanonConsent",
        observedStateHash: VALUE_HASH,
      }],
    },
    observationWindowMs: 8_000,
    timing: {
      dispatchDelayMs: 2_000,
      navigationMs: 200,
      resolverMs: 20,
      confirmationMs: 50,
      observationMs: 200,
      totalMs: 2_470,
      readyAtMs: 2_470,
    },
    network: {
      requests: [],
      postRefusalNonEssentialRequests: [],
      activeRequestIdsAtRefusalRegistration: [],
    },
    storage: {
      preActionCapturedAtMs: 450,
      postActionCapturedAtMs: 750,
      preAction: [],
      postAction: [],
      writesAfterRefusal: [],
      nonEssentialItemsPersistingAfterRefusal: [],
    },
    observations: [],
    cancellation: { requested: false, outcome: "not_requested" },
    limitations: [],
    ...overrides,
  });
}

function projectCanonical(inputPacket: PostRefusalEvidencePacket) {
  const reportProjection = projectPostRefusalEvidenceForReport({
    packet: inputPacket,
    packetSha256: "b".repeat(64),
  });
  const runtimeArtifacts = buildPostRefusalRuntimeProjection(reportProjection);
  const normalizedConcerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: [],
  });
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    normalizedConcerns,
    runtimeArtifacts,
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
  const postRejectRow = checklist.find((row) => row.id === "post_reject_tracking_reduction");
  assert.ok(postRejectRow);
  return {
    candidates: buildUnifiedFindingCandidatesFromConcerns(normalizedConcerns),
    checklist,
    normalizedConcerns,
    postRejectRow,
    reportProjection,
    runtimeArtifacts,
  };
}

test("confirmed post-refusal evidence reaches canonical concerns, findings, checklist, and score", () => {
  const activeRequest = {
    requestId: "request-after-refusal",
    sanitizedUrl: "https://analytics.example.test/collect",
    hostname: "analytics.example.test",
    resourceType: "fetch",
    startedAtMs: 670,
    completedAtMs: 690,
    inFlightAtRefusalRegistration: false,
    msOffsetFromRefusal: 120,
    vendor: "Example Analytics",
    purpose: "analytics" as const,
    nonEssential: true,
  };
  const inFlightRequest = {
    ...activeRequest,
    requestId: "request-already-in-flight",
    startedAtMs: 500,
    inFlightAtRefusalRegistration: true,
    msOffsetFromRefusal: 5,
  };
  const result = projectCanonical(packet({
    network: {
      requests: [activeRequest, inFlightRequest],
      postRefusalNonEssentialRequests: [activeRequest],
      activeRequestIdsAtRefusalRegistration: [inFlightRequest.requestId],
    },
    storage: {
      preActionCapturedAtMs: 450,
      postActionCapturedAtMs: 700,
      preAction: [{
        storageType: "cookie",
        name: "_example_analytics",
        identityBasis: "cookie_name_domain_path_partition",
        identityHash: STORAGE_IDENTITY_HASH,
        valueHash: VALUE_HASH,
        vendor: "Example Analytics",
        purpose: "analytics",
        nonEssential: true,
      }],
      postAction: [{
        storageType: "cookie",
        name: "_example_analytics",
        identityBasis: "cookie_name_domain_path_partition",
        identityHash: STORAGE_IDENTITY_HASH,
        valueHash: VALUE_HASH,
        vendor: "Example Analytics",
        purpose: "analytics",
        nonEssential: true,
      }],
      writesAfterRefusal: [{
        storageType: "local_storage",
        name: "analytics_state",
        observedAtMs: 700,
        msOffsetFromRefusal: 150,
        vendor: "Example Analytics",
        purpose: "analytics",
        nonEssential: true,
      }],
      nonEssentialItemsPersistingAfterRefusal: [{
        storageType: "cookie",
        name: "_example_analytics",
        identityBasis: "cookie_name_domain_path_partition",
        identityHash: STORAGE_IDENTITY_HASH,
        valueHash: VALUE_HASH,
        vendor: "Example Analytics",
        purpose: "analytics",
        nonEssential: true,
      }],
    },
    tcf: {
      postRefusalState: {
        observedAtMs: 710,
        eventStatus: "useractioncomplete",
        apiSuccess: true,
        tcStringHash: "c".repeat(64),
        tcStringParseStatus: "parsed_v2",
        purposeGrantedIds: [1],
        purposeGrantSource: "tc_string",
      },
    },
    observations: [
      {
        observationType: "post_refusal_non_essential_activity",
        observedAtMs: 670,
        requestId: activeRequest.requestId,
        msOffsetFromRefusal: 120,
        vendor: "Example Analytics",
        evidenceKeys: ["network.postRefusalNonEssentialRequests"],
      },
      {
        observationType: "pre_consent_storage_not_cleared",
        observedAtMs: 700,
        storageType: "cookie",
        storageName: "_example_analytics",
        storageIdentityHash: STORAGE_IDENTITY_HASH,
        storageValueHash: VALUE_HASH,
        msOffsetFromRefusal: 150,
        vendor: "Example Analytics",
        evidenceKeys: ["storage.nonEssentialItemsPersistingAfterRefusal"],
      },
      {
        observationType: "refusal_signal_contradicts_action",
        observedAtMs: 710,
        msOffsetFromRefusal: 160,
        evidenceKeys: ["tcf.postRefusalTcString"],
      },
    ],
  }));

  assert.equal(result.reportProjection.postRefusalActivity.length, 2);
  assert.equal(
    result.reportProjection.postRefusalActivity.some((row) => row.requestId === inFlightRequest.requestId),
    false,
  );
  assert.deepEqual(
    result.normalizedConcerns.map((concern) => concern.originKey).sort(),
    [
      "privacy.post_refusal_non_essential_activity",
      "privacy.pre_consent_storage_not_cleared",
      "privacy.refusal_signal_contradicts_action",
    ],
  );
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.normalizedConcern.suggestedUnifiedFindingId).sort(),
    [
      "post_refusal_non_essential_activity",
      "pre_consent_storage_not_cleared",
      "refusal_signal_contradicts_action",
    ],
  );
  assert.equal(result.postRejectRow.status, "Gap observed");
  const score = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [result.postRejectRow],
  });
  assert.equal(score.score, 94);
});

test("exact unchanged storage persistence is factual, review-only, and score-neutral", () => {
  const persistedItem = {
    storageType: "cookie" as const,
    name: "_example_analytics",
    hostname: "example.test",
    identityBasis: "cookie_name_domain_path_partition" as const,
    identityHash: STORAGE_IDENTITY_HASH,
    valueHash: VALUE_HASH,
    vendor: "Example Analytics",
    purpose: "analytics" as const,
    nonEssential: true,
  };
  const result = projectCanonical(packet({
    storage: {
      preActionCapturedAtMs: 450,
      postActionCapturedAtMs: 700,
      preAction: [persistedItem],
      postAction: [persistedItem],
      writesAfterRefusal: [],
      nonEssentialItemsPersistingAfterRefusal: [persistedItem],
    },
    observations: [{
      observationType: "pre_consent_storage_not_cleared",
      observedAtMs: 700,
      hostname: "example.test",
      storageType: "cookie",
      storageName: "_example_analytics",
      storageIdentityHash: STORAGE_IDENTITY_HASH,
      storageValueHash: VALUE_HASH,
      msOffsetFromRefusal: 150,
      vendor: "Example Analytics",
      evidenceKeys: ["storage.nonEssentialItemsPersistingAfterRefusal"],
    }],
  }));

  assert.deepEqual(result.reportProjection.preConsentStorageNotCleared, [{
    category: "analytics",
    exactIdentityVerified: true,
    hostname: "example.test",
    name: "_example_analytics",
    nonEssential: true,
    sameValueHashVerified: true,
    storageType: "cookie",
    vendor: "Example Analytics",
  }]);
  assert.equal(result.normalizedConcerns.length, 1);
  assert.equal(
    result.normalizedConcerns[0]?.title,
    "Same non-essential identifier remained stored after refusal",
  );
  assert.match(result.normalizedConcerns[0]?.description ?? "", /does not establish active post-refusal use/);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.postRejectRow.status, "Review signal");
  assert.match(result.postRejectRow.note, /does not establish active post-refusal use/);
  assert.equal(result.postRejectRow.criticalEvidence?.retainedEvidence?.scoreEffect, "none");
  const cleanBaseline = projectCanonical(packet());
  const scoreWithPersistence = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: result.checklist,
  });
  const scoreWithCleanRefusal = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: cleanBaseline.checklist,
  });
  assert.equal(scoreWithPersistence.score, scoreWithCleanRefusal.score);
});

test("a persisted legacy projection without exact storage identity fails closed", () => {
  const runtimeArtifacts = buildPostRefusalRuntimeProjection({
    ...projectPostRefusalEvidenceForReport({ packet: packet() }),
    status: "confirmed_observation",
    observationCount: 1,
    preConsentStorageNotCleared: [{
      category: "analytics",
      exactIdentityVerified: false,
      hostname: "example.test",
      name: "_legacy_analytics",
      nonEssential: true,
      sameValueHashVerified: true,
      storageType: "cookie",
      vendor: "Example Analytics",
    }],
  });
  assert.ok("postRefusalEvidenceProjection" in runtimeArtifacts);
  assert.ok(runtimeArtifacts.postRefusalEvidenceProjection);
  assert.ok(runtimeArtifacts.postRejectTrackingReductionEvidence);

  assert.deepEqual(
    runtimeArtifacts.postRefusalEvidenceProjection?.preConsentStorageNotCleared,
    [{
      category: "analytics",
      exactIdentityVerified: false,
      hostname: "example.test",
      name: "_legacy_analytics",
      nonEssential: true,
      sameValueHashVerified: true,
      storageType: "cookie",
      vendor: "Example Analytics",
    }],
  );
  assert.equal(
    runtimeArtifacts.postRejectTrackingReductionEvidence?.preConsentStorageNotClearedCount,
    0,
  );
  assert.equal(
    runtimeArtifacts.postRejectTrackingReductionEvidence?.reductionEvaluationStatus,
    "no_post_reject_non_essential_observed",
  );
});

test("confirmed clean refusal remains score-neutral", () => {
  const result = projectCanonical(packet());
  assert.equal(result.normalizedConcerns.length, 0);
  assert.equal(result.postRejectRow.status, "Not observed");
  assert.equal(deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [result.postRejectRow],
  }).score, 100);
});

test("unconfirmed refusal never projects a concern or finding", () => {
  const result = projectCanonical(packet({
    productionProjectable: false,
    resolver: {
      found: false,
      method: "cmp_registry_recipe",
      confidence: 0,
      recipeId: "unknown-cmp",
      reason: "control_not_found",
    },
    refusalRegistration: {
      status: "unconfirmed",
      refusalExercised: false,
      reason: "control_not_found",
      witnesses: [],
    },
  }));
  assert.equal(result.reportProjection.productionProjectable, false);
  assert.equal(result.normalizedConcerns.length, 0);
  assert.equal(result.candidates.length, 0);
  assert.notEqual(result.postRejectRow.status, "Gap observed");
});

test("timed-out Reject Path is retained as a score-neutral coverage limitation", () => {
  const runtimeArtifacts = buildPostRefusalRuntimeProjection(null, {
    contractVersion: "certscore.post_refusal_lane_outcome.v1",
    completedAt: "2026-08-26T00:00:04.000Z",
    evidenceJoined: false,
    maxTailWaitMs: 6_000,
    status: "timed_out",
    limitationCode: "reject_path_timeout",
  });
  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: [],
  });

  assert.deepEqual(runtimeArtifacts.postRefusalObservationCoverage, {
    completedAt: "2026-08-26T00:00:04.000Z",
    evidenceJoined: false,
    limitationCode: "reject_path_timeout",
    maxTailWaitMs: 6_000,
    status: "limited",
  });
  assert.equal(concerns.length, 0);
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    normalizedConcerns: concerns,
    runtimeArtifacts,
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
  const postRejectRow = checklist.find((row) => row.id === "post_reject_tracking_reduction");
  assert.ok(postRejectRow);
  assert.notEqual(postRejectRow.status, "Gap observed");
  assert.match(JSON.stringify(postRejectRow), /six-second post-primary allowance/);
});

test("complete no-Reject inventory makes Reject Path non-applicable without a coverage warning", () => {
  const runtimeArtifacts = buildPostRefusalRuntimeProjection(null, {
    contractVersion: "certscore.post_refusal_lane_outcome.v1",
    completedAt: "2026-08-26T00:00:02.000Z",
    evidenceJoined: false,
    maxTailWaitMs: 6_000,
    status: "not_applicable",
    limitationCode: "reject_control_not_observed",
  });

  assert.deepEqual(runtimeArtifacts.postRefusalObservationCoverage, {
    completedAt: "2026-08-26T00:00:02.000Z",
    evidenceJoined: false,
    limitationCode: "reject_control_not_observed",
    maxTailWaitMs: 6_000,
    status: "not_applicable",
  });
  assert.equal("postRejectTrackingReductionEvidence" in runtimeArtifacts, false);
});
