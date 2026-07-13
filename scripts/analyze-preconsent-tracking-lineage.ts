import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

type JsonObject = Record<string, unknown>;

type TrackerRow = {
  category: string;
  firstSeenMs: number | null;
  label: string;
  party: string;
};

type LineageRow = {
  checklistAssessmentStatus: string;
  checklistEvidenceLabel: string;
  checklistStatus: string;
  domain: string;
  firstSeenMs: number | null;
  likelyFirstDivergence: string;
  matchedControlScanIds: string[];
  projectionWarnings: string[];
  regulatoryWrapperConfidence: string;
  regulatoryWrapperCriticality: string;
  regulatoryWrapperPresent: boolean;
  scanId: string;
  scanStatus: string;
  schemaVersion: string;
  surfacedPacketCount: number;
  trackerCategories: string[];
  trackerCount: number;
  trackerParties: string[];
  trackerVendors: string[];
  unifiedExampleCount: number;
  unifiedExamplesShown: number;
  unifiedFindingPresent: boolean;
};

const RELEVANT_CATEGORIES = new Set([
  "advertising",
  "analytics",
  "fingerprinting",
  "marketing",
  "session_recording",
  "session_replay",
  "tracking"
]);

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function items(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const row = asObject(value);
  return Array.isArray(row?.items) ? row.items : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function normalizeCategory(value: unknown): string {
  return asString(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseTrackerRows(report: JsonObject): TrackerRow[] {
  return items(report.trackerRows)
    .map((entry): TrackerRow | null => {
      const row = asObject(entry);
      const category = normalizeCategory(row?.category ?? row?.vendorDisplayCategory);
      if (!row || row.preConsent !== true || !RELEVANT_CATEGORIES.has(category)) return null;
      return {
        category,
        firstSeenMs: typeof row.firstSeenMs === "number" ? row.firstSeenMs : null,
        label: asString(row.label, "Unknown tracker"),
        party: asString(row.party, "unknown")
      };
    })
    .filter((entry): entry is TrackerRow => entry !== null);
}

function finding(report: JsonObject, id: string): JsonObject | null {
  for (const entry of items(report.projectedFindings)) {
    const row = asObject(entry);
    if (row?.id === id) return row;
  }
  return null;
}

function checklistRow(report: JsonObject): JsonObject | null {
  for (const entry of items(report.gdprEprivacyChecklistRows)) {
    const row = asObject(entry);
    if (row?.id === "pre_consent_third_party_tracking") return row;
  }
  return null;
}

function getPublicProjection(report: JsonObject): JsonObject | null {
  return asObject(asObject(report.retainedEvidence)?.publicReportProjection) ?? asObject(report.publicReportProjection);
}

function csv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value: unknown) => {
    const raw = Array.isArray(value) ? value.join("|") : String(value ?? "");
    return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
  };
  return `${headers.map(escape).join(",")}\n${rows.map((row) => headers.map((header) => escape(row[header])).join(",")).join("\n")}\n`;
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(2));
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function matchedControls(target: LineageRow, controls: LineageRow[]): LineageRow[] {
  const targetVendors = new Set(target.trackerVendors);
  const targetCategories = new Set(target.trackerCategories);
  return controls
    .map((control) => {
      const sharedVendors = control.trackerVendors.filter((vendor) => targetVendors.has(vendor)).length;
      const sharedCategories = control.trackerCategories.filter((category) => targetCategories.has(category)).length;
      const directExamples = control.unifiedExamplesShown > 0 ? 1 : 0;
      const sameSchema = control.schemaVersion === target.schemaVersion ? 1 : 0;
      return { control, score: sharedVendors * 100 + sharedCategories * 10 + directExamples * 2 + sameSchema };
    })
    .filter((entry) => entry.score >= 10)
    .sort((left, right) => right.score - left.score || right.control.unifiedExamplesShown - left.control.unifiedExamplesShown)
    .slice(0, 3)
    .map((entry) => entry.control);
}

async function analyze(inputDir: string, outDir: string): Promise<void> {
  const rows: LineageRow[] = [];
  const parseFailures: Array<{ file: string; error: string }> = [];
  const names = (await readdir(inputDir)).filter((name) => name.endsWith(".json")).sort();

  for (const name of names) {
    try {
      const report = JSON.parse(await readFile(path.join(inputDir, name), "utf8")) as JsonObject;
      const scanId = asString(report.scanId ?? report.scan_id);
      const domain = asString(report.domain);
      if (!scanId || !domain) continue;
      const trackers = parseTrackerRows(report);
      if (trackers.length === 0) continue;
      const unified = finding(report, "pre_consent_tracking_detected");
      const wrapper = finding(report, "regulatory_gap__gdpr_eprivacy__pre_consent_third_party_tracking");
      const checklist = checklistRow(report);
      const unifiedDigest = asObject(unified?.evidenceDigest);
      const wrapperDigest = asObject(wrapper?.evidenceDigest);
      const projection = getPublicProjection(report);
      const unifiedPresent = unified !== null;
      const checklistStatus = asString(checklist?.status, "missing");
      rows.push({
        checklistAssessmentStatus: asString(checklist?.assessmentStatus, "missing"),
        checklistEvidenceLabel: asString(checklist?.evidenceLabel, "missing"),
        checklistStatus,
        domain,
        firstSeenMs: trackers.map((row) => row.firstSeenMs).filter((value): value is number => value !== null).sort((a, b) => a - b)[0] ?? null,
        likelyFirstDivergence: unifiedPresent
          ? "none_unified_finding_projected"
          : checklistStatus === "Gap observed"
            ? "tracker_inventory_coverage_fallback_promoted_as_gap_without_unified_finding"
            : "tracker_inventory_coverage_fallback_retained_as_review_without_unified_finding",
        matchedControlScanIds: [],
        projectionWarnings: stringArray(wrapperDigest?.projectionWarnings),
        regulatoryWrapperConfidence: asString(wrapper?.confidence, "missing"),
        regulatoryWrapperCriticality: asString(wrapper?.criticality, "missing"),
        regulatoryWrapperPresent: wrapper !== null,
        scanId,
        scanStatus: asString(report.scanStatus, "unknown"),
        schemaVersion: asString(asObject(report.meta)?.schemaVersion, "missing"),
        surfacedPacketCount: asNumber(projection?.surfacedPacketCount),
        trackerCategories: unique(trackers.map((row) => row.category)),
        trackerCount: trackers.length,
        trackerParties: unique(trackers.map((row) => row.party)),
        trackerVendors: unique(trackers.map((row) => row.label)),
        unifiedExampleCount: asNumber(unifiedDigest?.exampleCount),
        unifiedExamplesShown: asNumber(unifiedDigest?.examplesShown),
        unifiedFindingPresent: unifiedPresent
      });
    } catch (error) {
      parseFailures.push({ file: name, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const controls = rows.filter((row) => row.unifiedFindingPresent);
  const mismatches = rows.filter((row) => !row.unifiedFindingPresent);
  for (const mismatch of mismatches) {
    mismatch.matchedControlScanIds = matchedControls(mismatch, controls).map((control) => control.scanId);
  }
  const gapFallbacks = mismatches.filter((row) => row.checklistStatus === "Gap observed");
  const reviewFallbacks = mismatches.filter((row) => row.checklistStatus === "Review signal");
  const wrappersWithHighGood = mismatches.filter(
    (row) => row.regulatoryWrapperCriticality === "high" && row.regulatoryWrapperConfidence === "good"
  );
  const summary = {
    reportVersion: "wc01.preconsent_tracking_lineage_audit.1",
    generatedAt: new Date().toISOString(),
    input: { jsonFiles: names.length, parseFailures: parseFailures.length },
    population: {
      relevantPreconsentTrackerScans: rows.length,
      unifiedFindingPresent: controls.length,
      unifiedFindingPresentPercent: percentage(controls.length, rows.length),
      unifiedFindingAbsent: mismatches.length,
      unifiedFindingAbsentPercent: percentage(mismatches.length, rows.length)
    },
    absentUnifiedFindingCohort: {
      gapObservedCoverageFallback: gapFallbacks.length,
      reviewSignalCoverageFallback: reviewFallbacks.length,
      regulatoryWrapperPresent: mismatches.filter((row) => row.regulatoryWrapperPresent).length,
      wrapperMarkedHighCriticalityGoodConfidence: wrappersWithHighGood.length,
      schemas: Object.fromEntries(
        [...new Set(mismatches.map((row) => row.schemaVersion))]
          .sort()
          .map((version) => [version, mismatches.filter((row) => row.schemaVersion === version).length])
      )
    },
    conclusion: {
      firstDivergence: "gdpr_eprivacy checklist tracker-inventory coverage_fallback",
      finding:
        "The absent unified findings are an intentional dual-threshold outcome, not random loss: the checklist accepts grouped tracker inventory while the unified concern policy requires promotion-grade request/cookie evidence plus a retained timing sequence.",
      reliabilityRisk:
        "The high-priority fallback is then projected as a high-criticality, good-confidence regulatory finding, which can communicate stronger certainty than the unified evidence contract allows.",
      limitation:
        "Public exports do not retain enough raw request-classification and consent-timeline detail to identify which exact unified evidence gate failed for each scan."
    },
    guardrails: [
      "This audit does not create, upgrade, suppress, or persist findings.",
      "The results describe evidence-lineage calibration, not legal compliance.",
      "Any production change should align checklist fallback status with normalized concern policy rather than add a display-only exception."
    ],
    parseFailures
  };

  const selectedFixtures = [
    ...gapFallbacks.slice().sort((a, b) => b.trackerCount - a.trackerCount || a.domain.localeCompare(b.domain)).slice(0, 5),
    ...reviewFallbacks.slice().sort((a, b) => a.domain.localeCompare(b.domain)).slice(0, 3),
    ...controls.filter((row) => row.unifiedExamplesShown > 0).slice().sort((a, b) => b.unifiedExamplesShown - a.unifiedExamplesShown).slice(0, 4),
    ...controls.filter((row) => row.unifiedExamplesShown === 0).slice(0, 2)
  ].map((row) => ({
    category: row.unifiedFindingPresent
      ? row.unifiedExamplesShown > 0 ? "unified_with_direct_examples" : "unified_without_public_examples"
      : row.checklistStatus === "Gap observed" ? "gap_fallback_without_unified" : "review_fallback_without_unified",
    domain: row.domain,
    scanId: row.scanId,
    schemaVersion: row.schemaVersion,
    trackerCategories: row.trackerCategories,
    trackerVendors: row.trackerVendors,
    unifiedExamplesShown: row.unifiedExamplesShown
  }));

  const markdown = [
    "# Pre-consent tracking lineage audit",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    "## Outcome",
    "",
    `- ${rows.length} scans retained relevant structured pre-consent tracker inventory.`,
    `- ${controls.length} (${summary.population.unifiedFindingPresentPercent}%) also projected \`pre_consent_tracking_detected\`.`,
    `- ${mismatches.length} (${summary.population.unifiedFindingAbsentPercent}%) did not: ${gapFallbacks.length} became \`Gap observed\` through the checklist fallback and ${reviewFallbacks.length} became \`Review signal\`.`,
    `- ${wrappersWithHighGood.length} of those ${mismatches.length} fallback-only cases were still exported as high-criticality, good-confidence regulatory findings.`,
    "",
    "## First divergence",
    "",
    "The first divergence is the GDPR/ePrivacy checklist tracker-inventory `coverage_fallback`. It intentionally accepts grouped vendor/category/timing inventory when the unified finding does not satisfy its stricter promotion contract. The high-priority fallback then maps advertising inventory to `Gap observed`; medium inventory such as analytics maps to `Review signal`.",
    "",
    "This makes the corpus result a calibration issue, not a random missing-finding defect. The reliability risk is that fallback-only evidence can be presented with the same high criticality and good confidence as stronger projected evidence.",
    "",
    "## Recommended next change",
    "",
    "Keep fallback-only tracker inventory visible for review, but do not allow it to become `Gap observed` or a high-confidence regulatory finding unless the normalized concern policy's promotion-grade evidence contract passes. The correction belongs in checklist/concern policy alignment, not in display code.",
    "",
    "Before changing production behavior, retrieve bounded request-classification and consent-timeline diagnostics for the selected fixtures. Public exports intentionally omit enough raw detail that the exact failed gate cannot be attributed per scan from this corpus alone.",
    "",
    "## Regression fixture set",
    "",
    "See `fixture-candidates.csv` for fallback-only and unified controls selected from the corpus.",
    "",
    "This is an evidence-lineage audit, not a legal conclusion.",
    ""
  ].join("\n");

  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`),
    writeFile(path.join(outDir, "README.md"), markdown),
    writeFile(path.join(outDir, "preconsent-lineage.csv"), csv(rows as unknown as Array<Record<string, unknown>>)),
    writeFile(path.join(outDir, "fallback-only-cases.csv"), csv(mismatches as unknown as Array<Record<string, unknown>>)),
    writeFile(path.join(outDir, "fixture-candidates.csv"), csv(selectedFixtures))
  ]);
  console.log(JSON.stringify({ outDir, summary }, null, 2));
}

const inputDir = path.resolve(argValue("--input") ?? "artifacts/public-evidence-corpus-cache");
const outDir = path.resolve(argValue("--out") ?? "artifacts/preconsent-tracking-lineage-audit-current");

void analyze(inputDir, outDir).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
