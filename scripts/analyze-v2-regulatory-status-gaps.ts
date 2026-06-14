import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { reviewEvidenceBundle } from "../packages/certscore-review-engine/src/index.js";

type Args = {
  format: "json" | "text";
  help: boolean;
  outDir: string;
  stage2Dir: string;
  stage3Dir: string;
  writeSummary: boolean;
};

type GoldExample = {
  artifactPaths?: {
    canonicalEvidenceBundle?: string;
    reviewResult?: string;
  };
  domain?: string;
  eligibleFindingKeys?: string[];
  lane?: string;
  observedSignalTags?: string[];
  profile?: string;
  promotionStatus?: string;
  targetId?: string;
  url?: string;
};

type PromotedGoldExamples = {
  examples?: GoldExample[];
};

type SyntheticFixtureIndex = {
  entries?: Array<{
    artifactPaths?: {
      canonicalEvidenceBundle?: string;
      reviewResult?: string;
    };
    calibrationRole?: "positive" | "control";
    expectedEligibleFindingKeys?: string[];
    fixtureId?: string;
    lane?: string;
    status?: string;
    title?: string;
  }>;
};

type RegulatoryStatus = "checked" | "gap_observed" | "not_observed" | "not_testable" | "review_signal";

type StatusCounts = Record<RegulatoryStatus, number> & {
  total: number;
};

type GapCounts = {
  notTestableEmptyMissing: number;
  notTestableModuleMissing: number;
  notTestableOtherMissing: number;
  unexpectedPositiveNotObserved: number;
  expectedControlNotObserved: number;
};

type Sample = {
  artifactPath: string;
  candidateMissingCorroborators: string[];
  domain: string;
  group: string;
  lane: string;
  missingOrIncompleteSourceSignals: string[];
  profile: string;
  rowId: string;
  sourceFindingKeys: string[];
  status: string;
  url: string;
};

type RowSummary = StatusCounts & GapCounts & {
  areaId: string;
  classification: GapClassification;
  expectedPositiveRows: number;
  rowId: string;
  topLanes: CountEntry[];
  topMissingSignals: CountEntry[];
  topProfiles: CountEntry[];
  sampleGaps: Sample[];
};

type GroupSummary = StatusCounts & GapCounts & {
  examples: number;
  failures: Array<{ artifactPath: string; error: string; group: string }>;
  group: string;
  rows: RowSummary[];
  topRows: RowSummary[];
};

type Report = {
  analysisVersion: "wc01.v2_regulatory_status_gap_analysis.1";
  generatedAt: string;
  guardrails: string[];
  inputs: {
    stage2Dir: string;
    stage3Dir: string;
  };
  groups: GroupSummary[];
  summary: StatusCounts & GapCounts & {
    examples: number;
    failures: number;
  };
};

type CountEntry = {
  count: number;
  value: string;
};

type GapClassification =
  | "expected_profile_or_module_scope"
  | "expected_clean_absence_or_control"
  | "missing_scanner_evidence_retention"
  | "overly_strict_review_engine_gate"
  | "corpus_target_profile_mismatch"
  | "mixed";

type ExampleInput = {
  artifactPath: string;
  calibrationRole?: "positive" | "control";
  domain: string;
  expectedFindingKeys: string[];
  group: string;
  lane: string;
  profile: string;
  url: string;
};

const DEFAULT_STAGE2_DIR = path.join("artifacts", "gold-corpus", "v2-20260613-stage2");
const DEFAULT_STAGE3_DIR = path.join("artifacts", "gold-corpus", "v2-20260613-stage3-fixtures");
const DEFAULT_OUT_DIR = path.join(DEFAULT_STAGE2_DIR, "calibration");

const STATUS_KEYS: RegulatoryStatus[] = [
  "checked",
  "gap_observed",
  "not_observed",
  "not_testable",
  "review_signal",
];

const LANE_TO_ROW_IDS: Record<string, string[]> = {
  ccpa_cpra_do_not_sell_or_share_availability: ["do_not_sell_share_availability"],
  cookie_notice_availability: ["cookie_notice_availability"],
  cross_border_endpoint_review: ["cross_border_endpoint_review"],
  gdpr_eprivacy_consent_surface_observed: ["consent_surface_observed"],
  gpc_opt_out_signal_handling: ["gpc_opt_out_signal_handling"],
  notice_at_collection: ["notice_at_collection"],
  post_choice_consent_controls: ["preference_withdrawal_control"],
  post_opt_out_tracking_behavior: ["post_opt_out_tracking_behavior"],
  reject_decline_option_availability: ["reject_all_path_availability"],
  session_replay_fingerprinting_review: ["session_replay_fingerprinting_review"],
  targeted_advertising_signals: ["targeted_advertising_signals"],
  tracking_after_refusal: ["post_reject_tracking_reduction"],
  weak_or_no_consent_surface: [],
};

const FINDING_KEY_TO_ROW_IDS: Record<string, string[]> = {
  accept_reject_runtime_delta_observed: ["accept_reject_parity"],
  consent_banner_observed_or_not_observed: ["consent_surface_observed"],
  cookie_policy_observed_or_not_observed: ["cookie_notice_availability"],
  do_not_sell_or_share_link_observed: ["do_not_sell_share_availability"],
  endpoint_transfer_review_signal: ["cross_border_endpoint_review"],
  gpc_disclosure_observed: ["gpc_opt_out_signal_handling"],
  gpc_runtime_probe_with_disclosure_observed: ["gpc_opt_out_signal_handling"],
  notice_at_collection_observed: ["notice_at_collection"],
  policy_runtime_vendor_alignment_review_signal: ["policy_runtime_vendor_alignment_review"],
  post_choice_consent_control_observed: ["preference_withdrawal_control"],
  post_opt_out_targeted_advertising_behavior_signal: ["post_opt_out_tracking_behavior"],
  pre_consent_tracking_detected: ["pre_consent_third_party_tracking"],
  reject_action_succeeded_or_not_testable: ["reject_all_path_availability"],
  reject_control_observed_or_not_observed: ["reject_all_path_availability"],
  session_replay_or_behavioral_analytics_observed: ["session_replay_fingerprinting_review"],
  targeted_advertising_runtime_signal: ["targeted_advertising_signals"],
  third_party_cookie_pre_consent: ["pre_consent_cookies_storage"],
  non_essential_storage_pre_consent: ["pre_consent_cookies_storage"],
  vendor_associated_cookie_pre_consent: ["pre_consent_cookies_storage"],
};

void main();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const promoted = await readJson<PromotedGoldExamples>(path.join(args.stage2Dir, "promoted-gold-examples.json"));
  const fixtures = await readJson<SyntheticFixtureIndex>(path.join(args.stage3Dir, "synthetic-fixture-index.json"));
  const stage2Examples = (promoted.examples ?? [])
    .map((example): ExampleInput | undefined => {
      const artifactPath = example.artifactPaths?.canonicalEvidenceBundle;
      if (!artifactPath) {
        return undefined;
      }
      return {
        artifactPath,
        domain: example.domain ?? "unknown-domain",
        expectedFindingKeys: example.eligibleFindingKeys ?? [],
        group: "stage2_gold_examples",
        lane: example.lane ?? "unknown_lane",
        profile: example.profile ?? "unknown_profile",
        url: example.url ?? "",
      };
    })
    .filter((example): example is ExampleInput => Boolean(example));
  const stage3Examples = (fixtures.entries ?? [])
    .map((entry): ExampleInput | undefined => {
      const artifactPath = entry.artifactPaths?.canonicalEvidenceBundle;
      if (!artifactPath) {
        return undefined;
      }
      return {
        artifactPath,
        calibrationRole: entry.calibrationRole,
        domain: entry.fixtureId ?? "synthetic-fixture",
        expectedFindingKeys: entry.expectedEligibleFindingKeys ?? [],
        group: "stage3_deterministic_fixtures",
        lane: entry.lane ?? "unknown_lane",
        profile: "fixture",
        url: entry.title ?? "",
      };
    })
    .filter((example): example is ExampleInput => Boolean(example));

  const groups = [
    await analyzeGroup("stage2_gold_examples", stage2Examples),
    await analyzeGroup("stage3_deterministic_fixtures", stage3Examples),
  ];
  const report = buildReport(args, groups);

  if (args.writeSummary) {
    await mkdir(args.outDir, { recursive: true });
    await writeJson(path.join(args.outDir, "regulatory-status-gap-analysis.json"), report);
    await writeFile(
      path.join(args.outDir, "regulatory-status-gap-analysis.md"),
      renderMarkdown(report),
    );
  }

  if (args.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderMarkdown(report));
  }
}

async function analyzeGroup(group: string, examples: ExampleInput[]): Promise<GroupSummary> {
  const rows = new Map<string, MutableRowSummary>();
  const summary = emptyCounts();
  const gapSummary = emptyGapCounts();
  const failures: GroupSummary["failures"] = [];

  for (const example of examples) {
    try {
      const bundle = await readJson<unknown>(example.artifactPath);
      const review = await reviewEvidenceBundle(bundle as never);
      const expectedRows = expectedRowIdsForExample(example);
      const candidatesByKey = new Map(
        review.findingCandidates.map((candidate) => [candidate.findingKey, candidate]),
      );

      for (const area of review.regulatoryReview?.areas ?? []) {
        for (const row of area.rows) {
          const key = `${area.id}:${row.id}`;
          const rowSummary = rows.get(key) ?? mutableRowSummary(area.id, row.id);
          const status = normalizeStatus(row.status);
          const missing = row.missingOrIncompleteSourceSignals ?? [];
          const candidateMissing = row.sourceFindingKeys.flatMap((findingKey) =>
            candidatesByKey.get(findingKey)?.missingCorroborators ?? []
          );
          const expectedPositive = expectedRows.has(row.id);

          incrementStatus(summary, status);
          incrementStatus(rowSummary, status);
          rowSummary.total += 1;
          summary.total += 1;
          incrementCount(rowSummary.topProfilesMap, example.profile);
          incrementCount(rowSummary.topLanesMap, example.lane);
          if (expectedPositive) {
            rowSummary.expectedPositiveRows += 1;
          }

          const sample: Sample = {
            artifactPath: example.artifactPath,
            candidateMissingCorroborators: candidateMissing,
            domain: example.domain,
            group: example.group,
            lane: example.lane,
            missingOrIncompleteSourceSignals: missing,
            profile: example.profile,
            rowId: row.id,
            sourceFindingKeys: row.sourceFindingKeys,
            status: row.status,
            url: example.url,
          };

          if (row.status === "not_testable") {
            const allMissing = [...missing, ...candidateMissing];
            const bucket = classifyNotTestable(missing, candidateMissing);
            rowSummary[bucket] += 1;
            gapSummary[bucket] += 1;
            for (const signal of allMissing) {
              incrementCount(rowSummary.topMissingSignalsMap, signal);
            }
            pushSample(rowSummary.sampleGaps, sample);
          }

          if (row.status === "not_observed") {
            if (expectedPositive && example.calibrationRole !== "control") {
              rowSummary.unexpectedPositiveNotObserved += 1;
              gapSummary.unexpectedPositiveNotObserved += 1;
              pushSample(rowSummary.sampleGaps, sample);
            } else {
              rowSummary.expectedControlNotObserved += 1;
              gapSummary.expectedControlNotObserved += 1;
            }
          }

          rows.set(key, rowSummary);
        }
      }
    } catch (error) {
      failures.push({
        artifactPath: example.artifactPath,
        error: error instanceof Error ? error.message : String(error),
        group,
      });
    }
  }

  const finalRows = [...rows.values()]
    .map(finalizeRow)
    .sort((a, b) =>
      (b.notTestableEmptyMissing + b.unexpectedPositiveNotObserved + b.notTestableOtherMissing) -
        (a.notTestableEmptyMissing + a.unexpectedPositiveNotObserved + a.notTestableOtherMissing) ||
      b.not_testable - a.not_testable ||
      a.rowId.localeCompare(b.rowId)
    );

  return {
    ...summary,
    ...gapSummary,
    examples: examples.length,
    failures,
    group,
    rows: finalRows,
    topRows: finalRows
      .filter((row) =>
        row.not_testable > 0 ||
        row.unexpectedPositiveNotObserved > 0
      )
      .slice(0, 20),
  };
}

function buildReport(args: Args, groups: GroupSummary[]): Report {
  const statusSummary = emptyCounts();
  const gapSummary = emptyGapCounts();
  let examples = 0;
  let failures = 0;

  for (const group of groups) {
    examples += group.examples;
    failures += group.failures.length;
    for (const key of ["total", ...STATUS_KEYS] as const) {
      statusSummary[key] += group[key];
    }
    for (const key of Object.keys(gapSummary) as Array<keyof GapCounts>) {
      gapSummary[key] += group[key];
    }
  }

  return {
    analysisVersion: "wc01.v2_regulatory_status_gap_analysis.1",
    generatedAt: new Date().toISOString(),
    guardrails: [
      "Internal diagnostic artifact only.",
      "Does not create, persist, or promote WC01 production findings.",
      "Does not change production report behavior or scoring.",
      "Does not emit legal conclusions or customer-facing report copy.",
      "Summaries omit raw cookies, request bodies, query values, and unbounded policy text.",
    ],
    inputs: {
      stage2Dir: args.stage2Dir,
      stage3Dir: args.stage3Dir,
    },
    groups,
    summary: {
      ...statusSummary,
      ...gapSummary,
      examples,
      failures,
    },
  };
}

function expectedRowIdsForExample(example: ExampleInput): Set<string> {
  const findingRowIds = new Set<string>();
  for (const findingKey of example.expectedFindingKeys) {
    for (const rowId of FINDING_KEY_TO_ROW_IDS[findingKey] ?? []) {
      findingRowIds.add(rowId);
    }
  }
  const laneRowIds = new Set<string>(LANE_TO_ROW_IDS[example.lane] ?? []);

  if (example.group === "stage2_gold_examples" && findingRowIds.size > 0) {
    const corroboratedLaneRowIds = new Set<string>();
    for (const rowId of laneRowIds) {
      if (findingRowIds.has(rowId)) {
        corroboratedLaneRowIds.add(rowId);
      }
    }
    return corroboratedLaneRowIds;
  }

  const rowIds = new Set(findingRowIds);
  if (rowIds.size > 0) {
    return rowIds;
  }
  for (const rowId of laneRowIds) {
    rowIds.add(rowId);
  }
  return rowIds;
}

function classifyNotTestable(
  missing: string[],
  candidateMissing: string[],
): keyof Pick<
  GapCounts,
  "notTestableEmptyMissing" | "notTestableModuleMissing" | "notTestableOtherMissing"
> {
  const allMissing = [...missing, ...candidateMissing];
  if (allMissing.length === 0) {
    return "notTestableEmptyMissing";
  }
  return missing.some((signal) =>
    /module|scanner did not run|coverage|required_.*module|source_module_not_run/i.test(signal)
  )
    ? "notTestableModuleMissing"
    : "notTestableOtherMissing";
}

function classifyRow(row: MutableRowSummary): GapClassification {
  if (row.notTestableEmptyMissing > 0 && row.unexpectedPositiveNotObserved > 0) {
    return "mixed";
  }
  if (row.notTestableEmptyMissing > 0) {
    return "overly_strict_review_engine_gate";
  }
  if (row.unexpectedPositiveNotObserved > 0) {
    return "missing_scanner_evidence_retention";
  }
  if (row.notTestableOtherMissing > 0) {
    return "missing_scanner_evidence_retention";
  }
  if (row.notTestableModuleMissing > 0) {
    return "expected_profile_or_module_scope";
  }
  if (row.expectedControlNotObserved > 0 && row.expectedPositiveRows === 0) {
    return "expected_clean_absence_or_control";
  }
  return "corpus_target_profile_mismatch";
}

function normalizeStatus(status: string): RegulatoryStatus {
  return STATUS_KEYS.includes(status as RegulatoryStatus) ? status as RegulatoryStatus : "not_testable";
}

function emptyCounts(): StatusCounts {
  return {
    checked: 0,
    gap_observed: 0,
    not_observed: 0,
    not_testable: 0,
    review_signal: 0,
    total: 0,
  };
}

function emptyGapCounts(): GapCounts {
  return {
    expectedControlNotObserved: 0,
    notTestableEmptyMissing: 0,
    notTestableModuleMissing: 0,
    notTestableOtherMissing: 0,
    unexpectedPositiveNotObserved: 0,
  };
}

type MutableRowSummary = StatusCounts & GapCounts & {
  areaId: string;
  expectedPositiveRows: number;
  rowId: string;
  sampleGaps: Sample[];
  topLanesMap: Map<string, number>;
  topMissingSignalsMap: Map<string, number>;
  topProfilesMap: Map<string, number>;
};

function mutableRowSummary(areaId: string, rowId: string): MutableRowSummary {
  return {
    ...emptyCounts(),
    ...emptyGapCounts(),
    areaId,
    expectedPositiveRows: 0,
    rowId,
    sampleGaps: [],
    topLanesMap: new Map(),
    topMissingSignalsMap: new Map(),
    topProfilesMap: new Map(),
  };
}

function finalizeRow(row: MutableRowSummary): RowSummary {
  return {
    areaId: row.areaId,
    checked: row.checked,
    classification: classifyRow(row),
    expectedControlNotObserved: row.expectedControlNotObserved,
    expectedPositiveRows: row.expectedPositiveRows,
    gap_observed: row.gap_observed,
    notTestableEmptyMissing: row.notTestableEmptyMissing,
    notTestableModuleMissing: row.notTestableModuleMissing,
    notTestableOtherMissing: row.notTestableOtherMissing,
    not_observed: row.not_observed,
    not_testable: row.not_testable,
    review_signal: row.review_signal,
    rowId: row.rowId,
    sampleGaps: row.sampleGaps,
    topLanes: topCounts(row.topLanesMap, 8),
    topMissingSignals: topCounts(row.topMissingSignalsMap, 8),
    topProfiles: topCounts(row.topProfilesMap, 8),
    total: row.total,
    unexpectedPositiveNotObserved: row.unexpectedPositiveNotObserved,
  };
}

function incrementStatus(counts: StatusCounts, status: RegulatoryStatus) {
  counts[status] += 1;
}

function incrementCount(map: Map<string, number>, value: string) {
  map.set(value, (map.get(value) ?? 0) + 1);
}

function pushSample(samples: Sample[], sample: Sample) {
  if (samples.length < 8) {
    samples.push(sample);
  }
}

function topCounts(map: Map<string, number>, limit: number): CountEntry[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ count, value }));
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    format: "text",
    help: false,
    outDir: DEFAULT_OUT_DIR,
    stage2Dir: DEFAULT_STAGE2_DIR,
    stage3Dir: DEFAULT_STAGE3_DIR,
    writeSummary: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--":
        break;
      case "--format":
        args.format = readArgValue(argv, ++index, arg) === "json" ? "json" : "text";
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--out-dir":
        args.outDir = readArgValue(argv, ++index, arg);
        break;
      case "--stage2-dir":
        args.stage2Dir = readArgValue(argv, ++index, arg);
        break;
      case "--stage3-dir":
        args.stage3Dir = readArgValue(argv, ++index, arg);
        break;
      case "--write-summary":
        args.writeSummary = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function readArgValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function renderMarkdown(report: Report): string {
  const lines: string[] = [
    "# V2 Regulatory Status Gap Analysis",
    "",
    ...report.guardrails.map((guardrail) => `- ${guardrail}`),
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Overall",
    "",
    `- Examples: ${report.summary.examples}`,
    `- Failures: ${report.summary.failures}`,
    `- Rows: ${report.summary.total}`,
    `- not_testable: ${report.summary.not_testable}`,
    `- not_observed: ${report.summary.not_observed}`,
    `- empty-missing not_testable: ${report.summary.notTestableEmptyMissing}`,
    `- module-missing not_testable: ${report.summary.notTestableModuleMissing}`,
    `- other-missing not_testable: ${report.summary.notTestableOtherMissing}`,
    `- unexpected positive-lane not_observed: ${report.summary.unexpectedPositiveNotObserved}`,
    "",
  ];

  for (const group of report.groups) {
    lines.push(
      `## ${group.group}`,
      "",
      `- Examples: ${group.examples}`,
      `- Rows: ${group.total}`,
      `- not_testable: ${group.not_testable}`,
      `- not_observed: ${group.not_observed}`,
      `- empty-missing not_testable: ${group.notTestableEmptyMissing}`,
      `- module-missing not_testable: ${group.notTestableModuleMissing}`,
      `- unexpected positive-lane not_observed: ${group.unexpectedPositiveNotObserved}`,
      "",
      "| Area | Row | Class | Total | not_testable | empty NT | module NT | unexpected not_observed | Top lanes |",
      "|---|---|---|---:|---:|---:|---:|---:|---|",
    );

    for (const row of group.topRows.slice(0, 20)) {
      lines.push([
        row.areaId,
        row.rowId,
        row.classification,
        String(row.total),
        String(row.not_testable),
        String(row.notTestableEmptyMissing),
        String(row.notTestableModuleMissing),
        String(row.unexpectedPositiveNotObserved),
        row.topLanes.map((entry) => `${entry.value} (${entry.count})`).join(", "),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function usage(): string {
  return [
    "Usage:",
    "  node --import tsx scripts/analyze-v2-regulatory-status-gaps.ts [--write-summary] [--format text|json]",
    "",
    "Runs current v2 review-engine projection over internal gold corpus artifacts and",
    "summarizes unexpected not_testable and positive-lane not_observed rows.",
  ].join("\n");
}
