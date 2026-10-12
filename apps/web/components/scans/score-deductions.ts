export type ScoreDeductions = ReadonlyArray<{
  family: string;
  deductionPoints: number;
  rules: ReadonlyArray<{ ruleId: string; label: string }>;
}>;
