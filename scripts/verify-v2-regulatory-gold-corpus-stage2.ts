import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

type Args = {
  format: "text" | "json";
  help: boolean;
  minCandidateExamplesPerCoreLane: number;
  stage2Dir: string;
};

type GateBaseline = {
  summary?: {
    overallStatus?: string;
  };
  checks?: Array<{
    actual?: unknown;
    expected?: unknown;
    name?: string;
    status?: string;
  }>;
};

type PromotedGoldExamples = {
  examples?: Array<{
    artifactPaths?: Record<string, string>;
    domain?: string;
    lane?: string;
    profile?: string;
    promotionStatus?: string;
    url?: string;
  }>;
};

type SyntheticFixturePlan = {
  summary?: {
    p1?: number;
    p2?: number;
    p3?: number;
    tasks?: number;
  };
  tasks?: Array<{
    lane?: string;
    priority?: string;
    sourceNearMisses?: Array<{
      artifactPaths?: Record<string, string>;
      domain?: string;
      profile?: string;
      url?: string;
    }>;
  }>;
};

type VerificationCheck = {
  actual?: unknown;
  details: string[];
  expected?: unknown;
  name: string;
  severity: "fail" | "warn";
  status: "pass" | "fail" | "warn";
};

type VerificationReport = {
  checkedAt: string;
  input: {
    minCandidateExamplesPerCoreLane: number;
    stage2Dir: string;
  };
  summary: {
    checks: number;
    fail: number;
    overallStatus: "pass" | "fail";
    pass: number;
    warn: number;
  };
  verificationVersion: "wc01.v2_regulatory_gold_corpus_stage2.verification.1";
  checks: VerificationCheck[];
};

const DEFAULT_STAGE2_DIR = path.join("artifacts", "gold-corpus", "v2-20260613-stage2");
const DEFAULT_MIN_CANDIDATE_EXAMPLES = 3;

const CORE_LANES = [
  "gdpr_eprivacy_consent_surface_observed",
  "reject_decline_option_availability",
  "post_choice_consent_controls",
  "tracking_after_refusal",
  "cookie_notice_availability",
  "cross_border_endpoint_review",
  "session_replay_fingerprinting_review",
  "ccpa_cpra_do_not_sell_or_share_availability",
  "notice_at_collection",
  "gpc_opt_out_signal_handling",
  "post_opt_out_tracking_behavior",
  "targeted_advertising_signals",
  "weak_or_no_consent_surface",
];

void main();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const gate = await readRequiredJson<GateBaseline>(args.stage2Dir, "regression-gate-baseline.json");
  const promoted = await readRequiredJson<PromotedGoldExamples>(args.stage2Dir, "promoted-gold-examples.json");
  const fixturePlan = await readRequiredJson<SyntheticFixturePlan>(args.stage2Dir, "synthetic-fixture-plan.json");
  const report = buildReport(args, gate, promoted, fixturePlan);

  if (args.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderText(report));
  }

  if (report.summary.overallStatus !== "pass") {
    process.exitCode = 1;
  }
}

function buildReport(
  args: Args,
  gate: GateBaseline,
  promoted: PromotedGoldExamples,
  fixturePlan: SyntheticFixturePlan,
): VerificationReport {
  const candidateExamples = (promoted.examples ?? []).filter((example) => example.promotionStatus === "candidate");
  const laneCounts = Object.fromEntries(
    CORE_LANES.map((lane) => [
      lane,
      candidateExamples.filter((example) => example.lane === lane).length,
    ]),
  ) as Record<string, number>;
  const underFloor = Object.entries(laneCounts)
    .filter(([, count]) => count < args.minCandidateExamplesPerCoreLane)
    .map(([lane, count]) => `${lane}:${count}`);
  const p1p2Tasks = (fixturePlan.tasks ?? [])
    .filter((task) => task.priority === "P1" || task.priority === "P2")
    .map((task) => `${task.priority}:${task.lane ?? "unknown_lane"}`);
  const missingPaths = [
    ...missingPromotedArtifactPaths(promoted),
    ...missingFixtureArtifactPaths(fixturePlan),
  ];

  const checks: VerificationCheck[] = [
    passFailCheck({
      actual: gate.summary?.overallStatus ?? "missing",
      details: (gate.checks ?? [])
        .filter((check) => check.status !== "pass")
        .map((check) => `${check.name ?? "unknown"}:${check.status ?? "unknown"} actual=${String(check.actual)} expected=${String(check.expected)}`),
      expected: "pass",
      name: "regression_gate_status",
      passed: gate.summary?.overallStatus === "pass",
    }),
    passFailCheck({
      actual: Math.min(...Object.values(laneCounts)),
      details: underFloor,
      expected: `>= ${args.minCandidateExamplesPerCoreLane}`,
      name: "core_lane_candidate_example_floor",
      passed: underFloor.length === 0,
    }),
    passFailCheck({
      actual: p1p2Tasks.length,
      details: p1p2Tasks,
      expected: 0,
      name: "no_p1_or_p2_fixture_tasks",
      passed: p1p2Tasks.length === 0,
    }),
    passFailCheck({
      actual: missingPaths.length,
      details: missingPaths,
      expected: 0,
      name: "artifact_paths_exist",
      passed: missingPaths.length === 0,
    }),
  ];
  const fail = checks.filter((check) => check.status === "fail").length;
  const warn = checks.filter((check) => check.status === "warn").length;
  return {
    checkedAt: new Date().toISOString(),
    input: {
      minCandidateExamplesPerCoreLane: args.minCandidateExamplesPerCoreLane,
      stage2Dir: args.stage2Dir,
    },
    summary: {
      checks: checks.length,
      fail,
      overallStatus: fail === 0 ? "pass" : "fail",
      pass: checks.filter((check) => check.status === "pass").length,
      warn,
    },
    verificationVersion: "wc01.v2_regulatory_gold_corpus_stage2.verification.1",
    checks,
  };
}

function missingPromotedArtifactPaths(promoted: PromotedGoldExamples) {
  const misses: string[] = [];
  for (const example of promoted.examples ?? []) {
    const label = `${example.domain ?? "unknown"}:${example.profile ?? "unknown"}:${example.lane ?? "unknown_lane"}`;
    const paths = example.artifactPaths ?? {};
    if (example.promotionStatus === "candidate") {
      if (!paths.canonicalEvidenceBundle) {
        misses.push(`${label}:missing canonicalEvidenceBundle path`);
      }
      if (!paths.reviewResult) {
        misses.push(`${label}:missing reviewResult path`);
      }
    }
    for (const [artifactType, artifactPath] of Object.entries(paths)) {
      if (!existsSync(artifactPath)) {
        misses.push(`${label}:${artifactType}:${artifactPath}`);
      }
    }
  }
  return misses;
}

function missingFixtureArtifactPaths(fixturePlan: SyntheticFixturePlan) {
  const misses: string[] = [];
  for (const task of fixturePlan.tasks ?? []) {
    for (const nearMiss of task.sourceNearMisses ?? []) {
      const label = `${task.lane ?? "unknown_lane"}:${nearMiss.domain ?? "unknown"}:${nearMiss.profile ?? "unknown"}`;
      for (const [artifactType, artifactPath] of Object.entries(nearMiss.artifactPaths ?? {})) {
        if (!existsSync(artifactPath)) {
          misses.push(`${label}:${artifactType}:${artifactPath}`);
        }
      }
    }
  }
  return misses;
}

function passFailCheck(input: {
  actual: unknown;
  details: string[];
  expected: unknown;
  name: string;
  passed: boolean;
}): VerificationCheck {
  return {
    actual: input.actual,
    details: input.details,
    expected: input.expected,
    name: input.name,
    severity: "fail",
    status: input.passed ? "pass" : "fail",
  };
}

function renderText(report: VerificationReport) {
  const lines = [
    `WC01 v2 Regulatory Gold Corpus Stage 2 verification: ${report.summary.overallStatus}`,
    `Stage 2 dir: ${report.input.stage2Dir}`,
    `Checks: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail`,
    "",
  ];
  for (const check of report.checks) {
    lines.push(`- ${check.status} ${check.name}: actual=${String(check.actual)} expected=${String(check.expected)}`);
    for (const detail of check.details.slice(0, 12)) {
      lines.push(`  - ${detail}`);
    }
    if (check.details.length > 12) {
      lines.push(`  - ... ${check.details.length - 12} more`);
    }
  }
  return lines.join("\n");
}

async function readRequiredJson<T>(dir: string, fileName: string): Promise<T> {
  const filePath = path.join(dir, fileName);
  if (!existsSync(filePath)) {
    throw new Error(`Missing required Stage 2 input: ${filePath}`);
  }
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    format: "text",
    help: false,
    minCandidateExamplesPerCoreLane: DEFAULT_MIN_CANDIDATE_EXAMPLES,
    stage2Dir: DEFAULT_STAGE2_DIR,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--stage2-dir") {
      args.stage2Dir = requiredValue(argv, ++index, arg);
    } else if (arg === "--min-candidate-examples-per-core-lane") {
      args.minCandidateExamplesPerCoreLane = parsePositiveInteger(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--format") {
      const format = requiredValue(argv, ++index, arg);
      if (format !== "text" && format !== "json") {
        throw new Error(`Unsupported --format: ${format}`);
      }
      args.format = format;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }
  return args;
}

function parsePositiveInteger(value: string, flag: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected ${flag} to be a positive integer.`);
  }
  return parsed;
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function usage() {
  return [
    "Usage:",
    "  node --import tsx scripts/verify-v2-regulatory-gold-corpus-stage2.ts [--stage2-dir <dir>] [--format text|json]",
    "",
    "Verifies artifact-only Stage 2 v2 Regulatory Diagnostics gold corpus outputs.",
    "Checks gate status, core lane candidate floors, P1/P2 fixture tasks, and artifact path existence.",
  ].join("\n");
}
