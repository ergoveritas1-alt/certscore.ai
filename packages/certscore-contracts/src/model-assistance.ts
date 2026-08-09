import { z } from "zod";

export const modelAssistRoleSchema = z.enum([
  "extraction",
  "review",
  "escalation",
]);

export const modelReviewModeSchema = z.enum(["shadow", "enforced"]);

export const policyReviewStatusSchema = z.enum([
  "observed",
  "not_observed_with_sufficient_coverage",
  "ambiguous",
  "conflicting",
  "insufficient_retained_evidence",
]);

export const policyReviewTopicSchema = z.enum([
  "processing_purposes",
  "legal_basis",
  "data_retention",
  "international_transfers",
  "vendor_disclosures",
  "data_subject_rights",
  "cookie_inventory",
  "policy_runtime_consistency",
]);

export const POLICY_REVIEW_TOPIC_DEFINITIONS = {
  processing_purposes: {
    displayLabel: "Processing-purpose disclosure",
    evidenceMeaning: "A substantive explanation of why personal data is processed.",
  },
  legal_basis: {
    displayLabel: "Processing legal-basis language",
    evidenceMeaning: "A substantive processing basis such as consent, contract, legal obligation, vital interests, public task, or legitimate interests.",
  },
  data_retention: {
    displayLabel: "Retention period or substantive criteria",
    evidenceMeaning: "A retention period or meaningful criteria governing how long personal data is kept.",
  },
  international_transfers: {
    displayLabel: "International-transfer disclosure",
    evidenceMeaning: "Destinations, circumstances, or mechanisms for international personal-data transfers.",
  },
  vendor_disclosures: {
    displayLabel: "Named vendors or recipient categories",
    evidenceMeaning: "At least one named recipient/vendor or a meaningful recipient category.",
  },
  data_subject_rights: {
    displayLabel: "Substantive privacy-rights signals",
    evidenceMeaning: "One or more substantive rights such as access, correction, deletion, restriction, portability, objection, or complaint.",
  },
  cookie_inventory: {
    displayLabel: "Observed cookie/storage names",
    evidenceMeaning: "At least one specific, non-placeholder cookie or browser-storage identifier retained from policy or runtime evidence.",
  },
  policy_runtime_consistency: {
    displayLabel: "Policy/runtime comparison",
    evidenceMeaning: "A comparison between a retained policy promise and a directly comparable retained runtime observation.",
  },
} as const satisfies Record<
  z.infer<typeof policyReviewTopicSchema>,
  { displayLabel: string; evidenceMeaning: string }
>;

export const policyRuntimeComparisonOutcomeSchema = z.enum([
  "no_material_mismatch_retained",
  "material_contradiction_retained",
  "insufficient_comparison_evidence",
  "ambiguous_comparison",
]);

export const modelAssistProvenanceSchema = z.object({
  role: modelAssistRoleSchema,
  provider: z.literal("openai"),
  requestedModel: z.string().min(1).max(120),
  resolvedModel: z.string().min(1).max(120),
  taskType: z.string().min(1).max(120),
  promptVersion: z.string().min(1).max(120),
  schemaVersion: z.string().min(1).max(120),
  inputRefs: z.array(z.string().min(1).max(500)).max(100).default([]),
  outputRefs: z.array(z.string().min(1).max(500)).max(100).default([]),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  confidence: z.number().min(0).max(1).nullable().default(null),
  reasonCodes: z.array(z.string().min(1).max(120)).max(30).default([]),
  uncertaintyNotes: z.array(z.string().min(1).max(500)).max(20).default([]),
  latencyMs: z.number().int().nonnegative().nullable().default(null),
  promptTokens: z.number().int().nonnegative().nullable().default(null),
  cachedPromptTokens: z.number().int().nonnegative().nullable().default(null),
  completionTokens: z.number().int().nonnegative().nullable().default(null),
  totalTokens: z.number().int().nonnegative().nullable().default(null),
  usedForProductionProjection: z.boolean().default(false),
});

export const policyModelReviewRowSchema = z.object({
  topic: policyReviewTopicSchema,
  status: policyReviewStatusSchema,
  comparisonOutcome: policyRuntimeComparisonOutcomeSchema.optional(),
  confidence: z.number().min(0).max(1),
  sourceDocumentIds: z.array(z.string().min(1).max(120)).max(20).default([]),
  sourceUrls: z.array(z.string().url().max(2_000)).max(20).default([]),
  evidenceExcerpts: z.array(z.string().min(1).max(1_200)).max(8).default([]),
  conflictingExcerpts: z.array(z.string().min(1).max(1_200)).max(8).default([]),
  reasonCodes: z.array(z.string().min(1).max(120)).max(20).default([]),
  rationale: z.string().min(1).max(1_000),
});

export const deterministicPolicyReviewSignalSchema = z.object({
  findingKey: z.literal("outdated_transfer_framework_referenced"),
  displayLabel: z.literal("Outdated transfer framework referenced"),
  status: z.literal("observed"),
  frameworkId: z.string().min(1).max(120),
  validityStatus: z.enum(["outdated", "invalidated"]),
  sourceDocumentId: z.string().min(1).max(120),
  sourceUrl: z.string().url().max(2_000),
  excerpt: z.string().min(1).max(1_200),
  reasonCodes: z.array(z.string().min(1).max(120)).max(12).default([]),
});

export const policyModelReviewArtifactSchema = z.object({
  contractVersion: z.enum(["policy_model_review.v1", "policy_model_review.v2"]),
  mode: modelReviewModeSchema,
  status: z.enum(["completed", "failed", "skipped"]),
  scanId: z.string().min(1).max(120),
  cacheKey: z.string().regex(/^[a-f0-9]{64}$/),
  rows: z.array(policyModelReviewRowSchema).max(32).default([]),
  deterministicLegalFrameworkSignals: z.array(z.object({
    frameworkId: z.string().min(1).max(120),
    validityStatus: z.enum(["current", "outdated", "invalidated", "unknown"]),
    sourceDocumentId: z.string().min(1).max(120),
    sourceUrl: z.string().url().max(2_000),
    excerpt: z.string().min(1).max(1_200),
  })).max(40).default([]),
  deterministicPolicyReviewSignals: z.array(
    deterministicPolicyReviewSignalSchema,
  ).max(40).default([]),
  failureReason: z.string().max(1_000).nullable().default(null),
  provenance: modelAssistProvenanceSchema,
  productionEligible: z.boolean().default(false),
});

export type ModelAssistRole = z.infer<typeof modelAssistRoleSchema>;
export type ModelReviewMode = z.infer<typeof modelReviewModeSchema>;
export type PolicyReviewStatus = z.infer<typeof policyReviewStatusSchema>;
export type PolicyReviewTopic = z.infer<typeof policyReviewTopicSchema>;
export type PolicyRuntimeComparisonOutcome = z.infer<typeof policyRuntimeComparisonOutcomeSchema>;
export type ModelAssistProvenance = z.infer<typeof modelAssistProvenanceSchema>;
export type PolicyModelReviewRow = z.infer<typeof policyModelReviewRowSchema>;
export type DeterministicPolicyReviewSignal = z.infer<typeof deterministicPolicyReviewSignalSchema>;
export type PolicyModelReviewArtifact = z.infer<typeof policyModelReviewArtifactSchema>;
