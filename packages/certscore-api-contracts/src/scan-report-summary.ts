import { z } from "zod";

export function formCountStatus(totalObserved: number, incomplete: boolean): "captured" | "limited" | "not_captured" {
  return incomplete ? totalObserved > 0 ? "limited" : "not_captured" : "captured";
}

/** Counts of retained reportable observations; never proof that untested phases have no forms. */
export const scanFormsSummarySchema = z.object({
  contractVersion: z.literal("certscore.forms-summary.v1"),
  scope: z.literal("starting_page_reportable_observations"),
  totalObserved: z.number().int().nonnegative(),
  preConsentObserved: z.number().int().nonnegative().nullable(),
  afterAcceptObserved: z.number().int().nonnegative().nullable(),
  preConsentCapture: z.enum(["complete", "limited", "unavailable"]),
  afterAcceptCapture: z.enum(["retained", "limited", "unavailable"]),
  countStatus: z.enum(["captured", "limited", "not_captured"]).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.totalObserved !== (value.preConsentObserved ?? 0) + (value.afterAcceptObserved ?? 0) ||
    (value.preConsentCapture === "unavailable") !== (value.preConsentObserved === null) ||
    (value.afterAcceptCapture === "unavailable") !== (value.afterAcceptObserved === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Form totals require retained phase counts; unavailable is not zero." });
  }
  if ((value.countStatus === "not_captured" && value.totalObserved !== 0) || (value.countStatus === "limited" && value.totalObserved === 0) ||
    (value.countStatus === "captured" && (value.preConsentCapture !== "complete" || value.afterAcceptCapture === "limited"))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Incomplete empty capture cannot be a numeric zero or a positive lower bound." });
  }
});

/** Family amounts are capped; per-rule policy amounts explain the eligible contributors. */
export const scanScoreExplanationSchema = z.object({
  contractVersion: z.literal("certscore.score-explanation.v1"),
  scope: z.literal("starting_page_canonical_score"),
  scoreVersion: z.string().max(120),
  policyVersion: z.string().max(120),
  baseScore: z.literal(100),
  scoreFloor: z.literal(0),
  score: z.number().int().min(0).max(100),
  totalPolicyDeductionPoints: z.number().int().nonnegative(),
  deductions: z.array(z.object({
    family: z.string().max(80), label: z.string().max(160), deductionPoints: z.number().int().positive(),
    rules: z.array(z.object({
      ruleId: z.string().max(160), label: z.string().max(160), policyDeductionPoints: z.number().int().positive(),
      findingIds: z.array(z.string().max(180)).max(4),
      decisionVerification: z.enum(["confirmed", "unconfirmed", "not_applicable", "unknown"]),
    }).strict()).max(40),
  }).strict()).max(16),
}).strict().superRefine((value, ctx) => {
  if (value.totalPolicyDeductionPoints !== value.deductions.reduce((sum, row) => sum + row.deductionPoints, 0) ||
    value.score !== Math.max(value.scoreFloor, value.baseScore - value.totalPolicyDeductionPoints)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Score explanation must reconcile with capped canonical deductions." });
  }
});

export type ScanFormsSummary = z.infer<typeof scanFormsSummarySchema>;
export type ScanScoreExplanation = z.infer<typeof scanScoreExplanationSchema>;
