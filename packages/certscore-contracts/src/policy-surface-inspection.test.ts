import assert from "node:assert/strict";
import test from "node:test";
import { derivePolicySurfaceInspectionOutcome } from "./index";

function moduleRun(status: "completed" | "partial" | "failed" | "skipped_budget") {
  return {
    moduleName: "policySurfaceScanner",
    status,
    startedAt: "2026-07-17T00:00:00.000Z",
    completedAt: "2026-07-17T00:00:01.000Z",
    durationMs: 1_000,
    evidenceRefs: [],
    errors: status === "completed" ? [] : ["bounded fixture failure"],
  };
}

test("policy inspection distinguishes a completed negative search from limited coverage", () => {
  const completed = derivePolicySurfaceInspectionOutcome({
    modulesRun: [moduleRun("completed")],
    policySurfaceObservations: [],
  });
  assert.equal(completed.outcome, "no_privacy_policy_observed_complete_coverage");
  assert.equal(completed.coverageStatus, "complete");
  assert.equal(completed.linkDiscoveryCoverageStatus, "complete");
  assert.equal(completed.documentRetrievalCoverageStatus, "insufficient");
  assert.equal(completed.inspectionCompleted, true);
  assert.deepEqual(completed.limitationKeys, []);

  const failed = derivePolicySurfaceInspectionOutcome({
    modulesRun: [moduleRun("failed")],
    policySurfaceObservations: [],
  });
  assert.equal(failed.outcome, "indeterminate_limited_coverage");
  assert.equal(failed.coverageStatus, "limited");
  assert.equal(failed.linkDiscoveryCoverageStatus, "limited");
  assert.equal(failed.documentRetrievalCoverageStatus, "limited");
  assert.equal(failed.inspectionCompleted, false);
  assert.deepEqual(failed.limitationKeys, ["policy_surface_inspection_runtime_failed"]);

  const partial = derivePolicySurfaceInspectionOutcome({
    modulesRun: [moduleRun("partial")],
    policySurfaceObservations: [],
  });
  assert.equal(partial.outcome, "indeterminate_limited_coverage");
  assert.equal(partial.coverageStatus, "limited");
  assert.equal(partial.linkDiscoveryCoverageStatus, "limited");
  assert.equal(partial.inspectionCompleted, false);
  assert.deepEqual(partial.limitationKeys, ["policy_surface_inspection_runtime_partial"]);
});

test("retained privacy-policy evidence remains complete when later policy work is limited", () => {
  const outcome = derivePolicySurfaceInspectionOutcome({
    modulesRun: [moduleRun("skipped_budget")],
    policySurfaceObservations: [{
      observationId: "privacy-fixture",
      sourceScanner: "policy_surface",
      scenario: "policy_surface_review",
      consentStateAtTime: "not_applicable",
      url: "https://example.test/privacy",
      normalizedUrl: "https://example.test/privacy",
      surfaceType: "privacy_policy",
      discoveryMethod: "footer_link",
      status: "fetched",
      evidenceRefs: [],
      artifactRefs: [],
      boundedTextExcerptIds: [],
      observedTopics: [],
      article13DisclosureSignals: [],
      discardedArticle13DisclosureSignals: [],
      gdprTransparencyTopicCandidates: [],
      retainedPolicySections: [],
      policyCookieDisclosures: [],
      retainedArticle13SectionEvidence: [],
      mentionedVendors: [],
      mentionedPurposes: [],
      mentionedRights: [],
      mentionedControls: [],
      assistMetadata: [],
      confidence: 0.9,
      directVsInferred: "direct",
    }],
  });

  assert.equal(outcome.outcome, "privacy_policy_observed");
  assert.equal(outcome.coverageStatus, "complete");
  assert.equal(outcome.linkDiscoveryCoverageStatus, "complete");
  assert.equal(outcome.documentRetrievalCoverageStatus, "usable");
  assert.equal(outcome.inspectionCompleted, false);
  assert.equal(outcome.privacyPolicyObserved, true);
  assert.deepEqual(outcome.observedSurfaceTypes, ["privacy_policy"]);
});

test("an observed policy link does not claim usable document coverage", () => {
  const outcome = derivePolicySurfaceInspectionOutcome({
    modulesRun: [moduleRun("completed")],
    policySurfaceObservations: [{
      observationId: "privacy-link-only",
      sourceScanner: "policy_surface",
      scenario: "policy_surface_review",
      consentStateAtTime: "not_applicable",
      url: "https://example.test/privacy",
      normalizedUrl: "https://example.test/privacy",
      surfaceType: "privacy_policy",
      discoveryMethod: "footer_link",
      status: "observed",
      linkObservationState: "observed",
      documentFetchState: "not_attempted",
      documentEvaluationState: "not_attempted",
      evidenceRefs: [],
      artifactRefs: [],
      boundedTextExcerptIds: [],
      observedTopics: [],
      article13DisclosureSignals: [],
      discardedArticle13DisclosureSignals: [],
      gdprTransparencyTopicCandidates: [],
      retainedPolicySections: [],
      policyCookieDisclosures: [],
      retainedArticle13SectionEvidence: [],
      mentionedVendors: [],
      mentionedPurposes: [],
      mentionedRights: [],
      mentionedControls: [],
      assistMetadata: [],
      confidence: 0.9,
      directVsInferred: "direct",
    }],
  });

  assert.equal(outcome.outcome, "privacy_policy_observed");
  assert.equal(outcome.coverageStatus, "limited");
  assert.equal(outcome.linkDiscoveryCoverageStatus, "complete");
  assert.equal(outcome.documentRetrievalCoverageStatus, "insufficient");
  assert.deepEqual(outcome.limitationKeys, [
    "privacy_policy_link_observed_document_not_retained",
  ]);
});

test("a fetched privacy-policy index does not claim usable governing-document coverage", () => {
  const outcome = derivePolicySurfaceInspectionOutcome({
    modulesRun: [moduleRun("completed")],
    policySurfaceObservations: [{
      observationId: "privacy-index-only",
      sourceScanner: "policy_surface",
      scenario: "policy_surface_review",
      consentStateAtTime: "not_applicable",
      url: "https://example.test/privacy",
      normalizedUrl: "https://example.test/privacy",
      surfaceType: "privacy_policy",
      discoveryMethod: "footer_link",
      status: "fetched",
      documentRole: "policy_index",
      documentFetchState: "fetched",
      documentEvaluationState: "usable",
      evidenceRefs: [],
      artifactRefs: [],
      boundedTextExcerptIds: [],
      observedTopics: [],
      article13DisclosureSignals: [],
      discardedArticle13DisclosureSignals: [],
      gdprTransparencyTopicCandidates: [],
      retainedPolicySections: [],
      policyCookieDisclosures: [],
      retainedArticle13SectionEvidence: [],
      mentionedVendors: [],
      mentionedPurposes: [],
      mentionedRights: [],
      mentionedControls: [],
      assistMetadata: [],
      confidence: 0.9,
      directVsInferred: "direct",
    }],
  });

  assert.equal(outcome.outcome, "privacy_policy_observed");
  assert.equal(outcome.coverageStatus, "limited");
  assert.equal(outcome.documentRetrievalCoverageStatus, "insufficient");
  assert.deepEqual(outcome.limitationKeys, [
    "privacy_policy_link_observed_document_not_retained",
    "privacy_policy_index_retained_governing_document_unresolved",
  ]);
});

test("a directly observed privacy link remains observed when document retrieval fails", () => {
  const outcome = derivePolicySurfaceInspectionOutcome({
    modulesRun: [moduleRun("completed")],
    policySurfaceObservations: [{
      observationId: "privacy-link-fetch-failed",
      sourceScanner: "policy_surface",
      scenario: "policy_surface_review",
      consentStateAtTime: "not_applicable",
      url: "https://example.test/privacy",
      normalizedUrl: "https://example.test/privacy",
      surfaceType: "privacy_policy",
      discoveryMethod: "footer_link",
      status: "failed",
      linkObservationState: "observed",
      documentFetchState: "failed",
      documentEvaluationState: "not_attempted",
      evidenceRefs: [],
      artifactRefs: [],
      boundedTextExcerptIds: [],
      observedTopics: [],
      article13DisclosureSignals: [],
      discardedArticle13DisclosureSignals: [],
      gdprTransparencyTopicCandidates: [],
      retainedPolicySections: [],
      policyCookieDisclosures: [],
      retainedArticle13SectionEvidence: [],
      mentionedVendors: [],
      mentionedPurposes: [],
      mentionedRights: [],
      mentionedControls: [],
      assistMetadata: [],
      confidence: 0.9,
      directVsInferred: "direct",
    }],
  });

  assert.equal(outcome.outcome, "privacy_policy_observed");
  assert.equal(outcome.coverageStatus, "limited");
  assert.equal(outcome.linkDiscoveryCoverageStatus, "complete");
  assert.equal(outcome.documentRetrievalCoverageStatus, "insufficient");
  assert.equal(outcome.privacyPolicyObserved, true);
  assert.deepEqual(outcome.observedSurfaceTypes, ["privacy_policy"]);
  assert.deepEqual(outcome.limitationKeys, [
    "privacy_policy_link_observed_document_not_retained",
  ]);
});
