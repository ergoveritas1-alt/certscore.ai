import type { CanonicalShadowScoreComparisonArtifact } from "./canonical-shadow-score-artifact";
import { canonicalShadowScoreSourceFamily } from "./canonical-shadow-score-comparison-source";

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
  const regionGroups = new Map<string, {
    comparisonGroupKey: string;
    regions: Set<string>;
    scanSource: string;
    scores: number[];
  }>();
  const sourceGroups = new Map<string, {
    comparisonGroupKey: string;
    region: string;
    scanSources: Set<string>;
    scores: number[];
  }>();
  const equivalentInputSourceGroups = new Map<string, {
    comparisonGroupKey: string;
    hasUnknownRegion: boolean;
    inputProjectionFingerprint: string;
    regions: Set<string>;
    scanSources: Set<string>;
    scores: number[];
  }>();

  for (const artifact of scored) {
    const groupKey = artifact.context.comparisonGroupKey;
    const targetKey = artifact.context.comparisonTargetKey;
    const region = artifact.context.region;
    const scanSource = artifact.context.scanSource;
    const score = artifact.candidate.postureScore;
    if (!groupKey || !targetKey || !scanSource || score === null) continue;
    const sourceFamily = canonicalShadowScoreSourceFamily(scanSource);
    const equivalentInputSourceGroupKey = `${groupKey}\u0000${targetKey}\u0000${artifact.inputProjectionFingerprint}`;
    const equivalentInputSourceValues = equivalentInputSourceGroups.get(equivalentInputSourceGroupKey) ?? {
      comparisonGroupKey: groupKey,
      hasUnknownRegion: false,
      inputProjectionFingerprint: artifact.inputProjectionFingerprint,
      regions: new Set<string>(),
      scanSources: new Set<string>(),
      scores: []
    };
    equivalentInputSourceValues.hasUnknownRegion ||= !region;
    if (region) equivalentInputSourceValues.regions.add(region);
    equivalentInputSourceValues.scanSources.add(sourceFamily);
    equivalentInputSourceValues.scores.push(score);
    equivalentInputSourceGroups.set(equivalentInputSourceGroupKey, equivalentInputSourceValues);
    if (!region) continue;
    const regionGroupKey = `${groupKey}\u0000${targetKey}\u0000${sourceFamily}`;
    const regionValues = regionGroups.get(regionGroupKey) ?? {
      comparisonGroupKey: groupKey,
      regions: new Set<string>(),
      scanSource: sourceFamily,
      scores: []
    };
    regionValues.regions.add(region);
    regionValues.scores.push(score);
    regionGroups.set(regionGroupKey, regionValues);

    const sourceGroupKey = `${groupKey}\u0000${targetKey}\u0000${region}`;
    const sourceValues = sourceGroups.get(sourceGroupKey) ?? {
      comparisonGroupKey: groupKey,
      region,
      scanSources: new Set<string>(),
      scores: []
    };
    sourceValues.scanSources.add(sourceFamily);
    sourceValues.scores.push(score);
    sourceGroups.set(sourceGroupKey, sourceValues);

  }

  const crossRegionRanges = [...regionGroups.values()].flatMap((values) => {
    if (values.regions.size < 2 || values.scores.length < 2) return [];
    return [{
      comparisonGroupKey: values.comparisonGroupKey,
      maxScore: Math.max(...values.scores),
      minScore: Math.min(...values.scores),
      range: Math.max(...values.scores) - Math.min(...values.scores),
      regionCount: values.regions.size,
      scanSource: values.scanSource,
      sampleCount: values.scores.length
    }];
  }).sort((left, right) => right.range - left.range || left.comparisonGroupKey.localeCompare(right.comparisonGroupKey));
  const crossSourceRanges = [...sourceGroups.values()].flatMap((values) => {
    if (values.scanSources.size < 2 || values.scores.length < 2) return [];
    return [{
      comparisonGroupKey: values.comparisonGroupKey,
      maxScore: Math.max(...values.scores),
      minScore: Math.min(...values.scores),
      range: Math.max(...values.scores) - Math.min(...values.scores),
      region: values.region,
      sampleCount: values.scores.length,
      sourceCount: values.scanSources.size
    }];
  }).sort((left, right) => right.range - left.range || left.comparisonGroupKey.localeCompare(right.comparisonGroupKey));
  const equivalentInputCrossSourceRanges = [...equivalentInputSourceGroups.values()].flatMap((values) => {
    if (values.scanSources.size < 2 || values.scores.length < 2) return [];
    return [{
      comparisonGroupKey: values.comparisonGroupKey,
      hasUnknownRegion: values.hasUnknownRegion,
      inputProjectionFingerprint: values.inputProjectionFingerprint,
      maxScore: Math.max(...values.scores),
      minScore: Math.min(...values.scores),
      range: Math.max(...values.scores) - Math.min(...values.scores),
      regions: [...values.regions].sort(),
      sampleCount: values.scores.length,
      sourceCount: values.scanSources.size
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
    crossSource: {
      comparedGroupCount: crossSourceRanges.length,
      maximumScoreRange: crossSourceRanges[0]?.range ?? null,
      ranges: crossSourceRanges.slice(0, 100)
    },
    equivalentInputCrossSource: {
      comparedGroupCount: equivalentInputCrossSourceRanges.length,
      maximumScoreRange: equivalentInputCrossSourceRanges[0]?.range ?? null,
      ranges: equivalentInputCrossSourceRanges.slice(0, 100)
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
