#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type QualityStatus = "accepted" | "accepted_with_limitations" | "needs_attention" | "planned_only";

interface CurrentGoldCorpusManifest {
  manifestVersion: string;
  generatedAt: string;
  summary: {
    qualityStatusCounts?: Record<string, number>;
    totalTargets?: number;
  };
  targets: CorpusTarget[];
}

interface CorpusTarget {
  targetId: string;
  targetType: "live_site" | "synthetic_fixture";
  canonicalUrl?: string;
  domain?: string;
  split: "train" | "validation" | "test";
  sourceSets: string[];
  laneTags: string[];
  qualityStatus: QualityStatus;
  acceptedArtifacts: Array<{
    artifactPaths?: Record<string, string>;
    profile?: string;
    source?: string;
    status?: string;
    statusReasons?: string[];
  }>;
  eligibility?: {
    candidateBacklog?: boolean;
    holdoutEligible?: boolean;
    regressionOnly?: boolean;
    trainingEligible?: boolean;
    validationEligible?: boolean;
    reasons?: string[];
  };
}

interface GateFinding {
  severity: "fail" | "warn" | "info";
  code: string;
  message: string;
  targetIds: string[];
}

interface QualityGateReport {
  reportVersion: "wc01.v2_current_gold_corpus_quality_gate.1";
  generatedAt: string;
  input: {
    manifestPath: string;
    outDir: string;
  };
  status: "pass" | "warn" | "fail";
  summary: {
    targets: number;
    liveTargets: number;
    syntheticFixtures: number;
    accepted: number;
    acceptedWithLimitations: number;
    needsAttention: number;
    plannedOnly: number;
    trainingEligible: number;
    validationEligible: number;
    holdoutEligible: number;
    regressionOnly: number;
    candidateBacklog: number;
  };
  findings: GateFinding[];
  queues: Record<string, {
    count: number;
    path: string;
  }>;
}

interface Args {
  help: boolean;
  manifestPath: string;
  outDir: string;
}

const DEFAULT_MANIFEST_PATH = path.join("artifacts", "gold-corpus", "v2-current", "GoldCorpusManifest.json");
const DEFAULT_OUT_DIR = path.join("artifacts", "gold-corpus", "v2-current", "quality-gate");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const manifest = JSON.parse(await readFile(args.manifestPath, "utf8")) as CurrentGoldCorpusManifest;
  const findings = buildFindings(manifest);
  const queues = buildQueues(manifest);
  const status = findings.some((finding) => finding.severity === "fail")
    ? "fail"
    : findings.some((finding) => finding.severity === "warn") ? "warn" : "pass";
  const report: QualityGateReport = {
    reportVersion: "wc01.v2_current_gold_corpus_quality_gate.1",
    generatedAt: new Date().toISOString(),
    input: {
      manifestPath: args.manifestPath,
      outDir: args.outDir,
    },
    status,
    summary: summarize(manifest),
    findings,
    queues: {},
  };

  await mkdir(args.outDir, { recursive: true });
  await mkdir(path.join(args.outDir, "queues"), { recursive: true });
  for (const [queueName, urls] of Object.entries(queues)) {
    const queuePath = path.join(args.outDir, "queues", `${queueName}.urls.txt`);
    await writeFile(queuePath, urls.length > 0 ? `${urls.join("\n")}\n` : "");
    report.queues[queueName] = {
      count: urls.length,
      path: queuePath,
    };
  }
  await writeFile(path.join(args.outDir, "GoldCorpusQualityGate.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(args.outDir, "GoldCorpusQualityGate.md"), renderMarkdown(report));
  console.log(JSON.stringify({
    outDir: args.outDir,
    status: report.status,
    summary: report.summary,
    queueCounts: Object.fromEntries(Object.entries(report.queues).map(([key, value]) => [key, value.count])),
  }, null, 2));
}

function buildFindings(manifest: CurrentGoldCorpusManifest): GateFinding[] {
  const findings: GateFinding[] = [];
  const needsAttention = manifest.targets.filter((target) => target.qualityStatus === "needs_attention");
  const plannedOnly = manifest.targets.filter((target) => target.qualityStatus === "planned_only");
  const missingArtifacts = manifest.targets.filter((target) =>
    target.qualityStatus !== "planned_only" &&
    target.acceptedArtifacts.length === 0
  );
  const missingConsentExecution = manifest.targets.filter((target) =>
    target.targetType === "live_site" &&
    target.sourceSets.includes("consent_dag_expansion_50") &&
    !target.acceptedArtifacts.some((artifact) => artifact.artifactPaths?.consentScenarioExecution)
  );
  const privacyOptOutWeak = manifest.targets.filter((target) =>
    target.targetType === "live_site" &&
    target.laneTags.includes("privacy_opt_out_flow") &&
    target.qualityStatus !== "planned_only" &&
    !target.acceptedArtifacts.some((artifact) =>
      Object.values(artifact.artifactPaths ?? {}).some((artifactPath) => /consent_scenario_execution\.json$/.test(artifactPath)) &&
      !(artifact.statusReasons ?? []).some((reason) => /privacy_opt_out_flow:|do_not_sell|opt.?out.*failed|budget_exhausted|deadline|Target page/i.test(reason))
    )
  );
  const cmpWeak = manifest.targets.filter((target) =>
    target.targetType === "live_site" &&
    (target.laneTags.includes("reject_all_flow") || target.laneTags.includes("accept_all_flow")) &&
    target.qualityStatus !== "planned_only" &&
    target.acceptedArtifacts.some((artifact) =>
      (artifact.statusReasons ?? []).some((reason) => /reject_all_flow:|accept_all_flow:|consentFlowRuntimeScanner:failed|budget_exhausted|deadline|Target page/i.test(reason))
    )
  );
  const unstableHoldout = manifest.targets.filter((target) =>
    target.split === "test" && ["needs_attention", "planned_only"].includes(target.qualityStatus)
  );

  if (needsAttention.length > 0) {
    findings.push(finding("fail", "needs_attention_targets", `${needsAttention.length} targets need attention.`, needsAttention));
  }
  if (plannedOnly.length > 0) {
    findings.push(finding("fail", "planned_only_targets", `${plannedOnly.length} targets are planned only.`, plannedOnly));
  }
  if (missingArtifacts.length > 0) {
    findings.push(finding("fail", "missing_accepted_artifacts", `${missingArtifacts.length} accepted targets have no artifact refs.`, missingArtifacts));
  }
  if (missingConsentExecution.length > 0) {
    findings.push(finding("fail", "missing_consent_scenario_execution", `${missingConsentExecution.length} consent DAG targets lack execution artifacts.`, missingConsentExecution));
  }
  if (privacyOptOutWeak.length > 0) {
    findings.push(finding("warn", "privacy_opt_out_needs_proof_review", `${privacyOptOutWeak.length} privacy opt-out targets need action-proof review.`, privacyOptOutWeak));
  }
  if (cmpWeak.length > 0) {
    findings.push(finding("warn", "cmp_accept_reject_needs_review", `${cmpWeak.length} CMP accept/reject targets need action-proof or deadline review.`, cmpWeak));
  }
  if (unstableHoldout.length > 0) {
    findings.push(finding("fail", "unstable_holdout_targets", `${unstableHoldout.length} holdout targets are unstable or planned-only.`, unstableHoldout));
  }

  return findings;
}

function buildQueues(manifest: CurrentGoldCorpusManifest): Record<string, string[]> {
  const liveTargets = manifest.targets.filter((target) => target.targetType === "live_site" && target.canonicalUrl);
  const needsAttention = liveTargets.filter((target) => target.qualityStatus === "needs_attention");
  const plannedOnly = liveTargets.filter((target) => target.qualityStatus === "planned_only");
  const privacyOptOut = liveTargets.filter((target) =>
    target.laneTags.includes("privacy_opt_out_flow") &&
    (target.qualityStatus === "needs_attention" || target.acceptedArtifacts.some((artifact) =>
      (artifact.statusReasons ?? []).some((reason) => /privacy_opt_out_flow|do_not_sell|opt.?out|budget_exhausted|deadline/i.test(reason))
    ))
  );
  const cmpHeavy = liveTargets.filter((target) =>
    target.laneTags.includes("reject_all_flow") ||
    target.laneTags.includes("accept_all_flow") ||
    /media|news|cmp/i.test(`${target.domain ?? ""} ${target.laneTags.join(" ")}`)
  );
  const consentRerun = needsAttention.filter((target) =>
    target.acceptedArtifacts.some((artifact) => (artifact.statusReasons ?? []).some((reason) => /consentFlow|preConsent|Target page|deadline|budget/i.test(reason)))
  );
  const policyRerun = needsAttention.filter((target) =>
    target.acceptedArtifacts.some((artifact) => (artifact.statusReasons ?? []).some((reason) => /policySurface|policy/i.test(reason)))
  );
  const fullRerun = needsAttention.filter((target) =>
    target.acceptedArtifacts.some((artifact) => artifact.profile === "full" && (artifact.statusReasons ?? []).length > 0)
  );
  const trainingEligible = liveTargets.filter((target) => target.eligibility?.trainingEligible);
  const validationEligible = liveTargets.filter((target) => target.eligibility?.validationEligible);
  const holdoutEligible = liveTargets.filter((target) => target.eligibility?.holdoutEligible);

  return {
    "needs-attention": urls(needsAttention),
    "planned-only": urls(plannedOnly),
    "consent-dag-rerun": urls(consentRerun),
    "policy-rerun": urls(policyRerun),
    "full-profile-rerun": urls(fullRerun),
    "privacy-opt-out-proof-review": urls(privacyOptOut),
    "cmp-heavy-review": urls(cmpHeavy),
    "training-eligible": urls(trainingEligible),
    "validation-eligible": urls(validationEligible),
    "holdout-eligible": urls(holdoutEligible),
  };
}

function summarize(manifest: CurrentGoldCorpusManifest): QualityGateReport["summary"] {
  return {
    targets: manifest.targets.length,
    liveTargets: manifest.targets.filter((target) => target.targetType === "live_site").length,
    syntheticFixtures: manifest.targets.filter((target) => target.targetType === "synthetic_fixture").length,
    accepted: manifest.targets.filter((target) => target.qualityStatus === "accepted").length,
    acceptedWithLimitations: manifest.targets.filter((target) => target.qualityStatus === "accepted_with_limitations").length,
    needsAttention: manifest.targets.filter((target) => target.qualityStatus === "needs_attention").length,
    plannedOnly: manifest.targets.filter((target) => target.qualityStatus === "planned_only").length,
    trainingEligible: manifest.targets.filter((target) => target.eligibility?.trainingEligible).length,
    validationEligible: manifest.targets.filter((target) => target.eligibility?.validationEligible).length,
    holdoutEligible: manifest.targets.filter((target) => target.eligibility?.holdoutEligible).length,
    regressionOnly: manifest.targets.filter((target) => target.eligibility?.regressionOnly).length,
    candidateBacklog: manifest.targets.filter((target) => target.eligibility?.candidateBacklog).length,
  };
}

function finding(
  severity: GateFinding["severity"],
  code: string,
  message: string,
  targets: CorpusTarget[],
): GateFinding {
  return {
    severity,
    code,
    message,
    targetIds: targets.map((target) => target.targetId).sort(),
  };
}

function urls(targets: CorpusTarget[]): string[] {
  return [...new Set(targets.map((target) => target.canonicalUrl).filter((url): url is string => Boolean(url)))].sort();
}

function renderMarkdown(report: QualityGateReport): string {
  const lines = [
    "# V2 Current Gold Corpus Quality Gate",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Status: ${report.status}`,
    "",
    "## Summary",
    "",
    `- Targets: ${report.summary.targets}`,
    `- Live targets: ${report.summary.liveTargets}`,
    `- Synthetic fixtures: ${report.summary.syntheticFixtures}`,
    `- Accepted: ${report.summary.accepted}`,
    `- Accepted with limitations: ${report.summary.acceptedWithLimitations}`,
    `- Needs attention: ${report.summary.needsAttention}`,
    `- Planned only: ${report.summary.plannedOnly}`,
    `- Training eligible: ${report.summary.trainingEligible}`,
    `- Validation eligible: ${report.summary.validationEligible}`,
    `- Holdout eligible: ${report.summary.holdoutEligible}`,
    "",
    "## Findings",
    "",
  ];
  if (report.findings.length === 0) {
    lines.push("- No findings.");
  } else {
    for (const finding of report.findings) {
      lines.push(`- ${finding.severity.toUpperCase()} ${finding.code}: ${finding.message}`);
    }
  }
  lines.push("", "## Queues", "");
  for (const [name, queue] of Object.entries(report.queues)) {
    lines.push(`- ${name}: ${queue.count} (${queue.path})`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    help: false,
    manifestPath: DEFAULT_MANIFEST_PATH,
    outDir: DEFAULT_OUT_DIR,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--manifest" && next) {
      args.manifestPath = next;
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
    "Usage: pnpm v2:gold-corpus-quality-gate -- [options]",
    "",
    "Verifies the unified v2 current gold corpus manifest and emits rerun/training queues.",
    "Artifact-only. Does not change production behavior.",
    "",
    "Options:",
    "  --manifest <path>",
    "  --out-dir <path>",
  ].join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
