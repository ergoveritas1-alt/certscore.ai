#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type ScenarioId =
  | "baseline_pre_consent"
  | "gpc_enabled"
  | "reject_all_flow"
  | "accept_all_flow"
  | "privacy_opt_out_flow"
  | "form_collection_probe"
  | "accessibility_probe";

type OpportunityStatus =
  | "observed_or_testable"
  | "not_observed"
  | "not_testable"
  | "needs_additional_probe"
  | "expected_limitation";

interface CohortSummary {
  input?: Record<string, unknown>;
  totals?: Record<string, unknown>;
  results?: CohortResult[];
}

interface CohortResult {
  cohort?: string;
  domain?: string;
  durationMs?: number;
  headedFallbackUsed?: boolean;
  normalizedUrl?: string;
  status?: string;
  url?: string;
}

interface ReplayCaptureHealthReport {
  totals?: Record<string, number>;
  sitesAttempted?: number;
  sitesCompleted?: number;
  sitesFailed?: number;
  sitesWithAtLeastOneReplayBundle?: number;
  scenarioCounts?: Record<string, number>;
}

interface ConsentScenarioPlan {
  policyPlanningStatus?: string;
  plannedScenarios?: Array<{
    scenario?: ScenarioId;
    reasonCodes?: string[];
  }>;
  skippedScenarios?: Array<{
    scenario?: ScenarioId;
    skipReason?: string;
    reasonCodes?: string[];
  }>;
}

interface ConsentScenarioExecution {
  policyPlanningStatus?: string;
  healthSummary?: {
    completed?: number;
    failed?: number;
    skipped?: number;
    comparisonEligible?: number;
    deadlineHit?: boolean;
    policyLate?: boolean;
  };
  scenarios?: ScenarioExecutionEntry[];
}

interface ScenarioExecutionEntry {
  scenario?: ScenarioId;
  actionType?: string;
  status?: "completed" | "failed" | "skipped";
  durationMs?: number;
  reasonCodes?: string[];
  actionProofStatus?: string;
  comparisonEligible?: boolean;
  deadlineHit?: boolean;
  failureReason?: string;
  error?: string;
}

interface ScenarioRollup {
  planned: number;
  completed: number;
  failed: number;
  skipped: number;
  comparisonEligible: number;
  deadlineHit: number;
  observedOrTestable: number;
  notObserved: number;
  notTestable: number;
  needsAdditionalProbe: number;
  expectedLimitation: number;
  durationsMs: number[];
}

interface ReasonGroup {
  scenario: ScenarioId;
  status: OpportunityStatus;
  reason: string;
  count: number;
  examples: string[];
}

interface RunRollup {
  label: string;
  cohortDir: string;
  runType: "consent_core" | "auxiliary_full" | "other";
  rows: number;
  completed: number;
  failed: number;
  p50DurationMs: number;
  p90DurationMs: number;
  maxDurationMs: number;
  headedFallbackUsed: number;
  replayHealth: ReplayCaptureHealthReport;
}

interface GoldExpansionQualityReport {
  reportVersion: "wc01.v2_gold_expansion_quality.1";
  generatedAt: string;
  input: {
    cohortDirs: string[];
    auxiliaryListPath?: string;
    outDir: string;
    supersedeDuplicateSites: boolean;
  };
  summary: {
    uniqueSites: number;
    totalRows: number;
    completedRows: number;
    failedRows: number;
    missingScenarioArtifactRows: number;
    runCount: number;
    coreConsentSites: number;
    auxiliaryExpectedSites: number;
    auxiliarySitesCovered: number;
    readinessStatus: "pass" | "warn" | "fail";
    readinessNotes: string[];
  };
  timing: {
    byRun: Array<Pick<RunRollup, "label" | "rows" | "completed" | "failed" | "p50DurationMs" | "p90DurationMs" | "maxDurationMs">>;
    slowestRows: Array<{
      cohort: string;
      domain: string;
      url: string;
      durationMs: number;
    }>;
  };
  replayHealthTotals: Record<string, number>;
  scenarioCoverage: Record<ScenarioId, Omit<ScenarioRollup, "durationsMs"> & {
    p50DurationMs: number;
    p90DurationMs: number;
  }>;
  healthSummaryTotals: {
    completed: number;
    failed: number;
    skipped: number;
    comparisonEligible: number;
    deadlineHit: number;
    policyLate: number;
  };
  reasonGroups: ReasonGroup[];
  auxiliaryCoverage: {
    expectedUrls: string[];
    coveredUrls: string[];
    missingUrls: string[];
  };
  runs: RunRollup[];
}

const scenarioOrder: ScenarioId[] = [
  "baseline_pre_consent",
  "gpc_enabled",
  "reject_all_flow",
  "accept_all_flow",
  "privacy_opt_out_flow",
  "form_collection_probe",
  "accessibility_probe",
];

function parseArgs(argv: string[]) {
  const cohortDirs: string[] = [];
  let outDir = "artifacts/v2-gold-expansion-quality";
  let auxiliaryListPath = "artifacts/v2-gold-expansion-auxiliary-full/form-a11y.urls.txt";
  let supersedeDuplicateSites = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--cohort" && next) {
      cohortDirs.push(next);
      index += 1;
    } else if (arg === "--out-dir" && next) {
      outDir = next;
      index += 1;
    } else if (arg === "--auxiliary-list" && next) {
      auxiliaryListPath = next;
      index += 1;
    } else if (arg === "--supersede-duplicate-sites") {
      supersedeDuplicateSites = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    }
  }

  if (cohortDirs.length === 0) {
    cohortDirs.push(
      "artifacts/v2-gold-expansion-wave-1-consent-core",
      "artifacts/v2-gold-expansion-wave-2-consent-core",
      "artifacts/v2-gold-expansion-auxiliary-full/run-45s-consent-budget",
    );
  }

  return { cohortDirs, outDir, auxiliaryListPath, supersedeDuplicateSites };
}

function printHelpAndExit(): never {
  console.log(`Usage: pnpm v2:gold-expansion-quality -- [options]

Options:
  --cohort <dir>          Scan-lab cohort output directory. Repeatable.
  --out-dir <dir>         Output directory for JSON/Markdown report.
  --auxiliary-list <file> Expected auxiliary full-profile URL list.
  --supersede-duplicate-sites
                          Prefer later cohort rows for duplicate site/run-type pairs.
`);
  process.exit(0);
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }
    throw error;
  }
}

async function readTextLines(filePath: string): Promise<string[]> {
  try {
    const contents = await readFile(filePath, "utf8");
    return contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function emptyScenarioRollup(): ScenarioRollup {
  return {
    planned: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    comparisonEligible: 0,
    deadlineHit: 0,
    observedOrTestable: 0,
    notObserved: 0,
    notTestable: 0,
    needsAdditionalProbe: 0,
    expectedLimitation: 0,
    durationsMs: [],
  };
}

function percentile(values: number[], percentileRank: number): number {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileRank / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function classifyRun(cohortDir: string, summary?: CohortSummary): RunRollup["runType"] {
  if (summary?.input?.profile === "consent" && summary.input.consentDag === true) {
    return "consent_core";
  }
  if (summary?.input?.profile === "full") {
    return "auxiliary_full";
  }
  if (cohortDir.includes("consent-core")) {
    return "consent_core";
  }
  if (cohortDir.includes("auxiliary")) {
    return "auxiliary_full";
  }
  return "other";
}

function normalizeUrlKey(url: string | undefined): string {
  if (!url) {
    return "";
  }
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "/" : parsed.pathname}`;
  } catch {
    return url.trim().replace(/^https?:\/\/www\./, "https://");
  }
}

function calibrationDirFor(result: CohortResult): string | undefined {
  if (!result.cohort || !result.domain) {
    return undefined;
  }
  return path.join("artifacts", `v2-calibration-${result.cohort}`, result.domain);
}

function classifyScenarioOpportunity(entry: ScenarioExecutionEntry): { status: OpportunityStatus; reason: string } {
  const reason = entry.failureReason ?? entry.reasonCodes?.[0] ?? entry.error ?? "unspecified";

  if (entry.deadlineHit || entry.status === "failed") {
    return { status: "needs_additional_probe", reason };
  }
  if (entry.status === "skipped") {
    if (reason.includes("not_observed")) {
      return { status: "not_observed", reason };
    }
    if (reason === "profile_not_enabled" || reason.includes("not_enabled")) {
      return { status: "expected_limitation", reason };
    }
    return { status: "not_testable", reason };
  }
  if (entry.actionType && !entry.comparisonEligible) {
    return { status: "not_testable", reason: entry.actionProofStatus ?? reason };
  }
  return { status: "observed_or_testable", reason };
}

function incrementReasonGroup(
  groups: Map<string, ReasonGroup>,
  scenario: ScenarioId,
  status: OpportunityStatus,
  reason: string,
  example: string,
) {
  if (status === "observed_or_testable") {
    return;
  }
  const key = `${scenario}:${status}:${reason}`;
  const current = groups.get(key) ?? {
    scenario,
    status,
    reason,
    count: 0,
    examples: [],
  };
  current.count += 1;
  if (current.examples.length < 12 && example) {
    current.examples.push(example);
  }
  groups.set(key, current);
}

function addHealthTotals(
  totals: GoldExpansionQualityReport["healthSummaryTotals"],
  execution: ConsentScenarioExecution | undefined,
) {
  if (!execution?.healthSummary) {
    return;
  }
  totals.completed += execution.healthSummary.completed ?? 0;
  totals.failed += execution.healthSummary.failed ?? 0;
  totals.skipped += execution.healthSummary.skipped ?? 0;
  totals.comparisonEligible += execution.healthSummary.comparisonEligible ?? 0;
  totals.deadlineHit += execution.healthSummary.deadlineHit ? 1 : 0;
  totals.policyLate += execution.healthSummary.policyLate ? 1 : 0;
}

function addReplayTotals(totals: Record<string, number>, health: ReplayCaptureHealthReport | undefined) {
  if (!health?.totals) {
    return;
  }
  for (const [key, value] of Object.entries(health.totals)) {
    totals[key] = (totals[key] ?? 0) + value;
  }
}

function createScenarioCoverageOutput(
  scenarioRollups: Record<ScenarioId, ScenarioRollup>,
): GoldExpansionQualityReport["scenarioCoverage"] {
  const output = {} as GoldExpansionQualityReport["scenarioCoverage"];
  for (const scenario of scenarioOrder) {
    const rollup = scenarioRollups[scenario];
    const { durationsMs, ...counts } = rollup;
    output[scenario] = {
      ...counts,
      p50DurationMs: percentile(durationsMs, 50),
      p90DurationMs: percentile(durationsMs, 90),
    };
  }
  return output;
}

async function main() {
  const input = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const loadedCohorts = await Promise.all(input.cohortDirs.map(async (cohortDir) => ({
    cohortDir,
    summary: await readJsonFile<CohortSummary>(path.join(cohortDir, "Wc01V2ScanLabCohort.summary.json")),
    replayHealth: (await readJsonFile<ReplayCaptureHealthReport>(path.join(cohortDir, "ReplayCaptureHealthReport.json"))) ?? {},
  })));
  const loadedRuns = loadedCohorts.map((cohort) => ({
    ...cohort,
    runType: classifyRun(cohort.cohortDir, cohort.summary),
  }));
  const latestDuplicateRow = new Map<string, number>();
  if (input.supersedeDuplicateSites) {
    loadedRuns.forEach((cohort, cohortIndex) => {
      for (const result of cohort.summary?.results ?? []) {
        const key = duplicateSiteKey(cohort.runType, result);
        if (key) {
          latestDuplicateRow.set(key, cohortIndex);
        }
      }
    });
  }
  const scenarioRollups = Object.fromEntries(
    scenarioOrder.map((scenario) => [scenario, emptyScenarioRollup()]),
  ) as Record<ScenarioId, ScenarioRollup>;
  const reasonGroups = new Map<string, ReasonGroup>();
  const replayHealthTotals: Record<string, number> = {};
  const runs: RunRollup[] = [];
  const uniqueSites = new Set<string>();
  const coreConsentSites = new Set<string>();
  const auxiliaryExpectedUrls = new Set((await readTextLines(input.auxiliaryListPath)).map(extractUrlFromLine).map(normalizeUrlKey));
  const auxiliaryCoveredUrls = new Set<string>();
  const slowestRows: GoldExpansionQualityReport["timing"]["slowestRows"] = [];
  const healthSummaryTotals: GoldExpansionQualityReport["healthSummaryTotals"] = {
    completed: 0,
    failed: 0,
    skipped: 0,
    comparisonEligible: 0,
    deadlineHit: 0,
    policyLate: 0,
  };

  let totalRows = 0;
  let completedRows = 0;
  let failedRows = 0;
  let missingScenarioArtifactRows = 0;

  for (const [cohortIndex, loadedCohort] of loadedRuns.entries()) {
    const { cohortDir, replayHealth, runType } = loadedCohort;
    const results = (loadedCohort.summary?.results ?? []).filter((result) => {
      if (!input.supersedeDuplicateSites) {
        return true;
      }
      const key = duplicateSiteKey(runType, result);
      return !key || latestDuplicateRow.get(key) === cohortIndex;
    });
    const durations = results.map((result) => result.durationMs ?? 0).filter((value) => value > 0);

    totalRows += results.length;
    completedRows += results.filter((result) => result.status === "completed").length;
    failedRows += results.filter((result) => result.status === "failed").length;
    addReplayTotals(replayHealthTotals, replayHealth);

    const runRollup: RunRollup = {
      label: path.basename(cohortDir),
      cohortDir,
      runType,
      rows: results.length,
      completed: results.filter((result) => result.status === "completed").length,
      failed: results.filter((result) => result.status === "failed").length,
      p50DurationMs: percentile(durations, 50),
      p90DurationMs: percentile(durations, 90),
      maxDurationMs: durations.length > 0 ? Math.max(...durations) : 0,
      headedFallbackUsed: results.filter((result) => result.headedFallbackUsed).length,
      replayHealth,
    };
    runs.push(runRollup);

    for (const result of results) {
      const siteKey = normalizeUrlKey(result.url ?? result.normalizedUrl ?? result.domain);
      if (siteKey) {
        uniqueSites.add(siteKey);
        if (runType === "consent_core") {
          coreConsentSites.add(siteKey);
        }
      }
      if (result.durationMs && result.durationMs > 0) {
        slowestRows.push({
          cohort: result.cohort ?? "",
          domain: result.domain ?? "",
          url: result.url ?? result.normalizedUrl ?? "",
          durationMs: result.durationMs,
        });
      }

      const calibrationDir = calibrationDirFor(result);
      const plan = calibrationDir
        ? await readJsonFile<ConsentScenarioPlan>(path.join(calibrationDir, "consent_scenario_plan.json"))
        : undefined;
      const execution = calibrationDir
        ? await readJsonFile<ConsentScenarioExecution>(path.join(calibrationDir, "consent_scenario_execution.json"))
        : undefined;

      if (result.status === "completed" && !execution) {
        missingScenarioArtifactRows += 1;
      }
      addHealthTotals(healthSummaryTotals, execution);

      for (const plannedScenario of plan?.plannedScenarios ?? []) {
        const scenario = plannedScenario.scenario;
        if (scenario && scenarioRollups[scenario]) {
          scenarioRollups[scenario].planned += 1;
        }
      }
      for (const scenarioEntry of execution?.scenarios ?? []) {
        const scenario = scenarioEntry.scenario;
        if (!scenario || !scenarioRollups[scenario]) {
          continue;
        }
        const rollup = scenarioRollups[scenario];
        if (scenarioEntry.status === "completed") {
          rollup.completed += 1;
        } else if (scenarioEntry.status === "failed") {
          rollup.failed += 1;
        } else if (scenarioEntry.status === "skipped") {
          rollup.skipped += 1;
        }
        if (scenarioEntry.comparisonEligible) {
          rollup.comparisonEligible += 1;
        }
        if (scenarioEntry.deadlineHit) {
          rollup.deadlineHit += 1;
        }
        if (scenarioEntry.durationMs && scenarioEntry.durationMs > 0) {
          rollup.durationsMs.push(scenarioEntry.durationMs);
        }

        const opportunity = classifyScenarioOpportunity(scenarioEntry);
        if (opportunity.status === "observed_or_testable") {
          rollup.observedOrTestable += 1;
        } else if (opportunity.status === "not_observed") {
          rollup.notObserved += 1;
        } else if (opportunity.status === "not_testable") {
          rollup.notTestable += 1;
        } else if (opportunity.status === "needs_additional_probe") {
          rollup.needsAdditionalProbe += 1;
        } else if (opportunity.status === "expected_limitation") {
          rollup.expectedLimitation += 1;
        }
        incrementReasonGroup(reasonGroups, scenario, opportunity.status, opportunity.reason, result.domain ?? result.url ?? "");

        if (runType === "auxiliary_full" && scenario === "form_collection_probe" && scenarioEntry.status === "completed") {
          auxiliaryCoveredUrls.add(siteKey);
        }
      }
    }
  }

  const missingAuxiliaryUrls = [...auxiliaryExpectedUrls].filter((url) => !auxiliaryCoveredUrls.has(url));
  const readinessNotes: string[] = [];
  if (failedRows > 0) {
    readinessNotes.push(`${failedRows} scan-lab rows failed.`);
  }
  if (missingScenarioArtifactRows > 0) {
    readinessNotes.push(`${missingScenarioArtifactRows} completed rows are missing consent scenario execution artifacts.`);
  }
  if (missingAuxiliaryUrls.length > 0) {
    readinessNotes.push(`${missingAuxiliaryUrls.length} expected auxiliary URLs did not complete form_collection_probe.`);
  }
  if (healthSummaryTotals.deadlineHit > 0) {
    readinessNotes.push(`${healthSummaryTotals.deadlineHit} scenario execution artifacts reported deadline hits.`);
  }
  if (healthSummaryTotals.failed > 0) {
    readinessNotes.push(`${healthSummaryTotals.failed} scenario executions failed.`);
  }
  if (readinessNotes.length === 0) {
    readinessNotes.push("Corpus expansion scan-lab rows completed with expected internal-only artifacts.");
  }

  const report: GoldExpansionQualityReport = {
    reportVersion: "wc01.v2_gold_expansion_quality.1",
    generatedAt,
    input,
    summary: {
      uniqueSites: uniqueSites.size,
      totalRows,
      completedRows,
      failedRows,
      missingScenarioArtifactRows,
      runCount: runs.length,
      coreConsentSites: coreConsentSites.size,
      auxiliaryExpectedSites: auxiliaryExpectedUrls.size,
      auxiliarySitesCovered: auxiliaryCoveredUrls.size,
      readinessStatus:
        failedRows > 0 || healthSummaryTotals.failed > 0 || missingScenarioArtifactRows > 0
          ? "fail"
          : missingAuxiliaryUrls.length > 0
            ? "warn"
            : "pass",
      readinessNotes,
    },
    timing: {
      byRun: runs.map(({ label, rows, completed, failed, p50DurationMs, p90DurationMs, maxDurationMs }) => ({
        label,
        rows,
        completed,
        failed,
        p50DurationMs,
        p90DurationMs,
        maxDurationMs,
      })),
      slowestRows: slowestRows.sort((a, b) => b.durationMs - a.durationMs).slice(0, 12),
    },
    replayHealthTotals,
    scenarioCoverage: createScenarioCoverageOutput(scenarioRollups),
    healthSummaryTotals,
    reasonGroups: [...reasonGroups.values()].sort((a, b) => b.count - a.count || a.scenario.localeCompare(b.scenario)),
    auxiliaryCoverage: {
      expectedUrls: [...auxiliaryExpectedUrls].sort(),
      coveredUrls: [...auxiliaryCoveredUrls].sort(),
      missingUrls: missingAuxiliaryUrls.sort(),
    },
    runs,
  };

  await mkdir(input.outDir, { recursive: true });
  await writeFile(path.join(input.outDir, "GoldExpansionQualityReport.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(input.outDir, "GoldExpansionQualityReport.md"), renderMarkdown(report));
  console.log(`Wrote ${path.join(input.outDir, "GoldExpansionQualityReport.json")}`);
  console.log(`Wrote ${path.join(input.outDir, "GoldExpansionQualityReport.md")}`);
}

function duplicateSiteKey(runType: RunRollup["runType"], result: CohortResult): string | undefined {
  const siteKey = normalizeUrlKey(result.url ?? result.normalizedUrl ?? result.domain);
  if (!siteKey) {
    return undefined;
  }
  return `${runType}:${siteKey}`;
}

function renderMarkdown(report: GoldExpansionQualityReport): string {
  const lines: string[] = [];
  lines.push("# V2 Gold Expansion Quality Report");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Readiness: ${report.summary.readinessStatus}`);
  lines.push(`- Unique sites: ${report.summary.uniqueSites}`);
  lines.push(`- Scan-lab rows: ${report.summary.completedRows}/${report.summary.totalRows} completed`);
  lines.push(`- Missing scenario execution artifacts: ${report.summary.missingScenarioArtifactRows}`);
  lines.push(`- Core consent sites: ${report.summary.coreConsentSites}`);
  lines.push(`- Auxiliary form coverage: ${report.summary.auxiliarySitesCovered}/${report.summary.auxiliaryExpectedSites}`);
  lines.push(`- Scenario failures: ${report.healthSummaryTotals.failed}`);
  lines.push(`- Scenario deadline hits: ${report.healthSummaryTotals.deadlineHit}`);
  lines.push("");
  for (const note of report.summary.readinessNotes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  lines.push("## Timing By Run");
  lines.push("");
  lines.push("| Run | Rows | Completed | Failed | p50 | p90 | Max |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const run of report.timing.byRun) {
    lines.push(
      `| ${run.label} | ${run.rows} | ${run.completed} | ${run.failed} | ${formatMs(run.p50DurationMs)} | ${formatMs(run.p90DurationMs)} | ${formatMs(run.maxDurationMs)} |`,
    );
  }
  lines.push("");
  lines.push("## Scenario Coverage");
  lines.push("");
  lines.push("| Scenario | Planned | Completed | Failed | Skipped | Comparison eligible | Not observed | Not testable | Needs probe | Expected limitation | p90 |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const scenario of scenarioOrder) {
    const value = report.scenarioCoverage[scenario];
    lines.push(
      `| ${scenario} | ${value.planned} | ${value.completed} | ${value.failed} | ${value.skipped} | ${value.comparisonEligible} | ${value.notObserved} | ${value.notTestable} | ${value.needsAdditionalProbe} | ${value.expectedLimitation} | ${formatMs(value.p90DurationMs)} |`,
    );
  }
  lines.push("");
  lines.push("## Top Reason Groups");
  lines.push("");
  lines.push("| Scenario | Status | Reason | Count | Examples |");
  lines.push("| --- | --- | --- | ---: | --- |");
  for (const group of report.reasonGroups.slice(0, 20)) {
    lines.push(
      `| ${group.scenario} | ${group.status} | ${group.reason} | ${group.count} | ${group.examples.slice(0, 6).join(", ")} |`,
    );
  }
  lines.push("");
  lines.push("## Slowest Rows");
  lines.push("");
  lines.push("| Domain | Duration | Cohort |");
  lines.push("| --- | ---: | --- |");
  for (const row of report.timing.slowestRows) {
    lines.push(`| ${row.domain || row.url} | ${formatMs(row.durationMs)} | ${row.cohort} |`);
  }
  lines.push("");
  lines.push("## Replay Health Totals");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("| --- | ---: |");
  for (const [key, value] of Object.entries(report.replayHealthTotals).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`| ${key} | ${value} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function extractUrlFromLine(line: string): string {
  if (!line.startsWith("{")) {
    return line;
  }
  try {
    const parsed = JSON.parse(line) as { url?: string };
    return parsed.url ?? line;
  } catch {
    return line;
  }
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "0ms";
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
