import assert from "node:assert/strict";
import test from "node:test";
import {
  policyModelReviewArtifactSchema,
  POLICY_REVIEW_TOPIC_DEFINITIONS
} from "@certscore/contracts";
import { getProductionPolicyModelReviewRevision } from "./policy-model-review-revision";

function artifact(cacheKey = "a".repeat(64)) {
  return policyModelReviewArtifactSchema.parse({
    contractVersion: "policy_model_review.v2",
    mode: "enforced",
    status: "completed",
    scanId: "scan-1",
    cacheKey,
    rows: Object.keys(POLICY_REVIEW_TOPIC_DEFINITIONS).map((topic) => ({
      topic,
      status: "observed",
      confidence: 0.95,
      sourceDocumentIds: ["policy-1"],
      sourceUrls: ["https://example.test/privacy"],
      evidenceExcerpts: ["Direct retained policy evidence."],
      conflictingExcerpts: [],
      reasonCodes: ["policy_review_invariants_applied_v1"],
      rationale: "Direct retained evidence passed the production invariants."
    })),
    deterministicLegalFrameworkSignals: [],
    deterministicPolicyReviewSignals: [],
    failureReason: null,
    provenance: {
      role: "review",
      provider: "openai",
      requestedModel: "gpt-5.4-mini",
      resolvedModel: "gpt-5.4-mini",
      taskType: "policy_semantic_review",
      promptVersion: "policy_semantic_review.v4",
      schemaVersion: "policy_semantic_review_output.v2",
      inputRefs: [],
      outputRefs: [],
      contentHash: "b".repeat(64),
      confidence: 0.95,
      reasonCodes: ["approved_precision_first_production_projection_v1"],
      uncertaintyNotes: [],
      latencyMs: 1,
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      usedForProductionProjection: true
    },
    productionEligible: true
  });
}

test("returns a stable sentinel without a production-projectable review", () => {
  assert.equal(
    getProductionPolicyModelReviewRevision(null),
    "no-production-policy-model-review"
  );
  assert.equal(
    getProductionPolicyModelReviewRevision({
      policyModelReviewArtifact: {
        cacheKey: "unvalidated"
      }
    }),
    "no-production-policy-model-review"
  );
});

test("changes the report revision when a production review changes", () => {
  const first = getProductionPolicyModelReviewRevision({
    policyModelReviewArtifact: artifact()
  });
  const second = getProductionPolicyModelReviewRevision({
    policy_model_review_artifact: artifact("c".repeat(64))
  });

  assert.match(first, /^production-policy-model-review:a{64}:/);
  assert.match(second, /^production-policy-model-review:c{64}:/);
  assert.notEqual(first, second);
});
