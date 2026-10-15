import { z } from "zod";

export const apiAccessibilityExampleCoverageSchema = z.object({
  version: z.literal("breadth_before_detail.v1"),
  observedNodeCount: z.number().int().nonnegative().max(200_000_000),
  retainedNodeCount: z.number().int().nonnegative().max(1000),
  omittedNodeCount: z.number().int().nonnegative().max(200_000_000),
  byteBudgetLimited: z.boolean(),
}).strict().refine(value => value.retainedNodeCount + value.omittedNodeCount === value.observedNodeCount,
  "Retained and omitted examples must reconcile with observed nodes.");

/** Shared public metadata for API v2, Pulse and agent documentation. */
export const accessibilityAuditEvidenceOpenApiProperties = {
  evidenceScope: { type: "string", enum: ["stable_main_document_positive_findings"] },
  exampleCoverage: {
    type: "object", additionalProperties: false,
    description: "Retained example detail, independent of engine coverage. Omitted on historical captures without this metadata.",
    required: ["version", "observedNodeCount", "retainedNodeCount", "omittedNodeCount", "byteBudgetLimited"],
    properties: {
      version: { type: "string", enum: ["breadth_before_detail.v1"] },
      observedNodeCount: { type: "integer", minimum: 0, maximum: 200_000_000 },
      retainedNodeCount: { type: "integer", minimum: 0, maximum: 1000 },
      omittedNodeCount: { type: "integer", minimum: 0, maximum: 200_000_000 },
      byteBudgetLimited: { type: "boolean" },
    },
  },
} as const;

export const apiAccessibilityAuditSummarySchema = z.object({
  status: z.enum(["completed", "limited", "failed", "not_testable"]), required: z.literal(true),
  scope: z.literal("starting_page_rendered_content"), engine: z.literal("axe-core"),
  engineVersion: z.string().nullable(), durationMs: z.number().int().nonnegative().nullable(),
  failedRuleCount: z.number().int().nonnegative().nullable(), affectedNodeCount: z.number().int().nonnegative().nullable(),
  reviewRuleCount: z.number().int().nonnegative().nullable(),
  evidenceScope: z.literal("stable_main_document_positive_findings").optional(),
  exampleCoverage: apiAccessibilityExampleCoverageSchema.optional(),
}).strict();

export type ApiAccessibilityAuditSummary = z.infer<typeof apiAccessibilityAuditSummarySchema>;
