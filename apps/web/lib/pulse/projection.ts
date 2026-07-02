import { projectExecutiveFindingsFromUnifiedPackets } from "../scans/executive-findings-projection";
import { deriveCertScoreFindings } from "../scans/derive-findings";
import { deriveGdprEprivacyCoverageChecklist } from "../scans/gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "../scans/gdpr-eprivacy-coverage-policy";
import { getReportableGdprEprivacyCoverageItems } from "../scans/gdpr-eprivacy-reportable-rows";
import { getHybridRuntimeEvidence } from "../scans/hybrid-runtime-evidence";
import { getPublicReportFindingDisplay } from "../scans/public-report-finding-display";
import type { CertScoreFinding } from "../scans/finding-registry";
import { getRegulatoryLensAnchor } from "../scans/regulatory-lens-anchor";
import { buildPromotionGradePreconsentRequests } from "../scans/preconsent-public-evidence";
import { buildRuntimeCookieInventory } from "../scans/runtime-cookie-evidence";
import {
  buildTrackerInventoryGroupRows,
  buildTrackerInventoryRows
} from "../scans/runtime-inventory-projection";
import { deriveRegulatoryCoverageScore } from "../scans/regulatory-coverage-score";
import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";
import {
  buildScanReportUnifiedFindings,
  deriveExecutiveDisplayedScore
} from "../../components/scans/shared-scan-detail-view";
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

function boundedScore(value: number | null) {
  return value === null ? null : Math.max(0, Math.min(100, Math.round(value)));
}

function deriveRegulatoryRiskDisplayScore(scanRecord: ScanDetailResponse) {
  const riskScore = finiteNumber(scanRecord.regulatoryRisk?.overallScore);
  if (riskScore !== null) {
    return boundedScore(100 - riskScore);
  }
  return null;
}

function deriveReportAlignedScore(input: {
  coverageLimited: boolean;
  findings: CertScoreFinding[];
  scanRecord: ScanDetailResponse;
  unifiedFindingPackets: ReturnType<typeof buildScanReportUnifiedFindings>;
}) {
  const scanRecord = input.scanRecord;
  const presentationSummary = deriveCertScoreFindings(scanRecord);
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(scanRecord.runtimeArtifacts);
  const runtimeCookieRows = buildRuntimeCookieInventory({
    hybridRuntimeEvidence,
    runtimeArtifacts: scanRecord.runtimeArtifacts
  }).rows;
  const trackerInventoryRows = buildTrackerInventoryRows({
    domains: uniqueStrings(scanRecord.trackerVendors.map((vendor) => vendor.scriptHost)),
    firstPartyDomain: scanRecord.scan.domainHostname ?? presentationSummary.requestedHost,
    preConsentVendors: presentationSummary.preConsentVendorNames,
    resolvedVendors: presentationSummary.resolvedVendorNames,
    sessionReplayVendors: presentationSummary.sessionReplayVendorNames,
    trackerVendors: scanRecord.trackerVendors,
    topObservedEntities: presentationSummary.topObservedEntities,
    unresolvedHosts: presentationSummary.unresolvedVendorHosts
  });
  const runtimeTrackerPriorityRows = buildTrackerInventoryGroupRows(trackerInventoryRows).map((row) => ({
    firstSeenMs: row.firstSeenMs,
    party: row.party,
    priority: row.priority,
    purpose: row.purpose,
    vendor: row.vendor
  }));
  const gdprEprivacyChecklist = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: input.coverageLimited,
    coverageOutcomes: deriveGdprEprivacyCoveragePolicyOutcomes({
      coverageLimited: input.coverageLimited,
      events: scanRecord.events,
      policyEnrichmentCount: scanRecord.policyEnrichment.length,
      runtimeArtifacts: scanRecord.runtimeArtifacts,
      scanCompleted: scanRecord.scan.status === "completed",
      snapshot: scanRecord.snapshot
    }),
    projectedFindings: input.findings,
    runtimeCookieRows,
    runtimeTrackerPriorityRows,
    scanCompleted: scanRecord.scan.status === "completed",
    unifiedFindings: input.unifiedFindingPackets
  });
  const gdprEprivacyScore = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: getReportableGdprEprivacyCoverageItems(gdprEprivacyChecklist)
  }).score;
  const executiveScore = deriveExecutiveDisplayedScore({
    findings: input.findings,
    previewMode: "homepage",
    snapshot: scanRecord.snapshot,
    storedScore: presentationSummary.score
  });

  return boundedScore(gdprEprivacyScore ?? executiveScore ?? deriveRegulatoryRiskDisplayScore(scanRecord));
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
  const financialRelevant = findings.some((finding) => finding.section === "Financial & Claims");
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
      name: "CCPA / CPRA / CIPA",
      status: toStatus(risk?.privacyEnforcementRiskScore),
      score: risk?.privacyEnforcementRiskScore ?? null,
      summary: "Third-party collection, privacy-choice, and disclosure posture drive this review context."
    },
    {
      name: "GDPR / ePrivacy",
      status: toStatus(risk?.consentEnforcementRiskScore),
      score: risk?.consentEnforcementRiskScore ?? null,
      summary: "Consent timing, consent surface, and tracker behavior drive this review context."
    },
    {
      name: "FTC",
      status: toStatus(risk?.consumerProtectionRiskScore),
      score: risk?.consumerProtectionRiskScore ?? null,
      summary: "Consumer-facing claims, tracking posture, and disclosure signals should be reviewed together."
    },
    {
      name: "DOJ / ADA accessibility",
      status: toStatus(risk?.accessibilityEnforcementRiskScore),
      score: risk?.accessibilityEnforcementRiskScore ?? null,
      summary: "Automated accessibility signals are the main review area for this lens."
    }
  ];

  if (financialRelevant) {
    lenses.push({
      name: "Financial & commercial claims",
      status: "watch",
      score: null,
      summary: "Financial or commercial claim language was surfaced for review context."
    });
  }

  return {
    disclaimer: PULSE_REVIEW_CONTEXT_DISCLAIMER,
    lenses
  };
}

function getFindingReviewLenses(finding: CertScoreFinding) {
  const lenses = new Set<string>();
  if (/consent|cookie|privacy|tracking|vendor|fingerprinting/i.test(`${finding.section} ${finding.id}`)) {
    lenses.add("GDPR / ePrivacy");
    lenses.add("CCPA / CPRA / CIPA");
    lenses.add("FTC");
  }
  if (/accessibility|contrast|keyboard|label|alternative/i.test(`${finding.section} ${finding.id}`)) {
    lenses.add("DOJ / ADA accessibility");
  }
  if (/financial|claim|offer|bonus|investment/i.test(`${finding.section} ${finding.id}`)) {
    lenses.add("Financial & commercial claims");
    lenses.add("FTC");
  }
  return [...lenses].slice(0, 4);
}

function getFindingReviewLensLinks(finding: CertScoreFinding, scanId: string) {
  return getFindingReviewLenses(finding).map((name) => ({
    name,
    url: absoluteUrl(`/scan/${scanId}#${getRegulatoryLensAnchor(name)}`)
  }));
}

function buildEvidence(finding: CertScoreFinding, scanId: string) {
  const details = finding.evidenceDetails ?? {};
  const representativeRequests = Array.isArray(details.representativeRequests) ? details.representativeRequests : [];
  const promotionGradePreconsentRequests = finding.id === "pre_consent_tracking_detected"
    ? buildPromotionGradePreconsentRequests({
        rows: [
          ...(Array.isArray(details.requestClassificationAnchors) ? details.requestClassificationAnchors : []),
          ...representativeRequests
        ],
        scannedPageUrl: details.scanContext?.pageUrl ?? null,
        consentTimeline: asRecord(details.timing),
        maxItems: 3
      })
    : [];
  const vendors = Array.isArray(details.vendors) ? details.vendors : [];
  const firstRequest = representativeRequests[0];
  const firstVendor = vendors[0];
  const runtimeRequestUrls = asStringArray(details.runtimeRequestUrls);
  const sourceUrls = asStringArray(details.sourceUrls);
  const pageUrls = asStringArray(details.pageUrls);
  const runtimePhase =
    (asRecord(details.policyRuntimeConflict)?.runtimeAnchor as { phase?: string } | undefined)?.phase ??
    (typeof recordValue(details.trackingEvidence, "phase") === "string" ? String(recordValue(details.trackingEvidence, "phase")) : null);
  const observedPhase = runtimePhase === "pre_consent" ? "before_consent" : runtimePhase === "after_reject" ? "after_reject" : runtimePhase ?? null;
  const examples = promotionGradePreconsentRequests.length > 0
    ? promotionGradePreconsentRequests.map((request) => ({
        type: "request",
        scannedPageUrl: request.scannedPageUrl ?? null,
        requestUrl: request.requestUrl,
        vendor: request.vendorName,
        vendorCategory: request.vendorCategory,
        vendorAttributionBasis: request.vendorAttributionBasis,
        urlHost: request.hostname,
        registrableDomain: request.registrableDomain,
        timestampMs: request.firstSeenMs,
        consentActionMs: request.consentActionMs,
        noConsentActionObserved: request.noConsentActionObserved,
        consentSurfaceObserved: request.consentSurfaceObserved,
        consentInteractionRecorded: request.consentInteractionRecorded,
        confidence: request.confidence
      }))
    : [
    firstRequest
      ? {
          type: "request",
          vendor: firstRequest.vendor ?? firstVendor?.name ?? null,
          urlHost: firstRequest.hostname ?? null,
          timestampMs: firstRequest.firstSeenMs ?? null
        }
      : null,
    runtimeRequestUrls[0]
      ? {
          type: "request",
          vendor: asStringArray(details.runtimeVendors)[0] ?? null,
          urlHost: safeHostname(runtimeRequestUrls[0]),
          timestampMs: null
        }
      : null,
    sourceUrls[0] || pageUrls[0]
      ? {
          type: "page",
          vendor: null,
          urlHost: safeHostname(sourceUrls[0] ?? pageUrls[0]),
          timestampMs: null
        }
      : null
  ].filter(Boolean).slice(0, 3);
  const hasTimingAnchor =
    Boolean(firstRequest?.firstSeenMs) ||
    Boolean(finiteNumber(recordValue(details.timing, "firstRequestMs"))) ||
    Boolean(finiteNumber(recordValue(details.timing, "firstThirdPartyTrackingRequestMs")));
  const hasVendorAnchor = vendors.length > 0 || asStringArray(details.runtimeVendors).length > 0 || Boolean(firstRequest?.vendor);
  const hasConsentContext = Boolean(details.consentState || details.consentInteraction || /consent|reject|pre_consent/i.test(finding.id));
  const hasPolicyAnchor = Boolean(details.policyEvidence || details.policyEvidenceDetails || details.policyRuntimeConflict);
  const basis = finding.section === "Accessibility" ? "accessibility_check" : hasPolicyAnchor ? "policy_surface_detection" : "runtime_observation";
  const summary = finding.evidencePreview[0] ?? finding.shortSummary;
  const anchorUrl = absoluteUrl(`/scan/${scanId}#finding-${finding.id}`);

  return {
    summary,
    observedPhase,
    exampleEvents: examples,
    consentContext: details.consentState
      ? {
          bannerSeen: (details.consentState as { cmpDetected?: boolean | null }).cmpDetected ?? null,
          bannerSeenAtMs: (details.consentState as { cmpVisibleMs?: number | null }).cmpVisibleMs ?? null,
          choiceRecorded: (details.consentState as { userConsentActionObserved?: boolean }).userConsentActionObserved ?? null
        }
      : null,
    fullEvidenceUrl: anchorUrl,
    evidenceDigest: {
      basis,
      phase: observedPhase ?? null,
      exampleCount: Math.max(finding.evidencePreview.length, examples.length),
      examplesShown: examples.length,
      hasTimingAnchor,
      hasVendorAnchor,
      hasConsentContext,
      hasPolicyAnchor
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

function toPulseFinding(finding: CertScoreFinding, scanId: string) {
  const display = getPublicReportFindingDisplay({
    confidence: finding.confidence,
    findingId: finding.id,
    label: finding.label,
    remediation: finding.remediation,
    section: finding.section,
    severity: finding.severity,
    title: finding.label
  });
  const evidence = buildEvidence(finding, scanId);

  return {
    id: finding.id,
    label: display.title,
    criticality: display.criticality,
    confidence: finding.confidence,
    plainEnglish: finding.shortSummary,
    evidence: {
      summary: evidence.summary,
      observedPhase: evidence.observedPhase,
      exampleEvents: evidence.exampleEvents,
      consentContext: evidence.consentContext,
      fullEvidenceUrl: evidence.fullEvidenceUrl
    },
    evidenceDigest: evidence.evidenceDigest,
    reviewLenses: getFindingReviewLenses(finding),
    reviewLensLinks: getFindingReviewLensLinks(finding, scanId),
    anchorUrl: evidence.anchorUrl,
    nextStep: display.remediation || "Review the retained evidence and confirm expected site behavior."
  };
}

function buildEvidenceHighlights(scanRecord: ScanDetailResponse) {
  const snapshot = scanRecord.snapshot;
  const thirdPartyDomainsObserved =
    finiteNumber(recordValue(snapshot, "third_party_request_domain_count")) ??
    finiteNumber(recordValue(snapshot, "third_party_domain_count")) ??
    uniqueStrings(scanRecord.trackerVendors.map((vendor) => vendor.scriptHost)).length;
  const classifiedTrackerVendors = uniqueStrings(scanRecord.trackerVendors.map((vendor) => vendor.vendorName)).length;
  const policyRows = scanRecord.policyEnrichment ?? [];
  const policyTypes = uniqueStrings(policyRows.map((row) => (typeof row.policy_page_type === "string" ? row.policy_page_type : null)));
  const fingerprintIndicators =
    finiteNumber(recordValue(snapshot, "fingerprinting_indicator_count")) ??
    finiteNumber(recordValue(snapshot, "fingerprinting_signal_count")) ??
    0;
  const probableFingerprintingDetected =
    recordValue(snapshot, "probable_fingerprinting_detected") === true ||
    recordValue(snapshot, "fingerprinting_probable") === true;
  const categories = scanRecord.trackerVendors.reduce<Record<string, number>>((accumulator, vendor) => {
    const key = vendor.vendorCategory || "uncategorized";
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
  const categorySummary = Object.entries(categories)
    .slice(0, 6)
    .map(([key, count]) => `${key.replaceAll("_", " ")} ${count}`)
    .join(" | ");

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
    }
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
  topFindings: ReturnType<typeof toPulseFinding>[];
}) {
  const highPriorityFindingCount = input.topFindings.filter((finding) => /^(critical|high)$/i.test(finding.criticality)).length;

  return {
    totalObservationCount: input.allFindingCount,
    totalAutomatedFindingCount: input.allFindingCount,
    topFindingCount: input.topFindings.length,
    highPriorityFindingCount,
    evidenceHighlightCount: Object.keys(input.evidenceHighlights).length,
    thirdPartyDomainsObserved: input.evidenceHighlights.trackerFootprint.thirdPartyDomainsObserved,
    classifiedTrackerVendors: input.evidenceHighlights.trackerFootprint.classifiedTrackerVendors,
    policyUrlCount: input.evidenceHighlights.policySurfaces.policyUrlCount,
    probableFingerprintingDetected: input.evidenceHighlights.fingerprinting.probableFingerprintingDetected
  };
}

function buildSummary(input: {
  benchmark: string | null;
  coverageLimited: boolean;
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
  const generated = generatedAt();
  const scan = input.scanRecord.scan;
  const domain = scan.domainHostname ?? safeHostname(input.requestedUrl) ?? "unknown";
  const coverage = deriveCoverage(input.scanRecord);
  const quality = assessPulseScanRecordQuality(input.scanRecord);
  const packets = buildScanReportUnifiedFindings(input.scanRecord);
  const executive = projectExecutiveFindingsFromUnifiedPackets(packets);
  const allFindings = executive.findings;
  const score = deriveReportAlignedScore({
    coverageLimited: coverage.status !== "complete",
    findings: allFindings,
    scanRecord: input.scanRecord,
    unifiedFindingPackets: packets
  });
  const topFindings = executive.topFindings.map((finding) => toPulseFinding(finding, scan.id));
  const benchmark = input.scanRecord.domainBenchmark
    ? `${input.scanRecord.domainBenchmark.industry} / ${input.scanRecord.domainBenchmark.estimatedRankLabel}`
    : null;
  const summary = buildSummary({
    benchmark,
    coverageLimited: coverage.status !== "complete",
    findings: allFindings,
    score
  });
  const topFindingCount = topFindings.length;
  const evidenceHighlights = buildEvidenceHighlights(input.scanRecord);
  const counts = buildPulseCounts({
    allFindingCount: allFindings.length,
    evidenceHighlights,
    topFindings
  });
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
      generatedAt: generated,
      source: PULSE_SOURCE,
      format: input.format,
      detail: input.detail
    },
    domain,
    scanId: scan.id,
    scan_id: scan.id,
    scanStatus: scan.status,
    summary,
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
      scanStatus: scan.status,
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
      reason: quality.reason
    },
    usageGuidance: PULSE_USAGE_GUIDANCE
  };

  if (input.detail !== "full") {
    return standard;
  }

  return {
    ...standard,
    findings: allFindings.map((finding) => toPulseFinding(finding, scan.id)),
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
    trackerFootprint: {
      vendors: scanRecordVendors(input.scanRecord).slice(0, 10),
      cap: { shown: Math.min(10, input.scanRecord.trackerVendors.length), total: input.scanRecord.trackerVendors.length, truncated: input.scanRecord.trackerVendors.length > 10 }
    },
    policySurfaces: {
      surfaces: input.scanRecord.policyEnrichment.slice(0, 10).map((row) => ({
        type: typeof row.policy_page_type === "string" ? row.policy_page_type : "policy_surface",
        url: typeof row.policy_page_url === "string" ? row.policy_page_url : null
      })),
      cap: { shown: Math.min(10, input.scanRecord.policyEnrichment.length), total: input.scanRecord.policyEnrichment.length, truncated: input.scanRecord.policyEnrichment.length > 10 }
    },
    coverageDiagnostics: {
      accessPosture: input.scanRecord.accessPostureSummary,
      interruptions: coverage.interruptions
    }
  };
}

function scanRecordVendors(scanRecord: ScanDetailResponse) {
  return scanRecord.trackerVendors.map((vendor) => ({
    name: vendor.vendorName,
    category: vendor.vendorCategory,
    host: vendor.scriptHost,
    beforeConsent: vendor.beforeConsent,
    confidence: vendor.confidence
  }));
}
