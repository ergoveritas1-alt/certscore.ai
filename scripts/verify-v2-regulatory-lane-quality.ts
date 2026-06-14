import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Args = {
  baselinePath?: string;
  format: "text" | "json";
  help: boolean;
  summaryOut: string;
  stage2Dir: string;
  stage3Dir: string;
  writeSummary: boolean;
};

type CountEntry = {
  count?: number;
  value?: string;
};

type CoverageAreaReview = {
  areas?: Array<{
    metrics?: {
      coverageGapRows?: number;
      lowConfidenceRows?: number;
      medianDebugConfidence?: number;
      totalRows?: number;
    };
    rowId?: string;
    status?: string;
  }>;
  summary?: {
    statuses?: CountEntry[];
  };
};

type CalibrationReport = {
  examples?: Array<{
    lane?: string;
    lanes?: string[];
  }>;
  regulatoryDebugConfidence?: {
    gate?: {
      status?: string;
    };
  };
};

type ReviewerQueue = {
  items?: Array<{
    missingSignalTags?: string[];
    reviewType?: string;
  }>;
  summary?: {
    actionableNearMissTags?: number;
    nearMissReviewItems?: number;
  };
};

type SyntheticFixtureIndex = {
  entries?: Array<{
    calibrationRole?: "positive" | "control";
    fixtureId?: string;
    lane?: string;
    status?: string;
  }>;
  summary?: {
    failed?: number;
  };
};

type VerificationCheck = {
  actual?: unknown;
  details: string[];
  expected?: unknown;
  name: string;
  status: "pass" | "fail";
};

type VerificationReport = {
  checkedAt: string;
  input: {
    stage2Dir: string;
    stage3Dir: string;
  };
  summary: {
    checks: number;
    fail: number;
    overallStatus: "pass" | "fail";
    pass: number;
  };
  verificationVersion: "wc01.v2_regulatory_lane_quality.1";
  checks: VerificationCheck[];
  baselineComparison?: BaselineComparison;
};

type LaneQualitySummary = {
  generatedAt: string;
  guardrails: string[];
  lanes: LaneQualitySummaryRow[];
  summary: {
    actionableNearMissTags: number;
    controlFixtures: number;
    coverageAreas: number;
    fixtureFailures: number;
    positiveFixtures: number;
    readyCoverageAreas: number;
  };
  summaryVersion: "wc01.v2_regulatory_lane_quality_summary.1";
};

type LaneQualitySummaryRow = {
  actionableNearMissTags: number;
  controlFixtures: number;
  coverageGapRows: number;
  lowConfidenceRows: number;
  medianDebugConfidence: number;
  positiveFixtures: number;
  readinessRows: number;
  rowId: string;
  status: string;
};

type BaselineComparison = {
  baselinePath: string;
  deltas: Array<{
    after: number | string;
    before: number | string;
    metric: string;
    rowId: string;
  }>;
  status: "pass" | "fail";
};

const DEFAULT_STAGE2_DIR = path.join("artifacts", "gold-corpus", "v2-20260613-stage2");
const DEFAULT_STAGE3_DIR = path.join("artifacts", "gold-corpus", "v2-20260613-stage3-fixtures");

const COVERAGE_ROW_TO_FIXTURE_LANE: Record<string, string> = {
  cookie_notice_availability: "cookie_notice_availability",
  do_not_sell_share_availability: "ccpa_cpra_do_not_sell_or_share_availability",
  gpc_opt_out_signal_handling: "gpc_opt_out_signal_handling",
  notice_at_collection: "notice_at_collection",
  policy_runtime_vendor_alignment_review: "policy_runtime_vendor_alignment_review",
  post_opt_out_tracking_behavior: "post_opt_out_tracking_behavior",
  post_reject_tracking_reduction: "tracking_after_refusal",
  reject_all_path_availability: "reject_decline_option_availability",
  targeted_advertising_signals: "targeted_advertising_signals",
};

const MIN_POSITIVE_FIXTURES_BY_LANE: Record<string, number> = {
  ccpa_cpra_do_not_sell_or_share_availability: 1,
  cookie_notice_availability: 1,
  gpc_opt_out_signal_handling: 2,
  notice_at_collection: 1,
  policy_runtime_vendor_alignment_review: 2,
  post_opt_out_tracking_behavior: 2,
  reject_decline_option_availability: 1,
  targeted_advertising_signals: 1,
  tracking_after_refusal: 2,
};

const MIN_CONTROL_FIXTURES_BY_LANE: Record<string, number> = {
  ccpa_cpra_do_not_sell_or_share_availability: 1,
  cookie_notice_availability: 1,
  gpc_opt_out_signal_handling: 2,
  module_failure_guardrail: 2,
  notice_at_collection: 1,
  policy_runtime_vendor_alignment_review: 2,
  post_opt_out_tracking_behavior: 1,
  reject_decline_option_availability: 1,
  targeted_advertising_signals: 1,
  tracking_after_refusal: 1,
};

void main();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const coverage = await readRequiredJson<CoverageAreaReview>(
    path.join(args.stage2Dir, "calibration"),
    "regulatory-coverage-area-improvement-review.json",
  );
  const calibration = await readRequiredJson<CalibrationReport>(
    path.join(args.stage2Dir, "calibration"),
    "regulatory-confidence-calibration.json",
  );
  const queue = await readRequiredJson<ReviewerQueue>(args.stage2Dir, "reviewer-queue.json");
  const fixtures = await readRequiredJson<SyntheticFixtureIndex>(args.stage3Dir, "synthetic-fixture-index.json");
  const laneSummary = buildLaneQualitySummary(coverage, calibration, queue, fixtures);
  const baseline = args.baselinePath
    ? await readRequiredJson<LaneQualitySummary>(path.dirname(args.baselinePath), path.basename(args.baselinePath))
    : undefined;
  const baselineComparison = baseline ? compareLaneQualityBaseline(args.baselinePath, baseline, laneSummary) : undefined;
  const report = buildReport(args, coverage, calibration, queue, fixtures, baselineComparison);

  if (args.writeSummary) {
    await writeLaneQualitySummary(args.summaryOut, laneSummary);
  }

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
  coverage: CoverageAreaReview,
  calibration: CalibrationReport,
  queue: ReviewerQueue,
  fixtures: SyntheticFixtureIndex,
  baselineComparison: BaselineComparison | undefined,
): VerificationReport {
  const areas = coverage.areas ?? [];
  const positiveFixtureCounts = fixtureCounts(fixtures, "positive");
  const controlFixtureCounts = fixtureCounts(fixtures, "control");
  const promotedLaneCounts = promotedCalibrationLaneCounts(calibration);
  const actionableTags = actionableNearMissTagCount(queue);
  const failedFixtures = (fixtures.entries ?? [])
    .filter((entry) => entry.status !== "pass")
    .map((entry) => `${entry.fixtureId ?? "unknown_fixture"}:${entry.status ?? "missing_status"}`);

  const checks: VerificationCheck[] = [
    passFailCheck({
      actual: coverage.summary?.statuses?.map((entry) => `${entry.value}:${entry.count}`).join(", ") ?? "missing",
      details: areas
        .filter((area) => area.status !== "ready_for_monitoring")
        .map((area) => `${area.rowId ?? "unknown_row"}:${area.status ?? "missing_status"}`),
      expected: "all coverage areas ready_for_monitoring",
      name: "coverage_areas_ready_for_monitoring",
      passed: areas.length > 0 && areas.every((area) => area.status === "ready_for_monitoring"),
    }),
    passFailCheck({
      actual: areas.reduce((sum, area) => sum + (area.metrics?.lowConfidenceRows ?? 0), 0),
      details: areas
        .filter((area) => (area.metrics?.lowConfidenceRows ?? 0) > 0)
        .map((area) => `${area.rowId ?? "unknown_row"}:${area.metrics?.lowConfidenceRows ?? 0}`),
      expected: 0,
      name: "no_low_confidence_lane_rows",
      passed: areas.every((area) => (area.metrics?.lowConfidenceRows ?? 0) === 0),
    }),
    passFailCheck({
      actual: areas.reduce((sum, area) => sum + (area.metrics?.coverageGapRows ?? 0), 0),
      details: areas
        .filter((area) => (area.metrics?.coverageGapRows ?? 0) > 0)
        .map((area) => `${area.rowId ?? "unknown_row"}:${area.metrics?.coverageGapRows ?? 0}`),
      expected: 0,
      name: "no_coverage_gap_lane_rows",
      passed: areas.every((area) => (area.metrics?.coverageGapRows ?? 0) === 0),
    }),
    passFailCheck({
      actual: actionableTags,
      details: actionableNearMissDetails(queue),
      expected: 0,
      name: "no_actionable_near_miss_tags",
      passed: actionableTags === 0,
    }),
    passFailCheck({
      actual: calibration.regulatoryDebugConfidence?.gate?.status ?? "missing",
      details: [],
      expected: "pass",
      name: "debug_confidence_gate_passes",
      passed: calibration.regulatoryDebugConfidence?.gate?.status === "pass",
    }),
    passFailCheck({
      actual: fixtures.summary?.failed ?? failedFixtures.length,
      details: failedFixtures,
      expected: 0,
      name: "all_synthetic_fixtures_pass",
      passed: failedFixtures.length === 0 && (fixtures.summary?.failed ?? 0) === 0,
    }),
    passFailCheck({
      actual: countSummary(positiveFixtureCounts),
      details: underMinimumDetails(positiveFixtureCounts, MIN_POSITIVE_FIXTURES_BY_LANE),
      expected: minimumSummary(MIN_POSITIVE_FIXTURES_BY_LANE),
      name: "positive_fixture_floor",
      passed: underMinimumDetails(positiveFixtureCounts, MIN_POSITIVE_FIXTURES_BY_LANE).length === 0,
    }),
    passFailCheck({
      actual: countSummary(controlFixtureCounts),
      details: underMinimumDetails(controlFixtureCounts, MIN_CONTROL_FIXTURES_BY_LANE),
      expected: minimumSummary(MIN_CONTROL_FIXTURES_BY_LANE),
      name: "control_fixture_floor",
      passed: underMinimumDetails(controlFixtureCounts, MIN_CONTROL_FIXTURES_BY_LANE).length === 0,
    }),
    passFailCheck({
      actual: readinessRowCountSummary(areas),
      details: readinessRowCountDetails(areas, promotedLaneCounts, positiveFixtureCounts),
      expected: "coverage totalRows <= promoted lane rows + positive fixtures, excluding controls",
      name: "control_fixtures_excluded_from_readiness_rows",
      passed: readinessRowCountDetails(areas, promotedLaneCounts, positiveFixtureCounts).length === 0,
    }),
    ...(baselineComparison
      ? [passFailCheck({
        actual: baselineComparison.status,
        details: baselineComparison.deltas.map((delta) =>
          `${delta.rowId}:${delta.metric}:${String(delta.before)}->${String(delta.after)}`
        ),
        expected: "pass",
        name: "lane_quality_baseline_comparison",
        passed: baselineComparison.status === "pass",
      })]
      : []),
  ];

  const fail = checks.filter((check) => check.status === "fail").length;
  return {
    checkedAt: new Date().toISOString(),
    input: {
      stage2Dir: args.stage2Dir,
      stage3Dir: args.stage3Dir,
    },
    summary: {
      checks: checks.length,
      fail,
      overallStatus: fail === 0 ? "pass" : "fail",
      pass: checks.filter((check) => check.status === "pass").length,
    },
    verificationVersion: "wc01.v2_regulatory_lane_quality.1",
    ...(baselineComparison ? { baselineComparison } : {}),
    checks,
  };
}

function fixtureCounts(fixtures: SyntheticFixtureIndex, role: "positive" | "control") {
  const counts: Record<string, number> = {};
  for (const entry of fixtures.entries ?? []) {
    if (entry.status !== "pass") {
      continue;
    }
    const calibrationRole = entry.calibrationRole ?? "positive";
    if (calibrationRole !== role) {
      continue;
    }
    const lane = entry.lane ?? "unknown_lane";
    counts[lane] = (counts[lane] ?? 0) + 1;
  }
  return counts;
}

function promotedCalibrationLaneCounts(calibration: CalibrationReport) {
  const counts: Record<string, number> = {};
  for (const example of calibration.examples ?? []) {
    for (const lane of example.lanes ?? [example.lane ?? "unknown_lane"]) {
      counts[lane] = (counts[lane] ?? 0) + 1;
    }
  }
  return counts;
}

function buildLaneQualitySummary(
  coverage: CoverageAreaReview,
  calibration: CalibrationReport,
  queue: ReviewerQueue,
  fixtures: SyntheticFixtureIndex,
): LaneQualitySummary {
  const positiveFixtureCounts = fixtureCounts(fixtures, "positive");
  const controlFixtureCounts = fixtureCounts(fixtures, "control");
  const actionableTagCounts = actionableNearMissTagCounts(queue);
  const lanes = (coverage.areas ?? [])
    .map((area): LaneQualitySummaryRow => {
      const rowId = area.rowId ?? "unknown_row";
      const fixtureLane = COVERAGE_ROW_TO_FIXTURE_LANE[rowId] ?? rowId;
      return {
        actionableNearMissTags: actionableTagCounts[fixtureLane] ?? 0,
        controlFixtures: controlFixtureCounts[fixtureLane] ?? 0,
        coverageGapRows: area.metrics?.coverageGapRows ?? 0,
        lowConfidenceRows: area.metrics?.lowConfidenceRows ?? 0,
        medianDebugConfidence: area.metrics?.medianDebugConfidence ?? 0,
        positiveFixtures: positiveFixtureCounts[fixtureLane] ?? 0,
        readinessRows: area.metrics?.totalRows ?? 0,
        rowId,
        status: area.status ?? "unknown",
      };
    })
    .sort((left, right) => left.rowId.localeCompare(right.rowId));
  return {
    generatedAt: new Date().toISOString(),
    guardrails: [
      "Internal diagnostic artifact only.",
      "Does not create, persist, or promote WC01 production findings.",
      "Does not change production report behavior or scoring.",
      "Summaries omit raw cookies, request bodies, query values, and unbounded policy text.",
    ],
    lanes,
    summary: {
      actionableNearMissTags: actionableNearMissTagCount(queue),
      controlFixtures: Object.values(controlFixtureCounts).reduce((sum, count) => sum + count, 0),
      coverageAreas: lanes.length,
      fixtureFailures: fixtures.summary?.failed ?? (fixtures.entries ?? []).filter((entry) => entry.status !== "pass").length,
      positiveFixtures: Object.values(positiveFixtureCounts).reduce((sum, count) => sum + count, 0),
      readyCoverageAreas: lanes.filter((lane) => lane.status === "ready_for_monitoring").length,
    },
    summaryVersion: "wc01.v2_regulatory_lane_quality_summary.1",
  };
}

function compareLaneQualityBaseline(
  baselinePath: string,
  baseline: LaneQualitySummary,
  current: LaneQualitySummary,
): BaselineComparison {
  const baselineByRow = new Map(baseline.lanes.map((lane) => [lane.rowId, lane]));
  const deltas: BaselineComparison["deltas"] = [];
  for (const currentLane of current.lanes) {
    const previousLane = baselineByRow.get(currentLane.rowId);
    if (!previousLane) {
      continue;
    }
    if (previousLane.status === "ready_for_monitoring" && currentLane.status !== "ready_for_monitoring") {
      deltas.push(delta(currentLane.rowId, "status", previousLane.status, currentLane.status));
    }
    if (currentLane.medianDebugConfidence < previousLane.medianDebugConfidence) {
      deltas.push(delta(currentLane.rowId, "medianDebugConfidence", previousLane.medianDebugConfidence, currentLane.medianDebugConfidence));
    }
    if (currentLane.lowConfidenceRows > previousLane.lowConfidenceRows) {
      deltas.push(delta(currentLane.rowId, "lowConfidenceRows", previousLane.lowConfidenceRows, currentLane.lowConfidenceRows));
    }
    if (currentLane.coverageGapRows > previousLane.coverageGapRows) {
      deltas.push(delta(currentLane.rowId, "coverageGapRows", previousLane.coverageGapRows, currentLane.coverageGapRows));
    }
    if (currentLane.actionableNearMissTags > previousLane.actionableNearMissTags) {
      deltas.push(delta(currentLane.rowId, "actionableNearMissTags", previousLane.actionableNearMissTags, currentLane.actionableNearMissTags));
    }
    if (currentLane.positiveFixtures < previousLane.positiveFixtures) {
      deltas.push(delta(currentLane.rowId, "positiveFixtures", previousLane.positiveFixtures, currentLane.positiveFixtures));
    }
    if (currentLane.controlFixtures < previousLane.controlFixtures) {
      deltas.push(delta(currentLane.rowId, "controlFixtures", previousLane.controlFixtures, currentLane.controlFixtures));
    }
  }
  return {
    baselinePath,
    deltas,
    status: deltas.length === 0 ? "pass" : "fail",
  };
}

function delta(
  rowId: string,
  metric: string,
  before: number | string,
  after: number | string,
): BaselineComparison["deltas"][number] {
  return { after, before, metric, rowId };
}

function actionableNearMissTagCount(queue: ReviewerQueue) {
  if (typeof queue.summary?.actionableNearMissTags === "number") {
    return queue.summary.actionableNearMissTags;
  }
  return actionableNearMissDetails(queue).length;
}

function actionableNearMissTagCounts(queue: ReviewerQueue) {
  const counts: Record<string, number> = {};
  for (const tag of actionableNearMissDetails(queue)) {
    counts[tag] = (counts[tag] ?? 0) + 1;
  }
  return counts;
}

function actionableNearMissDetails(queue: ReviewerQueue) {
  return (queue.items ?? [])
    .filter((item) => item.reviewType === "near_miss_review")
    .flatMap((item) => item.missingSignalTags ?? [])
    .sort();
}

function underMinimumDetails(counts: Record<string, number>, minimums: Record<string, number>) {
  return Object.entries(minimums)
    .filter(([lane, minimum]) => (counts[lane] ?? 0) < minimum)
    .map(([lane, minimum]) => `${lane}:${counts[lane] ?? 0}<${minimum}`);
}

function readinessRowCountDetails(
  areas: NonNullable<CoverageAreaReview["areas"]>,
  promotedLaneCounts: Record<string, number>,
  positiveFixtureCounts: Record<string, number>,
) {
  return areas.flatMap((area) => {
    const rowId = area.rowId ?? "unknown_row";
    const fixtureLane = COVERAGE_ROW_TO_FIXTURE_LANE[rowId];
    if (!fixtureLane) {
      return [`${rowId}:missing row-to-fixture-lane mapping`];
    }
    const actual = area.metrics?.totalRows ?? 0;
    const expected = (promotedLaneCounts[fixtureLane] ?? 0) + (positiveFixtureCounts[fixtureLane] ?? 0);
    return actual <= expected ? [] : [`${rowId}:actual=${actual}:expected_max=${expected}:lane=${fixtureLane}`];
  });
}

function readinessRowCountSummary(areas: NonNullable<CoverageAreaReview["areas"]>) {
  return areas
    .map((area) => `${area.rowId ?? "unknown_row"}:${area.metrics?.totalRows ?? 0}`)
    .join(", ");
}

function countSummary(counts: Record<string, number>) {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([lane, count]) => `${lane}:${count}`)
    .join(", ");
}

function minimumSummary(minimums: Record<string, number>) {
  return Object.entries(minimums)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([lane, count]) => `${lane}:>=${count}`)
    .join(", ");
}

function passFailCheck(input: {
  actual?: unknown;
  details: string[];
  expected?: unknown;
  name: string;
  passed: boolean;
}): VerificationCheck {
  return {
    actual: input.actual,
    details: input.details,
    expected: input.expected,
    name: input.name,
    status: input.passed ? "pass" : "fail",
  };
}

function renderText(report: VerificationReport) {
  const lines = [
    `WC01 v2 Regulatory lane quality verification: ${report.summary.overallStatus}`,
    `Stage 2 dir: ${report.input.stage2Dir}`,
    `Stage 3 dir: ${report.input.stage3Dir}`,
    `Checks: ${report.summary.pass} pass, ${report.summary.fail} fail`,
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

async function writeLaneQualitySummary(summaryOut: string, summary: LaneQualitySummary) {
  await mkdir(path.dirname(summaryOut), { recursive: true });
  await writeFile(summaryOut, `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(markdownSummaryPath(summaryOut), renderLaneQualitySummaryMarkdown(summary));
}

function markdownSummaryPath(summaryOut: string) {
  return summaryOut.endsWith(".json")
    ? `${summaryOut.slice(0, -".json".length)}.md`
    : `${summaryOut}.md`;
}

function renderLaneQualitySummaryMarkdown(summary: LaneQualitySummary) {
  return [
    "# WC01 v2 Regulatory Lane Quality Summary",
    "",
    "Internal diagnostic only. Artifact-only. Non-persistent. Not customer-facing report output.",
    "",
    "## Summary",
    "",
    `- Coverage areas: ${summary.summary.coverageAreas}`,
    `- Ready coverage areas: ${summary.summary.readyCoverageAreas}`,
    `- Actionable near-miss tags: ${summary.summary.actionableNearMissTags}`,
    `- Positive fixtures: ${summary.summary.positiveFixtures}`,
    `- Control fixtures: ${summary.summary.controlFixtures}`,
    `- Fixture failures: ${summary.summary.fixtureFailures}`,
    "",
    "## Lanes",
    "",
    "| Row | Status | Median | Low | Gaps | Rows | Positive fixtures | Control fixtures | Actionable near misses |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...summary.lanes.map((lane) => [
      `| ${lane.rowId}`,
      lane.status,
      lane.medianDebugConfidence,
      lane.lowConfidenceRows,
      lane.coverageGapRows,
      lane.readinessRows,
      lane.positiveFixtures,
      lane.controlFixtures,
      `${lane.actionableNearMissTags} |`,
    ].join(" | ")),
    "",
  ].join("\n");
}

async function readRequiredJson<T>(dir: string, fileName: string): Promise<T> {
  const filePath = path.join(dir, fileName);
  if (!existsSync(filePath)) {
    throw new Error(`Missing required lane-quality input: ${filePath}`);
  }
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    format: "text",
    help: false,
    summaryOut: path.join(DEFAULT_STAGE2_DIR, "calibration", "lane-quality-summary.json"),
    stage2Dir: DEFAULT_STAGE2_DIR,
    stage3Dir: DEFAULT_STAGE3_DIR,
    writeSummary: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--stage2-dir") {
      args.stage2Dir = requiredValue(argv, ++index, arg);
      if (!argv.includes("--summary-out")) {
        args.summaryOut = path.join(args.stage2Dir, "calibration", "lane-quality-summary.json");
      }
    } else if (arg === "--stage3-dir") {
      args.stage3Dir = requiredValue(argv, ++index, arg);
    } else if (arg === "--write-summary") {
      args.writeSummary = true;
    } else if (arg === "--summary-out") {
      args.summaryOut = requiredValue(argv, ++index, arg);
    } else if (arg === "--baseline") {
      args.baselinePath = requiredValue(argv, ++index, arg);
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
    "  node --import tsx scripts/verify-v2-regulatory-lane-quality.ts [--stage2-dir <dir>] [--stage3-dir <dir>] [--write-summary] [--summary-out <path>] [--baseline <path>] [--format text|json]",
    "",
    "Verifies artifact-only v2 Regulatory Diagnostics lane quality gates.",
    "Checks coverage-area readiness, debug confidence, actionable near-miss tags, fixture roles, and control-fixture exclusion from readiness rows.",
    "When --write-summary is set, writes lane-quality-summary.json and lane-quality-summary.md.",
    "When --baseline is set, fails on lane-quality regressions from the baseline summary.",
  ].join("\n");
}
