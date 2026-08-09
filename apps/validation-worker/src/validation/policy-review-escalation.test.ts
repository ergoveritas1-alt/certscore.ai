import assert from "node:assert/strict";
import test from "node:test";
import {
  policyModelReviewArtifactSchema,
  POLICY_REVIEW_TOPIC_DEFINITIONS,
  type PolicyReviewTopic,
} from "@certscore/contracts";
import type { PolicyReviewPacket } from "./model-policy-review";
import {
  buildMiniExtractionReuseTransport,
  buildMiniEscalationTransport,
  composeExtractionReuseShadowArtifact,
  composeHybridPolicyReviewArtifact,
  routeRetainedExtractionPolicyReview,
} from "./policy-review-escalation";

const topics = Object.keys(POLICY_REVIEW_TOPIC_DEFINITIONS) as PolicyReviewTopic[];

function packet(): PolicyReviewPacket {
  const repeated = "General policy background without a topic-specific conclusion. ".repeat(300);
  return {
    contentHash: "a".repeat(64),
    documents: [{
      canonicalUrl: "https://example.test/privacy",
      contentCoverage: {
        status: "complete",
        sourceTextChars: repeated.length,
        extractedSectionCount: 8,
        retainedSectionCount: 8,
        retainedStrongSectionCount: 8,
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
      text: `Example privacy policy. ${repeated} Legal basis: contract. Retention: as long as necessary. Your privacy rights include access and deletion.`,
    }],
    evidenceCoverage: {
      coverageLimitations: [],
      policySurfaceInspection: { coverageStatus: "complete" },
      runtimeCoverage: { coverageStatus: "usable" },
    },
    policyCandidates: [],
    runtimeContext: { cookies: ["session_id"] },
    scanContext: { region: "US", targetUrl: "https://example.test/" },
    scanDate: "2026-08-08T00:00:00.000Z",
    scanId: "scan-1",
  };
}

function artifact(model: "gpt-5.4-mini" | "gpt-5.4-nano", onlyTopics = topics) {
  return policyModelReviewArtifactSchema.parse({
    contractVersion: "policy_model_review.v2",
    mode: "shadow",
    status: "completed",
    scanId: "scan-1",
    cacheKey: (model.endsWith("nano") ? "b" : "c").repeat(64),
    rows: onlyTopics.map((topic) => ({
      topic,
      status: "observed",
      confidence: 0.99,
      sourceDocumentIds: ["policy-1"],
      sourceUrls: ["https://example.test/privacy"],
      evidenceExcerpts: ["Legal basis: contract."],
      conflictingExcerpts: [],
      reasonCodes: ["policy_review_invariants_applied_v1"],
      rationale: `${model} retained direct evidence for this topic.`,
    })),
    deterministicLegalFrameworkSignals: [],
    deterministicPolicyReviewSignals: [],
    failureReason: null,
    provenance: {
      role: "review",
      provider: "openai",
      requestedModel: model,
      resolvedModel: model,
      taskType: "policy_semantic_review",
      promptVersion: "policy_semantic_review.v5",
      schemaVersion: "policy_semantic_review_output.v2",
      inputRefs: ["policy-1"],
      outputRefs: ["policy-1"],
      contentHash: "a".repeat(64),
      confidence: 0.99,
      reasonCodes: [],
      uncertaintyNotes: [],
      latencyMs: 1,
      promptTokens: 10,
      completionTokens: 10,
      totalTokens: 20,
      usedForProductionProjection: false,
    },
    productionEligible: false,
  });
}

test("Mini escalation transport preserves the full packet for invariants while bounding model text", () => {
  const fullPacket = packet();
  const transport = buildMiniEscalationTransport({
    nanoArtifact: artifact("gpt-5.4-nano"),
    packet: fullPacket,
  });
  assert.deepEqual(transport.topics, ["policy_runtime_consistency"]);
  assert.ok(transport.metrics.reductionRate > 0.5);
  assert.ok(transport.packet.documents[0]!.text.length < fullPacket.documents[0]!.text.length);
  assert.equal(fullPacket.documents[0]!.text.includes("Your privacy rights"), true);
  assert.notEqual(transport.packet.contentHash, fullPacket.contentHash);
});

test("hybrid shadow artifact uses Mini only for escalated topics and never projects", () => {
  const fullPacket = packet();
  const nano = artifact("gpt-5.4-nano");
  const mini = artifact("gpt-5.4-mini", ["policy_runtime_consistency"]);
  const hybrid = composeHybridPolicyReviewArtifact({
    miniArtifact: mini,
    nanoArtifact: nano,
    packet: fullPacket,
    topics: ["policy_runtime_consistency"],
  });
  assert.equal(hybrid.status, "completed");
  assert.equal(hybrid.rows.length, 8);
  assert.equal(hybrid.productionEligible, false);
  assert.equal(hybrid.provenance.usedForProductionProjection, false);
  assert.equal(
    hybrid.rows.find((row) => row.topic === "policy_runtime_consistency")?.rationale,
    "gpt-5.4-mini retained direct evidence for this topic.",
  );
});

test("bounded Mini cannot create an observed row without Nano consensus", () => {
  const fullPacket = packet();
  const nanoBase = artifact("gpt-5.4-nano");
  const nano = policyModelReviewArtifactSchema.parse({
    ...nanoBase,
    rows: nanoBase.rows.map((row) => row.topic === "international_transfers"
      ? {
          ...row,
          status: "ambiguous",
          confidence: 0.8,
          sourceDocumentIds: [],
          sourceUrls: [],
          evidenceExcerpts: [],
          reasonCodes: ["topic_relevance_not_confirmed"],
          rationale: "Nano did not confirm a directly relevant transfer disclosure.",
        }
      : row),
  });
  const mini = artifact("gpt-5.4-mini", ["international_transfers"]);
  const hybrid = composeHybridPolicyReviewArtifact({
    miniArtifact: mini,
    nanoArtifact: nano,
    packet: fullPacket,
    topics: ["international_transfers"],
  });
  assert.equal(
    hybrid.rows.find((row) => row.topic === "international_transfers")?.status,
    "ambiguous",
  );
});

test("retained extraction reuse requires exact strong observed evidence bound to the target policy", () => {
  const fullPacket = packet();
  fullPacket.documents[0]!.extractedCandidates = {
    retained_article13_section_evidence: [{
      coverageArea: "legal_basis",
      selectedPolicySectionHeading: "Legal basis",
      selectedPolicySectionExcerpt: "Legal basis: contract.",
      selectedPolicySectionUrl: "https://example.test/privacy",
      evidenceSource: "nano",
      selectedEvidenceStrength: "strong",
      signalObserved: "observed",
    }],
  };
  const decisions = routeRetainedExtractionPolicyReview(fullPacket);
  assert.equal(
    decisions.find((decision) => decision.topic === "legal_basis")?.canReuseObserved,
    true,
  );
  assert.equal(
    decisions.find((decision) => decision.topic === "international_transfers")?.canReuseObserved,
    false,
  );

  fullPacket.documents[0]!.extractedCandidates = {
    retained_article13_section_evidence: [{
      coverageArea: "legal_basis",
      selectedPolicySectionExcerpt: "Legal basis: consent.",
      selectedPolicySectionUrl: "https://example.test/privacy",
      evidenceSource: "nano",
      selectedEvidenceStrength: "strong",
      signalObserved: "observed",
    }],
  };
  assert.equal(
    routeRetainedExtractionPolicyReview(fullPacket)
      .find((decision) => decision.topic === "legal_basis")?.canReuseObserved,
    false,
  );
  fullPacket.evidenceCoverage.policySurfaceInspection = {
    retainedCanonicalBundleVerified: true,
  };
  assert.equal(
    routeRetainedExtractionPolicyReview(fullPacket)
      .find((decision) => decision.topic === "legal_basis")?.canReuseObserved,
    true,
  );
});

test("extraction reuse transport skips only verified observed topics and remains shadow-only", () => {
  const fullPacket = packet();
  fullPacket.documents[0]!.extractedCandidates = {
    retained_article13_section_evidence: [{
      coverageArea: "legal_basis",
      selectedPolicySectionHeading: "Legal basis",
      selectedPolicySectionExcerpt: "Legal basis: contract.",
      selectedPolicySectionUrl: "https://example.test/privacy",
      evidenceSource: "deterministic_plus_nano",
      selectedEvidenceStrength: "strong",
      signalObserved: "observed",
    }],
  };
  const transport = buildMiniExtractionReuseTransport(fullPacket);
  assert.equal(transport.topics.includes("legal_basis"), false);
  assert.equal(transport.topics.includes("international_transfers"), true);
  assert.equal(transport.topics.includes("policy_runtime_consistency"), true);
  const mini = artifact("gpt-5.4-mini", transport.topics);
  const hybrid = composeExtractionReuseShadowArtifact({
    miniArtifact: mini,
    packet: fullPacket,
    reuseDecisions: transport.reuseDecisions,
    topics: transport.topics,
  });
  assert.equal(hybrid.status, "completed");
  assert.equal(hybrid.productionEligible, false);
  assert.equal(hybrid.provenance.usedForProductionProjection, false);
  assert.match(
    hybrid.rows.find((row) => row.topic === "legal_basis")?.rationale ?? "",
    /Reused verified topic-specific evidence/,
  );
});
