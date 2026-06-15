#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type GateStatus = "pass" | "fail";

interface ConsentScenarioShadowCompareArtifact {
  artifactVersion: "consent_scenario_shadow_compare.v1";
  generatedAt: string;
  profile: string;
  summary: {
    urlsScanned: number;
    succeeded: number;
    failed: number;
    truePlannedRegressionSites?: number;
    stalePairSites?: number;
    liveVarianceSuspectedSites?: number;
    unstablePairRefreshSites?: number;
    p50DurationDeltaMs?: number;
    p90DurationDeltaMs?: number;
    p50DurationImprovementPct?: number;
    p90DurationImprovementPct?: number;
    sameOrBetterLaneCoverage: boolean;
    noNewProductionFacingOutputs: boolean;
    completePlannedArtifacts: boolean;
    traceComplete: boolean;
    increasedAmbiguitySites: number;
  };
  sites: Array<{
    url: string;
    status: "completed" | "failed";
    durationMs: {
      legacy?: number;
      planned?: number;
      delta?: number;
      improvementPct?: number;
    };
    laneCoverage: {
      sameOrBetter: boolean;
      missingInPlanned: string[];
    };
    comparisons: {
      legacyComparable: number;
      plannedComparable: number;
      increasedAmbiguity: boolean;
      plannedNotComparableReasons: string[];
    };
    artifacts: {
      plan: boolean;
      execution: boolean;
      trace: boolean;
      allInternalOnly: boolean;
      pathsUnique: boolean;
    };
    trace: {
      complete: boolean;
    };
    pairFreshness?: {
      captureGapMs?: number;
      maxFreshPairGapMs: number;
      status: "fresh_pair" | "stale_pair" | "unknown_pair";
      reasonCodes: string[];
    };
    longTailDiagnostic?: {
      plannedLongTail: boolean;
      thresholdMs: number;
      topScenario?: string;
      topScenarioStatus?: string;
      topScenarioDurationMs?: number;
      topPhaseScenario?: string;
      topPhaseLabel?: string;
      topPhaseDurationMs?: number;
      topPhaseDetail?: string;
      bottleneckReasonCodes: string[];
      bottleneckBuckets?: Array<{
        bucket: string;
        totalMs: number;
        occurrences: number;
      }>;
      scenarioDurations: Array<{
        scenario: string;
        status: string;
        durationMs?: number;
        deadlineHit: boolean;
      }>;
      phaseHotspots: Array<{
        scenario: string;
        label: string;
        durationMs: number;
      }>;
    };
    productionOutputInvariant: {
      noNewProductionFacingOutputs: boolean;
      blockingReasons: string[];
    };
    validationOutcome?: {
      category: "healthy" | "long_tail_only" | "scanner_failure" | "stale_pair" | "live_variance_suspected" | "true_planned_regression";
      refreshRecommended: boolean;
      reasonCodes: string[];
    };
    notTestableReasons: string[];
  }>;
}

interface ReadinessCheck {
  actual?: boolean | number;
  code: string;
  expected: boolean | number | string;
  message: string;
  passed: boolean;
  severity: "blocking" | "info";
}

interface ConsentDagReadinessGateReport {
  reportVersion: "wc01.v2_consent_dag_readiness_gate.1";
  generatedAt: string;
  input: {
    shadowComparePath: string;
    outDir: string;
    longTailThresholdMs: number;
    minUrls: number;
    minP50ImprovementPct: number;
    minP90ImprovementPct: number;
  };
  status: GateStatus;
  summary: ConsentScenarioShadowCompareArtifact["summary"] & {
    plannedLongTailSites: number;
    totalImprovedSites: number;
    truePlannedRegressionSites: number;
    stalePairSites: number;
    liveVarianceSuspectedSites: number;
    unstablePairRefreshSites: number;
  };
  checks: ReadinessCheck[];
  blockers: ReadinessCheck[];
  diagnosticSites: Array<{
    url: string;
    reasonCodes: string[];
    legacyMs?: number;
    plannedMs?: number;
    improvementPct?: number;
    topScenario?: string;
    topPhaseScenario?: string;
    topPhase?: string;
    topPhaseMs?: number;
    topBucket?: string;
    topBucketMs?: number;
    validationCategory?: string;
    captureGapMs?: number;
    refreshRecommended?: boolean;
  }>;
  queues: {
    unstablePairRefreshPath: string;
    unstablePairRefreshUrls: string[];
    longTailOptimizationPath: string;
    longTailOptimizationUrls: string[];
    trueRegressionUrls: string[];
    liveVarianceSuspectedUrls: string[];
    stalePairUrls: string[];
  };
  notes: string[];
}

interface Args {
  failOnFail: boolean;
  help: boolean;
  longTailThresholdMs: number;
  minP50ImprovementPct: number;
  minP90ImprovementPct: number;
  minUrls: number;
  outDir: string;
  shadowComparePath: string;
}

const DEFAULT_SHADOW_COMPARE_PATH = path.join(
  "artifacts",
  "gold-corpus",
  "v2-current",
  "consent-dag-shadow-train-validation",
  "consent-scenario-shadow-compare.json",
);
const DEFAULT_OUT_DIR = path.join("artifacts", "gold-corpus", "v2-current", "quality-gate");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const artifact = JSON.parse(await readFile(args.shadowComparePath, "utf8")) as ConsentScenarioShadowCompareArtifact;
  const checks = buildChecks(artifact, args);
  const blockers = checks.filter((check) => check.severity === "blocking" && !check.passed);
  const queues = buildQueues(artifact, args.outDir, args.longTailThresholdMs);
  const report: ConsentDagReadinessGateReport = {
    reportVersion: "wc01.v2_consent_dag_readiness_gate.1",
    generatedAt: new Date().toISOString(),
    input: {
      shadowComparePath: args.shadowComparePath,
      outDir: args.outDir,
      longTailThresholdMs: args.longTailThresholdMs,
      minUrls: args.minUrls,
      minP50ImprovementPct: args.minP50ImprovementPct,
      minP90ImprovementPct: args.minP90ImprovementPct,
    },
    status: blockers.length === 0 ? "pass" : "fail",
    summary: {
      ...artifact.summary,
      plannedLongTailSites: longTailOptimizationUrls(artifact, args.longTailThresholdMs).length,
      totalImprovedSites: artifact.sites.filter((site) => (site.durationMs.delta ?? 0) < 0).length,
      truePlannedRegressionSites: truePlannedRegressionSites(artifact),
      stalePairSites: stalePairSites(artifact),
      liveVarianceSuspectedSites: liveVarianceSuspectedSites(artifact),
      unstablePairRefreshSites: unstablePairRefreshUrls(artifact).length,
    },
    checks,
    blockers,
    diagnosticSites: diagnosticSites(artifact, args.longTailThresholdMs),
    queues,
    notes: [
      "Internal diagnostic artifact only.",
      "This gate does not change production report, UI, scoring, regulatory rows, persisted concerns, or finding surfacing.",
      "Passing this gate supports a rollout proposal; it does not switch any v2 profile default by itself.",
    ],
  };

  await mkdir(args.outDir, { recursive: true });
  const jsonPath = path.join(args.outDir, "ConsentDagReadinessGate.json");
  const mdPath = path.join(args.outDir, "ConsentDagReadinessGate.md");
  await writeQueue(queues.unstablePairRefreshPath, queues.unstablePairRefreshUrls);
  await writeQueue(queues.longTailOptimizationPath, queues.longTailOptimizationUrls);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(mdPath, renderMarkdown(report));
  console.log(JSON.stringify({
    outDir: args.outDir,
    status: report.status,
    summary: report.summary,
    blockers: report.blockers.map((blocker) => blocker.code),
  }, null, 2));
  if (args.failOnFail && report.status === "fail") {
    process.exit(1);
  }
}

function buildChecks(
  artifact: ConsentScenarioShadowCompareArtifact,
  args: Args,
): ReadinessCheck[] {
  const summary = artifact.summary;
  const trueRegressionCount = truePlannedRegressionSites(artifact);
  const refreshCount = unstablePairRefreshUrls(artifact).length;
  const longTailCount = longTailOptimizationUrls(artifact, args.longTailThresholdMs).length;
  return [
    check("minimum_url_count", summary.urlsScanned >= args.minUrls, args.minUrls, summary.urlsScanned, `Shadow compare includes at least ${args.minUrls} URLs.`),
    check("all_sites_succeeded", summary.failed === 0 && summary.succeeded === summary.urlsScanned, "failed=0 and succeeded=urlsScanned", summary.failed, "All shadow sites completed successfully."),
    check("same_or_better_lane_coverage", summary.sameOrBetterLaneCoverage, true, summary.sameOrBetterLaneCoverage, "Planned mode has same-or-better lane coverage after explicit not-testable planning outcomes."),
    check("no_increased_ambiguity", summary.increasedAmbiguitySites === 0, 0, summary.increasedAmbiguitySites, "Planned mode introduces no increased ambiguity sites."),
    check("no_true_planned_regressions", trueRegressionCount === 0, 0, trueRegressionCount, "No fresh paired true planned-mode regressions are present."),
    check("no_unstable_pair_refresh_required", refreshCount === 0, 0, refreshCount, "No stale or live-variance suspected pairs require fresh paired reruns."),
    check("no_new_production_facing_outputs", summary.noNewProductionFacingOutputs, true, summary.noNewProductionFacingOutputs, "No new production-facing outputs are present."),
    check("complete_internal_artifacts", summary.completePlannedArtifacts, true, summary.completePlannedArtifacts, "Scenario plan, execution, and flow trace artifacts are complete."),
    check("trace_complete", summary.traceComplete, true, summary.traceComplete, "Flow trace artifacts are complete."),
    check(
      "p50_speed_improvement",
      (summary.p50DurationImprovementPct ?? 0) >= args.minP50ImprovementPct,
      `>= ${args.minP50ImprovementPct}%`,
      summary.p50DurationImprovementPct,
      "p50 planned duration improvement meets threshold.",
    ),
    check(
      "p90_speed_improvement",
      (summary.p90DurationImprovementPct ?? 0) >= args.minP90ImprovementPct,
      `>= ${args.minP90ImprovementPct}%`,
      summary.p90DurationImprovementPct,
      "p90 planned duration improvement meets threshold.",
    ),
    {
      actual: longTailCount,
      code: "planned_long_tail_sites",
      expected: "informational",
      message: `Sites with planned runs above ${formatMs(args.longTailThresholdMs)} remain optimization candidates, not rollout blockers.`,
      passed: true,
      severity: "info",
    },
  ];
}

function check(
  code: string,
  passed: boolean,
  expected: boolean | number | string,
  actual: boolean | number | undefined,
  message: string,
): ReadinessCheck {
  return {
    actual,
    code,
    expected,
    message,
    passed,
    severity: "blocking",
  };
}

function buildQueues(
  artifact: ConsentScenarioShadowCompareArtifact,
  outDir: string,
  longTailThresholdMs: number,
): ConsentDagReadinessGateReport["queues"] {
  return {
    unstablePairRefreshPath: path.join(outDir, "queues", "unstable-pair-refresh.urls.txt"),
    unstablePairRefreshUrls: unstablePairRefreshUrls(artifact),
    longTailOptimizationPath: path.join(outDir, "queues", "long-tail-optimization.urls.txt"),
    longTailOptimizationUrls: longTailOptimizationUrls(artifact, longTailThresholdMs),
    trueRegressionUrls: artifact.sites
      .filter((site) => site.validationOutcome?.category === "true_planned_regression")
      .map((site) => site.url)
      .sort(),
    liveVarianceSuspectedUrls: artifact.sites
      .filter((site) => site.validationOutcome?.category === "live_variance_suspected")
      .map((site) => site.url)
      .sort(),
    stalePairUrls: artifact.sites
      .filter((site) => site.validationOutcome?.category === "stale_pair")
      .map((site) => site.url)
      .sort(),
  };
}

async function writeQueue(queuePath: string, urls: string[]): Promise<void> {
  await mkdir(path.dirname(queuePath), { recursive: true });
  await writeFile(queuePath, urls.length > 0 ? `${urls.join("\n")}\n` : "");
}

function unstablePairRefreshUrls(artifact: ConsentScenarioShadowCompareArtifact): string[] {
  return artifact.sites
    .filter((site) => site.validationOutcome?.refreshRecommended === true)
    .map((site) => site.url)
    .sort();
}

function longTailOptimizationUrls(
  artifact: ConsentScenarioShadowCompareArtifact,
  thresholdMs = 15_000,
): string[] {
  return artifact.sites
    .filter((site) => site.status === "completed" && (site.durationMs.planned ?? 0) > thresholdMs)
    .sort((left, right) => (right.durationMs.planned ?? 0) - (left.durationMs.planned ?? 0) || left.url.localeCompare(right.url))
    .map((site) => site.url);
}

function truePlannedRegressionSites(artifact: ConsentScenarioShadowCompareArtifact): number {
  return artifact.sites.filter((site) => site.validationOutcome?.category === "true_planned_regression").length;
}

function stalePairSites(artifact: ConsentScenarioShadowCompareArtifact): number {
  return artifact.sites.filter((site) => site.validationOutcome?.category === "stale_pair").length;
}

function liveVarianceSuspectedSites(artifact: ConsentScenarioShadowCompareArtifact): number {
  return artifact.sites.filter((site) => site.validationOutcome?.category === "live_variance_suspected").length;
}

function diagnosticSites(
  artifact: ConsentScenarioShadowCompareArtifact,
  longTailThresholdMs: number,
): ConsentDagReadinessGateReport["diagnosticSites"] {
  return artifact.sites
    .filter((site) =>
      site.status !== "completed" ||
      !site.laneCoverage.sameOrBetter ||
      site.comparisons.increasedAmbiguity ||
      site.validationOutcome?.category === "true_planned_regression" ||
      site.validationOutcome?.refreshRecommended === true ||
      !site.productionOutputInvariant.noNewProductionFacingOutputs ||
      !(site.artifacts.plan && site.artifacts.execution && site.artifacts.trace && site.artifacts.allInternalOnly && site.artifacts.pathsUnique) ||
      !site.trace.complete ||
      (site.durationMs.planned ?? 0) > longTailThresholdMs
    )
    .map((site) => ({
      url: site.url,
      reasonCodes: [
        site.status !== "completed" ? "site_not_completed" : undefined,
        !site.laneCoverage.sameOrBetter ? "lane_coverage_below_legacy" : undefined,
        site.comparisons.increasedAmbiguity ? "increased_ambiguity" : undefined,
        !site.productionOutputInvariant.noNewProductionFacingOutputs ? "new_production_facing_output" : undefined,
        !(site.artifacts.plan && site.artifacts.execution && site.artifacts.trace) ? "missing_planned_artifacts" : undefined,
        !(site.artifacts.allInternalOnly && site.artifacts.pathsUnique) ? "artifact_contract_issue" : undefined,
        !site.trace.complete ? "trace_incomplete" : undefined,
        (site.durationMs.planned ?? 0) > longTailThresholdMs ? "planned_long_tail" : undefined,
        site.pairFreshness ? `pair_freshness:${site.pairFreshness.status}` : undefined,
        site.validationOutcome ? `validation:${site.validationOutcome.category}` : undefined,
        site.validationOutcome?.refreshRecommended ? "fresh_pair_refresh_recommended" : undefined,
        ...(site.pairFreshness?.reasonCodes ?? []).map((reason) => `pair:${reason}`),
        ...(site.validationOutcome?.reasonCodes ?? []).map((reason) => `validation_reason:${reason}`),
        ...(site.longTailDiagnostic?.bottleneckReasonCodes ?? []).map((reason) => `bottleneck:${reason}`),
        ...site.notTestableReasons.map((reason) => `not_testable:${reason}`),
      ].filter((value): value is string => Boolean(value)),
      legacyMs: site.durationMs.legacy,
      plannedMs: site.durationMs.planned,
      improvementPct: site.durationMs.improvementPct,
      topScenario: site.longTailDiagnostic?.topScenario,
      topPhaseScenario: site.longTailDiagnostic?.topPhaseScenario,
      topPhase: site.longTailDiagnostic?.topPhaseLabel,
      topPhaseMs: site.longTailDiagnostic?.topPhaseDurationMs,
      topBucket: site.longTailDiagnostic?.bottleneckBuckets?.[0]?.bucket,
      topBucketMs: site.longTailDiagnostic?.bottleneckBuckets?.[0]?.totalMs,
      validationCategory: site.validationOutcome?.category,
      captureGapMs: site.pairFreshness?.captureGapMs,
      refreshRecommended: site.validationOutcome?.refreshRecommended,
    }))
    .sort((left, right) => (right.plannedMs ?? 0) - (left.plannedMs ?? 0) || left.url.localeCompare(right.url));
}

function renderMarkdown(report: ConsentDagReadinessGateReport): string {
  const lines = [
    "# V2 Consent DAG Readiness Gate",
    "",
    "Internal diagnostic only. Does not change production behavior.",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    "",
    "## Summary",
    "",
    `- URLs scanned: ${report.summary.urlsScanned}`,
    `- Succeeded: ${report.summary.succeeded}`,
    `- Failed: ${report.summary.failed}`,
    `- Same or better lane coverage: ${yesNo(report.summary.sameOrBetterLaneCoverage)}`,
    `- Increased ambiguity sites: ${report.summary.increasedAmbiguitySites}`,
    `- True planned regression sites: ${report.summary.truePlannedRegressionSites}`,
    `- Stale pair sites: ${report.summary.stalePairSites}`,
    `- Live variance suspected sites: ${report.summary.liveVarianceSuspectedSites}`,
    `- Unstable pair refresh sites: ${report.summary.unstablePairRefreshSites}`,
    `- No new production-facing outputs: ${yesNo(report.summary.noNewProductionFacingOutputs)}`,
    `- Complete planned artifacts: ${yesNo(report.summary.completePlannedArtifacts)}`,
    `- Trace complete: ${yesNo(report.summary.traceComplete)}`,
    `- p50 duration improvement: ${formatPct(report.summary.p50DurationImprovementPct)}`,
    `- p90 duration improvement: ${formatPct(report.summary.p90DurationImprovementPct)}`,
    `- Total improved sites: ${report.summary.totalImprovedSites}`,
    `- Planned long-tail sites (>15s): ${report.summary.plannedLongTailSites}`,
    "",
    "## Checks",
    "",
  ];
  for (const check of report.checks) {
    lines.push(`- ${check.passed ? "PASS" : "FAIL"} ${check.code}: ${check.message} actual=${formatValue(check.actual)} expected=${formatValue(check.expected)}`);
  }
  lines.push("", "## Diagnostic Sites", "");
  if (report.diagnosticSites.length === 0) {
    lines.push("- None.");
  } else {
    for (const site of report.diagnosticSites) {
      lines.push(`- ${site.url}: planned=${formatMs(site.plannedMs)}, legacy=${formatMs(site.legacyMs)}, improvement=${formatPct(site.improvementPct)}, bottleneck=${formatBottleneck(site)}, topBucket=${formatBucket(site)}; ${site.reasonCodes.slice(0, 8).join(", ")}`);
    }
  }
  lines.push("", "## Refresh Queues", "");
  lines.push(`- Unstable pair refresh URL file: ${report.queues.unstablePairRefreshPath}`);
  lines.push(`- Unstable pair refresh URLs: ${report.queues.unstablePairRefreshUrls.length}`);
  lines.push(`- Long-tail optimization URL file: ${report.queues.longTailOptimizationPath}`);
  lines.push(`- Long-tail optimization URLs: ${report.queues.longTailOptimizationUrls.length}`);
  lines.push(`- True planned regression URLs: ${report.queues.trueRegressionUrls.length}`);
  lines.push(`- Live variance suspected URLs: ${report.queues.liveVarianceSuspectedUrls.length}`);
  lines.push(`- Stale pair URLs: ${report.queues.stalePairUrls.length}`);
  if (report.queues.unstablePairRefreshUrls.length > 0) {
    for (const url of report.queues.unstablePairRefreshUrls.slice(0, 20)) {
      lines.push(`  - ${url}`);
    }
  }
  if (report.queues.longTailOptimizationUrls.length > 0) {
    lines.push("", "Top long-tail optimization URLs:");
    for (const url of report.queues.longTailOptimizationUrls.slice(0, 20)) {
      lines.push(`  - ${url}`);
    }
  }
  lines.push("", "## Notes", "");
  for (const note of report.notes) {
    lines.push(`- ${note}`);
  }
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    failOnFail: false,
    help: false,
    longTailThresholdMs: 15_000,
    minP50ImprovementPct: 20,
    minP90ImprovementPct: 10,
    minUrls: 50,
    outDir: DEFAULT_OUT_DIR,
    shadowComparePath: DEFAULT_SHADOW_COMPARE_PATH,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    } else if (arg === "--shadow-compare" && next) {
      args.shadowComparePath = next;
      index += 1;
    } else if (arg === "--out-dir" && next) {
      args.outDir = next;
      index += 1;
    } else if (arg === "--min-urls" && next) {
      args.minUrls = positiveIntArg(next, arg);
      index += 1;
    } else if (arg === "--min-p50-improvement-pct" && next) {
      args.minP50ImprovementPct = nonNegativeNumberArg(next, arg);
      index += 1;
    } else if (arg === "--min-p90-improvement-pct" && next) {
      args.minP90ImprovementPct = nonNegativeNumberArg(next, arg);
      index += 1;
    } else if (arg === "--long-tail-threshold-ms" && next) {
      args.longTailThresholdMs = positiveIntArg(next, arg);
      index += 1;
    } else if (arg === "--fail-on-fail") {
      args.failOnFail = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  return args;
}

function positiveIntArg(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function nonNegativeNumberArg(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return parsed;
}

function usage(): string {
  return [
    "Usage: pnpm v2:consent-dag-readiness-gate -- [options]",
    "",
    "Verifies a consent DAG shadow comparison artifact against rollout-readiness criteria.",
    "Artifact-only. Does not change production behavior or profile defaults.",
    "",
    "Options:",
    "  --shadow-compare <path>",
    "  --out-dir <path>",
    "  --min-urls <n>                         Default: 50",
    "  --min-p50-improvement-pct <n>          Default: 20",
    "  --min-p90-improvement-pct <n>          Default: 10",
    "  --long-tail-threshold-ms <n>           Default: 15000",
    "  --fail-on-fail",
    "  --help",
  ].join("\n");
}

function formatMs(value: number | undefined): string {
  return value === undefined ? "n/a" : `${value} ms`;
}

function formatPct(value: number | undefined): string {
  return value === undefined ? "n/a" : `${value.toFixed(1)}%`;
}

function formatBottleneck(site: ConsentDagReadinessGateReport["diagnosticSites"][number]): string {
  if (!site.topScenario && !site.topPhase) {
    return "n/a";
  }
  return [
    site.topScenario,
    site.topPhaseScenario && site.topPhase ? `${site.topPhaseScenario}:${site.topPhase}` : site.topPhase,
    site.topPhaseMs !== undefined ? formatMs(site.topPhaseMs) : undefined,
  ].filter(Boolean).join(" / ");
}

function formatBucket(site: ConsentDagReadinessGateReport["diagnosticSites"][number]): string {
  if (!site.topBucket) {
    return "n/a";
  }
  return `${site.topBucket}${site.topBucketMs !== undefined ? `/${formatMs(site.topBucketMs)}` : ""}`;
}

function formatValue(value: boolean | number | string | undefined): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return value === undefined ? "n/a" : String(value);
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
