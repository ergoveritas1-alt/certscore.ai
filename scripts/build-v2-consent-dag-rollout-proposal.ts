#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Recommendation = "ready_for_narrow_rollout_proposal" | string;

interface RolloutEvidencePacket {
  artifactVersion: "wc01.v2_consent_dag_rollout_evidence_packet.1";
  generatedAt: string;
  status: "pass" | "fail";
  recommendation: Recommendation;
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
    status: "pass" | "fail";
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
}

interface ConsentDagRolloutProposal {
  artifactVersion: "wc01.v2_consent_dag_rollout_proposal.1";
  generatedAt: string;
  status: "approved_to_prepare_opt_in_change" | "blocked";
  recommendation: "prepare_narrow_opt_in_change" | "do_not_roll_out";
  evidencePacketPath: string;
  rolloutScope: {
    scannerMode: "planned_parallel";
    initialSurface: "internal_admin_v2_scan_lab_only";
    eligibleProfiles: string[];
    defaultProfileSwitchIncluded: false;
    productionReportChangesIncluded: false;
    customerFacingChangesIncluded: false;
  };
  proposedChangeSet: Array<{
    code: string;
    description: string;
    implementationBoundary: string;
  }>;
  guardrails: Array<{
    code: string;
    requirement: string;
    enforcement: string;
  }>;
  preRolloutChecks: Array<{
    code: string;
    required: boolean;
    currentStatus: "pass" | "fail";
    evidence: string;
  }>;
  rollbackPlan: Array<{
    code: string;
    action: string;
  }>;
  successMetrics: Array<{
    code: string;
    target: string;
    currentValue: string;
  }>;
  nonGoals: string[];
  nextImplementationSteps: string[];
  longTailBacklog: {
    count: number;
    topUrls: Array<{
      url: string;
      split: "train_validation" | "holdout";
      plannedMs?: number;
      bottleneck?: string;
    }>;
  };
  notes: string[];
}

interface Args {
  evidencePacketPath: string;
  help: boolean;
  outDir: string;
}

const DEFAULT_EVIDENCE_PACKET_PATH = path.join(
  "artifacts",
  "gold-corpus",
  "v2-current",
  "quality-gate",
  "ConsentDagRolloutEvidencePacket.json",
);
const DEFAULT_OUT_DIR = path.join("artifacts", "gold-corpus", "v2-current", "quality-gate");

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const evidence = await readEvidencePacket(args.evidencePacketPath);
  const proposal = buildProposal(evidence, args.evidencePacketPath);
  await mkdir(args.outDir, { recursive: true });
  const jsonPath = path.join(args.outDir, "ConsentDagRolloutProposal.json");
  const mdPath = path.join(args.outDir, "ConsentDagRolloutProposal.md");
  await writeFile(jsonPath, `${JSON.stringify(proposal, null, 2)}\n`);
  await writeFile(mdPath, renderMarkdown(proposal));
  console.log(JSON.stringify({
    outDir: args.outDir,
    status: proposal.status,
    recommendation: proposal.recommendation,
    initialSurface: proposal.rolloutScope.initialSurface,
    eligibleProfiles: proposal.rolloutScope.eligibleProfiles,
    preRolloutChecks: proposal.preRolloutChecks.map((check) => ({
      code: check.code,
      currentStatus: check.currentStatus,
    })),
  }, null, 2));
}

async function readEvidencePacket(filePath: string): Promise<RolloutEvidencePacket> {
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as RolloutEvidencePacket;
  if (parsed.artifactVersion !== "wc01.v2_consent_dag_rollout_evidence_packet.1") {
    throw new Error(`Unexpected rollout evidence packet artifactVersion in ${filePath}.`);
  }
  return parsed;
}

function buildProposal(
  evidence: RolloutEvidencePacket,
  evidencePacketPath: string,
): ConsentDagRolloutProposal {
  const readinessPassed = evidence.status === "pass" &&
    evidence.recommendation === "ready_for_narrow_rollout_proposal";
  const noBlockers = evidence.combinedSummary.truePlannedRegressionSites === 0 &&
    evidence.combinedSummary.unstablePairRefreshSites === 0 &&
    evidence.queues.unstablePairRefreshUrls.length === 0;
  const contractsHold = evidence.combinedSummary.noNewProductionFacingOutputs &&
    evidence.combinedSummary.completePlannedArtifacts &&
    evidence.combinedSummary.traceComplete;
  const coverageStable = evidence.combinedSummary.sameOrBetterLaneCoverage &&
    evidence.combinedSummary.increasedAmbiguitySites === 0;
  const speedMaterial = (evidence.combinedSummary.weightedP50DurationImprovementPct ?? 0) >= 20 &&
    (evidence.combinedSummary.weightedP90DurationImprovementPct ?? 0) >= 10;
  const canPrepareOptIn = readinessPassed && noBlockers && contractsHold && coverageStable && speedMaterial;

  return {
    artifactVersion: "wc01.v2_consent_dag_rollout_proposal.1",
    generatedAt: new Date().toISOString(),
    status: canPrepareOptIn ? "approved_to_prepare_opt_in_change" : "blocked",
    recommendation: canPrepareOptIn ? "prepare_narrow_opt_in_change" : "do_not_roll_out",
    evidencePacketPath,
    rolloutScope: {
      scannerMode: "planned_parallel",
      initialSurface: "internal_admin_v2_scan_lab_only",
      eligibleProfiles: ["consent", "full"],
      defaultProfileSwitchIncluded: false,
      productionReportChangesIncluded: false,
      customerFacingChangesIncluded: false,
    },
    proposedChangeSet: [
      {
        code: "admin_scan_lab_opt_in",
        description: "Allow internal admin v2 scan lab requests to run consent-flow scanning with scenarioPlanningMode=planned_parallel when explicitly requested.",
        implementationBoundary: "apps/web admin scan-lab request plumbing and v2 scan-core RunScanInput only.",
      },
      {
        code: "legacy_default_preserved",
        description: "Keep legacy_sequential as the default whenever the opt-in flag is absent, invalid, or disabled.",
        implementationBoundary: "Compatibility switch only; no profile default migration.",
      },
      {
        code: "artifact_only_validation",
        description: "Continue writing consent_scenario_plan, consent_scenario_execution, consent_flow_trace, shadow compare, readiness, and rollout artifacts as internal diagnostics.",
        implementationBoundary: "Internal artifact refs and gold-corpus quality gates only.",
      },
    ],
    guardrails: [
      {
        code: "baseline_hard_dependency",
        requirement: "baseline_pre_consent remains the only hard dependency for planning.",
        enforcement: "Baseline failure fails consent module; non-baseline failures become execution/trace outcomes.",
      },
      {
        code: "action_proof_gated_comparisons",
        requirement: "Accept/reject/opt-out comparison conclusions require successful action proof.",
        enforcement: "Failed/skipped action lanes may retain observations but remain non-comparable.",
      },
      {
        code: "internal_only_artifacts",
        requirement: "Scenario plan, execution, and trace artifacts remain internal_only artifactRefs.",
        enforcement: "Readiness gate blocks if planned artifacts are missing, non-internal, non-unique, or trace-incomplete.",
      },
      {
        code: "production_surface_freeze",
        requirement: "No production report, UI, scoring, regulatory-row, persisted-concern, or finding-surfacing changes.",
        enforcement: "Rollout scope is internal admin v2 scan lab only.",
      },
      {
        code: "readiness_gate_before_widening",
        requirement: "Train/validation and holdout readiness gates must pass before any widening.",
        enforcement: "Rollout packet and proposal must be regenerated from current gates before profile default changes.",
      },
      {
        code: "fallback_to_legacy",
        requirement: "Legacy sequential mode remains available for immediate rollback.",
        enforcement: "Remove/disable the opt-in request path or force scenarioPlanningMode=legacy_sequential.",
      },
    ],
    preRolloutChecks: [
      {
        code: "readiness_packet_green",
        required: true,
        currentStatus: readinessPassed ? "pass" : "fail",
        evidence: `${evidence.status}:${evidence.recommendation}`,
      },
      {
        code: "no_regression_or_refresh_blockers",
        required: true,
        currentStatus: noBlockers ? "pass" : "fail",
        evidence: `truePlannedRegressionSites=${evidence.combinedSummary.truePlannedRegressionSites}; unstablePairRefreshSites=${evidence.combinedSummary.unstablePairRefreshSites}`,
      },
      {
        code: "coverage_and_ambiguity_stable",
        required: true,
        currentStatus: coverageStable ? "pass" : "fail",
        evidence: `sameOrBetterLaneCoverage=${evidence.combinedSummary.sameOrBetterLaneCoverage}; increasedAmbiguitySites=${evidence.combinedSummary.increasedAmbiguitySites}`,
      },
      {
        code: "internal_artifact_contracts_hold",
        required: true,
        currentStatus: contractsHold ? "pass" : "fail",
        evidence: `noNewProductionFacingOutputs=${evidence.combinedSummary.noNewProductionFacingOutputs}; completePlannedArtifacts=${evidence.combinedSummary.completePlannedArtifacts}; traceComplete=${evidence.combinedSummary.traceComplete}`,
      },
      {
        code: "speed_improvement_material",
        required: true,
        currentStatus: speedMaterial ? "pass" : "fail",
        evidence: `weightedP50=${formatPct(evidence.combinedSummary.weightedP50DurationImprovementPct)}; weightedP90=${formatPct(evidence.combinedSummary.weightedP90DurationImprovementPct)}`,
      },
    ],
    rollbackPlan: [
      {
        code: "disable_opt_in_flag",
        action: "Stop passing consentDag/scenarioPlanningMode=planned_parallel from admin v2 scan lab.",
      },
      {
        code: "force_legacy_mode",
        action: "Force scenarioPlanningMode=legacy_sequential at scan request construction while preserving artifacts for comparison.",
      },
      {
        code: "rerun_readiness_gate",
        action: "Regenerate readiness and rollout artifacts after rollback to confirm no lingering planned-mode blockers.",
      },
    ],
    successMetrics: [
      {
        code: "p50_speed_improvement",
        target: ">=20% improvement",
        currentValue: formatPct(evidence.combinedSummary.weightedP50DurationImprovementPct),
      },
      {
        code: "p90_speed_improvement",
        target: ">=10% improvement",
        currentValue: formatPct(evidence.combinedSummary.weightedP90DurationImprovementPct),
      },
      {
        code: "lane_coverage",
        target: "same or better",
        currentValue: evidence.combinedSummary.sameOrBetterLaneCoverage ? "same_or_better" : "below_legacy",
      },
      {
        code: "increased_ambiguity",
        target: "0 sites",
        currentValue: String(evidence.combinedSummary.increasedAmbiguitySites),
      },
      {
        code: "artifact_completeness",
        target: "complete internal artifacts",
        currentValue: evidence.combinedSummary.completePlannedArtifacts && evidence.combinedSummary.traceComplete ? "complete" : "incomplete",
      },
      {
        code: "long_tail_backlog",
        target: "monitored, not rollout-blocking",
        currentValue: String(evidence.combinedSummary.plannedLongTailSites),
      },
    ],
    nonGoals: [
      "Do not switch any production profile default in this proposal.",
      "Do not expose scenario DAG artifacts in customer-facing reports.",
      "Do not change scoring, regulatory rows, persisted concerns, or unified finding surfacing.",
      "Do not use v2 dry-run artifacts as production findings.",
      "Do not merge pre-consent baseline architecture in this milestone.",
    ],
    nextImplementationSteps: [
      "Wire the internal admin v2 scan lab opt-in to request scenarioPlanningMode=planned_parallel for eligible consent/full runs.",
      "Keep legacy_sequential as default for all non-opt-in requests.",
      "Show/record the selected planning mode in internal scan-lab metadata only.",
      "Run a post-change admin scan-lab smoke on WebMD or a similar corpus target.",
      "Regenerate consent DAG readiness and rollout artifacts after the opt-in switch.",
    ],
    longTailBacklog: {
      count: evidence.queues.longTailOptimizationUrls.length,
      topUrls: evidence.topLongTailSites.slice(0, 10).map((site) => ({
        url: site.url,
        split: site.split,
        plannedMs: site.plannedMs,
        bottleneck: [site.topScenario, site.topPhase, site.topBucket].filter(Boolean).join(" / ") || undefined,
      })),
    },
    notes: [
      "Internal proposal artifact only.",
      "This proposal approves preparing a narrow opt-in change, not a customer-facing production integration.",
      "Actual rollout should remain reversible by disabling the opt-in path or forcing legacy_sequential.",
    ],
  };
}

function renderMarkdown(proposal: ConsentDagRolloutProposal): string {
  const lines = [
    "# V2 Consent DAG Narrow Rollout Proposal",
    "",
    "Internal diagnostic proposal only. Does not change production behavior by itself.",
    "",
    `Generated: ${proposal.generatedAt}`,
    `Status: ${proposal.status}`,
    `Recommendation: ${proposal.recommendation}`,
    "",
    "## Scope",
    "",
    `- Initial surface: ${proposal.rolloutScope.initialSurface}`,
    `- Scanner mode: ${proposal.rolloutScope.scannerMode}`,
    `- Eligible profiles: ${proposal.rolloutScope.eligibleProfiles.join(", ")}`,
    `- Default profile switch included: ${yesNo(proposal.rolloutScope.defaultProfileSwitchIncluded)}`,
    `- Production report changes included: ${yesNo(proposal.rolloutScope.productionReportChangesIncluded)}`,
    `- Customer-facing changes included: ${yesNo(proposal.rolloutScope.customerFacingChangesIncluded)}`,
    "",
    "## Proposed Change Set",
    "",
  ];
  for (const change of proposal.proposedChangeSet) {
    lines.push(`- ${change.code}: ${change.description} Boundary: ${change.implementationBoundary}`);
  }
  lines.push("", "## Pre-Rollout Checks", "");
  for (const check of proposal.preRolloutChecks) {
    lines.push(`- ${check.currentStatus.toUpperCase()} ${check.code}: ${check.evidence}`);
  }
  lines.push("", "## Guardrails", "");
  for (const guardrail of proposal.guardrails) {
    lines.push(`- ${guardrail.code}: ${guardrail.requirement} Enforcement: ${guardrail.enforcement}`);
  }
  lines.push("", "## Success Metrics", "");
  for (const metric of proposal.successMetrics) {
    lines.push(`- ${metric.code}: current=${metric.currentValue}; target=${metric.target}`);
  }
  lines.push("", "## Rollback Plan", "");
  for (const step of proposal.rollbackPlan) {
    lines.push(`- ${step.code}: ${step.action}`);
  }
  lines.push("", "## Long-Tail Backlog", "");
  lines.push(`- Count: ${proposal.longTailBacklog.count}`);
  for (const site of proposal.longTailBacklog.topUrls) {
    lines.push(`- ${site.url} (${site.split}): planned=${formatMs(site.plannedMs)}, bottleneck=${site.bottleneck ?? "n/a"}`);
  }
  lines.push("", "## Next Implementation Steps", "");
  for (const step of proposal.nextImplementationSteps) {
    lines.push(`- ${step}`);
  }
  lines.push("", "## Non-Goals", "");
  for (const nonGoal of proposal.nonGoals) {
    lines.push(`- ${nonGoal}`);
  }
  lines.push("", "## Notes", "");
  for (const note of proposal.notes) {
    lines.push(`- ${note}`);
  }
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    evidencePacketPath: DEFAULT_EVIDENCE_PACKET_PATH,
    help: false,
    outDir: DEFAULT_OUT_DIR,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    } else if (arg === "--evidence-packet" && next) {
      args.evidencePacketPath = next;
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
    "Usage: pnpm v2:consent-dag-rollout-proposal -- [options]",
    "",
    "Builds an internal narrow rollout proposal from a consent DAG rollout evidence packet.",
    "Artifact-only. Does not change production behavior or profile defaults.",
    "",
    "Options:",
    "  --evidence-packet <path>",
    "  --out-dir <path>",
    "  --help",
  ].join("\n");
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
