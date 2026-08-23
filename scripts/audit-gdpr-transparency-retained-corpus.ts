import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type JsonObject = Record<string, unknown>;

const TOPIC_ROWS = [
  "controller_contact_disclosure",
  "processing_purposes_disclosure",
  "legal_basis_disclosure_observed",
  "recipients_vendor_categories_disclosure",
  "retention_disclosure_observed",
  "data_subject_rights_disclosure",
  "international_transfers_disclosure",
  "dpo_contact_point_disclosure",
  "supervisory_authority_complaint_disclosure",
  "privacy_notice_availability",
] as const;

type TopicRow = (typeof TOPIC_ROWS)[number];
type Counter = Record<string, number>;

const CANDIDATE_TO_ROW: Record<string, TopicRow> = {
  controller_contact: "controller_contact_disclosure",
  processing_purposes: "processing_purposes_disclosure",
  legal_basis: "legal_basis_disclosure_observed",
  recipients_or_vendor_categories: "recipients_vendor_categories_disclosure",
  data_retention: "retention_disclosure_observed",
  data_subject_rights: "data_subject_rights_disclosure",
  international_transfers: "international_transfers_disclosure",
  dpo_contact: "dpo_contact_point_disclosure",
  supervisory_authority: "supervisory_authority_complaint_disclosure",
};

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function increment(counter: Counter, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

function csvCell(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0] ?? {});
  return [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\n") + "\n";
}

function host(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function policyRelationship(scanDomain: string | null, policyUrl: string | null): string {
  const scanHost = host(scanDomain?.includes("://") ? scanDomain : scanDomain ? `https://${scanDomain}` : null);
  const policyHost = host(policyUrl);
  if (!scanHost || !policyHost) return "unknown";
  if (policyHost === scanHost || policyHost.endsWith(`.${scanHost}`) || scanHost.endsWith(`.${policyHost}`)) {
    return "first_party_or_subdomain";
  }
  return "external_host_review_required";
}

function policyQuality(rows: Array<JsonObject>): string {
  const note = rows.map((row) => string(row.note) ?? "").join(" ").toLowerCase();
  if (rows.some((row) => row.status === "Not testable") && /no privacy-policy surface|no privacy.policy surface was discovered/.test(note)) {
    return "no_policy_surface";
  }
  if (/fetch failed|fetch_failed|policy surface was discovered, but the fetch failed/.test(note)) return "document_fetch_failure";
  if (/not_attempted/.test(note)) return "extraction_not_attempted";
  if (/low_quality|code_or_config/.test(note)) return "low_quality_extraction";
  if (/thin|not enough usable policy text/.test(note)) return "thin_extraction";
  if (rows.some((row) => row.status === "Observed")) return "usable_topic_evidence";
  if (rows.some((row) => row.status === "Not confirmed" || row.status === "Review signal")) return "surface_without_topic_confirmation";
  return "unclassified";
}

function scanRegion(report: JsonObject): string {
  const calibrationContext = object(report.calibrationContext);
  const meta = object(report.meta);
  const diagnostics = object(report.coverageDiagnostics);
  return string(calibrationContext.scannerRegion) ?? string(meta.region) ?? string(meta.scanRegion) ?? string(diagnostics.region) ?? string(diagnostics.scanRegion) ?? "unknown";
}

function topicLocale(report: JsonObject): string {
  const calibrationContext = object(report.calibrationContext);
  const primaryLanguage = object(calibrationContext.primaryLanguage);
  const projectedLocale = string(primaryLanguage.locale);
  if (projectedLocale) return projectedLocale;
  const projectedCandidates = array(object(calibrationContext.gdprTransparencyTopicCandidates).items);
  const candidateLocale = projectedCandidates.map((candidate) => string(object(candidate).matchedLocale)).find((value): value is string => Boolean(value));
  if (candidateLocale) return candidateLocale;
  const surfaces = array(object(report.policySurfaceEvidence).items);
  const candidates = surfaces.flatMap((surface) => array(object(surface).gdprTransparencyTopicCandidates));
  const locales = candidates.map((candidate) => string(object(candidate).matchedLocale)).filter((value): value is string => Boolean(value));
  return locales[0] ?? "unknown";
}

async function main(): Promise<void> {
  const inputDir = path.resolve(process.argv[process.argv.indexOf("--input") + 1] ?? "/Volumes/miniben/CertScore/evidence");
  const outDir = path.resolve(process.argv[process.argv.indexOf("--out") + 1] ?? `artifacts/gdpr-transparency-retained-audit-${new Date().toISOString().replaceAll(/[:.]/g, "")}`);
  const entries = (await readdir(inputDir)).filter((name) => name.endsWith(".json"));
  const screenshotCount = (await readdir(inputDir)).filter((name) => name.endsWith(".png")).length;
  const seen = new Set<string>();
  const duplicateScanIds = new Set<string>();
  const rowCounts: Record<TopicRow, Counter> = Object.fromEntries(TOPIC_ROWS.map((row) => [row, {}])) as Record<TopicRow, Counter>;
  const candidateCounts: Counter = {};
  const candidateProjectionMismatches: Counter = {};
  const firstBrokenPipelineStage: Counter = {};
  const strata: Record<string, Counter> = {
    scanStatus: {},
    policyQuality: {},
    policyRelationship: {},
    region: {},
    matchedLocale: {},
    cmp: {},
  };
  const cohortRows: Array<Record<string, unknown>> = [];
  const disagreementQueue: Array<Record<string, unknown>> = [];
  let invalidJson = 0;
  let pairedScreenshots = 0;
  let scansWithCalibrationContext = 0;
  let scansWithCandidateSummary = 0;

  for (const name of entries) {
    let report: JsonObject;
    try {
      report = JSON.parse(await readFile(path.join(inputDir, name), "utf8")) as JsonObject;
    } catch {
      invalidJson += 1;
      continue;
    }
    const scanId = string(report.scanId) ?? string(report.scan_id);
    if (!scanId || !Array.isArray(object(report.gdprEprivacyChecklistRows).items)) continue;
    if (seen.has(scanId)) {
      duplicateScanIds.add(scanId);
      continue;
    }
    seen.add(scanId);

    const checklistRows = array(object(report.gdprEprivacyChecklistRows).items).map(object);
    const byId = new Map(checklistRows.map((row) => [string(row.id), row]));
    const scanStatus = string(report.scanStatus) ?? "unknown";
    const domain = string(report.domain) ?? "unknown";
    const policyRows = array(object(report.policySurfaceCoverage).items).map(object);
    const policyUrl = string(policyRows.find((row) => string(row.url))?.url);
    const quality = policyQuality(checklistRows.filter((row) => TOPIC_ROWS.includes(string(row.id) as TopicRow)));
    const relationship = policyRelationship(domain, policyUrl);
    const region = scanRegion(report);
    const locale = topicLocale(report);
    const candidateItems = array(object(object(report.calibrationContext).gdprTransparencyTopicCandidates).items)
      .map(object)
      .filter((candidate) => string(candidate.topic));
    if (Object.keys(object(report.calibrationContext)).length > 0) scansWithCalibrationContext += 1;
    if (candidateItems.length > 0) scansWithCandidateSummary += 1;
    const cmp = string(object(object(report.coverageDiagnostics).accessPosture).cmpVendorName) ??
      string(object(report.executiveSummary).consentPlatform) ?? "unknown";
    const screenshotPath = path.join(inputDir, `${name.slice(0, -5)}.png`);
    let hasScreenshot = false;
    try {
      await stat(screenshotPath);
      hasScreenshot = true;
      pairedScreenshots += 1;
    } catch {
      // JSON-only retained evidence is valid but is not eligible for screenshot review.
    }

    increment(strata.scanStatus, scanStatus);
    increment(strata.policyQuality, quality);
    increment(strata.policyRelationship, relationship);
    increment(strata.region, region);
    increment(strata.matchedLocale, locale);
    increment(strata.cmp, cmp);
    for (const rowId of TOPIC_ROWS) increment(rowCounts[rowId], string(byId.get(rowId)?.status) ?? "Unavailable");
    for (const candidate of candidateItems) {
      const topic = string(candidate.topic) ?? "unknown";
      increment(candidateCounts, topic);
      const rowId = CANDIDATE_TO_ROW[topic];
      const status = rowId ? string(byId.get(rowId)?.status) ?? "Unavailable" : null;
      if (
        candidate.productionCredit === true &&
        quality === "usable_topic_evidence" &&
        rowId &&
        status !== "Observed" &&
        status !== "Review signal"
      ) {
        increment(candidateProjectionMismatches, topic);
      }
    }
    if (quality === "no_policy_surface") increment(firstBrokenPipelineStage, "observed_evidence.policy_surface_discovery");
    else if (quality === "document_fetch_failure") increment(firstBrokenPipelineStage, "observed_evidence.policy_document_fetch");
    else if (quality === "thin_extraction" || quality === "low_quality_extraction" || quality === "extraction_not_attempted") {
      increment(firstBrokenPipelineStage, "observed_evidence.policy_text_quality_or_extraction");
    }
    if (candidateItems.some((candidate) => {
      const rowId = CANDIDATE_TO_ROW[string(candidate.topic) ?? ""];
      const status = rowId ? string(byId.get(rowId)?.status) ?? "Unavailable" : "Observed";
      return Boolean(
        candidate.productionCredit === true &&
        quality === "usable_topic_evidence" &&
        rowId &&
        status !== "Observed" &&
        status !== "Review signal"
      );
    })) {
      increment(firstBrokenPipelineStage, "post_classifier.normalized_concern_policy_or_projection");
    }

    const rowStatusSummary = Object.fromEntries(TOPIC_ROWS.map((rowId) => [rowId, string(byId.get(rowId)?.status) ?? "Unavailable"]));
    cohortRows.push({ scanId, domain, scanStatus, policyQuality: quality, policyRelationship: relationship, matchedLocale: locale, region, cmp, candidateCount: candidateItems.length, candidateTopics: candidateItems.map((candidate) => string(candidate.topic)).filter(Boolean).join("|"), hasScreenshot, ...rowStatusSummary });
    if (hasScreenshot && (quality !== "usable_topic_evidence" || Object.values(rowStatusSummary).some((status) => status === "Not confirmed" || status === "Review signal"))) {
      disagreementQueue.push({ scanId, domain, json: path.join(inputDir, name), screenshot: screenshotPath, policyQuality: quality, policyRelationship: relationship, rowStatusSummary });
    }
  }

  await mkdir(outDir, { recursive: true });
  const summary = {
    reportVersion: "certscore.gdpr_transparency_retained_corpus_audit.1",
    generatedAt: new Date().toISOString(),
    guardrails: [
      "Offline diagnostic artifact only; it does not create, promote, suppress, or persist findings.",
      "Not testable and Not confirmed remain distinct from genuine disclosure absence.",
      "Any production fix must follow observed evidence -> typed contract -> normalized concern -> concern policy -> unified projection.",
      "Screenshot/JSON disagreement rows are review candidates, not benchmark truth.",
    ],
    inventory: {
      inputJsonFiles: entries.length,
      inputPngFiles: screenshotCount,
      invalidJson,
      uniqueScans: seen.size,
      duplicateScanIds: duplicateScanIds.size,
      pairedScreenshots,
      screenshotLinkage: pairedScreenshots > 0 ? "filename_or_report_linkage_available" : "no_filename_or_report_linkage_retained",
      calibrationContextCoverage: seen.size > 0 ? scansWithCalibrationContext / seen.size : 0,
      candidateSummaryCoverage: seen.size > 0 ? scansWithCandidateSummary / seen.size : 0,
      postProjectionSampleReady: seen.size > 0 && scansWithCalibrationContext === seen.size && scansWithCandidateSummary > 0,
    },
    denominators: { allRetainedScans: seen.size, completed: strata.scanStatus.completed ?? 0, completedLimited: strata.scanStatus.completed_limited ?? 0 },
    rowCounts,
    candidateDiagnostics: {
      candidateCounts,
      candidateProjectionMismatches,
      firstBrokenPipelineStage,
      interpretation: "A production-credit candidate with a non-Observed/non-Review signal row indicates a post-adapter loss candidate; rejected diagnostic candidates are not projection mismatches.",
    },
    strata,
    reviewQueue: { screenshotJsonDisagreementCandidates: disagreementQueue.length },
  };
  await Promise.all([
    writeFile(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`),
    writeFile(path.join(outDir, "cohort.csv"), csv(cohortRows)),
    writeFile(path.join(outDir, "screenshot-json-disagreement-queue.json"), `${JSON.stringify(disagreementQueue, null, 2)}\n`),
  ]);
  console.log(JSON.stringify({ outDir, uniqueScans: seen.size, pairedScreenshots, disagreementCandidates: disagreementQueue.length }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
