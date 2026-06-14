import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CanonicalEvidenceBundle, ScanProfile } from "@certscore/contracts";
import { inspectBundle, type BundleInspectionReport } from "./inspector.js";
import { runScan } from "./index.js";

export interface CalibrationInput {
  profile: ScanProfile["profileId"];
  urls: string[];
  outDir: string;
  env?: Record<string, string | undefined>;
  scanner?: CalibrationScanner;
  now?: () => Date;
}

export type CalibrationScanner = (input: {
  url: string;
  profile: ScanProfile["profileId"];
  outDir: string;
}) => Promise<CanonicalEvidenceBundle>;

export interface CalibrationSummary {
  generatedAt: string;
  profile: ScanProfile["profileId"];
  urlCount: number;
  successCount: number;
  failureCount: number;
  results: CalibrationSiteSummary[];
}

export interface CalibrationSiteSummary {
  url: string;
  status: "completed" | "failed";
  outDir: string;
  failureReason?: string;
  scanId?: string;
  modulesRun: CalibrationModuleRunSummary[];
  nanoAssist: {
    policyAssistCount: number;
    policyUncertaintyCount: number;
    consentUiAssistCount: number;
    consentUiUncertaintyCount: number;
    failureOrEscalationCount: number;
  };
  consent: {
    controlsObservedByType: Record<string, number>;
    actionAttempts: BundleInspectionReport["consentFlowSummary"]["actionAttempts"];
    comparisons: BundleInspectionReport["consentFlowSummary"]["comparisons"];
    journeyPhaseDeltaCount: number;
    preferenceCenterTraversalCount: number;
    preferenceCenterOpenedCount: number;
    preferenceCenterSecondLayerObservedCount: number;
    rejectViaPreferenceCenterAttemptedCount: number;
    rejectViaPreferenceCenterSucceededCount: number;
    saveChoicesAttemptedCount: number;
    saveChoicesSucceededCount: number;
    preferenceCenterLimitations: string[];
  };
  policy: {
    policySurfacesObserved: number;
    policySurfaceAttempts: number;
    policySurfaceStatusCounts: Record<string, number>;
    policySurfaceFailedCount: number;
    surfaceTypes: Record<string, number>;
    failedSurfaceTypes: Record<string, number>;
    discoveryMethods: Record<string, number>;
    vendorMentions: string[];
    policyRuntimeAlignmentCandidateStatus?: string;
    policyRuntimeAlignmentMatchedCriteria: string[];
    preferenceControlLinks: string[];
  };
  runtime: {
    resolvedVendorProducts: string[];
    unresolvedMeaningfulEndpoints: string[];
    purposeCounts: Record<string, number>;
  };
  review: {
    findingCandidateCounts: Record<string, number>;
    eligibleFindingKeys: string[];
    evidenceExcerptCount: number;
    coverageLimitations: string[];
  };
}

export interface CalibrationModuleRunSummary {
  moduleName: string;
  status: string;
  durationMs?: number;
  errorCount: number;
  errors: string[];
}

export async function runCalibration(input: CalibrationInput): Promise<CalibrationSummary> {
  const apiKey = input.env?.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("OPENAI_API_KEY is required for v2 calibration because Nano assist is mandatory for every v2 scan profile.");
  }
  const urls = unique(input.urls.map((url) => url.trim()).filter((url) => url.length > 0));
  if (urls.length === 0) {
    throw new Error("At least one calibration URL is required.");
  }

  await mkdir(input.outDir, { recursive: true });
  const scanner = input.scanner ?? ((scanInput) => runScan(scanInput));
  const results: CalibrationSiteSummary[] = [];

  for (const url of urls) {
    const siteOutDir = path.join(input.outDir, safeSiteDirectoryName(url));
    try {
      const bundle = await scanner({
        url,
        profile: input.profile,
        outDir: siteOutDir,
      });
      const inspection = await inspectBundle(bundle);
      results.push(summaryForBundle(url, siteOutDir, bundle, inspection));
    } catch (error) {
      results.push(failedSummary(url, siteOutDir, error));
    }
  }

  const summary: CalibrationSummary = {
    generatedAt: (input.now?.() ?? new Date()).toISOString(),
    profile: input.profile,
    urlCount: urls.length,
    successCount: results.filter((result) => result.status === "completed").length,
    failureCount: results.filter((result) => result.status === "failed").length,
    results,
  };

  const normalizedSummary = JSON.parse(JSON.stringify(summary)) as CalibrationSummary;

  await writeFile(
    path.join(input.outDir, "calibration-summary.json"),
    `${JSON.stringify(normalizedSummary, null, 2)}\n`,
  );
  await writeFile(
    path.join(input.outDir, "calibration-summary.md"),
    formatCalibrationSummaryMarkdown(normalizedSummary),
  );

  return normalizedSummary;
}

export async function readCalibrationUrls(filePath: string): Promise<string[]> {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

export function formatCalibrationSummaryMarkdown(summary: CalibrationSummary): string {
  const lines: string[] = [];
  lines.push("# CertScore v2 Calibration Summary");
  lines.push("");
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Profile: ${summary.profile}`);
  lines.push(`URLs: ${summary.urlCount}`);
  lines.push(`Completed: ${summary.successCount}`);
  lines.push(`Failed: ${summary.failureCount}`);
  lines.push("");
  lines.push("This is internal diagnostic output only. It is not customer-facing report prose and does not state legal conclusions.");
  lines.push("");
  lines.push("## Aggregate Signals");
  lines.push("");
  lines.push(`Runtime vendors: ${formatCounts(countStringValues(summary.results.flatMap((result) => result.runtime.resolvedVendorProducts)))}`);
  lines.push(`Policy-mentioned vendors: ${formatCounts(countStringValues(summary.results.flatMap((result) => result.policy.vendorMentions)))}`);
  lines.push(`Top unresolved endpoints: ${formatEndpointGroups(summary.results.flatMap((result) => result.runtime.unresolvedMeaningfulEndpoints), 12)}`);
  lines.push(`Consent controls: ${formatCounts(mergeCountMaps(summary.results.map((result) => result.consent.controlsObservedByType)))}`);
  lines.push(`Consent action outcomes: ${formatCounts(countStringValues(summary.results.flatMap((result) => actionOutcomeLabels(result.consent.actionAttempts))))}`);
  lines.push(`Preference-center traversal: ${formatPreferenceCenterAggregate(summary.results)}`);
  lines.push(`Policy surface statuses: ${formatCounts(mergeCountMaps(summary.results.map((result) => result.policy.policySurfaceStatusCounts)))}`);
  lines.push(`Policy surface types: ${formatCounts(mergeCountMaps(summary.results.map((result) => result.policy.surfaceTypes)))}`);
  lines.push(`Coverage limitations: ${formatCounts(countStringValues(summary.results.flatMap((result) => result.review.coverageLimitations)))}`);
  lines.push("");

  for (const result of summary.results) {
    lines.push(`## ${result.url}`);
    lines.push("");
    lines.push(`Status: ${result.status}`);
    if (result.failureReason) {
      lines.push(`Failure: ${result.failureReason}`);
    }
    lines.push(`Output: ${result.outDir}`);
    lines.push(`Modules: ${formatModules(result.modulesRun)}`);
    lines.push(`Nano assists: policy=${result.nanoAssist.policyAssistCount}, consent-ui=${result.nanoAssist.consentUiAssistCount}, escalations=${result.nanoAssist.failureOrEscalationCount}`);
    lines.push(`Runtime vendors: ${formatCounts(countStringValues(result.runtime.resolvedVendorProducts))}`);
    lines.push(`Top unresolved endpoints: ${formatEndpointGroups(result.runtime.unresolvedMeaningfulEndpoints, 8)}`);
    lines.push(`Policy surfaces: ${policySurfaceStatusLabel(result)}`);
    lines.push(`Policy surface types: ${formatCounts(result.policy.surfaceTypes)}`);
    lines.push(`Preference/control observations: ${formatList(result.policy.preferenceControlLinks, 8)}`);
    lines.push(`Policy failed surface types: ${formatCounts(result.policy.failedSurfaceTypes)}`);
    lines.push(`Policy discovery methods: ${formatCounts(result.policy.discoveryMethods)}`);
    lines.push(`Policy vendor mentions: ${formatList(unique(result.policy.vendorMentions))}`);
    lines.push(`Policy/runtime alignment: ${result.policy.policyRuntimeAlignmentCandidateStatus ?? "none"} criteria=${formatList(result.policy.policyRuntimeAlignmentMatchedCriteria)}`);
    lines.push(`Consent controls: ${formatCounts(result.consent.controlsObservedByType)}`);
    lines.push(`Consent attempts: ${formatAttempts(result.consent.actionAttempts)}`);
    lines.push(`Preference-center traversal: ${formatPreferenceCenter(result)}`);
    lines.push(`Consent deltas: ${formatComparisons(result.consent.comparisons)}`);
    lines.push(`Needs calibration: ${formatList(needsCalibration(result))}`);
    lines.push(`Finding candidates: ${formatCounts(result.review.findingCandidateCounts)}`);
    lines.push(`Eligible findings: ${formatList(result.review.eligibleFindingKeys)}`);
    lines.push(`Evidence excerpts: ${result.review.evidenceExcerptCount}`);
    lines.push(`Coverage limitations: ${formatList(result.review.coverageLimitations)}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function summaryForBundle(
  url: string,
  outDir: string,
  bundle: CanonicalEvidenceBundle,
  inspection: BundleInspectionReport,
): CalibrationSiteSummary {
  const policyAssistCount = inspection.policySurfaceSummary.nanoAssistCount;
  const consentUiAssistCount = inspection.consentFlowSummary.nanoAssistCount;
  return {
    url,
    status: "completed",
    outDir,
    scanId: bundle.scanId,
    modulesRun: bundle.modulesRun.map((moduleRun) => ({
      moduleName: moduleRun.moduleName,
      status: moduleRun.status,
      durationMs: moduleRun.durationMs,
      errorCount: moduleRun.errors.length,
      errors: moduleRun.errors,
    })),
    nanoAssist: {
      policyAssistCount,
      policyUncertaintyCount: inspection.policySurfaceSummary.nanoUncertaintyCount,
      consentUiAssistCount,
      consentUiUncertaintyCount: inspection.consentFlowSummary.nanoUncertaintyCount,
      failureOrEscalationCount: bundle.modulesRun.filter((moduleRun) =>
        moduleRun.errors.some((error) => /nano|assist/i.test(error)) ||
        moduleRun.status === "failed",
      ).length,
    },
    consent: {
      controlsObservedByType: inspection.consentFlowSummary.controlsObservedByType,
      actionAttempts: inspection.consentFlowSummary.actionAttempts,
      comparisons: inspection.consentFlowSummary.comparisons,
      journeyPhaseDeltaCount: inspection.consentFlowSummary.journeyPhaseDeltaCount,
      preferenceCenterTraversalCount: inspection.consentFlowSummary.preferenceCenterTraversalCount,
      preferenceCenterOpenedCount: inspection.consentFlowSummary.preferenceCenterOpenedCount,
      preferenceCenterSecondLayerObservedCount: inspection.consentFlowSummary.preferenceCenterSecondLayerObservedCount,
      rejectViaPreferenceCenterAttemptedCount: inspection.consentFlowSummary.rejectViaPreferenceCenterAttemptedCount,
      rejectViaPreferenceCenterSucceededCount: inspection.consentFlowSummary.rejectViaPreferenceCenterSucceededCount,
      saveChoicesAttemptedCount: inspection.consentFlowSummary.saveChoicesAttemptedCount,
      saveChoicesSucceededCount: inspection.consentFlowSummary.saveChoicesSucceededCount,
      preferenceCenterLimitations: inspection.consentFlowSummary.preferenceCenterLimitations,
    },
    policy: {
      policySurfacesObserved: inspection.policySurfaceSummary.policySurfacesObserved,
      policySurfaceAttempts: inspection.policySurfaceSummary.policySurfaceAttempts,
      policySurfaceStatusCounts: inspection.policySurfaceSummary.policySurfaceStatusCounts,
      policySurfaceFailedCount: inspection.policySurfaceSummary.policySurfaceFailedCount,
      surfaceTypes: inspection.policySurfaceSummary.surfaceTypes,
      failedSurfaceTypes: inspection.policySurfaceSummary.failedSurfaceTypes,
      discoveryMethods: inspection.policySurfaceSummary.discoveryMethods,
      vendorMentions: inspection.policySurfaceSummary.vendorMentions,
      policyRuntimeAlignmentCandidateStatus: inspection.policySurfaceSummary.policyRuntimeAlignmentCandidateStatus,
      policyRuntimeAlignmentMatchedCriteria: inspection.policySurfaceSummary.policyRuntimeAlignmentMatchedCriteria,
      preferenceControlLinks: inspection.policySurfaceSummary.preferenceControlLinks,
    },
    runtime: {
      resolvedVendorProducts: inspection.vendorResolution.resolvedVendors.map((vendor) =>
        vendor.product ?? vendor.vendor,
      ).sort(),
      unresolvedMeaningfulEndpoints: inspection.endpointAttribution.unresolvedMeaningfulEndpoints
        .map((endpoint) => endpoint.hostname ? `${endpoint.hostname}${endpoint.path ?? ""}` : endpoint.path ?? "unknown")
        .sort(),
      purposeCounts: inspection.vendorResolution.purposeCounts,
    },
    review: {
      findingCandidateCounts: sortedCountMap(
        inspection.findingCandidateSummary.map((finding) => finding.eligibility),
      ),
      eligibleFindingKeys: inspection.findingCandidateSummary
        .filter((finding) => finding.eligibility === "eligible")
        .map((finding) => finding.findingKey)
        .sort(),
      evidenceExcerptCount: inspection.evidenceExcerptSummary.evidenceExcerptsTotal,
      coverageLimitations: inspection.coverageLimitations,
    },
  };
}

function failedSummary(url: string, outDir: string, error: unknown): CalibrationSiteSummary {
  return {
    url,
    status: "failed",
    outDir,
    failureReason: error instanceof Error ? error.message : String(error),
    modulesRun: [],
    nanoAssist: {
      policyAssistCount: 0,
      policyUncertaintyCount: 0,
      consentUiAssistCount: 0,
      consentUiUncertaintyCount: 0,
      failureOrEscalationCount: /nano|assist/i.test(error instanceof Error ? error.message : String(error)) ? 1 : 0,
    },
    consent: {
      controlsObservedByType: {},
      actionAttempts: [],
      comparisons: [],
      journeyPhaseDeltaCount: 0,
      preferenceCenterTraversalCount: 0,
      preferenceCenterOpenedCount: 0,
      preferenceCenterSecondLayerObservedCount: 0,
      rejectViaPreferenceCenterAttemptedCount: 0,
      rejectViaPreferenceCenterSucceededCount: 0,
      saveChoicesAttemptedCount: 0,
      saveChoicesSucceededCount: 0,
      preferenceCenterLimitations: [],
    },
    policy: {
      policySurfacesObserved: 0,
      policySurfaceAttempts: 0,
      policySurfaceStatusCounts: {},
      policySurfaceFailedCount: 0,
      surfaceTypes: {},
      failedSurfaceTypes: {},
      discoveryMethods: {},
      vendorMentions: [],
      policyRuntimeAlignmentMatchedCriteria: [],
      preferenceControlLinks: [],
    },
    runtime: {
      resolvedVendorProducts: [],
      unresolvedMeaningfulEndpoints: [],
      purposeCounts: {},
    },
    review: {
      findingCandidateCounts: {},
      eligibleFindingKeys: [],
      evidenceExcerptCount: 0,
      coverageLimitations: [],
    },
  };
}

function safeSiteDirectoryName(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "site";
  } catch {
    return url.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "site";
  }
}

function formatModules(modules: CalibrationModuleRunSummary[]): string {
  return modules.length > 0
    ? modules.map((moduleRun) => `${moduleRun.moduleName}:${moduleRun.status}${moduleRun.durationMs !== undefined ? `:${moduleRun.durationMs}ms` : ""}`).join("; ")
    : "none";
}

function formatAttempts(attempts: CalibrationSiteSummary["consent"]["actionAttempts"]): string {
  return attempts.length > 0
    ? attempts.map((attempt) => actionOutcomeLabel(attempt)).join("; ")
    : "none";
}

function formatComparisons(comparisons: CalibrationSiteSummary["consent"]["comparisons"]): string {
  return comparisons.length > 0
    ? comparisons.map((comparison) =>
      `${comparison.comparedScenarios}:persist=${formatList([
        ...comparison.vendorsPersistingAfterReject,
        ...comparison.cookiesPersistingAfterReject,
        ...comparison.collectionEndpointsPersistingAfterReject,
      ], 12)}:accept_only=${formatList([
        ...comparison.vendorsAppearingOnlyAfterAccept,
        ...comparison.cookiesSetAfterAccept,
        ...comparison.collectionEndpointsAppearingOnlyAfterAccept,
      ], 12)}:limitations=${formatList(comparison.coverageLimitations)}`,
    ).join("; ")
    : "none";
}

function formatPreferenceCenterAggregate(results: CalibrationSiteSummary[]): string {
  const sums = results.reduce((acc, result) => ({
    traversals: acc.traversals + result.consent.preferenceCenterTraversalCount,
    opened: acc.opened + result.consent.preferenceCenterOpenedCount,
    secondLayer: acc.secondLayer + result.consent.preferenceCenterSecondLayerObservedCount,
    rejectAttempted: acc.rejectAttempted + result.consent.rejectViaPreferenceCenterAttemptedCount,
    rejectSucceeded: acc.rejectSucceeded + result.consent.rejectViaPreferenceCenterSucceededCount,
    saveAttempted: acc.saveAttempted + result.consent.saveChoicesAttemptedCount,
    saveSucceeded: acc.saveSucceeded + result.consent.saveChoicesSucceededCount,
  }), {
    traversals: 0,
    opened: 0,
    secondLayer: 0,
    rejectAttempted: 0,
    rejectSucceeded: 0,
    saveAttempted: 0,
    saveSucceeded: 0,
  });
  const limitations = countStringValues(results.flatMap((result) => result.consent.preferenceCenterLimitations));
  return `total=${sums.traversals}, opened=${sums.opened}, second_layer=${sums.secondLayer}, reject_attempted=${sums.rejectAttempted}, reject_succeeded=${sums.rejectSucceeded}, save_attempted=${sums.saveAttempted}, save_succeeded=${sums.saveSucceeded}, limitations=${formatCounts(limitations)}`;
}

function formatPreferenceCenter(result: CalibrationSiteSummary): string {
  return `total=${result.consent.preferenceCenterTraversalCount}, opened=${result.consent.preferenceCenterOpenedCount}, second_layer=${result.consent.preferenceCenterSecondLayerObservedCount}, reject_attempted=${result.consent.rejectViaPreferenceCenterAttemptedCount}, reject_succeeded=${result.consent.rejectViaPreferenceCenterSucceededCount}, save_attempted=${result.consent.saveChoicesAttemptedCount}, save_succeeded=${result.consent.saveChoicesSucceededCount}, limitations=${formatList(result.consent.preferenceCenterLimitations)}`;
}

function formatCounts(counts: Record<string, number>, limit = 20): string {
  const entries = Object.entries(counts).sort(([, leftCount], [, rightCount]) =>
    rightCount - leftCount,
  ).slice(0, limit);
  return entries.length > 0 ? entries.map(([key, value]) => `${key}=${value}`).join(", ") : "none";
}

function formatEndpointGroups(values: string[], limit = 12): string {
  const grouped = countStringValues(values.map((value) => {
    const parsed = endpointGroup(value);
    return parsed.count > 1 ? `${parsed.key} (${parsed.count} examples)` : parsed.key;
  }));
  return formatCounts(grouped, limit);
}

function endpointGroup(value: string): { key: string; count: number } {
  const [host = "unknown", ...rest] = value.split("/");
  const pathPart = rest.length > 0 ? `/${rest.join("/")}` : "";
  const cleanPath = pathPart
    .replace(/[?#].*$/, "")
    .replace(/;.*$/, "")
    .replace(/\/\d{3,}(?=\/|$)/g, "/:id");
  return { key: `${host}${cleanPath || ""}`, count: 1 };
}

function policySurfaceStatusLabel(result: CalibrationSiteSummary): string {
  const status = result.policy.policySurfacesObserved > 0 ? "observed" : "not_observed";
  return `${status} observed=${result.policy.policySurfacesObserved}, attempts=${result.policy.policySurfaceAttempts}, statuses=${formatCounts(result.policy.policySurfaceStatusCounts)}`;
}

function formatList(values: string[], limit = 20): string {
  if (values.length === 0) {
    return "none";
  }
  const uniqueValues = unique(values);
  const shown = uniqueValues.slice(0, limit);
  return `${shown.join("|")}${uniqueValues.length > limit ? `|+${uniqueValues.length - limit} more` : ""}`;
}

function needsCalibration(result: CalibrationSiteSummary): string[] {
  const needs: string[] = [];
  if (result.status === "failed") {
    needs.push("scan_failed");
  }
  if (result.policy.policySurfacesObserved === 0) {
    needs.push("policy_surface_recall");
  }
  if (result.runtime.unresolvedMeaningfulEndpoints.length > 0) {
    needs.push("endpoint_attribution_review");
  }
  if (result.consent.actionAttempts.some((attempt) => attempt.attempted && !attempt.succeeded)) {
    needs.push("consent_action_execution");
  }
  if (result.review.coverageLimitations.length > 0) {
    needs.push("coverage_limitations");
  }
  return needs;
}

function actionOutcomeLabels(
  attempts: CalibrationSiteSummary["consent"]["actionAttempts"],
): string[] {
  return attempts.map((attempt) => `${attempt.actionType}${attempt.viaPreferenceCenter ? ":via_preference_center" : ""}:${attempt.succeeded ? "succeeded" : attempt.attempted ? "attempted_not_succeeded" : "not_attempted"}`);
}

function actionOutcomeLabel(
  attempt: CalibrationSiteSummary["consent"]["actionAttempts"][number],
): string {
  return `${attempt.scenario}:${attempt.actionType}${attempt.viaPreferenceCenter ? ":via_preference_center" : ""}:${attempt.attempted ? "attempted" : "not_attempted"}/${attempt.succeeded ? "succeeded" : "not_succeeded"}${attempt.failureReason ? `:${attempt.failureReason}` : ""}`;
}

function countStringValues(values: string[]): Record<string, number> {
  return sortedCountMap(values);
}

function mergeCountMaps(maps: Array<Record<string, number>>): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const map of maps) {
    for (const [key, value] of Object.entries(map)) {
      merged[key] = (merged[key] ?? 0) + value;
    }
  }
  return Object.fromEntries(Object.entries(merged).sort(([left], [right]) => left.localeCompare(right)));
}

function sortedCountMap(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
