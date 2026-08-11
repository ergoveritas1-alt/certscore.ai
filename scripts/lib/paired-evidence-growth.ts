export type EvidenceRegion = "california" | "eu_ie";

export type PairedEvidenceRegionRow = {
  evidenceComplete: boolean;
  projectionComplete: boolean;
  cmpObserved: boolean | null;
  cookieDetailCount: number | null;
  checklistObservedCount: number | null;
  thirdPartyNonEssentialStorageCount: number | null;
};

export type PairedEvidenceRow = {
  domain: string;
  rank: number | null;
  california: PairedEvidenceRegionRow;
  eu_ie: PairedEvidenceRegionRow;
};

export type PairedEvidenceGrowthInput = {
  baseline: PairedEvidenceRow[];
  current: PairedEvidenceRow[];
  bootstrapIterations?: number;
  rankBinSize?: number;
  seed?: number;
};

type NumericMetricKey =
  | "cmpObserved"
  | "cookieDetailCount"
  | "checklistObservedCount"
  | "thirdPartyNonEssentialStorageCount";

export type MetricComparison = {
  baselineMean: number | null;
  bootstrapExpectedInterval95: [number, number] | null;
  currentMean: number | null;
  currentToBaselineRatio: number | null;
  currentToRankAdjustedExpectedRatio: number | null;
  rankAdjustedExpectedMean: number | null;
  belowRankAdjustedInterval: boolean | null;
};

export type RegionGrowthSummary = {
  baselineCoverage: CoverageSummary;
  currentCoverage: CoverageSummary;
  metrics: Record<NumericMetricKey, MetricComparison>;
};

export type CoverageSummary = {
  evidenceCompleteRate: number;
  pairs: number;
  projectionCompleteRate: number;
};

export type PairedEvidenceGrowthReport = {
  reportVersion: "certscore.paired_evidence_growth.1";
  verdict:
    | "evidence_pipeline_shortfall"
    | "signal_prevalence_shift_without_retention_loss"
    | "within_rank_adjusted_expectation"
    | "insufficient_sample";
  summary: {
    baselinePairs: number;
    currentPairs: number;
    matchedDomains: number;
    materiallyLowMetricsAcrossBothRegions: number;
  };
  regions: Record<EvidenceRegion, RegionGrowthSummary>;
  notes: string[];
};

const REGIONS: EvidenceRegion[] = ["california", "eu_ie"];
const METRICS: NumericMetricKey[] = [
  "cmpObserved",
  "cookieDetailCount",
  "checklistObservedCount",
  "thirdPartyNonEssentialStorageCount",
];

export function analyzePairedEvidenceGrowth(input: PairedEvidenceGrowthInput): PairedEvidenceGrowthReport {
  const rankBinSize = Math.max(1, input.rankBinSize ?? 1_000);
  const bootstrapIterations = Math.max(100, input.bootstrapIterations ?? 2_000);
  const seed = input.seed ?? 0x5eedc0de;
  const regions = Object.fromEntries(REGIONS.map((region) => [
    region,
    summarizeRegion({
      baseline: input.baseline,
      bootstrapIterations,
      current: input.current,
      rankBinSize,
      region,
      seed: seed + (region === "california" ? 1 : 2),
    }),
  ])) as Record<EvidenceRegion, RegionGrowthSummary>;

  const matchedDomains = intersectionSize(
    input.baseline.map((row) => normalizeDomain(row.domain)),
    input.current.map((row) => normalizeDomain(row.domain)),
  );
  const coverageShortfall = REGIONS.some((region) => {
    const summary = regions[region];
    return summary.currentCoverage.evidenceCompleteRate < summary.baselineCoverage.evidenceCompleteRate - 0.05 ||
      summary.currentCoverage.projectionCompleteRate < summary.baselineCoverage.projectionCompleteRate - 0.05;
  });
  const materiallyLowMetricsAcrossBothRegions = METRICS.filter((metric) =>
    REGIONS.every((region) => regions[region].metrics[metric].belowRankAdjustedInterval === true)
  ).length;

  const insufficientSample = input.current.length < 30 || input.baseline.length < 100;
  const verdict = insufficientSample
    ? "insufficient_sample"
    : coverageShortfall
      ? "evidence_pipeline_shortfall"
      : materiallyLowMetricsAcrossBothRegions >= 2
        ? "signal_prevalence_shift_without_retention_loss"
        : "within_rank_adjusted_expectation";

  return {
    reportVersion: "certscore.paired_evidence_growth.1",
    verdict,
    summary: {
      baselinePairs: input.baseline.length,
      currentPairs: input.current.length,
      matchedDomains,
      materiallyLowMetricsAcrossBothRegions,
    },
    regions,
    notes: [
      "Evidence completeness and projection completeness are evaluated separately from observed-signal prevalence.",
      "Expected prevalence is reweighted to the current cohort's rank-bin distribution and bounded with deterministic stratified bootstrap intervals.",
      matchedDomains < Math.min(input.current.length, 30)
        ? "The cohorts are not a repeated-domain comparison; prevalence movement alone cannot establish evidence loss."
        : "The cohorts contain enough repeated domains to support a separate matched-domain follow-up.",
      "Metrics measured on the same domains are correlated and must not be counted as independent samples.",
    ],
  };
}

function summarizeRegion(input: {
  baseline: PairedEvidenceRow[];
  bootstrapIterations: number;
  current: PairedEvidenceRow[];
  rankBinSize: number;
  region: EvidenceRegion;
  seed: number;
}): RegionGrowthSummary {
  const metrics = Object.fromEntries(METRICS.map((metric) => [
    metric,
    compareMetric({ ...input, metric }),
  ])) as Record<NumericMetricKey, MetricComparison>;
  return {
    baselineCoverage: coverage(input.baseline, input.region),
    currentCoverage: coverage(input.current, input.region),
    metrics,
  };
}

function compareMetric(input: {
  baseline: PairedEvidenceRow[];
  bootstrapIterations: number;
  current: PairedEvidenceRow[];
  metric: NumericMetricKey;
  rankBinSize: number;
  region: EvidenceRegion;
  seed: number;
}): MetricComparison {
  const baselineValues = metricValues(input.baseline, input.region, input.metric);
  const currentValues = metricValues(input.current, input.region, input.metric);
  const baselineMean = mean(baselineValues);
  const currentMean = mean(currentValues);
  const baselineBins = groupByRankBin(input.baseline, input.rankBinSize);
  const fallbackPool = input.baseline.filter((row) => metricValue(row[input.region], input.metric) !== null);
  const random = mulberry32(input.seed);
  const bootstrapMeans: number[] = [];

  for (let iteration = 0; iteration < input.bootstrapIterations; iteration += 1) {
    const values = input.current.flatMap((currentRow) => {
      const pool = baselineBins.get(rankBin(currentRow.rank, input.rankBinSize)) ?? fallbackPool;
      const eligible = pool.filter((row) => metricValue(row[input.region], input.metric) !== null);
      if (eligible.length === 0) return [];
      const sampled = eligible[Math.floor(random() * eligible.length)];
      const value = metricValue(sampled[input.region], input.metric);
      return value === null ? [] : [value];
    });
    const value = mean(values);
    if (value !== null) bootstrapMeans.push(value);
  }

  bootstrapMeans.sort((left, right) => left - right);
  const expectedMean = mean(bootstrapMeans);
  const interval = bootstrapMeans.length === 0
    ? null
    : [quantile(bootstrapMeans, 0.025), quantile(bootstrapMeans, 0.975)] as [number, number];
  return {
    baselineMean,
    bootstrapExpectedInterval95: interval,
    currentMean,
    currentToBaselineRatio: ratio(currentMean, baselineMean),
    currentToRankAdjustedExpectedRatio: ratio(currentMean, expectedMean),
    rankAdjustedExpectedMean: expectedMean,
    belowRankAdjustedInterval: currentMean === null || interval === null ? null : currentMean < interval[0],
  };
}

function coverage(rows: PairedEvidenceRow[], region: EvidenceRegion): CoverageSummary {
  const denominator = Math.max(1, rows.length);
  return {
    evidenceCompleteRate: rows.filter((row) => row[region].evidenceComplete).length / denominator,
    pairs: rows.length,
    projectionCompleteRate: rows.filter((row) => row[region].projectionComplete).length / denominator,
  };
}

function groupByRankBin(rows: PairedEvidenceRow[], size: number): Map<string, PairedEvidenceRow[]> {
  const groups = new Map<string, PairedEvidenceRow[]>();
  for (const row of rows) {
    const key = rankBin(row.rank, size);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

function rankBin(rank: number | null, size: number): string {
  if (rank === null || !Number.isFinite(rank) || rank <= 0) return "unknown";
  return String(Math.floor((rank - 1) / size));
}

function metricValues(rows: PairedEvidenceRow[], region: EvidenceRegion, metric: NumericMetricKey): number[] {
  return rows.flatMap((row) => {
    const value = metricValue(row[region], metric);
    return value === null ? [] : [value];
  });
}

function metricValue(row: PairedEvidenceRegionRow, metric: NumericMetricKey): number | null {
  const value = row[metric];
  if (metric === "cmpObserved") return value === null ? null : value ? 1 : 0;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function quantile(sorted: number[], probability: number): number {
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower] ?? 0;
  const weight = index - lower;
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight;
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

function intersectionSize(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  return new Set(left.filter((value) => rightSet.has(value))).size;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
