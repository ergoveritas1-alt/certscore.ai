import { z } from "zod";

export const MCP_TASK_PURPOSES = ["prelaunch_review", "vendor_review", "tracking_check", "consent_gpc_check", "policy_review", "recheck", "other", "unknown"] as const;
const integrationToken = z.string().max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
// Question text is optional and explicitly shared, never a transcript or inferred prompt.
export const mcpTaskContextSchema = z.object({
  purpose: z.enum(MCP_TASK_PURPOSES).optional(),
  questionSummary: z.string().trim().min(1).max(300).optional(),
  questionSource: z.enum(["user_wording", "agent_paraphrase"]).optional(),
  shareForImprovement: z.boolean().optional(),
  integrationId: integrationToken.optional(),
  integrationVersion: integrationToken.optional(),
  skillVersion: integrationToken.optional(),
}).strict().superRefine((value, context) => {
  if (value.questionSummary && (!value.questionSource || value.shareForImprovement !== true)) {
    context.addIssue({ code: "custom", path: ["questionSummary"], message: "A question summary requires its source and explicit user-approved sharing for improvement." });
  }
});
export type McpTaskContext = z.infer<typeof mcpTaskContextSchema>;

export function sanitizeMcpTaskContext(value: unknown): McpTaskContext | null {
  const parsed = mcpTaskContextSchema.safeParse(value);
  if (!parsed.success) return null;
  const context = { ...parsed.data };
  if (context.questionSummary) {
    // Fail closed for likely secrets/contact details. No raw input is logged.
    const text = context.questionSummary;
    if (/https?:\/\/|www\.|@|\b(?:bearer|password|secret|token|api[_ -]?key)\b|\b\d{6,}\b|[A-Za-z0-9_=-]{40,}/i.test(text)) {
      delete context.questionSummary;
      delete context.questionSource;
    } else context.questionSummary = text.replace(/[\u0000-\u001f\u007f]/g, " ");
  }
  return context;
}
