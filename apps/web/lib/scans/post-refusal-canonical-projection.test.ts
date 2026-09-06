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
import { assessRejectClickTracking } from "./reject-click-tracking-policy";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";

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
    actionControlProof: {
      contractVersion: "certscore.consent_action_control_proof.v1",
      action: "reject",
      observedAtMs: 490,
      accessibleLabel: "Reject all",
      labelSource: "visible_text",
      actionSemantics: "direct_label",
      classifierIntent: "reject",
      classifierConfidence: 1,
      matchedLocale: "en",
      matchStrength: "direct",
      classifierReasonCodes: ["matched_reject"],
      cmpId: "onetrust",
      recipeId: "onetrust-reject-all-v1",
      selectorHint: "#reject-all",
      visible: true,
      enabled: true,
      uniquelyActionable: true,
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
    result.candidates.map((candidate) => candidate.signalKey).sort(),
    [
      "privacy.post_refusal_non_essential_activity",
      "privacy.pre_consent_storage_not_cleared",
      "privacy.refusal_signal_contradicts_action",
    ],
  );
  assert.equal(result.postRejectRow.status, "Gap observed");
  const reductionEvidence = result.runtimeArtifacts.postRejectTrackingReductionEvidence as Record<string, unknown>;
  assert.equal(reductionEvidence.observationWindowMs, 8_000);
  assert.equal(reductionEvidence.resolverMethod, "cmp_registry_recipe");
  assert.equal(result.postRejectRow.criticalEvidence.retainedEvidence.observationWindowMs, 8_000);
  assert.equal(result.postRejectRow.criticalEvidence.retainedEvidence.resolverMethod, "cmp_registry_recipe");
  const score = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [result.postRejectRow],
  });
  assert.equal(score.score, 85);
});

test("confirmed TCF contradiction independently reaches a scored canonical checklist gap", () => {
  const result = projectCanonical(packet({
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
    observations: [{
      observationType: "refusal_signal_contradicts_action",
      observedAtMs: 710,
      msOffsetFromRefusal: 160,
      evidenceKeys: ["tcf.postRefusalTcString"],
    }],
  }));

  assert.deepEqual(
    result.normalizedConcerns.map((concern) => concern.originKey),
    ["privacy.refusal_signal_contradicts_action"],
  );
  assert.equal(result.postRejectRow.status, "Gap observed");
  assert.equal(result.postRejectRow.criticalEvidence.retainedEvidence.refusalSignalContradictsAction, true);
  assert.match(result.postRejectRow.note, /independent of network activity/);
  const score = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [result.postRejectRow],
  });
  assert.equal(score.score, 85);
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

test("completed after-click capture survives canonical projection without inventing registered refusal", () => {
  const request = { requestId: "after-click", sanitizedUrl: "https://analytics.example.test/collect",
    resourceType: "fetch", startedAtMs: 650, inFlightAtRefusalRegistration: false,
    nonEssential: true, purpose: "analytics" as const };
  const result = projectCanonical(packet({
    artifactVersion: "certscore.post_refusal_evidence.v2",
    completedAt: "2026-08-26T00:00:09.000Z",
    timing: { ...packet().timing, totalMs: 9000, readyAtMs: 9000, observationMs: 8000 },
    storage: { ...packet().storage, postActionCapturedAtMs: 8500 },
    productionProjectable: false,
    decisionEvidence: { policyVersion: "semantic_consent_registration.v2", decision: "unknown", basis: "unverified" },
    captureCoverage: { requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 0 },
    refusalRegistration: { status: "unconfirmed", refusalExercised: false, actionDispatchedAtMs: 500,
      reason: "cmp_rejection_state_not_observed", witnesses: [] },
    interactionDiagnostics: {
      navigation: { outcome: "completed", documentCommitted: true, finalUrlAuthorized: true },
      click: { outcome: "completed", reResolvedBeforeDispatch: false, confirmationCheckedAfterError: false },
    },
    afterActionCapture: { policyVersion: "bounded_after_action_capture.v1", action: "reject", activationStatus: "completed",
      actionDispatchedAtMs: 500, captureEndedAtMs: 8500, requestedWindowMs: 8000, stopReason: "window_elapsed",
      requestsDropped: 0, requestIds: [request.requestId], storageSnapshotRetained: true,
      storageWriteCoverage: "bounded_main_document_sample", storageWrites: [] },
    network: { requests: [request], postRefusalNonEssentialRequests: [], activeRequestIdsAtRefusalRegistration: [] },
  }));
  assert.equal(result.reportProjection.afterActionCapture?.activationStatus, "completed");
  assert.equal(result.reportProjection.afterActionRequests?.[0]?.requestId, request.requestId);
  assert.equal(result.reportProjection.registrationStatus, "unconfirmed");
  assert.deepEqual(result.postRejectRow.criticalEvidence.retainedEvidence.afterActionCapture, result.reportProjection.afterActionCapture);
  assert.equal(result.postRejectRow.criticalEvidence.retainedEvidence.sourcePacketSha256, result.reportProjection.packetSha256);
  assert.equal(result.normalizedConcerns.length, 0);
  assert.equal(result.candidates.length, 0);
  assert.notEqual(result.postRejectRow.status, "Gap observed");
  assert.equal(result.reportProjection.packetSha256, "b".repeat(64));
  const existingDeduction = {
    assessmentStatus: "gap_observed" as const, evidenceState: "observed" as const,
    criticalEvidence: { retainedEvidence: { httpProbeOutcome: "plaintext_response_served", httpProbeStatus: 200 } },
    id: "transport_security_http_redirect", status: "Gap observed" as const,
  };
  const before = deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: [existingDeduction] });
  const after = deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: [existingDeduction, result.postRejectRow] });
  assert.equal(before.score, 98);
  assert.equal(after.score, before.score, "An unverified decision must not restore independently deducted points");
});

function unverifiedRejectClickPacket() {
  const request = { requestId: "after-click-tracking", sanitizedUrl: "https://analytics.example.test/collect",
    resourceType: "fetch", startedAtMs: 650, inFlightAtRefusalRegistration: false,
    nonEssential: true, purpose: "analytics" as const, vendor: "Example Analytics" };
  return packet({
    artifactVersion: "certscore.post_refusal_evidence.v2",
    completedAt: "2026-08-26T00:00:09.000Z",
    timing: { ...packet().timing, totalMs: 9000, readyAtMs: 9000, observationMs: 8000 },
    storage: { ...packet().storage, postActionCapturedAtMs: 8500 },
    productionProjectable: false,
    resolver: { found: true, method: "canonical_consent_control_registry_recipe", confidence: 1, recipeId: "canonical-reject-v1" },
    actionControlProof: { ...packet().actionControlProof!, cmpId: undefined,
      frameIdentitySha256: "c".repeat(64), authorizedTargetSha256: "e".repeat(64) },
    decisionEvidence: { policyVersion: "semantic_consent_registration.v2", decision: "unknown", basis: "unverified" },
    captureCoverage: { requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 0 },
    refusalRegistration: { status: "unconfirmed", refusalExercised: false, actionDispatchedAtMs: 500,
      reason: "cmp_rejection_state_not_observed", witnesses: [] },
    interactionDiagnostics: {
      navigation: { outcome: "completed", documentCommitted: true, finalUrlAuthorized: true },
      click: { outcome: "completed", reResolvedBeforeDispatch: false, confirmationCheckedAfterError: false },
    },
    afterActionCapture: { policyVersion: "bounded_after_action_capture.v2", action: "reject", activationStatus: "completed",
      actionDispatchedAtMs: 500, captureEndedAtMs: 8500, requestedWindowMs: 8000, stopReason: "window_elapsed",
      requestsDropped: 0, requestIds: [request.requestId], requestAncestry: [{ requestId: request.requestId, rootStartedAtMs: 650 }],
      storageSnapshotRetained: true, storageWriteCoverage: "bounded_main_document_sample", storageWrites: [] },
    network: { requests: [request], postRefusalNonEssentialRequests: [], activeRequestIdsAtRefusalRegistration: [] },
    observations: [],
  });
}

test("verified generic Reject click plus tracking produces one scored review without claiming registered refusal", () => {
  const result = projectCanonical(unverifiedRejectClickPacket());
  assert.equal(result.reportProjection.registrationStatus, "unconfirmed");
  assert.equal(result.reportProjection.refusalExercised, false);
  assert.equal(result.reportProjection.productionProjectable, false);
  assert.equal(result.normalizedConcerns.length, 1);
  assert.equal(result.normalizedConcerns[0]?.regulatoryChecklistEligibility, "review_signal");
  assert.equal(result.normalizedConcerns[0]?.suggestedUnifiedFindingId, "post_reject_click_tracking");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.postRejectRow.assessmentStatus, "review_signal");
  assert.match(JSON.stringify(result.postRejectRow), /Refusal registration remained unverified/);
  const score = deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: [result.postRejectRow] });
  assert.equal(score.score, 88);
  assert.equal(score.scoreVersion, "gdpr-eprivacy-posture.v13");
  const retained = result.postRejectRow.criticalEvidence?.retainedEvidence as Record<string, unknown>;
  assert.equal(retained.rejectInteractionConfirmed, false);
  assert.ok("rejectClickTrackingAssessment" in result.runtimeArtifacts);
  assert.deepEqual(retained.rejectClickTrackingAssessment, result.runtimeArtifacts.rejectClickTrackingAssessment);
  assert.equal(result.runtimeArtifacts.rejectClickTrackingAssessment?.sourcePacketSha256, "b".repeat(64));
  const displays = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: result.runtimeArtifacts,
    reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  const display = displays.find((row) => row.unifiedFindingId === "post_reject_click_tracking");
  assert.equal(display?.presentationDecision.status, "surface", JSON.stringify(display?.presentationDecision));
  assert.match(JSON.stringify(display), /decision unverified/);

  const existing = { assessmentStatus: "gap_observed", evidenceState: "observed", id: "transport_security_http_redirect",
    criticalEvidence: { retainedEvidence: { httpProbeOutcome: "plaintext_response_served", httpProbeStatus: 200 } }, status: "Gap observed" };
  assert.equal(deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: [existing, result.postRejectRow] }).score, 86);
  const confirmed = { ...result.postRejectRow, assessmentStatus: "gap_observed", status: "Gap observed",
    criticalEvidence: { retainedEvidence: { rejectInteractionConfirmed: true, scoreEffect: "canonical_post_refusal_policy" } } };
  assert.equal(deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: [confirmed, result.postRejectRow] }).score, 88);
  const contradiction = { ...confirmed, criticalEvidence: { retainedEvidence: {
    rejectInteractionConfirmed: true, refusalSignalContradictsAction: true,
  } } };
  assert.equal(deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: [contradiction, result.postRejectRow] }).score, 85);
});

test("new click policy fails closed for incomplete, unsupported, ambiguous or pre-click evidence", () => {
  const projection = projectPostRefusalEvidenceForReport({ packet: unverifiedRejectClickPacket(), packetSha256: "b".repeat(64) });
  const capture = projection.afterActionCapture!;
  const request = projection.afterActionRequests![0]!;
  const invalid = [
    { ...projection, packetSha256: undefined },
    { ...projection, actionControlProof: undefined },
    { ...projection, actionControlProof: { ...projection.actionControlProof, authorizedTargetSha256: undefined } },
    { ...projection, actionControlProof: { ...projection.actionControlProof, frameIdentitySha256: undefined } },
    { ...projection, afterActionCapture: { ...capture, action: "accept" } },
    { ...projection, afterActionCapture: { ...capture, policyVersion: "bounded_after_action_capture.v1" } },
    { ...projection, afterActionCapture: { ...capture, stopReason: "aborted" } },
    { ...projection, afterActionCapture: { ...capture, stopReason: "target_changed" } },
    { ...projection, afterActionCapture: { ...capture, stopReason: "click_uncertain", activationStatus: "uncertain" } },
    { ...projection, afterActionCapture: { ...capture, captureEndedAtMs: 8499 } },
    { ...projection, captureCoverage: { requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 1 } },
    { ...projection, afterActionCapture: { ...capture, requestsDropped: 1 } },
    { ...projection, afterActionCapture: { ...capture, requestAncestry: undefined } },
    ...[499, 500, 651].map((rootStartedAtMs) => ({ ...projection,
      afterActionCapture: { ...capture, requestAncestry: [{ requestId: request.requestId, rootStartedAtMs }] } })),
    ...["unknown", "consent_management", "security", "infrastructure"].map((purpose) => ({ ...projection,
      afterActionRequests: [{ ...request, purpose }] })),
    { ...projection, afterActionRequests: [{ ...request, nonEssential: false }] },
    { ...projection, registrationStatus: "aborted", status: "aborted" },
  ];
  for (const value of invalid) assert.equal(assessRejectClickTracking(value), null, JSON.stringify(value));
  const noRequests = { ...projection, afterActionRequests: [],
    afterActionCapture: { ...capture, requestIds: [], requestAncestry: [], storageWrites: [
      { storageType: "cookie", name: "receipt", nonEssential: true, observedAtMs: 700 },
    ] } };
  assert.equal(assessRejectClickTracking(noRequests), null, "Storage presence/writes alone do not establish this tracking-request finding");
  for (const runtimeArtifacts of [
    { ...buildPostRefusalRuntimeProjection(projection), postRefusalEvidenceProjection: undefined },
    { ...buildPostRefusalRuntimeProjection(projection), postRefusalEvidenceProjection: { ...projection, packetSha256: "f".repeat(64) } },
    { ...buildPostRefusalRuntimeProjection(projection), postRefusalEvidenceProjection: { ...projection, registrationStatus: "confirmed" } },
  ]) {
    assert.equal(buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] }).length, 0,
      "A stale/mismatched typed assessment cannot produce a concern");
  }
  const validPacket = unverifiedRejectClickPacket();
  assert.equal(postRefusalEvidencePacketSchema.safeParse({ ...validPacket,
    interactionDiagnostics: { ...validPacket.interactionDiagnostics,
      navigation: { outcome: "completed", documentCommitted: true, finalUrlAuthorized: false } },
  }).success, false);
  const legacyOnly = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: false, normalizedConcerns: [], runtimeArtifacts: buildPostRefusalRuntimeProjection(projection),
    scanCompleted: true, snapshot: {},
  });
  assert.notEqual(legacyOnly.post_reject_tracking_reduction?.status, "Review signal",
    "Display/checklist may not bypass normalized concern policy");
});

test("click assessment bounds repeated metadata without discarding retained requests", () => {
  const projection = projectPostRefusalEvidenceForReport({ packet: unverifiedRejectClickPacket(), packetSha256: "b".repeat(64) });
  const requests = Array.from({ length: 12 }, (_, index) => ({ ...projection.afterActionRequests![0]!,
    requestId: `tracking-${index}`, startedAtMs: 650 + index }));
  const source = { ...projection, afterActionRequests: requests, afterActionCapture: {
    ...projection.afterActionCapture!, requestIds: requests.map((row) => row.requestId),
    requestAncestry: requests.map((row) => ({ requestId: row.requestId, rootStartedAtMs: row.startedAtMs })),
  } };
  const assessment = assessRejectClickTracking(source);
  assert.equal(assessment?.eligibleRequestCount, 12);
  assert.equal(assessment?.requests.length, 8);
  assert.equal(source.afterActionRequests.length, 12);
});

test("a review label or score marker without a verified typed click assessment is score-neutral", () => {
  const valid = projectCanonical(unverifiedRejectClickPacket()).postRejectRow;
  for (const assessment of [undefined, { policyVersion: "reject_click_tracking.v1" }]) {
    const row = { ...valid, criticalEvidence: { retainedEvidence: {
      scoreEffect: "canonical_reject_click_tracking_policy", rejectClickTrackingAssessment: assessment,
    } } };
    assert.equal(deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: [row] }).score, 100);
  }
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
  assert.match(JSON.stringify(postRejectRow), /configured post-primary allowance/);
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
test("legacy opaque refusal confirmation cannot survive canonical projection as a finding", () => {
  const legacy = packet();
  legacy.refusalRegistration.witnesses[0]!.expectedState = "canonical_cmp_consent_state_changed_after_reject";
  const result = projectCanonical(legacy);
  assert.equal(result.reportProjection.productionProjectable, false);
  assert.deepEqual(result.normalizedConcerns, []);
  assert.deepEqual(result.candidates, []);
});
