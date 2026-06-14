import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { V2ReportProjectionDraft } from "./index";
import { normalizeV2ProjectionSourceEvidenceRefs } from "./source-ref-sanitization";
import type {
  Wc01V2ShadowProjection,
  Wc01V2ShadowRow,
} from "./wc01-shadow-contract";
import { projectV2ToWc01ShadowProjection } from "./wc01-shadow-contract";

export type Wc01V2ShadowInspectionSummary = {
  source: Wc01V2ShadowProjection["source"];
  contractVersion: Wc01V2ShadowProjection["contractVersion"];
  productionEligible: false;
  rowsByStatus: Record<string, number>;
  rowsByWc01AssessmentStatus: Record<string, number>;
  sanitizerWarnings: string[];
  vendorsByPurpose: Record<string, number>;
  rowsWithCoverageLimitations: Array<{
    rowId: string;
    sourceFindingKey: string;
    status: Wc01V2ShadowRow["status"];
    limitationReasons: string[];
  }>;
  topFindingEligibleCount: number;
  gapEligibleCount: number;
  containsForbiddenGapObservedToken: boolean;
  containsBlockedRawFields: boolean;
};

export type Wc01V2ShadowBatchSiteResult = {
  projectionPath: string;
  siteKey: string;
  status: "succeeded" | "failed";
  outputPath?: string;
  summaryPath?: string;
  errorMessage?: string;
  summary?: Wc01V2ShadowInspectionSummary;
};

export type Wc01V2ShadowBatchGuardrailFailure = {
  failures: string[];
  siteKey: string;
};

export type Wc01V2ShadowBatchSummary = {
  inputProjectionDir: string;
  outputDir: string;
  totalProjectionFilesFound: number;
  succeededCount: number;
  failedCount: number;
  failures: Array<{
    errorMessage: string;
    projectionPath: string;
    siteKey: string;
  }>;
  totalRowCount: number;
  rowsByStatus: Record<string, number>;
  rowsByWc01AssessmentStatus: Record<string, number>;
  sanitizerWarningCount: number;
  sanitizerWarningsBySite: Array<{
    siteKey: string;
    warnings: string[];
  }>;
  topFindingEligibleCount: number;
  gapEligibleCount: number;
  productionEligibleTrueCount: number;
  forbiddenGapStatusTokenPresenceCount: number;
  rawBlockedFieldsPresenceCount: number;
  unsupportedStatusCount: number;
  disallowedStatusWarningCount: number;
  legalConclusionLanguageWarningCount: number;
  vendorPurposeCounts: Record<string, number>;
  coverageLimitationRowCount: number;
  sitesWithCoverageLimitations: string[];
  sitesWithNotTestableRows: string[];
  guardrailFailures: Wc01V2ShadowBatchGuardrailFailure[];
  siteResults: Wc01V2ShadowBatchSiteResult[];
};

type GenerateSingleInput = {
  outPath: string;
  projectionPath: string;
  summaryPath?: string | false;
};

type GenerateSingleFromProjectionInput = {
  outPath: string;
  projection: V2ReportProjectionDraft;
  summaryPath?: string | false;
};

type GenerateBatchInput = {
  aggregateJsonPath?: string;
  aggregateMarkdownPath?: string;
  outDir: string;
  projectionDir: string;
};

const BLOCKED_RAW_FIELD_PATTERN =
  /\b(requestBody|responseBody|setCookieHeaders|cookieValue|rawCookie|bodySizeBytes|rawNanoReasoning|fullDomText|fullPolicyText)\b/i;

const ALLOWED_SHADOW_STATUSES = new Set([
  "observed",
  "review_signal",
  "checked",
  "not_observed",
  "not_testable",
  "coverage_limitation",
  "assisted_candidate",
]);

const LEGAL_CONCLUSION_WARNING = "contains_legal_conclusion_language";
const DISALLOWED_STATUS_WARNING = "contains_disallowed_status";

export function parseV2ReportProjectionDraftJson(raw: string): V2ReportProjectionDraft {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("V2ReportProjectionDraft must be a JSON object.");
  }
  const record = parsed as Record<string, unknown>;
  for (const key of [
    "projectionVersion",
    "scanId",
    "url",
    "rows",
    "coverageLimitations",
  ]) {
    if (!(key in record)) {
      throw new Error(`V2ReportProjectionDraft missing required field: ${key}.`);
    }
  }
  if (!Array.isArray(record.rows)) {
    throw new Error("V2ReportProjectionDraft.rows must be an array.");
  }
  if (!Array.isArray(record.coverageLimitations)) {
    throw new Error("V2ReportProjectionDraft.coverageLimitations must be an array.");
  }
  return normalizeV2ProjectionSourceEvidenceRefs(parsed as V2ReportProjectionDraft);
}

export function projectV2DraftJsonToWc01Shadow(raw: string) {
  return projectV2ToWc01ShadowProjection(parseV2ReportProjectionDraftJson(raw));
}

export async function generateWc01V2ShadowSingleFromFile(input: GenerateSingleInput) {
  const shadow = projectV2DraftJsonToWc01Shadow(await readFile(input.projectionPath, "utf8"));
  return writeWc01V2ShadowSingle({
    outPath: input.outPath,
    shadow,
    summaryPath: input.summaryPath,
  });
}

export async function generateWc01V2ShadowSingleFromProjection(input: GenerateSingleFromProjectionInput) {
  const shadow = projectV2ToWc01ShadowProjection(normalizeV2ProjectionSourceEvidenceRefs(input.projection));
  return writeWc01V2ShadowSingle({
    outPath: input.outPath,
    shadow,
    summaryPath: input.summaryPath,
  });
}

async function writeWc01V2ShadowSingle(input: {
  outPath: string;
  shadow: Wc01V2ShadowProjection;
  summaryPath?: string | false;
}) {
  const shadow = input.shadow;
  const summary = buildWc01V2ShadowInspectionSummary(shadow);
  const summaryPath = input.summaryPath === false
    ? null
    : input.summaryPath ?? join(dirname(input.outPath), "Wc01V2ShadowProjection.summary.md");

  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, `${JSON.stringify(shadow, null, 2)}\n`, "utf8");

  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderWc01V2ShadowInspectionMarkdown(summary), "utf8");
  }

  return { shadow, summary, summaryPath };
}

export async function generateWc01V2ShadowBatch(
  input: GenerateBatchInput,
): Promise<Wc01V2ShadowBatchSummary> {
  const projectionPaths = await findV2ReportProjectionDraftFiles(input.projectionDir);
  const siteResults: Wc01V2ShadowBatchSiteResult[] = [];

  for (const projectionPath of projectionPaths) {
    const siteKey = siteKeyForProjectionPath(input.projectionDir, projectionPath);
    const relativeOutputDir = dirname(relative(input.projectionDir, projectionPath));
    const outDir = relativeOutputDir === "." ? input.outDir : join(input.outDir, relativeOutputDir);
    const outputPath = join(outDir, "Wc01V2ShadowProjection.json");
    const summaryPath = join(outDir, "Wc01V2ShadowProjection.summary.md");

    try {
      const generated = await generateWc01V2ShadowSingleFromFile({
        projectionPath,
        outPath: outputPath,
        summaryPath,
      });
      siteResults.push({
        projectionPath,
        siteKey,
        status: "succeeded",
        outputPath,
        summaryPath,
        summary: generated.summary,
      });
    } catch (error) {
      siteResults.push({
        projectionPath,
        siteKey,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = buildWc01V2ShadowBatchSummary({
    inputProjectionDir: input.projectionDir,
    outputDir: input.outDir,
    siteResults,
    totalProjectionFilesFound: projectionPaths.length,
  });
  const aggregateJsonPath = input.aggregateJsonPath ?? join(input.outDir, "wc01-shadow-batch-summary.json");
  const aggregateMarkdownPath = input.aggregateMarkdownPath ?? join(input.outDir, "wc01-shadow-batch-summary.md");

  await mkdir(input.outDir, { recursive: true });
  await writeFile(aggregateJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(aggregateMarkdownPath, renderWc01V2ShadowBatchSummaryMarkdown(summary), "utf8");

  return summary;
}

export async function findV2ReportProjectionDraftFiles(projectionDir: string) {
  const results: string[] = [];

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name === "V2ReportProjectionDraft.json") {
        results.push(entryPath);
      }
    }
  }

  await walk(projectionDir);
  return results.sort();
}

export function buildWc01V2ShadowInspectionSummary(
  shadow: Wc01V2ShadowProjection,
): Wc01V2ShadowInspectionSummary {
  return {
    source: shadow.source,
    contractVersion: shadow.contractVersion,
    productionEligible: shadow.productionEligible,
    rowsByStatus: countBy(shadow.rows.map((row) => row.status)),
    rowsByWc01AssessmentStatus: countBy(shadow.rows.map((row) => row.wc01AssessmentStatus)),
    sanitizerWarnings: shadow.sanitizerWarnings,
    vendorsByPurpose: countBy(shadow.rows.flatMap((row) => row.vendors.map((vendor) => vendor.purpose))),
    rowsWithCoverageLimitations: shadow.rows
      .filter((row) =>
        row.status === "coverage_limitation" ||
        row.policy.reviewOnlyReasons.includes("coverage_limitation_present") ||
        row.policy.reviewOnlyReasons.includes("source_module_missing_or_incomplete")
      )
      .map((row) => ({
        rowId: row.rowId,
        sourceFindingKey: row.sourceFindingKey,
        status: row.status,
        limitationReasons: row.policy.reviewOnlyReasons.filter((reason) =>
          reason === "coverage_limitation_present" ||
          reason === "source_module_missing_or_incomplete"
        ),
      })),
    topFindingEligibleCount: shadow.rows.filter((row) => row.topFindingEligible).length,
    gapEligibleCount: shadow.rows.filter((row) => row.gapEligible).length,
    containsForbiddenGapObservedToken: containsForbiddenGapObservedToken(shadow),
    containsBlockedRawFields: containsBlockedRawFields(shadow),
  };
}

export function renderWc01V2ShadowInspectionMarkdown(
  summary: Wc01V2ShadowInspectionSummary,
) {
  return [
    "# WC01 v2 Shadow Projection",
    "",
    "Internal shadow diagnostic only. Not customer-facing report output.",
    "",
    `- Source URL: ${summary.source.url}`,
    `- Scan ID: ${summary.source.scanId}`,
    `- Review ID: ${summary.source.reviewId ?? "unknown"}`,
    `- Contract version: ${summary.contractVersion}`,
    `- Production eligible: ${String(summary.productionEligible)}`,
    "",
    "## Row Counts By Status",
    "",
    renderCountTable(summary.rowsByStatus, "Status"),
    "",
    "## Row Counts By WC01 Assessment Status",
    "",
    renderCountTable(summary.rowsByWc01AssessmentStatus, "Assessment status"),
    "",
    "## Sanitizer Warnings",
    "",
    `- Count: ${summary.sanitizerWarnings.length}`,
    ...(
      summary.sanitizerWarnings.length > 0
        ? summary.sanitizerWarnings.map((warning) => `- ${warning}`)
        : ["- none"]
    ),
    "",
    "## Vendors By Purpose",
    "",
    renderCountTable(summary.vendorsByPurpose, "Purpose"),
    "",
    "## Coverage-Limited Rows",
    "",
    ...renderCoverageRows(summary.rowsWithCoverageLimitations),
    "",
    "## Guardrails",
    "",
    `- topFindingEligible count: ${summary.topFindingEligibleCount}`,
    `- gapEligible count: ${summary.gapEligibleCount}`,
    `- no forbidden gap status token appears: ${String(!summary.containsForbiddenGapObservedToken)}`,
    `- no raw blocked fields found: ${String(!summary.containsBlockedRawFields)}`,
    "",
  ].join("\n");
}

export function buildWc01V2ShadowBatchSummary(input: {
  inputProjectionDir: string;
  outputDir: string;
  siteResults: Wc01V2ShadowBatchSiteResult[];
  totalProjectionFilesFound: number;
}): Wc01V2ShadowBatchSummary {
  const succeeded = input.siteResults.filter((result) => result.status === "succeeded" && result.summary);
  const failed = input.siteResults.filter((result) => result.status === "failed");
  const rowsByStatus: Record<string, number> = {};
  const rowsByWc01AssessmentStatus: Record<string, number> = {};
  const vendorPurposeCounts: Record<string, number> = {};
  const sanitizerWarningsBySite: Wc01V2ShadowBatchSummary["sanitizerWarningsBySite"] = [];
  const sitesWithCoverageLimitations: string[] = [];
  const sitesWithNotTestableRows: string[] = [];
  const guardrailFailures: Wc01V2ShadowBatchGuardrailFailure[] = [];

  let totalRowCount = 0;
  let sanitizerWarningCount = 0;
  let topFindingEligibleCount = 0;
  let gapEligibleCount = 0;
  let productionEligibleTrueCount = 0;
  let forbiddenGapStatusTokenPresenceCount = 0;
  let rawBlockedFieldsPresenceCount = 0;
  let unsupportedStatusCount = 0;
  let disallowedStatusWarningCount = 0;
  let legalConclusionLanguageWarningCount = 0;
  let coverageLimitationRowCount = 0;

  for (const result of succeeded) {
    const summary = result.summary!;
    totalRowCount += sumCounts(summary.rowsByStatus);
    addCounts(rowsByStatus, summary.rowsByStatus);
    addCounts(rowsByWc01AssessmentStatus, summary.rowsByWc01AssessmentStatus);
    addCounts(vendorPurposeCounts, summary.vendorsByPurpose);
    sanitizerWarningCount += summary.sanitizerWarnings.length;
    topFindingEligibleCount += summary.topFindingEligibleCount;
    gapEligibleCount += summary.gapEligibleCount;
    productionEligibleTrueCount += productionEligibleIsTrue(summary) ? 1 : 0;
    forbiddenGapStatusTokenPresenceCount += summary.containsForbiddenGapObservedToken ? 1 : 0;
    rawBlockedFieldsPresenceCount += summary.containsBlockedRawFields ? 1 : 0;
    unsupportedStatusCount += Object.entries(summary.rowsByStatus)
      .filter(([status]) => !ALLOWED_SHADOW_STATUSES.has(status))
      .reduce((total, [, count]) => total + count, 0);
    disallowedStatusWarningCount += summary.sanitizerWarnings.filter((warning) =>
      warning === DISALLOWED_STATUS_WARNING
    ).length;
    legalConclusionLanguageWarningCount += summary.sanitizerWarnings.filter((warning) =>
      warning === LEGAL_CONCLUSION_WARNING
    ).length;
    coverageLimitationRowCount += summary.rowsWithCoverageLimitations.length;
    if (summary.rowsWithCoverageLimitations.length > 0) {
      sitesWithCoverageLimitations.push(result.siteKey);
    }
    if ((summary.rowsByStatus.not_testable ?? 0) > 0) {
      sitesWithNotTestableRows.push(result.siteKey);
    }

    const failures = [
      productionEligibleIsTrue(summary) ? "productionEligible_true" : null,
      summary.topFindingEligibleCount > 0 ? "topFindingEligible_gt_0" : null,
      summary.gapEligibleCount > 0 ? "gapEligible_gt_0" : null,
      summary.containsForbiddenGapObservedToken ? "forbidden_gap_status_token_present" : null,
      summary.containsBlockedRawFields ? "raw_blocked_fields_present" : null,
      Object.keys(summary.rowsByStatus).some((status) => !ALLOWED_SHADOW_STATUSES.has(status))
        ? "unsupported_status_in_output"
        : null,
      summary.sanitizerWarnings.includes(DISALLOWED_STATUS_WARNING)
        ? "disallowed_status_warning"
        : null,
      summary.sanitizerWarnings.includes(LEGAL_CONCLUSION_WARNING)
        ? "legal_conclusion_language_warning"
        : null,
    ].filter((value): value is string => Boolean(value));

    if (failures.length > 0) {
      guardrailFailures.push({ siteKey: result.siteKey, failures });
    }

    if (summary.sanitizerWarnings.length > 0) {
      sanitizerWarningsBySite.push({
        siteKey: result.siteKey,
        warnings: summary.sanitizerWarnings,
      });
    }
  }

  return {
    inputProjectionDir: input.inputProjectionDir,
    outputDir: input.outputDir,
    totalProjectionFilesFound: input.totalProjectionFilesFound,
    succeededCount: succeeded.length,
    failedCount: failed.length,
    failures: failed.map((result) => ({
      errorMessage: result.errorMessage ?? "Unknown failure.",
      projectionPath: result.projectionPath,
      siteKey: result.siteKey,
    })),
    totalRowCount,
    rowsByStatus,
    rowsByWc01AssessmentStatus,
    sanitizerWarningCount,
    sanitizerWarningsBySite,
    topFindingEligibleCount,
    gapEligibleCount,
    productionEligibleTrueCount,
    forbiddenGapStatusTokenPresenceCount,
    rawBlockedFieldsPresenceCount,
    unsupportedStatusCount,
    disallowedStatusWarningCount,
    legalConclusionLanguageWarningCount,
    vendorPurposeCounts,
    coverageLimitationRowCount,
    sitesWithCoverageLimitations: uniqueStrings(sitesWithCoverageLimitations),
    sitesWithNotTestableRows: uniqueStrings(sitesWithNotTestableRows),
    guardrailFailures,
    siteResults: input.siteResults,
  };
}

export function renderWc01V2ShadowBatchSummaryMarkdown(
  summary: Wc01V2ShadowBatchSummary,
) {
  return [
    "# WC01 v2 Shadow Batch Summary",
    "",
    "Internal shadow diagnostic only. Not customer-facing report output.",
    "",
    `- Input projection directory: ${summary.inputProjectionDir}`,
    `- Output directory: ${summary.outputDir}`,
    `- Projection files found: ${summary.totalProjectionFilesFound}`,
    `- Succeeded: ${summary.succeededCount}`,
    `- Failed: ${summary.failedCount}`,
    `- Total rows: ${summary.totalRowCount}`,
    "",
    "## Row Counts By Status",
    "",
    renderCountTable(summary.rowsByStatus, "Status"),
    "",
    "## Row Counts By WC01 Assessment Status",
    "",
    renderCountTable(summary.rowsByWc01AssessmentStatus, "Assessment status"),
    "",
    "## Guardrails",
    "",
    `- productionEligible true count: ${summary.productionEligibleTrueCount}`,
    `- topFindingEligible count: ${summary.topFindingEligibleCount}`,
    `- gapEligible count: ${summary.gapEligibleCount}`,
    `- forbidden gap status token presence count: ${summary.forbiddenGapStatusTokenPresenceCount}`,
    `- raw blocked fields presence count: ${summary.rawBlockedFieldsPresenceCount}`,
    `- unsupported status in output count: ${summary.unsupportedStatusCount}`,
    `- disallowed status warning count: ${summary.disallowedStatusWarningCount}`,
    `- legal-conclusion warning count: ${summary.legalConclusionLanguageWarningCount}`,
    "",
    "## Sanitizer Warnings",
    "",
    `- Total warnings: ${summary.sanitizerWarningCount}`,
    ...(
      summary.sanitizerWarningsBySite.length > 0
        ? summary.sanitizerWarningsBySite.map((entry) => `- ${entry.siteKey}: ${entry.warnings.join(", ")}`)
        : ["- none"]
    ),
    "",
    "## Vendors By Purpose",
    "",
    renderCountTable(summary.vendorPurposeCounts, "Purpose"),
    "",
    "## Coverage Limitations",
    "",
    `- Coverage-limited row count: ${summary.coverageLimitationRowCount}`,
    `- Sites with coverage limitations: ${summary.sitesWithCoverageLimitations.join(", ") || "none"}`,
    `- Sites with not-testable rows: ${summary.sitesWithNotTestableRows.join(", ") || "none"}`,
    "",
    "## Per-Site Failures",
    "",
    ...renderFailureRows(summary.failures),
    "",
    "## Guardrail Failures",
    "",
    ...renderGuardrailFailureRows(summary.guardrailFailures),
    "",
  ].join("\n");
}

export function containsForbiddenGapObservedToken(value: unknown) {
  return JSON.stringify(value).includes("gap_observed");
}

export function containsBlockedRawFields(value: unknown) {
  return BLOCKED_RAW_FIELD_PATTERN.test(JSON.stringify(value));
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function productionEligibleIsTrue(summary: Wc01V2ShadowInspectionSummary) {
  return (summary.productionEligible as boolean) === true;
}

function addCounts(target: Record<string, number>, source: Record<string, number>) {
  for (const [key, count] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + count;
  }
}

function sumCounts(counts: Record<string, number>) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function renderCountTable(counts: Record<string, number>, label: string) {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return "| " + label + " | Count |\n|---|---:|\n| none | 0 |";
  }
  return [
    `| ${label} | Count |`,
    "|---|---:|",
    ...entries.map(([key, count]) => `| ${key} | ${count} |`),
  ].join("\n");
}

function renderCoverageRows(
  rows: Wc01V2ShadowInspectionSummary["rowsWithCoverageLimitations"],
) {
  if (rows.length === 0) {
    return ["- none"];
  }
  return [
    "| Row ID | Source finding key | Status | Limitation reasons |",
    "|---|---|---|---|",
    ...rows.map((row) =>
      `| ${row.rowId} | ${row.sourceFindingKey} | ${row.status} | ${row.limitationReasons.join(", ") || "status_only"} |`
    ),
  ];
}

function renderFailureRows(
  failures: Wc01V2ShadowBatchSummary["failures"],
) {
  if (failures.length === 0) {
    return ["- none"];
  }
  return [
    "| Site | Projection path | Error |",
    "|---|---|---|",
    ...failures.map((failure) =>
      `| ${failure.siteKey} | ${failure.projectionPath} | ${failure.errorMessage.replace(/\|/g, "/")} |`
    ),
  ];
}

function renderGuardrailFailureRows(
  failures: Wc01V2ShadowBatchGuardrailFailure[],
) {
  if (failures.length === 0) {
    return ["- none"];
  }
  return [
    "| Site | Failures |",
    "|---|---|",
    ...failures.map((failure) =>
      `| ${failure.siteKey} | ${failure.failures.join(", ")} |`
    ),
  ];
}

function siteKeyForProjectionPath(projectionDir: string, projectionPath: string) {
  const relativeDir = dirname(relative(projectionDir, projectionPath));
  return relativeDir === "." ? "root" : relativeDir.split(/[\\/]+/g).join("/");
}
