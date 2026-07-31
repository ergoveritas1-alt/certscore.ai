import {
  policyModelReviewArtifactSchema,
  policyReviewStatusSchema,
  type PolicyModelReviewArtifact,
  type PolicyReviewTopic
} from "@certscore/contracts";
import { z } from "zod";
import {
  evaluatePolicyReviewArtifacts,
  POLICY_REVIEW_EVALUATION_TOPICS,
  type PolicyReviewEvaluationCase,
  type PolicyReviewMetricSlice
} from "./model-review-evaluation";

const topicLabelsSchema = z.object({
  processing_purposes: policyReviewStatusSchema.optional(),
  legal_basis: policyReviewStatusSchema.optional(),
  data_retention: policyReviewStatusSchema.optional(),
  international_transfers: policyReviewStatusSchema.optional(),
  vendor_disclosures: policyReviewStatusSchema.optional(),
  data_subject_rights: policyReviewStatusSchema.optional(),
  cookie_inventory: policyReviewStatusSchema.optional(),
  policy_runtime_consistency: policyReviewStatusSchema.optional()
}).strict();

const repositoryArtifactPathSchema = z.string().min(1).max(1_000).refine(
  (value) =>
    !value.startsWith("/") &&
    !value.split(/[\\/]/).includes(".."),
  "Artifact paths must be repository-relative and must not traverse parent directories."
);

const policyReviewGoldCorpusEntrySchema = z.object({
  caseId: z.string().min(1).max(120),
  scanId: z.string().min(1).max(120),
  targetUrl: z.string().url().max(2_000),
  bundlePath: repositoryArtifactPathSchema.optional(),
  modelArtifactPath: repositoryArtifactPathSchema.optional(),
  reviewStatus: z.enum([
    "pending",
    "provisional",
    "human_adjudicated",
    "independently_reviewed"
  ]),
  reviewBasis: z.enum([
    "human_model_comparison",
    "human_evidence_only"
  ]).optional(),
  reviewer: z.string().min(1).max(120).optional(),
  reviewedAt: z.string().datetime().optional(),
  evidenceNotes: z.array(z.string().min(1).max(1_000)).max(20).default([]),
  expected: topicLabelsSchema.default({}),
  baseline: topicLabelsSchema.optional()
}).strict().superRefine((entry, context) => {
  const labelCount = POLICY_REVIEW_EVALUATION_TOPICS.filter(
    (topic) => entry.expected[topic] !== undefined
  ).length;
  if (entry.reviewStatus === "pending") {
    if (labelCount > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pending cases must not carry gold labels.",
        path: ["expected"]
      });
    }
    return;
  }
  if (labelCount !== POLICY_REVIEW_EVALUATION_TOPICS.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Reviewed cases require a label for every policy-review topic.",
      path: ["expected"]
    });
  }
  if (!entry.reviewer || !entry.reviewedAt || entry.evidenceNotes.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Reviewed cases require reviewer, reviewedAt, and evidenceNotes.",
      path: ["reviewStatus"]
    });
  }
  if (
    entry.reviewStatus === "human_adjudicated" &&
    entry.reviewBasis !== "human_model_comparison"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Human-adjudicated cases must record the human_model_comparison review basis.",
      path: ["reviewBasis"]
    });
  }
  if (
    entry.reviewStatus === "independently_reviewed" &&
    entry.reviewBasis === "human_model_comparison"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Independent review cannot use the human_model_comparison review basis.",
      path: ["reviewBasis"]
    });
  }
});

export const policyReviewGoldCorpusSchema = z.object({
  contractVersion: z.literal("policy_review_gold_corpus.v1"),
  description: z.string().min(1).max(1_000),
  entries: z.array(policyReviewGoldCorpusEntrySchema).min(25).max(50)
}).strict().superRefine((corpus, context) => {
  const caseIds = new Set<string>();
  const scanIds = new Set<string>();
  for (const [index, entry] of corpus.entries.entries()) {
    if (caseIds.has(entry.caseId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate caseId ${entry.caseId}.`,
        path: ["entries", index, "caseId"]
      });
    }
    if (scanIds.has(entry.scanId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate scanId ${entry.scanId}.`,
        path: ["entries", index, "scanId"]
      });
    }
    caseIds.add(entry.caseId);
    scanIds.add(entry.scanId);
  }
});

export type PolicyReviewGoldCorpus = z.infer<typeof policyReviewGoldCorpusSchema>;

export const DEFAULT_POLICY_REVIEW_ROLLOUT_THRESHOLDS = {
  minimumCandidateCases: 25,
  minimumDistinctDomains: 20,
  minimumHumanReviewedCases: 25,
  minimumArtifactCoverageRate: 1,
  minimumLabeledRowsPerTopic: 20,
  minimumObservedRowsPerTopic: 5,
  minimumNonObservedRowsPerTopic: 5,
  minimumOverallExactAgreement: 0.85,
  minimumOverallObservedPrecision: 0.95,
  minimumOverallObservedRecall: 0.9,
  minimumTopicExactAgreement: 0.8,
  minimumTopicObservedPrecision: 0.9,
  minimumTopicObservedRecall: 0.8,
  maximumFailedArtifacts: 0
} as const;

type RolloutThresholds = {
  [Key in keyof typeof DEFAULT_POLICY_REVIEW_ROLLOUT_THRESHOLDS]: number;
};

function normalizedDomain(targetUrl: string) {
  return new URL(targetUrl).hostname.toLowerCase().replace(/^www\./, "");
}

function metricAtLeast(
  failures: string[],
  label: string,
  actual: number | null,
  minimum: number
) {
  if (actual === null || actual < minimum) {
    failures.push(`${label} must be at least ${minimum}; observed ${actual ?? "not measurable"}.`);
  }
}

function assessTopic(
  failures: string[],
  topic: PolicyReviewTopic,
  metrics: PolicyReviewMetricSlice,
  thresholds: RolloutThresholds
) {
  if (metrics.evaluatedRows < thresholds.minimumLabeledRowsPerTopic) {
    failures.push(
      `${topic} requires ${thresholds.minimumLabeledRowsPerTopic} labeled rows; observed ${metrics.evaluatedRows}.`
    );
  }
  if (metrics.expectedObservedCount < thresholds.minimumObservedRowsPerTopic) {
    failures.push(
      `${topic} requires ${thresholds.minimumObservedRowsPerTopic} observed gold labels; observed ${metrics.expectedObservedCount}.`
    );
  }
  if (metrics.expectedNonObservedCount < thresholds.minimumNonObservedRowsPerTopic) {
    failures.push(
      `${topic} requires ${thresholds.minimumNonObservedRowsPerTopic} non-observed gold labels; observed ${metrics.expectedNonObservedCount}.`
    );
  }
  metricAtLeast(
    failures,
    `${topic} exact agreement`,
    metrics.exactAgreementRate,
    thresholds.minimumTopicExactAgreement
  );
  metricAtLeast(
    failures,
    `${topic} observed precision`,
    metrics.observedPrecision,
    thresholds.minimumTopicObservedPrecision
  );
  metricAtLeast(
    failures,
    `${topic} observed recall`,
    metrics.observedRecall,
    thresholds.minimumTopicObservedRecall
  );
}

export function assessPolicyReviewRolloutReadiness(input: {
  artifactsByScanId: ReadonlyMap<string, PolicyModelReviewArtifact>;
  corpus: PolicyReviewGoldCorpus;
  thresholds?: RolloutThresholds;
}) {
  const thresholds = input.thresholds ?? DEFAULT_POLICY_REVIEW_ROLLOUT_THRESHOLDS;
  const provisionalEntries = input.corpus.entries.filter(
    (entry) => entry.reviewStatus === "provisional"
  );
  const humanReviewedEntries = input.corpus.entries.filter(
    (entry) =>
      entry.reviewStatus === "human_adjudicated" ||
      entry.reviewStatus === "independently_reviewed"
  );
  const pendingEntries = input.corpus.entries.filter(
    (entry) => entry.reviewStatus === "pending"
  );
  const distinctDomainCount = new Set(
    input.corpus.entries.map((entry) => normalizedDomain(entry.targetUrl))
  ).size;

  const humanReviewedCases: PolicyReviewEvaluationCase[] = [];
  const provisionalCases: PolicyReviewEvaluationCase[] = [];
  let missingHumanReviewedArtifactCount = 0;
  let missingProvisionalArtifactCount = 0;
  for (const entry of [...humanReviewedEntries, ...provisionalEntries]) {
    const artifact = input.artifactsByScanId.get(entry.scanId);
    if (!artifact) {
      if (
        entry.reviewStatus === "independently_reviewed" ||
        entry.reviewStatus === "human_adjudicated"
      ) {
        missingHumanReviewedArtifactCount += 1;
      } else {
        missingProvisionalArtifactCount += 1;
      }
      continue;
    }
    const evaluationCase = {
      artifact: policyModelReviewArtifactSchema.parse(artifact),
      baseline: entry.baseline,
      expected: entry.expected
    };
    if (
      entry.reviewStatus === "independently_reviewed" ||
      entry.reviewStatus === "human_adjudicated"
    ) {
      humanReviewedCases.push(evaluationCase);
    } else {
      provisionalCases.push(evaluationCase);
    }
  }

  const humanReviewedMetrics = evaluatePolicyReviewArtifacts(humanReviewedCases);
  const provisionalMetrics = evaluatePolicyReviewArtifacts(provisionalCases);
  const failures: string[] = [];
  if (input.corpus.entries.length < thresholds.minimumCandidateCases) {
    failures.push(
      `Candidate cohort requires ${thresholds.minimumCandidateCases} cases; observed ${input.corpus.entries.length}.`
    );
  }
  if (distinctDomainCount < thresholds.minimumDistinctDomains) {
    failures.push(
      `Candidate cohort requires ${thresholds.minimumDistinctDomains} distinct domains; observed ${distinctDomainCount}.`
    );
  }
  if (humanReviewedEntries.length < thresholds.minimumHumanReviewedCases) {
    failures.push(
      `Human adjudication requires ${thresholds.minimumHumanReviewedCases} cases; observed ${humanReviewedEntries.length}.`
    );
  }
  const artifactCoverageRate =
    humanReviewedEntries.length > 0
      ? humanReviewedCases.length / humanReviewedEntries.length
      : 0;
  if (artifactCoverageRate < thresholds.minimumArtifactCoverageRate) {
    failures.push(
      `Human-reviewed artifact coverage must be ${thresholds.minimumArtifactCoverageRate}; observed ${artifactCoverageRate}.`
    );
  }
  if (humanReviewedMetrics.failedArtifacts > thresholds.maximumFailedArtifacts) {
    failures.push(
      `Failed human-reviewed artifacts must not exceed ${thresholds.maximumFailedArtifacts}; observed ${humanReviewedMetrics.failedArtifacts}.`
    );
  }
  metricAtLeast(
    failures,
    "Overall exact agreement",
    humanReviewedMetrics.exactAgreementRate,
    thresholds.minimumOverallExactAgreement
  );
  metricAtLeast(
    failures,
    "Overall observed precision",
    humanReviewedMetrics.observedPrecision,
    thresholds.minimumOverallObservedPrecision
  );
  metricAtLeast(
    failures,
    "Overall observed recall",
    humanReviewedMetrics.observedRecall,
    thresholds.minimumOverallObservedRecall
  );
  for (const topic of POLICY_REVIEW_EVALUATION_TOPICS) {
    assessTopic(failures, topic, humanReviewedMetrics.byTopic[topic], thresholds);
  }
  const precisionFirstObservedProjectionReady =
    humanReviewedEntries.length >= thresholds.minimumHumanReviewedCases &&
    artifactCoverageRate >= thresholds.minimumArtifactCoverageRate &&
    humanReviewedMetrics.failedArtifacts <= thresholds.maximumFailedArtifacts &&
    humanReviewedMetrics.observedPrecision !== null &&
    humanReviewedMetrics.observedPrecision >=
      thresholds.minimumOverallObservedPrecision &&
    POLICY_REVIEW_EVALUATION_TOPICS.every((topic) => {
      const metrics = humanReviewedMetrics.byTopic[topic];
      return metrics.observedPrecision === null ||
        metrics.observedPrecision >= thresholds.minimumTopicObservedPrecision;
    });

  return {
    ready: failures.length === 0,
    precisionFirstObservedProjectionReady,
    approvedProjectionScope: precisionFirstObservedProjectionReady
      ? "observed_topics_only"
      : "none",
    productionEligible: precisionFirstObservedProjectionReady,
    failures,
    corpus: {
      candidateCaseCount: input.corpus.entries.length,
      distinctDomainCount,
      humanReviewedCaseCount: humanReviewedEntries.length,
      humanModelComparisonCaseCount: humanReviewedEntries.filter(
        (entry) => entry.reviewStatus === "human_adjudicated"
      ).length,
      independentlyReviewedCaseCount: humanReviewedEntries.filter(
        (entry) => entry.reviewStatus === "independently_reviewed"
      ).length,
      provisionalCaseCount: provisionalEntries.length,
      pendingCaseCount: pendingEntries.length,
      missingHumanReviewedArtifactCount,
      missingProvisionalArtifactCount,
      humanReviewedArtifactCoverageRate: artifactCoverageRate
    },
    thresholds,
    humanReviewedMetrics,
    provisionalMetrics
  };
}
