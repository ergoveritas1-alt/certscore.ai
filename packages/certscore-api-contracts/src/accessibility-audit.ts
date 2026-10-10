import { z } from "zod";

export const apiAccessibilityAuditSummarySchema = z.object({
  status: z.enum(["completed", "limited", "failed", "not_testable"]), required: z.literal(true),
  scope: z.literal("starting_page_rendered_content"), engine: z.literal("axe-core"),
  engineVersion: z.string().nullable(), durationMs: z.number().int().nonnegative().nullable(),
  failedRuleCount: z.number().int().nonnegative().nullable(), affectedNodeCount: z.number().int().nonnegative().nullable(),
  reviewRuleCount: z.number().int().nonnegative().nullable(),
}).strict();

export type ApiAccessibilityAuditSummary = z.infer<typeof apiAccessibilityAuditSummarySchema>;
