import React from "react";
export type ScoreDeductions = ReadonlyArray<{
  family: string;
  deductionPoints: number;
  rules: ReadonlyArray<{ ruleId: string; label: string }>;
}>;

/** Attribution of an applied canonical deduction; never infer a finding from policy discovery. */
export function PrivacyPolicyScoreDeduction({ deductions }: { deductions?: ScoreDeductions | null }) {
  const family = deductions?.find(row => row.family === "policy_transparency" &&
    row.rules.length === 1 && row.rules[0]?.ruleId === "privacy_notice_availability");
  if (!family || family.deductionPoints <= 0) return null;
  return <p className="mt-3 text-sm font-medium text-rose-700" data-testid="privacy-policy-score-deduction">
    {family.rules[0]!.label}: −{family.deductionPoints} points
  </p>;
}
