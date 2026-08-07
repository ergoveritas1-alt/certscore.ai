import { projectExecutiveFindingsFromUnifiedPackets } from "../scans/executive-findings-projection";
import { deriveCertScoreFindings } from "../scans/derive-findings";
import { deriveGdprEprivacyCoverageChecklist } from "../scans/gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "../scans/gdpr-eprivacy-coverage-policy";
import { getReportableGdprEprivacyCoverageItems } from "../scans/gdpr-eprivacy-reportable-rows";
import { getHybridRuntimeEvidence } from "../scans/hybrid-runtime-evidence";
import { getPublicReportFindingDisplay } from "../scans/public-report-finding-display";
import type { CertScoreFinding } from "../scans/finding-registry";
import { getRegulatoryLensAnchor } from "../scans/regulatory-lens-anchor";
import { getAssessmentDirection, getEvidenceLabel } from "../scans/gdpr-eprivacy-assessment-direction";
import { deriveGdprEprivacyCoverageChecklistRowRationale } from "../scans/gdpr-eprivacy-checklist-rationale";
import {
  buildChecklistConcernTopFindings,
  selectCanonicalHighPriorityFindings
} from "../scans/checklist-concern-top-findings";
import { buildNormalizedConcerns } from "../scans/normalized-concerns";
import {
  buildPromotionGradePreconsentRequests,
  getUrlRegistrableDomain,
  inferDirectEndpointVendorFromUrl
} from "../scans/preconsent-public-evidence";
import { CANONICAL_VENDOR_RESOLVER_VERSION } from "@certscore/vendor-resolver";
import {
  buildPreConsentStorageAssessment,
  buildRuntimeCookieInventory,
  countEligibleNonEssentialPreconsentStorageMetricRows,
  hasUnresolvedNonEssentialPreconsentStorageEvidence,
  getRuntimeCookiePrimaryProvider,
  isEligibleNonEssentialPreconsentStorageRow,
  projectPreConsentStorageMetric
} from "../scans/runtime-cookie-evidence";
import {
  buildSanitizedRequestEvidenceRows,
  buildTrackerInventoryGroupRows,
  buildTrackerInventoryRows,
  isInventoryDisplayHostname,
  isTimedPreConsentInventoryRow,
  suppressUnsupportedCmpAliasRows
} from "../scans/runtime-inventory-projection";
import { deriveRegulatoryCoverageScore } from "../scans/regulatory-coverage-score";
import { meaningfulPolicySurfaceTitle, prioritizePublicPolicySurfaces } from "../scans/policy-enrichment-row";
import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";
import { getPersistedCanonicalReportProjection } from "../../server/scans/persisted-canonical-report-projection";
import { deriveCanonicalOverallScoreForReport } from "../../server/scans/canonical-overall-score";
import { withPersistedFirstLayerConsentEvidence } from "../../server/scans/scan-report-consent-projection";
import {
  getKnownCmpVendorForHost,
  getKnownCmpVendorName,
  projectExternalScanNoGo,
  type ExternalScanNoGoResult
} from "@website-signal-risk-scanner/shared";
import {
  buildScanReportUnifiedFindingsForScan as buildScanReportUnifiedFindings,
  filterContradictoryPositiveSurfaceFindings
} from "../scans/scan-report-unified-findings";
import { absoluteUrl } from "../seo";
import {
  PULSE_API_VERSION,
  PULSE_CAPABILITIES,
  PULSE_FEEDBACK_EMAIL,
  PULSE_MAX_RECOMMENDED_AGE_HOURS,
  PULSE_PROJECTION_VERSION,
  PULSE_REVIEW_CONTEXT_DISCLAIMER,
  PULSE_SCHEMA_VERSION,
  PULSE_SOURCE,
  PULSE_STANDARD_DISCLAIMER,
  PULSE_USAGE_GUIDANCE,
  PULSE_VERSION,
  PULSE_COVERAGE_LIMITATION_COPY
} from "./constants";
import { buildPulseAgentInterpretation } from "./agent-interpretation";
import { projectGdprTransparencyTopicCandidateSummary, projectPulseCalibrationContext } from "./calibration-context";
export { projectPulseCalibrationContext } from "./calibration-context";
import type { PulseDetail, PulseFormat, PulseFreshnessMode } from "./types";

type PulseProjectionInput = {
  detail: PulseDetail;
  format: PulseFormat;
  freshnessMode: PulseFreshnessMode;
  pulseRequestId: string;
  requestedUrl: string | null;
  resolutionMode: string;
  scanRecord: ScanDetailResponse;
  waitSeconds: number;
};

export function buildPulseNoGoState(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const projection = projectExternalScanNoGo(runtimeArtifacts);
  return projection ? {
    ...projection,
    scanStatus: "completed_limited" as const,
    coverageStatus: projection.noGo.limitationKind,
    resultQuality: {
      level: "usable_with_limitations" as const,
      reason: "scan_no_go" as const,
      summary: projection.noGo.summary
    }
  } : null;
}

function generatedAt() {
  return new Date().toISOString();
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordValue(record: Record<string, unknown> | null | undefined, key: string) {
  return record && typeof record === "object" ? record[key] : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function capArray<T>(items: T[], limit: number) {
  const boundedLimit = Math.max(0, limit);
  return {
    items: items.slice(0, boundedLimit),
    cap: {
      shown: Math.min(items.length, boundedLimit),
      total: items.length,
      truncated: items.length > boundedLimit
    }
  };
}

function boundedStrings(values: Array<string | null | undefined>, limit: number) {
  return uniqueStrings(values).slice(0, Math.max(0, limit));
}

function safeUrl(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    if (url.search) {
      url.search = "?redacted=1";
    }
    url.hash = "";
    return url.toString();
  } catch {
    return value.replace(/[?#].*$/, "");
  }
}

function rejectionReasonForDisplayHostname(value: string | null | undefined) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "invalid_hostname";
  }
  const trimmed = value.trim();
  if (trimmed.startsWith("_")) {
    return "cookie_name_like";
  }
  if (trimmed.startsWith(".")) {
    return isInventoryDisplayHostname(trimmed.slice(1)) ? "cookie_domain_token" : "css_selector_like";
  }
  if (trimmed.startsWith("#")) {
    return "css_selector_like";
  }
  if (!trimmed.includes(".")) {
    return "missing_dot";
  }
  return "invalid_hostname";
}

function rejectedDisplayHostnameRows(values: Array<string | null | undefined>) {
  return values.flatMap((value) => {
    if (!value || isInventoryDisplayHostname(value)) {
      return [];
    }
    return [{
      value: value.slice(0, 120),
      reason: rejectionReasonForDisplayHostname(value)
    }];
  });
}

function policySurfaceUrl(row: Record<string, unknown>) {
  return safeUrl(
    row.policy_page_url ??
    row.policyPageUrl ??
    row.page_url ??
    row.pageUrl ??
    row.source_url ??
    row.sourceUrl ??
    row.url
  );
}

function policySurfaceUrlRecoveredFromAlternateField(row: Record<string, unknown>) {
  return typeof row.policy_page_url !== "string" && Boolean(
    row.policyPageUrl ??
    row.page_url ??
    row.pageUrl ??
    row.source_url ??
    row.sourceUrl ??
    row.url
  );
}

function canonicalPublicDocumentUrl(value: string | null | undefined) {
  const safe = safeUrl(value);
  if (!safe) return null;
  try {
    const parsed = new URL(safe);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/g, "") || "/";
    return parsed.toString();
  } catch {
    return safe;
  }
}

function canonicalPolicySurfaceType(url: string, retainedType: string) {
  let pathname = "";
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return retainedType;
  }
  if (/accessibility|accessibility-statement/.test(pathname)) return "accessibility_statement";
  if (/(?:terms-of-use|terms-and-conditions|\/terms(?:\/|$))/.test(pathname)) return "terms_of_service";
  if (/cookie(?:-policy|-notice|s)?/.test(pathname)) return "cookie_policy";
  if (/privacy|persondata|data-protection/.test(pathname)) return "privacy_policy";
  return retainedType;
}

export function projectedPolicySurfaceRows(scanRecord: ScanDetailResponse) {
  const effectiveUrl = canonicalPublicDocumentUrl(scanRecord.accessPostureSummary?.finalEffectiveUrl ?? null);
  const retained = new Map<string, { row: ScanDetailResponse["policyEnrichment"][number]; type: string; url: string }>();
  for (const row of scanRecord.policyEnrichment) {
    const record = row as unknown as Record<string, unknown>;
    const discoveryMethod = typeof record.discoveryMethod === "string"
      ? record.discoveryMethod
      : typeof record.discovery_method === "string" ? record.discovery_method : null;
    const fetchStatus = typeof record.status === "string"
      ? record.status
      : typeof record.fetchStatus === "string"
        ? record.fetchStatus
        : typeof record.fetch_status === "string" ? record.fetch_status : null;
    if (discoveryMethod === "guessed_common_path" && fetchStatus !== "fetched") {
      continue;
    }
    const url = canonicalPublicDocumentUrl(policySurfaceUrl(record));
    if (!url) continue;
    const retainedType = typeof row.policy_page_type === "string"
      ? row.policy_page_type
      : typeof record.pageType === "string"
        ? record.pageType
        : "policy_surface";
    const type = canonicalPolicySurfaceType(url, retainedType);
    if (url === effectiveUrl && type === "policy_surface") continue;
    const existing = retained.get(url);
    if (!existing || (existing.type === "policy_surface" && type !== "policy_surface")) {
      retained.set(url, { row, type, url });
    }
  }
  return prioritizePublicPolicySurfaces([...retained.values()].map((surface) => ({
    ...surface,
    url: surface.url
  })), { limit: 5, siteDomain: scanRecord.scan.domainHostname });
}

function safeRecordSubset(record: Record<string, unknown> | null | undefined, keys: string[]) {
  const output: Record<string, unknown> = {};
  if (!record) {
    return output;
  }
  for (const key of keys) {
    const value = record[key];
    if (value === undefined) {
      continue;
    }
    if (typeof value === "string") {
      output[key] = value.slice(0, 240);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      output[key] = value;
    } else if (Array.isArray(value)) {
      output[key] = value
        .slice(0, 20)
        .flatMap((entry) => {
          if (typeof entry === "string") return [entry.slice(0, 240)];
          if (typeof entry === "number" || typeof entry === "boolean" || entry === null) return [entry];
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
          return [safeRecordSubset(entry as Record<string, unknown>, Object.keys(entry).slice(0, 20))];
        });
    } else if (value && typeof value === "object") {
      output[key] = safeRecordSubset(value as Record<string, unknown>, Object.keys(value).slice(0, 20));
    }
  }
  return output;
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function riskLevelFromScore(score: number) {
  if (score < 45) {
    return "significant_review_recommended";
  }
  if (score < 75) {
    return "review_recommended";
  }
  return "monitor";
}

export function getPulseExecutiveActionLabel(posture: "Clear" | "Watch" | "Action Needed") {
  return posture === "Action Needed" ? "Action Needed" : posture === "Clear" ? "Complete" : "Monitor";
}

function boundedScore(value: number | null) {
  return value === null ? null : Math.max(0, Math.min(100, Math.round(value)));
}

function buildPulseReportSurface(input: {
  coverageLimited: boolean;
  scanRecord: ScanDetailResponse;
  unifiedFindingPackets?: ReturnType<typeof buildScanReportUnifiedFindings>;
}) {
  const scanRecord = input.scanRecord;
  const persistedCanonicalProjection = getPersistedCanonicalReportProjection(scanRecord);
  const unifiedFindingPackets = input.unifiedFindingPackets ??
    (persistedCanonicalProjection
      ? filterContradictoryPositiveSurfaceFindings(persistedCanonicalProjection.ownerUnifiedFindings)
      : null) ??
    buildScanReportUnifiedFindings(scanRecord);
  const executive = projectExecutiveFindingsFromUnifiedPackets(unifiedFindingPackets);
  const presentationSummary = deriveCertScoreFindings(scanRecord);
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(scanRecord.runtimeArtifacts);
  const runtimeCookieRows = buildRuntimeCookieInventory({
    hybridRuntimeEvidence,
    runtimeArtifacts: scanRecord.runtimeArtifacts
  }).rows;
  const trackerInventoryRows = suppressUnsupportedCmpAliasRows(buildTrackerInventoryRows({
    domains: uniqueStrings(scanRecord.trackerVendors.map((vendor) => vendor.scriptHost)),
    firstPartyDomain: scanRecord.scan.domainHostname ?? presentationSummary.requestedHost,
    preConsentVendors: presentationSummary.preConsentVendorNames,
    resolvedVendors: presentationSummary.resolvedVendorNames,
    sessionReplayVendors: presentationSummary.sessionReplayVendorNames,
    trackerVendors: scanRecord.trackerVendors,
    topObservedEntities: presentationSummary.topObservedEntities,
    unresolvedHosts: presentationSummary.unresolvedVendorHosts
  })).filter(isTimedPreConsentInventoryRow);
  const runtimeTrackerPriorityRows = buildTrackerInventoryGroupRows(trackerInventoryRows).map((row) => ({
    domains: row.domains,
    firstSeenMs: row.firstSeenMs,
    party: row.party,
    priority: row.priority,
    purpose: row.purpose,
    requestCount: row.requestCount ?? null,
    regulatoryRelevance: row.regulatoryRelevance,
    vendor: row.vendor
  }));
  const gdprEprivacyChecklist = persistedCanonicalProjection?.checklistRows ?? (() => {
    const runtimeArtifactNormalizedConcerns = buildNormalizedConcerns({
      reviewFindingCandidates: [],
      runtimeArtifacts: scanRecord.runtimeArtifacts,
      validationFindings: []
    });
    const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
      coverageLimited: input.coverageLimited,
      events: scanRecord.events,
      normalizedConcerns: runtimeArtifactNormalizedConcerns,
      policyEnrichmentCount: scanRecord.policyEnrichment.length,
      runtimeArtifacts: scanRecord.runtimeArtifacts,
      scanCompleted: scanRecord.scan.status === "completed",
      snapshot: scanRecord.snapshot
    });
    return deriveGdprEprivacyCoverageChecklist({
      coverageLimited: input.coverageLimited,
      coverageOutcomes,
      projectedFindings: executive.findings,
      runtimeCookieRows,
      runtimeTrackerPriorityRows,
      scanCompleted: scanRecord.scan.status === "completed",
      unifiedFindings: unifiedFindingPackets
    });
  })();
  const reportableGdprRows = getReportableGdprEprivacyCoverageItems(gdprEprivacyChecklist).map((item) => {
    const statusBasis = deriveGdprEprivacyCoverageChecklistRowRationale(item);
    return {
      ...item,
      assessmentDirection: getAssessmentDirection(item),
      criticalEvidence: {
        ...item.criticalEvidence,
        statusBasis
      },
      evidenceLabel: getEvidenceLabel(item),
      note: statusBasis
    };
  });
  const checklistFindings = buildChecklistConcernTopFindings(gdprEprivacyChecklist);
  const canonicalHighPriorityFindings = selectCanonicalHighPriorityFindings(checklistFindings);
  const { allFindings, topFindings } = selectPublicPulseFindingsFromUnifiedProjection({
    checklistFindings,
    findings: executive.findings,
    topFindings: canonicalHighPriorityFindings
  });
  const gdprEprivacyScoreAssessment = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: reportableGdprRows
  });
  const gdprEprivacyScore = gdprEprivacyScoreAssessment.score;
  const canonicalScore = deriveCanonicalOverallScoreForReport({
    checklistRows: gdprEprivacyChecklist,
    unifiedFindings: unifiedFindingPackets
  });
  const persistedReportScore =
    scanRecord.snapshot?.report_projection_status === "ready"
      ? finiteNumber(scanRecord.snapshot.certscore_overall)
      : null;
  const score = boundedScore(persistedReportScore ?? canonicalScore);
  const customerScoreAssessment = {
    coverageConfidence: gdprEprivacyScoreAssessment.coverageConfidence,
    coverageRatio: gdprEprivacyScoreAssessment.coverageRatio,
    scoreKind: "overall" as const,
    scoreSource: stringValue(scanRecord.snapshot?.score_source) ?? "canonical.gdpr_eprivacy",
    scoreStatus: score === null ? "withheld" as const : "scored" as const,
    scoreValue: score,
    scoreVersion: stringValue(scanRecord.snapshot?.score_version) ?? "gdpr-eprivacy-evidence.legacy-v1",
    withholdingReason: score === null ? "canonical_overall_score_unavailable" : null
  };
  const groupedTrackerRows = buildTrackerInventoryGroupRows(trackerInventoryRows);
  const preConsentTrackerRows = groupedTrackerRows
    .filter((row) => row.firstSeenMs !== null)
    .sort((left, right) => {
      const leftMs = left.firstSeenMs ?? Number.MAX_SAFE_INTEGER;
      const rightMs = right.firstSeenMs ?? Number.MAX_SAFE_INTEGER;
      return leftMs - rightMs || left.vendor.localeCompare(right.vendor);
    })
    .slice(0, 8)
    .map((row) => ({
      vendor: row.vendor,
      purpose: row.purpose,
      priority: row.priority,
      firstSeenMs: row.firstSeenMs,
      domains: row.domains.filter(isInventoryDisplayHostname).slice(0, 4)
    }));

  return {
    allFindings,
    customerScoreAssessment,
    executive,
    gdprEprivacyChecklist,
    gdprEprivacyScore,
    gdprEprivacyScoreAssessment,
    presentationSummary,
    preConsentTrackerRows,
    reportableGdprRows,
    runtimeCookieRows,
    runtimeTrackerPriorityRows,
    score,
    topFindings,
    trackerInventoryRows,
    unifiedFindingPackets
  };
}

export function selectPublicPulseFindingsFromUnifiedProjection(input: {
  checklistFindings?: CertScoreFinding[];
  findings: CertScoreFinding[];
  neutralChecklistFindingIds?: ReadonlySet<string>;
  topFindings: CertScoreFinding[];
}) {
  const neutralChecklistFindingIds = input.neutralChecklistFindingIds ?? new Set<string>();
  const eligible = (finding: CertScoreFinding) =>
    isPublicPulseApiFinding(finding) &&
    finding.id !== "consent_dark_patterns_detected" &&
    !neutralChecklistFindingIds.has(finding.id);

  const checklistFindings = (input.checklistFindings ?? []).filter(eligible);
  const checklistFindingIds = new Set(checklistFindings.map((finding) => finding.id));
  const canonicalFindings = input.findings.filter((finding) => eligible(finding) && !checklistFindingIds.has(finding.id));
  const canonicalTopFindings = input.topFindings.filter(
    (finding) => eligible(finding) && !checklistFindingIds.has(finding.id)
  );

  return {
    allFindings: [...checklistFindings, ...canonicalFindings],
    topFindings: [...checklistFindings, ...canonicalTopFindings]
  };
}

export function buildCanonicalGdprEprivacyShadowProjection(scanRecord: ScanDetailResponse) {
  const coverage = deriveCoverage(scanRecord);
  const unifiedFindingPackets = buildScanReportUnifiedFindings(scanRecord);
  const surface = buildPulseReportSurface({
    coverageLimited: coverage.status !== "complete",
    scanRecord,
    unifiedFindingPackets
  });

  return {
    checklistRows: surface.gdprEprivacyChecklist,
    coverageStatus: coverage.status,
    legacyScoreAssessment: surface.gdprEprivacyScoreAssessment,
    unifiedFindings: surface.unifiedFindingPackets
  };
}

export function buildTrackerFootprintBreakdown(reportSurface: ReturnType<typeof buildPulseReportSurface>) {
  const grouped = buildTrackerInventoryGroupRows(reportSurface.trackerInventoryRows);
  const rawHosts = uniqueStrings(reportSurface.trackerInventoryRows.flatMap((row) => row.domains));
  const products = uniqueStrings(grouped.flatMap((row) => row.rawProducts));
  const purposeCounts = Object.fromEntries([...new Set(grouped.map((row) => row.purpose))]
    .sort()
    .map((purpose) => [purpose, grouped.filter((row) => row.purpose === purpose).length]));
  const priorityCounts = Object.fromEntries(["high", "medium", "review_needed", "contextual"].map((priority) => [
    priority,
    grouped.filter((row) => row.priority === priority).length
  ]));
  const confidenceCounts = Object.fromEntries(["high", "medium", "low"].map((confidence) => [
    confidence,
    grouped.filter((row) => row.confidence === confidence).length
  ]));
  const isConsentPlatform = (row: (typeof grouped)[number]) => /cookie compliance|consent|\bcmp\b/i.test(`${row.purpose} ${row.vendor}`);
  const isCdn = (row: (typeof grouped)[number]) => /\bcdn\b|content delivery/i.test(
    `${row.purpose} ${row.vendor} ${row.rawProducts.join(" ")}`
  );
  return {
    vendors: grouped.length,
    providerFamilies: grouped.length,
    products: products.length,
    displayedRows: reportSurface.trackerInventoryRows.length,
    domains: rawHosts.length,
    trackers: grouped.filter((row) => row.macroCategory === "Advertising" || row.macroCategory === "Analytics").length,
    functionalServices: grouped.filter((row) => row.macroCategory === "Functional" && !isConsentPlatform(row) && !isCdn(row)).length,
    consentPlatforms: grouped.filter(isConsentPlatform).length,
    cdns: grouped.filter(isCdn).length,
    rawHosts: rawHosts.length,
    cookies: reportSurface.runtimeCookieRows.length,
    purposeCounts,
    priorityCounts,
    confidenceCounts
  };
}

export function buildRawHostInventory(reportSurface: ReturnType<typeof buildPulseReportSurface>) {
  const hosts = new Map<string, { host: string; vendors: string[]; purposes: string[] }>();
  for (const row of reportSurface.trackerInventoryRows) {
    for (const host of row.domains) {
      const existing = hosts.get(host) ?? { host, vendors: [], purposes: [] };
      existing.vendors = uniqueStrings([...existing.vendors, row.label]);
      existing.purposes = uniqueStrings([...existing.purposes, row.vendorDisplayCategory ?? row.category]);
      hosts.set(host, existing);
    }
  }
  return [...hosts.values()].sort((left, right) => left.host.localeCompare(right.host));
}

export function derivePulseReportScore(input: {
  coverageLimited?: boolean;
  findings?: CertScoreFinding[];
  scanRecord: ScanDetailResponse;
  unifiedFindingPackets?: ReturnType<typeof buildScanReportUnifiedFindings>;
}) {
  const scanRecord = input.scanRecord;
  const coverageLimited = input.coverageLimited ?? (deriveCoverage(scanRecord).status !== "complete");
  const surface = buildPulseReportSurface({
    coverageLimited,
    scanRecord,
    unifiedFindingPackets: input.unifiedFindingPackets
  });

  return surface.score;
}

function deriveFreshness(completedAt: string | null, generated: string) {
  if (!completedAt) {
    return {
      status: "unknown",
      ageSeconds: null,
      ageHours: null,
      maxRecommendedAgeHours: PULSE_MAX_RECOMMENDED_AGE_HOURS
    };
  }

  const ageSeconds = Math.max(0, Math.round((new Date(generated).getTime() - new Date(completedAt).getTime()) / 1000));
  const ageHours = Number((ageSeconds / 3600).toFixed(3));
  const status = ageHours <= 24 ? "fresh" : ageHours <= PULSE_MAX_RECOMMENDED_AGE_HOURS ? "recent" : "stale";

  return {
    status,
    ageSeconds,
    ageHours,
    maxRecommendedAgeHours: PULSE_MAX_RECOMMENDED_AGE_HOURS
  };
}

function deriveCoverage(scanRecord: ScanDetailResponse) {
  const noGoProjection = projectExternalScanNoGo(scanRecord.runtimeArtifacts);
  if (noGoProjection) {
    return {
      status: noGoProjection.noGo.limitationKind,
      homepageObserved: false,
      interruptionCount: 1,
      summary: noGoProjection.noGo.summary,
      limitations: [noGoProjection.noGo.explanation],
      interruptions: [{ label: noGoProjection.noGo.title, reason: noGoProjection.noGo.explanation }]
    };
  }
  const posture = scanRecord.accessPostureSummary;
  const interruptions =
    posture.interruptionLabel || posture.interruptionReason || posture.stopOutcomeTitle || posture.stopReviewTitle || posture.stopReason
      ? [
          {
            label: posture.interruptionLabel ?? posture.stopReviewTitle ?? "Access limited",
            reason:
              posture.interruptionReason ??
              posture.stopReason ??
              "Scan coverage was limited before meaningful public evidence was retained.",
            ...(posture.stopOutcomeTitle || posture.stopReviewTitle ? { reviewTitle: posture.stopOutcomeTitle ?? posture.stopReviewTitle } : {}),
            ...(posture.stopReason ? { reviewReason: posture.stopReason } : {})
          }
        ]
      : [];
  const homepageObserved = scanRecord.scan.pagesScanned > 0 || posture.homepageFetchStatus === "ok";
  const limited =
    scanRecord.scan.status !== "completed" ||
    scanRecord.scan.pagesScanned < Math.max(1, scanRecord.scan.pagesRequested) ||
    Boolean(posture.stopReason || posture.interruptionReason) ||
    ["blocked", "partial", "limited"].some((needle) =>
      `${posture.accessPostureClass ?? ""} ${posture.stopReason ?? ""} ${posture.interruptionReason ?? ""}`.toLowerCase().includes(needle)
    );
  const blocked = `${posture.accessPostureClass ?? ""} ${posture.stopReason ?? ""}`.toLowerCase().includes("block");
  const status = blocked ? "blocked" : limited ? "partial" : "complete";
  const summary =
    status === "complete"
      ? "Automated public-web scan completed for the observed public surfaces."
      : homepageObserved
        ? "Automated public-web scan completed with coverage limitations. Homepage findings are based on observable public-page evidence."
        : "Coverage was limited; absence of findings should not be interpreted as absence of risk.";

  return {
    status,
    homepageObserved,
    interruptionCount: interruptions.length,
    summary,
    limitations: ["Automated public-web scan only.", PULSE_COVERAGE_LIMITATION_COPY],
    interruptions: interruptions.slice(0, 10)
  };
}

function hasExplicitAccessInterruption(scanRecord: ScanDetailResponse) {
  const posture = scanRecord.accessPostureSummary;
  return Boolean(
    posture.interruptionLabel ||
      posture.interruptionReason ||
      posture.stopOutcomeTitle ||
      posture.stopReviewTitle ||
      posture.stopReason
  );
}

function hasPositiveNumber(value: unknown) {
  const number = finiteNumber(value);
  return number !== null && number > 0;
}

export function assessPulseScanRecordQuality(scanRecord: ScanDetailResponse) {
  const posture = scanRecord.accessPostureSummary;
  const snapshot = scanRecord.snapshot;
  const homepageObserved = scanRecord.scan.pagesScanned > 0 || posture.homepageFetchStatus === "ok";
  const explicitInterruption = hasExplicitAccessInterruption(scanRecord);
  const evidenceAnchorCount = [
    hasPositiveNumber(recordValue(snapshot, "total_signals")),
    hasPositiveNumber(recordValue(snapshot, "third_party_request_domain_count")),
    hasPositiveNumber(recordValue(snapshot, "third_party_domain_count")),
    hasPositiveNumber(recordValue(snapshot, "finding_count")),
    scanRecord.trackerVendors.length > 0,
    scanRecord.policyEnrichment.length > 0,
    finiteNumber(scanRecord.regulatoryRisk?.overallScore) !== null
  ].filter(Boolean).length;

  if (!homepageObserved && !explicitInterruption && evidenceAnchorCount === 0) {
    return {
      usable: false as const,
      level: "unavailable",
      reason: "completed_without_retained_public_evidence",
      message:
        "The scan completed without retained homepage, runtime, policy, tracker, score, finding, or access-interruption evidence. Run a fresh scan before summarizing this domain."
    };
  }

  return {
    usable: true as const,
    level: homepageObserved ? "usable" : "usable_with_limitations",
    reason: homepageObserved ? "retained_public_evidence" : "retained_access_limitation",
    message: homepageObserved
      ? "Retained public-page evidence is available for Pulse projection."
      : "Retained access-limitation evidence is available for Pulse projection."
  };
}

function getReviewLenses(scanRecord: ScanDetailResponse, findings: CertScoreFinding[]) {
  const risk = scanRecord.regulatoryRisk;
  const toStatus = (score: number | null | undefined) => {
    if (typeof score !== "number") {
      return "not_evaluated";
    }
    if (score >= 67) {
      return "needs_work";
    }
    if (score >= 34) {
      return "watch";
    }
    return "clear";
  };
  const lenses = [
    {
      name: "GDPR / ePrivacy",
      status: toStatus(risk?.consentEnforcementRiskScore),
      score: risk?.consentEnforcementRiskScore ?? null,
      summary: "Consent timing, consent surface, and tracker behavior drive this review context."
    }
  ];

  return {
    disclaimer: PULSE_REVIEW_CONTEXT_DISCLAIMER,
    lenses
  };
}

function getFindingReviewLenses(finding: CertScoreFinding) {
  const lenses = new Set<string>();
  if (
    finding.id === "policy_behavior_conflict" ||
    /consent|cookie|privacy|tracking|vendor|fingerprinting/i.test(`${finding.section} ${finding.id}`)
  ) {
    lenses.add("GDPR / ePrivacy");
  }
  return [...lenses];
}

const PUBLIC_PULSE_DIAGNOSTIC_FINDING_IDS = new Set([
  "scan_quality_visual_no_go",
  "policy_behavior_conflict"
]);

export function isPublicPulseApiFinding(finding: Pick<CertScoreFinding, "id" | "section">) {
  return PUBLIC_PULSE_DIAGNOSTIC_FINDING_IDS.has(finding.id) ||
    /consent|cookie|privacy|tracking|vendor|fingerprinting/i.test(`${finding.section} ${finding.id}`);
}

function getFindingReviewLensLinks(finding: CertScoreFinding, scanId: string) {
  return getFindingReviewLenses(finding).map((name) => ({
    name,
    url: absoluteUrl(`/scan/${scanId}#${getRegulatoryLensAnchor(name)}`)
  }));
}

function evidenceTimestampMs(event: Record<string, unknown>) {
  return (
    finiteNumber(event.timestampMs) ??
    finiteNumber(event.observedAtMs) ??
    finiteNumber(event.firstSeenMs) ??
    finiteNumber(event.setAtMs)
  );
}

function evidenceVendorName(event: Record<string, unknown>) {
  return (
    stringValue(event.vendor) ??
    stringValue(event.vendorName) ??
    stringValue(event.endpointVendor) ??
    stringValue(event.initiatingVendor) ??
    stringValue(event.sourceVendor)
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function canonicalEvidencePhase(value: unknown) {
  if (value === "pre_consent" || value === "before_consent") {
    return "pre_consent";
  }
  if (value === "after_reject") {
    return "after_reject";
  }
  return stringValue(value);
}

function eventEvidencePhase(event: Record<string, unknown>) {
  const explicitPhase = canonicalEvidencePhase(event.phase ?? event.runtimePhase ?? event.observedPhase);
  if (explicitPhase) {
    return explicitPhase;
  }
  if (event.noConsentActionObserved === true || event.preConsent === true || event.setBeforeConsent === true) {
    return "pre_consent";
  }
  return null;
}

const REGULATORY_RUNTIME_WRAPPER_ROW_IDS = new Set([
  "pre_consent_third_party_tracking",
  "pre_consent_cookies_storage",
  "social_media_embed_pre_consent",
  "embedded_content_pre_consent",
  "session_replay_fingerprinting_review",
  "device_identification_fingerprinting_signal_observed"
]);

function policyRuntimeRetainedEvidence(details: Record<string, unknown>) {
  const policyEvidenceDetails = asRecord(details.policyEvidenceDetails);
  return {
    rowId: stringValue(policyEvidenceDetails?.rowId),
    projectedFindings: Array.isArray(policyEvidenceDetails?.projectedFindings)
      ? policyEvidenceDetails.projectedFindings
      : [],
    retainedEvidence: asRecord(policyEvidenceDetails?.retainedEvidence)
  };
}

function sourceRuntimeFindingFromWrapper(details: Record<string, unknown>, retainedEvidence: Record<string, unknown>) {
  const { projectedFindings } = policyRuntimeRetainedEvidence(details);
  const retainedProjectedFindings = Array.isArray(retainedEvidence.projectedFindings)
    ? retainedEvidence.projectedFindings
    : [];
  const retainedPreview = Array.isArray(retainedEvidence.projectedFindingPreview)
    ? retainedEvidence.projectedFindingPreview
    : [];
  return [...projectedFindings, ...retainedProjectedFindings, ...retainedPreview]
    .map(asRecord)
    .find((finding) => {
      const id = stringValue(finding?.id) ?? stringValue(finding?.findingId) ?? stringValue(finding?.unifiedFindingId);
      return Boolean(id && /pre_consent|tracking|cookie|storage|fingerprint|embedded/i.test(id));
    }) ?? null;
}

function regulatoryRuntimeWrapperEvidence(findingId: string, details: Record<string, unknown>) {
  if (!findingId.startsWith("regulatory_gap__gdpr_eprivacy__")) {
    return null;
  }
  const { rowId, retainedEvidence } = policyRuntimeRetainedEvidence(details);
  const effectiveRowId = rowId ?? findingId.replace(/^regulatory_gap__gdpr_eprivacy__/, "");
  if (!REGULATORY_RUNTIME_WRAPPER_ROW_IDS.has(effectiveRowId) || !retainedEvidence) {
    return null;
  }

  const firstRuntimeMs = [
    retainedEvidence.firstPreconsentThirdPartyTrackingObservedMs,
    retainedEvidence.firstPreconsentRequestObservedMs,
    retainedEvidence.firstPreconsentCookieOrStorageObservedMs,
    retainedEvidence.firstEmbeddedContentObservedMs,
    retainedEvidence.firstFingerprintingSignalObservedMs
  ].map(finiteNumber).find((value): value is number => value !== null);
  const timingRows = Array.isArray(retainedEvidence.preconsentTimingEvidence)
    ? retainedEvidence.preconsentTimingEvidence
    : [];
  const hasTimingAnchor = firstRuntimeMs !== undefined || timingRows.length > 0;
  const vendorAnchors = [
    stringValue(retainedEvidence.trackerPriorityLabel),
    stringValue(retainedEvidence.cookieStoragePriorityLabel),
    ...asStringArray(retainedEvidence.relatedVendors),
    ...asStringArray(retainedEvidence.runtimeVendors)
  ];
  const findingEntities = asRecord(retainedEvidence.findingEntities);
  const sourceFinding = sourceRuntimeFindingFromWrapper(details, retainedEvidence);
  const sourceFindingId =
    stringValue(sourceFinding?.id) ??
    stringValue(sourceFinding?.findingId) ??
    stringValue(sourceFinding?.unifiedFindingId);
  const sourceFindingEvidence = asRecord(sourceFinding?.evidence);
  const sourceExampleEvents = Array.isArray(sourceFindingEvidence?.exampleEvents)
    ? sourceFindingEvidence.exampleEvents
    : [];
  const sourceHasTimingAnchor = sourceExampleEvents.map(asRecord).some((event) => event && evidenceTimestampMs(event) !== null);
  const sourceHasVendorAnchor = sourceExampleEvents.map(asRecord).some((event) => event && evidenceVendorName(event) !== null);
  const hasVendorAnchor =
    uniqueStrings(vendorAnchors).length > 0 ||
    (Array.isArray(findingEntities?.vendors) && findingEntities.vendors.length > 0) ||
    sourceHasVendorAnchor;
  const effectiveHasTimingAnchor = hasTimingAnchor || sourceHasTimingAnchor;
  const retainedServiceExamples = Array.isArray(retainedEvidence.serviceConnectionExamples)
    ? retainedEvidence.serviceConnectionExamples.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row)).slice(0, 3)
    : [];

  if (!effectiveHasTimingAnchor && !hasVendorAnchor) {
    return null;
  }

  return {
    phase: effectiveRowId.startsWith("pre_consent") || effectiveRowId === "embedded_content_pre_consent"
      ? "pre_consent"
      : null,
    hasTimingAnchor: effectiveHasTimingAnchor,
    hasVendorAnchor,
    exampleEvents: retainedServiceExamples.map((row) => ({
      type: "request",
      phase: "pre_consent",
      requestUrl: safeUrl(row.requestUrl),
      urlHost: stringValue(row.host),
      initiatorType: stringValue(row.initiatorType),
      timestampMs: finiteNumber(row.firstSeenMs)
    })),
    pointer: {
      retainedEvidencePath: "policyEvidenceDetails.retainedEvidence",
      rowId: effectiveRowId,
      sourceEvidencePath: sourceFindingId ? "policyEvidenceDetails.projectedFindings" : null,
      sourceFindingId: sourceFindingId ?? null,
      firstObservedMs: firstRuntimeMs ?? null,
      retainedTimingEvidenceCount: timingRows.length
    },
    projectionWarnings: ["regulatory_gap_runtime_anchor_from_retained_checklist_evidence"]
  };
}

const POLICY_ANCHOR_KEYS = [
  "policyUrl",
  "policy_url",
  "policyPageUrl",
  "policy_page_url",
  "documentUrl",
  "document_url",
  "sourceUrl",
  "source_url",
  "url",
  "policySnippet",
  "policy_snippet",
  "policyText",
  "policy_text",
  "matchedPolicyText",
  "matched_policy_text"
];

function recordHasPolicyAnchorValue(record: Record<string, unknown> | null) {
  if (!record) {
    return false;
  }
  return POLICY_ANCHOR_KEYS.some((key) => {
    const value = record[key];
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.some((entry) => typeof entry === "string" && entry.trim().length > 0);
    }
    return false;
  });
}

export function hasMeaningfulPolicyAnchor(details: Record<string, unknown>) {
  const policyEvidence = asRecord(details.policyEvidence);
  const policyEvidenceDetails = asRecord(details.policyEvidenceDetails);
  const policyRuntimeConflict = asRecord(details.policyRuntimeConflict);
  return recordHasPolicyAnchorValue(policyEvidence) ||
    recordHasPolicyAnchorValue(policyEvidenceDetails) ||
    recordHasPolicyAnchorValue(policyRuntimeConflict);
}

export function buildCookieEvidenceExamples(findingId: string, rows: ReturnType<typeof buildRuntimeCookieInventory>["rows"]) {
  const candidates = findingId === "third_party_cookie_pre_consent"
    ? rows.filter((row) => row.party === "third_party" && row.timingEvidence === "before_consent_cookie_write")
    : findingId === "analytics_cookie_pre_consent"
      ? rows.filter((row) => row.category === "analytics" && /^(?:_ga|_gid|_gat|_ym_|_ymab_param|wisepops)/i.test(row.cookieName))
      : [];
  return candidates
    .sort((left, right) => {
      const leftTimed = left.timingEvidence === "before_consent_cookie_write" ? 0 : 1;
      const rightTimed = right.timingEvidence === "before_consent_cookie_write" ? 0 : 1;
      return leftTimed - rightTimed ||
        (left.setAtMs ?? left.firstObservedAtMs ?? Number.MAX_SAFE_INTEGER) -
          (right.setAtMs ?? right.firstObservedAtMs ?? Number.MAX_SAFE_INTEGER) ||
        left.cookieName.localeCompare(right.cookieName);
    })
    .slice(0, findingId === "analytics_cookie_pre_consent" ? 8 : 3)
    .map((row) => ({
      type: row.timingEvidence === "before_consent_cookie_write" ? "cookie_write" : "cookie_snapshot",
      phase: row.timingEvidence === "before_consent_cookie_write" ? "pre_consent" : null,
      cookieName: row.cookieName,
      cookieDomain: row.domain,
      party: row.party,
      category: row.category,
      provider: getRuntimeCookiePrimaryProvider(row),
      relatedOrInitiatingVendor: row.initiatorVendor,
      sourceRequestUrl: safeUrl(row.sourceRequestUrl),
      setMethod: row.setMethod,
      timingBasis: row.timingBasis,
      timestampMs: row.setAtMs,
      exactWriteTimeObserved: row.setAtMs !== null
    }));
}

function buildEvidence(
  finding: CertScoreFinding,
  scanId: string,
  options: {
    coverageLimitedByNoGo?: boolean;
    runtimeCookieRows?: ReturnType<typeof buildRuntimeCookieInventory>["rows"];
    scannedPageUrl?: string | null;
  } = {}
) {
  const details = finding.evidenceDetails ?? {};
  const regulatoryRuntimeEvidence = regulatoryRuntimeWrapperEvidence(finding.id, details);
  const representativeRequests = Array.isArray(details.representativeRequests) ? details.representativeRequests : [];
  const promotionGradePreconsentRequests = finding.id === "pre_consent_tracking_detected"
    ? buildPromotionGradePreconsentRequests({
        rows: [
          ...(Array.isArray(details.requestClassificationAnchors) ? details.requestClassificationAnchors : []),
          ...representativeRequests
        ],
        scannedPageUrl: options.scannedPageUrl ?? details.scanContext?.pageUrl ?? null,
        consentTimeline: asRecord(details.timing),
        maxItems: 3
      })
    : [];
  const vendors = Array.isArray(details.vendors) ? details.vendors : [];
  const firstRequest = representativeRequests[0];
  const firstRequestRecord = asRecord(firstRequest);
  const firstRequestUrl =
    typeof firstRequest?.requestUrl === "string"
      ? firstRequest.requestUrl
      : typeof firstRequest?.url === "string"
        ? firstRequest.url
        : null;
  const firstRequestEndpointVendor = inferDirectEndpointVendorFromUrl(firstRequestUrl);
  const runtimeRequestUrls = asStringArray(details.runtimeRequestUrls);
  const firstRuntimeRequestUrl = runtimeRequestUrls[0] ?? null;
  const firstRuntimeRequestEndpointVendor = inferDirectEndpointVendorFromUrl(firstRuntimeRequestUrl);
  const sourceUrls = asStringArray(details.sourceUrls);
  const pageUrls = asStringArray(details.pageUrls);
  const runtimePhase =
    (asRecord(details.policyRuntimeConflict)?.runtimeAnchor as { phase?: string } | undefined)?.phase ??
    (typeof recordValue(details.trackingEvidence, "phase") === "string" ? String(recordValue(details.trackingEvidence, "phase")) : null);
  const cookieExamples = buildCookieEvidenceExamples(finding.id, options.runtimeCookieRows ?? []);
  const cookieFinding = finding.id === "third_party_cookie_pre_consent" || finding.id === "analytics_cookie_pre_consent";
  const allowFallbackRequestExamples = finding.id !== "pre_consent_tracking_detected" && !cookieFinding;
  const fallbackExamples = allowFallbackRequestExamples
    ? [
        firstRequest
          ? {
              type: "request",
              phase: firstRequest.runtimePhase ?? (firstRequest.preConsent ? "pre_consent" : null),
              vendor: firstRequestEndpointVendor?.vendorName ?? firstRequest.vendor ?? null,
              vendorCategory: firstRequestEndpointVendor?.vendorCategory ?? firstRequest.vendorCategory ?? firstRequest.category ?? null,
              rawObservedVendor: firstRequest.vendor ?? null,
              rawObservedVendorCategory: firstRequest.vendorCategory ?? firstRequest.category ?? null,
              resolvedEndpointVendor: firstRequestEndpointVendor?.vendorName ?? null,
              resolvedEndpointVendorCategory: firstRequestEndpointVendor?.vendorCategory ?? null,
              vendorAttributionBasis: firstRequestEndpointVendor && firstRequest.vendor && firstRequestEndpointVendor.vendorName !== firstRequest.vendor
                ? `${firstRequest.vendorAttributionBasis ?? "request_row_vendor"}:${firstRequestEndpointVendor.basis}`
                : firstRequest.vendorAttributionBasis ?? firstRequestEndpointVendor?.basis ?? null,
              relatedOrInitiatingVendor: firstRequestEndpointVendor && firstRequest.vendor && firstRequestEndpointVendor.vendorName !== firstRequest.vendor ? firstRequest.vendor : null,
              projectionWarnings: firstRequestEndpointVendor && firstRequest.vendor && firstRequestEndpointVendor.vendorName !== firstRequest.vendor
                ? ["canonical_endpoint_vendor_replaced_raw_vendor"]
                : [],
              requestUrl: safeUrl(firstRequestUrl),
              frameUrl: safeUrl(recordValue(firstRequestRecord, "frameUrl") ?? recordValue(firstRequestRecord, "frame_url")),
              finalUrl: safeUrl(recordValue(firstRequestRecord, "finalUrl") ?? recordValue(firstRequestRecord, "final_url")),
              initiatorHost: stringValue(recordValue(firstRequestRecord, "initiatorHost") ?? recordValue(firstRequestRecord, "initiator_host")),
              initiatorType: stringValue(recordValue(firstRequestRecord, "initiatorType") ?? recordValue(firstRequestRecord, "initiator_type") ?? recordValue(firstRequestRecord, "initiator")),
              initiatorUrl: safeUrl(recordValue(firstRequestRecord, "initiatorUrl") ?? recordValue(firstRequestRecord, "initiator_url")),
              redirectChain: asStringArray(recordValue(firstRequestRecord, "redirectChain") ?? recordValue(firstRequestRecord, "redirect_chain")).slice(0, 8).map(safeUrl).filter((url): url is string => Boolean(url)),
              resourceType: stringValue(recordValue(firstRequestRecord, "resourceType") ?? recordValue(firstRequestRecord, "resource_type")),
              urlHost: firstRequest.hostname ?? null,
              registrableDomain: getUrlRegistrableDomain(firstRequest.hostname ?? firstRequestUrl),
              timestampMs: firstRequest.firstSeenMs ?? null
            }
          : null,
        firstRuntimeRequestUrl
          ? {
              type: "request",
              phase: runtimePhase ?? null,
              vendor: firstRuntimeRequestEndpointVendor?.vendorName ?? null,
              vendorCategory: firstRuntimeRequestEndpointVendor?.vendorCategory ?? null,
              rawObservedVendor: null,
              rawObservedVendorCategory: null,
              resolvedEndpointVendor: firstRuntimeRequestEndpointVendor?.vendorName ?? null,
              resolvedEndpointVendorCategory: firstRuntimeRequestEndpointVendor?.vendorCategory ?? null,
              vendorAttributionBasis: firstRuntimeRequestEndpointVendor?.basis ?? null,
              relatedOrInitiatingVendor: null,
              projectionWarnings: [],
              requestUrl: safeUrl(firstRuntimeRequestUrl),
              frameUrl: null,
              finalUrl: null,
              initiatorHost: null,
              initiatorType: null,
              initiatorUrl: null,
              redirectChain: [],
              resourceType: null,
              urlHost: safeHostname(firstRuntimeRequestUrl),
              registrableDomain: getUrlRegistrableDomain(firstRuntimeRequestUrl),
              timestampMs: null
            }
          : null,
        sourceUrls[0] || pageUrls[0]
          ? {
              type: "page",
              phase: null,
              vendor: null,
              urlHost: safeHostname(sourceUrls[0] ?? pageUrls[0]),
              timestampMs: null
            }
          : null
      ].filter(Boolean).slice(0, 3)
    : [];
  const requestTimelineAnchorMs = finiteNumber(recordValue(details.timing, "firstThirdPartyTrackingRequestMs")) ??
    finiteNumber(recordValue(details.timing, "firstRequestMs"));
  const promotionRequestExamples = promotionGradePreconsentRequests.map((request) => ({
        type: "request",
        phase: "pre_consent",
        scannedPageUrl: request.scannedPageUrl ?? null,
        requestUrl: request.requestUrl,
        vendor: request.vendorName,
        vendorCategory: request.vendorCategory,
        rawObservedVendor: request.rawObservedVendor,
        rawObservedVendorCategory: request.rawObservedVendorCategory,
        resolvedEndpointVendor: request.resolvedEndpointVendor,
        resolvedEndpointVendorCategory: request.resolvedEndpointVendorCategory,
        vendorAttributionBasis: request.vendorAttributionBasis,
        relatedOrInitiatingVendor: request.relatedOrInitiatingVendor,
        projectionWarnings: request.projectionWarnings,
        frameUrl: request.frameUrl,
        finalUrl: request.finalUrl,
        initiatorHost: request.initiatorHost,
        initiatorType: request.initiatorType,
        initiatorUrl: request.initiatorUrl,
        redirectChain: request.redirectChain,
        resourceType: request.resourceType,
        urlHost: request.hostname,
        registrableDomain: request.registrableDomain,
        timestampMs: request.firstSeenMs,
        consentActionMs: request.consentActionMs,
        noConsentActionObserved: request.noConsentActionObserved,
        consentSurfaceObserved: request.consentSurfaceObserved,
        consentInteractionRecorded: request.consentInteractionRecorded,
        confidence: request.confidence
      }));
  const requestTimelineExample =
    promotionRequestExamples.length > 0 &&
    !promotionRequestExamples.some((event) => event.timestampMs !== null) &&
    requestTimelineAnchorMs !== null
      ? [{
          type: "timeline_anchor",
          phase: "pre_consent",
          label: "First retained third-party tracking request",
          timestampMs: requestTimelineAnchorMs
        }]
      : [];
  const examples = cookieExamples.length > 0
    ? cookieExamples
    : promotionGradePreconsentRequests.length > 0
    ? [...promotionRequestExamples, ...requestTimelineExample]
    : fallbackExamples.length > 0
      ? fallbackExamples
      : regulatoryRuntimeEvidence?.exampleEvents ?? [];
  const exampleEvents = examples as Array<Record<string, unknown>>;
  const projectionWarnings = boundedStrings([
    options.coverageLimitedByNoGo ? "coverage_limited_by_scan_quality_no_go" : null,
    finding.id === "pre_consent_tracking_detected" && promotionGradePreconsentRequests.length === 0 && representativeRequests.length > 0
      ? "promotion_grade_preconsent_request_not_available"
      : null,
    cookieFinding && cookieExamples.length === 0 ? "concrete_cookie_or_storage_mutation_not_available" : null,
    ...cookieExamples.map((event) => event.exactWriteTimeObserved ? null : "cookie_snapshot_not_exact_write_time"),
    ...exampleEvents.flatMap((event) => asStringArray(event.projectionWarnings)),
    ...exampleEvents.map((event) => event.type === "request" && !stringValue(event.requestUrl) ? "request_event_missing_url" : null),
    ...(regulatoryRuntimeEvidence?.projectionWarnings ?? [])
  ], 12);
  const canonicalPhase =
    canonicalEvidencePhase(runtimePhase) ??
    exampleEvents.map(eventEvidencePhase).find((phase): phase is string => phase !== null) ??
    regulatoryRuntimeEvidence?.phase ??
    null;
  const observedPhase = canonicalPhase === "pre_consent" ? "before_consent" : canonicalPhase;
  const hasTimingAnchor =
    exampleEvents.some((event) => evidenceTimestampMs(event) !== null) ||
    finiteNumber(firstRequest?.firstSeenMs) !== null ||
    Boolean(finiteNumber(recordValue(details.timing, "firstRequestMs"))) ||
    Boolean(finiteNumber(recordValue(details.timing, "firstThirdPartyTrackingRequestMs"))) ||
    Boolean(regulatoryRuntimeEvidence?.hasTimingAnchor);
  const hasVendorAnchor =
    exampleEvents.some((event) => evidenceVendorName(event) !== null) ||
    vendors.length > 0 ||
    asStringArray(details.runtimeVendors).length > 0 ||
    Boolean(firstRequest?.vendor) ||
    Boolean(regulatoryRuntimeEvidence?.hasVendorAnchor);
  const hasConsentContext = Boolean(details.consentState || details.consentInteraction || /consent|reject|pre_consent/i.test(finding.id));
  const hasPolicyAnchor = hasMeaningfulPolicyAnchor(details);
  const basis = finding.section === "Accessibility"
    ? "accessibility_check"
    : canonicalPhase || hasTimingAnchor || hasVendorAnchor
      ? "runtime_observation"
      : hasPolicyAnchor
        ? "policy_surface_detection"
        : "runtime_observation";
  const summary = finding.evidencePreview[0] ?? finding.shortSummary;
  const anchorUrl = absoluteUrl(`/scan/${scanId}#finding-${finding.id}`);
  const exampleCount = Math.max(
    finding.evidencePreview.length,
    examples.length,
    regulatoryRuntimeEvidence ? 1 : 0
  );

  return {
    summary,
    observedPhase,
    exampleEvents: examples,
    projectionWarnings,
    consentContext: details.consentState
      ? {
          bannerSeen: (details.consentState as { cmpDetected?: boolean | null }).cmpDetected ?? null,
          bannerSeenAtMs: (details.consentState as { cmpVisibleMs?: number | null }).cmpVisibleMs ?? null,
          choiceRecorded: (details.consentState as { userConsentActionObserved?: boolean }).userConsentActionObserved ?? null
        }
      : null,
    retainedEvidencePointer: regulatoryRuntimeEvidence?.pointer ?? null,
    fullEvidenceUrl: anchorUrl,
    evidenceDigest: {
      basis,
      phase: canonicalPhase,
      exampleCount,
      examplesShown: examples.length,
      examplesAvailable: exampleCount,
      authRequiredForExamples: false,
      hasTimingAnchor,
      hasVendorAnchor,
      hasConsentContext,
      hasPolicyAnchor,
      projectionWarnings
    },
    anchorUrl
  };
}

function safeHostname(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname;
  } catch {
    return value.replace(/^https?:\/\//i, "").split("/")[0] ?? value;
  }
}

function toPulseFinding(
  finding: CertScoreFinding,
  scanId: string,
  options: {
    coverageLimitedByNoGo?: boolean;
    noGo?: ExternalScanNoGoResult | null;
    runtimeCookieRows?: ReturnType<typeof buildRuntimeCookieInventory>["rows"];
    scannedPageUrl?: string | null;
  } = {}
) {
  const display = getPublicReportFindingDisplay({
    confidence: finding.confidence,
    findingId: finding.id,
    label: finding.label,
    remediation: finding.remediation,
    section: finding.section,
    severity: finding.severity,
    title: finding.label
  });
  const applyNoGoCoverageFraming =
    options.coverageLimitedByNoGo &&
    finding.id !== "scan_quality_visual_no_go" &&
    getFindingReviewLenses(finding).includes("GDPR / ePrivacy");
  const evidence = buildEvidence(finding, scanId, {
    coverageLimitedByNoGo: applyNoGoCoverageFraming,
    runtimeCookieRows: options.runtimeCookieRows,
    scannedPageUrl: options.scannedPageUrl
  });
  const isNoGoFinding = finding.id === "scan_quality_visual_no_go" && Boolean(options.noGo);
  const plainEnglish = isNoGoFinding
    ? options.noGo!.explanation
    : applyNoGoCoverageFraming
    ? `Coverage-limited: ${finding.shortSummary}`
    : finding.shortSummary;
  const nextStep = isNoGoFinding
    ? options.noGo!.recommendedNextAction
    : applyNoGoCoverageFraming
    ? `Treat this as coverage-limited until a representative scan reaches the normal public site. ${display.remediation || "Review the retained evidence and confirm expected site behavior."}`
    : display.remediation || "Review the retained evidence and confirm expected site behavior.";

  return {
    id: finding.id,
    label: isNoGoFinding ? options.noGo!.title : display.title,
    criticality: display.criticality,
    confidence: applyNoGoCoverageFraming ? "moderate" : finding.confidence,
    plainEnglish,
    evidence: {
      summary: isNoGoFinding ? options.noGo!.summary : evidence.summary,
      observedPhase: evidence.observedPhase,
      exampleEvents: evidence.exampleEvents,
      projectionWarnings: evidence.projectionWarnings,
      consentContext: evidence.consentContext,
      fullEvidenceUrl: evidence.fullEvidenceUrl
    },
    evidenceDigest: evidence.evidenceDigest,
    reviewLenses: getFindingReviewLenses(finding),
    reviewLensLinks: getFindingReviewLensLinks(finding, scanId),
    anchorUrl: evidence.anchorUrl,
    nextStep
  };
}

function recordArray(record: Record<string, unknown> | null | undefined, keys: string[]) {
  return keys.flatMap((key) => {
    const value = recordValue(record, key);
    return Array.isArray(value)
      ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
      : [];
  });
}

function elapsedMsFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = finiteNumber(recordValue(record, key));
    if (value !== null && value >= 0 && value <= 10 * 60 * 1000) {
      return value;
    }
  }
  return null;
}

function buildCmpLoadOrderHighlight(scanRecord: ScanDetailResponse) {
  const runtimeArtifacts = scanRecord.runtimeArtifacts;
  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  const consentTimeline =
    asRecord(recordValue(runtimeArtifacts, "consentTimeline")) ??
    asRecord(recordValue(runtimeArtifacts, "consent_timeline")) ??
    asRecord(recordValue(hybrid, "consentTimeline")) ??
    asRecord(recordValue(hybrid, "consent_timeline"));
  const requestPurposeRows = [
    ...recordArray(runtimeArtifacts, ["requestPurposeClassificationConfidence", "request_purpose_classification_confidence"]),
    ...recordArray(hybrid, ["requestPurposeClassificationConfidence", "request_purpose_classification_confidence"])
  ];
  const trackerRequests = buildPromotionGradePreconsentRequests({
    rows: requestPurposeRows,
    consentTimeline,
    maxItems: 12
  });
  const firstClassifiedTrackerAtMs = trackerRequests
    .map((request) => request.firstSeenMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right)[0] ?? null;
  const requestRows = [
    ...recordArray(runtimeArtifacts, ["requestObservations", "request_observations", "networkRequests", "network_requests"]),
    ...recordArray(hybrid, ["requestObservations", "request_observations", "networkRequests", "network_requests"])
  ];
  const cmpRows = requestRows.flatMap((row) => {
    const requestUrl = stringValue(recordValue(row, "requestUrl")) ?? stringValue(recordValue(row, "request_url")) ?? stringValue(recordValue(row, "url"));
    const host = stringValue(recordValue(row, "hostname")) ?? stringValue(recordValue(row, "host")) ?? stringValue(recordValue(row, "domain")) ?? safeHostname(requestUrl);
    const cmpVendorName = getKnownCmpVendorName({
      domains: host ? [host] : [],
      urls: requestUrl ? [requestUrl] : []
    });
    const observedAtMs = elapsedMsFromRecord(row, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms", "timestampMs", "timestamp_ms", "tsMs", "ts_ms"]);
    return cmpVendorName && observedAtMs !== null
      ? [{ cmpVendorName, host, observedAtMs }]
      : [];
  }).sort((left, right) => left.observedAtMs - right.observedAtMs);
  const cmpScriptLoadedAtMs = cmpRows[0]?.observedAtMs ?? null;
  if (firstClassifiedTrackerAtMs === null || cmpScriptLoadedAtMs === null) {
    return null;
  }
  const cmpGapMs = cmpScriptLoadedAtMs - firstClassifiedTrackerAtMs;
  if (cmpGapMs <= 0) {
    return null;
  }
  const cmpReadyAtMs =
    finiteNumber(recordValue(consentTimeline, "cmpReadyAtMs")) ??
    finiteNumber(recordValue(consentTimeline, "cmp_ready_at_ms")) ??
    finiteNumber(recordValue(consentTimeline, "firstConsentCookieSetMs")) ??
    finiteNumber(recordValue(consentTimeline, "first_consent_cookie_set_ms")) ??
    finiteNumber(recordValue(consentTimeline, "firstConsentActionMs")) ??
    finiteNumber(recordValue(consentTimeline, "first_consent_action_ms")) ??
    finiteNumber(recordValue(consentTimeline, "firstCmpVisibleMs")) ??
    finiteNumber(recordValue(consentTimeline, "first_cmp_visible_ms")) ??
    cmpScriptLoadedAtMs;
  const trackerVendors = uniqueStrings(trackerRequests.map((request) => request.vendorName)).slice(0, 8);

  return {
    firstClassifiedTrackerAtMs,
    cmpScriptLoadedAtMs,
    cmpReadyAtMs,
    cmpGapMs,
    cmpVendorName: cmpRows[0]?.cmpVendorName ?? null,
    trackerVendors,
    hasTimingAnchor: true,
    summary: `Classified tracker activity preceded CMP infrastructure by ${Math.round(cmpGapMs)}ms.`,
    detailsUrl: absoluteUrl(`/scan/${scanRecord.scan.id}#finding-cmp_load_order_gap`)
  };
}

export function hasProjectedFingerprintingFinding(
  projectedFindings: Array<Pick<CertScoreFinding, "id">>
) {
  return projectedFindings.some((finding) =>
    finding.id === "device_identification_fingerprinting_signal_observed" ||
    finding.id.endsWith("__device_identification_fingerprinting_signal_observed")
  );
}

function buildEvidenceHighlights(
  scanRecord: ScanDetailResponse,
  trackerRows?: ReturnType<typeof buildTrackerInventoryRows>,
  projectedFindings: CertScoreFinding[] = []
) {
  const snapshot = scanRecord.snapshot;
  const groupedTrackerRows = trackerRows ? buildTrackerInventoryGroupRows(trackerRows) : [];
  const thirdPartyDomainsObserved = groupedTrackerRows.length > 0
    ? uniqueStrings(groupedTrackerRows.flatMap((row) => row.domains)).length
    : finiteNumber(recordValue(snapshot, "third_party_request_domain_count")) ??
      finiteNumber(recordValue(snapshot, "third_party_domain_count")) ??
      uniqueStrings(scanRecord.trackerVendors.map((vendor) => vendor.scriptHost)).length;
  const classifiedTrackerVendors = groupedTrackerRows.length > 0
    ? groupedTrackerRows.length
    : uniqueStrings(scanRecord.trackerVendors.map((vendor) => vendor.vendorName)).length;
  const policyRows = projectedPolicySurfaceRows(scanRecord);
  const policyTypes = uniqueStrings(policyRows.map((row) => row.type));
  const projectedFingerprintingFinding = hasProjectedFingerprintingFinding(projectedFindings);
  const legacyFingerprintIndicators =
    finiteNumber(recordValue(snapshot, "fingerprinting_indicator_count")) ??
    finiteNumber(recordValue(snapshot, "fingerprinting_signal_count")) ??
    0;
  const fingerprintIndicators = projectedFingerprintingFinding
    ? Math.max(1, legacyFingerprintIndicators)
    : legacyFingerprintIndicators;
  const probableFingerprintingDetected =
    projectedFingerprintingFinding ||
    recordValue(snapshot, "probable_fingerprinting_detected") === true ||
    recordValue(snapshot, "fingerprinting_probable") === true;
  const categories = (groupedTrackerRows.length > 0 ? groupedTrackerRows : scanRecord.trackerVendors).reduce<Record<string, number>>((accumulator, vendor) => {
    const key = "purpose" in vendor ? vendor.purpose : vendor.vendorCategory || "uncategorized";
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
  const categorySummary = Object.entries(categories)
    .slice(0, 6)
    .map(([key, count]) => `${key.replaceAll("_", " ")} ${count}`)
    .join(" | ");
  const cmpLoadOrder = buildCmpLoadOrderHighlight(scanRecord);

  return {
    trackerFootprint: {
      thirdPartyDomainsObserved,
      classifiedTrackerVendors,
      summary: `${thirdPartyDomainsObserved} third-party domains observed; ${classifiedTrackerVendors} classified tracker vendors identified.`,
      detailsUrl: absoluteUrl(`/scan/${scanRecord.scan.id}#tracker-footprint`)
    },
    policySurfaces: {
      policyUrlCount: policyRows.length,
      covered: policyTypes,
      summary: `${policyRows.length} policy URL${policyRows.length === 1 ? "" : "s"} covered.`,
      detailsUrl: absoluteUrl(`/scan/${scanRecord.scan.id}#policy-surfaces`)
    },
    fingerprinting: {
      probableFingerprintingDetected,
      indicatorCount: fingerprintIndicators,
      summary: probableFingerprintingDetected
        ? "Probable fingerprinting-related review signals were surfaced."
        : "No probable fingerprinting detected. Related indicators, if present, are retained for review.",
      detailsUrl: absoluteUrl(`/scan/${scanRecord.scan.id}#fingerprinting`)
    },
    vendorMix: {
      categories,
      namedEntityCount: classifiedTrackerVendors,
      categoryCount: Object.keys(categories).length,
      summary: categorySummary || "No classified tracker vendor categories were available.",
      detailsUrl: absoluteUrl(`/scan/${scanRecord.scan.id}#vendor-mix`)
    },
    ...(cmpLoadOrder ? { cmpLoadOrder } : {})
  };
}

function buildRecommendedActions(findings: ReturnType<typeof toPulseFinding>[]) {
  return findings.slice(0, 5).map((finding, index) => ({
    priority: index + 1,
    action: finding.nextStep,
    relatedFindings: [finding.id]
  }));
}

function buildPulseCounts(input: {
  allFindingCount: number;
  evidenceHighlights: ReturnType<typeof buildEvidenceHighlights>;
  executiveIssueCount: number;
  topFindings: ReturnType<typeof toPulseFinding>[];
}) {
  const highPriorityFindingCount = input.topFindings.filter((finding) => /^(critical|high)$/i.test(finding.criticality)).length;

  return {
    totalObservationCount: input.allFindingCount,
    totalAutomatedFindingCount: input.allFindingCount,
    executiveIssueCount: input.executiveIssueCount,
    topFindingCount: input.topFindings.length,
    highPriorityFindingCount,
    evidenceHighlightCount: Object.keys(input.evidenceHighlights).length,
    thirdPartyDomainsObserved: input.evidenceHighlights.trackerFootprint.thirdPartyDomainsObserved,
    classifiedTrackerVendors: input.evidenceHighlights.trackerFootprint.classifiedTrackerVendors,
    policyUrlCount: input.evidenceHighlights.policySurfaces.policyUrlCount,
    probableFingerprintingDetected: input.evidenceHighlights.fingerprinting.probableFingerprintingDetected
  };
}

export function deriveConsentPlatform(scanRecord: ScanDetailResponse, presentationSummary: ReturnType<typeof deriveCertScoreFindings>) {
  const runtimeArtifacts = scanRecord.runtimeArtifacts;
  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  const consentSummary = asRecord(recordValue(hybrid, "consentSummary")) ?? asRecord(recordValue(hybrid, "consent_summary"));
  const runtimePlatform =
    typeof recordValue(runtimeArtifacts, "consentPlatform") === "string"
      ? String(recordValue(runtimeArtifacts, "consentPlatform"))
      : typeof recordValue(runtimeArtifacts, "consent_platform") === "string"
        ? String(recordValue(runtimeArtifacts, "consent_platform"))
        : typeof recordValue(runtimeArtifacts, "cmpName") === "string"
          ? String(recordValue(runtimeArtifacts, "cmpName"))
          : typeof recordValue(runtimeArtifacts, "cmp_name") === "string"
          ? String(recordValue(runtimeArtifacts, "cmp_name"))
            : typeof recordValue(runtimeArtifacts, "cmp_vendor_name") === "string"
              ? String(recordValue(runtimeArtifacts, "cmp_vendor_name"))
              : typeof recordValue(consentSummary, "cmpName") === "string"
                ? String(recordValue(consentSummary, "cmpName"))
                : null;
  if (runtimePlatform) {
    return runtimePlatform.replace(/\s+CMP$/i, "");
  }

  const cmpEntity = presentationSummary.topObservedEntities.find((entity) => entity.category === "cmp");
  if (cmpEntity?.label) {
    return cmpEntity.label.replace(/\s+CMP$/i, "");
  }

  const cmpVendor = scanRecord.trackerVendors.find((vendor) =>
    /consent|cmp|cookie compliance/i.test(`${vendor.vendorCategory ?? ""} ${vendor.vendorName ?? ""}`)
  );
  if (cmpVendor?.vendorName) {
    return cmpVendor.vendorName.replace(/\s+CMP$/i, "");
  }
  return scanRecord.trackerVendors
    .map((vendor) => getKnownCmpVendorForHost(vendor.scriptHost) ?? getKnownCmpVendorForHost(vendor.vendorName))
    .find((vendor): vendor is string => Boolean(vendor)) ?? null;
}

function buildSummaryArtifact(input: {
  base: Record<string, unknown>;
  standard: Record<string, unknown>;
  timestamps: Record<string, unknown>;
}) {
  const baseLinks = asRecord(input.base.links) ?? {};
  return {
    type: "certscore_pulse_summary",
    meta: input.base.meta,
    domain: input.base.domain,
    scanId: input.base.scanId,
    scan_id: input.base.scan_id,
    scanStatus: input.base.scanStatus,
    resultDisposition: input.base.resultDisposition,
    noGo: input.base.noGo,
    timestamps: input.timestamps,
    summary: input.base.summary,
    executiveSummary: input.base.executiveSummary,
    surfacedResults: input.base.surfacedResults,
    counts: input.base.counts,
    topFindings: input.base.topFindings,
    coverage: input.standard.coverage ?? input.base.coverage,
    links: {
      summaryJsonUrl: baseLinks.summaryJsonUrl,
      evidenceJsonUrl: baseLinks.evidenceJsonUrl,
      fullReportUrl: baseLinks.fullReportUrl,
      markdownUrl: baseLinks.markdownUrl,
      docsUrl: baseLinks.docsUrl,
      findingsReferenceUrl: baseLinks.findingsReferenceUrl,
      jsonUrl: baseLinks.jsonUrl,
      scanJsonUrl: baseLinks.scanJsonUrl,
      fullJsonUrl: baseLinks.fullJsonUrl
    },
    feedback: input.base.feedback,
    capabilities: input.base.capabilities,
    agentInterpretation: input.base.agentInterpretation,
    disclaimer: input.base.disclaimer
  };
}

function consentChoicesFromProjectedChecklistRows(rows: Array<{
  assessmentStatus: string;
  evidenceRefs?: string[];
  id: string;
  status: string;
}>): Record<string, unknown> | null {
  const controlIds = new Set([
    "accept_consent_control",
    "options_settings_preferences_control",
    "reject_all_path_availability"
  ]);
  const controlRows = rows.filter((row) => controlIds.has(row.id));
  if (controlRows.length === 0) return null;

  const stateFor = (id: string) => {
    const row = controlRows.find((candidate) => candidate.id === id);
    if (!row) return null;
    if (row.status === "Observed") return true;
    if (row.status === "Not observed" || (id === "reject_all_path_availability" && row.status === "Gap observed")) return false;
    return null;
  };
  const labelsFor = (id: string) => {
    const row = controlRows.find((candidate) => candidate.id === id);
    return (row?.evidenceRefs ?? [])
      .filter((ref) => ref.startsWith("Visible choice:"))
      .map((ref) => ref.slice("Visible choice:".length).trim())
      .filter(Boolean);
  };

  return {
    acceptControlObserved: stateFor("accept_consent_control"),
    actionableControlInventoryRetained: controlRows.some((row) => row.evidenceRefs?.length),
    capturedBeforeInteraction: true,
    controlInventoryComplete: controlRows.every((row) => row.assessmentStatus === "checked"),
    controls: [],
    layerInspected: "first_layer",
    managePreferencesControlObserved: stateFor("options_settings_preferences_control"),
    rejectControlObserved: stateFor("reject_all_path_availability"),
    visibleChoiceLabels: [
      ...labelsFor("accept_consent_control"),
      ...labelsFor("options_settings_preferences_control"),
      ...labelsFor("reject_all_path_availability")
    ]
  };
}

function buildEvidenceArtifact(input: {
  allFindings: CertScoreFinding[];
  base: Record<string, unknown>;
  coverage: ReturnType<typeof deriveCoverage>;
  executive: ReturnType<typeof projectExecutiveFindingsFromUnifiedPackets>;
  reportSurface: ReturnType<typeof buildPulseReportSurface>;
  scanRecord: ScanDetailResponse;
  standard: Record<string, unknown>;
  timestamps: Record<string, unknown>;
}) {
  const scanRecord = input.scanRecord;
  const baseLinks = asRecord(input.base.links) ?? {};
  const runtimeArtifacts = asRecord(scanRecord.runtimeArtifacts);
  const hybrid = getHybridRuntimeEvidence(scanRecord.runtimeArtifacts);
  const retainedFirstLayerConsentChoices =
    asRecord(recordValue(runtimeArtifacts, "firstLayerConsentChoices")) ??
    asRecord(recordValue(hybrid, "firstLayerConsentChoices")) ??
    asRecord(recordValue(hybrid, "first_layer_consent_choices"));
  const retainedControlRows = retainedFirstLayerConsentChoices && Array.isArray(retainedFirstLayerConsentChoices.controls)
    ? retainedFirstLayerConsentChoices.controls
    : [];
  const retainedVisibleLabels = retainedFirstLayerConsentChoices && Array.isArray(retainedFirstLayerConsentChoices.visibleChoiceLabels)
    ? retainedFirstLayerConsentChoices.visibleChoiceLabels
    : [];
  const hasRetainedConsentChoices = Boolean(
    retainedFirstLayerConsentChoices &&
    (retainedControlRows.length > 0 || retainedVisibleLabels.length > 0 || (
      retainedFirstLayerConsentChoices.layerInspected === "first_layer" &&
      retainedFirstLayerConsentChoices.actionableControlInventoryRetained === true
    ))
  );
  const firstLayerConsentChoices = hasRetainedConsentChoices
    ? retainedFirstLayerConsentChoices
    : consentChoicesFromProjectedChecklistRows(input.reportSurface.reportableGdprRows);
  const consentSummary = asRecord(recordValue(runtimeArtifacts, "consentSummary")) ?? asRecord(recordValue(runtimeArtifacts, "consent_summary")) ?? asRecord(recordValue(hybrid, "consentSummary")) ?? asRecord(recordValue(hybrid, "consent_summary"));
  const networkSummary = asRecord(recordValue(runtimeArtifacts, "networkSummary")) ?? asRecord(recordValue(runtimeArtifacts, "network_summary")) ?? asRecord(recordValue(hybrid, "networkSummary")) ?? asRecord(recordValue(hybrid, "network_summary"));
  const storageSummary = asRecord(recordValue(runtimeArtifacts, "storageSummary")) ?? asRecord(recordValue(runtimeArtifacts, "storage_summary")) ?? asRecord(recordValue(hybrid, "storageSummary")) ?? asRecord(recordValue(hybrid, "storage_summary"));
  const navigationSummary = asRecord(recordValue(runtimeArtifacts, "navigationSummary")) ?? asRecord(recordValue(runtimeArtifacts, "navigation_summary")) ?? asRecord(recordValue(hybrid, "navigationSummary")) ?? asRecord(recordValue(hybrid, "navigation_summary"));
  const policySurfaceRows = projectedPolicySurfaceRows(scanRecord);
  const sanitizedRequestEvidenceRows = buildSanitizedRequestEvidenceRows(hybrid);
  const requestTimingRows = input.reportSurface.runtimeTrackerPriorityRows.map((row) => ({
    vendor: row.vendor,
    purpose: row.purpose,
    priority: row.priority,
    party: row.party,
    firstSeenMs: row.firstSeenMs,
    requestCount: row.requestCount ?? null
  }));
  const checklistRows = input.reportSurface.reportableGdprRows.map((row) => {
    const retainedEvidence = asRecord(row.criticalEvidence?.retainedEvidence);
    const policyEvidenceProvenance = asRecord(retainedEvidence?.policyEvidenceProvenance);
    return {
    id: row.id,
    label: row.label,
    status: row.status,
    evidenceLabel: row.evidenceLabel,
    assessmentDirection: row.assessmentDirection,
    assessmentStatus: row.assessmentStatus,
    explanation: row.explanation,
    note: row.note,
    evidenceRefs: row.evidenceRefs?.slice(0, 12) ?? [],
    retainedEvidence: retainedEvidence
      ? {
        ...safeRecordSubset(retainedEvidence, [
          "basis",
          "statusBasis",
          "provider",
          "providerCategory",
          "domain",
          "firstSeenMs",
          "consentState",
          "cookieStoragePriority",
          "thirdPartyRequestCount",
          "cookiesBeforeConsentCount",
          "defaultToggleStatesObserved",
          "nonEssentialDefaultsOff",
          "precheckedOptionalPurposeCount"
        ]),
        policyEvidenceProvenance: policyEvidenceProvenance
          ? safeRecordSubset(policyEvidenceProvenance, [
              "bannerLanguage",
              "contractVersion",
              "detectedLanguage",
              "directlyLinkedFromScannedPage",
              "discoveryMethod",
              "documentOwnerEntity",
              "effectiveDate",
              "lastUpdatedText",
              "ownershipConfidence",
              "policyTitle",
              "retrievalTimestamp",
              "sectionHeading",
              "sourceUrl",
              "targetRelationship",
              "translationApplied",
              "translationTargetLanguage"
            ])
          : null
      }
      : null
    };
  });
  const coverageLimitedByNoGo = input.allFindings.some((finding) => finding.id === "scan_quality_visual_no_go");
  const findings = input.allFindings.map((finding) => toPulseFinding(finding, scanRecord.scan.id, {
    coverageLimitedByNoGo,
    noGo: projectExternalScanNoGo(scanRecord.runtimeArtifacts)?.noGo,
    runtimeCookieRows: input.reportSurface.runtimeCookieRows,
    scannedPageUrl: scanRecord.accessPostureSummary?.finalEffectiveUrl ?? `https://${scanRecord.scan.domainHostname}/`
  }));
  const rejectedTrackerHostRows = rejectedDisplayHostnameRows(scanRecord.trackerVendors.map((vendor) => vendor.scriptHost));
  const rejectedTrackerDomainRows = rejectedDisplayHostnameRows(input.reportSurface.trackerInventoryRows.flatMap((row) => row.domains));

  return {
    type: "certscore_pulse_evidence",
    meta: {
      ...(asRecord(input.base.meta) ?? {}),
      projectionVersion: PULSE_PROJECTION_VERSION,
      schemaVersion: PULSE_SCHEMA_VERSION,
      canonicalResolverVersion: CANONICAL_VENDOR_RESOLVER_VERSION,
      evidenceSafety: "bounded_structured_public_evidence"
    },
    domain: input.base.domain,
    scanId: input.base.scanId,
    scan_id: input.base.scan_id,
    scanStatus: input.base.scanStatus,
    resultDisposition: input.base.resultDisposition,
    noGo: input.base.noGo,
    timestamps: input.timestamps,
    summary: input.base.summary,
    executiveSummary: input.base.executiveSummary,
    surfacedResults: input.base.surfacedResults,
    evidenceSafetyNotes: [
      "This packet contains bounded structured evidence for review, not raw browser capture.",
      "Raw cookie values, raw request/response bodies, sensitive payloads, full DOM, raw Nano reasoning, and unredacted query values are not included.",
      "CertScore.ai outputs are automated public-web observations for review and are not legal advice or a compliance determination."
    ],
    projectionDiagnostics: {
      projectionWarnings: capArray(
        boundedStrings(findings.flatMap((finding) => asStringArray(finding.evidence?.projectionWarnings)), 50),
        50
      ),
      domainFiltering: {
        domainsRejected: capArray(rejectedTrackerDomainRows, 40),
        hostsRejected: capArray(rejectedTrackerHostRows, 40)
      }
    },
    calibrationContext: {
      ...projectPulseCalibrationContext(scanRecord),
      gdprTransparencyTopicCandidates: capArray(
        scanRecord.policyEnrichment.flatMap((row) => projectGdprTransparencyTopicCandidateSummary(row.gdprTransparencyTopicCandidateSummary)),
        80
      )
    },
    projectedFindings: capArray(findings, 100),
    gdprEprivacyChecklistRows: capArray(checklistRows, 120),
    retainedEvidence: {
      findingEvidence: capArray(
        findings.map((finding) => ({
          id: finding.id,
          label: finding.label,
          evidence: finding.evidence,
          evidenceDigest: finding.evidenceDigest
        })),
        100
      ),
      publicReportProjection: {
        surfacedFindingCount: input.allFindings.length,
        surfacedPacketCount: input.executive.surfacedPackets.length,
        groupedFindings: input.executive.groupedFindings.map((group) => ({
          section: group.section,
          findingIds: group.findings.map((finding) => finding.id)
        }))
      }
    },
    trackerVendorInventory: capArray(
      buildTrackerInventoryGroupRows(input.reportSurface.trackerInventoryRows).map((vendor) => ({
        name: vendor.vendor,
        category: vendor.purpose,
        host: vendor.domains[0] ?? null,
        domains: vendor.domains,
        cookieNames: vendor.cookieNames,
        rawProducts: vendor.rawProducts,
        attributionSignatures: vendor.attributionSignatures,
        beforeConsent: vendor.preConsent,
        firstSeenMs: vendor.firstSeenMs,
        confidence: vendor.confidence,
        attributionEvidence: vendor.attributionEvidence ?? null
      })),
      150
    ),
    trackerRows: capArray(input.reportSurface.trackerInventoryRows, 150),
    trackerFootprintBreakdown: buildTrackerFootprintBreakdown(input.reportSurface),
    rawHostInventory: capArray(buildRawHostInventory(input.reportSurface), 150),
    cookieStorageInventory: capArray(
      input.reportSurface.runtimeCookieRows.map((row) => {
        const primaryProvider = getRuntimeCookiePrimaryProvider(row);
        return {
          cookieName: row.cookieName,
          domain: row.domain,
          party: row.party,
          category: row.category,
          nonEssential: row.nonEssential,
          essentiality: row.essentiality ?? "unknown",
          essentialityConfidence: row.essentialityConfidence ?? null,
          essentialityReasonCodes: row.essentialityReasonCodes ?? [],
          essentialitySource: row.essentialitySource ?? "unknown",
          description: row.description ?? null,
          dataTypes: row.dataTypes ?? [],
          firstObservedAtMs: row.firstObservedAtMs,
          setAtMs: row.setAtMs,
          primaryProvider,
          relatedOrInitiatingVendor: row.initiatorVendor && row.initiatorVendor !== primaryProvider ? row.initiatorVendor : null,
          initiatorDomain: row.initiatorDomain,
          initiatorUrl: safeUrl(row.initiatorUrl),
          initiatorVendor: row.initiatorVendor,
          responseUrl: safeUrl(row.responseUrl),
          sourceRequestUrl: safeUrl(row.sourceRequestUrl),
          setMethod: row.setMethod,
          timingBasis: row.timingBasis,
          evidenceGrade: row.evidenceGrade,
          timingEvidence: row.timingEvidence
        };
      }),
      150
    ),
    requestTimingSummary: {
      rows: capArray(requestTimingRows, 150),
      networkSummary: safeRecordSubset(networkSummary, [
        "totalRequestCount",
        "thirdPartyRequestCount",
        "thirdPartyDomainCount",
        "preConsentRequestCount",
        "preConsentThirdPartyRequestCount",
        "collectionEndpointCount",
        "identifierLikeRequestCount"
      ])
    },
    requestEvidenceInventory: capArray(sanitizedRequestEvidenceRows, 50),
    consentSurfaceEvidence: {
      firstLayerConsentChoices: safeRecordSubset(firstLayerConsentChoices, [
        "acceptControlObserved",
        "acceptLabels",
        "actionableControlInventoryRetained",
        "capturedBeforeInteraction",
        "controlInventoryComplete",
        "controls",
        "defaultToggleStatesObserved",
        "defaultTogglePurposeLabels",
        "layerInspected",
        "managePreferencesControlObserved",
        "nonEssentialDefaultsOff",
        "observedAtMs",
        "policyLinks",
        "precheckedOptionalPurposeCount",
        "precheckedOptionalPurposeLabels",
        "preferenceLabels",
        "postClickEnforcementTested",
        "rejectControlObserved",
        "rejectLabels",
        "screenshotRefs",
        "textSnippet",
        "visibleChoiceLabels"
      ]),
      consentSummary: safeRecordSubset(consentSummary, [
        "bannerPresent",
        "cmpDetected",
        "cmpFrameworkSignalObserved",
        "cmpName",
        "cmpRuntimeSignalLabels",
        "consentSurfaceObserved",
        "firstVisibleMs",
        "postClickEnforcementTested",
        "requestsBeforeAnyConsentAction",
        "userConsentActionObserved"
      ])
    },
    storageEvidenceSummary: {
      ...safeRecordSubset(storageSummary, [
        "cookiesBeforeConsentCount",
        "distinctCookieCount",
        "distinctPreConsentCookieCount",
        "timedCookieWriteCount",
        "timedPreConsentCookieWriteCount",
        "initialCookieSnapshotCount",
        "periodicCookieSnapshotCount",
        "thirdPartyCookieBeforeConsentCount",
        "localStorageBeforeConsentCount",
        "sessionStorageBeforeConsentCount",
        "storageTouched"
      ]),
      eligibleNonEssentialPreConsentStorageCount: input.reportSurface.runtimeCookieRows.filter(isEligibleNonEssentialPreconsentStorageRow).length,
      observedNonEssentialPreConsentStorageCount:
        hasUnresolvedNonEssentialPreconsentStorageEvidence(input.reportSurface.runtimeCookieRows) &&
        countEligibleNonEssentialPreconsentStorageMetricRows(input.reportSurface.runtimeCookieRows) === 0
          ? null
          : countEligibleNonEssentialPreconsentStorageMetricRows(input.reportSurface.runtimeCookieRows),
      provenTimestampedPreConsentCookieWriteCount: input.reportSurface.runtimeCookieRows.filter((row) => row.timingEvidence === "before_consent_cookie_write" && row.setAtMs !== null).length,
      lateOrInitialSnapshotCookieCount: input.reportSurface.runtimeCookieRows.filter((row) => row.timingEvidence === "initial_cookie_snapshot" || row.timingEvidence === "periodic_cookie_snapshot").length
    },
    policySurfaceCoverage: capArray(
      policySurfaceRows.map(({ row, type, url }) => ({
        type,
        url,
        title: typeof row.policy_page_title === "string" ? row.policy_page_title.slice(0, 160) : null,
        detectedLanguage:
          typeof (row as unknown as Record<string, unknown>).detectedLanguage === "string"
            ? ((row as unknown as Record<string, unknown>).detectedLanguage as string).slice(0, 40)
            : typeof (row as unknown as Record<string, unknown>).detected_language === "string"
              ? ((row as unknown as Record<string, unknown>).detected_language as string).slice(0, 40)
              : null,
        directlyLinkedFromScannedPage:
          typeof (row as unknown as Record<string, unknown>).directlyLinkedFromScannedPage === "boolean"
            ? (row as unknown as Record<string, unknown>).directlyLinkedFromScannedPage
            : typeof (row as unknown as Record<string, unknown>).directly_linked_from_scanned_page === "boolean"
              ? (row as unknown as Record<string, unknown>).directly_linked_from_scanned_page
              : null,
        discoveryMethod:
          typeof (row as unknown as Record<string, unknown>).discoveryMethod === "string"
            ? ((row as unknown as Record<string, unknown>).discoveryMethod as string).slice(0, 120)
            : typeof (row as unknown as Record<string, unknown>).discovery_method === "string"
              ? ((row as unknown as Record<string, unknown>).discovery_method as string).slice(0, 120)
              : null,
        retrievalTimestamp:
          typeof (row as unknown as Record<string, unknown>).retrievedAt === "string"
            ? ((row as unknown as Record<string, unknown>).retrievedAt as string).slice(0, 80)
            : typeof (row as unknown as Record<string, unknown>).retrievalTimestamp === "string"
              ? ((row as unknown as Record<string, unknown>).retrievalTimestamp as string).slice(0, 80)
              : null,
        translationApplied:
          typeof (row as unknown as Record<string, unknown>).translationApplied === "boolean"
            ? (row as unknown as Record<string, unknown>).translationApplied
            : null,
        lastUpdatedText:
          typeof (row as unknown as Record<string, unknown>).lastUpdatedText === "string"
            ? ((row as unknown as Record<string, unknown>).lastUpdatedText as string).slice(0, 160)
            : typeof (row as unknown as Record<string, unknown>).policy_last_updated_text === "string"
              ? ((row as unknown as Record<string, unknown>).policy_last_updated_text as string).slice(0, 160)
              : null,
        projectionWarnings: policySurfaceUrlRecoveredFromAlternateField(row as unknown as Record<string, unknown>)
          ? ["policy_surface_url_recovered_from_alternate_field"]
          : []
      })),
      80
    ),
    coverageDiagnostics: {
      accessPosture: scanRecord.accessPostureSummary,
      interruptions: input.coverage.interruptions,
      navigationSummary: safeRecordSubset(navigationSummary, ["effectiveScannedPageUrl", "finalUrl", "status", "httpStatus", "landedOnDifferentHost", "redirectChain", "requestedUrl"])
    },
    links: {
      summaryJsonUrl: baseLinks.summaryJsonUrl,
      evidenceJsonUrl: baseLinks.evidenceJsonUrl,
      fullReportUrl: baseLinks.fullReportUrl,
      markdownUrl: baseLinks.markdownUrl,
      docsUrl: baseLinks.docsUrl,
      findingsReferenceUrl: baseLinks.findingsReferenceUrl
    },
    feedback: input.base.feedback,
    capabilities: input.base.capabilities,
    agentInterpretation: input.base.agentInterpretation,
    disclaimer: input.base.disclaimer
  };
}


function buildSummary(input: {
  benchmark: string | null;
  coverageLimited: boolean;
  domain: string;
  findings: CertScoreFinding[];
  score: number | null;
}) {
  const primaryReviewAreas = uniqueStrings(
    input.findings.slice(0, 5).map((finding) => {
      if (/consent|reject|cookie/i.test(finding.id)) {
        return "consent_timing";
      }
      if (/third|tracking|vendor|request/i.test(finding.id)) {
        return "third_party_collection";
      }
      if (/accessibility|contrast|keyboard|label|alternative/i.test(finding.id)) {
        return "accessibility";
      }
      if (/policy|disclosure|terms/i.test(finding.id)) {
        return "policy_surfaces";
      }
      return finding.section.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    })
  );
  const noFindings = input.findings.length === 0;
  const humanSummary = noFindings
    ? "No major automated review signals were surfaced in this scan."
    : `Automated scan surfaced ${primaryReviewAreas.slice(0, 3).map((area) => area.replaceAll("_", " ")).join(", ")} review signals.`;

  return {
    headline: noFindings
      ? "No major automated review signals were surfaced in this scan."
      : "Automated scan surfaced public-web review signals with retained evidence.",
    completionSummary: `CertScore.ai Pulse completed a scan of ${input.domain}.`,
    score: input.score,
    riskLevel: input.score === null ? "unknown" : riskLevelFromScore(input.score),
    benchmark: input.benchmark,
    humanSummary,
    machineSummary: {
      primaryReviewAreas,
      materialSignals: input.findings.length > 0,
      limitedCoverage: input.coverageLimited
    }
  };
}

function buildConfidence(findings: CertScoreFinding[], coverageStatus: string) {
  if (coverageStatus !== "complete") {
    return {
      overall: findings.some((finding) => finding.confidence === "strong") ? "moderate" : "low",
      reason: "Surfaced findings include retained evidence, and scan coverage had limitations."
    };
  }
  return {
    overall: findings.some((finding) => finding.confidence === "strong") ? "strong" : "moderate",
    reason: "Surfaced findings include retained evidence from the public scan projection."
  };
}

export function buildPulseProjection(input: PulseProjectionInput) {
  const hydratedScanRecord = {
    ...input.scanRecord,
    runtimeArtifacts: withPersistedFirstLayerConsentEvidence(
      asRecord(input.scanRecord.runtimeArtifacts),
      asRecord(input.scanRecord.snapshot)
    ) as ScanDetailResponse["runtimeArtifacts"]
  } as ScanDetailResponse;
  const generated = generatedAt();
  const scan = hydratedScanRecord.scan;
  const domain = scan.domainHostname ?? safeHostname(input.requestedUrl) ?? "unknown";
  const pulseNoGoState = buildPulseNoGoState(hydratedScanRecord.runtimeArtifacts);
  const noGoProjection = pulseNoGoState
    ? { resultDisposition: pulseNoGoState.resultDisposition, noGo: pulseNoGoState.noGo }
    : null;
  const effectiveScanStatus = pulseNoGoState?.scanStatus ?? scan.status;
  const coverage = deriveCoverage(hydratedScanRecord);
  const quality = assessPulseScanRecordQuality(hydratedScanRecord);
  const persistedCanonicalProjection = getPersistedCanonicalReportProjection(hydratedScanRecord);
  const packets = (persistedCanonicalProjection
    ? filterContradictoryPositiveSurfaceFindings(persistedCanonicalProjection.ownerUnifiedFindings)
    : null) ??
    buildScanReportUnifiedFindings(hydratedScanRecord);
  const reportSurface = buildPulseReportSurface({
    coverageLimited: coverage.status !== "complete",
    scanRecord: hydratedScanRecord,
    unifiedFindingPackets: packets
  });
  const executive = reportSurface.executive;
  const allFindings = reportSurface.allFindings;
  const score = noGoProjection ? null : reportSurface.score;
  const coverageLimitedByNoGo = allFindings.some((finding) => finding.id === "scan_quality_visual_no_go");
  const topFindings = reportSurface.topFindings.map((finding) => toPulseFinding(finding, scan.id, {
    coverageLimitedByNoGo,
    noGo: noGoProjection?.noGo,
    runtimeCookieRows: reportSurface.runtimeCookieRows,
    scannedPageUrl: hydratedScanRecord.accessPostureSummary?.finalEffectiveUrl ?? `https://${scan.domainHostname}/`
  }));
  const benchmark = hydratedScanRecord.domainBenchmark
    ? `${hydratedScanRecord.domainBenchmark.industry} / ${hydratedScanRecord.domainBenchmark.estimatedRankLabel}`
    : null;
  const summary = buildSummary({
    benchmark,
    coverageLimited: coverage.status !== "complete",
    domain,
    findings: allFindings,
    score
  });
  if (noGoProjection) {
    summary.headline = noGoProjection.noGo.title;
    summary.completionSummary = noGoProjection.noGo.summary;
    summary.humanSummary = noGoProjection.noGo.explanation;
    summary.score = null;
    summary.riskLevel = "unknown";
  }
  const topFindingCount = topFindings.length;
  const evidenceHighlights = buildEvidenceHighlights(
    hydratedScanRecord,
    reportSurface.trackerInventoryRows,
    allFindings
  );
  const counts = buildPulseCounts({
    allFindingCount: allFindings.length,
    evidenceHighlights,
    executiveIssueCount: topFindings.length,
    topFindings
  });
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(hydratedScanRecord.runtimeArtifacts);
  const networkSummary = asRecord(recordValue(hybridRuntimeEvidence, "networkSummary"));
  const preConsentStorageAssessment = buildPreConsentStorageAssessment({
    hybridRuntimeEvidence,
    runtimeArtifacts: hydratedScanRecord.runtimeArtifacts,
    runtimeCookieRows: reportSurface.runtimeCookieRows
  });
  const storageMetric = projectPreConsentStorageMetric(preConsentStorageAssessment);
  const nonEssentialPreConsentStorageCount = storageMetric.value;
  const unclassifiedPreConsentStorageCount = preConsentStorageAssessment.unclassifiedCount;
  const cookiesBeforeConsentCount = nonEssentialPreConsentStorageCount;
  const policySurfaces = projectedPolicySurfaceRows(hydratedScanRecord).map(({ type, url }) => ({
    type,
    title: meaningfulPolicySurfaceTitle(type, url),
    url
  }));
  const allThirdPartyRequestCount = finiteNumber(recordValue(networkSummary, "thirdPartyRequestCount")) ??
    reportSurface.presentationSummary.thirdPartyRequestCount;
  const trackerFootprintBreakdown = buildTrackerFootprintBreakdown(reportSurface);
  const selectedScoreStatus = reportSurface.customerScoreAssessment.scoreStatus;
  const selectedWithholdingReason = reportSurface.customerScoreAssessment.withholdingReason;
  const executiveSummary = {
    completionSummary: summary.completionSummary,
    domain,
    score,
    scoreLabel: score === null ? "Not available" : `${score}/100`,
    scoreMetadata: {
      coverageConfidence: reportSurface.customerScoreAssessment.coverageConfidence,
      coverageRatio: reportSurface.customerScoreAssessment.coverageRatio,
      kind: reportSurface.customerScoreAssessment.scoreKind,
      metricLabel: "Overall score",
      source: reportSurface.customerScoreAssessment.scoreSource,
      status: selectedScoreStatus,
      version: reportSurface.customerScoreAssessment.scoreVersion,
      withholdingReason: selectedWithholdingReason
    },
    riskLevel: summary.riskLevel,
    actionLabel: getPulseExecutiveActionLabel(executive.posture),
    benchmark,
    issuesToReview: topFindings.length,
    thirdPartyRequests: allThirdPartyRequestCount,
    trackingClassifiedThirdPartyRequests: reportSurface.presentationSummary.thirdPartyRequestCount,
    cookiesPreConsent: cookiesBeforeConsentCount,
    nonEssentialPreConsentStorage: nonEssentialPreConsentStorageCount,
    unclassifiedPreConsentStorageCount,
    preConsentStorageAssessment,
    storageMetricLabel: storageMetric.label,
    storageMetricScope: storageMetric.scope,
    storageMetricStatus: storageMetric.status,
    storageMetricExplanation: storageMetric.explanation,
    totalStorageRecordsPresentBeforeRecordedConsent:
      preConsentStorageAssessment.attributedPreConsentRecordCount,
    consentPlatform: deriveConsentPlatform(hydratedScanRecord, reportSurface.presentationSummary),
    trackerFootprint: {
      vendors: trackerFootprintBreakdown.providerFamilies,
      domains: trackerFootprintBreakdown.domains,
      trackers: trackerFootprintBreakdown.trackers,
      functionalServices: trackerFootprintBreakdown.functionalServices,
      consentPlatforms: trackerFootprintBreakdown.consentPlatforms,
      cdns: trackerFootprintBreakdown.cdns,
      rawHosts: trackerFootprintBreakdown.rawHosts,
      cookies: trackerFootprintBreakdown.cookies
    },
    policySurfaces,
    scanTimeSeconds:
      scan.completedAt && scan.startedAt
        ? Math.max(0, Number(((new Date(scan.completedAt).getTime() - new Date(scan.startedAt).getTime()) / 1000).toFixed(1)))
        : null
  };
  const surfacedResults = {
    summaryLine: `${summary.completionSummary} The executive report surfaced ${topFindings.length} issue${topFindings.length === 1 ? "" : "s"} to review.`,
    gdprEprivacyFindings: topFindings.map((finding) => ({
      id: finding.id,
      label: finding.label,
      status: finding.evidence?.summary ?? finding.plainEnglish,
      criticality: finding.criticality,
      confidence: finding.confidence,
      evidenceUrl: finding.evidence?.fullEvidenceUrl ?? finding.anchorUrl
    })),
    preConsentTrackers: reportSurface.preConsentTrackerRows,
    coverageNote: coverage.summary
  };
  const tinySummary =
    topFindingCount === 0 &&
    summary.score !== null &&
    (summary.score < 70 || !["clear", "monitor"].includes(summary.riskLevel))
      ? {
          headline: summary.headline,
          score: summary.score,
          riskLevel: summary.riskLevel,
          coverageNote:
            "Score reflects scan coverage limitations. No specific findings were surfaced. Review the full report for coverage diagnostics."
        }
      : {
          headline: summary.headline,
          score: summary.score,
          riskLevel: summary.riskLevel
        };
  const timestamps = {
    createdAt: scan.createdAt,
    startedAt: scan.startedAt,
    completedAt: scan.completedAt,
    generatedAt: generated,
    lastUpdatedAt: scan.completedAt ?? scan.startedAt ?? scan.createdAt
  };
  const links = {
    canonicalPulseUrl: absoluteUrl(`/pulse/${domain}`),
    jsonUrl: absoluteUrl(`/api/v1/pulse?url=${encodeURIComponent(input.requestedUrl ?? domain)}`),
    markdownUrl: absoluteUrl(`/api/v1/pulse?url=${encodeURIComponent(input.requestedUrl ?? domain)}&format=markdown`),
    summaryJsonUrl: absoluteUrl(`/api/v1/pulse?scanId=${scan.id}&detail=summary`),
    evidenceJsonUrl: absoluteUrl(`/api/v1/pulse?scanId=${scan.id}&detail=evidence`),
    fullJsonUrl: absoluteUrl(`/api/v1/pulse?url=${encodeURIComponent(input.requestedUrl ?? domain)}&detail=full`),
    scanJsonUrl: absoluteUrl(`/api/v1/pulse?scanId=${scan.id}`),
    immutableJsonUrl: absoluteUrl(`/api/v1/pulse?scanId=${scan.id}`),
    immutableMarkdownUrl: absoluteUrl(`/api/v1/pulse?scanId=${scan.id}&format=markdown`),
    immutableFullJsonUrl: absoluteUrl(`/api/v1/pulse?scanId=${scan.id}&detail=full`),
    fullReportUrl: absoluteUrl(`/scan/${scan.id}`),
    docsUrl: absoluteUrl("/api-pulse"),
    findingsReferenceUrl: absoluteUrl("/findings")
  };
  const feedback = {
    prompt: "Was this Pulse useful?",
    email: PULSE_FEEDBACK_EMAIL,
    feedbackUrl: absoluteUrl(`/pulse/feedback?pulseRequestId=${input.pulseRequestId}`),
    positiveUrl: absoluteUrl(`/pulse/feedback?pulseRequestId=${input.pulseRequestId}&rating=useful`),
    negativeUrl: absoluteUrl(`/pulse/feedback?pulseRequestId=${input.pulseRequestId}&rating=not_useful`)
  };
  const base = {
    type: "certscore_pulse",
    meta: {
      apiVersion: PULSE_API_VERSION,
      schemaVersion: PULSE_SCHEMA_VERSION,
      pulseVersion: PULSE_VERSION,
      projectionVersion: PULSE_PROJECTION_VERSION,
      reportProjectionVersion:
        typeof hydratedScanRecord.snapshot?.report_projection_version === "string"
          ? hydratedScanRecord.snapshot.report_projection_version
          : null,
      reportProjectionSourceHash:
        typeof hydratedScanRecord.snapshot?.report_projection_source_hash === "string"
          ? hydratedScanRecord.snapshot.report_projection_source_hash
          : null,
      canonicalResolverVersion: CANONICAL_VENDOR_RESOLVER_VERSION,
      generatedAt: generated,
      source: PULSE_SOURCE,
      format: input.format,
      detail: input.detail
    },
    domain,
    scanId: scan.id,
    scan_id: scan.id,
    scanStatus: effectiveScanStatus,
    ...(noGoProjection ?? {}),
    summary,
    executiveSummary,
    surfacedResults,
    counts,
    topFindings,
    capabilities: PULSE_CAPABILITIES,
    coverage: {
      status: coverage.status,
      summary: coverage.summary
    },
    links,
    feedback,
    agentInterpretation: buildPulseAgentInterpretation({
      responseClass: "completed_pulse",
      safeSummaryUse: true
    }),
    disclaimer: PULSE_STANDARD_DISCLAIMER
  };

  if (input.detail === "tiny") {
    return {
      type: base.type,
      meta: base.meta,
      domain: base.domain,
      scanId: base.scanId,
      scanStatus: base.scanStatus,
      resultDisposition: base.resultDisposition,
      noGo: base.noGo,
      summary: tinySummary,
      counts: base.counts,
      topFindings: topFindings.map((finding) => ({
        id: finding.id,
        label: finding.label,
        criticality: finding.criticality,
        confidence: finding.confidence
      })),
      coverage: base.coverage,
      links: {
        canonicalPulseUrl: links.canonicalPulseUrl,
        fullReportUrl: links.fullReportUrl,
        markdownUrl: links.markdownUrl,
        docsUrl: links.docsUrl,
        findingsReferenceUrl: links.findingsReferenceUrl,
        summaryJsonUrl: links.summaryJsonUrl,
        evidenceJsonUrl: links.evidenceJsonUrl,
        jsonUrl: links.jsonUrl,
        fullJsonUrl: links.fullJsonUrl,
        scanJsonUrl: links.scanJsonUrl
      },
      feedback: {
        email: feedback.email,
        feedbackUrl: feedback.feedbackUrl,
        positiveUrl: feedback.positiveUrl,
        negativeUrl: feedback.negativeUrl
      },
      capabilities: base.capabilities,
      agentInterpretation: base.agentInterpretation,
      disclaimer: base.disclaimer
    };
  }

  const standard = {
    ...base,
    request: {
      pulseRequestId: input.pulseRequestId,
      url: input.requestedUrl,
      normalizedUrl: input.requestedUrl,
      domain,
      detail: input.detail,
      format: input.format,
      freshness: input.freshnessMode,
      waitSeconds: input.waitSeconds,
      resolutionMode: input.resolutionMode
    },
    scan: {
      scanId: scan.id,
      scanStatus: effectiveScanStatus,
      createdAt: scan.createdAt,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
      lastUpdatedAt: timestamps.lastUpdatedAt
    },
    timestamps,
    freshness: deriveFreshness(scan.completedAt, generated),
    confidence: buildConfidence(allFindings, coverage.status),
    reviewContext: getReviewLenses(input.scanRecord, allFindings),
    evidenceHighlights,
    recommendedActions: buildRecommendedActions(topFindings),
    coverage: {
      ...coverage,
      status: quality.usable ? coverage.status : "unavailable"
    },
    resultQuality: {
      level: quality.usable ? (coverage.status === "complete" ? "usable" : "usable_with_limitations") : "unavailable",
      summary: quality.usable ? coverage.summary : quality.message,
      reason: pulseNoGoState?.resultQuality.reason ?? quality.reason
    },
    usageGuidance: PULSE_USAGE_GUIDANCE
  };

  if (input.detail === "summary") {
    return buildSummaryArtifact({ base, standard, timestamps });
  }

  if (input.detail === "evidence") {
    return buildEvidenceArtifact({
      allFindings,
      base,
      coverage,
      executive,
      reportSurface,
      scanRecord: input.scanRecord,
      standard,
      timestamps
    });
  }

  if (input.detail !== "full") {
    return standard;
  }

  return {
    ...standard,
    findings: allFindings.map((finding) => toPulseFinding(finding, scan.id, {
      coverageLimitedByNoGo,
      noGo: noGoProjection?.noGo,
      runtimeCookieRows: reportSurface.runtimeCookieRows,
      scannedPageUrl: input.scanRecord.accessPostureSummary?.finalEffectiveUrl ?? `https://${scan.domainHostname}/`
    })),
    reviewContext: {
      ...standard.reviewContext,
      lenses: standard.reviewContext.lenses.map((lens) => ({
        ...lens,
        contributingFindingIds: allFindings
          .filter((finding) => getFindingReviewLenses(finding).includes(lens.name))
          .map((finding) => finding.id)
          .slice(0, 20)
      }))
    },
    publicReportProjection: {
      surfacedFindingCount: allFindings.length,
      surfacedPacketCount: executive.surfacedPackets.length,
      groupedFindings: executive.groupedFindings.map((group) => ({
        section: group.section,
        findingIds: group.findings.map((finding) => finding.id)
      }))
    },
    trackerFootprint: (() => {
      const vendors = buildTrackerInventoryGroupRows(reportSurface.trackerInventoryRows).map((row) => row.vendor);
      const breakdown = buildTrackerFootprintBreakdown(reportSurface);
      return {
        vendors: vendors.slice(0, 10),
        breakdown,
        rawHosts: buildRawHostInventory(reportSurface).map((row) => row.host),
        cap: { shown: Math.min(10, vendors.length), total: vendors.length, truncated: vendors.length > 10 }
      };
    })(),
    policySurfaces: (() => {
      const surfaces = projectedPolicySurfaceRows(input.scanRecord);
      return {
        surfaces: surfaces.map(({ type, url }) => ({ type, url })),
        cap: { shown: surfaces.length, total: surfaces.length, truncated: false }
      };
    })(),
    coverageDiagnostics: {
      accessPosture: input.scanRecord.accessPostureSummary,
      interruptions: coverage.interruptions
    }
  };
}

function scanRecordVendors(scanRecord: ScanDetailResponse) {
  const rows = new Map<string, {
    name: string;
    category: string;
    host: string | null;
    beforeConsent: boolean | null;
    confidence: number;
  }>();
  for (const vendor of scanRecord.trackerVendors) {
    const host = isInventoryDisplayHostname(vendor.scriptHost) ? vendor.scriptHost : null;
    const key = `${vendor.vendorName.toLowerCase()}\u0000${host ?? ""}\u0000${vendor.vendorCategory.toLowerCase()}`;
    const existing = rows.get(key);
    if (!existing) {
      rows.set(key, {
        name: vendor.vendorName,
        category: vendor.vendorCategory,
        host,
        beforeConsent: vendor.beforeConsent,
        confidence: vendor.confidence
      });
      continue;
    }
    rows.set(key, {
      ...existing,
      beforeConsent: existing.beforeConsent === true || vendor.beforeConsent === true
        ? true
        : existing.beforeConsent ?? vendor.beforeConsent,
      confidence: Math.max(existing.confidence, vendor.confidence)
    });
  }
  return [...rows.values()];
}
