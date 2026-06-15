#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type GateStatus = "pass" | "fail";
type RolloutRecommendation =
  | "ready_for_narrow_rollout_proposal"
  | "refresh_required_before_rollout_proposal"
  | "hardening_required_before_rollout_proposal";

interface ConsentDagReadinessGateReport {
  reportVersion: "wc01.v2_consent_dag_readiness_gate.1";
  generatedAt: string;
  input: {
    shadowComparePath: string;
    outDir: string;
    longTailThresholdMs?: number;
    minUrls: number;
    minP50ImprovementPct: number;
    minP90ImprovementPct: number;
  };
  status: GateStatus;
  summary: {
    urlsScanned: number;
    succeeded: number;
    failed: number;
    truePlannedRegressionSites: number;
    stalePairSites: number;
    liveVarianceSuspectedSites: number;
    unstablePairRefreshSites: number;
    p50DurationDeltaMs?: number;
    p90DurationDeltaMs?: number;
    p50DurationImprovementPct?: number;
    p90DurationImprovementPct?: number;
    sameOrBetterLaneCoverage: boolean;
    noNewProductionFacingOutputs: boolean;
    completePlannedArtifacts: boolean;
    traceComplete: boolean;
    increasedAmbiguitySites: number;
    plannedLongTailSites: number;
    totalImprovedSites: number;
  };
  blockers: Array<{
    code: string;
    message: string;
  }>;
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
    longTailOptimizationPath?: string;
    longTailOptimizationUrls?: string[];
    trueRegressionUrls: string[];
    liveVarianceSuspectedUrls: string[];
    stalePairUrls: string[];
  };
}

interface RolloutEvidencePacket {
  artifactVersion: "wc01.v2_consent_dag_rollout_evidence_packet.1";
  generatedAt: string;
  status: "pass" | "fail";
  recommendation: RolloutRecommendation;
  scope: {
    scannerMode: "planned_parallel";
    proposedUse: "narrow_v2_profile_rollout_proposal_only";
    productionChangesIncluded: false;
    excludedChanges: string[];
  };
  inputs: {
    trainValidationGatePath: string;
    holdoutGatePath: string;
    outDir: string;
  };
  combinedSummary: {
    urlsScanned: number;
    succeeded: number;
    failed: number;
    truePlannedRegressionSites: number;
    stalePairSites: number;
    liveVarianceSuspectedSites: number;
    unstablePairRefreshSites: number;
    increasedAmbiguitySites: number;
    plannedLongTailSites: number;
    totalImprovedSites: number;
    noNewProductionFacingOutputs: boolean;
    completePlannedArtifacts: boolean;
    traceComplete: boolean;
    sameOrBetterLaneCoverage: boolean;
    weightedP50DurationImprovementPct?: number;
    weightedP90DurationImprovementPct?: number;
  };
  splitSummaries: Array<{
    split: "train_validation" | "holdout";
    gatePath: string;
    status: GateStatus;
    urlsScanned: number;
    blockers: string[];
    p50DurationImprovementPct?: number;
    p90DurationImprovementPct?: number;
    sameOrBetterLaneCoverage: boolean;
    increasedAmbiguitySites: number;
    truePlannedRegressionSites: number;
    unstablePairRefreshSites: number;
    plannedLongTailSites: number;
  }>;
  queues: {
    unstablePairRefreshUrls: string[];
    trueRegressionUrls: string[];
    liveVarianceSuspectedUrls: string[];
    stalePairUrls: string[];
    longTailOptimizationUrls: string[];
  };
  topLongTailSites: Array<{
    split: "train_validation" | "holdout";
    url: string;
    plannedMs?: number;
    legacyMs?: number;
    improvementPct?: number;
    topScenario?: string;
    topPhase?: string;
    topBucket?: string;
  }>;
  decisionFactors: Array<{
    code: string;
    passed: boolean;
    message: string;
  }>;
  notes: string[];
}

interface Args {
  help: boolean;
  holdoutGatePath: string;
  outDir: string;
  trainValidationGatePath: string;
}

const DEFAULT_TRAIN_VALIDATION_GATE_PATH = path.join(
  "artifacts",
  "gold-corpus",
  "v2-current",
  "quality-gate",
  "ConsentDagReadinessGate.json",
);
const DEFAULT_HOLDOUT_GATE_PATH = path.join(
  "artifacts",
  "gold-corpus",
  "v2-current",
  "quality-gate",
  "holdout",
  "ConsentDagReadinessGate.json",
);
const DEFAULT_OUT_DIR = path.join("artifacts", "gold-corpus", "v2-current", "quality-gate");

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const trainValidation = await readGate(args.trainValidationGatePath);
  const holdout = await readGate(args.holdoutGatePath);
  const packet = buildPacket({
    args,
    trainValidation,
    holdout,
  });

  await mkdir(args.outDir, { recursive: true });
  const jsonPath = path.join(args.outDir, "ConsentDagRolloutEvidencePacket.json");
  const mdPath = path.join(args.outDir, "ConsentDagRolloutEvidencePacket.md");
  await writeFile(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  await writeFile(mdPath, renderMarkdown(packet));
  console.log(JSON.stringify({
    outDir: args.outDir,
    status: packet.status,
    recommendation: packet.recommendation,
    combinedSummary: packet.combinedSummary,
    longTailOptimizationUrls: packet.queues.longTailOptimizationUrls.length,
  }, null, 2));
}

async function readGate(filePath: string): Promise<ConsentDagReadinessGateReport> {
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as ConsentDagReadinessGateReport;
  if (parsed.reportVersion !== "wc01.v2_consent_dag_readiness_gate.1") {
    throw new Error(`Unexpected readiness gate reportVersion in ${filePath}.`);
  }
  return parsed;
}

function buildPacket(input: {
  args: Args;
  trainValidation: ConsentDagReadinessGateReport;
  holdout: ConsentDagReadinessGateReport;
}): RolloutEvidencePacket {
  const splitInputs = [
    {
      gate: input.trainValidation,
      path: input.args.trainValidationGatePath,
      split: "train_validation" as const,
    },
    {
      gate: input.holdout,
      path: input.args.holdoutGatePath,
      split: "holdout" as const,
    },
  ];
  const gates = splitInputs.map((split) => split.gate);
  const combinedSummary: RolloutEvidencePacket["combinedSummary"] = {
    urlsScanned: sum(gates, (gate) => gate.summary.urlsScanned),
    succeeded: sum(gates, (gate) => gate.summary.succeeded),
    failed: sum(gates, (gate) => gate.summary.failed),
    truePlannedRegressionSites: sum(gates, (gate) => gate.summary.truePlannedRegressionSites),
    stalePairSites: sum(gates, (gate) => gate.summary.stalePairSites),
    liveVarianceSuspectedSites: sum(gates, (gate) => gate.summary.liveVarianceSuspectedSites),
    unstablePairRefreshSites: sum(gates, (gate) => gate.summary.unstablePairRefreshSites),
    increasedAmbiguitySites: sum(gates, (gate) => gate.summary.increasedAmbiguitySites),
    plannedLongTailSites: sum(gates, (gate) => gate.summary.plannedLongTailSites),
    totalImprovedSites: sum(gates, (gate) => gate.summary.totalImprovedSites),
    noNewProductionFacingOutputs: gates.every((gate) => gate.summary.noNewProductionFacingOutputs),
    completePlannedArtifacts: gates.every((gate) => gate.summary.completePlannedArtifacts),
    traceComplete: gates.every((gate) => gate.summary.traceComplete),
    sameOrBetterLaneCoverage: gates.every((gate) => gate.summary.sameOrBetterLaneCoverage),
    weightedP50DurationImprovementPct: weightedAverage(gates, (gate) => gate.summary.p50DurationImprovementPct),
    weightedP90DurationImprovementPct: weightedAverage(gates, (gate) => gate.summary.p90DurationImprovementPct),
  };
  const queues = {
    unstablePairRefreshUrls: uniqueSorted(gates.flatMap((gate) => gate.queues.unstablePairRefreshUrls)),
    trueRegressionUrls: uniqueSorted(gates.flatMap((gate) => gate.queues.trueRegressionUrls)),
    liveVarianceSuspectedUrls: uniqueSorted(gates.flatMap((gate) => gate.queues.liveVarianceSuspectedUrls)),
    stalePairUrls: uniqueSorted(gates.flatMap((gate) => gate.queues.stalePairUrls)),
    longTailOptimizationUrls: uniqueSorted(gates.flatMap((gate) => gate.queues.longTailOptimizationUrls ?? [])),
  };
  const decisionFactors = [
    {
      code: "all_readiness_gates_pass",
      passed: gates.every((gate) => gate.status === "pass"),
      message: "Train/validation and holdout readiness gates both pass.",
    },
    {
      code: "no_regression_or_refresh_blockers",
      passed: combinedSummary.truePlannedRegressionSites === 0 &&
        combinedSummary.unstablePairRefreshSites === 0 &&
        queues.unstablePairRefreshUrls.length === 0,
      message: "No true planned regressions or unstable refresh blockers remain.",
    },
    {
      code: "coverage_and_ambiguity_stable",
      passed: combinedSummary.sameOrBetterLaneCoverage && combinedSummary.increasedAmbiguitySites === 0,
      message: "Planned mode keeps same-or-better lane coverage with no increased ambiguity.",
    },
    {
      code: "internal_artifact_contracts_hold",
      passed: combinedSummary.noNewProductionFacingOutputs &&
        combinedSummary.completePlannedArtifacts &&
        combinedSummary.traceComplete,
      message: "Scenario artifacts remain internal-only, complete, and traceable.",
    },
    {
      code: "speed_improvement_material",
      passed: (combinedSummary.weightedP50DurationImprovementPct ?? 0) >= 20 &&
        (combinedSummary.weightedP90DurationImprovementPct ?? 0) >= 10,
      message: "Combined p50 and p90 planned-mode speed improvement is material.",
    },
  ];
  const status = decisionFactors.every((factor) => factor.passed) ? "pass" : "fail";
  const recommendation = recommendationFor(status, combinedSummary, queues);

  return {
    artifactVersion: "wc01.v2_consent_dag_rollout_evidence_packet.1",
    generatedAt: new Date().toISOString(),
    status,
    recommendation,
    scope: {
      scannerMode: "planned_parallel",
      proposedUse: "narrow_v2_profile_rollout_proposal_only",
      productionChangesIncluded: false,
      excludedChanges: [
        "production report changes",
        "UI changes",
        "scoring changes",
        "regulatory-row changes",
        "persisted-concern changes",
        "finding-surfacing changes",
        "default profile switch",
      ],
    },
    inputs: {
      trainValidationGatePath: input.args.trainValidationGatePath,
      holdoutGatePath: input.args.holdoutGatePath,
      outDir: input.args.outDir,
    },
    combinedSummary,
    splitSummaries: splitInputs.map(({ gate, path: gatePath, split }) => ({
      split,
      gatePath,
      status: gate.status,
      urlsScanned: gate.summary.urlsScanned,
      blockers: gate.blockers.map((blocker) => blocker.code),
      p50DurationImprovementPct: gate.summary.p50DurationImprovementPct,
      p90DurationImprovementPct: gate.summary.p90DurationImprovementPct,
      sameOrBetterLaneCoverage: gate.summary.sameOrBetterLaneCoverage,
      increasedAmbiguitySites: gate.summary.increasedAmbiguitySites,
      truePlannedRegressionSites: gate.summary.truePlannedRegressionSites,
      unstablePairRefreshSites: gate.summary.unstablePairRefreshSites,
      plannedLongTailSites: gate.summary.plannedLongTailSites,
    })),
    queues,
    topLongTailSites: topLongTailSites(splitInputs),
    decisionFactors,
    notes: [
      "Internal diagnostic artifact only.",
      "This packet supports a rollout proposal; it does not switch any v2 profile default.",
      "No production report, UI, scoring, regulatory-row, persisted-concern, or finding-surfacing changes are included.",
      "Long-tail URLs are speed optimization candidates, not readiness blockers while quality gates remain green.",
    ],
  };
}

function recommendationFor(
  status: "pass" | "fail",
  summary: RolloutEvidencePacket["combinedSummary"],
  queues: RolloutEvidencePacket["queues"],
): RolloutRecommendation {
  if (queues.unstablePairRefreshUrls.length > 0 || summary.unstablePairRefreshSites > 0) {
    return "refresh_required_before_rollout_proposal";
  }
  if (status === "pass") {
    return "ready_for_narrow_rollout_proposal";
  }
  return "hardening_required_before_rollout_proposal";
}

function topLongTailSites(
  splitInputs: Array<{
    gate: ConsentDagReadinessGateReport;
    split: "train_validation" | "holdout";
  }>,
): RolloutEvidencePacket["topLongTailSites"] {
  return splitInputs
    .flatMap(({ gate, split }) =>
      gate.diagnosticSites
        .filter((site) => site.reasonCodes.includes("planned_long_tail"))
        .map((site) => ({
          split,
          url: site.url,
          plannedMs: site.plannedMs,
          legacyMs: site.legacyMs,
          improvementPct: site.improvementPct,
          topScenario: site.topScenario,
          topPhase: site.topPhase,
          topBucket: site.topBucket,
        }))
    )
    .sort((left, right) => (right.plannedMs ?? 0) - (left.plannedMs ?? 0) || left.url.localeCompare(right.url))
    .slice(0, 20);
}

function renderMarkdown(packet: RolloutEvidencePacket): string {
  const lines = [
    "# V2 Consent DAG Rollout Evidence Packet",
    "",
    "Internal diagnostic only. Does not change production behavior.",
    "",
    `Generated: ${packet.generatedAt}`,
    `Status: ${packet.status}`,
    `Recommendation: ${packet.recommendation}`,
    "",
    "## Scope",
    "",
    `- Scanner mode: ${packet.scope.scannerMode}`,
    `- Proposed use: ${packet.scope.proposedUse}`,
    `- Production changes included: ${packet.scope.productionChangesIncluded ? "yes" : "no"}`,
    `- Excluded changes: ${packet.scope.excludedChanges.join(", ")}`,
    "",
    "## Combined Summary",
    "",
    `- URLs scanned: ${packet.combinedSummary.urlsScanned}`,
    `- Succeeded: ${packet.combinedSummary.succeeded}`,
    `- Failed: ${packet.combinedSummary.failed}`,
    `- Same or better lane coverage: ${yesNo(packet.combinedSummary.sameOrBetterLaneCoverage)}`,
    `- Increased ambiguity sites: ${packet.combinedSummary.increasedAmbiguitySites}`,
    `- True planned regression sites: ${packet.combinedSummary.truePlannedRegressionSites}`,
    `- Unstable pair refresh sites: ${packet.combinedSummary.unstablePairRefreshSites}`,
    `- No new production-facing outputs: ${yesNo(packet.combinedSummary.noNewProductionFacingOutputs)}`,
    `- Complete planned artifacts: ${yesNo(packet.combinedSummary.completePlannedArtifacts)}`,
    `- Trace complete: ${yesNo(packet.combinedSummary.traceComplete)}`,
    `- Weighted p50 duration improvement: ${formatPct(packet.combinedSummary.weightedP50DurationImprovementPct)}`,
    `- Weighted p90 duration improvement: ${formatPct(packet.combinedSummary.weightedP90DurationImprovementPct)}`,
    `- Planned long-tail sites: ${packet.combinedSummary.plannedLongTailSites}`,
    "",
    "## Split Summary",
    "",
    "| Split | Status | URLs | p50 improvement | p90 improvement | Coverage | Ambiguity | Regressions | Refresh | Long-tail |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const split of packet.splitSummaries) {
    lines.push([
      split.split,
      split.status,
      split.urlsScanned,
      formatPct(split.p50DurationImprovementPct),
      formatPct(split.p90DurationImprovementPct),
      yesNo(split.sameOrBetterLaneCoverage),
      split.increasedAmbiguitySites,
      split.truePlannedRegressionSites,
      split.unstablePairRefreshSites,
      split.plannedLongTailSites,
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("", "## Decision Factors", "");
  for (const factor of packet.decisionFactors) {
    lines.push(`- ${factor.passed ? "PASS" : "FAIL"} ${factor.code}: ${factor.message}`);
  }
  lines.push("", "## Queues", "");
  lines.push(`- Unstable pair refresh URLs: ${packet.queues.unstablePairRefreshUrls.length}`);
  lines.push(`- True regression URLs: ${packet.queues.trueRegressionUrls.length}`);
  lines.push(`- Live variance suspected URLs: ${packet.queues.liveVarianceSuspectedUrls.length}`);
  lines.push(`- Stale pair URLs: ${packet.queues.stalePairUrls.length}`);
  lines.push(`- Long-tail optimization URLs: ${packet.queues.longTailOptimizationUrls.length}`);
  if (packet.topLongTailSites.length > 0) {
    lines.push("", "## Top Long-Tail Sites", "");
    for (const site of packet.topLongTailSites) {
      lines.push(`- ${site.url} (${site.split}): planned=${formatMs(site.plannedMs)}, legacy=${formatMs(site.legacyMs)}, improvement=${formatPct(site.improvementPct)}, bottleneck=${formatLongTail(site)}`);
    }
  }
  lines.push("", "## Notes", "");
  for (const note of packet.notes) {
    lines.push(`- ${note}`);
  }
  return `${lines.join("\n")}\n`;
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

function weightedAverage(
  gates: ConsentDagReadinessGateReport[],
  pick: (gate: ConsentDagReadinessGateReport) => number | undefined,
): number | undefined {
  const values = gates
    .map((gate) => ({ weight: gate.summary.urlsScanned, value: pick(gate) }))
    .filter((item): item is { weight: number; value: number } => item.value !== undefined);
  const totalWeight = sum(values, (item) => item.weight);
  if (totalWeight === 0) {
    return undefined;
  }
  return values.reduce((total, item) => total + item.value * item.weight, 0) / totalWeight;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    help: false,
    holdoutGatePath: DEFAULT_HOLDOUT_GATE_PATH,
    outDir: DEFAULT_OUT_DIR,
    trainValidationGatePath: DEFAULT_TRAIN_VALIDATION_GATE_PATH,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    } else if (arg === "--train-validation-gate" && next) {
      args.trainValidationGatePath = next;
      index += 1;
    } else if (arg === "--holdout-gate" && next) {
      args.holdoutGatePath = next;
      index += 1;
    } else if (arg === "--out-dir" && next) {
      args.outDir = next;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  return args;
}

function usage(): string {
  return [
    "Usage: pnpm v2:consent-dag-rollout-packet -- [options]",
    "",
    "Builds an internal rollout evidence packet from train/validation and holdout consent DAG readiness gates.",
    "Artifact-only. Does not change production behavior or profile defaults.",
    "",
    "Options:",
    "  --train-validation-gate <path>",
    "  --holdout-gate <path>",
    "  --out-dir <path>",
    "  --help",
  ].join("\n");
}

function formatLongTail(site: RolloutEvidencePacket["topLongTailSites"][number]): string {
  return [site.topScenario, site.topPhase, site.topBucket].filter(Boolean).join(" / ") || "n/a";
}

function formatMs(value: number | undefined): string {
  return value === undefined ? "n/a" : `${value} ms`;
}

function formatPct(value: number | undefined): string {
  return value === undefined ? "n/a" : `${value.toFixed(1)}%`;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
