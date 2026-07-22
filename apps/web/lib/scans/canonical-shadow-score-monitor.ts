import { canonicalShadowScoreSourceFamily } from "./canonical-shadow-score-comparison-source";

export type StoredCanonicalShadowComparisonMetric = {
  candidateCoverageRatio: number;
  candidateScore: number | null;
  comparisonGroupKey: string | null;
  comparisonTargetKey: string | null;
  coverageProjectionFingerprint: string | null;
  coverageProjectionRowCount: number | null;
  contradictionTypes: string[];
  deliberatePairKey: string | null;
  deliberatePairSourceFamily: "lambda" | "browser_extension" | null;
  generatedAt: string;
  inputProjectionFingerprint: string | null;
  findingProjectionFingerprint: string | null;
  findingProjectionCount: number | null;
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
  const equivalentInputSourceGroups = new Map<string, StoredCanonicalShadowComparisonMetric[]>();
  const deliberatePairGroups = new Map<string, StoredCanonicalShadowComparisonMetric[]>();
  for (const metric of metrics) {
    if (metric.deliberatePairKey && metric.deliberatePairSourceFamily) {
      const pairRows = deliberatePairGroups.get(metric.deliberatePairKey) ?? [];
      pairRows.push(metric);
      deliberatePairGroups.set(metric.deliberatePairKey, pairRows);
    }
    if (!metric.comparisonGroupKey || !metric.comparisonTargetKey || !metric.scanSource || metric.candidateScore === null) continue;
    const sourceFamily = canonicalShadowScoreSourceFamily(metric.scanSource);
    if (metric.inputProjectionFingerprint) {
      const equivalentInputSourceKey = `${metric.comparisonGroupKey}\u0000${metric.comparisonTargetKey}\u0000${metric.inputProjectionFingerprint}`;
      const equivalentInputSourceRows = equivalentInputSourceGroups.get(equivalentInputSourceKey) ?? [];
      equivalentInputSourceRows.push(metric);
      equivalentInputSourceGroups.set(equivalentInputSourceKey, equivalentInputSourceRows);
    }
    if (!metric.region) continue;
    const regionKey = `${metric.comparisonGroupKey}\u0000${metric.comparisonTargetKey}\u0000${sourceFamily}`;
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
      scanSource: canonicalShadowScoreSourceFamily(rows[0]!.scanSource!),
      sampleCount: scores.length
    }];
  }).sort((left, right) => right.range - left.range || left.comparisonGroupKey.localeCompare(right.comparisonGroupKey));
  const sourceRanges = [...sourceGroups.values()].flatMap((rows) => {
    const scanSources = new Set(rows.map((row) => canonicalShadowScoreSourceFamily(row.scanSource!)));
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
  const equivalentInputSourceRanges = [...equivalentInputSourceGroups.values()].flatMap((rows) => {
    const sourceFamilies = new Set(rows.map((row) => canonicalShadowScoreSourceFamily(row.scanSource!)));
    const scores = rows.flatMap((row) => row.candidateScore ?? []);
    if (sourceFamilies.size < 2 || scores.length < 2) return [];
    const regions = [...new Set(rows.flatMap((row) => row.region ?? []))].sort();
    return [{
      comparisonGroupKey: rows[0]!.comparisonGroupKey!,
      hasUnknownRegion: rows.some((row) => row.region === null),
      inputProjectionFingerprint: rows[0]!.inputProjectionFingerprint!,
      maxScore: Math.max(...scores),
      minScore: Math.min(...scores),
      range: Math.max(...scores) - Math.min(...scores),
      regions,
      sampleCount: scores.length,
      sourceCount: sourceFamilies.size
    }];
  }).sort((left, right) => right.range - left.range || left.comparisonGroupKey.localeCompare(right.comparisonGroupKey));
  const deliberatePairs = [...deliberatePairGroups.entries()].flatMap(([pairKey, rows]) => {
    const sourceFamilies = new Set(rows.flatMap((row) => row.deliberatePairSourceFamily ?? []));
    const targetKeys = new Set(rows.flatMap((row) => row.comparisonTargetKey ?? []));
    const modelVersions = new Set(rows.map((row) => row.modelVersion));
    if (rows.length !== 2 || sourceFamilies.size !== 2 || targetKeys.size !== 1 || modelVersions.size !== 1) return [];
    const scores = rows.flatMap((row) => row.candidateScore ?? []);
    const inputFingerprints = rows.flatMap((row) => row.inputProjectionFingerprint ?? []);
    const coverageFingerprints = rows.flatMap((row) => row.coverageProjectionFingerprint ?? []);
    const findingFingerprints = rows.flatMap((row) => row.findingProjectionFingerprint ?? []);
    const lambdaRows = rows.filter((row) => row.deliberatePairSourceFamily === "lambda");
    const browserRows = rows.filter((row) => row.deliberatePairSourceFamily === "browser_extension");
    return [{
      browserRegionUnknown: browserRows.every((row) => row.region === null),
      coverageProjectionMatched: coverageFingerprints.length === 2 && new Set(coverageFingerprints).size === 1,
      coverageRowCounts: rows.map((row) => ({
        count: row.coverageProjectionRowCount,
        sourceFamily: row.deliberatePairSourceFamily!
      })).sort((left, right) => left.sourceFamily.localeCompare(right.sourceFamily)),
      exactInputMatched: inputFingerprints.length === 2 && new Set(inputFingerprints).size === 1,
      findingCounts: rows.map((row) => ({
        count: row.findingProjectionCount,
        sourceFamily: row.deliberatePairSourceFamily!
      })).sort((left, right) => left.sourceFamily.localeCompare(right.sourceFamily)),
      findingProjectionMatched: findingFingerprints.length === 2 && new Set(findingFingerprints).size === 1,
      lambdaRegions: [...new Set(lambdaRows.flatMap((row) => row.region ?? []))].sort(),
      maxScore: scores.length === 2 ? Math.max(...scores) : null,
      minScore: scores.length === 2 ? Math.min(...scores) : null,
      pairKey,
      range: scores.length === 2 ? Math.max(...scores) - Math.min(...scores) : null,
      scanIds: rows.map((row) => row.scanId).sort(),
      sourceFamilies: [...sourceFamilies].sort(),
      withheldCount: rows.length - scores.length
    }];
  }).sort((left, right) => (right.range ?? -1) - (left.range ?? -1) || left.pairKey.localeCompare(right.pairKey));

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
    deliberateCrossSourcePairs: {
      exactInputMatchCount: deliberatePairs.filter((pair) => pair.exactInputMatched).length,
      pairCount: deliberatePairs.length,
      pairs: deliberatePairs.slice(0, 100)
    },
    equivalentInputCrossSource: {
      comparedGroupCount: equivalentInputSourceRanges.length,
      maximumScoreRange: equivalentInputSourceRanges[0]?.range ?? null,
      ranges: equivalentInputSourceRanges.slice(0, 100)
    },
    modelVersions: [...new Set(metrics.map((metric) => metric.modelVersion))].sort(),
    sampleCount: metrics.length,
    scoredCount: metrics.length - withheld.length,
    withheldCount: withheld.length,
    withheldRate: ratio(withheld.length, metrics.length),
    withholdingReasons: [...new Set(withheld.flatMap((metric) => metric.withholdingReasons))].sort()
  };
}
