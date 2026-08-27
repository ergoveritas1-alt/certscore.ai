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
      postRefusalNonEssentialRequests: [activeRequest, inFlightRequest],
      activeRequestIdsAtRefusalRegistration: [inFlightRequest.requestId],
    },
    storage: {
      preAction: [],
      postAction: [],
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
        valueHash: VALUE_HASH,
        vendor: "Example Analytics",
        purpose: "analytics",
        nonEssential: true,
      }],
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
        storageName: "_example_analytics",
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
