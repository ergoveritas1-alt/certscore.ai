import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessPolicyDocumentSubstance,
  assessPolicyDocumentUsefulness,
  hasExplicitProviderPolicyLinkContext,
} from "@certscore/scan-core";

type JsonRecord = Record<string, unknown>;

export type PrivacyPolicyCalibrationSite = {
  captured: boolean;
  completed: boolean;
  documentFetchFailed: boolean;
  documentFetchSkippedBudget: boolean;
  domain: string;
  evidenceIntegrityValid: boolean;
  observedLink: boolean;
  noGo: boolean;
  policyInspectionOutcome: string | null;
  policyModuleDurationMs: number | null;
  policyModuleStatus: string | null;
  scanDurationMs: number | null;
  sourcePath: string;
};

export type PrivacyPolicyExpectation = {
  domain: string;
  evidence: string;
  privacyPolicyExpected: boolean;
};

export type PrivacyPolicyCalibrationThresholds = {
  maxFalseNegativeRate: number;
  maxMedianLatencyDeltaMs: number;
  maxP95LatencyDeltaMs: number;
  minCaptureRate: number;
  minReviewedExpectedPresent: number;
  minSites: number;
};

type Args = {
  baselineDir: string;
  candidateDir: string;
  expectationsPath: string;
  outDir: string;
  thresholds: PrivacyPolicyCalibrationThresholds;
};

const DEFAULT_THRESHOLDS: PrivacyPolicyCalibrationThresholds = {
  maxFalseNegativeRate: 0.03,
  maxMedianLatencyDeltaMs: 1_000,
  maxP95LatencyDeltaMs: 5_000,
  minCaptureRate: 0.83,
  minReviewedExpectedPresent: 15,
  minSites: 30,
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function canonicalDomain(value: string): string {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return value.replace(/^www\./i, "").toLowerCase();
  }
}

function observationHasSubstantiveDocumentEvidence(observation: JsonRecord): boolean {
  const text = asString(observation.textExcerpt);
  return Boolean(
    text ||
    asArray(observation.observedTopics).length > 0 ||
    asArray(observation.article13DisclosureSignals).length > 0 ||
    asArray(observation.retainedPolicySections).length > 0 ||
    asArray(observation.retainedArticle13SectionEvidence).length > 0
  );
}

function observationIsUsefulPolicyCapture(observation: JsonRecord): boolean {
  if (!observationHasSubstantiveDocumentEvidence(observation)) return false;
  const text = [
    asString(observation.title),
    asString(observation.textExcerpt),
    ...asArray(observation.retainedPolicySections).map((section) =>
      asString(asRecord(section).textExcerpt)
    ),
  ].filter((value): value is string => Boolean(value)).join("\n");
  const substance = assessPolicyDocumentSubstance({
    surfaceType: "privacy_policy",
    title: asString(observation.title) ?? undefined,
    text,
  });
  const usefulness = assessPolicyDocumentUsefulness({
    surfaceType: "privacy_policy",
    title: asString(observation.title) ?? undefined,
    text,
    targetRelationship: asString(observation.targetRelationship) as
      | "target_controller"
      | "first_party_brand"
      | "service_provider"
      | "unrelated"
      | "unknown"
      | undefined,
    ownershipConfidence: asNumber(observation.ownershipConfidence) ?? undefined,
    observedTopicCount: asArray(observation.observedTopics).length,
    gdprTransparencyTopicCandidateCount: asArray(observation.gdprTransparencyTopicCandidates).length,
    documentSubstanceMatchesExpectedSurface: substance.matchesExpectedSurface,
    providerLinkContextObserved: hasExplicitProviderPolicyLinkContext({
      documentUrl: asString(observation.normalizedUrl) ?? asString(observation.url) ?? undefined,
      linkText: asString(observation.linkText) ?? undefined,
      surroundingText: asString(observation.surroundingTextExcerpt) ?? undefined,
    }),
  });
  return substance.matchesExpectedSurface && usefulness.documentEvaluationState === "usable";
}

function observationIsObservedLink(observation: JsonRecord): boolean {
  if (observation.linkObservationState === "observed") return true;
  const discoveryMethod = asString(observation.discoveryMethod);
  const status = asString(observation.status);
  return discoveryMethod !== "guessed_common_path" &&
    ["footer_link", "header_link", "page_text_link", "deterministic_keyword_match"].includes(discoveryMethod ?? "") &&
    ["observed", "fetched", "failed", "skipped_budget"].includes(status ?? "");
}

function observationDocumentFetchState(observation: JsonRecord): string | null {
  const typedState = asString(observation.documentFetchState);
  if (typedState) return typedState;
  const status = asString(observation.status);
  if (status === "fetched") return "fetched";
  if (status === "failed") return "failed";
  if (status === "skipped_budget") return "skipped_budget";
  return "not_attempted";
}

export function summarizePrivacyPolicyCalibrationBundle(
  bundleValue: unknown,
  sourcePath = "fixture",
): PrivacyPolicyCalibrationSite {
  const bundle = asRecord(bundleValue);
  const normalizedUrl = asString(bundle.normalizedUrl) ?? asString(bundle.url) ?? "unknown";
  const policyObservations = asArray(bundle.policySurfaceObservations)
    .map(asRecord)
    .filter((observation) => observation.surfaceType === "privacy_policy");
  const observedLink = policyObservations.some(observationIsObservedLink);
  const fetchedPrivacyObservations = policyObservations.filter((observation) =>
    observationDocumentFetchState(observation) === "fetched"
  );
  const captured = fetchedPrivacyObservations.some(observationIsUsefulPolicyCapture);
  const evidenceIntegrityValid = fetchedPrivacyObservations.length === 0 ||
    fetchedPrivacyObservations.every(observationHasSubstantiveDocumentEvidence);
  const documentFetchFailed = policyObservations.some((observation) =>
    observationDocumentFetchState(observation) === "failed"
  );
  const documentFetchSkippedBudget = policyObservations.some((observation) =>
    observationDocumentFetchState(observation) === "skipped_budget"
  );
  const moduleRuns = asArray(bundle.modulesRun).map(asRecord);
  const policyRun = moduleRuns.find((moduleRun) => moduleRun.moduleName === "policySurfaceScanner");
  const noGoAssessment = asRecord(bundle.scanNoGoAssessment ?? bundle.scan_no_go_assessment);
  const runtimeCoverage = asRecord(bundle.runtimeCoverage);
  const inspection = asRecord(bundle.policySurfaceInspection);
  const startedAt = asString(bundle.startedAt);
  const completedAt = asString(bundle.completedAt);
  const parsedStartedAt = startedAt ? Date.parse(startedAt) : Number.NaN;
  const parsedCompletedAt = completedAt ? Date.parse(completedAt) : Number.NaN;
  const scanDurationMs = Number.isFinite(parsedStartedAt) && Number.isFinite(parsedCompletedAt)
    ? Math.max(0, parsedCompletedAt - parsedStartedAt)
    : null;

  return {
    captured,
    completed: Boolean(completedAt),
    documentFetchFailed,
    documentFetchSkippedBudget,
    domain: canonicalDomain(normalizedUrl),
    evidenceIntegrityValid,
    noGo: noGoAssessment.decision === "no_go" || runtimeCoverage.coverageStatus === "limited_none",
    observedLink,
    policyInspectionOutcome: asString(inspection.outcome),
    policyModuleDurationMs: asNumber(policyRun?.durationMs),
    policyModuleStatus: asString(policyRun?.status),
    scanDurationMs,
    sourcePath,
  };
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileValue * sorted.length) - 1));
  return sorted[index] ?? null;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function evaluatePrivacyPolicyCalibration(input: {
  baseline: PrivacyPolicyCalibrationSite[];
  candidate: PrivacyPolicyCalibrationSite[];
  expectations: PrivacyPolicyExpectation[];
  thresholds?: Partial<PrivacyPolicyCalibrationThresholds>;
}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  const candidateEligible = input.candidate.filter((site) => site.completed && !site.noGo);
  const baselineEligible = input.baseline.filter((site) => site.completed && !site.noGo);
  const expectationByDomain = new Map(input.expectations.map((row) => [canonicalDomain(row.domain), row]));
  const reviewedExpectedPresent = candidateEligible.filter((site) =>
    expectationByDomain.get(site.domain)?.privacyPolicyExpected === true
  );
  const falseNegatives = reviewedExpectedPresent.filter((site) => !site.captured);
  const candidateScanDurations = candidateEligible.flatMap((site) => site.scanDurationMs === null ? [] : [site.scanDurationMs]);
  const baselineScanDurations = baselineEligible.flatMap((site) => site.scanDurationMs === null ? [] : [site.scanDurationMs]);
  const baselineDurationByDomain = new Map(
    baselineEligible.flatMap((site) => site.scanDurationMs === null ? [] : [[site.domain, site.scanDurationMs] as const]),
  );
  const pairedLatencyDeltas = candidateEligible.flatMap((site) => {
    const baselineDuration = baselineDurationByDomain.get(site.domain);
    return site.scanDurationMs === null || baselineDuration === undefined
      ? []
      : [site.scanDurationMs - baselineDuration];
  });
  const candidateMedian = percentile(candidateScanDurations, 0.5);
  const baselineMedian = percentile(baselineScanDurations, 0.5);
  const candidateP95 = percentile(candidateScanDurations, 0.95);
  const baselineP95 = percentile(baselineScanDurations, 0.95);
  const latencyComparisonMethod = pairedLatencyDeltas.length >= thresholds.minSites
    ? "paired_domains"
    : "composition_matched_cohorts";
  const medianDeltaMs = latencyComparisonMethod === "paired_domains"
    ? percentile(pairedLatencyDeltas, 0.5)
    : candidateMedian !== null && baselineMedian !== null ? candidateMedian - baselineMedian : null;
  const p95DeltaMs = latencyComparisonMethod === "paired_domains"
    ? percentile(pairedLatencyDeltas, 0.95)
    : candidateP95 !== null && baselineP95 !== null ? candidateP95 - baselineP95 : null;
  const captureRate = rate(candidateEligible.filter((site) => site.captured).length, candidateEligible.length);
  const observedLinkRate = rate(candidateEligible.filter((site) => site.observedLink).length, candidateEligible.length);
  const falseNegativeRate = rate(falseNegatives.length, reviewedExpectedPresent.length);
  const checks = [
    check("candidate_site_count", candidateEligible.length >= thresholds.minSites, candidateEligible.length, `>= ${thresholds.minSites}`),
    check("baseline_site_count", baselineEligible.length >= thresholds.minSites, baselineEligible.length, `>= ${thresholds.minSites}`),
    check("privacy_policy_capture_rate", captureRate !== null && captureRate >= thresholds.minCaptureRate, captureRate, `>= ${thresholds.minCaptureRate}`),
    check("reviewed_expected_policy_sites", reviewedExpectedPresent.length >= thresholds.minReviewedExpectedPresent, reviewedExpectedPresent.length, `>= ${thresholds.minReviewedExpectedPresent}`),
    check("reviewed_false_negative_rate", falseNegativeRate !== null && falseNegativeRate <= thresholds.maxFalseNegativeRate, falseNegativeRate, `<= ${thresholds.maxFalseNegativeRate}`),
    check("captured_evidence_integrity", candidateEligible.every((site) => site.evidenceIntegrityValid), candidateEligible.filter((site) => !site.evidenceIntegrityValid).length, 0),
    check("median_scan_latency_delta_ms", medianDeltaMs !== null && medianDeltaMs <= thresholds.maxMedianLatencyDeltaMs, medianDeltaMs, `<= ${thresholds.maxMedianLatencyDeltaMs}`),
    check("p95_scan_latency_delta_ms", p95DeltaMs !== null && p95DeltaMs <= thresholds.maxP95LatencyDeltaMs, p95DeltaMs, `<= ${thresholds.maxP95LatencyDeltaMs}`),
  ];

  return {
    calibrationVersion: "privacy_policy_capture_calibration.1",
    generatedAt: new Date().toISOString(),
    overallStatus: checks.every((row) => row.passed) ? "passed" : "failed",
    thresholds,
    metrics: {
      baselineEligibleSites: baselineEligible.length,
      baselineMedianScanDurationMs: baselineMedian,
      baselineP95ScanDurationMs: baselineP95,
      candidateCapturedPolicies: candidateEligible.filter((site) => site.captured).length,
      candidateDocumentFetchFailed: candidateEligible.filter((site) => site.documentFetchFailed).length,
      candidateDocumentFetchSkippedBudget: candidateEligible.filter((site) => site.documentFetchSkippedBudget).length,
      candidateEligibleSites: candidateEligible.length,
      candidateMedianScanDurationMs: candidateMedian,
      candidateP95ScanDurationMs: candidateP95,
      captureRate,
      falseNegativeRate,
      falseNegatives: falseNegatives.map((site) => site.domain),
      latencyComparisonMethod,
      medianLatencyDeltaMs: medianDeltaMs,
      observedLinkRate,
      observedPolicyLinks: candidateEligible.filter((site) => site.observedLink).length,
      pairedLatencySites: pairedLatencyDeltas.length,
      p95LatencyDeltaMs: p95DeltaMs,
      reviewedExpectedPresent: reviewedExpectedPresent.length,
    },
    checks,
    candidateSites: candidateEligible,
    guardrails: [
      "Only completed, normally reached sites are included in capture and latency denominators.",
      "A captured policy requires retained substantive evidence and a privacy semantic signal; URL guesses and strongly contextualized provider-only documents receive no credit, while ambiguous cross-domain parent-brand cases remain reviewable.",
      "Observed links, document retrieval, and usable policy content are measured as separate funnel stages.",
      "False-negative measurement requires an explicit reviewed expectation with supporting evidence.",
      "Latency uses per-domain deltas when enough paired artifacts exist; otherwise baseline and candidate cohorts must be composition-matched.",
      "This verifier reads artifacts only and does not contact public sites or alter production findings.",
    ],
  };
}

function check(name: string, passed: boolean, actual: unknown, expected: unknown) {
  return { name, passed, actual, expected };
}

async function findBundles(root: string): Promise<string[]> {
  const results: string[] = [];
  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile() && entry.name === "CanonicalEvidenceBundle.json") results.push(fullPath);
    }
  }
  await visit(root);
  return results.sort();
}

async function readSites(root: string): Promise<PrivacyPolicyCalibrationSite[]> {
  const paths = await findBundles(root);
  return Promise.all(paths.map(async (bundlePath) =>
    summarizePrivacyPolicyCalibrationBundle(JSON.parse(await readFile(bundlePath, "utf8")), bundlePath)
  ));
}

async function readExpectations(expectationsPath: string): Promise<PrivacyPolicyExpectation[]> {
  const value = JSON.parse(await readFile(expectationsPath, "utf8"));
  const rows = asArray(asRecord(value).sites).map(asRecord);
  return rows.map((row) => ({
    domain: asString(row.domain) ?? "",
    evidence: asString(row.evidence) ?? "",
    privacyPolicyExpected: row.privacyPolicyExpected === true,
  })).filter((row) => row.domain && row.evidence);
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error("Arguments must be provided as --name value pairs.");
    values.set(key.slice(2), value);
  }
  const candidateDir = values.get("candidate-dir");
  const baselineDir = values.get("baseline-dir");
  const expectationsPath = values.get("expectations");
  if (!candidateDir || !baselineDir || !expectationsPath) {
    throw new Error("Required: --candidate-dir, --baseline-dir, and --expectations.");
  }
  return {
    candidateDir,
    baselineDir,
    expectationsPath,
    outDir: values.get("out-dir") ?? candidateDir,
    thresholds: {
      minSites: numericArg(values, "min-sites", DEFAULT_THRESHOLDS.minSites),
      minCaptureRate: numericArg(values, "min-capture-rate", DEFAULT_THRESHOLDS.minCaptureRate),
      minReviewedExpectedPresent: numericArg(values, "min-reviewed-expected-present", DEFAULT_THRESHOLDS.minReviewedExpectedPresent),
      maxFalseNegativeRate: numericArg(values, "max-false-negative-rate", DEFAULT_THRESHOLDS.maxFalseNegativeRate),
      maxMedianLatencyDeltaMs: numericArg(values, "max-median-latency-delta-ms", DEFAULT_THRESHOLDS.maxMedianLatencyDeltaMs),
      maxP95LatencyDeltaMs: numericArg(values, "max-p95-latency-delta-ms", DEFAULT_THRESHOLDS.maxP95LatencyDeltaMs),
    },
  };
}

function numericArg(values: Map<string, string>, key: string, fallback: number): number {
  const raw = values.get(key);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid --${key}: ${raw}`);
  if ((key.includes("rate") || key.includes("capture")) && parsed > 1) {
    throw new Error(`Invalid --${key}: expected a value between 0 and 1.`);
  }
  return parsed;
}

function renderMarkdown(report: ReturnType<typeof evaluatePrivacyPolicyCalibration>): string {
  return [
    "# Privacy-policy capture calibration",
    "",
    `Overall: **${report.overallStatus.toUpperCase()}**`,
    "",
    `- Capture rate: ${report.metrics.captureRate === null ? "n/a" : `${(report.metrics.captureRate * 100).toFixed(1)}%`}`,
    `- Observed-link rate: ${report.metrics.observedLinkRate === null ? "n/a" : `${(report.metrics.observedLinkRate * 100).toFixed(1)}%`}`,
    `- Document fetch failures: ${report.metrics.candidateDocumentFetchFailed}`,
    `- Document fetches skipped for budget: ${report.metrics.candidateDocumentFetchSkippedBudget}`,
    `- Reviewed false-negative rate: ${report.metrics.falseNegativeRate === null ? "n/a" : `${(report.metrics.falseNegativeRate * 100).toFixed(1)}%`}`,
    `- Median scan latency delta: ${report.metrics.medianLatencyDeltaMs ?? "n/a"} ms`,
    `- P95 scan latency delta: ${report.metrics.p95LatencyDeltaMs ?? "n/a"} ms`,
    "",
    "## Checks",
    "",
    ...report.checks.map((row) => `- ${row.passed ? "PASS" : "FAIL"} — ${row.name}: ${JSON.stringify(row.actual)} (expected ${row.expected})`),
    "",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const requiredPath of [args.candidateDir, args.baselineDir, args.expectationsPath]) {
    if (!existsSync(requiredPath)) throw new Error(`Path does not exist: ${requiredPath}`);
  }
  const [candidate, baseline, expectations] = await Promise.all([
    readSites(args.candidateDir),
    readSites(args.baselineDir),
    readExpectations(args.expectationsPath),
  ]);
  const report = evaluatePrivacyPolicyCalibration({ candidate, baseline, expectations, thresholds: args.thresholds });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(path.join(args.outDir, "PrivacyPolicyCaptureCalibration.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(args.outDir, "PrivacyPolicyCaptureCalibration.md"), renderMarkdown(report));
  console.log(`Privacy-policy capture calibration: ${report.overallStatus}`);
  if (report.overallStatus !== "passed") process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
