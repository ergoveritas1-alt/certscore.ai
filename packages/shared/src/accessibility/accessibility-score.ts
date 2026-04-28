import type { AccessibilityScoreResult, AccessibilityRiskBand, NormalizedAccessibilityFinding } from "../types/accessibility";

type ScoreRuleFamily = {
  id: string;
  impact: string;
  affectedNodeCount: number;
};

const IMPACT_WEIGHTS: Record<string, { base: number; perNode: number; familyCap: number }> = {
  critical: { base: 12, perNode: 1, familyCap: 25 },
  serious: { base: 8, perNode: 0.75, familyCap: 20 },
  moderate: { base: 4, perNode: 0.35, familyCap: 12 },
  minor: { base: 1.5, perNode: 0.15, familyCap: 6 }
};

function computeRawDeduction(families: ScoreRuleFamily[]): number {
  let total = 0;
  for (const family of families) {
    const weight = IMPACT_WEIGHTS[family.impact.toLowerCase()];
    if (!weight) {
      continue;
    }
    const nodeDeduction = family.affectedNodeCount * weight.perNode;
    const familyDeduction = Math.min(weight.base + nodeDeduction, weight.familyCap);
    total += familyDeduction;
  }
  return total;
}

function getRiskBand(score: number): AccessibilityRiskBand {
  if (score >= 90) return "low_risk";
  if (score >= 75) return "moderate_risk";
  if (score >= 50) return "high_risk";
  return "severe_risk";
}

export function computeAccessibilityScore(findings: NormalizedAccessibilityFinding[]): AccessibilityScoreResult {
  const families: ScoreRuleFamily[] = [];
  const impactCounts: Record<string, number> = {};
  let totalAffectedNodes = 0;

  for (const finding of findings) {
    const existing = families.find((f) => f.id === finding.axeRuleId);
    if (existing) {
      existing.affectedNodeCount += finding.affectedNodeCount;
    } else {
      families.push({
        id: finding.axeRuleId,
        impact: finding.axeImpact,
        affectedNodeCount: finding.affectedNodeCount
      });
    }
    const impact = finding.axeImpact.toLowerCase();
    impactCounts[impact] = (impactCounts[impact] ?? 0) + 1;
    totalAffectedNodes += finding.affectedNodeCount;
  }

  if (families.length === 0) {
    return {
      score: 96,
      band: "low_risk",
      explanation: [
        "No automated accessibility violations were detected.",
        "Score capped at 96 because automated testing cannot detect all accessibility barriers."
      ]
    };
  }

  let score = 100 - computeRawDeduction(families);

  const hasCritical = (impactCounts["critical"] ?? 0) > 0;
  const seriousFamilyCount = families.filter((f) => f.impact.toLowerCase() === "serious").length;

  // Apply global caps
  if (hasCritical) {
    score = Math.min(score, 79);
  }
  if (seriousFamilyCount >= 3) {
    score = Math.min(score, 72);
  }
  if (totalAffectedNodes > 100) {
    score = Math.min(score, 69);
  }

  score = Math.max(0, Math.round(score));

  const band = getRiskBand(score);
  const explanation: string[] = [];

  if (hasCritical) {
    explanation.push("Critical accessibility violations were detected; maximum score capped at 79.");
  }
  if (seriousFamilyCount >= 3) {
    explanation.push("Three or more serious rule families detected; maximum score capped at 72.");
  }
  if (totalAffectedNodes > 100) {
    explanation.push("High number of affected nodes detected; maximum score capped at 69.");
  }

  const familySummary = families
    .sort((a, b) => b.affectedNodeCount - a.affectedNodeCount)
    .slice(0, 5)
    .map((f) => `${f.id} (${f.impact}, ${f.affectedNodeCount} node${f.affectedNodeCount === 1 ? "" : "s"})`);

  explanation.push(`Top issues: ${familySummary.join(", ")}.`);

  return { score, band, explanation };
}
