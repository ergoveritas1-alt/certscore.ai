export type StoredCanonicalShadowComparisonMetric = {
  candidateCoverageRatio: number;
  candidateScore: number | null;
  comparisonGroupKey: string | null;
  comparisonTargetKey: string | null;
  contradictionTypes: string[];
  generatedAt: string;
  legacyCoverageRatio: number;
  legacyScore: number | null;
  modelVersion: string;
  region: string | null;
  reportUsableEvidenceRatio: number;
  scanId: string;
  scanSource: string | null;
  scoreDelta: number | null;
  withholdingReasons: string[];
};

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

function percentile(values: number[], quantile: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index] ?? null;
}

export function summarizeStoredCanonicalShadowComparisons(
  metrics: StoredCanonicalShadowComparisonMetric[]
) {
  const deltas = metrics.flatMap((metric) => metric.scoreDelta ?? []);
  const contradicted = metrics.filter((metric) => metric.contradictionTypes.length > 0);
  const withheld = metrics.filter((metric) => metric.candidateScore === null);
  const regionGroups = new Map<string, StoredCanonicalShadowComparisonMetric[]>();
  const sourceGroups = new Map<string, StoredCanonicalShadowComparisonMetric[]>();
  for (const metric of metrics) {
    if (!metric.comparisonGroupKey || !metric.comparisonTargetKey || !metric.region || !metric.scanSource || metric.candidateScore === null) continue;
    const regionKey = `${metric.comparisonGroupKey}\u0000${metric.comparisonTargetKey}\u0000${metric.scanSource}`;
    const regionRows = regionGroups.get(regionKey) ?? [];
    regionRows.push(metric);
    regionGroups.set(regionKey, regionRows);
    const sourceKey = `${metric.comparisonGroupKey}\u0000${metric.comparisonTargetKey}\u0000${metric.region}`;
    const sourceRows = sourceGroups.get(sourceKey) ?? [];
    sourceRows.push(metric);
    sourceGroups.set(sourceKey, sourceRows);
  }
  const regionRanges = [...regionGroups.values()].flatMap((rows) => {
    const regions = new Set(rows.map((row) => row.region));
    const scores = rows.flatMap((row) => row.candidateScore ?? []);
    if (regions.size < 2 || scores.length < 2) return [];
    return [{
      comparisonGroupKey: rows[0]!.comparisonGroupKey!,
      maxScore: Math.max(...scores),
      minScore: Math.min(...scores),
      range: Math.max(...scores) - Math.min(...scores),
      regionCount: regions.size,
      scanSource: rows[0]!.scanSource!,
      sampleCount: scores.length
    }];
  }).sort((left, right) => right.range - left.range || left.comparisonGroupKey.localeCompare(right.comparisonGroupKey));
  const sourceRanges = [...sourceGroups.values()].flatMap((rows) => {
    const scanSources = new Set(rows.map((row) => row.scanSource));
    const scores = rows.flatMap((row) => row.candidateScore ?? []);
    if (scanSources.size < 2 || scores.length < 2) return [];
    return [{
      comparisonGroupKey: rows[0]!.comparisonGroupKey!,
      maxScore: Math.max(...scores),
      minScore: Math.min(...scores),
      range: Math.max(...scores) - Math.min(...scores),
      region: rows[0]!.region!,
      sampleCount: scores.length,
      sourceCount: scanSources.size
    }];
  }).sort((left, right) => right.range - left.range || left.comparisonGroupKey.localeCompare(right.comparisonGroupKey));

  return {
    comparison: {
      absoluteDeltaMedian: percentile(deltas.map(Math.abs), 0.5),
      absoluteDeltaP95: percentile(deltas.map(Math.abs), 0.95),
      comparableCount: deltas.length
    },
    contradictions: {
      count: contradicted.length,
      rate: ratio(contradicted.length, metrics.length),
      types: [...new Set(contradicted.flatMap((metric) => metric.contradictionTypes))].sort()
    },
    crossRegion: {
      comparedGroupCount: regionRanges.length,
      maximumScoreRange: regionRanges[0]?.range ?? null,
      ranges: regionRanges.slice(0, 100)
    },
    crossSource: {
      comparedGroupCount: sourceRanges.length,
      maximumScoreRange: sourceRanges[0]?.range ?? null,
      ranges: sourceRanges.slice(0, 100)
    },
    modelVersions: [...new Set(metrics.map((metric) => metric.modelVersion))].sort(),
    sampleCount: metrics.length,
    scoredCount: metrics.length - withheld.length,
    withheldCount: withheld.length,
    withheldRate: ratio(withheld.length, metrics.length),
    withholdingReasons: [...new Set(withheld.flatMap((metric) => metric.withholdingReasons))].sort()
  };
}
