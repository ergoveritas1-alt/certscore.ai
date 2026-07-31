import type {
  PolicyModelReviewArtifact,
  PolicyReviewStatus,
  PolicyReviewTopic
} from "@certscore/contracts";

export type PolicyReviewGoldLabels = Partial<Record<PolicyReviewTopic, PolicyReviewStatus>>;

export type PolicyReviewEvaluationCase = {
  artifact: PolicyModelReviewArtifact;
  baseline?: PolicyReviewGoldLabels;
  expected: PolicyReviewGoldLabels;
};

export type PolicyReviewMetricSlice = {
  ambiguousRate: number | null;
  conflictingRate: number | null;
  evaluatedRows: number;
  exactAgreementRate: number | null;
  falseNegativeCount: number;
  falsePositiveCount: number;
  observedPrecision: number | null;
  observedRecall: number | null;
  expectedObservedCount: number;
  expectedNonObservedCount: number;
};

export const POLICY_REVIEW_EVALUATION_TOPICS = [
  "processing_purposes",
  "legal_basis",
  "data_retention",
  "international_transfers",
  "vendor_disclosures",
  "data_subject_rights",
  "cookie_inventory",
  "policy_runtime_consistency"
] as const satisfies readonly PolicyReviewTopic[];

type MetricAccumulator = {
  ambiguousRows: number;
  conflictingRows: number;
  evaluatedRows: number;
  exactMatches: number;
  falseNegative: number;
  falsePositive: number;
  truePositive: number;
  expectedObserved: number;
  expectedNonObserved: number;
};

function emptyAccumulator(): MetricAccumulator {
  return {
    ambiguousRows: 0,
    conflictingRows: 0,
    evaluatedRows: 0,
    exactMatches: 0,
    falseNegative: 0,
    falsePositive: 0,
    truePositive: 0,
    expectedObserved: 0,
    expectedNonObserved: 0
  };
}

function addMetric(
  accumulator: MetricAccumulator,
  actualStatus: PolicyReviewStatus,
  expectedStatus: PolicyReviewStatus
) {
  accumulator.evaluatedRows += 1;
  if (actualStatus === expectedStatus) {
    accumulator.exactMatches += 1;
  }
  const expectedPositive = expectedStatus === "observed";
  const actualPositive = actualStatus === "observed";
  if (expectedPositive) {
    accumulator.expectedObserved += 1;
  } else {
    accumulator.expectedNonObserved += 1;
  }
  if (expectedPositive && actualPositive) {
    accumulator.truePositive += 1;
  } else if (!expectedPositive && actualPositive) {
    accumulator.falsePositive += 1;
  } else if (expectedPositive && !actualPositive) {
    accumulator.falseNegative += 1;
  }
  if (actualStatus === "ambiguous") {
    accumulator.ambiguousRows += 1;
  }
  if (actualStatus === "conflicting") {
    accumulator.conflictingRows += 1;
  }
}

function summarizeAccumulator(accumulator: MetricAccumulator): PolicyReviewMetricSlice {
  const precisionDenominator = accumulator.truePositive + accumulator.falsePositive;
  const recallDenominator = accumulator.truePositive + accumulator.falseNegative;
  return {
    evaluatedRows: accumulator.evaluatedRows,
    exactAgreementRate:
      accumulator.evaluatedRows > 0
        ? accumulator.exactMatches / accumulator.evaluatedRows
        : null,
    observedPrecision:
      precisionDenominator > 0 ? accumulator.truePositive / precisionDenominator : null,
    observedRecall:
      recallDenominator > 0 ? accumulator.truePositive / recallDenominator : null,
    falsePositiveCount: accumulator.falsePositive,
    falseNegativeCount: accumulator.falseNegative,
    ambiguousRate:
      accumulator.evaluatedRows > 0
        ? accumulator.ambiguousRows / accumulator.evaluatedRows
        : null,
    conflictingRate:
      accumulator.evaluatedRows > 0
        ? accumulator.conflictingRows / accumulator.evaluatedRows
        : null,
    expectedObservedCount: accumulator.expectedObserved,
    expectedNonObservedCount: accumulator.expectedNonObserved
  };
}

export function evaluatePolicyReviewArtifacts(input: PolicyReviewEvaluationCase[]) {
  const overall = emptyAccumulator();
  const byTopicAccumulators = Object.fromEntries(
    POLICY_REVIEW_EVALUATION_TOPICS.map((topic) => [topic, emptyAccumulator()])
  ) as Record<PolicyReviewTopic, MetricAccumulator>;
  let baselineDisagreements = 0;
  let failedArtifacts = 0;

  for (const item of input) {
    if (item.artifact.status !== "completed") {
      failedArtifacts += 1;
      continue;
    }
    const actualByTopic = new Map(item.artifact.rows.map((row) => [row.topic, row.status]));
    for (const [topic, expectedStatus] of Object.entries(item.expected) as Array<[
      PolicyReviewTopic,
      PolicyReviewStatus
    ]>) {
      const actualStatus = actualByTopic.get(topic);
      if (!actualStatus) {
        continue;
      }
      addMetric(overall, actualStatus, expectedStatus);
      addMetric(byTopicAccumulators[topic], actualStatus, expectedStatus);
      if (item.baseline?.[topic] && item.baseline[topic] !== actualStatus) {
        baselineDisagreements += 1;
      }
    }
  }

  const overallMetrics = summarizeAccumulator(overall);
  return {
    artifactCount: input.length,
    failedArtifacts,
    ...overallMetrics,
    baselineDisagreementCount: baselineDisagreements,
    byTopic: Object.fromEntries(
      POLICY_REVIEW_EVALUATION_TOPICS.map((topic) => [
        topic,
        summarizeAccumulator(byTopicAccumulators[topic])
      ])
    ) as Record<PolicyReviewTopic, PolicyReviewMetricSlice>
  };
}
