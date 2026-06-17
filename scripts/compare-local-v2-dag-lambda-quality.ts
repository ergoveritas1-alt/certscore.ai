import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalEvidenceBundleSchema, reviewResultSchema } from "../packages/certscore-contracts/src/index.js";
import { reviewEvidenceBundle } from "../packages/certscore-review-engine/src/index.js";
import { projectReviewResultToV2ReportDraft } from "../packages/certscore-report-adapter/src/index.js";

type BenchmarkResult = {
  mode: "lambda" | "localhost";
  domain: string;
  scanId: string;
  elapsedMs: number;
  outDir: string | null;
  status: string;
};

type BenchmarkFile = {
  generatedAt?: string;
  profile?: string;
  results: BenchmarkResult[];
};

type Args = {
  benchmarkPath: string;
  derivedDir: string;
  outPath: string;
  summaryPath: string;
};

type RowStatusCounts = Record<string, number>;

type SiteComparison = {
  consentPlannerInputs: ConsentPlannerInputComparison;
  domain: string;
  fallbackReasons: string[];
  lambdaScanId: string;
  localScanId: string;
  lambdaSeconds: number;
  localSeconds: number;
  speedup: number;
  lambdaCoverageStatus: string | null;
  localCoverageStatus: string | null;
  lambdaModuleStatuses: Record<string, string>;
  localModuleStatuses: Record<string, string>;
  metrics: {
    actionAttempts: RatioMetric;
    consentFlowComparisons: RatioMetric;
    diagnosticLimitationKeys: string[];
    evidenceExcerpts: RatioMetric;
    networkEvents: RatioMetric;
    policySurfaceObservations: RatioMetric;
    screenshots: RatioMetric;
    usefulProjectionRows: RatioMetric;
    weightedSignalScore: RatioMetric;
  };
  lambdaProjectionRowsByStatus: RowStatusCounts;
  localProjectionRowsByStatus: RowStatusCounts;
  gates: Array<{ name: string; passed: boolean; details: string }>;
  overallPassed: boolean;
  qualityScore: number;
  qualityScoreArtifactPath: string;
  recommendedAction: RecommendedAction;
};

type RatioMetric = {
  lambda: number;
  local: number;
  ratio: number | null;
};

type RecommendedAction = "accept_lambda" | "fallback_to_localhost" | "investigate";

type ConsentPlannerInputSummary = {
  baselineActionCandidateCount: number | null;
  baselineCmpEvidenceObserved: boolean | null;
  baselineLikelyBannerPresent: boolean | null;
  plannedScenarios: string[];
  policyPlanningStatus: string | null;
  policyPrivacyControlUrlCount: number | null;
  seededPrivacyControlUrlCount: number | null;
  skippedScenarios: Array<{ scenario: string; skipReason: string }>;
};

type ConsentPlannerInputComparison = {
  equivalent: boolean | null;
  lambda: ConsentPlannerInputSummary | null;
  limitationReason: string | null;
  local: ConsentPlannerInputSummary | null;
};

type QualityScoreArtifact = {
  artifactOnly: true;
  comparedAt: string;
  domain: string;
  fallbackReasons: string[];
  gates: SiteComparison["gates"];
  lambda: {
    coverageStatus: string | null;
    diagnosticLimitationKeys: string[];
    moduleStatuses: Record<string, string>;
    projectionRowsByStatus: RowStatusCounts;
    scanId: string;
    seconds: number;
  };
  local: {
    coverageStatus: string | null;
    moduleStatuses: Record<string, string>;
    projectionRowsByStatus: RowStatusCounts;
    scanId: string;
    seconds: number;
  };
  consentPlannerInputs: ConsentPlannerInputComparison;
  metrics: SiteComparison["metrics"];
  overallPassed: boolean;
  productionFindingIntegration: false;
  qualityScore: number;
  recommendedAction: RecommendedAction;
  speedup: number;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const benchmark = JSON.parse(await readFile(args.benchmarkPath, "utf8")) as BenchmarkFile;
  const comparisons: SiteComparison[] = [];

  for (const domain of uniqueDomains(benchmark.results)) {
    const lambda = benchmark.results.find((result) => result.domain === domain && result.mode === "lambda");
    const local = benchmark.results.find((result) => result.domain === domain && result.mode === "localhost");
    if (!lambda || !local || !lambda.outDir || !local.outDir) {
      continue;
    }
    comparisons.push(await compareSite({ args, domain, lambda, local }));
  }

  const speedups = comparisons.map((comparison) => comparison.speedup).sort((left, right) => left - right);
  const usableLambdaCount = comparisons.filter((comparison) => comparison.lambdaCoverageStatus === "usable").length;
  const p50Speedup = percentile(speedups, 0.5);
  const lambdaElapsed = comparisons.map((comparison) => comparison.lambdaSeconds).sort((left, right) => left - right);
  const localElapsed = comparisons.map((comparison) => comparison.localSeconds).sort((left, right) => left - right);
  const p90LambdaSeconds = percentile(lambdaElapsed, 0.9);
  const p90LocalSeconds = percentile(localElapsed, 0.9);
  const slowerThanLocal = comparisons.filter((comparison) => comparison.lambdaSeconds > comparison.localSeconds);
  const slowerOnlyWhenQualityParity = slowerThanLocal.every((comparison) =>
    comparison.metrics.usefulProjectionRows.lambda >= comparison.metrics.usefulProjectionRows.local &&
    comparison.metrics.evidenceExcerpts.lambda >= comparison.metrics.evidenceExcerpts.local
  );

  const globalGates = [
    {
      name: "lambda_usable_runtime_coverage_4_of_5",
      passed: usableLambdaCount >= Math.min(4, comparisons.length),
      details: `${usableLambdaCount}/${comparisons.length} Lambda scans had usable runtime coverage.`
    },
    {
      name: "lambda_p50_speedup_at_least_1_25x",
      passed: p50Speedup !== null && p50Speedup >= 1.25,
      details: `p50 speedup was ${formatNumber(p50Speedup)}x.`
    },
    {
      name: "lambda_p90_not_slower_unless_quality_parity",
      passed: p90LambdaSeconds !== null && p90LocalSeconds !== null && (p90LambdaSeconds <= p90LocalSeconds || slowerOnlyWhenQualityParity),
      details: `p90 Lambda ${formatNumber(p90LambdaSeconds)}s vs localhost ${formatNumber(p90LocalSeconds)}s.`
    }
  ];

  const summary = {
    artifactOnly: true,
    benchmarkPath: args.benchmarkPath,
    comparedAt: new Date().toISOString(),
    fallbackPolicy: {
      fallbackAction: "rerun via localhost/ECS v2 path",
      fallbackWhen: "site quality gates fail, Lambda produces no useful rows while localhost has rows, consent-flow coverage is lost without an explicit limitation, complex-site evidence excerpt retention falls below 70%, or browser failures are not strongly limited",
      lambdaAcceptance: "Lambda can be accepted only when quality gates pass and speed improves materially; otherwise it remains an acceleration candidate"
    },
    globalGates,
    overallPassed: globalGates.every((gate) => gate.passed) && comparisons.every((comparison) => comparison.overallPassed),
    productionFindingIntegration: false,
    profile: benchmark.profile ?? null,
    sites: comparisons
  };

  await mkdir(path.dirname(args.outPath), { recursive: true });
  await writeFile(args.outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(args.summaryPath, renderMarkdown(summary), "utf8");
  console.log(`Wrote ${args.outPath}`);
  console.log(`Wrote ${args.summaryPath}`);
  if (!summary.overallPassed) {
    process.exitCode = 2;
  }
}

async function compareSite(input: {
  args: Args;
  domain: string;
  lambda: BenchmarkResult;
  local: BenchmarkResult;
}): Promise<SiteComparison> {
  const lambdaArtifacts = await loadArtifacts(input.lambda, input.args);
  const localArtifacts = await loadArtifacts(input.local, input.args);
  const consentPlannerInputs = compareConsentPlannerInputs(lambdaArtifacts.consentPlannerInputs, localArtifacts.consentPlannerInputs);
  const lambdaRowsByStatus = countProjectionRows(lambdaArtifacts.projection.rows);
  const localRowsByStatus = countProjectionRows(localArtifacts.projection.rows);
  const metrics = {
    actionAttempts: ratio(lambdaArtifacts.bundle.consentActionAttempts.length, localArtifacts.bundle.consentActionAttempts.length),
    consentFlowComparisons: ratio(lambdaArtifacts.bundle.consentFlowComparisons.length, localArtifacts.bundle.consentFlowComparisons.length),
    diagnosticLimitationKeys: lambdaArtifacts.diagnosticLimitationKeys,
    evidenceExcerpts: ratio(lambdaArtifacts.review.evidenceExcerpts.length, localArtifacts.review.evidenceExcerpts.length),
    networkEvents: ratio(lambdaArtifacts.bundle.networkEvents.length, localArtifacts.bundle.networkEvents.length),
    policySurfaceObservations: ratio(lambdaArtifacts.bundle.policySurfaceObservations.length, localArtifacts.bundle.policySurfaceObservations.length),
    screenshots: ratio(lambdaArtifacts.bundle.screenshots.length, localArtifacts.bundle.screenshots.length),
    usefulProjectionRows: ratio(usefulRows(lambdaRowsByStatus), usefulRows(localRowsByStatus)),
    weightedSignalScore: ratio(weightedSignalScore(lambdaArtifacts.bundle), weightedSignalScore(localArtifacts.bundle))
  };
  const lambdaModuleStatuses = moduleStatuses(lambdaArtifacts.bundle.modulesRun);
  const localModuleStatuses = moduleStatuses(localArtifacts.bundle.modulesRun);
  const lambdaCoverageStatus = lambdaArtifacts.bundle.runtimeCoverage.coverageStatus;
  const localCoverageStatus = localArtifacts.bundle.runtimeCoverage.coverageStatus;
  const explicitConsentLimitation = hasExplicitConsentLimitation({
    bundle: lambdaArtifacts.bundle,
    projectionCoverageLimitations: lambdaArtifacts.projection.coverageLimitations,
    moduleStatuses: lambdaModuleStatuses
  });
  const moduleFailureHasStrongLimitation = moduleFailureIsStronglyLimited({
    bundleCoverageStatus: lambdaCoverageStatus,
    moduleStatuses: lambdaModuleStatuses,
    projectionRowsByStatus: lambdaRowsByStatus
  });

  const gates = [
    {
      name: "lambda_no_zero_useful_rows_unless_local_zero",
      passed: metrics.usefulProjectionRows.lambda > 0 || metrics.usefulProjectionRows.local === 0,
      details: `Lambda useful rows ${metrics.usefulProjectionRows.lambda}; local useful rows ${metrics.usefulProjectionRows.local}.`
    },
    {
      name: "lambda_retains_80_percent_useful_rows",
      passed: metrics.usefulProjectionRows.local === 0 || metrics.usefulProjectionRows.lambda / metrics.usefulProjectionRows.local >= 0.8,
      details: `Useful row ratio ${formatRatio(metrics.usefulProjectionRows.ratio)}.`
    },
    {
      name: "lambda_retains_consent_flow_or_explains_limitation",
      passed: metrics.consentFlowComparisons.lambda >= metrics.consentFlowComparisons.local || explicitConsentLimitation,
      details: `Consent comparisons ${metrics.consentFlowComparisons.lambda}/${metrics.consentFlowComparisons.local}; explicit limitation ${explicitConsentLimitation}.`
    },
    {
      name: "lambda_retains_70_percent_complex_site_evidence",
      passed: metrics.evidenceExcerpts.local < 100 || metrics.evidenceExcerpts.lambda / metrics.evidenceExcerpts.local >= 0.7,
      details: `Evidence excerpt ratio ${formatRatio(metrics.evidenceExcerpts.ratio)}.`
    },
    {
      name: "lambda_browser_failures_are_strongly_limited",
      passed: moduleFailureHasStrongLimitation,
      details: `Coverage status ${lambdaCoverageStatus}; row statuses ${JSON.stringify(lambdaRowsByStatus)}.`
    },
    {
      name: "lambda_retains_one_diagnostic_screenshot",
      passed: metrics.screenshots.lambda === 1,
      details: `Lambda screenshots ${metrics.screenshots.lambda}; local screenshots ${metrics.screenshots.local}.`
    }
  ];
  const overallPassed = gates.every((gate) => gate.passed);
  const qualityScore = scoreSiteQuality({
    explicitConsentLimitation,
    gates,
    lambdaCoverageStatus,
    metrics,
    moduleFailureHasStrongLimitation,
    speedup: input.local.elapsedMs / input.lambda.elapsedMs
  });
  const fallbackReasons = fallbackReasonsForSite({ gates, metrics, speedup: input.local.elapsedMs / input.lambda.elapsedMs });
  const recommendedAction = recommendedActionForSite({ fallbackReasons, overallPassed, speedup: input.local.elapsedMs / input.lambda.elapsedMs });
  const qualityScoreArtifactPath = path.join(input.args.derivedDir, input.lambda.scanId, "LocalV2DagLambdaQualityScore.json");

  const comparison: SiteComparison = {
    consentPlannerInputs,
    domain: input.domain,
    fallbackReasons,
    gates,
    lambdaCoverageStatus,
    lambdaModuleStatuses,
    lambdaProjectionRowsByStatus: lambdaRowsByStatus,
    lambdaScanId: input.lambda.scanId,
    lambdaSeconds: roundSeconds(input.lambda.elapsedMs),
    localCoverageStatus,
    localModuleStatuses,
    localProjectionRowsByStatus: localRowsByStatus,
    localScanId: input.local.scanId,
    localSeconds: roundSeconds(input.local.elapsedMs),
    metrics,
    overallPassed,
    qualityScore,
    qualityScoreArtifactPath,
    recommendedAction,
    speedup: round(input.local.elapsedMs / input.lambda.elapsedMs, 2)
  };
  await writeQualityScoreArtifact(comparison);
  return comparison;
}

async function loadArtifacts(result: BenchmarkResult, args: Args) {
  if (!result.outDir) {
    throw new Error(`${result.domain} ${result.mode} did not include an artifact directory.`);
  }
  const bundlePath = path.join(result.outDir, "CanonicalEvidenceBundle.json");
  const bundle = canonicalEvidenceBundleSchema.parse(JSON.parse(await readFile(bundlePath, "utf8")));
  const reviewPath = path.join(result.outDir, "ReviewResult.json");
  const projectionPath = path.join(result.outDir, "V2ReportProjectionDraft.json");
  if (await exists(reviewPath) && await exists(projectionPath)) {
    const review = reviewResultSchema.parse(JSON.parse(await readFile(reviewPath, "utf8")));
    const projection = JSON.parse(await readFile(projectionPath, "utf8")) as {
      coverageLimitations: unknown[];
      rows: Array<{ status: string }>;
    };
    return {
      bundle,
      consentPlannerInputs: await loadConsentPlannerInputs(result.outDir),
      diagnosticLimitationKeys: await loadScenarioDiagnosticLimitationKeys(result.outDir),
      projection,
      review
    };
  }

  const derivedOutDir = path.join(args.derivedDir, result.scanId);
  await mkdir(derivedOutDir, { recursive: true });
  const review = await reviewEvidenceBundle(bundle);
  const projection = projectReviewResultToV2ReportDraft({ bundle, review });
  await writeFile(path.join(derivedOutDir, "ReviewResult.json"), `${JSON.stringify(review, null, 2)}\n`, "utf8");
  await writeFile(path.join(derivedOutDir, "V2ReportProjectionDraft.json"), `${JSON.stringify(projection, null, 2)}\n`, "utf8");
  return {
    bundle,
    consentPlannerInputs: await loadConsentPlannerInputs(result.outDir),
    diagnosticLimitationKeys: await loadScenarioDiagnosticLimitationKeys(result.outDir),
    projection,
    review
  };
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {
    derivedDir: "artifacts/v2-lambda-quality-derived",
    outPath: "artifacts/v2-lambda-quality-gate.json",
    summaryPath: "artifacts/v2-lambda-quality-gate.md"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--benchmark") {
      args.benchmarkPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--derived-dir") {
      args.derivedDir = requiredValue(argv, ++index, arg);
    } else if (arg === "--out") {
      args.outPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--summary") {
      args.summaryPath = requiredValue(argv, ++index, arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.benchmarkPath) {
    throw new Error("Missing required --benchmark path.");
  }
  return args as Args;
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function uniqueDomains(results: BenchmarkResult[]) {
  return [...new Set(results.map((result) => result.domain))].sort();
}

function ratio(lambda: number, local: number): RatioMetric {
  return {
    lambda,
    local,
    ratio: local > 0 ? round(lambda / local, 4) : null
  };
}

function moduleStatuses(modules: Array<{ moduleName: string; status: string }>) {
  return Object.fromEntries(modules.map((moduleRun) => [moduleRun.moduleName, moduleRun.status]));
}

function countProjectionRows(rows: Array<{ status: string }>): RowStatusCounts {
  return rows.reduce<RowStatusCounts>((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {});
}

function usefulRows(counts: RowStatusCounts) {
  return (counts.observed ?? 0) + (counts.review_signal ?? 0) + (counts.checked ?? 0) + (counts.not_observed ?? 0);
}

function weightedSignalScore(bundle: {
  consentFlowComparisons: unknown[];
  cookieEvents: unknown[];
  domSnapshots: unknown[];
  networkEvents: unknown[];
  observedJourneys: unknown[];
  policySurfaceObservations: unknown[];
  screenshots: unknown[];
  scriptEvents: unknown[];
}) {
  return bundle.networkEvents.length +
    bundle.cookieEvents.length +
    bundle.scriptEvents.length +
    bundle.observedJourneys.length +
    (bundle.consentFlowComparisons.length * 10) +
    (bundle.policySurfaceObservations.length * 5) +
    (bundle.screenshots.length * 20) +
    (bundle.domSnapshots.length * 10);
}

async function loadConsentPlannerInputs(outDir: string): Promise<ConsentPlannerInputSummary | null> {
  const planPath = path.join(outDir, "consent_scenario_plan.json");
  if (!await exists(planPath)) {
    return null;
  }
  const plan = asRecord(JSON.parse(await readFile(planPath, "utf8")));
  const plannerInputs = asRecord(plan.plannerInputs);
  return {
    baselineActionCandidateCount: numberOrNull(plannerInputs.baselineActionCandidateCount),
    baselineCmpEvidenceObserved: booleanOrNull(plannerInputs.baselineCmpEvidenceObserved),
    baselineLikelyBannerPresent: booleanOrNull(plannerInputs.baselineLikelyBannerPresent),
    plannedScenarios: arrayRecords(plan.plannedScenarios)
      .map((scenario) => stringOrNull(scenario.scenario))
      .filter((scenario): scenario is string => Boolean(scenario)),
    policyPlanningStatus: stringOrNull(plan.policyPlanningStatus),
    policyPrivacyControlUrlCount: numberOrNull(plannerInputs.policyPrivacyControlUrlCount),
    seededPrivacyControlUrlCount: numberOrNull(plannerInputs.seededPrivacyControlUrlCount),
    skippedScenarios: arrayRecords(plan.skippedScenarios)
      .map((scenario) => ({
        scenario: stringOrNull(scenario.scenario) ?? "unknown",
        skipReason: stringOrNull(scenario.skipReason) ?? "unknown"
      }))
  };
}

async function loadScenarioDiagnosticLimitationKeys(outDir: string): Promise<string[]> {
  const entries = await readdir(outDir, { withFileTypes: true }).catch(() => []);
  const keys = new Set<string>();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.includes("consent-runtime-diagnostics-") || !entry.name.endsWith(".json")) {
      continue;
    }
    const diagnostic = asRecord(JSON.parse(await readFile(path.join(outDir, entry.name), "utf8")));
    const limitationKeys = Array.isArray(diagnostic.limitationKeys) ? diagnostic.limitationKeys : [];
    for (const key of limitationKeys) {
      if (typeof key === "string" && key.trim()) {
        keys.add(key.trim());
      }
    }
  }
  return [...keys].sort();
}

function compareConsentPlannerInputs(
  lambda: ConsentPlannerInputSummary | null,
  local: ConsentPlannerInputSummary | null
): ConsentPlannerInputComparison {
  if (!lambda && !local) {
    return {
      equivalent: null,
      lambda,
      limitationReason: "planner_artifacts_unavailable_for_both_runs",
      local
    };
  }
  if (!lambda) {
    return {
      equivalent: false,
      lambda,
      limitationReason: "lambda_planner_artifact_unavailable",
      local
    };
  }
  if (!local) {
    return {
      equivalent: false,
      lambda,
      limitationReason: "local_planner_artifact_unavailable",
      local
    };
  }
  return {
    equivalent: JSON.stringify(lambda) === JSON.stringify(local),
    lambda,
    limitationReason: null,
    local
  };
}

function arrayRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanOrNull(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function scoreSiteQuality(input: {
  explicitConsentLimitation: boolean;
  gates: Array<{ passed: boolean }>;
  lambdaCoverageStatus: string | null;
  metrics: SiteComparison["metrics"];
  moduleFailureHasStrongLimitation: boolean;
  speedup: number;
}) {
  const useful = ratioScore(input.metrics.usefulProjectionRows.ratio, 0.8) * 30;
  const consent = input.metrics.consentFlowComparisons.local === 0
    ? 20
    : input.metrics.consentFlowComparisons.lambda >= input.metrics.consentFlowComparisons.local
      ? 20
      : input.explicitConsentLimitation
        ? 12
        : 0;
  const evidence = input.metrics.evidenceExcerpts.local < 100
    ? 20
    : ratioScore(input.metrics.evidenceExcerpts.ratio, 0.7) * 20;
  const coverage = input.lambdaCoverageStatus === "usable" ? 15 : input.lambdaCoverageStatus === "partial" ? 8 : 0;
  const failureLimit = input.moduleFailureHasStrongLimitation ? 10 : 0;
  const speed = Math.min(Math.max(input.speedup / 1.25, 0), 1) * 5;
  const gatePenalty = input.gates.filter((gate) => !gate.passed).length * 5;
  return Math.max(0, round(useful + consent + evidence + coverage + failureLimit + speed - gatePenalty, 1));
}

function ratioScore(value: number | null, target: number) {
  if (value === null) {
    return 1;
  }
  return Math.min(Math.max(value / target, 0), 1);
}

function fallbackReasonsForSite(input: {
  gates: SiteComparison["gates"];
  metrics: SiteComparison["metrics"];
  speedup: number;
}) {
  const reasons = input.gates
    .filter((gate) => !gate.passed)
    .map((gate) => `${gate.name}: ${gate.details}`);
  if (input.speedup < 1) {
    reasons.push(`lambda_slower_than_localhost: Lambda speedup was ${formatNumber(input.speedup)}x.`);
  }
  if (input.metrics.usefulProjectionRows.lambda === 0 && input.metrics.usefulProjectionRows.local > 0) {
    reasons.push("lambda_zero_useful_projection_rows");
  }
  return reasons;
}

function recommendedActionForSite(input: {
  fallbackReasons: string[];
  overallPassed: boolean;
  speedup: number;
}): RecommendedAction {
  if (!input.overallPassed || input.fallbackReasons.length > 0) {
    return "fallback_to_localhost";
  }
  if (input.speedup >= 1.25) {
    return "accept_lambda";
  }
  return "investigate";
}

async function writeQualityScoreArtifact(site: SiteComparison) {
  const artifact: QualityScoreArtifact = {
    artifactOnly: true,
    comparedAt: new Date().toISOString(),
    domain: site.domain,
    fallbackReasons: site.fallbackReasons,
    gates: site.gates,
    lambda: {
      coverageStatus: site.lambdaCoverageStatus,
      diagnosticLimitationKeys: site.metrics.diagnosticLimitationKeys,
      moduleStatuses: site.lambdaModuleStatuses,
      projectionRowsByStatus: site.lambdaProjectionRowsByStatus,
      scanId: site.lambdaScanId,
      seconds: site.lambdaSeconds
    },
    local: {
      coverageStatus: site.localCoverageStatus,
      moduleStatuses: site.localModuleStatuses,
      projectionRowsByStatus: site.localProjectionRowsByStatus,
      scanId: site.localScanId,
      seconds: site.localSeconds
    },
    consentPlannerInputs: site.consentPlannerInputs,
    metrics: site.metrics,
    overallPassed: site.overallPassed,
    productionFindingIntegration: false,
    qualityScore: site.qualityScore,
    recommendedAction: site.recommendedAction,
    speedup: site.speedup
  };
  await mkdir(path.dirname(site.qualityScoreArtifactPath), { recursive: true });
  await writeFile(site.qualityScoreArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

function hasExplicitConsentLimitation(input: {
  bundle: { runtimeCoverage: { limitationKeys: string[] } };
  moduleStatuses: Record<string, string>;
  projectionCoverageLimitations: unknown[];
}) {
  return input.projectionCoverageLimitations.length > 0 ||
    input.bundle.runtimeCoverage.limitationKeys.length > 0 ||
    ["preConsentRuntimeScanner", "consentFlowRuntimeScanner"].some((moduleName) =>
      ["failed", "partial", "skipped_budget", "not_testable"].includes(input.moduleStatuses[moduleName] ?? "")
    );
}

function moduleFailureIsStronglyLimited(input: {
  bundleCoverageStatus: string;
  moduleStatuses: Record<string, string>;
  projectionRowsByStatus: RowStatusCounts;
}) {
  const failedModule = Object.values(input.moduleStatuses).some((status) => status === "failed");
  if (!failedModule) {
    return true;
  }
  return input.bundleCoverageStatus !== "usable" || usefulRows(input.projectionRowsByStatus) === 0;
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) {
    return null;
  }
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * fraction) - 1));
  return values[index] ?? null;
}

function roundSeconds(ms: number) {
  return round(ms / 1000, 1);
}

function round(value: number, precision: number) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function formatRatio(value: number | null) {
  return value === null ? "n/a" : `${round(value * 100, 1)}%`;
}

function formatNumber(value: number | null) {
  return value === null ? "n/a" : String(round(value, 2));
}

function renderMarkdown(summary: {
  fallbackPolicy?: {
    fallbackAction: string;
    fallbackWhen: string;
    lambdaAcceptance: string;
  };
  globalGates: Array<{ name: string; passed: boolean; details: string }>;
  overallPassed: boolean;
  profile: string | null;
  sites: SiteComparison[];
}) {
  return [
    "# Local v2 DAG Lambda Quality Gate",
    "",
    "Internal diagnostic only. Artifact-only. No production finding integration.",
    "",
    `- Profile: ${summary.profile ?? "unknown"}`,
    `- Overall: ${summary.overallPassed ? "passed" : "failed"}`,
    `- Fallback action: ${summary.fallbackPolicy?.fallbackAction ?? "rerun via localhost/ECS v2 path"}`,
    "",
    "## Global Gates",
    "",
    ...summary.globalGates.map((gate) => `- ${gate.passed ? "pass" : "fail"} ${gate.name}: ${gate.details}`),
    "",
    "## Site Comparison",
    "",
    "| Site | Speedup | Quality | Coverage | Useful rows | Consent comparisons | Evidence excerpts | Screenshots | Action | Result |",
    "|---|---:|---:|---|---:|---:|---:|---:|---|---|",
    ...summary.sites.map((site) => [
      site.domain,
      `${site.speedup}x`,
      String(site.qualityScore),
      `${site.lambdaCoverageStatus ?? "unknown"} / ${site.localCoverageStatus ?? "unknown"}`,
      `${site.metrics.usefulProjectionRows.lambda} / ${site.metrics.usefulProjectionRows.local}`,
      `${site.metrics.consentFlowComparisons.lambda} / ${site.metrics.consentFlowComparisons.local}`,
      `${site.metrics.evidenceExcerpts.lambda} / ${site.metrics.evidenceExcerpts.local}`,
      `${site.metrics.screenshots.lambda} / ${site.metrics.screenshots.local}`,
      site.recommendedAction,
      site.overallPassed ? "pass" : "fail"
    ].join(" | ")).map((row) => `| ${row} |`),
    "",
    "## Fallback Decisions",
    "",
    ...summary.sites.map((site) =>
      `- ${site.domain}: ${site.recommendedAction}` +
      (site.fallbackReasons.length > 0 ? ` - ${site.fallbackReasons.join("; ")}` : "")
    ),
    "",
    "## Consent Planner Inputs",
    "",
    ...summary.sites.map((site) =>
      `- ${site.domain}: ${site.consentPlannerInputs.equivalent === null ? "not compared" : site.consentPlannerInputs.equivalent ? "equivalent" : "different"}` +
      (site.consentPlannerInputs.limitationReason ? ` - ${site.consentPlannerInputs.limitationReason}` : "")
    ),
    "",
    "## Failing Site Gates",
    "",
    ...summary.sites.flatMap((site) =>
      site.gates
        .filter((gate) => !gate.passed)
        .map((gate) => `- ${site.domain}: ${gate.name} - ${gate.details}`)
    ),
    "",
    "## Diagnostic Limitation Keys",
    "",
    ...summary.sites.map((site) =>
      `- ${site.domain}: ${site.metrics.diagnosticLimitationKeys.length > 0 ? site.metrics.diagnosticLimitationKeys.join(", ") : "none"}`
    ),
    ""
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
