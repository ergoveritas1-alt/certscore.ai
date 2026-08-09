import type {
  PolicyModelReviewArtifact,
  PolicyModelReviewRow,
  PolicyReviewTopic,
} from "@certscore/contracts";

const APPROVED_PRODUCTION_POLICY_REVIEW_MODELS = new Set([
  "gpt-5.4-mini",
  "gpt-5.4-mini-2026-03-17",
]);

export const NANO_ROUTINE_REVIEW_CONFIDENCE_THRESHOLDS = {
  processing_purposes: 0.70,
  legal_basis: 0.70,
  data_retention: 0.70,
  international_transfers: 0.90,
  vendor_disclosures: 0.90,
  data_subject_rights: 0.70,
  cookie_inventory: 0.90,
  policy_runtime_consistency: 0.96,
} as const satisfies Record<PolicyReviewTopic, number>;

export type MiniEscalationReason =
  | "nano_review_incomplete"
  | "nano_confidence_below_topic_threshold"
  | "nano_ambiguous_or_conflicting"
  | "nano_absence_requires_mini_review"
  | "nano_insufficient_evidence_requires_mini_review"
  | "nano_runtime_comparison_requires_mini_review";

export type NanoTopicRoutingDecision = {
  confidence: number | null;
  confidenceThreshold: number;
  reasonCodes: MiniEscalationReason[];
  requiresMiniEscalation: boolean;
  status: PolicyModelReviewRow["status"] | null;
  topic: PolicyReviewTopic;
};

export function isApprovedProductionPolicyReviewModel(input: {
  requestedModel: string;
  resolvedModel: string;
}) {
  return APPROVED_PRODUCTION_POLICY_REVIEW_MODELS.has(input.requestedModel) &&
    APPROVED_PRODUCTION_POLICY_REVIEW_MODELS.has(input.resolvedModel);
}

export function routeNanoPolicyReview(
  artifact: PolicyModelReviewArtifact,
): NanoTopicRoutingDecision[] {
  const rowsByTopic = new Map(artifact.rows.map((row) => [row.topic, row]));
  return (Object.keys(NANO_ROUTINE_REVIEW_CONFIDENCE_THRESHOLDS) as PolicyReviewTopic[])
    .map((topic) => {
      const row = rowsByTopic.get(topic);
      const confidenceThreshold = NANO_ROUTINE_REVIEW_CONFIDENCE_THRESHOLDS[topic];
      const reasonCodes: MiniEscalationReason[] = [];
      if (!row || artifact.status !== "completed") {
        reasonCodes.push("nano_review_incomplete");
      } else {
        if (row.confidence < confidenceThreshold) {
          reasonCodes.push("nano_confidence_below_topic_threshold");
        }
        if (row.status === "ambiguous" || row.status === "conflicting") {
          reasonCodes.push("nano_ambiguous_or_conflicting");
        }
        if (row.status === "not_observed_with_sufficient_coverage") {
          reasonCodes.push("nano_absence_requires_mini_review");
        }
        if (row.status === "insufficient_retained_evidence") {
          reasonCodes.push("nano_insufficient_evidence_requires_mini_review");
        }
        if (topic === "policy_runtime_consistency" &&
          row.status !== "insufficient_retained_evidence") {
          reasonCodes.push("nano_runtime_comparison_requires_mini_review");
        }
      }
      return {
        confidence: row?.confidence ?? null,
        confidenceThreshold,
        reasonCodes,
        requiresMiniEscalation: reasonCodes.length > 0,
        status: row?.status ?? null,
        topic,
      };
    });
}

export function summarizeNanoRouting(input: {
  nanoArtifact: PolicyModelReviewArtifact;
  miniReferenceArtifact?: PolicyModelReviewArtifact | null;
}) {
  const decisions = routeNanoPolicyReview(input.nanoArtifact);
  const miniByTopic = new Map(
    (input.miniReferenceArtifact?.rows ?? []).map((row) => [row.topic, row.status]),
  );
  const comparisons = decisions
    .filter((decision) => miniByTopic.has(decision.topic))
    .map((decision) => ({
      exact: miniByTopic.get(decision.topic) === decision.status,
      nanoEscalated: decision.requiresMiniEscalation,
      topic: decision.topic,
    }));
  const exactCount = comparisons.filter((comparison) => comparison.exact).length;
  return {
    contractVersion: "nano_policy_routing.v1",
    decisions,
    escalationTopicCount: decisions.filter((decision) => decision.requiresMiniEscalation).length,
    escalationTopics: decisions
      .filter((decision) => decision.requiresMiniEscalation)
      .map((decision) => decision.topic),
    miniReferenceParity: {
      exactStatusAgreementCount: exactCount,
      exactStatusAgreementRate: comparisons.length > 0 ? exactCount / comparisons.length : null,
      missedMismatchTopics: comparisons
        .filter((comparison) => !comparison.exact && !comparison.nanoEscalated)
        .map((comparison) => comparison.topic),
      mismatchedTopics: comparisons
        .filter((comparison) => !comparison.exact)
        .map((comparison) => comparison.topic),
      topicCount: comparisons.length,
    },
    productionProjectable: false,
  };
}
