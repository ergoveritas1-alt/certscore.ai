import { z } from "zod";

export const apiV2PostureScoresSchema = z.object({
  contractVersion: z.literal("certscore.posture-scores.v1"),
  gdprEprivacy: z.object({
    posture: z.literal("gdpr_eprivacy"),
    score: z.number().int().min(0).max(100).nullable(),
    policyVersion: z.string().nullable(),
    coverage: z.enum(["scored", "unavailable"]),
    scope: z.literal("starting_page"),
  }).strict(),
  ccpaCpra: z.object({
    posture: z.literal("ccpa_cpra"),
    score: z.number().int().min(0).max(100).nullable(),
    policyVersion: z.string().min(1),
    coverage: z.enum(["bounded", "limited", "unavailable"]),
    scope: z.literal("starting_page"),
    coverageSummary: z.object({
      postureBasis:z.literal("assuming_ccpa_applies"), evidenceFamilies:z.number().int().min(0).max(6), totalFamilies:z.literal(6), scoreReady:z.boolean(),
      families:z.array(z.object({id:z.string(),status:z.enum(["observed","assessed_gap","review","unknown","not_triggered_in_scope"]),
        assessmentState:z.enum(["completed","partial","limited"]).optional(),followUp:z.enum(["none","purpose","notice_association","recipient_roles","applicability","choice_execution","interpretation","capture"]).optional(),
      }).strict()).length(6),
    }).strict().optional(),
  }).strict(),
}).strict();
export type ApiV2PostureScores = z.infer<typeof apiV2PostureScoresSchema>;
