import assert from "node:assert/strict";
import test from "node:test";
import {
  policyModelReviewArtifactSchema,
  POLICY_REVIEW_TOPIC_DEFINITIONS,
  type PolicyReviewStatus,
  type PolicyReviewTopic,
} from "@certscore/contracts";
import {
  isApprovedProductionPolicyReviewModel,
  routeNanoPolicyReview,
  summarizeNanoRouting,
} from "./policy-review-routing";

function artifact(overrides: Partial<Record<PolicyReviewTopic, {
  confidence: number;
  status: PolicyReviewStatus;
}>> = {}) {
  return policyModelReviewArtifactSchema.parse({
    contractVersion: "policy_model_review.v2",
    mode: "shadow",
    status: "completed",
    scanId: "scan-1",
    cacheKey: "a".repeat(64),
    rows: (Object.keys(POLICY_REVIEW_TOPIC_DEFINITIONS) as PolicyReviewTopic[]).map((topic) => ({
      topic,
      status: overrides[topic]?.status ?? "observed",
      confidence: overrides[topic]?.confidence ?? 0.99,
      sourceDocumentIds: ["policy-1"],
      sourceUrls: ["https://example.test/privacy"],
      evidenceExcerpts: ["Direct retained evidence."],
      conflictingExcerpts: [],
      reasonCodes: ["policy_review_invariants_applied_v1"],
      rationale: "Direct retained evidence supports this bounded classification.",
    })),
    deterministicLegalFrameworkSignals: [],
    deterministicPolicyReviewSignals: [],
    failureReason: null,
    provenance: {
      role: "review",
      provider: "openai",
      requestedModel: "gpt-5.4-nano",
      resolvedModel: "gpt-5.4-nano-2026-03-17",
      taskType: "policy_semantic_review",
      promptVersion: "policy_semantic_review.v5",
      schemaVersion: "policy_semantic_review_output.v2",
      inputRefs: [],
      outputRefs: [],
      contentHash: "b".repeat(64),
      confidence: 0.99,
      reasonCodes: ["nano_routine_shadow_non_projectable"],
      uncertaintyNotes: [],
      latencyMs: 1,
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      usedForProductionProjection: false,
    },
    productionEligible: false,
  });
}

test("only the approved Mini alias and snapshot may project", () => {
  assert.equal(isApprovedProductionPolicyReviewModel({
    requestedModel: "gpt-5.4-mini",
    resolvedModel: "gpt-5.4-mini-2026-03-17",
  }), true);
  assert.equal(isApprovedProductionPolicyReviewModel({
    requestedModel: "gpt-5.4-nano",
    resolvedModel: "gpt-5.4-nano-2026-03-17",
  }), false);
});

test("Nano routes low-confidence, absence, conflict, and runtime comparison to Mini", () => {
  const decisions = routeNanoPolicyReview(artifact({
    processing_purposes: { confidence: 0.69, status: "observed" },
    legal_basis: { confidence: 0.99, status: "not_observed_with_sufficient_coverage" },
    data_retention: { confidence: 0.99, status: "conflicting" },
  }));
  const byTopic = new Map(decisions.map((decision) => [decision.topic, decision]));
  assert.equal(byTopic.get("processing_purposes")?.requiresMiniEscalation, true);
  assert.equal(byTopic.get("legal_basis")?.requiresMiniEscalation, true);
  assert.equal(byTopic.get("data_retention")?.requiresMiniEscalation, true);
  assert.equal(byTopic.get("policy_runtime_consistency")?.requiresMiniEscalation, true);
  assert.equal(byTopic.get("vendor_disclosures")?.requiresMiniEscalation, false);
});

test("routing telemetry identifies a Nano/Mini mismatch that would not escalate", () => {
  const nano = artifact();
  const mini = artifact({
    vendor_disclosures: { confidence: 0.99, status: "ambiguous" },
  });
  const summary = summarizeNanoRouting({
    miniReferenceArtifact: mini,
    nanoArtifact: nano,
  });
  assert.deepEqual(summary.miniReferenceParity.mismatchedTopics, ["vendor_disclosures"]);
  assert.deepEqual(summary.miniReferenceParity.missedMismatchTopics, ["vendor_disclosures"]);
  assert.equal(summary.productionProjectable, false);
});
