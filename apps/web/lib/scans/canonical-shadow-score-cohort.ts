import type { CanonicalShadowScoreComparisonArtifact } from "./canonical-shadow-score-artifact";

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

function percentile(values: number[], quantile: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index] ?? null;
}

export function summarizeCanonicalShadowScoreCohort(
  artifacts: CanonicalShadowScoreComparisonArtifact[]
) {
  const scored = artifacts.filter((artifact) => artifact.candidate.postureScore !== null);
  const withheld = artifacts.filter((artifact) => artifact.candidate.postureScore === null);
  const contradicted = artifacts.filter((artifact) =>
    artifact.candidate.contradictions.length > 0 || artifact.comparison.contradictions.length > 0
  );
  const deltas = artifacts.flatMap((artifact) => artifact.comparison.delta ?? []);
  const groupScores = new Map<string, number[]>();

  for (const artifact of scored) {
    const groupKey = artifact.context.comparisonGroupKey;
    const score = artifact.candidate.postureScore;
    if (!groupKey || score === null) continue;
    const values = groupScores.get(groupKey) ?? [];
    values.push(score);
    groupScores.set(groupKey, values);
  }

  const crossRegionRanges = [...groupScores.entries()].flatMap(([comparisonGroupKey, scores]) => {
    if (scores.length < 2) return [];
    return [{
      comparisonGroupKey,
      maxScore: Math.max(...scores),
      minScore: Math.min(...scores),
      range: Math.max(...scores) - Math.min(...scores),
      sampleCount: scores.length
    }];
  }).sort((left, right) => right.range - left.range || left.comparisonGroupKey.localeCompare(right.comparisonGroupKey));

  return {
    comparison: {
      absoluteDeltaMedian: percentile(deltas.map(Math.abs), 0.5),
      absoluteDeltaP95: percentile(deltas.map(Math.abs), 0.95),
      candidateHigherCount: artifacts.filter((artifact) => artifact.comparison.status === "candidate_higher").length,
      candidateLowerCount: artifacts.filter((artifact) => artifact.comparison.status === "candidate_lower").length,
      comparableCount: deltas.length,
      unchangedCount: artifacts.filter((artifact) => artifact.comparison.status === "unchanged").length
    },
    contradictions: {
      count: contradicted.length,
      rate: ratio(contradicted.length, artifacts.length),
      types: [...new Set(contradicted.flatMap((artifact) => [
        ...artifact.candidate.contradictions,
        ...artifact.comparison.contradictions
      ]))].sort()
    },
    coverageConfidenceCounts: {
      high: artifacts.filter((artifact) => artifact.candidate.coverageConfidence === "high").length,
      insufficient: artifacts.filter((artifact) => artifact.candidate.coverageConfidence === "insufficient").length,
      low: artifacts.filter((artifact) => artifact.candidate.coverageConfidence === "low").length,
      medium: artifacts.filter((artifact) => artifact.candidate.coverageConfidence === "medium").length
    },
    crossRegion: {
      comparedGroupCount: crossRegionRanges.length,
      maximumScoreRange: crossRegionRanges[0]?.range ?? null,
      ranges: crossRegionRanges.slice(0, 100)
    },
    cutoverEligibleCount: artifacts.filter((artifact) => artifact.cutoverEligible).length,
    modelVersions: [...new Set(artifacts.map((artifact) => artifact.candidate.modelVersion))].sort(),
    sampleCount: artifacts.length,
    scoredCount: scored.length,
    withheldCount: withheld.length,
    withheldRate: ratio(withheld.length, artifacts.length),
    withholdingReasons: [...new Set(withheld.flatMap((artifact) => artifact.candidate.withheldReasons))].sort()
  };
}
