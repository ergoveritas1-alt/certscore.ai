import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type EvidenceCounts = {
  cmpObservations: number;
  consentControls: number;
  policyFetched: number;
  policyObserved: number;
  screenshots: number;
};

type BenchmarkRow = {
  domain: string;
  elapsedMs: number;
  mode: string;
  performance?: Record<string, unknown>;
  status: string;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [baseline, candidate] = await Promise.all([readBenchmark(args.baseline), readBenchmark(args.candidate)]);
  const baselineRows = lambdaRows(baseline);
  const candidateRows = lambdaRows(candidate);
  const candidateByDomain = new Map(candidateRows.map((row) => [row.domain, row]));
  const baselineExpectedMemoryMb = numberOrNull(baseline.expectedMemorySizeMb);
  const candidateExpectedMemoryMb = numberOrNull(candidate.expectedMemorySizeMb);
  const comparisons = baselineRows.flatMap((baselineRow) => {
    const candidateRow = candidateByDomain.get(baselineRow.domain);
    if (!candidateRow) return [];
    const baselineEvidence = evidenceCounts(baselineRow);
    const candidateEvidence = evidenceCounts(candidateRow);
    const evidenceCountsAvailable = baselineEvidence !== null && candidateEvidence !== null;
    const regressedFields = evidenceCountsAvailable
      ? (Object.keys(baselineEvidence) as Array<keyof EvidenceCounts>)
        .filter((field) => candidateEvidence[field] < baselineEvidence[field])
      : [];
    const baselineObservedMemoryMb = configuredMemoryMb(baselineRow);
    const candidateObservedMemoryMb = configuredMemoryMb(candidateRow);
    const memoryConfigurationVerified =
      baselineExpectedMemoryMb !== null &&
      candidateExpectedMemoryMb !== null &&
      baselineExpectedMemoryMb !== candidateExpectedMemoryMb &&
      baselineObservedMemoryMb === baselineExpectedMemoryMb &&
      candidateObservedMemoryMb === candidateExpectedMemoryMb;
    return [{
      domain: baselineRow.domain,
      baselineElapsedMs: baselineRow.elapsedMs,
      candidateElapsedMs: candidateRow.elapsedMs,
      deltaMs: candidateRow.elapsedMs - baselineRow.elapsedMs,
      baselineEvidence,
      candidateEvidence,
      evidenceCountRegressionFields: regressedFields,
      evidenceCountsAvailable,
      qualityCountParity: evidenceCountsAvailable && regressedFields.length === 0,
      baselinePeakMemoryMb: peakMemoryMb(baselineRow),
      candidatePeakMemoryMb: peakMemoryMb(candidateRow),
      baselineObservedMemoryMb,
      candidateObservedMemoryMb,
      memoryConfigurationVerified,
    }];
  });
  const baselineDomains = new Set(baselineRows.map((row) => row.domain));
  const candidateDomains = new Set(candidateRows.map((row) => row.domain));
  const unmatchedBaselineDomains = [...baselineDomains].filter((domain) => !candidateDomains.has(domain));
  const unmatchedCandidateDomains = [...candidateDomains].filter((domain) => !baselineDomains.has(domain));
  const baselineDurations = comparisons.map((row) => row.baselineElapsedMs);
  const candidateDurations = comparisons.map((row) => row.candidateElapsedMs);
  const report = {
    artifactVersion: "certscore.v2_lambda_memory_canary_comparison.1",
    generatedAt: new Date().toISOString(),
    baselineVariant: stringValue(baseline.variantLabel),
    candidateVariant: stringValue(candidate.variantLabel),
    baselineExpectedMemoryMb,
    candidateExpectedMemoryMb,
    summary: {
      comparedDomains: comparisons.length,
      qualityCountParityDomains: comparisons.filter((row) => row.qualityCountParity).length,
      evidenceCountRegressionDomains: comparisons.filter((row) =>
        row.evidenceCountsAvailable && !row.qualityCountParity
      ).length,
      evidenceCountsUnavailableDomains: comparisons.filter((row) => !row.evidenceCountsAvailable).length,
      memoryConfigurationVerifiedDomains: comparisons.filter((row) => row.memoryConfigurationVerified).length,
      unmatchedBaselineDomains,
      unmatchedCandidateDomains,
      baselineMedianElapsedMs: median(baselineDurations),
      candidateMedianElapsedMs: median(candidateDurations),
      medianDeltaMs: median(comparisons.map((row) => row.deltaMs)),
      promotionEligibleForManualEvidenceReview:
        comparisons.length > 0 &&
        unmatchedBaselineDomains.length === 0 &&
        unmatchedCandidateDomains.length === 0 &&
        comparisons.every((row) => row.qualityCountParity && row.memoryConfigurationVerified),
    },
    comparisons,
    limitation:
      "Count parity is a screening gate only. Screenshot readability, consent-control identity, policy URLs/topics, and retained evidence must still receive manual or fixture-backed review before changing production Lambda memory.",
  };
  await mkdir(path.dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Wrote ${args.out}`);
}

function parseArgs(argv: string[]) {
  argv = argv.filter((value) => value !== "--");
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error("Expected --baseline, --candidate, and --out paths.");
    values.set(key, value);
  }
  const baseline = values.get("--baseline");
  const candidate = values.get("--candidate");
  const out = values.get("--out") ?? "artifacts/v2-lambda-memory-canary-comparison.json";
  if (!baseline || !candidate) throw new Error("Both --baseline and --candidate are required.");
  return { baseline, candidate, out };
}

async function readBenchmark(filePath: string): Promise<Record<string, unknown>> {
  return asRecord(JSON.parse(await readFile(filePath, "utf8")));
}

function lambdaRows(value: Record<string, unknown>): BenchmarkRow[] {
  return (Array.isArray(value.results) ? value.results : [])
    .map((row) => asRecord(row))
    .filter((row) => row.mode === "lambda" && row.status === "completed")
    .map((row) => ({
      domain: stringValue(row.domain) ?? "unknown",
      elapsedMs: numberValue(row.elapsedMs),
      mode: "lambda",
      performance: asRecord(row.performance),
      status: "completed",
    }));
}

function evidenceCounts(row: BenchmarkRow): EvidenceCounts | null {
  const performance = asRecord(row.performance);
  if (!("evidenceCounts" in performance)) {
    return null;
  }
  const counts = asRecord(performance.evidenceCounts);
  return {
    cmpObservations: numberValue(counts.cmpObservations),
    consentControls: numberValue(counts.consentControls),
    policyFetched: numberValue(counts.policyFetched),
    policyObserved: numberValue(counts.policyObserved),
    screenshots: numberValue(counts.screenshots),
  };
}

function peakMemoryMb(row: BenchmarkRow): number | null {
  const telemetry = asRecord(asRecord(row.performance).resourceTelemetry);
  return typeof telemetry.peakContainerMemoryMb === "number" ? telemetry.peakContainerMemoryMb : null;
}

function configuredMemoryMb(row: BenchmarkRow): number | null {
  return numberOrNull(asRecord(asRecord(row.performance).runtimeDiagnostics).memorySizeMb);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
    : sorted[middle] ?? null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

void main();
