import { z } from "zod";

const token = z.string().regex(/^[a-zA-Z0-9_.:-]{1,80}$/);
export const mcpResponseSummarySchema = z.object({
  version: z.literal(1),
  captureBasis: z.literal("response_generated"),
  templateVersion: z.literal("2026-09-11.1"),
  kind: z.enum(["tool_result", "protocol_error"]),
  isError: z.boolean(),
  type: token.optional(),
  status: token.optional(),
  errorCode: token.optional(),
  reasonCode: token.optional(),
  mcpCode: z.number().int().optional(),
  retryable: z.boolean().optional(),
  retryAfterSeconds: z.number().int().min(0).max(86400).nullable().optional(),
  recommendedNextTool: token.nullable().optional(),
  message: z.string().max(400).optional(),
  recommendedNextAction: z.string().max(800).optional(),
  textOmitted: z.boolean(),
  summaryTruncated: z.boolean(),
  issues: z.array(z.object({ field: token, code: token, required: z.boolean().optional() }).strict()).max(8).optional(),
  upstream: z.object({
    operation: z.enum(["scan_create", "scan_status", "scan_resource", "findings", "finding", "report", "evidence", "pre_consent", "domain_latest", "other"]),
    httpStatus: z.number().int().min(100).max(599).optional(),
    requestId: z.string().uuid().optional(),
  }).strict().optional(),
}).strict().refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= 2048, "Response summary exceeds 2 KB");
export type McpResponseSummary = z.infer<typeof mcpResponseSummarySchema>;
