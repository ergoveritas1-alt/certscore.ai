import assert from "node:assert/strict";
import test from "node:test";
import {
  policyModelReviewArtifactSchema,
  POLICY_REVIEW_TOPIC_DEFINITIONS,
  type PolicyReviewStatus,
  type PolicyReviewTopic,
} from "@certscore/contracts";
import type { PolicyReviewPacket } from "./model-policy-review";
import {
  composeDualNanoConsensusShadowArtifact,
  routeDualNanoPolicyReview,
  summarizeDualNanoConsensus,
} from "./policy-review-consensus";

const topics = Object.keys(POLICY_REVIEW_TOPIC_DEFINITIONS) as PolicyReviewTopic[];

function artifact(input: {
  model: "gpt-5.4-mini" | "gpt-5.4-nano";
  overrides?: Partial<Record<PolicyReviewTopic, {
    confidence?: number;
    status: PolicyReviewStatus;
  }>>;
  onlyTopics?: readonly PolicyReviewTopic[];
  tokenScale?: number;
}) {
  const selectedTopics = input.onlyTopics ?? topics;
  const tokenScale = input.tokenScale ?? 1;
  return policyModelReviewArtifactSchema.parse({
    contractVersion: "policy_model_review.v2",
    mode: "shadow",
    status: "completed",
    scanId: "scan-1",
    cacheKey: (input.model.endsWith("nano") ? "a" : "b").repeat(64),
    rows: selectedTopics.map((topic) => ({
      topic,
      status: input.overrides?.[topic]?.status ?? "observed",
      confidence: input.overrides?.[topic]?.confidence ?? 0.99,
      sourceDocumentIds: ["policy-1"],
      sourceUrls: ["https://example.test/privacy"],
      evidenceExcerpts: ["Direct retained topic evidence."],
      conflictingExcerpts: [],
      reasonCodes: ["policy_review_invariants_applied_v1"],
      rationale: "Direct retained evidence passed deterministic invariants.",
    })),
    deterministicLegalFrameworkSignals: [],
    deterministicPolicyReviewSignals: [],
    failureReason: null,
    provenance: {
      role: "review",
      provider: "openai",
      requestedModel: input.model,
      resolvedModel: input.model,
      taskType: "policy_semantic_review",
      promptVersion: "policy_semantic_review.v5",
      schemaVersion: "policy_semantic_review_output.v2",
      inputRefs: ["policy-1"],
      outputRefs: ["policy-1"],
      contentHash: "c".repeat(64),
      confidence: 0.99,
      reasonCodes: [],
      uncertaintyNotes: [],
      latencyMs: 1,
      promptTokens: 1_000 * tokenScale,
      completionTokens: 100 * tokenScale,
      totalTokens: 1_100 * tokenScale,
      usedForProductionProjection: false,
    },
    productionEligible: false,
  });
}

function packet(): PolicyReviewPacket {
  return {
    contentHash: "c".repeat(64),
    documents: [{
      canonicalUrl: "https://example.test/privacy",
      contentCoverage: {
        status: "complete",
        sourceTextChars: 100,
        extractedSectionCount: 1,
        retainedSectionCount: 1,
        retainedStrongSectionCount: 1,
        retainedTableRowCount: 0,
        limitationKeys: [],
        packetTextTruncated: false,
      },
      documentEvaluationState: "usable",
      documentFetchState: "fetched",
      documentId: "policy-1",
      documentOwnerEntity: "Example",
      documentType: "privacy_policy",
      extractedCandidates: {},
      ownershipConfidence: 1,
      ownershipReasonCodes: ["same_registrable_domain_as_scan_target"],
      targetRelationship: "target_controller",
      text: "Direct retained topic evidence.",
    }],
    evidenceCoverage: {
      coverageLimitations: [],
      policySurfaceInspection: { coverageStatus: "complete" },
      runtimeCoverage: { coverageStatus: "usable" },
    },
    policyCandidates: [],
    runtimeContext: {},
    scanContext: { region: "US", targetUrl: "https://example.test" },
    scanDate: "2026-08-08T00:00:00.000Z",
    scanId: "scan-1",
  };
}

test("dual Nano consensus bypasses high-confidence observed but escalates insufficient evidence", () => {
  const primary = artifact({
    model: "gpt-5.4-nano",
    overrides: {
      data_retention: { status: "insufficient_retained_evidence", confidence: 0.6 },
    },
  });
  const critic = artifact({
    model: "gpt-5.4-nano",
    overrides: {
      data_retention: { status: "insufficient_retained_evidence", confidence: 0.7 },
    },
  });
  const decisions = routeDualNanoPolicyReview({ criticArtifact: critic, primaryArtifact: primary });
  const byTopic = new Map(decisions.map((decision) => [decision.topic, decision]));
  assert.equal(byTopic.get("processing_purposes")?.requiresMiniEscalation, false);
  assert.equal(byTopic.get("data_retention")?.requiresMiniEscalation, true);
  assert.equal(byTopic.get("policy_runtime_consistency")?.requiresMiniEscalation, true);
});

test("dual Nano disagreement and low-confidence consensus route to Mini", () => {
  const primary = artifact({ model: "gpt-5.4-nano" });
  const critic = artifact({
    model: "gpt-5.4-nano",
    overrides: {
      legal_basis: { status: "ambiguous", confidence: 0.99 },
      vendor_disclosures: { status: "observed", confidence: 0.89 },
    },
  });
  const decisions = routeDualNanoPolicyReview({ criticArtifact: critic, primaryArtifact: primary });
  const byTopic = new Map(decisions.map((decision) => [decision.topic, decision]));
  assert.equal(byTopic.get("legal_basis")?.requiresMiniEscalation, true);
  assert.equal(byTopic.get("vendor_disclosures")?.requiresMiniEscalation, true);
});

test("dual Nano absence bypass requires high confidence and excludes runtime comparison", () => {
  const primary = artifact({
    model: "gpt-5.4-nano",
    overrides: {
      legal_basis: { status: "not_observed_with_sufficient_coverage", confidence: 0.99 },
      data_retention: { status: "not_observed_with_sufficient_coverage", confidence: 0.97 },
      policy_runtime_consistency: { status: "not_observed_with_sufficient_coverage", confidence: 0.99 },
    },
  });
  const critic = artifact({
    model: "gpt-5.4-nano",
    overrides: {
      legal_basis: { status: "not_observed_with_sufficient_coverage", confidence: 0.99 },
      data_retention: { status: "not_observed_with_sufficient_coverage", confidence: 0.99 },
      policy_runtime_consistency: { status: "not_observed_with_sufficient_coverage", confidence: 0.99 },
    },
  });
  const byTopic = new Map(
    routeDualNanoPolicyReview({ criticArtifact: critic, primaryArtifact: primary })
      .map((decision) => [decision.topic, decision]),
  );
  assert.equal(byTopic.get("legal_basis")?.requiresMiniEscalation, false);
  assert.equal(byTopic.get("data_retention")?.requiresMiniEscalation, true);
  assert.equal(byTopic.get("policy_runtime_consistency")?.requiresMiniEscalation, true);
});

test("dual Nano hybrid remains non-projectable and reports weighted Mini reduction", () => {
  const primary = artifact({ model: "gpt-5.4-nano" });
  const critic = artifact({ model: "gpt-5.4-nano" });
  const decisions = routeDualNanoPolicyReview({ criticArtifact: critic, primaryArtifact: primary });
  const escalationTopics = decisions
    .filter((decision) => decision.requiresMiniEscalation)
    .map((decision) => decision.topic);
  const mini = artifact({
    model: "gpt-5.4-mini",
    onlyTopics: escalationTopics,
    tokenScale: 0.03,
  });
  const hybrid = composeDualNanoConsensusShadowArtifact({
    criticArtifact: critic,
    decisions,
    miniArtifact: mini,
    packet: packet(),
    primaryArtifact: primary,
  });
  assert.equal(hybrid.status, "completed");
  assert.equal(hybrid.productionEligible, false);
  assert.equal(hybrid.provenance.usedForProductionProjection, false);
  const summary = summarizeDualNanoConsensus({
    canonicalMiniArtifact: artifact({ model: "gpt-5.4-mini" }),
    criticArtifact: critic,
    decisions,
    miniEscalationArtifact: mini,
    primaryArtifact: primary,
  });
  assert.ok((summary.miniCost.estimatedReductionRate ?? 0) >= 0.95);
});
