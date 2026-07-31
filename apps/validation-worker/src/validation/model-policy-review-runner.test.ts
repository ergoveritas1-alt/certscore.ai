import assert from "node:assert/strict";
import test from "node:test";
import {
  policyModelReviewArtifactSchema,
  POLICY_REVIEW_TOPIC_DEFINITIONS
} from "@certscore/contracts";
import { summarizePolicyReviewArtifact } from "./model-policy-review";
import { finalizeArtifactProjectionMode } from "./model-policy-review-runner";

function artifact() {
  return policyModelReviewArtifactSchema.parse({
    contractVersion: "policy_model_review.v2",
    mode: "shadow",
    status: "completed",
    scanId: "scan-1",
    cacheKey: "a".repeat(64),
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
      promptVersion: "policy_semantic_review.v2",
      schemaVersion: "policy_semantic_review_output.v2",
      inputRefs: [],
      outputRefs: [],
      contentHash: "b".repeat(64),
      confidence: 0.95,
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

test("enforced invariant-verified review becomes production-projectable", () => {
  const finalized = finalizeArtifactProjectionMode({
    artifact: artifact(),
    mode: "enforced"
  });
  assert.equal(finalized.productionEligible, true);
  assert.equal(finalized.provenance.usedForProductionProjection, true);
  assert.ok(
    finalized.provenance.reasonCodes.includes(
      "approved_precision_first_production_projection_v1"
    )
  );
  assert.equal(summarizePolicyReviewArtifact(finalized).productionEligible, true);
});

test("shadow review remains non-production", () => {
  const finalized = finalizeArtifactProjectionMode({
    artifact: artifact(),
    mode: "shadow"
  });
  assert.equal(finalized.productionEligible, false);
  assert.equal(finalized.provenance.usedForProductionProjection, false);
  assert.equal(summarizePolicyReviewArtifact(finalized).productionEligible, false);
});
