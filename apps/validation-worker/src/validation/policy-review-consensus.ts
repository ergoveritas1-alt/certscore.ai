import { createHash } from "node:crypto";
import {
  policyModelReviewArtifactSchema,
  type PolicyModelReviewArtifact,
  type PolicyModelReviewRow,
} from "@certscore/contracts";
import {
  POLICY_REVIEW_TOPICS,
  type PolicyReviewPacket,
  type PolicyReviewTopic,
} from "./model-policy-review";
import { routeNanoPolicyReview } from "./policy-review-routing";

export const DUAL_NANO_ABSENCE_CONFIDENCE_THRESHOLD = 0.98;

export type DualNanoConsensusDecision = {
  confidence: number | null;
  reasonCodes: string[];
  requiresMiniEscalation: boolean;
  status: PolicyModelReviewRow["status"] | null;
  topic: PolicyReviewTopic;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function rowMap(artifact: PolicyModelReviewArtifact) {
  return new Map(artifact.rows.map((row) => [row.topic, row]));
}

function rowPassedInvariants(row: PolicyModelReviewRow) {
  return row.reasonCodes.includes("policy_review_invariants_applied_v1");
}

export function routeDualNanoPolicyReview(input: {
  criticArtifact: PolicyModelReviewArtifact;
  primaryArtifact: PolicyModelReviewArtifact;
}): DualNanoConsensusDecision[] {
  const primaryRows = rowMap(input.primaryArtifact);
  const criticRows = rowMap(input.criticArtifact);
  const primaryRouting = new Map(
    routeNanoPolicyReview(input.primaryArtifact).map((decision) => [decision.topic, decision]),
  );
  const criticRouting = new Map(
    routeNanoPolicyReview(input.criticArtifact).map((decision) => [decision.topic, decision]),
  );

  return POLICY_REVIEW_TOPICS.map((topic) => {
    const primary = primaryRows.get(topic);
    const critic = criticRows.get(topic);
    if (
      input.primaryArtifact.status !== "completed" ||
      input.criticArtifact.status !== "completed" ||
      !primary ||
      !critic
    ) {
      return {
        confidence: null,
        reasonCodes: ["dual_nano_review_incomplete"],
        requiresMiniEscalation: true,
        status: null,
        topic,
      };
    }
    const confidence = Math.min(primary.confidence, critic.confidence);
    if (primary.status !== critic.status) {
      return {
        confidence,
        reasonCodes: ["dual_nano_status_disagreement"],
        requiresMiniEscalation: true,
        status: null,
        topic,
      };
    }
    if (!rowPassedInvariants(primary) || !rowPassedInvariants(critic)) {
      return {
        confidence,
        reasonCodes: ["dual_nano_invariant_verification_missing"],
        requiresMiniEscalation: true,
        status: primary.status,
        topic,
      };
    }
    if (primary.status === "insufficient_retained_evidence") {
      return {
        confidence,
        reasonCodes: [
          "dual_nano_insufficient_evidence_consensus",
          "insufficient_evidence_requires_mini_due_observed_miss_risk",
        ],
        requiresMiniEscalation: true,
        status: primary.status,
        topic,
      };
    }
    if (
      primary.status === "not_observed_with_sufficient_coverage" &&
      topic !== "policy_runtime_consistency" &&
      confidence >= DUAL_NANO_ABSENCE_CONFIDENCE_THRESHOLD
    ) {
      return {
        confidence,
        reasonCodes: [
          "dual_nano_coverage_gated_absence_consensus",
          "dual_nano_high_confidence_consensus",
        ],
        requiresMiniEscalation: false,
        status: primary.status,
        topic,
      };
    }
    if (
      primary.status === "observed" &&
      !primaryRouting.get(topic)?.requiresMiniEscalation &&
      !criticRouting.get(topic)?.requiresMiniEscalation
    ) {
      return {
        confidence,
        reasonCodes: [
          "dual_nano_observed_consensus",
          "dual_nano_topic_thresholds_passed",
        ],
        requiresMiniEscalation: false,
        status: primary.status,
        topic,
      };
    }
    return {
      confidence,
      reasonCodes: [
        primary.status === "ambiguous" || primary.status === "conflicting"
          ? "dual_nano_ambiguous_or_conflicting"
          : topic === "policy_runtime_consistency"
            ? "dual_nano_runtime_comparison_requires_adjudication"
            : "dual_nano_consensus_below_bypass_gate",
      ],
      requiresMiniEscalation: true,
      status: primary.status,
      topic,
    };
  });
}

function consensusRow(input: {
  critic: PolicyModelReviewRow;
  decision: DualNanoConsensusDecision;
  primary: PolicyModelReviewRow;
}) {
  return {
    ...input.critic,
    confidence: input.decision.confidence ?? input.critic.confidence,
    sourceDocumentIds: [...new Set([
      ...input.primary.sourceDocumentIds,
      ...input.critic.sourceDocumentIds,
    ])].slice(0, 20),
    sourceUrls: [...new Set([
      ...input.primary.sourceUrls,
      ...input.critic.sourceUrls,
    ])].slice(0, 20),
    evidenceExcerpts: [...new Set([
      ...input.primary.evidenceExcerpts,
      ...input.critic.evidenceExcerpts,
    ])].slice(0, 2),
    conflictingExcerpts: [...new Set([
      ...input.primary.conflictingExcerpts,
      ...input.critic.conflictingExcerpts,
    ])].slice(0, 1),
    reasonCodes: [...new Set([
      ...input.primary.reasonCodes,
      ...input.critic.reasonCodes,
      ...input.decision.reasonCodes,
    ])].slice(0, 30),
    rationale: "Independent Nano review and Nano critic agreed after deterministic evidence invariants; Mini was not invoked for this topic.",
  };
}

export function composeDualNanoConsensusShadowArtifact(input: {
  criticArtifact: PolicyModelReviewArtifact;
  decisions: readonly DualNanoConsensusDecision[];
  miniArtifact: PolicyModelReviewArtifact | null;
  packet: PolicyReviewPacket;
  primaryArtifact: PolicyModelReviewArtifact;
}) {
  const primaryRows = rowMap(input.primaryArtifact);
  const criticRows = rowMap(input.criticArtifact);
  const miniRows = rowMap(input.miniArtifact ?? policyModelReviewArtifactSchema.parse({
    ...input.criticArtifact,
    rows: [],
  }));
  const decisions = new Map(input.decisions.map((decision) => [decision.topic, decision]));
  const rows = POLICY_REVIEW_TOPICS.flatMap((topic) => {
    const decision = decisions.get(topic);
    if (!decision) return [];
    if (decision.requiresMiniEscalation) {
      const mini = miniRows.get(topic);
      return mini ? [mini] : [];
    }
    const primary = primaryRows.get(topic);
    const critic = criticRows.get(topic);
    return primary && critic ? [consensusRow({ critic, decision, primary })] : [];
  });
  const escalationTopics = input.decisions
    .filter((decision) => decision.requiresMiniEscalation)
    .map((decision) => decision.topic);
  const miniComplete = escalationTopics.length === 0 || (
    input.miniArtifact?.status === "completed" &&
    escalationTopics.every((topic) => miniRows.has(topic))
  );
  const completed = input.primaryArtifact.status === "completed" &&
    input.criticArtifact.status === "completed" &&
    miniComplete &&
    rows.length === POLICY_REVIEW_TOPICS.length;
  const provenanceBase = input.miniArtifact ?? input.criticArtifact;
  return policyModelReviewArtifactSchema.parse({
    ...provenanceBase,
    cacheKey: sha256([
      input.packet.contentHash,
      input.primaryArtifact.cacheKey,
      input.criticArtifact.cacheKey,
      input.miniArtifact?.cacheKey ?? "no-mini",
    ].join(":")),
    deterministicLegalFrameworkSignals: provenanceBase.deterministicLegalFrameworkSignals,
    deterministicPolicyReviewSignals: provenanceBase.deterministicPolicyReviewSignals,
    failureReason: completed
      ? null
      : input.miniArtifact?.failureReason ??
        input.criticArtifact.failureReason ??
        input.primaryArtifact.failureReason ??
        "Dual-Nano consensus review was incomplete.",
    mode: "shadow",
    productionEligible: false,
    rows: completed ? rows : [],
    scanId: input.packet.scanId,
    status: completed ? "completed" : "failed",
    provenance: {
      ...provenanceBase.provenance,
      requestedModel: "hybrid:dual-gpt-5.4-nano+rare-gpt-5.4-mini",
      resolvedModel: "hybrid:dual-gpt-5.4-nano+rare-gpt-5.4-mini",
      taskType: "policy_semantic_dual_nano_consensus_shadow_review",
      contentHash: input.packet.contentHash,
      inputRefs: input.packet.documents.map((document) => document.documentId),
      outputRefs: rows.flatMap((row) => row.sourceDocumentIds).slice(0, 100),
      reasonCodes: [
        "dual_nano_independent_consensus",
        "mini_disagreement_adjudication_only",
        "dual_nano_consensus_shadow_non_projectable",
      ],
      usedForProductionProjection: false,
    },
  });
}

function miniTokenCostUnits(artifact: PolicyModelReviewArtifact | null | undefined) {
  if (!artifact) return 0;
  const promptTokens = artifact.provenance.promptTokens;
  const cachedPromptTokens = artifact.provenance.cachedPromptTokens ?? 0;
  const completionTokens = artifact.provenance.completionTokens;
  if (promptTokens === null || completionTokens === null) return null;
  const boundedCachedTokens = Math.min(promptTokens, cachedPromptTokens);
  // Relative cost units use the current Mini input/cached-input/output price
  // ratio. The reduction rate is independent of the USD-per-million divisor.
  return (promptTokens - boundedCachedTokens) * 0.75 +
    boundedCachedTokens * 0.075 +
    completionTokens * 4.5;
}

export function summarizeDualNanoConsensus(input: {
  canonicalMiniArtifact?: PolicyModelReviewArtifact | null;
  criticArtifact: PolicyModelReviewArtifact;
  decisions: readonly DualNanoConsensusDecision[];
  miniEscalationArtifact?: PolicyModelReviewArtifact | null;
  primaryArtifact: PolicyModelReviewArtifact;
}) {
  const canonicalCost = miniTokenCostUnits(input.canonicalMiniArtifact);
  const escalationCost = miniTokenCostUnits(input.miniEscalationArtifact);
  const canonicalByTopic = new Map(
    (input.canonicalMiniArtifact?.rows ?? []).map((row) => [row.topic, row.status]),
  );
  const primaryByTopic = rowMap(input.primaryArtifact);
  const criticByTopic = rowMap(input.criticArtifact);
  const bypassComparisons = input.decisions
    .filter((decision) => !decision.requiresMiniEscalation)
    .filter((decision) => canonicalByTopic.has(decision.topic))
    .map((decision) => ({
      exact: canonicalByTopic.get(decision.topic) === decision.status,
      topic: decision.topic,
    }));
  return {
    contractVersion: "dual_nano_policy_consensus.v1",
    decisions: input.decisions,
    miniEscalationTopicCount: input.decisions.filter(
      (decision) => decision.requiresMiniEscalation,
    ).length,
    miniEscalationTopics: input.decisions
      .filter((decision) => decision.requiresMiniEscalation)
      .map((decision) => decision.topic),
    miniCost: {
      canonicalCostUnits: canonicalCost,
      escalationCostUnits: escalationCost,
      estimatedReductionRate:
        canonicalCost !== null && escalationCost !== null && canonicalCost > 0
          ? 1 - escalationCost / canonicalCost
          : null,
      targetReductionRate: 0.95,
    },
    nanoUsage: {
      criticCompletionTokens: input.criticArtifact.provenance.completionTokens,
      criticPromptTokens: input.criticArtifact.provenance.promptTokens,
      primaryCompletionTokens: input.primaryArtifact.provenance.completionTokens,
      primaryPromptTokens: input.primaryArtifact.provenance.promptTokens,
    },
    bypassParity: {
      exactStatusAgreementCount: bypassComparisons.filter((row) => row.exact).length,
      mismatchedTopics: bypassComparisons.filter((row) => !row.exact).map((row) => row.topic),
      topicCount: bypassComparisons.length,
    },
    nanoInternalAgreement: POLICY_REVIEW_TOPICS.filter((topic) =>
      primaryByTopic.get(topic)?.status === criticByTopic.get(topic)?.status
    ).length / POLICY_REVIEW_TOPICS.length,
    productionProjectable: false,
  };
}
