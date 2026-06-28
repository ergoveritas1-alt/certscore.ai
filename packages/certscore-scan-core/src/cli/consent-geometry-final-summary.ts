#!/usr/bin/env node
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConsentControlGeometryArtifact } from "../consent-control-geometry.js";
import type { ConsentGeometryAccessDiagnostic, ConsentGeometryEgressDiagnostic } from "../consent-geometry-access.js";
import type { ConsentGeometryNanoVisualReview, NanoVisualAgreement, NanoVisualBoolean } from "../consent-geometry-visual-review.js";

type ParsedArgs = {
  artifacts?: string;
};

type ScannerBool = boolean | "unavailable";

type FinalSummaryRow = {
  site: string;
  egressLabel: string;
  accessStatus: string;
  noGo: boolean;
  cmpDetected: boolean;
  cmpName: string;
  accept: ScannerBool;
  reject: ScannerBool;
  options: ScannerBool;
  screenshotPath?: string;
  nanoReviewPath?: string;
  geometryArtifactPath?: string;
  nanoSawConsentBanner: NanoVisualBoolean | "not_reviewed";
  nanoAccept: NanoVisualBoolean | "not_reviewed";
  nanoReject: NanoVisualBoolean | "not_reviewed";
  nanoOptions: NanoVisualBoolean | "not_reviewed";
  nanoAgreementAccept: NanoVisualAgreement | "not_reviewed";
  nanoAgreementReject: NanoVisualAgreement | "not_reviewed";
  nanoAgreementOptions: NanoVisualAgreement | "not_reviewed";
  verification: string;
  limitations: string[];
};

type GeometryWithDiagnostics = ConsentControlGeometryArtifact & {
  access?: ConsentGeometryAccessDiagnostic;
  egress?: ConsentGeometryEgressDiagnostic;
};

type CohortSummary = {
  egress?: ConsentGeometryEgressDiagnostic;
  rows?: Array<{
    site: string;
    artifactPath: string;
    screenshotPath?: string;
    accessStatus?: string;
    accessReasonCodes?: string[];
    egressLabel?: string;
    cmp?: string;
    accept?: boolean;
    reject?: boolean;
    options?: boolean;
    notes?: string;
  }>;
};

type HumanCsvRow = Record<string, string>;

const HUMAN_CSV_COLUMNS = [
  "site",
  "egress_label",
  "access_status",
  "no_go",
  "scanner_accept",
  "scanner_reject",
  "scanner_options",
  "nano_saw_banner",
  "nano_accept",
  "nano_reject",
  "nano_options",
  "nano_agreement_accept",
  "nano_agreement_reject",
  "nano_agreement_options",
  "human_no_go",
  "human_accept",
  "human_reject",
  "human_options",
  "human_notes",
  "screenshot_path",
  "nano_review_path",
  "geometry_artifact_path",
] as const;

type MetricDimension = "no_go" | "accept" | "reject" | "options";

type DimensionMetrics = {
  dimension: MetricDimension;
  labeledCount: number;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
  precision: number | null;
  recall: number | null;
};

type AdjudicationMetrics = {
  artifactVersion: "consent_geometry_adjudication_metrics.v1";
  source: "consent_geometry_final_summary_diagnostic";
  generatedAt: string;
  artifactsRoot: string;
  metrics: DimensionMetrics[];
  disagreements: Array<{
    site: string;
    dimension: MetricDimension;
    scannerValue: boolean;
    humanValue: boolean;
    screenshotPath?: string;
    nanoReviewPath?: string;
    geometryArtifactPath?: string;
  }>;
};

void main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  },
);

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.artifacts) {
    console.error("Usage: pnpm --filter @certscore/scan-core consent-geometry-final-summary --artifacts artifacts/consent-control-geometry/<cohort>");
    process.exit(1);
  }

  const artifactsRoot = path.resolve(args.artifacts);
  const humanCsvPath = path.join(artifactsRoot, "human-adjudication-template.csv");
  const existingHumanRows = await readHumanRows(humanCsvPath);
  const rows = await buildRows(artifactsRoot);
  const csvRows = buildHumanCsvRows(rows, existingHumanRows);
  const output = {
    artifactVersion: "consent_geometry_final_cohort_summary.v1",
    source: "consent_geometry_final_summary_diagnostic",
    artifactsRoot,
    generatedAt: new Date().toISOString(),
    rows,
  };
  const jsonPath = path.join(artifactsRoot, "final-cohort-summary.json");
  const mdPath = path.join(artifactsRoot, "final-cohort-summary.md");
  await writeFile(jsonPath, `${JSON.stringify(output, null, 2)}\n`);
  await writeFile(mdPath, markdownFor(rows));
  await writeFile(humanCsvPath, csvFor(csvRows));

  const metrics = buildAdjudicationMetrics(artifactsRoot, rows, csvRows);
  if (metrics) {
    await writeFile(path.join(artifactsRoot, "adjudication-metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
    await writeFile(path.join(artifactsRoot, "adjudication-metrics.md"), metricsMarkdown(metrics));
  }

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(`Wrote ${humanCsvPath}`);
  if (metrics) {
    console.log(`Wrote ${path.join(artifactsRoot, "adjudication-metrics.json")}`);
    console.log(`Wrote ${path.join(artifactsRoot, "adjudication-metrics.md")}`);
  } else {
    console.log("Human adjudication pending; no adjudication metrics generated.");
  }
  console.log(markdownFor(rows));
}

async function buildRows(artifactsRoot: string): Promise<FinalSummaryRow[]> {
  const entries = await readdir(artifactsRoot, { withFileTypes: true });
  const cohortSummary = await readJsonIfExists<CohortSummary>(path.join(artifactsRoot, "summary.json"));
  const summaryRowsBySlug = new Map<string, NonNullable<CohortSummary["rows"]>[number]>();
  for (const row of cohortSummary?.rows ?? []) {
    summaryRowsBySlug.set(safeSiteSlug(row.site), row);
  }

  const rows: FinalSummaryRow[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const siteSlug = entry.name;
    const summaryRow = summaryRowsBySlug.get(siteSlug);
    const siteDir = path.join(artifactsRoot, siteSlug);
    const lambdaGeometryPath = path.join(siteDir, "ConsentControlGeometryEvidence.json");
    const legacyGeometryPath = path.join(siteDir, "consent-control-geometry.json");
    const geometryPath = await exists(lambdaGeometryPath) ? lambdaGeometryPath : legacyGeometryPath;
    const lambdaFullPageScreenshotPath = path.join(siteDir, "screenshot-pre-consent-full-page.jpg");
    const lambdaScreenshotPath = path.join(siteDir, "screenshot-pre-consent.png");
    const legacyScreenshotPath = path.join(siteDir, "pre-consent-viewport.png");
    const screenshotPath = await exists(lambdaFullPageScreenshotPath)
      ? lambdaFullPageScreenshotPath
      : await exists(lambdaScreenshotPath)
        ? lambdaScreenshotPath
        : legacyScreenshotPath;
    const reviewPath = path.join(siteDir, "nano-visual-review.json");
    const errorPath = path.join(siteDir, "error.txt");
    const geometry = await readJsonIfExists<GeometryWithDiagnostics>(geometryPath);
    const review = await readJsonIfExists<ConsentGeometryNanoVisualReview>(reviewPath);
    const hasScreenshot = await exists(screenshotPath);
    const hasReview = await exists(reviewPath);
    const hasGeometry = await exists(geometryPath);
    const hasError = await exists(errorPath);
    const accessStatus = geometry?.access?.status ?? summaryRow?.accessStatus ?? (hasError ? "navigation_error" : "unknown");
    const visualNoGo = reviewIndicatesVisualAccessNoGo(review);
    const noGo = accessStatus !== "loaded" || visualNoGo;
    const egressLabel = geometry?.egress?.label ?? summaryRow?.egressLabel ?? cohortSummary?.egress?.label ?? "unknown";
    const cmpDetected = geometry?.summary.cmpDetected ?? false;
    const cmpName = geometry?.summary.cmpName ?? summaryRow?.cmp ?? (cmpDetected ? "detected" : "none");
    const scannerAccept = noGo ? "unavailable" : geometry?.summary.firstLayerAccept ?? summaryRow?.accept ?? false;
    const scannerReject = noGo ? "unavailable" : geometry?.summary.firstLayerReject ?? summaryRow?.reject ?? false;
    const scannerOptions = noGo ? "unavailable" : geometry?.summary.firstLayerOptions ?? summaryRow?.options ?? false;

    rows.push({
      site: siteSlug,
      egressLabel,
      accessStatus,
      noGo,
      cmpDetected,
      cmpName,
      accept: scannerAccept,
      reject: scannerReject,
      options: scannerOptions,
      ...(hasScreenshot ? { screenshotPath } : {}),
      ...(hasReview ? { nanoReviewPath: reviewPath } : {}),
      ...(hasGeometry ? { geometryArtifactPath: geometryPath } : {}),
      nanoSawConsentBanner: review ? nanoSawConsentBanner(review) : "not_reviewed",
      nanoAccept: review?.visualFirstLayerAccept ?? "not_reviewed",
      nanoReject: review?.visualFirstLayerReject ?? "not_reviewed",
      nanoOptions: review?.visualFirstLayerOptions ?? "not_reviewed",
      nanoAgreementAccept: review?.scannerAgreement.accept ?? "not_reviewed",
      nanoAgreementReject: review?.scannerAgreement.reject ?? "not_reviewed",
      nanoAgreementOptions: review?.scannerAgreement.options ?? "not_reviewed",
      verification: verificationText({ noGo, review }),
      limitations: [
        ...(geometry?.access?.reasonCodes ?? summaryRow?.accessReasonCodes ?? []),
        ...(visualNoGo ? ["visual_access_no_go"] : []),
        ...(geometry?.summary.limitations ?? []),
        ...(review?.limitations ?? []),
        ...(summaryRow?.notes ? [summaryRow.notes] : []),
      ].slice(0, 8),
    });
  }
  return rows.sort((left, right) => left.site.localeCompare(right.site));
}

function reviewIndicatesVisualAccessNoGo(review: ConsentGeometryNanoVisualReview | undefined): boolean {
  if (!review || review.reviewStatus === "access_no_go") {
    return review?.reviewStatus === "access_no_go";
  }
  if (review.reviewStatus !== "reviewed") {
    return false;
  }
  const text = [...review.notes, ...review.limitations].join(" ");
  return /\b(?:access denied|temporarily restricted|security check|security verification|hcaptcha|captcha|imperva|robot or human|press\s*&\s*hold|press and hold|bot-check|blocked by a bot-check|browser verification)\b/i.test(text);
}

function nanoSawConsentBanner(review: ConsentGeometryNanoVisualReview): NanoVisualBoolean {
  if (review.reviewStatus !== "reviewed") {
    return "uncertain";
  }
  if (
    review.visualFirstLayerAccept === true ||
    review.visualFirstLayerReject === true ||
    review.visualFirstLayerOptions === true
  ) {
    return true;
  }
  if (
    review.visualFirstLayerAccept === false &&
    review.visualFirstLayerReject === false &&
    review.visualFirstLayerOptions === false
  ) {
    return false;
  }
  return "uncertain";
}

function verificationText(input: {
  noGo: boolean;
  review?: ConsentGeometryNanoVisualReview;
}): string {
  if (!input.review) {
    return "Nano review not available.";
  }
  if (input.noGo) {
    return `No-go/access-quality result; Nano status ${input.review.reviewStatus}.`;
  }
  const agreement = [
    input.review.scannerAgreement.accept,
    input.review.scannerAgreement.reject,
    input.review.scannerAgreement.options,
  ];
  if (agreement.every((value) => value === "agree")) {
    return "Nano agrees with scanner A/R/O.";
  }
  if (agreement.some((value) => value === "disagree")) {
    return "Nano disagrees with at least one scanner A/R/O value.";
  }
  return "Nano uncertain on at least one A/R/O value.";
}

function buildHumanCsvRows(rows: FinalSummaryRow[], existingRows: HumanCsvRow[]): HumanCsvRow[] {
  const existingBySite = new Map(existingRows.map((row) => [siteKey(row.site), row]));
  return rows.map((row) => {
    const existing = existingBySite.get(siteKey(row.site));
    return {
      site: row.site,
      egress_label: row.egressLabel,
      access_status: row.accessStatus,
      no_go: yn(row.noGo),
      scanner_accept: yn(row.accept),
      scanner_reject: yn(row.reject),
      scanner_options: yn(row.options),
      nano_saw_banner: yn(row.nanoSawConsentBanner),
      nano_accept: yn(row.nanoAccept),
      nano_reject: yn(row.nanoReject),
      nano_options: yn(row.nanoOptions),
      nano_agreement_accept: row.nanoAgreementAccept,
      nano_agreement_reject: row.nanoAgreementReject,
      nano_agreement_options: row.nanoAgreementOptions,
      human_no_go: existing?.human_no_go ?? "",
      human_accept: existing?.human_accept ?? "",
      human_reject: existing?.human_reject ?? "",
      human_options: existing?.human_options ?? "",
      human_notes: existing?.human_notes ?? "",
      screenshot_path: row.screenshotPath ?? "",
      nano_review_path: row.nanoReviewPath ?? "",
      geometry_artifact_path: row.geometryArtifactPath ?? "",
    };
  });
}

function buildAdjudicationMetrics(
  artifactsRoot: string,
  rows: FinalSummaryRow[],
  csvRows: HumanCsvRow[],
): AdjudicationMetrics | undefined {
  if (!csvRows.some(hasAnyHumanValue)) {
    return undefined;
  }
  const rowBySite = new Map(rows.map((row) => [siteKey(row.site), row]));
  const metrics = (["no_go", "accept", "reject", "options"] as MetricDimension[]).map((dimension) =>
    metricForDimension(dimension, csvRows, rowBySite)
  );
  const disagreements = csvRows.flatMap((csvRow) => {
    const row = rowBySite.get(siteKey(csvRow.site));
    if (!row) {
      return [];
    }
    return (["no_go", "accept", "reject", "options"] as MetricDimension[]).flatMap((dimension) => {
      const human = humanBool(csvRow[`human_${dimension}`]);
      if (human === undefined) {
        return [];
      }
      const scanner = scannerBoolFor(row, dimension);
      return scanner === human ? [] : [{
        site: row.site,
        dimension,
        scannerValue: scanner,
        humanValue: human,
        ...(row.screenshotPath ? { screenshotPath: row.screenshotPath } : {}),
        ...(row.nanoReviewPath ? { nanoReviewPath: row.nanoReviewPath } : {}),
        ...(row.geometryArtifactPath ? { geometryArtifactPath: row.geometryArtifactPath } : {}),
      }];
    });
  });

  return {
    artifactVersion: "consent_geometry_adjudication_metrics.v1",
    source: "consent_geometry_final_summary_diagnostic",
    generatedAt: new Date().toISOString(),
    artifactsRoot,
    metrics,
    disagreements,
  };
}

function metricForDimension(
  dimension: MetricDimension,
  csvRows: HumanCsvRow[],
  rowBySite: Map<string, FinalSummaryRow>,
): DimensionMetrics {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;
  for (const csvRow of csvRows) {
    const human = humanBool(csvRow[`human_${dimension}`]);
    const row = rowBySite.get(siteKey(csvRow.site));
    if (human === undefined || !row) {
      continue;
    }
    const scanner = scannerBoolFor(row, dimension);
    if (scanner && human) {
      truePositive += 1;
    } else if (scanner && !human) {
      falsePositive += 1;
    } else if (!scanner && human) {
      falseNegative += 1;
    } else {
      trueNegative += 1;
    }
  }
  return {
    dimension,
    labeledCount: truePositive + falsePositive + falseNegative + trueNegative,
    truePositive,
    falsePositive,
    falseNegative,
    trueNegative,
    precision: ratio(truePositive, truePositive + falsePositive),
    recall: ratio(truePositive, truePositive + falseNegative),
  };
}

function scannerBoolFor(row: FinalSummaryRow, dimension: MetricDimension): boolean {
  if (dimension === "no_go") {
    return row.noGo;
  }
  if (dimension === "accept") {
    return row.accept === true;
  }
  if (dimension === "reject") {
    return row.reject === true;
  }
  return row.options === true;
}

function markdownFor(rows: FinalSummaryRow[]): string {
  const lines = [
    "| Site | Egress | No-go | Access | CMP | A | R | O | Screenshot | Nano | Nano banner | Nano A/R/O | Nano agreement A/R/O | Verification | Limitations |",
    "|---|---|---:|---|---|---:|---:|---:|---|---|---|---:|---:|---|---|",
  ];
  for (const row of rows) {
    const cells = [
      escapeCell(row.site),
      escapeCell(row.egressLabel),
      yn(row.noGo),
      escapeCell(row.accessStatus),
      escapeCell(row.cmpName),
      yn(row.accept),
      yn(row.reject),
      yn(row.options),
      row.screenshotPath ? linkCell("screenshot", row.screenshotPath) : "-",
      row.nanoReviewPath ? linkCell("nano", row.nanoReviewPath) : "-",
      yn(row.nanoSawConsentBanner),
      `${yn(row.nanoAccept)}/${yn(row.nanoReject)}/${yn(row.nanoOptions)}`,
      `${row.nanoAgreementAccept}/${row.nanoAgreementReject}/${row.nanoAgreementOptions}`,
      escapeCell(row.verification),
      escapeCell(row.limitations.join("; ") || "-"),
    ];
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return `${lines.join("\n")}\n`;
}

function metricsMarkdown(metrics: AdjudicationMetrics): string {
  const lines = [
    "# Consent Geometry Adjudication Metrics",
    "",
    "| Dimension | Labeled | Precision | Recall | TP | FP | FN | TN |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    ...metrics.metrics.map((row) =>
      `| ${row.dimension} | ${row.labeledCount} | ${formatMetric(row.precision)} | ${formatMetric(row.recall)} | ${row.truePositive} | ${row.falsePositive} | ${row.falseNegative} | ${row.trueNegative} |`
    ),
    "",
    "## Disagreements",
    "",
  ];
  if (metrics.disagreements.length === 0) {
    lines.push("No disagreements for filled human adjudication fields.");
  } else {
    lines.push("| Site | Dimension | Scanner | Human | Screenshot | Nano | Geometry |");
    lines.push("|---|---|---:|---:|---|---|---|");
    for (const row of metrics.disagreements) {
      lines.push(`| ${escapeCell(row.site)} | ${row.dimension} | ${yn(row.scannerValue)} | ${yn(row.humanValue)} | ${row.screenshotPath ? linkCell("screenshot", row.screenshotPath) : "-"} | ${row.nanoReviewPath ? linkCell("nano", row.nanoReviewPath) : "-"} | ${row.geometryArtifactPath ? linkCell("geometry", row.geometryArtifactPath) : "-"} |`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--artifacts" && value) {
      parsed.artifacts = value;
      index += 1;
    }
  }
  return parsed;
}

async function readHumanRows(filePath: string): Promise<HumanCsvRow[]> {
  if (!await exists(filePath)) {
    return [];
  }
  return parseCsv(await readFile(filePath, "utf8"));
}

function parseCsv(content: string): HumanCsvRow[] {
  const rows = parseCsvRecords(content).filter((row) => row.some((cell) => cell.trim()));
  const headers = rows.shift()?.map((header) => header.trim()) ?? [];
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function parseCsvRecords(content: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];
    if (quoted) {
      if (character === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (character === "\"") {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === "\"") {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    records.push(row);
  }
  return records;
}

function csvFor(rows: HumanCsvRow[]): string {
  return [
    HUMAN_CSV_COLUMNS.join(","),
    ...rows.map((row) => HUMAN_CSV_COLUMNS.map((column) => csvCell(row[column] ?? "")).join(",")),
  ].join("\n") + "\n";
}

async function readJsonIfExists<T>(filePath: string): Promise<T | undefined> {
  if (!await exists(filePath)) {
    return undefined;
  }
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function exists(filePath: string): Promise<boolean> {
  return stat(filePath).then(() => true, () => false);
}

function hasAnyHumanValue(row: HumanCsvRow): boolean {
  return Boolean(
    row.human_no_go?.trim() ||
    row.human_accept?.trim() ||
    row.human_reject?.trim() ||
    row.human_options?.trim()
  );
}

function humanBool(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (["yes", "true", "1", "y"].includes(normalized)) {
    return true;
  }
  if (["no", "false", "0", "n"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 1000) / 1000;
}

function formatMetric(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(3);
}

function yn(value: boolean | "unavailable" | "not_reviewed" | "uncertain"): string {
  if (value === "unavailable") {
    return "n/a";
  }
  if (value === "not_reviewed") {
    return "not reviewed";
  }
  if (value === "uncertain") {
    return "uncertain";
  }
  return value ? "yes" : "no";
}

function siteKey(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function safeSiteSlug(value: string): string {
  try {
    const url = new URL(value);
    return url.hostname.replace(/[^a-z0-9.-]+/gi, "_");
  } catch {
    return value.replace(/[^a-z0-9.-]+/gi, "_").slice(0, 80);
  }
}

function linkCell(label: string, filePath: string): string {
  return `[${label}](${filePath.replace(/\)/g, "%29")})`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "/").replace(/\n/g, " ");
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, "\"\"")}"` : value;
}
