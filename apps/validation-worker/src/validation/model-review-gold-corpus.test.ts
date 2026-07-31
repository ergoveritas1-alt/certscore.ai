import assert from "node:assert/strict";
import test from "node:test";
import {
  policyModelReviewArtifactSchema,
  type PolicyReviewStatus,
  type PolicyReviewTopic
} from "@certscore/contracts";
import {
  assessPolicyReviewRolloutReadiness,
  policyReviewGoldCorpusSchema
} from "./model-review-gold-corpus";
import { POLICY_REVIEW_EVALUATION_TOPICS } from "./model-review-evaluation";

function scanId(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function labelsFor(index: number) {
  const status: PolicyReviewStatus =
    index % 2 === 0 ? "observed" : "not_observed_with_sufficient_coverage";
  return Object.fromEntries(
    POLICY_REVIEW_EVALUATION_TOPICS.map((topic) => [topic, status])
  ) as Record<PolicyReviewTopic, PolicyReviewStatus>;
}

function artifactFor(index: number) {
  const expected = labelsFor(index);
  return policyModelReviewArtifactSchema.parse({
    contractVersion: "policy_model_review.v2",
    mode: "shadow",
    status: "completed",
    scanId: scanId(index),
    cacheKey: "a".repeat(64),
    rows: POLICY_REVIEW_EVALUATION_TOPICS.map((topic) => ({
      topic,
      status: expected[topic],
      confidence: 0.99,
      sourceDocumentIds: [],
      sourceUrls: [],
      evidenceExcerpts: [],
      conflictingExcerpts: [],
      reasonCodes: ["gold_fixture"],
      rationale: "Deterministic gold-corpus fixture."
    })),
    deterministicLegalFrameworkSignals: [],
    failureReason: null,
    provenance: {
      role: "review",
      provider: "openai",
      requestedModel: "gpt-5.4-mini",
      resolvedModel: "gpt-5.4-mini-2026-03-17",
      taskType: "policy_semantic_review",
      promptVersion: "policy_semantic_review.v2",
      schemaVersion: "policy_semantic_review_output.v2",
      inputRefs: [],
      outputRefs: [],
      contentHash: "b".repeat(64),
      confidence: 0.99,
      reasonCodes: [],
      uncertaintyNotes: [],
      latencyMs: 1,
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      usedForProductionProjection: false
    },
    productionEligible: false
  });
}

function completeCorpus(
  reviewStatus:
    | "pending"
    | "provisional"
    | "human_adjudicated"
    | "independently_reviewed"
) {
  return policyReviewGoldCorpusSchema.parse({
    contractVersion: "policy_review_gold_corpus.v1",
    description: "Test-only policy review corpus.",
    entries: Array.from({ length: 25 }, (_, index) => ({
      caseId: `case-${index}`,
      scanId: scanId(index),
      targetUrl: `https://example-${index}.test/`,
      reviewStatus,
      reviewBasis:
        reviewStatus === "human_adjudicated"
          ? "human_model_comparison"
          : reviewStatus === "independently_reviewed"
            ? "human_evidence_only"
            : undefined,
      reviewer: reviewStatus === "pending" ? undefined : "independent-reviewer",
      reviewedAt: reviewStatus === "pending" ? undefined : "2026-07-25T20:00:00.000Z",
      evidenceNotes: reviewStatus === "pending" ? [] : ["Reviewed directly against retained evidence."],
      expected: reviewStatus === "pending" ? {} : labelsFor(index)
    }))
  });
}

test("a balanced, independently reviewed 25-case corpus can satisfy the rollout gate", () => {
  const corpus = completeCorpus("independently_reviewed");
  const artifactsByScanId = new Map(
    corpus.entries.map((entry, index) => [entry.scanId, artifactFor(index)])
  );
  const assessment = assessPolicyReviewRolloutReadiness({
    artifactsByScanId,
    corpus
  });
  assert.equal(assessment.ready, true);
  assert.equal(assessment.precisionFirstObservedProjectionReady, true);
  assert.equal(assessment.productionEligible, true);
  assert.equal(assessment.failures.length, 0);
  assert.equal(assessment.humanReviewedMetrics.observedPrecision, 1);
  assert.equal(assessment.humanReviewedMetrics.observedRecall, 1);
});

test("provisional labels never satisfy the human-reviewed rollout gate", () => {
  const corpus = completeCorpus("provisional");
  const artifactsByScanId = new Map(
    corpus.entries.map((entry, index) => [entry.scanId, artifactFor(index)])
  );
  const assessment = assessPolicyReviewRolloutReadiness({
    artifactsByScanId,
    corpus
  });
  assert.equal(assessment.ready, false);
  assert.equal(assessment.precisionFirstObservedProjectionReady, false);
  assert.equal(assessment.corpus.independentlyReviewedCaseCount, 0);
  assert.equal(assessment.corpus.provisionalCaseCount, 25);
  assert.ok(assessment.failures.some((failure) => failure.includes("Human adjudication requires")));
});

test("a fully human-adjudicated model comparison qualifies as reviewed calibration", () => {
  const corpus = completeCorpus("human_adjudicated");
  const artifactsByScanId = new Map(
    corpus.entries.map((entry, index) => [entry.scanId, artifactFor(index)])
  );
  const assessment = assessPolicyReviewRolloutReadiness({
    artifactsByScanId,
    corpus
  });
  assert.equal(assessment.ready, true);
  assert.equal(assessment.precisionFirstObservedProjectionReady, true);
  assert.equal(assessment.productionEligible, true);
  assert.equal(assessment.corpus.humanReviewedCaseCount, 25);
  assert.equal(assessment.corpus.humanModelComparisonCaseCount, 25);
  assert.equal(assessment.corpus.independentlyReviewedCaseCount, 0);
});
