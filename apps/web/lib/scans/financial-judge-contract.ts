import {
  buildFinancialJudgePrompt,
  financialJudgeInputSchema,
  financialJudgeOutputSchema,
  type FinancialJudgeInput,
  type FinancialJudgeOutput
} from "@website-signal-risk-scanner/validation-shared";

export {
  buildFinancialJudgePrompt,
  financialJudgeInputSchema,
  financialJudgeOutputSchema,
  type FinancialJudgeInput,
  type FinancialJudgeOutput
};

export function getStoredFinancialJudgeOutput(record: Record<string, unknown> | null | undefined): FinancialJudgeOutput | null {
  const raw =
    record?.financialJudgeVerdict && typeof record.financialJudgeVerdict === "object"
      ? record.financialJudgeVerdict
      : record?.financial_judge_verdict && typeof record.financial_judge_verdict === "object"
        ? record.financial_judge_verdict
        : null;

  if (!raw) {
    return null;
  }

  const parsed = financialJudgeOutputSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
