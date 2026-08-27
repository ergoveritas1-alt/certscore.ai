import type { AgencyMapping, RegulatoryRiskAssessment } from "@website-signal-risk-scanner/shared";
import { KNOWN_CMP_REGISTRY } from "../../../../packages/shared/src/known-cmps";
import React from "react";
import {
  deriveExecutiveDisplayState,
  deriveExecutiveNarrativePresentation,
  formatTopFindingHeadline,
  hasMeaningfulExecutiveInterruption,
  type CoverageDiagnosticIndicator,
  type ExecutiveDisplayState,
  type ExecutivePosture
} from "../../lib/scans/calibration-summary";
import { formatRepresentativeAccessibilityCoverage } from "../../lib/scans/accessibility-evidence";
import { compactEvidenceJsonForDisplay } from "../../lib/scans/compact-evidence-json";
import { projectExecutiveFindingsFromUnifiedPackets } from "../../lib/scans/executive-findings-projection";
import type { FindingCriticalityBadge } from "../../lib/scans/finding-criticality-badges";
import { getFindingDensityBenchmark } from "../../lib/scans/finding-density-benchmarks";
import type { CertScoreFinding } from "../../lib/scans/finding-registry";
import { getRegulatoryLensAnchor } from "../../lib/scans/regulatory-lens-anchor";
import {
  getPublicReportConfidenceDefinition,
  getPublicReportFindingDisplayForCertFinding
} from "../../lib/scans/public-report-finding-display";
import { rankFindings } from "../../lib/scans/rank-findings";
import { evaluateTopFindingEligibility } from "../../lib/scans/top-finding-eligibility";
import { filterVisibleExecutiveTopFindings } from "../../lib/scans/executive-top-finding-visibility";
import type { ScanProof } from "../../lib/scans/scan-proof";
import type { UnifiedFindingDisplayPacket } from "../../lib/scans/unified-findings";
import { buildPromotionGradePreconsentRequests } from "../../lib/scans/preconsent-public-evidence";
import {
  getFindingRegulatoryContext,
  getFindingReviewContextChips,
  type FindingRegulatoryContext,
  type FindingRegulatoryContextItem
} from "../../lib/marketing/finding-regulatory-context";
import { CopyJsonButton } from "./copy-json-button";
import { EvidenceJsonBlock } from "./evidence-json-block";
import { ExecutiveTopFindingsCarousel } from "./executive-top-findings-carousel";
import type { RegulatoryMappingFilterId } from "./executive-regulatory-mapping-filter";
import { FindingHashFocus } from "./finding-hash-focus";
import { InfoTip } from "./info-tip";
import { ApplicabilityChip, type PrivacyLawApplicabilityKind } from "./privacy-law-applicability-context";
import { ScanReportDisclosureIcon } from "./scan-report-disclosure-icon";
import { getVendorBrandMark, VendorBrandChip } from "./vendor-brand-chip";
type DomainBenchmarkCardData = {
  confidence: "low" | "medium" | "high";
  estimatedRankLabel: string;
  expectedCookiesBeforeConsent: number;
  expectedThirdPartyRequests: number;
  industry: string;
  rationale: string;
} | null;

type UnifiedRegulatoryContext = {
  beforeConsentCookieEvidence?: Record<string, unknown> | null;
  beforeConsentCookieCount?: number;
  cookieBannerPresent?: boolean | null;
  rawBeforeConsentCookieObservationCount?: number;
  hasSensitiveGamblingTrackingRisk?: boolean;
  hasSensitiveHealthTrackingRisk?: boolean;
  hasTrackingConcern?: boolean;
  thirdPartyRequestCount?: number;
};

type BeforeConsentCookieEvidenceDetail = {
  category?: string | null;
  cookieName?: string | null;
  domain?: string | null;
  initiatorDomain?: string | null;
  initiatorUrl?: string | null;
  initiatorVendor?: string | null;
  party?: string | null;
  responseUrl?: string | null;
  setAtMs?: number | null;
  setMethod?: string | null;
  timingEvidence?: string | null;
};

type PreconsentRequestEvidenceDetail = {
  collectionEndpointType?: string | null;
  confidence?: number | null;
  detectionSource?: string | null;
  evidenceUrls?: string[];
  firstPartyOrThirdParty?: string | null;
  matchedSignatureId?: string | null;
  scriptHost?: string | null;
  timingEvidence?: string | null;
  vendorCategory?: string | null;
  vendorName?: string | null;
};

export type ExecutivePolicySurface = {
  details: string[];
  pageLabel: string;
  pageUrl: string | null;
};

export type ExecutiveConsentControlProjection = {
  accept: boolean | null;
  options: boolean | null;
  reject: boolean | null;
};

export type ExecutiveScanInterruption = {
  details: string[];
  label: string;
};

export type ExecutiveTimelineEvent = {
  atMs: number;
  label: string;
  tone?: "amber" | "emerald" | "rose" | "sky" | "slate";
  vendorLabel?: string | null;
};

type ExecutiveScanProof = ScanProof;

function isProtectedRouteInterruption(interruption: ExecutiveScanInterruption) {
  return /protected route/i.test(`${interruption.label} ${interruption.details.join(" ")}`);
}

function formatBenchmarkHeaderIndustry(industry: string) {
  return industry.split("/")[0]?.trim() || industry;
}

function getPostureClasses(posture: ExecutiveDisplayState) {
  if (posture === "Scan not representative") {
    return "border-slate-300 bg-slate-100/90 text-slate-950";
  }
  if (posture === "Action Needed") {
    return "border-rose-200 bg-rose-50/90 text-rose-950";
  }
  if (posture === "Review Needed") {
    return "border-amber-200 bg-amber-50/90 text-amber-950";
  }
  if (posture === "Limited review") {
    return "border-sky-200 bg-sky-50/90 text-sky-950";
  }
  if (posture === "Watch") {
    return "border-amber-200 bg-amber-50/90 text-amber-950";
  }
  return "border-emerald-200 bg-emerald-50/90 text-emerald-950";
}

function getExecutiveBadgeLabel(displayState: ExecutiveDisplayState) {
  return displayState === "Clear" ? "Report generated" : displayState;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function parsePacketEvidenceRows(values: string[]) {
  return values.flatMap((value) => {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? [parsed as Record<string, unknown>]
        : [];
    } catch {
      return [];
    }
  });
}

function compactCookieEvidenceRow(row: Record<string, unknown>): BeforeConsentCookieEvidenceDetail {
  return {
    cookieName: typeof row.cookieName === "string" ? row.cookieName : null,
    domain: typeof row.domain === "string" ? row.domain : null,
    party: typeof row.party === "string" ? row.party : null,
    category: typeof row.category === "string" ? row.category : null,
    initiatorDomain: typeof row.initiatorDomain === "string" ? row.initiatorDomain : null,
    initiatorVendor: typeof row.initiatorVendor === "string" ? row.initiatorVendor : null,
    initiatorUrl: typeof row.initiatorUrl === "string" ? row.initiatorUrl : null,
    responseUrl: typeof row.responseUrl === "string" ? row.responseUrl : null,
    setAtMs: typeof row.setAtMs === "number" && Number.isFinite(row.setAtMs) ? row.setAtMs : null,
    setMethod: typeof row.setMethod === "string" ? row.setMethod : null,
    timingEvidence: typeof row.timingEvidence === "string" ? row.timingEvidence : null
  };
}

function compactPreconsentRequestEvidenceRow(row: Record<string, unknown>): PreconsentRequestEvidenceDetail {
  const evidenceUrls = Array.isArray(row.evidenceUrls)
    ? row.evidenceUrls.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  return {
    vendorName: typeof row.vendorName === "string" ? row.vendorName : null,
    vendorCategory: typeof row.vendorCategory === "string" ? row.vendorCategory : null,
    scriptHost: typeof row.scriptHost === "string" ? row.scriptHost : null,
    detectionSource: typeof row.detectionSource === "string" ? row.detectionSource : null,
    confidence: typeof row.confidence === "number" && Number.isFinite(row.confidence) ? row.confidence : null,
    firstPartyOrThirdParty: typeof row.firstPartyOrThirdParty === "string" ? row.firstPartyOrThirdParty : null,
    collectionEndpointType: typeof row.collectionEndpointType === "string" ? row.collectionEndpointType : null,
    matchedSignatureId: typeof row.matchedSignatureId === "string" ? row.matchedSignatureId : null,
    timingEvidence: typeof row.timingEvidence === "string" ? row.timingEvidence : null,
    evidenceUrls
  };
}

function formatInlineList(values: string[]) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function sentenceCase(value: string) {
  const trimmed = value.trim();
  return trimmed ? `${trimmed[0]?.toUpperCase() ?? ""}${trimmed.slice(1)}` : trimmed;
}

function formatTrackerFootprintExpandLabel(input: {
  thirdPartyDomainCount: number;
  vendorCount: number;
}) {
  if (input.vendorCount > 0) {
    return "View observed vendors and domains";
  }

  if (input.thirdPartyDomainCount === 1) {
    return "View observed third-party domain";
  }

  if (input.thirdPartyDomainCount > 1) {
    return "View observed domains";
  }

  return "";
}

const RECOGNIZED_CMP_BRANDS = KNOWN_CMP_REGISTRY.flatMap((entry) => [
  { key: entry.canonicalName.toLowerCase(), label: entry.canonicalName },
  ...entry.aliases.map((alias) => ({ key: alias.toLowerCase(), label: entry.canonicalName }))
]);

function getRecognizedCmpBrand(cmpVendorName: string | null | undefined) {
  const normalized = cmpVendorName?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return RECOGNIZED_CMP_BRANDS.find((brand) => normalized.includes(brand.key)) ?? null;
}

function formatTrackerFootprintLabels(input: {
  domainCount: number;
  vendorCount: number;
}) {
  const vendorLabel = `${input.vendorCount} ${input.vendorCount === 1 ? "vendor" : "vendors"}`;
  const domainLabel = `${input.domainCount} ${input.domainCount === 1 ? "domain" : "domains"}`;
  return {
    detail: `${vendorLabel} · ${domainLabel}`,
    title: "Tracker footprint",
  };
}

function getPolicyDisclosureType(label: string) {
  const normalizedLabel = label.toLowerCase();
  if (normalizedLabel.includes("cookie")) {
    return "cookie";
  }
  if (normalizedLabel.includes("privacy")) {
    return "privacy";
  }
  if (normalizedLabel.includes("terms")) {
    return "terms";
  }
  return "policy";
}

function buildPolicySurfaceSharedUrlLabels(policySurfaces: ExecutivePolicySurface[]) {
  const labelsByUrl = new Map<string, string[]>();
  for (const surface of policySurfaces) {
    if (!surface.pageUrl) {
      continue;
    }
    labelsByUrl.set(surface.pageUrl, uniqueStrings([...(labelsByUrl.get(surface.pageUrl) ?? []), surface.pageLabel]));
  }

  return labelsByUrl;
}

function trimTrailingSentencePunctuation(value: string) {
  return value.trim().replace(/[.,;:!?]+$/g, "");
}

function sentenceWithPeriod(value: string) {
  const trimmed = trimTrailingSentencePunctuation(value);
  return trimmed ? `${trimmed}.` : "";
}

function splitInlineVendorList(value: string) {
  return value
    .replace(/\band\b/g, ",")
    .split(",")
    .map((vendor) => trimTrailingSentencePunctuation(vendor))
    .filter(Boolean);
}

function getRepresentativeVendorsFromFindings(findings: CertScoreFinding[]) {
  return uniqueStrings(
    findings.flatMap((finding) => {
      const match = finding.shortSummary.match(/representative vendors including\s+([^.;]+)/i);
      return match?.[1] ? splitInlineVendorList(match[1]) : [];
    })
  );
}

function getRecommendedNextStep(finding: CertScoreFinding) {
  const label = `${finding.id} ${finding.label}`.toLowerCase();

  if (label.includes("pre_consent") || label.includes("pre-consent") || label.includes("third_party_tracking_pre_consent")) {
    return "Next step: confirm whether these vendors are necessary before consent or should be consent-gated.";
  }
  if (label.includes("reject_tracking") || label.includes("reject")) {
    return "Next step: test whether reject choices suppress non-essential vendors across reloads.";
  }
  if (label.includes("contrast")) {
    return "Next step: review affected text/background color pairs and adjust contrast to meet WCAG contrast guidance.";
  }
  if (label.includes("accessibility") || label.includes("wcag") || label.includes("keyboard")) {
    return "Next step: review affected elements with keyboard navigation and screen-reader checks, then confirm that labels, focus behavior, accessible names, and visible instructions match the intended user flow.";
  }
  if (label.includes("session_recording") || label.includes("session replay")) {
    return "Next step: confirm whether session replay collection is disclosed and appropriately consent-gated.";
  }
  if (label.includes("fingerprint")) {
    return "Next step: verify whether the retained browser signals are necessary and disclosed for the user-facing purpose.";
  }
  if (label.includes("cookie")) {
    return "Next step: compare the retained cookie evidence against banner behavior and public disclosures.";
  }

  return `Next step: ${getFindingFixText(finding)}`;
}

const CERTSCORE_REVIEW_DISCLAIMER =
  "Automated public-web observation for human and agentic review; not legal advice, certification, or a compliance determination.";

type ExecutiveFindingCardCopy = {
  evidenceBasis: string;
  reviewFocus: string;
  summary: string;
};

function isAccessibilityFinding(finding: CertScoreFinding) {
  const haystack = `${finding.id} ${finding.label} ${finding.section}`.toLowerCase();
  return /accessibility|wcag|keyboard|screen reader|semantic|label|contrast|alternative text/.test(haystack);
}

function buildAccessibilityCardCopy(finding: CertScoreFinding): ExecutiveFindingCardCopy {
  const counts = finding.evidenceDetails?.counts ?? {};
  const accessibilityEvidence = finding.evidenceDetails?.accessibilityEvidence ?? {};
  const examples = getAccessibilityExampleRows(finding);
  const primaryExample = examples[0] ?? null;
  const primaryRule = primaryExample ? getFirstStringValue(primaryExample, ["ruleCode", "rule_code", "ruleId", "rule_id", "axeRuleId", "help"]) : null;
  const primarySelector = primaryExample
    ? getFirstStringArrayValue(primaryExample, ["representativeSelectors", "representative_selectors", "selectors", "target", "targets"])[0] ?? null
    : null;
  const primaryPage = primaryExample ? getFirstStringValue(primaryExample, ["pageUrl", "page_url", "url"]) : null;
  const affectedNodes =
    typeof counts.representativeAxeExampleCount === "number" && counts.representativeAxeExampleCount > 0
      ? counts.representativeAxeExampleCount
      : typeof counts.wcagErrorCountTotal === "number" && counts.wcagErrorCountTotal > 0
        ? counts.wcagErrorCountTotal
        : typeof accessibilityEvidence.affectedNodes === "number" && accessibilityEvidence.affectedNodes > 0
          ? accessibilityEvidence.affectedNodes
          : null;
  const pageCount =
    typeof counts.representativeAxePageCount === "number" && counts.representativeAxePageCount > 0
      ? counts.representativeAxePageCount
      : typeof accessibilityEvidence.pageCount === "number" && accessibilityEvidence.pageCount > 0
        ? accessibilityEvidence.pageCount
        : null;
  const maxImpact =
    typeof accessibilityEvidence.impact === "string"
      ? accessibilityEvidence.impact
      : null;
  const impactedSurface = affectedNodes
    ? `${affectedNodes} affected ${affectedNodes === 1 ? "element" : "elements"}${pageCount ? ` across ${pageCount} ${pageCount === 1 ? "page" : "pages"}` : ""}`
    : "affected elements";
  const impactText = maxImpact ? ` The highest retained impact was ${maxImpact}.` : "";
  const sourceContext = primaryRule
    ? ` Retained axe evidence points to ${primaryRule}${primarySelector ? ` on selector ${primarySelector}` : ""}${primaryPage ? ` at ${primaryPage}` : ""}.`
    : "";
  const summary = `${finding.label} was retained for manual accessibility review, with ${impactedSurface}.${impactText}${sourceContext}`;
  const reviewTarget = primaryRule || primarySelector
    ? `Start with ${primaryRule ? `the ${primaryRule} rule` : "the retained rule"}${primarySelector ? ` on ${primarySelector}` : ""}; then verify nearby labels, instructions, focus order, accessible names, and error states in the actual page flow.`
    : "Review the affected elements with keyboard navigation and screen-reader checks. Confirm that labels, focus order, accessible names, instructions, and error states match the intended user flow, then validate fixes against the relevant WCAG rule.";

  return {
    evidenceBasis: `${summary} ${CERTSCORE_REVIEW_DISCLAIMER}`,
    reviewFocus: reviewTarget,
    summary
  };
}

function getRecordValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (key in row) {
      return row[key];
    }
  }
  return undefined;
}

function getFirstStringValue(row: Record<string, unknown>, keys: string[]) {
  const value = getRecordValue(row, keys);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getFirstNumberValue(row: Record<string, unknown>, keys: string[]) {
  const value = getRecordValue(row, keys);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const MAX_RUNTIME_ELAPSED_MS = 10 * 60 * 1000;

function normalizeRuntimeElapsedMs(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value >= 0 && value <= MAX_RUNTIME_ELAPSED_MS ? value : null;
}

function getFirstRuntimeElapsedMs(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getRecordValue(row, [key]);
    const parsed = typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : null;
    const normalized = normalizeRuntimeElapsedMs(parsed);
    if (normalized !== null) {
      return normalized;
    }
  }
  return null;
}

function getFirstStringArrayValue(row: Record<string, unknown>, keys: string[]) {
  const value = getRecordValue(row, keys);
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
  }
  return typeof value === "string" && value.trim().length > 0 ? [value.trim()] : [];
}

function asRecordRows(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function getAccessibilityExampleRows(finding: CertScoreFinding) {
  const details = finding.evidenceDetails;
  const accessibilityEvidence = details?.accessibilityEvidence;
  return [
    ...asRecordRows(accessibilityEvidence?.accessibilityRuleExamples),
    ...asRecordRows(accessibilityEvidence?.ruleExamples),
    ...asRecordRows(accessibilityEvidence?.axeEvidence),
    ...asRecordRows(accessibilityEvidence?.accessibilityAxeEvidence)
  ];
}

function getRepresentativeVendorNames(finding: CertScoreFinding, maxItems = 3) {
  const details = finding.evidenceDetails;
  const normalizeVendorName = (value: unknown) => {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as { vendor?: unknown; name?: unknown };
        const parsedName = typeof parsed.vendor === "string" ? parsed.vendor : typeof parsed.name === "string" ? parsed.name : null;
        return parsedName?.trim() || null;
      } catch {
        return null;
      }
    }
    return trimmed;
  };
  const vendorNames = [
    ...(details?.vendors ?? []).map((vendor) => vendor.name),
    ...(details?.directlyObservedPreConsentVendors ?? []),
    ...(details?.runtimeVendors ?? []),
    ...(Array.isArray(details?.trackingEvidence?.vendors) ? details.trackingEvidence.vendors : []),
    ...(Array.isArray(details?.sessionReplayEvidence?.vendors) ? details.sessionReplayEvidence.vendors : [])
  ];

  return uniqueStrings(vendorNames.map(normalizeVendorName)).slice(0, maxItems);
}

function getRepresentativeDomainNames(finding: CertScoreFinding, maxItems = 3) {
  const details = finding.evidenceDetails;
  const domains = [
    ...(Array.isArray(details?.runtimeRequestUrls) ? details.runtimeRequestUrls : []),
    ...(Array.isArray(details?.sourceUrls) ? details.sourceUrls : []),
    ...(Array.isArray(details?.trackingEvidence?.domains) ? details.trackingEvidence.domains : []),
    ...(Array.isArray(details?.runtimeVendorDisclosure?.observedRuntimeDomains) ? details.runtimeVendorDisclosure.observedRuntimeDomains : [])
  ].flatMap((value) => {
    if (typeof value !== "string" || !value.trim()) {
      return [];
    }
    try {
      return [new URL(value).hostname.toLowerCase()];
    } catch {
      return [value.replace(/^https?:\/\//i, "").split("/")[0]?.toLowerCase() ?? value];
    }
  });

  return uniqueStrings(domains).slice(0, maxItems);
}

function buildPreConsentTrackingCardCopy(finding: CertScoreFinding): ExecutiveFindingCardCopy {
  const firstTrackerTimestampMs = finding.evidenceDetails?.timing?.firstThirdPartyTrackingRequestMs;
  const representativeVendors = getRepresentativeVendorNames(finding);
  const vendorText = representativeVendors.length > 0 ? formatInlineList(representativeVendors) : null;
  const timestampText = typeof firstTrackerTimestampMs === "number" ? `${firstTrackerTimestampMs}ms` : null;
  const observedSignal =
    vendorText && timestampText
      ? `${vendorText} appeared before recorded consent; first classified signal at ${timestampText} after page load.`
      : vendorText
        ? `${vendorText} appeared before any recorded consent interaction.`
        : timestampText
          ? `A classified tracking signal appeared before recorded consent at ${timestampText}.`
          : "A classified tracking signal appeared before any recorded consent interaction.";

  return {
    evidenceBasis: [
      "No accept, reject, manage, or close interaction was recorded before the retained request evidence.",
      vendorText ? `Representative vendors: ${vendorText}.` : null,
      CERTSCORE_REVIEW_DISCLAIMER
    ].filter(Boolean).join(" "),
    reviewFocus: vendorText
      ? "Confirm whether these services are intentionally allowed before consent or should be gated by consent controls."
      : "Confirm whether the classified third-party tracking signal is intentionally allowed before consent or should be gated by consent controls.",
    summary: `${observedSignal} Tracking before a clear user choice can undermine consent expectations.`
  };
}

function formatDurationDays(days: number) {
  if (days >= 365) {
    const years = days / 365;
    return years >= 2 ? `${years.toFixed(years >= 10 ? 0 : 1)} years` : "1 year";
  }
  return `${Math.round(days)} days`;
}

function formatApproxDurationDays(days: number) {
  return `${formatDurationDays(days)} (${Math.round(days)} days)`;
}

function getCookieRetentionRows(finding: CertScoreFinding) {
  const details = finding.evidenceDetails as (Record<string, unknown> & { counts?: Record<string, unknown> }) | undefined;
  const rows = [
    details?.["cookieRetentionEvidence"],
    details?.["longLivedCookieEvidence"],
    details?.["retentionEvidence"],
    details?.["cookies"]
  ].flatMap((value) => Array.isArray(value) ? value : []);

  return rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

function getCookieDurationDays(row: Record<string, unknown>) {
  const value =
    row.durationDays ??
    row.duration_days ??
    row.lifetimeDays ??
    row.lifetime_days ??
    row.retentionDays ??
    row.retention_days;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  const maxAge = row.maxAgeSeconds ?? row.max_age_seconds ?? row.maxAge ?? row.max_age;
  return typeof maxAge === "number" && Number.isFinite(maxAge) && maxAge > 0 ? maxAge / 86400 : null;
}

function buildCookieRetentionCardCopy(finding: CertScoreFinding): ExecutiveFindingCardCopy {
  const rows = getCookieRetentionRows(finding);
  const counts = finding.evidenceDetails?.counts ?? {};
  const longLivedCount =
    typeof counts.longLivedCookieCount === "number" && counts.longLivedCookieCount > 0
      ? counts.longLivedCookieCount
      : rows.length;
  const trackingCount =
    typeof counts.longLivedTrackingCookieCount === "number" && counts.longLivedTrackingCookieCount > 0
      ? counts.longLivedTrackingCookieCount
      : rows.filter((row) => /tracking|advert|marketing|analytics/i.test(String(row.classification ?? row.category ?? ""))).length;
  const longestDuration = rows
    .map(getCookieDurationDays)
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => b - a)[0] ?? null;
  const thresholdDays = longestDuration ? (longestDuration >= 365 ? 365 : 180) : null;
  const thresholdText =
    longestDuration && thresholdDays
      ? ` Longest observed lifetime was about ${formatApproxDurationDays(longestDuration)}, exceeding CertScore.ai's ${thresholdDays}-day cookie-retention review threshold by about ${Math.max(0, Math.round(longestDuration - thresholdDays))} days.`
      : "";
  const vendors = getRepresentativeVendorNames(finding, 2);
  const domains = getRepresentativeDomainNames(finding, 2);
  const summary = `${longLivedCount || "Multiple"} long-lived cookie${longLivedCount === 1 ? "" : "s"} retained${trackingCount ? `, including ${trackingCount} tracking-classified` : ""}.${thresholdText}`;
  const context = "Long cookie lifetimes can raise retention, minimization, consent, opt-out, and disclosure review questions.";

  return {
    evidenceBasis: [
      vendors.length > 0 ? `Representative vendors: ${formatInlineList(vendors)}.` : null,
      domains.length > 0 ? `Representative domains: ${formatInlineList(domains)}.` : null,
      longestDuration && thresholdDays ? `Longest observed lifetime: about ${formatApproxDurationDays(longestDuration)}; CertScore.ai threshold: ${thresholdDays} days.` : null,
      CERTSCORE_REVIEW_DISCLAIMER
    ].filter(Boolean).join(" "),
    reviewFocus: "Confirm each cookie's purpose, vendor role, consent state, retention disclosure, opt-out behavior, and whether the observed lifetime is intentionally configured.",
    summary: `${summary} ${context}`
  };
}

function buildExecutiveFindingCardCopy(finding: CertScoreFinding): ExecutiveFindingCardCopy {
  if (finding.id === "pre_consent_tracking_detected") {
    return buildPreConsentTrackingCardCopy(finding);
  }
  if (finding.id === "long_lived_cookie_retention_review") {
    return buildCookieRetentionCardCopy(finding);
  }
  if (isAccessibilityFinding(finding)) {
    return buildAccessibilityCardCopy(finding);
  }

  const vendors = getRepresentativeVendorNames(finding);
  const domains = getRepresentativeDomainNames(finding);
  const countEntries = Object.entries(finding.evidenceDetails?.counts ?? {})
    .filter(([, value]) => typeof value === "number" && value > 0)
    .slice(0, 2)
    .map(([key, value]) => `${value} ${key.replaceAll("_", " ")}`);
  const observedEvidence = [
    vendors.length > 0 ? `Representative vendors: ${formatInlineList(vendors)}.` : null,
    domains.length > 0 ? `Representative domains: ${formatInlineList(domains)}.` : null,
    countEntries.length > 0 ? `Retained counts: ${countEntries.join("; ")}.` : null
  ].filter(Boolean).join(" ");
  const fallbackSummary = finding.shortSummary || `${finding.label} surfaced from retained scan evidence.`;

  return {
    evidenceBasis: `${observedEvidence || fallbackSummary} ${CERTSCORE_REVIEW_DISCLAIMER}`,
    reviewFocus: sentenceCase(getRecommendedNextStep(finding).replace(/^Next step:\s*/i, "")),
    summary: `${observedEvidence || fallbackSummary} ${finding.whyItMatters ? finding.whyItMatters.split(/(?<=[.!?])\s+/)[0] : ""}`.trim()
  };
}

function getFindingEvidenceAnchor(finding: CertScoreFinding) {
  return `finding-evidence-${finding.id}`;
}

function DetailDisclosure(input: {
  defaultOpen?: boolean;
  itemDisplay?: "plain" | "brand";
  items: string[];
  previewItems?: string[];
  richItems?: Array<{ key: string; node: React.ReactNode }>;
  summaryMeta?: React.ReactNode;
  summary: string;
  title?: string;
  scrollable?: boolean;
  truncationNote?: string | null;
}) {
  const uniqueItems = [...new Set(input.items.filter(Boolean))];
  const richItems = input.richItems ?? [];

  if (uniqueItems.length === 0 && richItems.length === 0) {
    return null;
  }

  return (
    <details className="group mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5" open={input.defaultOpen}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-xs font-medium text-slate-700">
        <span className="min-w-0 space-y-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <span>{input.summary}</span>
            {input.summaryMeta}
          </span>
          {input.previewItems && input.previewItems.length > 0 ? (
            <span className="block text-[11px] font-normal leading-5 text-slate-500">
              {input.previewItems.join(", ")}
            </span>
          ) : null}
        </span>
        <ScanReportDisclosureIcon />
      </summary>
      <div className="mt-3 space-y-2">
        {input.title ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{input.title}</p>
        ) : null}
        {input.truncationNote ? (
          <p className="text-xs leading-5 text-slate-600">
            {input.truncationNote}
          </p>
        ) : null}
        <div className={`flex flex-wrap gap-2 ${input.scrollable ? "max-h-[13.2rem] overflow-y-auto pr-1" : ""}`}>
          {richItems.map((item) => (
            <React.Fragment key={item.key}>{item.node}</React.Fragment>
          ))}
          {uniqueItems.map((item) => (
            input.itemDisplay === "brand" ? (
              <VendorBrandChip
                key={item}
                category="domain"
                label={item}
                suffix={getVendorBrandMark(item).logoPath ? "logo matched" : "domain"}
              />
            ) : (
              <span key={item} className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
                {item}
              </span>
            )
          ))}
        </div>
      </div>
    </details>
  );
}

type RegulatoryLens = {
  acronym: string;
  detailTitle: string;
  ratingLabel: string;
  score: number | null;
  summary: string;
  toneClass: string;
  findings: RegulatoryLensFinding[];
  minimal?: boolean;
};

type RegulatoryLensFinding = {
  evidence: Record<string, unknown>;
  guideHref?: string;
  id: string;
  label: string;
  reviewContextChips?: string[];
  reviewContextCopy?: string;
  reviewContextLabel?: string;
};

const CONTEXT_ONLY_REGULATORY_FINDING_SOURCES = new Set(["regulatory_counts", "regulatory_lens_score_driver"]);

const CANONICAL_EVIDENCE_FINDING_IDS = new Set([
  "pre_consent_tracking_detected",
  "reject_tracking_persists_after_reject",
  "third_party_tracking_pre_consent",
  "rtb_cookie_sync_observed",
  "cross_domain_identifier_sharing_observed",
  "cookie_disclosure_gap",
  "third_party_cookie_pre_consent",
  "analytics_cookie_pre_consent",
  "adtech_cookie_pre_consent",
  "telemetry_rich_identification_observed",
  "reject_option_missing_or_hidden",
  "asymmetric_consent_ui",
  "forced_consent_interaction",
  "blocking_overlay_observed",
  "content_obstructed_by_overlay",
  "repeated_consent_prompt",
  "multi_vendor_tracking_detected",
  "session_recording_services_detected",
  "possible_session_replay_on_sensitive_input_surface",
  "sensitive_data_collection_with_third_party_tracking_present",
  "sensitive_collection_surface_observed",
  "video_content_tracking_exposure",
  "pre_submit_text_capture_detected",
  "identifier_transmission_detected",
  "device_data_collection_detected",
  "probable_fingerprinting",
  "non_cookie_tracking_detected",
  "high_request_density",
  "large_third_party_footprint",
  "collection_endpoints_detected",
  "consent_dark_patterns_detected",
  "policy_behavior_contradiction_detected",
  "policy_clarity_risk",
  "tracking_redirect_chain",
  "autoplay_before_consent",
  "popup_or_modal_present",
  "interstitial_detected",
  "accessibility_risk_score"
]);

const GDPR_EPRIVACY_REGULATORY_FINDING_IDS = new Set([
  "pre_consent_tracking_detected",
  "reject_tracking_persists_after_reject",
  "third_party_tracking_pre_consent",
  "third_party_cookie_pre_consent",
  "analytics_cookie_pre_consent",
  "adtech_cookie_pre_consent",
  "long_lived_cookie_retention_review",
  "rtb_cookie_sync_observed",
  "identifier_transmission_detected",
  "device_data_collection_detected",
  "telemetry_rich_identification_observed",
  "probable_fingerprinting",
  "non_cookie_tracking_detected",
  "multi_vendor_tracking_detected",
  "large_third_party_footprint",
  "collection_endpoints_detected",
  "reject_option_missing_or_hidden",
  "asymmetric_consent_ui",
  "forced_consent_interaction",
  "blocking_overlay_observed",
  "content_obstructed_by_overlay",
  "repeated_consent_prompt",
  "autoplay_before_consent",
  "cookie_disclosure_gap",
  "policy_behavior_contradiction_detected",
  "policy_clarity_risk",
  "tracking_redirect_chain",
  "high_request_density"
]);

function compactEvidenceRecord(value: Record<string, unknown> | undefined, keys: string[]) {
  if (!value) {
    return undefined;
  }

  const compacted = compactObject(value, keys);
  return Object.keys(compacted).length > 0 ? compacted : undefined;
}

function compactStringList(values: string[] | undefined, maxItems = 4, maxLength = 180) {
  const items = (values ?? [])
    .filter((value) => value.trim().length > 0)
    .filter((value) => !value.trim().startsWith("{"))
    .slice(0, maxItems)
    .map((value) => (value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value));
  return items.length > 0 ? items : undefined;
}

function compactRepresentativeRequests(requests: unknown) {
  const items = (Array.isArray(requests) ? requests : [])
    .filter(isPlainObject)
    .slice(0, 3)
    .map((request) =>
      compactObject(request, [
        "scannedPageUrl",
        "requestUrl",
        "vendor",
        "vendorName",
        "category",
        "vendorCategory",
        "vendorAttributionBasis",
        "hostname",
        "registrableDomain",
        "firstSeenMs",
        "firstObservedMs",
        "consentActionMs",
        "noConsentActionObserved",
        "consentSurfaceObserved",
        "consentInteractionRecorded",
        "confidence",
        "runtimePhase",
        "ms",
        "resourceType",
        "resource_type",
        "url"
      ])
    );
  return items.length > 0 ? items : undefined;
}

function compactPreconsentRepresentativeRequests(details: CertScoreFinding["evidenceDetails"]) {
  const promotionRows = buildPromotionGradePreconsentRequests({
    rows: [
      ...(Array.isArray(details?.requestClassificationAnchors) ? details.requestClassificationAnchors : []),
      ...(Array.isArray(details?.representativeRequests) ? details.representativeRequests : [])
    ],
    scannedPageUrl: details?.scanContext?.pageUrl ?? null,
    consentTimeline: isPlainObject(details?.timing) ? details.timing : null,
    maxItems: 5
  });

  if (promotionRows.length > 0) {
    return promotionRows;
  }

  return compactRepresentativeRequests(details?.representativeRequests) ?? [];
}

function getRuntimeEvidenceConfidence(finding: CertScoreFinding) {
  if (finding.confidence === "strong") {
    return "strong";
  }
  if (finding.confidence === "good") {
    return "good";
  }
  return "review_signal";
}

function getRuntimeDirectnessLabel(finding: CertScoreFinding) {
  switch (finding.directVsInferred) {
    case "direct":
      return "direct_observation";
    case "mixed":
      return "correlated_observation";
    case "inferred":
      return "clustered_inference";
    default:
      return "direct_observation";
  }
}

function buildRuntimeEvidenceMetadata(finding: CertScoreFinding) {
  const eligibility = evaluateTopFindingEligibility(finding);

  return {
    evidenceSchema: "runtime_report_evidence",
    evidenceVersion: finding.evidenceVersion ?? "1.1",
    evidenceConfidence: eligibility.evidenceConfidence ?? getRuntimeEvidenceConfidence(finding),
    directnessClassification: getRuntimeDirectnessLabel(finding),
    topFindingEligibility: {
      eligibility: eligibility.eligibility,
      matchedCriteria: eligibility.matchedCriteria,
      missingCorroborators: eligibility.missingCorroborators,
      demotionReasons: eligibility.demotionReasons
    },
    publicReportEvidenceHandling: {
      queryStrings: "redacted_when_urls_are_included",
      cookieValues: "not_retained_in_public_report",
      retainedArtifacts: "only fields present in this evidence packet are included"
    },
    automationLimits: [
      "Automated public-web observation for human and agentic review, not a legal conclusion.",
      "Not detected means not observed within scan scope, not proof of absence.",
      "Runtime report evidence uses live scan artifacts; /findings sample JSON is illustrative reference copy."
    ]
  };
}

function buildRegulatoryLensEvidencePayload(finding: CertScoreFinding, context?: Record<string, unknown>) {
  const details = finding.evidenceDetails ?? {};
  const display = getPublicReportFindingDisplayForCertFinding(finding);

  return {
    context,
    confidence: finding.confidence,
    directVsInferred: finding.directVsInferred,
    evidence: {
      counts: details.counts ?? {},
      consentState: details.consentState
        ? compactObject(details.consentState, [
            "userConsentActionObserved",
            "trackingOccurredBeforeConsentChoice",
            "consentBannerObserved",
            "userActionType"
          ])
        : undefined,
      timing: details.timing ?? undefined,
      vendors: compactStringList([
        ...(details.runtimeVendors ?? []),
        ...((details.directlyObservedPreConsentVendors ?? details.vendors ?? []).map((vendor) => vendor.name))
      ]),
      runtimeRequestUrls: compactStringList(details.runtimeRequestUrls, 3, 220),
      evidenceFlags: compactStringList(details.evidenceFlags, 5, 140),
      representativeRequests: compactRepresentativeRequests(details.representativeRequests),
      cookieEvidence: compactEvidenceRecord(details.cookieEvidence, [
        "observed",
        "cookieCount",
        "thirdPartyCookieCount",
        "preConsentCookieCount",
        "trackingCookieWritesBeforeConsent",
        "totalUniqueCookiesObserved",
        "cookieNames",
        "cookieWriteEvidence",
        "storageEvidence",
        "representativePreConsentRequests",
        "relatedRuntimeRequests"
      ]),
      consentUiEvidence: compactEvidenceRecord(details.consentUiEvidence, ["observed", "result", "subtype", "rejectOptionSubtype", "userChoiceImpact"]),
      postRejectEvidence: compactEvidenceRecord(details.postRejectEvidence, ["trackingPersistedAfterReject", "baselineRequestCount", "postRejectRequestCount"]),
      optOutControlEvidence: compactEvidenceRecord(details.optOutControlEvidence, ["result", "optOutSubtype", "missingOrAbsent", "incompleteOrUnconfirmed"]),
      sessionReplayEvidence: compactEvidenceRecord(details.sessionReplayEvidence, ["observed", "vendorCount", "requestCount"]),
      telemetryEvidence: compactEvidenceRecord(details.telemetryEvidence, [
        "basis",
        "confidenceExplanation",
        "identifierLikeRequestCount",
        "fingerprintPurposeFraming"
      ]),
      accessibilityEvidence: compactEvidenceRecord(details.accessibilityEvidence, [
        "observed",
        "affectedNodes",
        "axeRuleId",
        "impact",
        "issueCount",
        "pageCount",
        "ruleCodes",
        "wcagRule"
      ]),
      policyEvidence: details.policyEvidence ?? undefined,
      limitations: compactStringList(details.limitations, 3, 180)
    },
    evidencePreview: compactStringList(finding.evidencePreview, 3, 220),
    evidenceRefs: compactStringList(finding.evidenceRefs, 3, 220),
    findingId: finding.id,
    label: display.title,
    section: finding.section,
    criticality: display.criticality,
    scanPriority: finding.severity,
    shortSummary: finding.shortSummary
  };
}

function buildFindingEvidencePayload(finding: CertScoreFinding, context?: Record<string, unknown>) {
  const display = getPublicReportFindingDisplayForCertFinding(finding);
  if (finding.id === "reject_tracking_persists_after_reject") {
    return {
      context,
      ...compactRejectEvidenceJsonPayload(finding)
    };
  }

  return {
    context,
    confidence: finding.confidence,
    directVsInferred: finding.directVsInferred,
    evidenceDetails: finding.evidenceDetails ?? null,
    evidencePreview: finding.evidencePreview,
    evidenceRefs: finding.evidenceRefs,
    findingId: finding.id,
    label: display.title,
    section: finding.section,
    criticality: display.criticality,
    scanPriority: finding.severity,
    shortSummary: finding.shortSummary
  };
}

function buildRegulatoryLensFinding(input: {
  evidence: Record<string, unknown>;
  guideHref?: string;
  id: string;
  label: string;
  reviewContextChips?: string[];
  reviewContextCopy?: string;
  reviewContextLabel?: string;
}) {
  return input satisfies RegulatoryLensFinding;
}

function buildRegulatoryLensFindingFromCertFinding(
  finding: CertScoreFinding,
  label = finding.shortSummary,
  context?: Record<string, unknown>
) {
  const regulatoryContext = getFindingRegulatoryContext(finding.id);
  const display = getPublicReportFindingDisplayForCertFinding(finding);
  const reviewContextChips = filterReviewContextChipsForLens(
    getFindingReviewContextChips(finding.id, 6),
    typeof context?.lens === "string" ? context.lens : null
  ).slice(0, 4);

  return buildRegulatoryLensFinding({
    evidence: {
      ...buildRegulatoryLensEvidencePayload(finding, context),
      ...(regulatoryContext
        ? {
            regulatoryReviewContext: {
              caution: regulatoryContext.displayCaution,
              primaryConcern: regulatoryContext.primaryConcern.label
            }
          }
        : {})
    },
    guideHref: regulatoryContext ? `/findings/${finding.id}` : undefined,
    id: finding.id,
    label: display.referenceId && (label === finding.shortSummary || label === finding.label) ? display.title : label,
    reviewContextChips,
    reviewContextCopy: regulatoryContext?.primaryConcern.displayCopy,
    reviewContextLabel: regulatoryContext?.primaryConcern.label
  });
}

function filterReviewContextChipsForLens(chips: string[], lens: string | null) {
  if (!lens) {
    return chips;
  }
  if (/GDPR|ePrivacy/i.test(lens)) {
    return chips.filter((chip) => /GDPR|ePrivacy|Article 5|consent|cookie|tracking/i.test(chip));
  }
  return chips;
}

function buildObservedCountLensFinding(input: {
  count: number;
  evidence?: Record<string, unknown> | null;
  id: string;
  label: string;
  metric: string;
  reviewContextCopy?: string;
  reviewContextLabel?: string;
  source: string;
}) {
  return buildRegulatoryLensFinding({
    evidence: {
      count: input.count,
      ...compactObservedCountEvidence(input.evidence),
      metric: input.metric,
      reason: input.label,
      source: input.source
    },
    id: input.id,
    label: input.label,
    reviewContextCopy: input.reviewContextCopy,
    reviewContextLabel: input.reviewContextLabel
  });
}

function compactObservedCountEvidence(evidence: Record<string, unknown> | null | undefined) {
  if (!evidence) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(evidence).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }

      return value !== undefined && value !== null;
    })
  );
}

const COOKIE_CONTEXT_NOT_TOP_LEVEL_COPY =
  "Cookie timing context was retained, but CertScore.ai did not retain enough classified non-essential tracking/vendor evidence to promote this into a top-level pre-consent tracking finding.";

function hasNonEmptyArrayEvidence(value: Record<string, unknown> | null | undefined, keys: string[]) {
  return keys.some((key) => {
    const item = value?.[key];
    return Array.isArray(item) && item.some((entry) => typeof entry === "string" && entry.trim().length > 0);
  });
}

function hasBeforeConsentCookieAttribution(evidence: Record<string, unknown> | null | undefined) {
  const preconsentRequestRows = evidence?.preconsentRequestRows;
  return (
    (Array.isArray(preconsentRequestRows) && preconsentRequestRows.length > 0) ||
    hasNonEmptyArrayEvidence(evidence, [
    "cookieCategories",
    "cookieVendors",
      "initiatorUrls"
    ])
  );
}

function hasBeforeConsentCookieDetailRows(evidence: Record<string, unknown> | null | undefined) {
  const cookieTimingRows = evidence?.cookieTimingRows;
  return (
    (Array.isArray(cookieTimingRows) && cookieTimingRows.length > 0) ||
    hasNonEmptyArrayEvidence(evidence, ["cookieNames", "cookieTimingEvidence", "initiatorDomains"])
  );
}

function formatBeforeConsentCookieCountLabel(count: number, evidence: Record<string, unknown> | null | undefined) {
  if (hasBeforeConsentCookieAttribution(evidence)) {
    return `${count} classified cookie records were observed before consent.`;
  }
  if (hasBeforeConsentCookieDetailRows(evidence)) {
    return `${count} cookie timing records were retained before consent with cookie-level timing details.`;
  }
  return `${count} cookie timing records were retained before consent; vendor/category attribution was not retained.`;
}

function buildRegulatoryLensScoreDriver(input: {
  evidence?: Record<string, unknown> | null;
  id: string;
  label: string;
}) {
  return buildRegulatoryLensFinding({
    evidence: {
      ...(input.evidence ?? {}),
      reason: input.label,
      source: "regulatory_lens_score_driver"
    },
    id: input.id,
    label: input.label
  });
}

function mergeRegulatoryLensFindings(items: RegulatoryLensFinding[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function isContextOnlyLensFinding(finding: RegulatoryLensFinding) {
  return CONTEXT_ONLY_REGULATORY_FINDING_SOURCES.has(String(finding.evidence.source ?? ""));
}

function isMeasuredCountLensFinding(finding: RegulatoryLensFinding) {
  return (
    finding.evidence.source === "regulatory_counts" &&
    typeof finding.evidence.count === "number" &&
    Number.isFinite(finding.evidence.count) &&
    finding.evidence.count > 0
  );
}

function buildMappedRegulatoryLensFindings(input: {
  context?: Record<string, unknown>;
  findingIds: Set<string>;
  findings: CertScoreFinding[];
}) {
  return rankFindings(input.findings)
    .filter((finding) => input.findingIds.has(finding.id))
    .map((finding) =>
      buildRegulatoryLensFindingFromCertFinding(
        finding,
        finding.shortSummary,
        input.context
      )
    );
}

function addMappedFindingId(target: Set<string>, findingIds: Set<string>, findingId: string) {
  if (findingIds.has(findingId)) {
    target.add(findingId);
  }
}

function hasAnyFinding(findingIds: Set<string>, ids: string[]) {
  return ids.some((id) => findingIds.has(id));
}

function shouldMapCrossDomainIdentifierSharingToGdpr(input: {
  beforeConsentCookieCount: number;
  findingIds: Set<string>;
}) {
  return (
    input.beforeConsentCookieCount > 0 ||
    hasAnyFinding(input.findingIds, [
      "pre_consent_tracking_detected",
      "reject_tracking_persists_after_reject",
      "third_party_tracking_pre_consent",
      "third_party_cookie_pre_consent",
      "analytics_cookie_pre_consent",
      "adtech_cookie_pre_consent",
      "rtb_cookie_sync_observed",
      "identifier_transmission_detected",
      "device_data_collection_detected",
      "probable_fingerprinting",
      "non_cookie_tracking_detected"
    ])
  );
}

function shouldMapConsentDarkPatternsToGdpr(input: {
  beforeConsentCookieCount: number;
  findingIds: Set<string>;
  hasTrackingConcern: boolean;
}) {
  return (
    input.hasTrackingConcern ||
    input.beforeConsentCookieCount > 0 ||
    hasAnyFinding(input.findingIds, [
      "reject_tracking_persists_after_reject",
      "pre_consent_tracking_detected",
      "third_party_tracking_pre_consent",
      "third_party_cookie_pre_consent",
      "analytics_cookie_pre_consent",
      "adtech_cookie_pre_consent",
      "rtb_cookie_sync_observed"
    ])
  );
}

export type ExecutiveAccessLimitationNotice = {
  blockerLabel?: string | null;
  coverageLabel: string;
  headline: string;
  message: string;
  recommendationTitle: string;
  reason: string;
  title: string;
  whatThisMeans: string[];
  guidance: string[];
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function buildTone(score: number) {
  if (score >= 85) {
    return { label: "Strong", toneClass: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  }
  if (score >= 65) {
    return { label: "Watch", toneClass: "border-amber-200 bg-amber-50 text-amber-800" };
  }
  if (score < 40) {
    return { label: "High-priority remediation", toneClass: "border-rose-300 bg-rose-100 text-rose-900" };
  }
  return { label: "Needs work", toneClass: "border-rose-200 bg-rose-50 text-rose-800" };
}

function buildMinimalRegulatoryLens(input: {
  acronym: string;
  detailTitle: string;
  ratingLabel?: string;
  score?: number | null;
  summary: string;
  toneClass?: string;
}) {
  const score = input.score ?? 88;
  const tone = buildTone(score);

  return {
    acronym: input.acronym,
    detailTitle: input.detailTitle,
    findings: [],
    minimal: true,
    ratingLabel: input.ratingLabel ?? tone.label,
    score: input.score === null ? null : score,
    summary: input.summary,
    toneClass: input.toneClass ?? tone.toneClass
  } satisfies RegulatoryLens;
}

function AccessLimitationDetails(input: { notice: ExecutiveAccessLimitationNotice }) {
  return (
    <div className="space-y-3">
      <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50/70 px-4 py-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">Scan coverage</p>
        <p className="mt-2 text-sm font-semibold text-amber-950">{input.notice.coverageLabel}</p>
        <DetailDisclosure
          summary="Exact block reason"
          title="Retained access note"
          items={[input.notice.message, input.notice.reason]}
        />
      </div>
      <div className="rounded-[1.2rem] border border-amber-200 bg-white px-4 py-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">What this means</p>
        <DetailDisclosure
          summary={`${input.notice.whatThisMeans.length} interpretation point${input.notice.whatThisMeans.length === 1 ? "" : "s"}`}
          title="Interpretation guidance"
          items={input.notice.whatThisMeans}
        />
      </div>
      <div className="rounded-[1.2rem] border border-amber-200 bg-white px-4 py-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">{input.notice.recommendationTitle}</p>
        <DetailDisclosure
          summary={`${input.notice.guidance.length} next step${input.notice.guidance.length === 1 ? "" : "s"}`}
          title="Recommended follow-up"
          items={input.notice.guidance}
        />
      </div>
    </div>
  );
}

function ScanProofPanel(input: { proof: ExecutiveScanProof; requestedHost: string | null; durationMs?: number | null; coverageLimitation?: string | null }) {
  const durationLabel = typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
    ? `${(input.durationMs / 1000).toFixed(1)}s observed`
    : "Duration unavailable";
  const rows = [
    ["Requested host", input.requestedHost ?? "Unavailable"],
    ["Final page", input.proof.finalUrl ?? "Unavailable"],
    ["Browser/script activity", `${input.proof.scriptActivity === "observed" ? "Observed" : "Not verified"} · ${durationLabel}`],
    ["Initial visual evidence", input.proof.screenshot.captureMethod ? `${input.proof.screenshot.status.replaceAll("_", " ")} · ${input.proof.screenshot.captureMethod}` : input.proof.screenshot.status.replaceAll("_", " ")],
    ["Consent inspection", input.proof.consentInspection.replaceAll("_", " ")],
    ["Runtime coverage", input.proof.runtimeCoverage.replaceAll("_", " ")],
    ["Network activity", `${input.proof.networkActivity.status === "observed" ? "Observed" : "Not verified"} · ${input.proof.networkActivity.count ?? "—"} third-party requests`]
  ] as Array<readonly [string, string]>;
  if (input.coverageLimitation) {
    rows.push(["Coverage limitation", input.coverageLimitation]);
  }
  return (
    <details className="group/scan-proof relative inline-block">
      <summary
        aria-label="Show observation details"
        className="inline-flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-900 marker:hidden [&::-webkit-details-marker]:hidden"
        title="Show observation details"
      >
        <ScanReportDisclosureIcon className="h-5 w-5 group-open/scan-proof:rotate-90" />
      </summary>
      <div className="absolute right-0 top-full z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
      <dl className="space-y-2 text-xs leading-5">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
            <dt className="text-slate-500">{label}</dt>
            <dd className="break-words font-medium text-slate-700">{value}</dd>
          </div>
        ))}
      </dl>
      </div>
    </details>
  );
}

export function buildRegulatoryLenses(
  findings: CertScoreFinding[],
  counts: {
    beforeConsentCookieCount: number;
    thirdPartyRequestCount: number;
  },
  options?: {
    accessibilitySignals?: {
      accessibilityClaimMismatchDetected?: boolean | null;
      accessibilityLitigationRiskScore?: number | null;
      accessibilityStatementPresent?: boolean | null;
      adaDemandLetterProbability?: number | null;
      ecommerceSiteLikely?: boolean | null;
      wcagErrorCountTotal?: number | null;
      wcagFormLabelErrorCount?: number | null;
      wcagKeyboardNavigationIssueCount?: number | null;
      wcagMissingAltCount?: number | null;
      wcagViolations?: Array<{
        description: string;
        help: string;
        helpUrl: string;
        impact: string | null;
        nodeCount: number;
        pageUrl: string;
        representativeSelectors: string[];
        ruleCode: string;
        ruleGroup: string;
        severity: string;
      }>;
    } | null;
    agencyMappings?: AgencyMapping[];
    benchmarkIndustry?: string | null;
    gdprEprivacyPostureScore?: number | null;
    regulatoryRisk?: RegulatoryRiskAssessment | null;
    unifiedContext?: UnifiedRegulatoryContext | null;
  }
): RegulatoryLens[] {
  const findingIds = new Set(findings.map((finding) => finding.id));
  const trackingFinding =
    findings.find((finding) => finding.id === "pre_consent_tracking_detected") ??
    findings.find((finding) => finding.id === "rtb_cookie_sync_observed") ??
    findings.find((finding) => finding.id === "reject_tracking_persists_after_reject") ??
    findings.find((finding) => finding.id === "third_party_tracking_pre_consent") ??
    findings.find((finding) => finding.id === "third_party_cookie_pre_consent") ??
    findings.find((finding) => finding.id === "analytics_cookie_pre_consent") ??
    findings.find((finding) => finding.id === "adtech_cookie_pre_consent") ??
    findings.find((finding) => /pre[- ]consent|before consent/i.test(`${finding.label} ${finding.shortSummary}`));
  const sensitiveTrackingFinding =
    findings.find((finding) => finding.id === "sensitive_data_collection_with_third_party_tracking_present") ??
    findings.find((finding) => finding.id === "possible_session_replay_on_sensitive_input_surface");
  const hasTrackingConcern =
    options?.unifiedContext?.hasTrackingConcern ??
    (findingIds.has("pre_consent_tracking_detected") ||
      findingIds.has("rtb_cookie_sync_observed") ||
      findingIds.has("cookie_disclosure_gap") ||
      findingIds.has("long_lived_cookie_retention_review") ||
      findingIds.has("reject_tracking_persists_after_reject") ||
      findingIds.has("third_party_tracking_pre_consent") ||
      findingIds.has("third_party_cookie_pre_consent") ||
      findingIds.has("analytics_cookie_pre_consent") ||
      findingIds.has("adtech_cookie_pre_consent") ||
      Boolean(trackingFinding));
  const beforeConsentCookieCount = options?.unifiedContext?.beforeConsentCookieCount ?? counts.beforeConsentCookieCount;
  const thirdPartyRequestCount = options?.unifiedContext?.thirdPartyRequestCount ?? counts.thirdPartyRequestCount;
  const hasPreConsentCookieConcern = beforeConsentCookieCount > 0;
  const retainedCookieContextExplanation =
    !trackingFinding && beforeConsentCookieCount > 0 ? COOKIE_CONTEXT_NOT_TOP_LEVEL_COPY : undefined;
  const beforeConsentCookieEvidence = options?.unifiedContext?.beforeConsentCookieEvidence;
  const noConfirmedCookieBannerWithPreConsentTracking =
    options?.unifiedContext?.cookieBannerPresent === false &&
    (hasTrackingConcern || hasPreConsentCookieConcern);
  const hasThirdPartyTrackingFootprint = thirdPartyRequestCount > 0;
  const hasPreConsentTrackingRisk = hasThirdPartyTrackingFootprint && (hasTrackingConcern || hasPreConsentCookieConcern);
  const hasConsentConcern =
    findingIds.has("consent_dark_patterns_detected") ||
    findingIds.has("asymmetric_consent_ui") ||
    findingIds.has("reject_option_missing_or_hidden") ||
    findingIds.has("forced_consent_interaction") ||
    findingIds.has("reject_tracking_persists_after_reject");
  const gdprRegulatoryFindingIds = new Set(GDPR_EPRIVACY_REGULATORY_FINDING_IDS);
  if (shouldMapCrossDomainIdentifierSharingToGdpr({ beforeConsentCookieCount, findingIds })) {
    addMappedFindingId(gdprRegulatoryFindingIds, findingIds, "cross_domain_identifier_sharing_observed");
  }
  if (shouldMapConsentDarkPatternsToGdpr({ beforeConsentCookieCount, findingIds, hasTrackingConcern })) {
    addMappedFindingId(gdprRegulatoryFindingIds, findingIds, "consent_dark_patterns_detected");
  }

  const privacyTrackingNotes = mergeRegulatoryLensFindings([
    ...buildMappedRegulatoryLensFindings({
      context: { lens: "GDPR / ePrivacy", reason: "mapped_regulatory_finding" },
      findingIds: gdprRegulatoryFindingIds,
      findings
    }),
    beforeConsentCookieCount > 0
        ? buildObservedCountLensFinding({
            count: beforeConsentCookieCount,
            evidence: beforeConsentCookieEvidence,
            id: "before_consent_cookie_count",
            label: formatBeforeConsentCookieCountLabel(beforeConsentCookieCount, beforeConsentCookieEvidence),
            metric: "beforeConsentCookieCount",
            reviewContextCopy: retainedCookieContextExplanation,
            reviewContextLabel: retainedCookieContextExplanation ? "Why not top-level?" : undefined,
            source: "regulatory_counts"
          })
      : null
  ].filter((item): item is RegulatoryLensFinding => Boolean(item)));

  const canonicalPostureScore =
    typeof options?.gdprEprivacyPostureScore === "number" &&
    Number.isFinite(options.gdprEprivacyPostureScore)
      ? clampScore(options.gdprEprivacyPostureScore)
      : null;
  const gdprDisplay = canonicalPostureScore === null
    ? {
        score: null,
        tone: {
          label: "Not scored",
          toneClass: "border-slate-300 bg-slate-100 text-slate-700"
        }
      }
    : {
        score: canonicalPostureScore,
        tone: buildTone(canonicalPostureScore)
      };

  const lenses: RegulatoryLens[] = [
    {
      acronym: "GDPR / ePrivacy",
      detailTitle: "Consent and tracking issues",
      findings: privacyTrackingNotes,
      ratingLabel: gdprDisplay.tone.label,
      score: gdprDisplay.score,
      summary: noConfirmedCookieBannerWithPreConsentTracking && hasPreConsentTrackingRisk
        ? "First-layer reject availability and pre-consent third-party activity are the main review items."
        : noConfirmedCookieBannerWithPreConsentTracking && hasPreConsentCookieConcern
        ? "Consent and pre-consent cookie/storage evidence are the main issue."
        : hasPreConsentTrackingRisk
        ? "Pre-consent third-party activity is the main review item."
        : hasPreConsentCookieConcern
        ? "Consent and pre-consent cookie/storage evidence are the main issue."
        : hasTrackingConcern
        ? "Consent and retained privacy evidence should be reviewed."
        : sensitiveTrackingFinding
        ? "Sensitive-data collection and tracking exposure are the main issue."
        : "No major consent-triggering issue surfaced in the top findings.",
      toneClass: gdprDisplay.tone.toneClass
    }
  ];

  return lenses;
}

export function buildRegulatoryLensesFromUnifiedPackets(
  packets: UnifiedFindingDisplayPacket[],
  counts: Parameters<typeof buildRegulatoryLenses>[1],
  options?: Parameters<typeof buildRegulatoryLenses>[2]
) {
  const representativeAccessibilityPackets = packets.filter(
    (packet) =>
      packet.presentationDecision.status === "surface" &&
      packet.details?.family === "accessibility" &&
      packet.evidence?.flags?.includes("representative_accessibility_examples_retained")
  );
  const hasRepresentativeAccessibilityEvidence = representativeAccessibilityPackets.length > 0;
  const representativeAccessibilityCoverage = representativeAccessibilityPackets.reduce(
    (accumulator, packet) => {
      const packetCounts = packet.evidence?.counts ?? {};
      const packetEntities = packet.evidence?.entities ?? {};
      const exampleCount = packetCounts.representativeAxeExampleCount ?? 0;
      const pageCount = packetCounts.representativeAxePageCount ?? packet.evidence?.pageUrls?.length ?? 0;
      const ruleCount =
        packetCounts.representativeAxeRuleCount ??
        (packet.details?.family === "accessibility" ? packet.details.ruleExamples?.length : 0) ??
        0;
      const maxImpact = packetEntities.maxAxeImpact?.[0] ?? accumulator.maxImpact;

      return {
        distinctPageCount: Math.max(accumulator.distinctPageCount, pageCount),
        distinctRuleCount: Math.max(accumulator.distinctRuleCount, ruleCount),
        hasSevereExample: accumulator.hasSevereExample || /^(?:critical|serious|high)$/i.test(maxImpact ?? ""),
        maxImpact,
        representativeExampleCount: accumulator.representativeExampleCount + exampleCount
      };
    },
    {
      distinctPageCount: 0,
      distinctRuleCount: 0,
      hasSevereExample: false,
      maxImpact: null as string | null,
      representativeExampleCount: 0
    }
  );
  const representativeAccessibilitySummary =
    representativeAccessibilityCoverage.representativeExampleCount > 0
      ? formatRepresentativeAccessibilityCoverage(representativeAccessibilityCoverage)
      : null;
  const accessibilityOptions =
    hasRepresentativeAccessibilityEvidence
      ? {
          ...options,
          accessibilitySignals: {
            ...(options?.accessibilitySignals ?? {}),
            wcagErrorCountTotal:
              options?.accessibilitySignals?.wcagErrorCountTotal ??
              Math.max(representativeAccessibilityCoverage.representativeExampleCount, representativeAccessibilityPackets.length)
          }
        }
      : options;
  const surfacedPackets = packets.filter((packet) => packet.presentationDecision.status === "surface");
  const projection = projectExecutiveFindingsFromUnifiedPackets(packets);
  const surfacedText = surfacedPackets
    .flatMap((packet) => [
      packet.summary,
      packet.observedValue,
      ...(packet.evidence?.snippets ?? []),
      ...Object.values(packet.evidence?.entities ?? {}).flat()
    ])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
  const packetDerivedBeforeConsentCookieObservationCount = surfacedPackets.reduce((count, packet) => {
    const entities = packet.evidence?.entities ?? {};
    return count + Math.max(
      entities.preconsent_nonessential_cookie_names?.length ?? 0,
      entities.preconsent_cookie_names?.length ?? 0,
      entities.preconsentNonessentialCookieNames?.length ?? 0,
      entities.preconsentCookieNames?.length ?? 0
    );
  }, 0);
  const getPacketEntityStrings = (packet: UnifiedFindingDisplayPacket, keys: string[]) => {
    const entities = packet.evidence?.entities as Record<string, unknown> | undefined;
    return uniqueStrings(keys.flatMap((key) => {
      const value = entities?.[key];
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    }));
  };
  const consentTrackingPackets = packets.filter((packet) => packet.unifiedFindingId === "preconsent_tracking");
  const beforeConsentCookieTimingRows = consentTrackingPackets.flatMap((packet) =>
    parsePacketEvidenceRows(getPacketEntityStrings(packet, ["preconsent_cookie_evidence", "preconsentCookieEvidence"]))
      .map(compactCookieEvidenceRow)
  );
  const preconsentRequestRows = consentTrackingPackets.flatMap((packet) =>
    parsePacketEvidenceRows(getPacketEntityStrings(packet, ["preconsent_violation_evidence", "preconsentViolationEvidence"]))
      .map(compactPreconsentRequestEvidenceRow)
  );
  const beforeConsentCookieEvidence = {
    cookieNames: uniqueStrings(consentTrackingPackets.flatMap((packet) =>
      getPacketEntityStrings(packet, [
        "preconsent_nonessential_cookie_names",
        "preconsent_cookie_names",
        "preconsentNonessentialCookieNames",
        "preconsentCookieNames"
      ])
    )),
    cookieCategories: uniqueStrings(consentTrackingPackets.flatMap((packet) =>
      getPacketEntityStrings(packet, ["preconsent_cookie_categories", "preconsentCookieCategories"])
    )),
    cookieTimingEvidence: uniqueStrings(consentTrackingPackets.flatMap((packet) =>
      getPacketEntityStrings(packet, ["preconsent_cookie_timing_evidence", "preconsentCookieTimingEvidence"])
    )),
    cookieVendors: uniqueStrings(consentTrackingPackets.flatMap((packet) => [
      ...getPacketEntityStrings(packet, [
        "preconsent_cookie_initiator_vendors",
        "preconsentCookieInitiatorVendors",
        "preconsent_tracker_vendors",
        "preconsentTrackerVendors"
      ]),
      ...((packet.details && typeof packet.details === "object" && Array.isArray((packet.details as { vendors?: unknown }).vendors))
        ? (packet.details as { vendors: unknown[] }).vendors.filter((value): value is string => typeof value === "string")
        : [])
    ])),
    initiatorDomains: uniqueStrings(consentTrackingPackets.flatMap((packet) =>
      getPacketEntityStrings(packet, ["preconsent_cookie_initiator_domains", "preconsentCookieInitiatorDomains"])
    )),
    initiatorUrls: uniqueStrings(consentTrackingPackets.flatMap((packet) =>
      getPacketEntityStrings(packet, ["preconsent_cookie_initiator_urls", "preconsentCookieInitiatorUrls"])
    )),
    cookieTimingRows: beforeConsentCookieTimingRows,
    preconsentRequestRows,
    sourceFindingIds: uniqueStrings(consentTrackingPackets.map((packet) => packet.unifiedFindingId)),
    rawObservationCount: packetDerivedBeforeConsentCookieObservationCount
  };
  const packetDerivedThirdPartyRequestCount = surfacedPackets.reduce((count, packet) => {
    const evidenceUrls = packet.evidence?.entities?.preconsent_tracker_evidence_urls?.length ??
      packet.evidence?.entities?.preconsentTrackerEvidenceUrls?.length ??
      0;
    return count + evidenceUrls;
  }, 0);
  const hasSensitiveHealthTrackingRisk =
    /health|medical|patient|symptom|condition|clinical/i.test(surfacedText) &&
    surfacedPackets.some((packet) => (
      packet.unifiedFindingId === "preconsent_tracking" ||
      packet.unifiedFindingId === "sensitive_data_collection_with_third_party_tracking_present"
    ));
  const hasSensitiveGamblingTrackingRisk =
    /gambling|sports betting|sportsbook|casino|wager|bonus bet|responsible gambling|1-800-gambler/i.test(surfacedText) &&
    surfacedPackets.some((packet) => (
      packet.unifiedFindingId === "preconsent_tracking" ||
      packet.unifiedFindingId === "session_replay_observed"
    ));
  const canonicalBeforeConsentCookieCount =
    counts.beforeConsentCookieCount ??
    options?.unifiedContext?.beforeConsentCookieCount ??
    0;
  const canonicalThirdPartyRequestCount =
    counts.thirdPartyRequestCount && counts.thirdPartyRequestCount > 0
      ? counts.thirdPartyRequestCount
      : packetDerivedThirdPartyRequestCount;
  const canonicalBeforeConsentCookieEvidence =
    canonicalBeforeConsentCookieCount > 0
      ? {
          ...beforeConsentCookieEvidence,
          classifiedCookieCount: canonicalBeforeConsentCookieCount
        }
      : null;

  return buildRegulatoryLenses(
    projection.findings,
    {
      beforeConsentCookieCount: canonicalBeforeConsentCookieCount,
      thirdPartyRequestCount: canonicalThirdPartyRequestCount
    },
    {
      ...accessibilityOptions,
      regulatoryRisk: null,
      unifiedContext: {
        beforeConsentCookieEvidence: canonicalBeforeConsentCookieEvidence,
        beforeConsentCookieCount: canonicalBeforeConsentCookieCount,
        cookieBannerPresent: options?.unifiedContext?.cookieBannerPresent,
        rawBeforeConsentCookieObservationCount: packetDerivedBeforeConsentCookieObservationCount,
        hasSensitiveGamblingTrackingRisk,
        hasSensitiveHealthTrackingRisk,
        hasTrackingConcern: surfacedPackets.some((packet) => packet.unifiedFindingId === "preconsent_tracking"),
        thirdPartyRequestCount: canonicalThirdPartyRequestCount
      }
    }
  );
}

function RegulatoryRatingBar(input: { score: number; toneClass: string }) {
  const ratingBucket = Math.max(0, Math.min(5, input.score / 20));

  return (
    <span className="flex items-center gap-1.5">
      {Array.from({ length: 5 }, (_, index) => {
        const segmentFill = Math.max(0, Math.min(1, ratingBucket - index));

        return (
          <span
            key={index}
            className="relative h-2.5 w-7 overflow-hidden rounded-full border border-slate-200 bg-slate-100"
          >
            <span
              className={`absolute inset-y-0 left-0 rounded-full ${input.toneClass}`}
              style={{ width: `${segmentFill * 100}%` }}
            />
          </span>
        );
      })}
    </span>
  );
}

function getRegulatoryLensMappingReason(input: {
  finding: RegulatoryLensFinding;
  lens: Pick<RegulatoryLens, "acronym" | "summary">;
}) {
  const text = `${input.lens.acronym} ${input.lens.summary} ${input.finding.id} ${input.finding.label}`.toLowerCase();
  const findingId = input.finding.id;

  if (
    findingId === "reject_option_missing_or_hidden" ||
    findingId === "asymmetric_consent_ui" ||
    findingId === "consent_dark_patterns_detected" ||
    findingId === "forced_consent_interaction"
  ) {
    return "Shown here because this scan observed consent choice interface signals.";
  }

  if (
    findingId === "pre_consent_tracking_detected" ||
    findingId === "third_party_tracking_pre_consent" ||
    findingId === "analytics_cookie_pre_consent" ||
    findingId === "adtech_cookie_pre_consent" ||
    findingId === "third_party_cookie_pre_consent"
  ) {
    return "Shown here because this scan observed tracking before a recorded consent choice.";
  }

  if (text.includes("pre-consent") || text.includes("pre_consent") || text.includes("consent")) {
    return "Shown here because this scan observed tracking before a recorded consent choice or related consent-control signals.";
  }
  if (text.includes("ccpa") || text.includes("cpra") || text.includes("third-party") || text.includes("sharing") || text.includes("advertising")) {
    return "Shown here because the scan observed third-party advertising or sharing-context signals.";
  }
  if (text.includes("ftc") || text.includes("choice") || text.includes("interface") || text.includes("dark pattern")) {
    return "Shown here because the scan observed consumer-choice or interface-pattern signals.";
  }
  if (text.includes("accessibility") || text.includes("wcag") || text.includes("ada")) {
    return "Shown here because the scan observed automated accessibility barriers or related public-facing accessibility signals.";
  }

  return "Shown here because retained scan evidence maps this finding to the review lens context.";
}

function RegulatoryLensFindingCard(input: {
  finding: RegulatoryLensFinding;
  lens: Pick<RegulatoryLens, "acronym" | "detailTitle" | "ratingLabel" | "score" | "summary">;
}) {
  const hiddenChipCount = Math.max(0, (input.finding.reviewContextChips?.length ?? 0) - 3);
  const applicabilityChipKinds = getRegulatoryLensApplicabilityChipKinds(input.lens.acronym);
  const evidencePayload = JSON.stringify(
    {
      evidence: compactEvidenceJsonForDisplay(input.finding.evidence),
      lens: {
        acronym: input.lens.acronym,
        detailTitle: input.lens.detailTitle,
        ratingLabel: input.lens.ratingLabel,
        score: input.lens.score,
        summary: input.lens.summary
      },
      reason: input.finding.label
    },
    null,
    2
  );

  return (
    <div className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700">
      <details className="group/json">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 space-y-1.5 leading-5">
            <span className="line-clamp-2">{input.finding.label}</span>
            {input.finding.reviewContextLabel ? (
              <span className="block font-semibold text-slate-900">{input.finding.reviewContextLabel}</span>
            ) : null}
            <span className="block text-[11px] leading-4 text-slate-500">{getRegulatoryLensMappingReason(input)}</span>
            {input.finding.reviewContextChips && input.finding.reviewContextChips.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {input.finding.reviewContextChips.slice(0, 3).map((chip) => (
                  <span key={chip} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {chip}
                  </span>
                ))}
                {hiddenChipCount > 0 ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    +{hiddenChipCount} in notes
                  </span>
                ) : null}
              </span>
            ) : null}
            {applicabilityChipKinds.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {applicabilityChipKinds.map((kind) => (
                  <ApplicabilityChip key={kind} kind={kind} />
                ))}
              </span>
            ) : null}
          </span>
          <ScanReportDisclosureIcon className="h-5 w-5 group-open/json:rotate-90" />
        </summary>
        <div className="mt-3 space-y-3">
          {input.finding.reviewContextCopy ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Regulatory review context</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-600">{input.finding.reviewContextCopy}</p>
              {input.finding.guideHref ? (
                <a
                  href={input.finding.guideHref}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-[11px] font-semibold text-sky-700 underline decoration-sky-200 underline-offset-4 hover:text-sky-800"
                >
                  Learn how this finding is interpreted
                </a>
              ) : null}
            </div>
          ) : input.finding.guideHref ? (
            <a
              href={input.finding.guideHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-[11px] font-semibold text-sky-700 underline decoration-sky-200 underline-offset-4 hover:text-sky-800"
            >
              Learn how this finding is interpreted
            </a>
          ) : null}
          <EvidenceJsonBlock payload={evidencePayload} />
        </div>
      </details>
    </div>
  );
}

function getRegulatoryLensApplicabilityChipKinds(acronym: string): PrivacyLawApplicabilityKind[] {
  if (/gdpr|eprivacy/i.test(acronym)) {
    return ["gdpr_eprivacy"];
  }

  if (/ccpa|cpra|cipa/i.test(acronym)) {
    return ["ccpa_cpra", "cipa"];
  }

  return [];
}

function BenchmarkMetricCard(input: {
  actualValue: number | null;
  benchmarkValue: number | null;
  benchmarkIndustry?: string | null;
  label: string;
  maxValue?: number;
  note?: string | null;
}) {
  const isScoreMetric = input.label === "Overall score" || input.label === "GDPR/ePrivacy evidence score" || input.label === "GDPR/ePrivacy posture score";
  const actualValue = typeof input.actualValue === "number" ? input.actualValue : null;
  const benchmarkValue = typeof input.benchmarkValue === "number" ? input.benchmarkValue : null;
  const dynamicScaleBase = Math.max(actualValue ?? 0, benchmarkValue ?? 0, 1);
  const scaleMax =
    input.maxValue ??
    Math.max(10, Math.ceil((dynamicScaleBase * 1.25) / 5) * 5);
  const actualRatio = Math.max(0, Math.min(1, (actualValue ?? 0) / scaleMax));
  const benchmarkRatio = benchmarkValue !== null ? Math.max(0, Math.min(1, benchmarkValue / scaleMax)) : null;
  const delta =
    actualValue !== null && benchmarkValue !== null ? actualValue - benchmarkValue : null;
  const benchmarkContext =
    input.benchmarkIndustry && input.benchmarkIndustry.trim().length > 0
      ? ` for ${input.benchmarkIndustry}`
      : "";
  const deltaLabel =
    delta !== null
      ? isScoreMetric
        ? `${delta > 0 ? "+" : ""}${delta} vs expected${benchmarkContext}`
        : delta > 0
          ? `+${delta} above expected${benchmarkContext}`
          : delta < 0
            ? `${Math.abs(delta)} below expected${benchmarkContext}`
            : `At expected level${benchmarkContext}`
      : null;
  const tone =
    isScoreMetric
      ? {
          card: "bg-white",
          rail: "bg-sky-100/90",
          fill: "bg-sky-500/85",
          marker: "bg-cyan-500 shadow-[0_0_0_3px_rgba(236,254,255,0.95)]",
          value: "text-slate-950",
          deltaPositive: "text-sky-700",
          deltaNegative: "text-cyan-700"
        }
      : input.label === "Third-party requests"
        ? {
            card: "bg-white",
            rail: "bg-amber-100/90",
            fill: "bg-amber-500/85",
            marker: "bg-orange-500 shadow-[0_0_0_3px_rgba(255,247,237,0.95)]",
            value: "text-slate-950",
            deltaPositive: "text-amber-700",
            deltaNegative: "text-orange-700"
          }
        : input.label === "Non-essential storage"
          ? {
              card: "bg-white",
              rail: "bg-rose-100/90",
              fill: "bg-rose-500/85",
              marker: "bg-red-500 shadow-[0_0_0_3px_rgba(254,242,242,0.95)]",
              value: "text-slate-950",
              deltaPositive: "text-rose-700",
              deltaNegative: "text-red-700"
            }
        : {
            card: "bg-white",
            rail: "bg-emerald-100/90",
            fill: "bg-emerald-500/82",
            marker: "bg-lime-500 shadow-[0_0_0_3px_rgba(247,254,231,0.95)]",
            value: "text-slate-950",
            deltaPositive: "text-emerald-700",
            deltaNegative: "text-lime-700"
        };
  const deltaClassName =
    delta === null ? "text-slate-500" : delta > 0 ? tone.deltaPositive : delta < 0 ? tone.deltaNegative : "text-slate-500";
  const benchmarkTooltipBase = deltaLabel
    ? `${deltaLabel}. Expected ${benchmarkValue}.`
    : benchmarkValue !== null
      ? `Expected ${benchmarkValue}.`
      : null;
  const metricNote = input.label === "Non-essential storage"
    ? [
        "Counts non-essential storage found before consent. Essential storage is excluded.",
        input.note
      ].filter(Boolean).join(" ")
    : input.label === "Pre-consent storage"
      ? [
        "Cookie/storage observations before a recorded consent action, deduped by name and domain. This total can include essential security and consent storage; it is not a count of confirmed nonessential trackers.",
        input.note
      ].filter(Boolean).join(" ")
      : input.note;
  const benchmarkTooltip = [benchmarkTooltipBase, metricNote].filter(Boolean).join(" ");
  const isStorageMetric = input.label === "Non-essential storage" || input.label === "Pre-consent storage";
  const displayLabel =
    input.label === "Third-party requests"
      ? "3rd-party requests"
      : input.label;
  const displayValue = actualValue === null && isScoreMetric ? "Not scored" : actualValue ?? "—";
  return (
    <div className={`relative overflow-visible rounded-[1.1rem] border border-slate-200 px-3.5 py-2 ${tone.card}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="whitespace-nowrap text-[9px] uppercase tracking-[0.13em] text-slate-500">
          {displayLabel}
        </p>
      </div>
      <div className="mt-2">
        <div className="flex items-end gap-1.5">
          <span className={`text-[2.15rem] font-semibold leading-none tracking-tight ${actualValue === null && isScoreMetric ? "text-slate-500 text-[1.35rem]" : tone.value}`}>{displayValue}</span>
          {input.maxValue && actualValue !== null ? <span className="pb-0.5 text-[1.35rem] leading-none text-slate-500">/100</span> : null}
          {benchmarkTooltip ? (
            <span className="pb-1">
              {benchmarkValue !== null ? <span className="sr-only">Expected {benchmarkValue}</span> : null}
              <InfoTip align="start" placement="bottom" text={benchmarkTooltip} />
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-3 space-y-1">
        <div className={`relative h-2 rounded-full ${tone.rail}`}>
          <div
            className={`absolute left-0 top-0 h-2 rounded-full ${tone.fill}`}
            style={{ width: `${Math.max(actualRatio * 100, actualValue === null ? 0 : 6)}%` }}
          />
          {benchmarkRatio !== null ? (
            <div
              className={`absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${tone.marker}`}
              style={{ left: `${benchmarkRatio * 100}%` }}
            />
          ) : null}
        </div>
        <div className={`h-1.5 text-[10px] ${deltaClassName}`} aria-hidden="true" />
      </div>
    </div>
  );
}

function ExecutiveMetricCard(input: {
  accent?: "sky" | "amber" | "emerald" | "slate";
  helper?: string | null;
  label: string;
  value: number | string | null;
}) {
  const tone =
    input.accent === "amber"
      ? {
          rail: "bg-amber-100/90",
          fill: "bg-amber-500/85"
        }
      : input.accent === "emerald"
        ? {
            rail: "bg-emerald-100/90",
            fill: "bg-emerald-500/82"
          }
        : input.accent === "slate"
          ? {
              rail: "bg-slate-200/90",
              fill: "bg-slate-500/80"
            }
          : {
              rail: "bg-sky-100/90",
              fill: "bg-sky-500/85"
            };

  const numericValue =
    typeof input.value === "number" && Number.isFinite(input.value)
      ? input.value
      : null;
  const width =
    numericValue === null
      ? 0
      : Math.max(8, Math.min(100, numericValue >= 100 ? 100 : numericValue));

  return (
    <div className="relative overflow-hidden rounded-[1.6rem] border border-slate-200 px-5 py-4 bg-white">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{input.label}</p>
      </div>
      <div className="mt-5">
        <div className="flex items-end gap-1">
          <span className="text-[3.2rem] font-semibold leading-none tracking-tight text-slate-950">{input.value ?? "—"}</span>
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <div className={`relative h-3 rounded-full ${tone.rail}`}>
          <div
            className={`absolute left-0 top-0 h-3 rounded-full ${tone.fill}`}
            style={{ width: `${width}%` }}
          />
        </div>
        <div className="flex items-center text-[11px] text-slate-500">
          <span>{input.helper ?? "\u00A0"}</span>
        </div>
      </div>
    </div>
  );
}

function NotScoredMetricCard(input: {
  helper: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.1rem] border border-slate-200 bg-white px-3.5 py-3">
      <p className="text-[9px] uppercase tracking-[0.13em] text-slate-500">{input.label}</p>
      <p className="mt-2 text-base font-semibold leading-5 text-slate-950">{input.value}</p>
      <p className="mt-1.5 text-[11px] leading-4 text-slate-600">{input.helper}</p>
    </div>
  );
}

function NotScoredHeroMetrics() {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <NotScoredMetricCard
        label="Captured state"
        value="Not representative"
        helper="The retained page was not the normal public site."
      />
      <NotScoredMetricCard
        label="Automated runtime signal"
        value="Unavailable"
        helper="Substantive automated scoring was withheld."
      />
      <NotScoredMetricCard
        label="Report status"
        value="Not scored"
        helper="Re-run when the public site is available."
      />
    </div>
  );
}

function NotScoredSnapshotPane() {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Scan quality snapshot</p>
        <p className="text-sm leading-6 text-slate-600">
          The scan retained evidence explaining why the report was not scored.
        </p>
      </div>
      <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Report status</p>
        <p className="mt-2 text-sm font-semibold text-slate-950">Not scored</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          CertScore.ai did not issue privacy, consent, accessibility, or regulatory scores from this run.
        </p>
      </div>
    </div>
  );
}

function CompactSnapshotPanel(input: { children: React.ReactNode; title: React.ReactNode }) {
  return (
    <div className="rounded-[1.05rem] border border-slate-200 bg-white px-3 py-1.5">
      <p className="mb-1 text-[10px] font-semibold uppercase leading-3 tracking-[0.16em] text-slate-500">{input.title}</p>
      {input.children}
    </div>
  );
}

function CompactChevronRightIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none">
      <path d="m7.5 5 5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function CompactWarningBadgeIcon() {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-700" aria-hidden="true">
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none">
        <path d="M10 3.4 18 16H2L10 3.4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M10 7.2v4.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M10 14.2h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
      </svg>
    </span>
  );
}

function CompactSnapshotSurfaceRow(input: { detail?: string | null; label: string }) {
  if (input.detail) {
    return (
      <details className="group/snapshot-surface rounded-xl border border-slate-200 bg-slate-50/80 px-2.5 py-1">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 truncate text-sm font-medium text-slate-700">{input.label}</span>
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition group-open/snapshot-surface:rotate-90">
            <CompactChevronRightIcon />
          </span>
        </summary>
        <p
          className="mt-1 overflow-hidden break-words text-xs leading-5 text-slate-500"
          style={{
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 3,
            display: "-webkit-box",
          }}
        >
          {input.detail}
        </p>
      </details>
    );
  }

  return (
    <div className="mb-1.5 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-2.5 py-1 text-xs font-medium text-slate-700 last:mb-0">
      <span>{input.label}</span>
    </div>
  );
}

function getCompactConsentControlPresentation(state: boolean | null) {
  if (state === true) {
    return {
      glyph: "✓",
      label: "Observed",
      glyphTone: "border-emerald-200/90 bg-white/80 text-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(5,150,105,0.16)]",
      tone: "border-emerald-200 bg-gradient-to-b from-emerald-50 to-emerald-100/75 text-emerald-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_4px_rgba(5,150,105,0.14)]",
    };
  }
  if (state === false) {
    return {
      glyph: "—",
      label: "Not observed",
      glyphTone: "border-slate-200/90 bg-white/80 text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.12)]",
      tone: "border-slate-200 bg-gradient-to-b from-white to-slate-100 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_4px_rgba(15,23,42,0.1)]",
    };
  }
  return {
    glyph: "?",
    label: "Unknown",
    glyphTone: "border-amber-200/90 bg-white/80 text-amber-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(217,119,6,0.14)]",
    tone: "border-amber-200 bg-gradient-to-b from-amber-50 to-amber-100/70 text-amber-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_4px_rgba(217,119,6,0.12)]",
  };
}

function CompactConsentControlState(input: {
  label: "Accept" | "Reject" | "Options";
  state: boolean | null;
}) {
  const presentation = getCompactConsentControlPresentation(input.state);
  return (
    <div
      aria-label={`${input.label} control: ${presentation.label}`}
      className={`flex h-[22px] min-w-0 items-center justify-center gap-0.5 rounded-[0.6rem] border px-1 ${presentation.tone}`}
      data-consent-control-state={input.state === true ? "observed" : input.state === false ? "not_observed" : "unknown"}
      title={`${input.label}: ${presentation.label}`}
    >
      <span
        aria-hidden="true"
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold leading-none ${presentation.glyphTone}`}
      >
        {presentation.glyph}
      </span>
      <span className="shrink-0 whitespace-nowrap text-[9px] font-semibold leading-none">{input.label}</span>
    </div>
  );
}

export function CompactConsentControlsCard(input: {
  projection?: ExecutiveConsentControlProjection | null;
}) {
  return (
    <div className="rounded-[1rem] border border-slate-200 bg-gradient-to-b from-white to-slate-50/90 px-3 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_7px_rgba(15,23,42,0.06)]">
      <p className="mb-0.5 text-[10px] font-semibold uppercase leading-[10px] tracking-[0.16em] text-slate-500">
        Consent controls
      </p>
      <div
        aria-label="Accept, Reject, and Options control detection"
        className="grid grid-cols-3 gap-1.5"
        data-testid="executive-consent-controls-card"
      >
        <CompactConsentControlState label="Accept" state={input.projection?.accept ?? null} />
        <CompactConsentControlState label="Reject" state={input.projection?.reject ?? null} />
        <CompactConsentControlState label="Options" state={input.projection?.options ?? null} />
      </div>
    </div>
  );
}

function ExecutiveSignalSnapshotPane(input: {
  beforeConsentCookieCount: number;
  cmpDisplayName: string;
  cmpStatusAvailable: boolean;
  cmpVendorName?: string | null;
  consentControls?: ExecutiveConsentControlProjection | null;
  consentSurfaceStatus?: string | null;
  domainTruncationNote?: string | null;
  policySurfaceLabelsByUrl: Map<string, string[]>;
  policySurfaces: ExecutivePolicySurface[];
  recognizedCmpLabel?: string | null;
  trackerFootprintDetailLabel?: string | null;
  trackerFootprintTitle?: string | null;
  trackerFootprintRichDetails: Array<{ key: string; node: React.ReactNode }>;
  trackerFootprintTipText?: string | null;
  runtimeMetricsReliable?: boolean;
  scanProof?: ExecutiveScanProof | null;
  scanProofDurationMs?: number | null;
  coverageLimitation?: string | null;
  requestedHost?: string | null;
}) {
  const runtimeMetricsReliable = input.runtimeMetricsReliable !== false;
  const trackerDetailLabel = runtimeMetricsReliable
    ? input.trackerFootprintDetailLabel ?? "0 vendors, 0 domains"
    : "Runtime not retained";
  const cookieOnlyRuntimeNote =
    runtimeMetricsReliable && input.trackerFootprintRichDetails.length === 0 && input.beforeConsentCookieCount > 0
      ? `${input.beforeConsentCookieCount} ${input.beforeConsentCookieCount === 1 ? "cookie was" : "cookies were"} observed before consent; no third-party tracker vendor or domain was resolved for this scan.`
      : null;
  const consentSurfaceStatus = input.consentSurfaceStatus ?? "Not determined";
  const cmpDetectedLabel = input.cmpVendorName
    ? `${input.cmpDisplayName.replace(/\s+(?:banner|cmp)$/i, "")} CMP detected`
    : null;
  const consentSurfaceLabel =
    consentSurfaceStatus === "Observed"
      ? (input.cmpVendorName ? input.cmpDisplayName : "Unknown CMP / consent banner")
      : consentSurfaceStatus === "Not observed"
        ? (cmpDetectedLabel ?? "No consent banner observed")
        : input.cmpVendorName
          ? cmpDetectedLabel
          : "Consent banner not determined";
  const consentSurfaceNote =
    input.cmpVendorName && consentSurfaceStatus === "Not observed"
      ? `${input.cmpDisplayName} technology was observed, but no visible consent banner was retained in this scan context.`
      : input.cmpVendorName && (consentSurfaceStatus === "Not determined" || consentSurfaceStatus === "Not testable")
        ? `${input.cmpDisplayName} CMP technology was observed, but visible banner presence could not be determined because consent inspection was incomplete or not representative.`
        : consentSurfaceStatus === "Not determined" || consentSurfaceStatus === "Not testable"
          ? "Consent inspection was incomplete or not representative; banner presence was not determined."
          : null;
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Signal snapshot</p>
        {input.scanProof ? <ScanProofPanel coverageLimitation={input.coverageLimitation} durationMs={input.scanProofDurationMs} proof={input.scanProof} requestedHost={input.requestedHost ?? null} /> : null}
      </div>
      <CompactSnapshotPanel title="Consent platform">
        <div className="flex items-center gap-2">
          {runtimeMetricsReliable && input.cmpStatusAvailable ? (
            <VendorBrandChip
              category="cmp"
              className="h-5 w-5 rounded-full p-0"
              hideLabel
              label={input.recognizedCmpLabel ?? input.cmpVendorName ?? "Unknown CMP"}
              showMeta={false}
            />
          ) : (
            <CompactWarningBadgeIcon />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-slate-950">
                {runtimeMetricsReliable ? consentSurfaceLabel : "Consent platform not testable"}
              </p>
              {consentSurfaceNote ? <InfoTip align="start" placement="bottom" text={consentSurfaceNote} /> : null}
            </div>
          </div>
        </div>
      </CompactSnapshotPanel>
      <CompactSnapshotPanel title={input.trackerFootprintTitle ?? "Tracker footprint"}>
        <details className="group/tracker-footprint">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 marker:hidden [&::-webkit-details-marker]:hidden">
            <span className="inline-flex min-w-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase leading-4 tracking-[0.16em] text-slate-500">
              <span className="truncate">{trackerDetailLabel}</span>
            </span>
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition group-open/tracker-footprint:rotate-90">
              <CompactChevronRightIcon />
            </span>
          </summary>
          <div className="mt-3 max-h-[13.25rem] space-y-1.5 overflow-y-auto pr-1">
            {!runtimeMetricsReliable ? (
              <p className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-5 text-slate-600">
                Pre-consent runtime collection failed before reliable tracker, request, cookie, or consent-platform observations were retained.
              </p>
            ) : null}
            {input.trackerFootprintTipText ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                {input.trackerFootprintTipText}
              </p>
            ) : null}
            {cookieOnlyRuntimeNote ? (
              <p className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-5 text-slate-600">
                {cookieOnlyRuntimeNote}
              </p>
            ) : null}
            {input.domainTruncationNote ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                {input.domainTruncationNote}
              </p>
            ) : null}
            {runtimeMetricsReliable && input.trackerFootprintRichDetails.length > 0 ? (
              input.trackerFootprintRichDetails.map((item) => <React.Fragment key={item.key}>{item.node}</React.Fragment>)
            ) : runtimeMetricsReliable ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                No third-party tracker vendors or domains were resolved in this scan.
              </p>
            ) : null}
          </div>
        </details>
      </CompactSnapshotPanel>
      <CompactSnapshotPanel title="Policy surfaces">
        <div className="space-y-1.5">
          {input.policySurfaces.length > 0 ? (
            input.policySurfaces.map((surface) => {
              const sharedLabels = surface.pageUrl ? input.policySurfaceLabelsByUrl.get(surface.pageUrl) ?? [] : [];
              const detailParts = [
                surface.pageUrl,
                surface.pageUrl && sharedLabels.length > 1
                  ? `This URL is shared by ${formatInlineList(sharedLabels)}.`
                  : null,
                ...surface.details
              ].filter(Boolean);
              return (
                <CompactSnapshotSurfaceRow
                  detail={detailParts.join(" ")}
                  key={`${surface.pageLabel}:${surface.pageUrl ?? "unknown"}`}
                  label={surface.pageLabel}
                />
              );
            })
          ) : (
            <CompactSnapshotSurfaceRow
              detail="No policy-surface observations were retained for this scan."
              label="Policy surface detail unavailable"
            />
          )}
        </div>
      </CompactSnapshotPanel>
      <CompactConsentControlsCard projection={input.consentControls} />
    </>
  );
}

function formatTimelineOffset(ms: number) {
  const safeMs = Math.max(0, Math.round(ms));
  if (safeMs < 1000) {
    return `${safeMs}ms`;
  }
  const seconds = safeMs / 1000;
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
}

function getTimelineToneClasses(tone: ExecutiveTimelineEvent["tone"] = "slate") {
  switch (tone) {
    case "amber":
      return "border-amber-200 bg-amber-50/82 text-amber-950";
    case "emerald":
      return "border-emerald-200 bg-emerald-50/82 text-emerald-950";
    case "rose":
      return "border-rose-200 bg-rose-50/82 text-rose-950";
    case "sky":
      return "border-sky-200 bg-sky-50/82 text-sky-950";
    default:
      return "border-slate-200 bg-white text-slate-800";
  }
}

function getTimelineTimeBadgeClasses(tone: ExecutiveTimelineEvent["tone"] = "slate") {
  switch (tone) {
    case "amber":
      return "border-amber-200 bg-amber-100 text-amber-800";
    case "emerald":
      return "border-emerald-200 bg-emerald-100 text-emerald-800";
    case "rose":
      return "border-rose-200 bg-rose-100 text-rose-800";
    case "sky":
      return "border-sky-200 bg-sky-100 text-sky-800";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function formatTimelineSecondBadge(ms: number) {
  const seconds = Math.max(0, ms) / 1000;
  return `${seconds < 1 ? seconds.toFixed(2) : seconds.toFixed(1)}s`;
}

function getTimelineShortLabel(label: string) {
  return label
    .replace(/^(third[- ]party|pre[- ]consent)\s+/i, "")
    .replace(/advertising vendor/i, "Ad vendor")
    .replace(/performance monitoring/i, "Performance")
    .replace(/cookies? and storage/i, "Cookies")
    .replace(/requests?/i, "request")
    .trim();
}

function buildPositionedTimelineEvents(input: { durationMs: number; events: ExecutiveTimelineEvent[] }) {
  const sorted = input.events
    .filter((event) => Number.isFinite(event.atMs) && event.atMs >= 0)
    .sort((left, right) => left.atMs - right.atMs)
    .slice(0, 6);
  const firstEventTop = 17;
  const lastEventTop = 68;
  const minGap = sorted.length > 1
    ? Math.min(12, Math.max(7, (lastEventTop - firstEventTop) / (sorted.length - 1)))
    : 0;
  let lastTop = 0;
  return sorted.map((event, index) => {
    const rawTop = input.durationMs > 0 ? (event.atMs / input.durationMs) * 100 : 50;
    const minTop = index === 0 ? firstEventTop : lastTop + minGap;
    const maxTop = Math.max(minTop, lastEventTop - Math.max(0, sorted.length - index - 1) * minGap);
    const top = Math.min(Math.max(rawTop, minTop), maxTop);
    lastTop = top;
    return { ...event, top };
  });
}

function ExecutiveTimelinePane(input: {
  durationMs?: number | null;
  events?: ExecutiveTimelineEvent[] | null;
}) {
  const events = input.events ?? [];
  const maxEventMs = events.reduce((max, event) => Math.max(max, event.atMs), 0);
  const durationMs = Math.max(0, Math.round(input.durationMs ?? maxEventMs));
  const positionedEvents = buildPositionedTimelineEvents({
    durationMs: Math.max(1, durationMs),
    events
  });
  const hiddenEventCount = Math.max(0, events.filter((event) => Number.isFinite(event.atMs) && event.atMs >= 0).length - positionedEvents.length);

  return (
    <div className="flex min-w-0 flex-col rounded-[1.7rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(241,245,249,0.72))] p-3 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.22)]" data-executive-timeline-pane>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Scan Timeline</p>
      <div className="relative mt-3 min-h-[17rem] flex-1 overflow-hidden rounded-[1.05rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(254,242,242,0.45)_0%,rgba(255,255,255,0.95)_58%,rgba(240,253,244,0.55)_86%,#f8fafc_100%)] px-3 py-3 shadow-inner shadow-slate-100/70">
        <div className="absolute bottom-5 left-[1.15rem] top-5 w-px bg-gradient-to-b from-slate-200 via-slate-300 to-slate-200" aria-hidden="true" />
        <div className="absolute left-2 right-3 top-3 flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-slate-300 bg-white shadow-sm" aria-hidden="true" />
          <span className="min-w-0 flex-1 rounded-lg border-2 border-slate-200 bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-700 shadow-sm">
            Scan start @ 0s
          </span>
        </div>
        {positionedEvents.map((event) => (
          <div
            className="absolute left-2 right-3 flex items-center gap-2"
            key={`${event.label}:${event.atMs}`}
            title={`${event.label} first observed at ${formatTimelineOffset(event.atMs)}`}
            style={{ top: `${event.top}%` }}
          >
            <span className={`inline-flex h-5 min-w-9 shrink-0 items-center justify-center rounded-full border px-1 font-mono text-[9px] font-bold tracking-[-0.04em] ${getTimelineTimeBadgeClasses(event.tone)}`} aria-label={`First observed at ${formatTimelineOffset(event.atMs)}`}>
              {formatTimelineSecondBadge(event.atMs)}
            </span>
            <span className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-semibold uppercase leading-4 tracking-[0.08em] shadow-sm ${getTimelineToneClasses(event.tone)}`}>
              {event.vendorLabel ? (
                <VendorBrandChip className="h-5 w-5 rounded-full p-0" hideLabel label={event.vendorLabel} showMeta={false} />
              ) : (
                <TimelineCategoryIcon label={event.label} />
              )}
              <span className="min-w-0 truncate">{getTimelineShortLabel(event.label)}</span>
            </span>
          </div>
        ))}
        {hiddenEventCount > 0 ? <span className="absolute bottom-10 right-3 rounded-full border border-slate-200 bg-white/90 px-2 py-0.5 text-[9px] font-semibold text-slate-500">+{hiddenEventCount} more</span> : null}
        <div className="absolute bottom-3 left-2 right-3 flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-slate-700 bg-white shadow-sm" aria-hidden="true" />
          <span className="min-w-0 flex-1 rounded-lg border-2 border-[#0f8bd7] bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-950 shadow-sm">
            End @ {formatTimelineOffset(durationMs)}
          </span>
        </div>
      </div>
    </div>
  );
}

function TimelineCategoryIcon({ label }: { label: string }) {
  const normalized = label.toLowerCase();
  const path = normalized.includes("cookie")
    ? <><circle cx="12" cy="12" r="7" /><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" /><circle cx="14" cy="14" r="1" fill="currentColor" stroke="none" /></>
    : normalized.includes("analytics")
      ? <><path d="M5 17V11M10 17V7M15 17V4M19 17H4" /></>
      : normalized.includes("ad vendor")
        ? <><path d="M5 10h3l7-4v12l-7-4H5z" /><path d="M8 14l1 4" /></>
        : normalized.includes("embedded")
          ? <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="m10 9 5 3-5 3z" /></>
          : normalized.includes("consent")
            ? <><path d="M12 3.5 18 6v5c0 4-2.2 7-6 8.5C8.2 18 6 15 6 11V6z" /><path d="m9.5 11.5 1.6 1.6 3.5-3.5" /></>
            : <><circle cx="7" cy="12" r="2.5" /><circle cx="17" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /><path d="m9.2 10.8 5.5-2.7M9.2 13.2l5.5 2.7" /></>;

  return <span aria-hidden="true" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current/15 bg-white/80"><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">{path}</svg></span>;
}

function getFindingReferenceLink(finding: CertScoreFinding) {
  if (finding.id === "third_party_tracking_pre_consent") {
    return {
      href: "https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/",
      label: "ICO guidance on cookies and similar technologies"
    };
  }

  if (finding.id === "session_recording_services_detected") {
    if (/microsoft clarity/i.test(finding.shortSummary)) {
      return {
        href: "https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-masking",
        label: "Microsoft Clarity data masking guidance"
      };
    }

    return {
      href: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/online-tracking/guidance-for-consumer-internet-of-things-products-and-services/how-do-we-ensure-our-use-of-online-tracking-is-fair/",
      label: "ICO fairness guidance for online tracking"
    };
  }

  return null;
}

function getFindingFixText(finding: CertScoreFinding) {
  const display = getPublicReportFindingDisplayForCertFinding(finding);
  if (display.remediation) {
    return display.remediation;
  }

  if (finding.id === "third_party_tracking_pre_consent") {
    return "Move non-essential analytics, adtech, and session-replay tags behind a consent gate. Load them only after an explicit accept signal and verify that the default page path produces zero third-party tracking requests before consent.";
  }

  if (finding.id === "session_recording_services_detected") {
    return "Either remove session replay from the public path or gate it behind consent. If it remains, enable masking for form fields, auth flows, and user-generated content, and add a plain-language disclosure naming the replay vendor and purpose.";
  }

  if (finding.id === "asymmetric_consent_ui") {
    return "Bring reject and settings up to the first layer, match the visual weight of accept, and avoid button color, size, or placement patterns that make one choice materially easier than another. Re-test the live banner after the CSS change, not just the design mock.";
  }

  return finding.remediation;
}

type EvidenceBasisStatus = "Strong" | "Partial" | "Available" | "Not applicable" | "Not evaluated" | string;

function getEvidenceBasisTone(status: EvidenceBasisStatus) {
  switch (status) {
    case "Strong":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "Available":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "Not applicable":
      return "border-slate-200 bg-slate-50 text-slate-600";
    case "Partial":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "Not evaluated":
      return "border-slate-200 bg-slate-50 text-slate-600";
    default:
      return "border-slate-200 bg-white text-slate-700";
  }
}

function hasRecords(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.some((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
}

function hasStringValues(value: unknown): value is string[] {
  return Array.isArray(value) && value.some((entry) => typeof entry === "string" && entry.trim().length > 0);
}

const ACCESSIBILITY_FINDING_IDS = new Set([
  "semantic_labeling_accessibility_issue",
  "visual_contrast_accessibility_issue",
  "keyboard_navigation_accessibility_issue",
  "text_alternative_accessibility_issue"
]);

function formatEvidenceCount(value: unknown, fallback = "Not retained") {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : fallback;
}

function formatPageCoverage(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "Partial";
  }
  return `${value} page${value === 1 ? "" : "s"}`;
}

function getAccessibilityImpact(finding: CertScoreFinding) {
  const details = finding.evidenceDetails;
  const impact =
    details?.accessibilityEvidence?.impact ??
    details?.accessibilityEvidence?.axeImpact ??
    details?.accessibilityEvidence?.severity ??
    (Array.isArray(details?.accessibilityEvidence?.impacts) ? details.accessibilityEvidence.impacts[0] : null);
  return typeof impact === "string" && impact.trim().length > 0
    ? impact.trim().replace(/^\w/, (letter) => letter.toUpperCase())
    : finding.severity.replace(/^\w/, (letter) => letter.toUpperCase());
}

function buildEvidenceBasisItems(finding: CertScoreFinding): Array<{ label: string; status: EvidenceBasisStatus }> {
  const details = finding.evidenceDetails;
  if (!details) {
    return [];
  }

  const representativeRequests = details.representativeRequests ?? [];
  const runtimeRequestUrls = details.runtimeRequestUrls ?? [];
  const vendors = details.vendors ?? [];
  const runtimeVendors = details.runtimeVendors ?? [];
  const timing = details.timing;
  const consentState = details.consentState;
  const timingAnalysis = details.timingAnalysis;
  const policyEvidence = details.policyEvidence;
  const preConsentCookieCount =
    typeof details.counts?.preConsentTrackingCookies === "number" ? details.counts.preConsentTrackingCookies : 0;

  if (ACCESSIBILITY_FINDING_IDS.has(finding.id)) {
    const axeRule =
      details.accessibilityEvidence?.wcagRule ??
      details.accessibilityEvidence?.axeRuleId ??
      details.accessibilityEvidence?.ruleCode ??
      (Array.isArray(details.accessibilityEvidence?.ruleCodes) ? details.accessibilityEvidence.ruleCodes[0] : null);
    const affectedNodes =
      details.accessibilityEvidence?.affectedNodes ??
      details.accessibilityEvidence?.nodeCount ??
      details.accessibilityEvidence?.issueCount ??
      details.counts?.representativeAxeExampleCount ??
      details.counts?.wcagErrorCountTotal;
    const pageCoverage =
      details.accessibilityEvidence?.pageCoverage ??
      details.accessibilityEvidence?.pageCount ??
      details.counts?.representativeAxePageCount ??
      (Array.isArray(details.pageUrls) ? details.pageUrls.length : null);

    return [
      { label: "Axe rule retained", status: typeof axeRule === "string" && axeRule.trim().length > 0 ? "Strong" : "Partial" },
      { label: "Affected nodes", status: formatEvidenceCount(affectedNodes, "Partial") },
      { label: "Page coverage", status: formatPageCoverage(pageCoverage) },
      { label: "Impact/severity", status: getAccessibilityImpact(finding) },
      { label: "Manual verification", status: "Recommended" }
    ];
  }

  const runtimeRequests: EvidenceBasisStatus =
    representativeRequests.length > 0 || runtimeRequestUrls.length > 0
      ? "Strong"
      : hasStringValues(finding.evidenceRefs) || hasStringValues(details.sourceUrls)
        ? "Partial"
        : "Partial";
  const vendorAttribution: EvidenceBasisStatus =
    vendors.some((vendor) => vendor.name && (vendor.category || vendor.representativeUrl))
      ? "Strong"
      : vendors.length > 0 || runtimeVendors.length > 0
        ? "Partial"
        : "Partial";
  const cookieTiming: EvidenceBasisStatus =
    (typeof timing?.firstTrackingCookieSeenMs === "number" && timing.firstTrackingCookieSeenMs >= 0) ||
    hasRecords(details.rtbCookieSyncEvidence) ||
    preConsentCookieCount > 0
      ? "Strong"
      : details.cookieEvidence
        ? "Partial"
        : "Partial";
  const consentBasis: EvidenceBasisStatus =
    consentState?.trackingOccurredBeforeConsentChoice === true && timingAnalysis?.trackingBeforeConsentWindow === true
      ? "Strong"
      : consentState || timingAnalysis
        ? "Partial"
        : "Partial";
  const policyContext: EvidenceBasisStatus =
    policyEvidence?.evaluated === true || details.policyRuntimeConflict || details.policyEvidenceDetails
      ? "Available"
      : "Not evaluated";

  if (
    finding.id === "consent_dark_patterns_detected" ||
    finding.id === "reject_option_missing_or_hidden" ||
    finding.id === "asymmetric_consent_ui" ||
    finding.id === "consent_preference_reopen_control_not_observed"
  ) {
    const consentUiEvidence = details.consentUiEvidence;
    const lifecycleReview =
      consentUiEvidence?.lifecycleReview && typeof consentUiEvidence.lifecycleReview === "object"
        ? (consentUiEvidence.lifecycleReview as Record<string, unknown>)
        : null;
    if (finding.id === "consent_preference_reopen_control_not_observed") {
      return [
        {
          label: "Consent or tracking context",
          status: consentUiEvidence?.observed === true ? "Available" : "Partial"
        },
        {
          label: "Reopen-control search",
          status: lifecycleReview?.coverageStatus === "usable" ? "Strong" : lifecycleReview ? "Partial" : "Not evaluated"
        },
        {
          label: "Observed reopen control",
          status: lifecycleReview?.subtype === "privacy_settings_control_observed" ? "Available" : "Not observed"
        },
        { label: "Runtime request evidence", status: "Not applicable" },
        { label: "Cookie timing", status: "Not applicable" },
        { label: "Policy context", status: policyContext }
      ];
    }
    const decisionStates = Array.isArray(consentUiEvidence?.consentSurfaceDecisionStates)
      ? consentUiEvidence.consentSurfaceDecisionStates
      : [];
    const rejectSubtype = typeof consentUiEvidence?.rejectOptionSubtype === "string"
      ? consentUiEvidence.rejectOptionSubtype
      : null;
    return [
      {
        label: "Consent surface observed",
        status: decisionStates.includes("consent_surface_observed") || consentUiEvidence?.observed === true ? "Strong" : "Partial"
      },
      {
        label: "Reject path visibility",
        status:
          decisionStates.includes("reject_absent_first_layer") ||
          decisionStates.includes("reject_present_first_layer") ||
          Boolean(rejectSubtype)
            ? "Strong"
            : "Partial"
      },
      {
        label: "Button symmetry",
        status: consentUiEvidence?.observed === true ? "Strong" : "Partial"
      },
      { label: "Runtime request evidence", status: "Not applicable" },
      { label: "Cookie timing", status: "Not applicable" },
      { label: "Policy context", status: policyContext }
    ];
  }

  return [
    { label: "Runtime requests", status: runtimeRequests },
    { label: "Vendor attribution", status: vendorAttribution },
    { label: "Cookie timing", status: cookieTiming },
    { label: "Consent state", status: consentBasis },
    { label: "Policy context", status: policyContext }
  ];
}

function getFindingCardTone(
  finding: CertScoreFinding,
  isFirst: boolean,
  criticalityBadge: FindingCriticalityBadge = finding.severity
) {
  if (criticalityBadge === "critical" || isFirst) {
    return {
      card: "border-slate-200 bg-[linear-gradient(180deg,rgba(252,252,252,0.94),rgba(255,255,255,1))]",
      band: "bg-rose-200",
      severityBadge: "border-rose-200 bg-rose-50 text-rose-800",
      summary: "border-slate-200 bg-white text-slate-900"
    };
  }

  if (criticalityBadge === "high") {
    return {
      card: "border-slate-200 bg-[linear-gradient(180deg,rgba(252,252,251,0.82),rgba(255,255,255,1))]",
      band: "bg-slate-200",
      severityBadge: "border-slate-200 bg-slate-50 text-slate-800",
      summary: "border-slate-200 bg-slate-50/65 text-slate-900"
    };
  }

  return {
    card: "border-slate-200 bg-white",
    band: "bg-slate-200",
    severityBadge: "border-slate-200 bg-slate-50 text-slate-700",
    summary: "border-slate-200 bg-slate-50/85 text-slate-800"
  };
}

type FindingTitleIconKey =
  | "pulse-tracking"
  | "arrow-transfer"
  | "video-capture"
  | "shield-video"
  | "shield-network"
  | "shield-balance"
  | "circle-x"
  | "chain-link"
  | "globe-link"
  | "device-telemetry"
  | "cookie-storage"
  | "fingerprint"
  | "browser-fingerprint"
  | "up-arrow"
  | "accessibility-figure"
  | "keyboard-key"
  | "contrast-circle"
  | "label-tag"
  | "image-alt"
  | "focus-target"
  | "warning-triangle"
  | "privacy-choice"
  | "settings-gear"
  | "hidden-choice"
  | "split-choice"
  | "hand-stop"
  | "policy-sync"
  | "document-clarity"
  | "ad-exchange"
  | "analytics-chart"
  | "default-circle";

function getRegulatoryGapRowId(findingId: string) {
  const marker = "__";
  if (!findingId.startsWith("regulatory_gap__")) {
    return null;
  }
  const markerIndex = findingId.indexOf(marker, "regulatory_gap__".length);
  return markerIndex >= 0 ? findingId.slice(markerIndex + marker.length) : null;
}

type RegulatoryTopFindingConcernKind = "partial_rating" | "potential_concern" | "potential_gap" | "review_signal";

function getRegulatoryTopFindingConcernKind(finding: CertScoreFinding): RegulatoryTopFindingConcernKind | null {
  if (!finding.id.startsWith("regulatory_gap__")) {
    return null;
  }
  const details = finding.evidenceDetails?.policyEvidenceDetails;
  const kind = typeof details?.regulatoryConcernKind === "string" ? details.regulatoryConcernKind : null;
  return kind === "partial_rating" || kind === "potential_gap" || kind === "potential_concern" || kind === "review_signal" ? kind : null;
}

function hasOnlyReviewTopFindings(findings: CertScoreFinding[]) {
  return findings.length > 0 &&
    findings.every((finding) => getRegulatoryTopFindingConcernKind(finding) === "review_signal");
}

function getPreferredFindingTitleIconKeys(findingId: string): FindingTitleIconKey[] {
  const regulatoryGapRowId = getRegulatoryGapRowId(findingId);
  if (regulatoryGapRowId) {
    switch (regulatoryGapRowId) {
      case "pre_consent_third_party_tracking":
        return ["arrow-transfer", "pulse-tracking", "ad-exchange"];
      case "pre_consent_cookies_storage":
        return ["cookie-storage", "ad-exchange", "pulse-tracking"];
      case "reject_all_path_availability":
        return ["hidden-choice", "privacy-choice", "circle-x"];
      case "accept_consent_control":
        return ["privacy-choice", "split-choice", "cookie-storage"];
      case "cookie_notice_policy_availability":
        return ["document-clarity", "cookie-storage", "policy-sync"];
      case "advertising_retargeting_vendor_signal_observed":
        return ["ad-exchange", "arrow-transfer", "pulse-tracking"];
      case "retargeting_behavioral_advertising_signal_observed":
        return ["arrow-transfer", "pulse-tracking", "ad-exchange"];
      case "analytics_vendor_observed":
        return ["analytics-chart", "pulse-tracking", "device-telemetry"];
      case "session_replay_fingerprinting_review":
        return ["video-capture", "shield-video", "device-telemetry"];
      case "device_identification_fingerprinting_signal_observed":
        return ["browser-fingerprint", "fingerprint", "device-telemetry"];
      case "embedded_content_pre_consent":
        return ["globe-link", "chain-link", "arrow-transfer"];
      case "sale_share_control":
      case "do_not_sell_share_availability":
        return ["privacy-choice", "ad-exchange", "shield-balance"];
      default:
        return ["document-clarity", "warning-triangle", "default-circle"];
    }
  }

  switch (findingId) {
    case "pre_consent_tracking_detected":
      return ["pulse-tracking", "arrow-transfer", "ad-exchange"];
    case "reject_tracking_persists_after_reject":
      return ["pulse-tracking", "circle-x", "arrow-transfer"];
    case "third_party_tracking_pre_consent":
      return ["arrow-transfer", "pulse-tracking", "ad-exchange"];
    case "rtb_cookie_sync_observed":
      return ["ad-exchange", "arrow-transfer", "chain-link"];
    case "cross_domain_identifier_sharing_observed":
      return ["globe-link", "chain-link", "arrow-transfer"];
    case "session_recording_services_detected":
      return ["video-capture", "shield-video"];
    case "session_replay_present_with_sensitive_surfaces_observed":
      return ["shield-video", "video-capture", "device-telemetry"];
    case "possible_session_replay_on_sensitive_input_surface":
      return ["shield-video", "video-capture", "device-telemetry"];
    case "sensitive_data_collection_with_third_party_tracking_present":
      return ["shield-network", "shield-video", "device-telemetry"];
    case "consent_dark_patterns_detected":
      return ["shield-balance", "circle-x"];
    case "consent_preference_reopen_control_not_observed":
      return ["settings-gear", "privacy-choice", "document-clarity"];
    case "asymmetric_consent_ui":
      return ["split-choice", "privacy-choice", "shield-balance"];
    case "reject_option_missing_or_hidden":
      return ["hidden-choice", "circle-x", "shield-balance"];
    case "forced_consent_interaction":
      return ["hand-stop", "warning-triangle", "circle-x"];
    case "identifier_transmission_detected":
      return ["chain-link", "arrow-transfer"];
    case "device_data_collection_detected":
      return ["device-telemetry", "fingerprint"];
    case "telemetry_rich_identification_observed":
      return ["device-telemetry", "chain-link"];
    case "analytics_cookie_pre_consent":
      return ["cookie-storage", "pulse-tracking"];
    case "adtech_cookie_pre_consent":
      return ["cookie-storage", "ad-exchange"];
    case "third_party_cookie_pre_consent":
      return ["cookie-storage", "arrow-transfer"];
    case "long_lived_cookie_retention_review":
      return ["up-arrow", "cookie-storage", "warning-triangle"];
    case "cookie_disclosure_gap":
      return ["document-clarity", "policy-sync", "cookie-storage"];
    case "probable_fingerprinting":
      return ["fingerprint", "device-telemetry"];
    case "fingerprinting_related_signals_observed":
      return ["browser-fingerprint", "device-telemetry", "fingerprint"];
    case "accessibility_risk_score":
      return ["accessibility-figure", "warning-triangle"];
    case "keyboard_navigation_accessibility_issue":
      return ["keyboard-key", "accessibility-figure", "warning-triangle"];
    case "visual_contrast_accessibility_issue":
      return ["contrast-circle", "accessibility-figure", "warning-triangle"];
    case "semantic_labeling_accessibility_issue":
      return ["label-tag", "accessibility-figure", "warning-triangle"];
    case "text_alternative_accessibility_issue":
      return ["image-alt", "accessibility-figure", "contrast-circle"];
    case "focus_management_issue":
      return ["focus-target", "keyboard-key", "warning-triangle"];
    case "policy_behavior_contradiction_detected":
      return ["policy-sync", "shield-balance", "chain-link"];
    case "scan_quality_visual_no_go":
      return ["warning-triangle", "default-circle"];
    case "policy_clarity_risk":
      return ["document-clarity", "policy-sync", "chain-link"];
    case "access_limited_no_reliable_findings":
      return ["warning-triangle", "default-circle"];
    default:
      return ["default-circle"];
  }
}

function getFindingTitleIconKey(findingId: string): FindingTitleIconKey {
  return getPreferredFindingTitleIconKeys(findingId)[0] ?? "default-circle";
}

function assignUniqueFindingTitleIconKeys(findings: CertScoreFinding[]) {
  const used = new Set<FindingTitleIconKey>();
  return new Map(
    findings.map((finding) => {
      const preferredKeys = getPreferredFindingTitleIconKeys(finding.id);
      const selectedKey =
        preferredKeys.find((iconKey) => !used.has(iconKey)) ??
        (used.has("default-circle") ? preferredKeys[0] : "default-circle") ??
        "default-circle";
      used.add(selectedKey);
      return [finding.id, selectedKey] as const;
    })
  );
}

function RegulatoryTopFindingConcernIcon({ kind }: { kind: RegulatoryTopFindingConcernKind }) {
  const label = kind === "potential_gap"
    ? "Potential gap"
    : kind === "partial_rating"
      ? "Partial rating"
      : kind === "review_signal"
        ? "Review"
        : "Potential concern";
  const toneClass = kind === "potential_gap"
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <span
      aria-label={label}
      className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${toneClass}`}
      title={label}
    >
      {kind === "potential_gap" ? (
        <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 20 20">
          <path d="M10 4.2 17 16H3L10 4.2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M10 8.2v3.8M10 14.8h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        </svg>
      ) : kind === "review_signal" || kind === "partial_rating" ? (
        <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 20 20">
          <path d="M6 4.5v11" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <path d="M6 5.2h8l-1.7 3L14 11.2H6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      ) : (
        <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="6.8" stroke="currentColor" strokeWidth="1.8" />
          <path d="M10 6.8v4.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
          <path d="M10 14.2h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
        </svg>
      )}
    </span>
  );
}

function FindingTitleIcon(input: { finding: CertScoreFinding; iconKey?: FindingTitleIconKey }) {
  const common = "h-3 w-3";
  const iconKey = input.iconKey ?? getFindingTitleIconKey(input.finding.id);

  if (iconKey === "pulse-tracking") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-rose-600`} aria-hidden="true">
        <path d="M4 12h4l2-4 4 8 2-4h4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (iconKey === "arrow-transfer") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-rose-600`} aria-hidden="true">
        <path d="M5 12h6m2 0h6M14 7l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (iconKey === "video-capture") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <rect x="4" y="6" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16 10.5l4-2.5v8l-4-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (iconKey === "shield-video") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-rose-700`} aria-hidden="true">
        <path d="M12 3l6 2.7v5.6c0 4-2.4 7.2-6 9.7-3.6-2.5-6-5.7-6-9.7V5.7L12 3Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M10 10.5h3.8M14 9l2 1.5-2 1.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (iconKey === "shield-network") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-rose-700`} aria-hidden="true">
        <path d="M12 3l6 2.7v5.6c0 4-2.4 7.2-6 9.7-3.6-2.5-6-5.7-6-9.7V5.7L12 3Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <circle cx="9" cy="10" r="1.1" fill="currentColor" />
        <circle cx="15.2" cy="9" r="1.1" fill="currentColor" />
        <circle cx="12.2" cy="14.6" r="1.1" fill="currentColor" />
        <path d="M10 10.4l4.1-1M9.7 11l2 2.8M14.6 9.8l-1.7 3.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (iconKey === "shield-balance") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <path d="M12 3l7 3v6c0 4.2-2.8 7.5-7 9-4.2-1.5-7-4.8-7-9V6l7-3Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 12h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (iconKey === "circle-x") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 9l6 6M15 9l-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (iconKey === "chain-link") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <path d="M7.5 14.5 14 8a3 3 0 1 1 4.2 4.2l-6.5 6.5a4.5 4.5 0 0 1-6.4-6.4l5.8-5.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (iconKey === "globe-link") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M4.8 11h12.4M11 4.5c1.7 1.7 2.5 3.9 2.5 6.5s-.8 4.8-2.5 6.5M11 4.5C9.3 6.2 8.5 8.4 8.5 11s.8 4.8 2.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
        <path d="M15.5 16.5 19 20M17.5 14.6l2.8 2.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (iconKey === "privacy-choice") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-rose-700`} aria-hidden="true">
        <path d="M12 3.5 18 6v5.5c0 3.7-2.3 6.7-6 8.8-3.7-2.1-6-5.1-6-8.8V6l6-2.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M9 12.2 11 14l4-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7.7 6.8 16.3 18" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
      </svg>
    );
  }

  if (iconKey === "settings-gear") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 4.5v2M12 17.5v2M5.5 8.2l1.7 1M16.8 14.8l1.7 1M5.5 15.8l1.7-1M16.8 9.2l1.7-1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M9.4 5.2 8.6 7M15.4 17l-.8 1.8M18.8 10.4 17 9.6M7 14.4l-1.8-.8M5.2 10.4 7 9.6M17 14.4l1.8-.8M8.6 17l.8 1.8M14.6 5.2l.8 1.8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
      </svg>
    );
  }

  if (iconKey === "ad-exchange") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-rose-600`} aria-hidden="true">
        <path d="M5 8h8.5M10.5 4 14 8l-3.5 4M19 16h-8.5M13.5 12 10 16l3.5 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="5" cy="8" r="1.4" fill="currentColor" />
        <circle cx="19" cy="16" r="1.4" fill="currentColor" />
      </svg>
    );
  }

  if (iconKey === "analytics-chart") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <path d="M5 18.5h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="6.5" y="11.5" width="2.8" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <rect x="10.6" y="8" width="2.8" height="8.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <rect x="14.7" y="5.5" width="2.8" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }

  if (iconKey === "device-telemetry") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <rect x="4.5" y="5" width="15" height="10.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 19h4M12 15.5V19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8 10h.01M12 10h.01M16 10h.01" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (iconKey === "cookie-storage") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <path d="M12 4a8 8 0 1 0 8 8c0-.7-.1-1.4-.3-2.1-.7.6-1.6 1.1-2.6 1.1-2.2 0-4-1.8-4-4 0-1 .4-1.9 1.1-2.6A8.2 8.2 0 0 0 12 4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="9" cy="10" r="1" fill="currentColor" />
        <circle cx="15" cy="13" r="1" fill="currentColor" />
        <circle cx="10.5" cy="15.5" r="1" fill="currentColor" />
      </svg>
    );
  }

  if (iconKey === "fingerprint") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <path d="M12 4c2.6 0 4.8 2.2 4.8 4.8v2.3c0 3.2-1.8 6.2-4.8 8.9-3-2.7-4.8-5.7-4.8-8.9V8.8C7.2 6.2 9.4 4 12 4Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 11c.6-.9 1.4-1.4 2-1.4 1 0 1.8.8 1.8 1.8 0 1.3-.8 2-1.8 3.1-.8.9-1.2 1.7-1.4 2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (iconKey === "browser-fingerprint") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <rect x="4" y="5.5" width="16" height="13" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M4 9h16M8.2 7.2h.01M11 7.2h.01" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M12 11.2c1.4 0 2.5 1.1 2.5 2.5 0 1.5-.9 2.3-2.5 3.8-1.6-1.5-2.5-2.3-2.5-3.8 0-1.4 1.1-2.5 2.5-2.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 13.1v2.1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (iconKey === "up-arrow") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <path d="M12 3v12M7 9l5-5 5 5M5 21h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (iconKey === "accessibility-figure") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-amber-700`} aria-hidden="true">
        <circle cx="12" cy="5.5" r="1.7" fill="currentColor" />
        <path d="M6 9.5h12M12 9.5v9M8.5 20l3.5-5 3.5 5M9.5 9.5 7 14M14.5 9.5 17 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (iconKey === "keyboard-key") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-amber-700`} aria-hidden="true">
        <rect x="3.8" y="6.5" width="16.4" height="11" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 10h.01M10.3 10h.01M13.6 10h.01M17 10h.01M7 13.6h2.5M12 13.6h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (iconKey === "contrast-circle") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-amber-700`} aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 4.5a7.5 7.5 0 0 0 0 15Z" fill="currentColor" opacity="0.22" />
        <path d="M12 4.5v15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (iconKey === "label-tag") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-amber-700`} aria-hidden="true">
        <path d="M5 6.5h8.5L19 12l-5.5 5.5H5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="8.5" cy="12" r="1.1" fill="currentColor" />
        <path d="M11 10h3M11 14h2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  if (iconKey === "image-alt") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-amber-700`} aria-hidden="true">
        <rect x="4.5" y="5" width="15" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7.5 16l3.2-3.2 2.2 2.2 1.6-1.6 2 2.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 8.5h2.4M8 11h1.6M13 8.5h3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (iconKey === "focus-target") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-amber-700`} aria-hidden="true">
        <path d="M7 4.5H5.5A1.5 1.5 0 0 0 4 6v1.5M17 4.5h1.5A1.5 1.5 0 0 1 20 6v1.5M7 19.5H5.5A1.5 1.5 0 0 1 4 18v-1.5M17 19.5h1.5A1.5 1.5 0 0 0 20 18v-1.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 9v6M9 12h6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (iconKey === "policy-sync") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <path d="M7 4.5h7l3 3v12H7z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M14 4.5v3h3M9.5 11h5M9.5 14h3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17.8 11.2c1 .7 1.7 1.7 1.7 3 0 2.2-1.8 4-4 4h-.5M12.2 17.8c-1-.7-1.7-1.7-1.7-3 0-2.2 1.8-4 4-4h.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M17.1 9.7h2.2v2.2M12.9 19.3h-2.2v-2.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (iconKey === "hidden-choice") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <path d="M4 12s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5 19 19 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (iconKey === "split-choice") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <path d="M5 7h7M12 7l-2.5-2.5M12 7 9.5 9.5M5 17h14M19 17l-2.5-2.5M19 17l-2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.5 11.5h7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
      </svg>
    );
  }

  if (iconKey === "hand-stop") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-amber-700`} aria-hidden="true">
        <path d="M8 11V6.8a1.2 1.2 0 0 1 2.4 0V11M10.4 10V5.8a1.2 1.2 0 0 1 2.4 0V10M12.8 10.5V7a1.2 1.2 0 0 1 2.4 0v5M15.2 12V9.2a1.2 1.2 0 0 1 2.4 0v4.6c0 3.4-2.4 5.7-5.7 5.7-2.1 0-3.7-.9-4.9-2.6L5.2 14a1.3 1.3 0 0 1 2.1-1.5l1.1 1.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (iconKey === "document-clarity") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <path d="M7 4.5h7l3 3v12H7z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M14 4.5v3h3M9.5 11h5M9.5 14h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16.8" cy="16.6" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M18.4 18.2 20 19.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (iconKey === "warning-triangle") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-amber-700`} aria-hidden="true">
        <path d="M12 4l8 14H4L12 4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 10v4M12 17h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={`${common} text-slate-600`} aria-hidden="true">
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function buildFindingEvidenceHighlights(finding: CertScoreFinding) {
  const details = finding.evidenceDetails;
  const highlightRows: string[] = [];

  if (finding.id === "pre_consent_tracking_detected") {
    const vendorRows = [
      ...asRecordRows(details?.vendors),
      ...asRecordRows(details?.runtimeVendors),
      ...asRecordRows(details?.trackingEvidence?.vendors)
    ];
    const timing = details?.timing as Record<string, unknown> | undefined;
    const fallbackFirstSeenMs = normalizeRuntimeElapsedMs(
      typeof timing?.firstThirdPartyTrackingRequestMs === "number" ? timing.firstThirdPartyTrackingRequestMs : null
    );

    for (const row of vendorRows) {
      const name = getFirstStringValue(row, ["name", "vendor", "label"]);
      if (!name) {
        continue;
      }
      const firstSeenMs = getFirstRuntimeElapsedMs(row, ["firstSeenMs", "first_seen_ms", "firstRequestMs", "first_request_ms"]) ?? fallbackFirstSeenMs;
      highlightRows.push(`"${name}", "preConsent": true${typeof firstSeenMs === "number" ? `, "firstSeenMs": ${Math.round(firstSeenMs)}` : ""}`);
      if (highlightRows.length >= 3) {
        break;
      }
    }
  }

  if (highlightRows.length === 0 && finding.id === "long_lived_cookie_retention_review") {
    for (const row of getCookieRetentionRows(finding).slice(0, 3)) {
      const name = getFirstStringValue(row, ["cookieName", "cookie_name", "name"]) ?? "retained cookie";
      const domain = getFirstStringValue(row, ["domain", "cookieDomain", "cookie_domain", "host"]);
      const durationDays = getCookieDurationDays(row);
      highlightRows.push(`"${name}"${domain ? `, "domain": "${domain}"` : ""}${durationDays ? `, "durationDays": ${Math.round(durationDays)}` : ""}`);
    }
  }

  if (highlightRows.length === 0 && isAccessibilityFinding(finding)) {
    for (const row of getAccessibilityExampleRows(finding).slice(0, 3)) {
      const rule = getFirstStringValue(row, ["ruleCode", "rule_code", "ruleId", "rule_id", "axeRuleId"]);
      const selector = getFirstStringArrayValue(row, ["representativeSelectors", "representative_selectors", "selectors", "target", "targets"])[0] ?? null;
      const impact = getFirstStringValue(row, ["impact", "severity", "axeImpact"]);
      if (rule || selector || impact) {
        highlightRows.push(`${rule ? `"rule": "${rule}"` : "\"rule\": \"retained axe example\""}${selector ? `, "selector": "${selector}"` : ""}${impact ? `, "impact": "${impact}"` : ""}`);
      }
    }
  }

  return highlightRows.slice(0, 3);
}

function getRegulatoryChecklistTopFindingDetails(finding: CertScoreFinding) {
  if (!finding.id.startsWith("regulatory_gap__")) {
    return null;
  }
  const details = finding.evidenceDetails?.policyEvidenceDetails;
  if (!details || typeof details !== "object") {
    return null;
  }

  const rowLabel = typeof details.rowLabel === "string" ? details.rowLabel : finding.label;
  const areaTitle = typeof details.regulatoryAreaTitle === "string" ? details.regulatoryAreaTitle : "GDPR / ePrivacy";
  const status = typeof details.status === "string" ? details.status : null;
  const assessmentStatus = typeof details.assessmentStatus === "string" ? details.assessmentStatus : null;
  const descriptor = [
    typeof details.rowNote === "string" ? details.rowNote : null,
    typeof details.explanation === "string" ? details.explanation : null,
    typeof details.statusBasis === "string" ? details.statusBasis : null,
    finding.shortSummary
  ].find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() ?? finding.shortSummary;
  const evidenceRefs = Array.isArray(details.evidenceRefs)
    ? details.evidenceRefs.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : finding.evidenceRefs;
  const evidencePacket = compactEvidenceJsonForDisplay({
    area: areaTitle,
    rowId: typeof details.rowId === "string" ? details.rowId : null,
    rowLabel,
    status,
    assessmentStatus,
    descriptor,
    statusBasis: typeof details.statusBasis === "string" ? details.statusBasis : null,
    retainedEvidence: isPlainObject(details.retainedEvidence) ? details.retainedEvidence : null,
    projectedFindings: Array.isArray(details.projectedFindings) ? details.projectedFindings : [],
    missingOrIncompleteSourceSignals: Array.isArray(details.missingOrIncompleteSourceSignals)
      ? details.missingOrIncompleteSourceSignals
      : [],
    pipeline: isPlainObject(details.pipeline) ? details.pipeline : null,
    evidenceRefs
  });
  const correctionSteps = [
    `Review the retained ${areaTitle} evidence packet for "${rowLabel}" and confirm the row applies to the scanned page/context.`,
    status ? `Use the checklist status "${status}" as the starting point; do not treat it as a legal conclusion without confirming the retained evidence.` : null,
    "If the evidence is confirmed, address the underlying consent-control, runtime tracking/storage, or disclosure issue identified by the checklist row.",
    "Re-run the scan after changes and verify the checklist row, evidence packet, and top-finding summary update together."
  ].filter((value): value is string => Boolean(value));

  return {
    correctionSteps,
    descriptor,
    evidencePacket,
    evidenceRefs,
    statusBasis: typeof details.statusBasis === "string" && details.statusBasis.trim().length > 0
      ? details.statusBasis.trim()
      : null
  };
}

function RegulatoryChecklistTopFindingBody(input: {
  details: NonNullable<ReturnType<typeof getRegulatoryChecklistTopFindingDetails>>;
  finding: CertScoreFinding;
  tone: ReturnType<typeof getFindingCardTone>;
}) {
  const evidenceJsonPayload = hasMeaningfulJsonValue(input.details.evidencePacket)
    ? JSON.stringify(input.details.evidencePacket, null, 2)
    : null;

  return (
    <details id={getFindingEvidenceAnchor(input.finding)} className={`group/reg-top mt-3 scroll-mt-24 rounded-xl border px-3 py-2 ${input.tone.summary}`}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-[13px] leading-5 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="line-clamp-2 min-w-0 text-slate-700 group-open/reg-top:line-clamp-none">{input.details.descriptor}</span>
        <ScanReportDisclosureIcon className="mt-0.5 group-open/reg-top:rotate-90" />
      </summary>
      <div className="mt-3 space-y-2">
        {evidenceJsonPayload ? (
          <details className="group/evidence block w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
              <span>Evidence packet</span>
              <ScanReportDisclosureIcon className="group-open/evidence:rotate-90" />
            </summary>
            {input.details.statusBasis ? (
              <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-950">
                <p className="font-mono break-words">
                  <span className="text-sky-800">"statusBasis": </span>
                  {JSON.stringify(input.details.statusBasis)}
                </p>
              </div>
            ) : null}
            <EvidenceJsonBlock
              payload={evidenceJsonPayload}
              className="relative mt-3 min-w-0 max-w-full overflow-hidden rounded-lg bg-slate-950"
              preClassName="max-w-full whitespace-pre-wrap break-words px-3 py-3 pr-12 text-xs leading-5 text-slate-100"
            />
          </details>
        ) : null}
        <details className="group/correction block w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
            <span>Correction steps</span>
            <ScanReportDisclosureIcon className="group-open/correction:rotate-90" />
          </summary>
          <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm leading-6 text-slate-700">
            {input.details.correctionSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </details>
      </div>
    </details>
  );
}

function FindingDetailDisclosure(input: { finding: CertScoreFinding }) {
  const reference = getFindingReferenceLink(input.finding);
  const registryContext = getFindingRegulatoryContext(input.finding.id);
  const registryGuideHref = registryContext ? `/findings/${input.finding.id}` : null;
  const display = getPublicReportFindingDisplayForCertFinding(input.finding);
  const cardCopy = buildExecutiveFindingCardCopy(input.finding);
  const observedSummary = cardCopy.summary || display.observedSummary || input.finding.shortSummary;
  const evidencePayload = buildFindingEvidenceJsonPayload(input.finding);
  const compactedEvidencePayload = compactEvidenceJsonForDisplay(evidencePayload);
  const evidenceHighlights = buildFindingEvidenceHighlights(input.finding);
  const jsonPayload =
    hasMeaningfulFindingEvidence(input.finding) && hasMeaningfulJsonValue(compactedEvidencePayload)
      ? JSON.stringify(compactedEvidencePayload, null, 2)
      : null;
  const tone = getFindingCardTone(input.finding, false);
  const fingerprintTelemetry =
    input.finding.id === "probable_fingerprinting" || input.finding.id === "fingerprinting_related_signals_observed"
      ? input.finding.evidenceDetails?.telemetryEvidence
      : null;
  const strongFingerprintSignalLabels = Array.isArray(fingerprintTelemetry?.strongFingerprintSignalLabels)
    ? fingerprintTelemetry.strongFingerprintSignalLabels.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const genericFingerprintSignalLabels = Array.isArray(fingerprintTelemetry?.genericFingerprintSignalLabels)
    ? fingerprintTelemetry.genericFingerprintSignalLabels.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const confidenceExplanation =
    typeof fingerprintTelemetry?.confidenceExplanation === "string" ? fingerprintTelemetry.confidenceExplanation : null;
  const regulatoryContext = buildTopFindingRegulatoryContextDisplay(input.finding);
  const regulatoryChecklistDetails = getRegulatoryChecklistTopFindingDetails(input.finding);

  if (regulatoryChecklistDetails) {
    return (
      <RegulatoryChecklistTopFindingBody
        details={regulatoryChecklistDetails}
        finding={input.finding}
        tone={tone}
      />
    );
  }

  return (
    <details id={getFindingEvidenceAnchor(input.finding)} className={`group mt-3 scroll-mt-24 rounded-xl border px-3 py-2 ${tone.summary}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-medium leading-5">
        <span className="line-clamp-2 min-w-0 group-open:line-clamp-none">{observedSummary}</span>
        <ScanReportDisclosureIcon />
      </summary>
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Review focus</p>
          <p className="text-sm leading-6 text-slate-700">{cardCopy.reviewFocus.replace(/^Review focus:\s*/i, "")}</p>
          {registryGuideHref ? (
            <a
              href={registryGuideHref}
              target="_blank"
              rel="noreferrer"
              aria-label="Learn more about how CertScore.ai interprets this finding"
              className="inline-flex text-sm font-medium text-sky-700 underline decoration-sky-200 underline-offset-4 hover:text-sky-800"
            >
              Learn more
            </a>
          ) : null}
          {reference ? (
            <a
              href={reference.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-sm font-medium text-sky-700 underline decoration-sky-200 underline-offset-4 hover:text-sky-800"
            >
              {reference.label}
            </a>
          ) : null}
        </div>
        {fingerprintTelemetry ? (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Why this surfaced</p>
              <p className="text-sm leading-6 text-slate-700">
                The runtime environment accessed multiple browser/device attributes commonly associated with probabilistic device identification techniques.
              </p>
            </div>
            {strongFingerprintSignalLabels.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Stronger retained primitives</p>
                <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
                  {strongFingerprintSignalLabels.map((signal) => <li key={signal}>{signal}</li>)}
                </ul>
              </div>
            ) : null}
            {genericFingerprintSignalLabels.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Generic browser context</p>
                <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
                  {genericFingerprintSignalLabels.map((signal) => <li key={signal}>{signal}</li>)}
                </ul>
              </div>
            ) : null}
            {confidenceExplanation ? (
              <p className="text-sm leading-6 text-slate-700">{confidenceExplanation}</p>
            ) : null}
            <p className="text-sm leading-6 text-slate-700">This does not independently establish a legal determination or liability.</p>
          </div>
        ) : null}
        {jsonPayload ? (
          <details
            className="group/json block w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5"
            suppressHydrationWarning
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
              <span>Evidence details</span>
              <ScanReportDisclosureIcon className="group-open/json:rotate-90" />
            </summary>
            {evidenceHighlights.length > 0 ? (
              <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-950">
                {evidenceHighlights.map((highlight) => (
                  <p className="font-mono" key={highlight}>{highlight}</p>
                ))}
              </div>
            ) : null}
            <EvidenceJsonBlock
              payload={jsonPayload}
              className="relative mt-3 min-w-0 max-w-full overflow-hidden rounded-lg bg-slate-950"
              preClassName="max-w-full whitespace-pre-wrap break-words px-3 py-3 pr-12 text-xs leading-5 text-slate-100"
            />
          </details>
        ) : null}
        {regulatoryContext ? <TopFindingRegulatoryContextDisclosure context={regulatoryContext} /> : null}
      </div>
    </details>
  );
}

type TopFindingRegulatoryBadge = {
  label: string;
  tone: "privacy" | "neutral";
};

type TopFindingRegulatoryContextDisplay = {
  applicabilityNotes: FindingRegulatoryContextItem[];
  badges: TopFindingRegulatoryBadge[];
  caution: string;
  primaryCopy: string;
  primaryLabel: string;
};

function buildTopFindingRegulatoryContextDisplay(finding: CertScoreFinding): TopFindingRegulatoryContextDisplay | null {
  const context = getFindingRegulatoryContext(finding.id);
  if (!context) {
    return null;
  }

  const items = [...context.technicalStandards, ...context.jurisdictionalContexts];
  const badges = buildRegulatoryContextBadges(context, items);
  if (badges.length === 0) {
    return null;
  }

  return {
    applicabilityNotes: items,
    badges,
    caution: context.displayCaution,
    primaryCopy: makeReportFacingRegulatoryContextCopy(context),
    primaryLabel: context.primaryConcern.label
  };
}

function buildRegulatoryContextBadges(
  context: FindingRegulatoryContext,
  items: FindingRegulatoryContextItem[]
): TopFindingRegulatoryBadge[] {
  const haystack = [
    context.category,
    context.regulatoryConcernGroup,
    context.primaryConcern.label,
    context.primaryConcern.displayCopy,
    ...items.flatMap((item) => [item.id, item.label, item.appliesWhen, ...item.sourceRefs])
  ].join(" ");
  const badges: TopFindingRegulatoryBadge[] = [];
  const addBadge = (label: string, tone: TopFindingRegulatoryBadge["tone"]) => {
    if (!badges.some((badge) => badge.label === label)) {
      badges.push({ label, tone });
    }
  };

  if (/\bGDPR\b|ePrivacy|EU\/EEA|PECR|ICO/i.test(haystack)) {
    addBadge("GDPR / ePrivacy", "privacy");
  }

  return badges.slice(0, 4);
}

function getFindingRegulatoryFilterIds(finding: CertScoreFinding): RegulatoryMappingFilterId[] {
  const context = buildTopFindingRegulatoryContextDisplay(finding);
  if (!context) {
    return [];
  }

  return context.badges.flatMap((badge): RegulatoryMappingFilterId[] => {
    if (/GDPR|ePrivacy/i.test(badge.label)) {
      return ["gdpr"];
    }
    return [];
  });
}

function makeReportFacingRegulatoryContextCopy(context: FindingRegulatoryContext) {
  return `${context.primaryConcern.displayCopy} This is shown as regulatory review context for the scanned report finding, not as a determination that any law applies or was breached.`;
}

function getRegulatoryBadgeToneClasses(tone: TopFindingRegulatoryBadge["tone"]) {
  switch (tone) {
    case "privacy":
      return "border-sky-200 bg-sky-50 text-sky-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function TopFindingRegulatoryContextDisclosure(input: { context: TopFindingRegulatoryContextDisplay }) {
  return (
    <details className="group/regulatory min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Regulatory context</span>
          <span className="mt-2 flex flex-wrap gap-1.5">
            {input.context.badges.map((badge) => (
              <span
                key={badge.label}
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getRegulatoryBadgeToneClasses(badge.tone)}`}
              >
                {badge.label}
              </span>
            ))}
          </span>
        </span>
        <ScanReportDisclosureIcon className="group-open/regulatory:rotate-90" />
      </summary>
      <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{input.context.primaryLabel}</p>
          <p className="text-sm leading-6 text-slate-700">{input.context.primaryCopy}</p>
        </div>
        <details className="group/notes rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
            <span>View applicability notes</span>
            <ScanReportDisclosureIcon className="group-open/notes:rotate-90" />
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-sm leading-6 text-slate-700">{input.context.caution}</p>
            <ul className="space-y-2 text-sm leading-6 text-slate-700">
              {input.context.applicabilityNotes.map((item) => (
                <li key={item.id} className="grid grid-cols-[0.5rem_minmax(0,1fr)] gap-2">
                  <span aria-hidden="true" className="pt-[0.45rem] text-slate-400">{"\u2022"}</span>
                  <span>
                    <span className="font-medium text-slate-900">{item.label}:</span> {item.appliesWhen}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      </div>
    </details>
  );
}

function hasMeaningfulJsonValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(hasMeaningfulJsonValue);
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasMeaningfulJsonValue);
  }
  return true;
}

function hasMeaningfulFindingEvidence(finding: CertScoreFinding) {
  const hasRetainedEvidence =
    hasMeaningfulJsonValue(finding.evidenceDetails) ||
    hasMeaningfulJsonValue(finding.evidencePreview) ||
    hasMeaningfulJsonValue(finding.evidenceRefs);

  if (CANONICAL_EVIDENCE_FINDING_IDS.has(finding.id)) {
    return hasRetainedEvidence;
  }

  return (
    hasRetainedEvidence ||
    hasMeaningfulJsonValue(finding.evidenceVersion)
  );
}

function getFindingCookieWriteCount(finding: CertScoreFinding) {
  const details = finding.evidenceDetails;
  const candidate =
    details?.cookieEvidence?.trackingCookieWritesBeforeConsent ??
    details?.cookieEvidence?.cookieCount ??
    details?.counts?.preConsentTrackingCookies;
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

function getCookieCountMismatchNote(input: {
  beforeConsentCookieCount: number;
  findings: CertScoreFinding[];
}) {
  const findingCount = input.findings
    .map(getFindingCookieWriteCount)
    .find((count): count is number => typeof count === "number" && count >= 0);

  const notes: string[] = [];
  if (typeof findingCount === "number" && findingCount !== input.beforeConsentCookieCount) {
    notes.push("Executive metric includes non-essential cookies explicitly observed in the pre-consent runtime; this finding shows the subset with promotion-grade write timing.");
  }
  return notes.length > 0 ? notes.join(" ") : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactObject<T extends Record<string, unknown>>(value: T, keys: string[]) {
  return Object.fromEntries(
    keys.flatMap((key) => {
      const item = value[key];
      return item === undefined || item === null || item === "" ? [] : [[key, item]];
    })
  );
}

function compactRejectRequest(value: Record<string, unknown>) {
  return compactObject(value, [
    "vendor",
    "category",
    "hostname",
    "ms_after_reject",
    "resource_type",
    "url",
    "vendor_attribution_confidence"
  ]);
}

function compactRejectEvidenceDiff(value: Record<string, unknown>) {
  return compactObject(value, [
    "baseline_vendors",
    "post_reject_vendors",
    "persisting_after_reject_vendors",
    "baseline_request_count",
    "post_reject_request_count",
    "baseline_cookie_count",
    "post_reject_cookie_count",
    "baseline_third_party_cookie_count",
    "post_reject_third_party_cookie_count",
    "storage_state_changed"
  ]);
}

function compactRejectConsentInteraction(value: Record<string, unknown>) {
  return compactObject(value, [
    "success",
    "action_type",
    "clicked_label",
    "clicked_at_ms",
    "page_url_at_click",
    "final_url"
  ]);
}

function compactRejectEvidenceJsonPayload(finding: CertScoreFinding) {
  const details = finding.evidenceDetails ?? {};
  const display = getPublicReportFindingDisplayForCertFinding(finding);
  const postRejectRequests = (details.postRejectNonEssentialRequests ?? [])
    .filter(isPlainObject)
    .map(compactRejectRequest)
    .slice(0, 8);
  const requestUrls = Array.from(
    new Set([
      ...postRejectRequests.flatMap((request) => (typeof request.url === "string" ? [request.url] : [])),
      ...finding.evidenceRefs
    ])
  ).slice(0, 8);

  return {
    id: finding.id,
    label: display.title,
    criticality: display.criticality,
    scanPriority: finding.severity,
    confidence: finding.confidence,
    directVsInferred: finding.directVsInferred,
    evidenceVersion: finding.evidenceVersion ?? "1.1",
    shortSummary: finding.shortSummary,
    whyItMatters: finding.whyItMatters,
    remediation: display.remediation,
    evidence: {
      counts: details.counts ?? {},
      vendors: Array.from(
        new Set([
          ...(details.runtimeVendors ?? []).filter((vendor) => !vendor.trim().startsWith("{")),
          ...postRejectRequests.flatMap((request) => (typeof request.vendor === "string" ? [request.vendor] : []))
        ])
      ),
      evidenceFlags: (details.evidenceFlags ?? []).filter((flag) =>
        /reject|confirmed|persisted|nonessential|contradiction/i.test(flag)
      ),
      rejectSuppressionOutcome: details.rejectSuppressionOutcome && isPlainObject(details.rejectSuppressionOutcome)
        ? compactObject(details.rejectSuppressionOutcome, [
            "overallTrackingReducedAfterReject",
            "nonEssentialVendorsPersistedAfterReject",
            "persistingNonEssentialVendors",
            "postRejectNonEssentialRequestCount",
            "firstPostRejectNonEssentialRequestMs",
            "interpretation"
          ])
        : undefined,
      consentInteraction: details.consentInteraction && isPlainObject(details.consentInteraction)
        ? compactRejectConsentInteraction(details.consentInteraction)
        : undefined,
      promotionDecision: details.promotionDecision && isPlainObject(details.promotionDecision)
        ? compactObject(details.promotionDecision, [
            "promoted",
            "reason",
            "requiredTimingSatisfied",
            "requiredVendorClassificationSatisfied",
            "requiredRejectClickSatisfied"
          ])
        : undefined,
      rejectEvidenceDiff: details.rejectEvidenceDiff && isPlainObject(details.rejectEvidenceDiff)
        ? compactRejectEvidenceDiff(details.rejectEvidenceDiff)
        : undefined,
      postRejectNonEssentialRequests: postRejectRequests,
      suppressionChecks: details.suppressionChecks ?? undefined,
      requestUrls
    },
    evidencePreview: finding.evidencePreview,
    evidenceRefs: finding.evidenceRefs
  };
}

function compactPreConsentTrackingEvidenceJsonPayload(finding: CertScoreFinding) {
  const details = finding.evidenceDetails ?? {};
  const display = getPublicReportFindingDisplayForCertFinding(finding);

  return {
    id: finding.id,
    label: display.title,
    section: finding.section,
    criticality: display.criticality,
    scanPriority: finding.severity,
    confidence: finding.confidence,
    directVsInferred: finding.directVsInferred,
    ...buildRuntimeEvidenceMetadata(finding),
    defaultSurfacePriority: finding.defaultSurfacePriority,
    shortSummary: finding.shortSummary,
    evidenceDetails: {
      scanContext: compactEvidenceRecord(details.scanContext, ["scanMode", "pageUrl", "finalUrl", "hostname"]) ?? null,
      consentState: compactEvidenceRecord(details.consentState, [
        "userConsentActionObserved",
        "trackingOccurredBeforeConsentChoice",
        "consentBannerObserved",
        "userActionType"
      ]) ?? null,
      consentBasis: details.consentBasis ?? null,
      timingAnalysis: compactEvidenceRecord(details.timingAnalysis, [
        "firstTrackingRequestMs",
        "firstConsentBannerObservedMs",
        "trackingBeforeConsent"
      ]) ?? null,
      timing: compactEvidenceRecord(details.timing, [
        "pageStartedAtMs",
        "firstThirdPartyTrackingRequestMs",
        "firstConsentBannerObservedMs",
        "firstConsentActionMs"
      ]) ?? null,
      counts: details.counts ?? {},
      requestSelectionNote: details.requestSelectionNote ?? null,
      vendors: (details.directlyObservedPreConsentVendors ?? details.vendors ?? []).slice(0, 5).map((vendor) =>
        compactObject(vendor, ["name", "category", "preConsent", "firstSeenMs", "representativeUrl"])
      ),
      directlyObservedPreConsentVendors: (details.directlyObservedPreConsentVendors ?? []).slice(0, 5).map((vendor) =>
        compactObject(vendor, ["name", "category", "preConsent", "firstSeenMs", "representativeUrl"])
      ),
      relatedOrInferredVendors: (details.relatedOrInferredVendors ?? []).slice(0, 5).map((vendor) =>
        compactObject(vendor, ["name", "category", "preConsent", "firstSeenMs", "representativeUrl"])
      ),
      vendorEvidenceCompleteness: details.vendorEvidenceCompleteness ?? null,
      representativeRequests: compactPreconsentRepresentativeRequests(details),
      identifierEvidence: compactEvidenceRecord(details.identifierEvidence, [
        "addressingOrSignalingTransmittedByRequest",
        "identifierLikeRequestCount",
        "deviceDataLikeRequestCount",
        "interpretation"
      ]) ?? null,
      policyEvidence: details.policyEvidence ?? null,
      legalRelevance: details.legalRelevance ?? null,
      limitations: compactStringList(details.limitations, 3, 180) ?? []
    },
    evidencePreview: compactStringList(finding.evidencePreview, 3, 220) ?? []
  };
}

function compactCanonicalEvidenceJsonPayload(finding: CertScoreFinding) {
  const details = finding.evidenceDetails ?? {};
  const display = getPublicReportFindingDisplayForCertFinding(finding);

  return {
    id: finding.id,
    label: display.title,
    section: finding.section,
    criticality: display.criticality,
    scanPriority: finding.severity,
    confidence: finding.confidence,
    directVsInferred: finding.directVsInferred,
    ...buildRuntimeEvidenceMetadata(finding),
    defaultSurfacePriority: finding.defaultSurfacePriority,
    shortSummary: finding.shortSummary,
    evidenceDetails: compactObject(
      {
        scanContext: compactEvidenceRecord(details.scanContext, ["scanMode", "pageUrl", "finalUrl", "hostname"]) ?? null,
        consentState: compactEvidenceRecord(details.consentState, [
          "userConsentActionObserved",
          "trackingOccurredBeforeConsentChoice",
          "consentBannerObserved",
          "userActionType"
        ]) ?? undefined,
        consentBasis: details.consentBasis ?? undefined,
        timingAnalysis: compactEvidenceRecord(details.timingAnalysis, [
          "firstTrackingRequestMs",
          "firstConsentBannerObservedMs",
          "trackingBeforeConsent"
        ]) ?? undefined,
        timing: compactEvidenceRecord(details.timing, [
          "pageStartedAtMs",
          "firstThirdPartyTrackingRequestMs",
          "firstConsentBannerObservedMs",
          "firstConsentActionMs"
        ]) ?? undefined,
        rejectInteraction: compactEvidenceRecord(details.rejectInteraction, ["action_type", "selector", "label", "timestamp_ms"]) ?? undefined,
        postRejectEvidence: compactEvidenceRecord(details.postRejectEvidence, [
          "trackingPersistedAfterReject",
          "baselineRequestCount",
          "postRejectRequestCount",
          "basis"
        ]) ?? undefined,
        sessionReplayEvidence: compactEvidenceRecord(details.sessionReplayEvidence, [
          "observed",
          "vendorCount",
          "requestCount",
          "basis",
          "firstPartyProxyObserved",
          "runtimeSummary"
        ]) ?? undefined,
        inputSurfaceEvidence: compactEvidenceRecord(details.inputSurfaceEvidence, [
          "observed",
          "sensitiveFieldCount",
          "evaluated",
          "basis",
          "sensitivePayloadViolations"
        ]) ?? undefined,
        syncEvidence: compactEvidenceRecord(details.syncEvidence, ["observed", "syncRequestCount", "destinationCount", "basis"]) ?? undefined,
        cookieEvidence: compactEvidenceRecord(details.cookieEvidence, [
          "observed",
          "cookieCount",
          "thirdPartyCookieCount",
          "preConsentCookieCount",
          "trackingCookieWritesBeforeConsent",
          "totalUniqueCookiesObserved",
          "basis",
          "cookieNames",
          "cookieWriteEvidence",
          "storageEvidence",
          "representativePreConsentRequests",
          "relatedRuntimeRequests"
        ]) ?? undefined,
        optOutControlEvidence: compactEvidenceRecord(details.optOutControlEvidence, [
          "result",
          "optOutSubtype",
          "missingOrAbsent",
          "incompleteOrUnconfirmed",
          "choiceControlsInspected",
          "gpcClientSignalObserved",
          "gpcHandlingObserved",
          "gpcRequestHeadersApplied",
          "gpcScanStateSent",
          "basis"
        ]) ?? undefined,
        jurisdictionOrPolicyContext: details.jurisdictionOrPolicyContext ?? undefined,
        trackingOrSharingContext: compactEvidenceRecord(details.trackingOrSharingContext, [
          "cbaVendorEvidenceObserved",
          "advertisingVendorEvidenceObserved",
          "thirdPartyTrackingObserved"
        ]) ?? undefined,
        trackingEvidence: compactEvidenceRecord(details.trackingEvidence, [
          "identifierLikeRequestCount",
          "destinationDomainCount",
          "basis"
        ]) ?? undefined,
        consentUiEvidence: compactEvidenceRecord(details.consentUiEvidence, [
          "observed",
          "result",
          "subtype",
          "rejectOptionSubtype",
          "userChoiceImpact",
          "runtimePath",
          "basis"
        ]) ?? undefined,
        sensitiveDataEvidence: compactEvidenceRecord(details.sensitiveDataEvidence, [
          "observed",
          "sensitiveFieldCount",
          "sensitiveDataTypes",
          "basis"
        ]) ?? undefined,
        telemetryEvidence: compactEvidenceRecord(details.telemetryEvidence, [
          "basis",
          "confidenceExplanation",
          "identifierLikeRequestCount",
          "fingerprintPurposeFraming",
          "fingerprintPromotionAnnotation",
          "fingerprintClusterSummary",
          "strongFingerprintSignalLabels",
          "genericFingerprintSignalLabels"
        ]) ?? undefined,
        accessibilityEvidence: compactEvidenceRecord(details.accessibilityEvidence, [
          "observed",
          "issueCount",
          "impact",
          "wcagRule",
          "basis",
          "focusManagementEvidence"
        ]) ?? undefined,
        policyEvidenceDetails: compactEvidenceRecord(details.policyEvidenceDetails, ["observed", "evaluated", "basis", "clarityRiskObserved"]) ?? undefined,
        financialClaimsEvidence: compactEvidenceRecord(details.financialClaimsEvidence, ["observed", "offerCount", "basis"]) ?? undefined,
        disclosureEvidence: compactEvidenceRecord(details.disclosureEvidence, ["observed", "missingDisclosureCount", "basis"]) ?? undefined,
        counts: details.counts ?? {},
        requestSelectionNote: details.requestSelectionNote ?? undefined,
        vendors: (details.vendors ?? []).slice(0, 5).map((vendor) =>
          compactObject(vendor, ["name", "category", "preConsent", "firstSeenMs", "representativeUrl"])
        ),
        representativeRequests: compactRepresentativeRequests(details.representativeRequests),
        rtbCookieSyncEvidence: details.rtbCookieSyncEvidence?.slice(0, 5),
        rtbCookieSyncEvidenceSubtypes: details.rtbCookieSyncEvidenceSubtypes,
        rtbCookieSyncIdentifierQueryKeys: details.rtbCookieSyncIdentifierQueryKeys,
        rtbCookieSyncRedirectTargets: details.rtbCookieSyncRedirectTargets,
        crossDomainIdentifierSharingEvidence: details.crossDomainIdentifierSharingEvidence?.slice(0, 5),
        identifierEvidence: compactEvidenceRecord(details.identifierEvidence, [
          "addressingOrSignalingTransmittedByRequest",
          "identifierLikeRequestCount",
          "deviceDataLikeRequestCount",
          "interpretation"
        ]) ?? undefined,
        policyEvidence: details.policyEvidence ?? { evaluated: false },
        legalRelevance: details.legalRelevance ?? undefined,
        limitations: compactStringList(details.limitations, 3, 180) ?? []
      },
      [
        "scanContext",
        "consentState",
        "consentBasis",
        "timingAnalysis",
        "timing",
        "rejectInteraction",
        "postRejectEvidence",
        "sessionReplayEvidence",
        "inputSurfaceEvidence",
        "syncEvidence",
        "cookieEvidence",
        "optOutControlEvidence",
        "jurisdictionOrPolicyContext",
        "trackingOrSharingContext",
        "trackingEvidence",
        "cookieEvidence",
        "consentUiEvidence",
        "sensitiveDataEvidence",
        "telemetryEvidence",
        "accessibilityEvidence",
        "policyEvidenceDetails",
        "financialClaimsEvidence",
        "disclosureEvidence",
        "counts",
        "requestSelectionNote",
        "vendors",
        "representativeRequests",
        "rtbCookieSyncEvidence",
        "rtbCookieSyncEvidenceSubtypes",
        "rtbCookieSyncIdentifierQueryKeys",
        "rtbCookieSyncRedirectTargets",
        "crossDomainIdentifierSharingEvidence",
        "identifierEvidence",
        "policyEvidence",
        "legalRelevance",
        "limitations"
      ]
    ),
    evidencePreview: compactStringList(finding.evidencePreview, 3, 220) ?? []
  };
}

function buildFindingEvidenceJsonPayload(finding: CertScoreFinding) {
  if (finding.id === "reject_tracking_persists_after_reject") {
    return compactRejectEvidenceJsonPayload(finding);
  }

  if (finding.id === "pre_consent_tracking_detected") {
    return compactPreConsentTrackingEvidenceJsonPayload(finding);
  }

  if (
    CANONICAL_EVIDENCE_FINDING_IDS.has(finding.id)
  ) {
    return compactCanonicalEvidenceJsonPayload(finding);
  }

  if (getPublicReportFindingDisplayForCertFinding(finding).referenceId) {
    return compactCanonicalEvidenceJsonPayload(finding);
  }

  return finding;
}

export function ExecutiveSummaryCard(input: {
  accessLimitationNotice?: ExecutiveAccessLimitationNotice | null;
  allFindings?: CertScoreFinding[];
  accessibilitySignals?: {
    accessibilityClaimMismatchDetected?: boolean | null;
    accessibilityLitigationRiskScore?: number | null;
    accessibilityStatementPresent?: boolean | null;
    adaDemandLetterProbability?: number | null;
    ecommerceSiteLikely?: boolean | null;
    wcagErrorCountTotal?: number | null;
    wcagFormLabelErrorCount?: number | null;
    wcagKeyboardNavigationIssueCount?: number | null;
    wcagMissingAltCount?: number | null;
    wcagViolations?: Array<{
      description: string;
      help: string;
      helpUrl: string;
      impact: string | null;
      nodeCount: number;
      pageUrl: string;
      representativeSelectors: string[];
      ruleCode: string;
      ruleGroup: string;
      severity: string;
    }>;
  } | null;
  agencyMappings?: AgencyMapping[];
  beforeConsentCookieCount: number;
  beforeConsentStorageLimitation?: string | null;
  beforeConsentStorageMetricAvailable?: boolean;
  beforeConsentStorageScope?: "all_observed" | "nonessential_only";
  unclassifiedPreConsentStorageCount?: number;
  coverageMicrocards?: Array<{
    label: string;
    tooltip?: string | null;
    tone?: "amber" | "slate";
  }> | null;
  coverageDiagnosticIndicators?: CoverageDiagnosticIndicator[] | null;
  coverageLevel?: string | null;
  cmpVendorName?: string | null;
  consentControls?: ExecutiveConsentControlProjection | null;
  consentSurfaceStatus?: string | null;
  cookieBannerPresent?: boolean | null;
  domainBenchmark: DomainBenchmarkCardData;
  externalCoverageContextAvailable?: boolean | null;
  finalHost: string | null;
  fingerprintReasons: string[];
  fingerprintLabel: string;
  fingerprintNarrative: string;
  landedOnDifferentHost: boolean;
  lastScannedAt: string;
  posture: "Clear" | "Watch" | "Action Needed";
  preConsentVendorNames: string[];
  requestedHost: string | null;
  regulatoryRisk?: RegulatoryRiskAssessment | null;
  resolvedVendorNames: string[];
  score: number | null;
  scoreLabel?: "Overall score" | "GDPR/ePrivacy evidence score" | "GDPR/ePrivacy posture score";
  scanDurationMs?: number | null;
  scanOutcome?: string | null;
  scanTimelineEvents?: ExecutiveTimelineEvent[] | null;
  status?: string | null;
  sessionReplayVendorNames: string[];
  thirdPartyRequestCount: number;
  thirdPartyDomains: string[];
  topFindings: CertScoreFinding[];
  topObservedEntities: Array<{ label: string; category: string; requestCount: number }>;
  trackerSummary: string;
  unifiedFindings?: UnifiedFindingDisplayPacket[];
  unresolvedVendorHosts: string[];
  vendorCategoryCounts: Record<string, number>;
  legalCoverageScore?: number | null;
  pagesScanned?: number | null;
  policyEnrichmentCount?: number | null;
  policySurfaces?: ExecutivePolicySurface[] | null;
  runtimeMetricsReliable?: boolean;
  scanProof?: ExecutiveScanProof | null;
  scanProofDurationMs?: number | null;
  scanInterruptions?: ExecutiveScanInterruption[] | null;
  showFingerprintingSnapshot?: boolean;
  showReviewLenses?: boolean;
  showScanInterruptionSnapshot?: boolean;
  showProtectedRouteInterruptions?: boolean;
  verifiedPublicSurfacesCount?: number | null;
  lightweightHeroMetrics?: Array<{
    accent?: "sky" | "amber" | "emerald" | "slate";
    helper?: string | null;
    label: string;
    value: number | string | null;
  }> | null;
}) {
  const availableTopFindings = filterVisibleExecutiveTopFindings(input.topFindings);
  const nonRepresentativeScanFinding = availableTopFindings.find((finding) => finding.id === "scan_quality_visual_no_go");
  const noReliableFindingsAccessLimitation = availableTopFindings.find((finding) => finding.id === "access_limited_no_reliable_findings");
  const hardAccessLimitationWithheld =
    Boolean(input.accessLimitationNotice) &&
    /no public verification available/i.test(input.accessLimitationNotice?.coverageLabel ?? "") &&
    Boolean(noReliableFindingsAccessLimitation);
  const isScanNotRepresentative = Boolean(nonRepresentativeScanFinding) || hardAccessLimitationWithheld;
  const displayedTopFindings = isScanNotRepresentative
    ? (nonRepresentativeScanFinding ? [nonRepresentativeScanFinding] : [])
    : availableTopFindings;
  const regulatoryFindingInput =
    Array.isArray(input.allFindings) && input.allFindings.length > 0 ? input.allFindings : input.topFindings;
  const cookieCountMismatchNote = getCookieCountMismatchNote({
    beforeConsentCookieCount: input.beforeConsentCookieCount,
    findings: regulatoryFindingInput
  });
  const unclassifiedStorageInfoNote = (input.unclassifiedPreConsentStorageCount ?? 0) > 0
    ? `${input.unclassifiedPreConsentStorageCount} unclassified record${input.unclassifiedPreConsentStorageCount === 1 ? " was" : "s were"} found but not counted; ${input.unclassifiedPreConsentStorageCount === 1 ? "it appears" : "they appear"} as "Unknown" in the Pre-consent Cookies & Trackers table.`
    : null;
  const storageMetricInfoNote = [
    input.beforeConsentStorageLimitation,
    cookieCountMismatchNote,
    unclassifiedStorageInfoNote
  ]
    .filter((note): note is string => Boolean(note))
    .join(" ") || null;
  const executiveHeadlineFindings = displayedTopFindings.slice(0, 3).map((finding) => {
    const display = getPublicReportFindingDisplayForCertFinding(finding);
    return {
      ...finding,
      label: display.title,
      severity: display.criticality
    };
  });
  const allNamedVendors = uniqueStrings(input.resolvedVendorNames);
  const topObservedEntityLabels = uniqueStrings(input.topObservedEntities.map((entity) => entity.label));
  const topObservedEntityByLabel = new Map(input.topObservedEntities.map((entity) => [entity.label, entity]));
  const allObservedVendorNames = uniqueStrings([
    ...allNamedVendors,
    ...input.topObservedEntities
      .filter((entity) => !/^(?:unknown|domain|host)$/i.test(entity.category))
      .map((entity) => entity.label)
  ]);
  const thirdPartyDomains = input.thirdPartyDomains;
  const recognizedCmpBrand = getRecognizedCmpBrand(input.cmpVendorName);
  const cmpDisplayName =
    recognizedCmpBrand?.label ??
    input.cmpVendorName ??
    (input.cookieBannerPresent ? "Unknown CMP / consent banner" : "Consent banner not determined");
  const cmpStatusAvailable = Boolean(input.cookieBannerPresent || input.cmpVendorName);
  const fingerprintEvidence = input.fingerprintReasons.filter(Boolean);
  const hasProbableFingerprintingFinding = regulatoryFindingInput.some((finding) => finding.id === "probable_fingerprinting");
  const shouldShowFingerprintSnapshot =
    input.showFingerprintingSnapshot !== false &&
    (fingerprintEvidence.length > 0 || input.fingerprintLabel !== "None detected");
  const vendorEvidence = uniqueStrings([...allObservedVendorNames, ...input.unresolvedVendorHosts]);
  const trackerFootprintExpandLabel = formatTrackerFootprintExpandLabel({
    thirdPartyDomainCount: input.thirdPartyDomains.length,
    vendorCount: allObservedVendorNames.length
  });
  const trackerFootprintAllDetails = trackerFootprintExpandLabel
    ? uniqueStrings([...vendorEvidence, ...topObservedEntityLabels, ...thirdPartyDomains])
    : [];
  const trackerFootprintLabels = formatTrackerFootprintLabels({
    domainCount: input.thirdPartyDomains.length,
    vendorCount: allObservedVendorNames.length
  });
  const trackerFootprintRichDetails = trackerFootprintAllDetails.map((label) => {
    const observedEntity = topObservedEntityByLabel.get(label);
    const isVendor = allObservedVendorNames.includes(label);
    return {
      key: label,
      node: (
        <VendorBrandChip
          category={isVendor ? observedEntity?.category ?? "vendor" : "domain"}
          label={label}
          suffix={isVendor ? "vendor" : "domain"}
        />
      )
    };
  });
  const domainTruncationNote =
    thirdPartyDomains.length < input.thirdPartyDomains.length
        ? `Showing ${thirdPartyDomains.length} of ${input.thirdPartyDomains.length} observed domains.`
      : null;
  const policySurfaces = input.policySurfaces ?? [];
  const runtimeMetricsReliable = input.runtimeMetricsReliable !== false;
  const policySurfaceLabelsByUrl = buildPolicySurfaceSharedUrlLabels(policySurfaces);
  const scanInterruptions = input.scanInterruptions ?? [];
  const visibleScanInterruptions = input.showProtectedRouteInterruptions
    ? scanInterruptions
    : scanInterruptions.filter((interruption) => !isProtectedRouteInterruption(interruption));
  const displayState: ExecutiveDisplayState = isScanNotRepresentative
    ? "Scan not representative"
    : !runtimeMetricsReliable
      ? "Limited review"
      : deriveExecutiveDisplayState({
        beforeConsentCookieCount: input.beforeConsentCookieCount,
        coverageLevel: input.coverageLevel,
        domainBenchmark: input.domainBenchmark,
        policySurfaces,
        posture: input.posture,
        scanInterruptions,
        scanOutcome: input.scanOutcome,
        thirdPartyDomains: input.thirdPartyDomains,
        thirdPartyRequestCount: input.thirdPartyRequestCount,
          topFindingCount: displayedTopFindings.length,
          vendorCount: vendorEvidence.length
        });
  const effectiveDisplayState: ExecutiveDisplayState =
    hasOnlyReviewTopFindings(displayedTopFindings)
      ? "Review Needed"
      : displayState;
  const hasMeaningfulInterruption = hasMeaningfulExecutiveInterruption({ scanInterruptions });
  const trackerFootprintTipText = uniqueStrings([
    hasMeaningfulInterruption
      ? "Observed footprint may be incomplete because site protections interrupted runtime collection."
      : null,
    input.externalCoverageContextAvailable
      ? "External public scans may show broader page activity. This is supporting coverage context, not a CertScore.ai-confirmed finding."
      : null
  ]).join(" ");
  const pagesScanned = typeof input.pagesScanned === "number" ? input.pagesScanned : 0;
  const retainedFindingCount = Math.max(input.topFindings.length, input.allFindings?.length ?? 0);
  const policyEnrichmentCount = input.policyEnrichmentCount ?? 0;
  const hasMaterialRetainedCoverage =
    runtimeMetricsReliable &&
    (pagesScanned > 0 || input.status === "completed") &&
    (input.thirdPartyRequestCount >= 20 || vendorEvidence.length >= 2 || policyEnrichmentCount >= 2) &&
    retainedFindingCount >= 3;
  const hasHardCoverageLimit =
    input.coverageLevel === "limited_none" ||
    Boolean(input.scanOutcome && /blocked|captcha|auth|challenge|forbidden|timeout|restricted|unknown_access/i.test(input.scanOutcome));
  const hasProtectedRouteOnlyPartialCoverage =
    input.status === "completed" &&
    pagesScanned > 0 &&
    !hasMeaningfulInterruption &&
    scanInterruptions.some(isProtectedRouteInterruption);
  const hasIncompleteCoverageNotice =
    !hasProtectedRouteOnlyPartialCoverage &&
    (
      !runtimeMetricsReliable ||
      (displayState === "Limited review" && !hasMaterialRetainedCoverage) ||
      hasHardCoverageLimit ||
      (!hasMaterialRetainedCoverage &&
        (input.coverageLevel === "limited_partial" ||
          Boolean(input.scanOutcome && /partial|incomplete|degraded/i.test(input.scanOutcome))))
    );
  const executiveHeadline = input.accessLimitationNotice
    ? input.accessLimitationNotice.message
    : formatTopFindingHeadline(executiveHeadlineFindings);
  const coverageLimitation = input.accessLimitationNotice?.message ?? null;
  const narrativePresentation = deriveExecutiveNarrativePresentation({
    accessLimitationNotice: input.accessLimitationNotice,
    executiveHeadline,
    finalHost: input.finalHost,
    coverageLevel: input.coverageLevel,
    legalCoverageScore: input.legalCoverageScore,
    pagesScanned: input.pagesScanned,
    displayState: effectiveDisplayState,
    policyEnrichmentCount: input.policyEnrichmentCount,
    posture: input.posture as ExecutivePosture,
    requestedHost: input.requestedHost,
    scanOutcome: input.scanOutcome,
    topFindings: executiveHeadlineFindings.map((finding) => ({
      id: finding.id,
      label: getPublicReportFindingDisplayForCertFinding(finding).title,
      section: finding.section
    })),
    verifiedPublicSurfacesCount: input.verifiedPublicSurfacesCount
  });
  const findingsHeading = narrativePresentation.findingsHeading.replace("Highest-priority", "High-priority");
  const topFindingsIncludePartialOrReviewRegulatoryRows = displayedTopFindings.some((finding) => {
    const kind = getRegulatoryTopFindingConcernKind(finding);
    return kind === "partial_rating" || kind === "review_signal";
  });
  const topFindingsCarouselHeading = topFindingsIncludePartialOrReviewRegulatoryRows
    ? "Issues to review"
    : findingsHeading;
  const regulatoryCounts = {
    beforeConsentCookieCount: input.beforeConsentCookieCount,
    thirdPartyRequestCount: input.thirdPartyRequestCount
  };
  const regulatoryOptions = {
    accessibilitySignals: input.accessibilitySignals,
    agencyMappings: input.agencyMappings,
    benchmarkIndustry: input.domainBenchmark?.industry ?? null,
    regulatoryRisk: input.regulatoryRisk,
    unifiedContext: {
      cookieBannerPresent: input.cookieBannerPresent
    }
  };
  const regulatoryLenses = input.unifiedFindings
    ? buildRegulatoryLensesFromUnifiedPackets(input.unifiedFindings, regulatoryCounts, regulatoryOptions)
    : buildRegulatoryLenses(regulatoryFindingInput, regulatoryCounts, regulatoryOptions);
  const productionRegulatoryLenses = regulatoryLenses;
  return (
    <section className="overflow-visible rounded-3xl border border-slate-200 bg-white shadow-[0_18px_60px_-32px_rgba(15,23,42,0.18)]">
      <details className="group/executive-summary" data-testid="executive-summary-details" open>
        <summary
          className="flex min-h-[4.75rem] cursor-pointer list-none flex-wrap items-center gap-3 px-3.5 py-4 marker:hidden [&::-webkit-details-marker]:hidden lg:px-5"
          data-testid="executive-summary-toggle"
        >
          <ScanReportDisclosureIcon className="group-open/executive-summary:rotate-90" />
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Exec Summary</p>
          <span
            data-testid="executive-posture-badge"
            className={`rounded-full border px-3 py-1 text-xs font-medium ${getPostureClasses(effectiveDisplayState)}`}
          >
            {getExecutiveBadgeLabel(effectiveDisplayState)}
          </span>
          {isScanNotRepresentative && input.accessLimitationNotice?.blockerLabel ? (
            <span
              className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800"
              data-testid="scan-blocker-type-badge"
            >
              Blocker: {input.accessLimitationNotice.blockerLabel}
            </span>
          ) : null}
          {input.domainBenchmark ? (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              Benchmark: {formatBenchmarkHeaderIndustry(input.domainBenchmark.industry)}
            </span>
          ) : null}
      </summary>
      <div
        className="grid min-w-0 items-stretch gap-5 px-3.5 pb-6 pt-1 lg:px-5 min-[1000px]:grid-cols-[minmax(20.5rem,1fr)_31rem]"
        data-executive-summary-layout
      >
        <div className="min-w-0 flex flex-col gap-5 lg:min-h-0">
          <div className="space-y-4">
            <div className="space-y-3">
              {input.accessLimitationNotice || isScanNotRepresentative ? (
                <div className="space-y-2">
                  <h2
                    data-testid="executive-headline"
                    className="max-w-3xl text-[2rem] font-semibold leading-tight tracking-tight text-slate-950 lg:text-[2.5rem]"
                  >
                    {narrativePresentation.headline}
                  </h2>
                  {isScanNotRepresentative ? (
                  <p className="max-w-3xl text-sm leading-6 text-slate-600">
                    CertScore.ai captured a maintenance, unavailable, blocked, placeholder, wrong-site, blank, or otherwise non-representative page instead of the normal public site. Scores, regulatory projections, and substantive findings are withheld for this scan.
                  </p>
                  ) : null}
                </div>
              ) : null}
              {input.accessLimitationNotice ? null : isScanNotRepresentative ? (
                <NotScoredHeroMetrics />
              ) : input.lightweightHeroMetrics && input.lightweightHeroMetrics.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  {input.lightweightHeroMetrics.slice(0, 3).map((metric) => (
                    <ExecutiveMetricCard
                      key={metric.label}
                      accent={metric.accent}
                      helper={metric.helper}
                      label={metric.label}
                      value={metric.value}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <BenchmarkMetricCard
                      label={input.scoreLabel ?? "Overall score"}
                      actualValue={input.score}
                      benchmarkValue={null}
                      maxValue={100}
                      note={input.score === null
                        ? "Insufficient evidence to calculate a GDPR/ePrivacy posture score for this scan."
                        : "Higher scores indicate stronger observed GDPR/ePrivacy posture. Lower scores indicate more issues requiring attention."}
                    />
                    <BenchmarkMetricCard
                      label="Third-party requests"
                      actualValue={runtimeMetricsReliable ? input.thirdPartyRequestCount : null}
                      benchmarkValue={input.domainBenchmark?.expectedThirdPartyRequests ?? null}
                      benchmarkIndustry={input.domainBenchmark?.industry ?? null}
                    />
                    <BenchmarkMetricCard
                      label={input.beforeConsentStorageScope === "nonessential_only"
                        ? "Non-essential storage"
                        : "Pre-consent storage"}
                      actualValue={runtimeMetricsReliable && input.beforeConsentStorageMetricAvailable !== false
                        ? input.beforeConsentCookieCount
                        : null}
                      benchmarkValue={input.domainBenchmark?.expectedCookiesBeforeConsent ?? null}
                      benchmarkIndustry={input.domainBenchmark?.industry ?? null}
                      note={storageMetricInfoNote}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          {isScanNotRepresentative || displayedTopFindings.length > 0 ? null : (
            <div className="space-y-3">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Top findings</p>
                  <h2 data-testid="executive-findings-heading" className="text-[1.3rem] font-semibold tracking-tight text-slate-950 lg:text-[1.87rem]">
                    {findingsHeading}
                  </h2>
                </div>
              </div>
            </div>
          )}

          <div
            id="executive-top-findings-list"
            className="grid min-w-0 gap-3 overflow-visible"
            data-executive-top-findings-list
            data-testid="executive-top-findings-list"
          >
            <FindingHashFocus />
            {isScanNotRepresentative ? (
              <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-700">
                Scores and regulatory projections were withheld for this scan because the captured page was not representative of the public site. Re-run when the site is available or try a different scan context.
              </div>
            ) : displayedTopFindings.length > 0 ? (
              <ExecutiveTopFindingsCarousel
                count={displayedTopFindings.length}
                heading={topFindingsCarouselHeading}
              >
              {displayedTopFindings.map((finding, index) => {
                const densityBenchmark = getFindingDensityBenchmark(finding.id);
                const display = getPublicReportFindingDisplayForCertFinding(finding);
                const criticalityBadge = display.criticality;
                const cardTone = getFindingCardTone(finding, index === 0, criticalityBadge);
                const regulatoryMappingIds = getFindingRegulatoryFilterIds(finding);
                const regulatoryConcernKind = getRegulatoryTopFindingConcernKind(finding);
                return (
                <div
                  key={finding.id}
                  className={`min-w-0 overflow-hidden rounded-[1.4rem] border shadow-[0_12px_35px_-26px_rgba(15,23,42,0.18)] ${cardTone.card}`}
                  data-regulatory-mapping-ids={regulatoryMappingIds.join(" ")}
                >
                  <div className={`h-1 w-full ${cardTone.band}`} />
                  <div className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {densityBenchmark ? (
                      <span
                        aria-label={`${densityBenchmark.contextLabel}: ${densityBenchmark.tooltip}`}
                        className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-800"
                        title={densityBenchmark.sourceLabel}
                      >
                        {densityBenchmark.contextLabel}
                        <InfoTip
                          align="start"
                          placement="bottom"
                          text={densityBenchmark.tooltip}
                        />
                      </span>
                    ) : null}
                  </div>
                  <div className={densityBenchmark ? "mt-2.5 flex items-start gap-2" : "flex items-start gap-2"}>
                    <div className="flex min-w-0 items-start gap-1.5">
                      {regulatoryConcernKind ? <RegulatoryTopFindingConcernIcon kind={regulatoryConcernKind} /> : null}
                      <p data-testid="executive-finding-label" className="pt-0.5 text-[17px] font-semibold leading-5 tracking-[-0.02em] text-slate-950">
                        {display.title}
                      </p>
                    </div>
                  </div>
                  <FindingDetailDisclosure finding={finding} />
                </div>
                </div>
                );
              })}
              </ExecutiveTopFindingsCarousel>
            ) : (
              <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {effectiveDisplayState === "Limited review"
                  ? "No headline homepage issue was confirmed from retained evidence. Review coverage limitations and retained signals before treating this scan as clean."
                  : "No headline issue crossed the executive threshold for this scan. Review the supporting evidence below for lower-priority signals and scan context."}
              </div>
            )}
          </div>
        </div>

        <div className="grid min-w-0 items-stretch gap-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(11rem,0.95fr)] min-[1000px]:w-[31rem] min-[1000px]:grid-cols-[15.75rem_14.5rem]">
          <div
            className="min-w-0 space-y-3 rounded-[1.7rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(241,245,249,0.72))] p-3 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.22)]"
            data-executive-snapshot-pane
          >
            {isScanNotRepresentative ? (
              <NotScoredSnapshotPane />
            ) : input.accessLimitationNotice ? (
              <>
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Scan coverage</p>
                  <p className="text-sm leading-6 text-slate-600">
                    This run was blocked before it established a trustworthy public browsing path, so normal privacy findings were not retained.
                  </p>
                </div>
                <AccessLimitationDetails notice={input.accessLimitationNotice} />
              </>
            ) : (
              <ExecutiveSignalSnapshotPane
                beforeConsentCookieCount={input.beforeConsentCookieCount}
                cmpDisplayName={cmpDisplayName}
                cmpStatusAvailable={cmpStatusAvailable}
                cmpVendorName={input.cmpVendorName}
                consentControls={input.consentControls}
                consentSurfaceStatus={input.consentSurfaceStatus}
                domainTruncationNote={domainTruncationNote}
                policySurfaceLabelsByUrl={policySurfaceLabelsByUrl}
                policySurfaces={policySurfaces}
                recognizedCmpLabel={recognizedCmpBrand?.label}
                trackerFootprintDetailLabel={trackerFootprintLabels.detail}
                trackerFootprintTitle={trackerFootprintLabels.title}
                trackerFootprintRichDetails={trackerFootprintRichDetails}
                trackerFootprintTipText={trackerFootprintTipText}
                runtimeMetricsReliable={runtimeMetricsReliable}
                scanProof={input.scanProof}
                scanProofDurationMs={input.scanProofDurationMs}
                coverageLimitation={coverageLimitation}
                requestedHost={input.requestedHost}
              />
            )}
          </div>
          <ExecutiveTimelinePane
            durationMs={input.scanDurationMs}
            events={input.scanTimelineEvents}
          />
        </div>
      </div>
      </details>
    </section>
  );
}
