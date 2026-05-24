import type { AgencyMapping, RegulatoryRiskAssessment } from "@website-signal-risk-scanner/shared";
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
import type { UnifiedFindingDisplayPacket } from "../../lib/scans/unified-findings";
import {
  getFindingRegulatoryContext,
  getFindingReviewContextChips
} from "../../lib/marketing/finding-regulatory-context";
import { CopyJsonButton } from "./copy-json-button";
import { EvidenceJsonBlock } from "./evidence-json-block";
import { FindingHashFocus } from "./finding-hash-focus";
import { InfoTip } from "./info-tip";
import { TopFindingsHeightSync } from "./top-findings-height-sync";
type DomainBenchmarkCardData = {
  confidence: "low" | "medium" | "high";
  estimatedRankLabel: string;
  expectedCookiesBeforeConsent: number;
  expectedOverallScore: number;
  expectedThirdPartyRequests: number;
  industry: string;
  rationale: string;
} | null;

type UnifiedRegulatoryContext = {
  beforeConsentCookieEvidence?: Record<string, unknown> | null;
  beforeConsentCookieCount?: number;
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

export type ExecutiveScanInterruption = {
  details: string[];
  label: string;
};

function getPostureClasses(posture: ExecutiveDisplayState) {
  if (posture === "Action Needed") {
    return "border-rose-200 bg-rose-50/90 text-rose-950";
  }
  if (posture === "Limited review") {
    return "border-sky-200 bg-sky-50/90 text-sky-950";
  }
  if (posture === "Watch") {
    return "border-amber-200 bg-amber-50/90 text-amber-950";
  }
  return "border-emerald-200 bg-emerald-50/90 text-emerald-950";
}

function formatCategoryLabel(value: string) {
  return value.replaceAll("_", " ");
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

function formatTrackerFootprintSummary(input: {
  thirdPartyDomainCount: number;
  vendorCount: number;
}) {
  const domainLabel = `${input.thirdPartyDomainCount} third-party domain${input.thirdPartyDomainCount === 1 ? "" : "s"}`;
  const vendorLabel =
    input.vendorCount === 0
      ? "no classified tracker vendors identified"
      : `${input.vendorCount} classified tracker vendor${input.vendorCount === 1 ? "" : "s"} identified`;

  return `${domainLabel} observed; ${vendorLabel}.`;
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

function formatPolicyDisclosureTypes(types: string[]) {
  const orderedTypes = ["cookie", "privacy", "terms", "policy"].filter((type) => types.includes(type));
  const uniqueTypes = orderedTypes.length > 0 ? orderedTypes : types;

  if (uniqueTypes.length === 2 && uniqueTypes.includes("cookie") && uniqueTypes.includes("privacy")) {
    return "cookie/privacy";
  }

  return uniqueTypes.length > 1 ? "multiple disclosure types" : uniqueTypes[0] ?? "policy";
}

function formatPolicySurfaceSummary(policySurfaces: ExecutivePolicySurface[]) {
  const coveredPolicySurfaceUrlCount = new Set(policySurfaces.map((surface) => surface.pageUrl).filter(Boolean)).size;
  const disclosureTypes = uniqueStrings(policySurfaces.map((surface) => getPolicyDisclosureType(surface.pageLabel)));

  if (coveredPolicySurfaceUrlCount === 1 && disclosureTypes.length > 1) {
    return `1 policy URL covered across ${formatPolicyDisclosureTypes(disclosureTypes)} disclosures`;
  }

  if (coveredPolicySurfaceUrlCount === 1) {
    return "1 policy URL covered";
  }

  if (coveredPolicySurfaceUrlCount > 1) {
    return disclosureTypes.length > coveredPolicySurfaceUrlCount
      ? `${coveredPolicySurfaceUrlCount} policy URLs covered across ${disclosureTypes.length} disclosure types`
      : `${coveredPolicySurfaceUrlCount} policy URLs covered`;
  }

  return `${policySurfaces.length} policy surface${policySurfaces.length === 1 ? "" : "s"} retained`;
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

function getEvidenceConfidenceLabel(confidence: CertScoreFinding["confidence"]) {
  if (confidence === "strong") {
    return "Strong evidence";
  }
  if (confidence === "good") {
    return "Good evidence";
  }
  return "Review evidence";
}

function getFindingTypeLabel(finding: CertScoreFinding) {
  const label = `${finding.id} ${finding.label} ${finding.section}`.toLowerCase();

  if (label.includes("session_recording") || label.includes("session replay")) {
    return "Session replay";
  }
  if (label.includes("fingerprint")) {
    return "Fingerprinting";
  }
  if (label.includes("accessibility") || label.includes("wcag") || label.includes("keyboard") || label.includes("screen reader")) {
    return "Accessibility";
  }
  if (label.includes("cookie")) {
    return "Cookie behavior";
  }
  if (label.includes("consent") || label.includes("reject") || label.includes("pre_consent") || label.includes("pre-consent")) {
    return "Consent timing";
  }
  if (label.includes("third_party") || label.includes("third-party") || label.includes("sharing") || label.includes("tracker")) {
    return "Third-party sharing";
  }
  if (label.includes("policy") || label.includes("disclosure") || label.includes("privacy rights")) {
    return "Disclosure / policy";
  }
  if (label.includes("dark pattern") || label.includes("interface") || label.includes("choice")) {
    return "Consumer interface";
  }

  return "Review signal";
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
    return "Next step: review affected elements with keyboard and screen-reader checks.";
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

function getFindingEvidenceAnchor(finding: CertScoreFinding) {
  return `finding-evidence-${finding.id}`;
}

function DetailDisclosure(input: {
  items: string[];
  summary: string;
  title: string;
  truncationNote?: string | null;
}) {
  const uniqueItems = [...new Set(input.items.filter(Boolean))];

  if (uniqueItems.length === 0) {
    return null;
  }

  return (
    <details className="group mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium text-slate-700">
        <span>{input.summary}</span>
        <span className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-3 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{input.title}</p>
        {input.truncationNote ? (
          <p className="text-xs leading-5 text-slate-600">
            {input.truncationNote}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {uniqueItems.map((item) => (
            <span key={item} className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
              {item}
            </span>
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

const FINANCIAL_CLAIMS_FINDING_IDS = new Set([
  "simulated_performance_without_disclosure",
  "unqualified_superlative_claim_detected",
  "financial_urgency_pressure_tactic_detected",
  "guaranteed_or_high_return_claims_present",
  "performance_claims_without_context",
  "high_risk_product_risk_disclosure_missing"
]);

const CANONICAL_EVIDENCE_FINDING_IDS = new Set([
  "pre_consent_tracking_detected",
  "reject_tracking_persists_after_reject",
  "third_party_tracking_pre_consent",
  "rtb_cookie_sync_observed",
  "cpra_cba_opt_out_missing",
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

const CCPA_CPRA_CIPA_REGULATORY_FINDING_IDS = new Set([
  "cpra_cba_opt_out_missing",
  "long_lived_cookie_retention_review",
  "third_party_tracking_pre_consent",
  "cross_domain_identifier_sharing_observed",
  "identifier_transmission_detected",
  "device_data_collection_detected",
  "telemetry_rich_identification_observed",
  "rtb_cookie_sync_observed",
  "multi_vendor_tracking_detected",
  "large_third_party_footprint",
  "collection_endpoints_detected",
  "sensitive_data_collection_with_third_party_tracking_present",
  "sensitive_collection_surface_observed",
  "possible_session_replay_on_sensitive_input_surface",
  "pre_submit_text_capture_detected",
  "cookie_disclosure_gap",
  "policy_behavior_contradiction_detected",
  "policy_clarity_risk",
  "tracking_redirect_chain"
]);

const FTC_REGULATORY_FINDING_IDS = new Set([
  "reject_option_missing_or_hidden",
  "asymmetric_consent_ui",
  "forced_consent_interaction",
  "blocking_overlay_observed",
  "content_obstructed_by_overlay",
  "consent_dark_patterns_detected",
  "repeated_consent_prompt",
  "popup_or_modal_present",
  "interstitial_detected",
  "policy_behavior_contradiction_detected",
  "policy_clarity_risk",
  "cookie_disclosure_gap",
  "reject_tracking_persists_after_reject",
  "third_party_tracking_pre_consent",
  "video_content_tracking_exposure",
  "sensitive_data_collection_with_third_party_tracking_present",
  "possible_session_replay_on_sensitive_input_surface",
  "pre_submit_text_capture_detected",
  "telemetry_rich_identification_observed",
  "non_cookie_tracking_detected",
  "high_request_density",
  "multi_vendor_tracking_detected",
  "large_third_party_footprint",
  "collection_endpoints_detected"
]);

function getFinancialClaimsFindingSummary(finding: CertScoreFinding) {
  switch (finding.id) {
    case "simulated_performance_without_disclosure":
      return "Simulated or hypothetical performance language surfaced without nearby disclosure.";
    case "unqualified_superlative_claim_detected":
      return "Unqualified superiority or best-in-class claim surfaced.";
    case "financial_urgency_pressure_tactic_detected":
      return "Urgency language appears tied to a conversion step.";
    default:
      return finding.shortSummary;
  }
}

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
        "vendor",
        "category",
        "hostname",
        "firstSeenMs",
        "ms",
        "resourceType",
        "resource_type",
        "url"
      ])
    );
  return items.length > 0 ? items : undefined;
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
      "Automated public-web observation for review, not a legal conclusion.",
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
        ...(details.vendors ?? []).map((vendor) => vendor.name)
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
  if (/FTC/i.test(lens)) {
    return chips.filter((chip) =>
      /FTC|consumer|deception|unfair|disclosure|choice|dark pattern|clarity|substantiation/i.test(chip) &&
      !/GDPR|ePrivacy|Article 5|EU\b/i.test(chip)
    );
  }
  if (/CCPA|CPRA|CIPA/i.test(lens)) {
    return chips.filter((chip) =>
      /CCPA|CPRA|CIPA|California|sale|share|sharing|disclosure|sensitive|session|wiretap|eavesdrop|recording/i.test(chip) &&
      !/GDPR|ePrivacy|Article 5|EU\b/i.test(chip)
    );
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
  "Cookie timing context was retained, but CertScore did not retain enough classified non-essential tracking/vendor evidence to promote this into a top-level pre-consent tracking finding.";

const THIRD_PARTY_REQUEST_CONTEXT_NOT_TOP_LEVEL_COPY =
  "Third-party request context was retained, but CertScore did not retain enough classified advertising, sharing, sale/share, or disclosure-gap evidence to promote this into a top-level third-party tracking or sharing finding.";

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

function capContextOnlyLensTone(input: {
  findings: RegulatoryLensFinding[];
  score: number;
  tone: ReturnType<typeof buildTone>;
}) {
  if (input.tone.label !== "Needs work") {
    return { score: input.score, tone: input.tone };
  }
  if (input.findings.length === 0 || input.findings.some((finding) => !isContextOnlyLensFinding(finding))) {
    return { score: input.score, tone: input.tone };
  }

  return {
    score: Math.max(input.score, 50),
    tone: buildWatchTone()
  };
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
        finding.id === "cpra_cba_opt_out_missing" ? finding.label : finding.shortSummary,
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

function shouldMapPreConsentTrackingToFtc(input: {
  findingIds: Set<string>;
  hasHealthSensitiveContext: boolean;
  hasSensitiveGamblingTrackingRisk: boolean;
  sensitiveTrackingFinding: CertScoreFinding | undefined;
}) {
  return (
    hasAnyFinding(input.findingIds, [
      "reject_option_missing_or_hidden",
      "asymmetric_consent_ui",
      "forced_consent_interaction",
      "consent_dark_patterns_detected",
      "policy_behavior_contradiction_detected",
      "policy_clarity_risk",
      "cookie_disclosure_gap"
    ]) ||
    Boolean(input.sensitiveTrackingFinding) ||
    input.hasHealthSensitiveContext ||
    input.hasSensitiveGamblingTrackingRisk
  );
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

function shouldMapSessionRecordingToCpra(input: {
  findingIds: Set<string>;
  sensitiveTrackingFinding: CertScoreFinding | undefined;
}) {
  return (
    Boolean(input.sensitiveTrackingFinding) ||
    hasAnyFinding(input.findingIds, [
      "possible_session_replay_on_sensitive_input_surface",
      "sensitive_data_collection_with_third_party_tracking_present",
      "sensitive_collection_surface_observed",
      "pre_submit_text_capture_detected",
      "cookie_disclosure_gap",
      "policy_behavior_contradiction_detected",
      "policy_clarity_risk",
      "cpra_cba_opt_out_missing",
      "cross_domain_identifier_sharing_observed",
      "rtb_cookie_sync_observed"
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

function shouldMapProbableFingerprintingToFtc(input: {
  findingIds: Set<string>;
  hasHealthSensitiveContext: boolean;
  hasSensitiveGamblingTrackingRisk: boolean;
  sensitiveTrackingFinding: CertScoreFinding | undefined;
}) {
  return (
    Boolean(input.sensitiveTrackingFinding) ||
    input.hasHealthSensitiveContext ||
    input.hasSensitiveGamblingTrackingRisk ||
    hasAnyFinding(input.findingIds, [
      "cookie_disclosure_gap",
      "policy_behavior_contradiction_detected",
      "policy_clarity_risk",
      "reject_option_missing_or_hidden",
      "asymmetric_consent_ui",
      "forced_consent_interaction",
      "consent_dark_patterns_detected"
    ])
  );
}

export type ExecutiveAccessLimitationNotice = {
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
  if (score >= 72) {
    return { label: "Strong", toneClass: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  }
  if (score >= 50) {
    return { label: "Watch", toneClass: "border-amber-200 bg-amber-50 text-amber-800" };
  }
  return { label: "Needs work", toneClass: "border-rose-200 bg-rose-50 text-rose-800" };
}

function buildWatchTone() {
  return { label: "Watch", toneClass: "border-amber-200 bg-amber-50 text-amber-800" };
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

function buildFinancialClaimsLens(input: {
  findings: CertScoreFinding[];
  forceScored?: boolean;
}): RegulatoryLens | null {
  const financialFindings = input.findings.map((finding) =>
    buildRegulatoryLensFindingFromCertFinding(finding, getFinancialClaimsFindingSummary(finding), {
      lens: "Financial & commercial claims"
    })
  );

  if (financialFindings.length === 0) {
    return null;
  }

  const financialSeverityPenalty = input.findings.reduce((total, finding) => {
    switch (finding.severity) {
      case "critical":
        return total + 24;
      case "high":
        return total + 20;
      case "medium":
        return total + 14;
      default:
        return total + 8;
    }
  }, 0);
  const financialScore = clampScore(84 - financialSeverityPenalty - Math.max(0, financialFindings.length - 1) * 6);
  const financialTone = buildTone(financialScore);

  return {
    acronym: "Financial & commercial claims",
    detailTitle: "Claims, urgency, and pricing disclosures",
    findings: financialFindings,
    ratingLabel: financialTone.label,
    score: financialScore,
    summary: "Commercial claims and pricing language should be reviewed for clearer qualification and disclosure.",
    toneClass: financialTone.toneClass
  } satisfies RegulatoryLens;
}

function hasFinancialRegulatoryBenchmark(value: string | null | undefined) {
  return /\b(?:forex|futures?|options?|crypto derivatives?|investment signals?|trading signals?|prop trading|funded accounts?|cfd|spread betting|financial advisory|investment newsletter|copy trading|signal service|funded account)\b/i.test(
    value ?? ""
  );
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
    regulatoryRisk?: RegulatoryRiskAssessment | null;
    unifiedContext?: UnifiedRegulatoryContext | null;
  }
): RegulatoryLens[] {
  const findingIds = new Set(findings.map((finding) => finding.id));
  const financialClaimFindings = findings.filter((finding) => FINANCIAL_CLAIMS_FINDING_IDS.has(finding.id));
  const financialRegulatoryBenchmarkActive = hasFinancialRegulatoryBenchmark(options?.benchmarkIndustry);
  const trackingFinding =
    findings.find((finding) => finding.id === "pre_consent_tracking_detected") ??
    findings.find((finding) => finding.id === "rtb_cookie_sync_observed") ??
    findings.find((finding) => finding.id === "reject_tracking_persists_after_reject") ??
    findings.find((finding) => finding.id === "third_party_tracking_pre_consent") ??
    findings.find((finding) => finding.id === "third_party_cookie_pre_consent") ??
    findings.find((finding) => finding.id === "analytics_cookie_pre_consent") ??
    findings.find((finding) => finding.id === "adtech_cookie_pre_consent") ??
    findings.find((finding) => /pre[- ]consent|before consent/i.test(`${finding.label} ${finding.shortSummary}`));
  const replayFinding = findings.find((finding) => finding.id === "session_recording_services_detected");
  const rejectTrackingFinding = findings.find((finding) => finding.id === "reject_tracking_persists_after_reject");
  const cpraCbaOptOutFinding = findings.find((finding) => finding.id === "cpra_cba_opt_out_missing");
  const cookieDisclosureFinding = findings.find((finding) => finding.id === "cookie_disclosure_gap");
  const sensitiveTrackingFinding =
    findings.find((finding) => finding.id === "sensitive_data_collection_with_third_party_tracking_present") ??
    findings.find((finding) => finding.id === "possible_session_replay_on_sensitive_input_surface");
  const consentFinding =
    findings.find((finding) => finding.id === "consent_dark_patterns_detected") ??
    findings.find((finding) => finding.id === "asymmetric_consent_ui") ??
    findings.find((finding) => finding.id === "reject_option_missing_or_hidden") ??
    findings.find((finding) => finding.id === "forced_consent_interaction");
  const clarityFinding = findings.find((finding) => finding.id === "policy_clarity_risk");
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
  const retainedThirdPartyRequestContextExplanation =
    !trackingFinding && thirdPartyRequestCount > 0 ? THIRD_PARTY_REQUEST_CONTEXT_NOT_TOP_LEVEL_COPY : undefined;
  const beforeConsentCookieEvidence = options?.unifiedContext?.beforeConsentCookieEvidence;
  const hasConsentConcern =
    findingIds.has("consent_dark_patterns_detected") ||
    findingIds.has("asymmetric_consent_ui") ||
    findingIds.has("reject_option_missing_or_hidden") ||
    findingIds.has("forced_consent_interaction") ||
    findingIds.has("reject_tracking_persists_after_reject");
  const hasStrongDarkPatternConcern =
    findingIds.has("consent_dark_patterns_detected") || findingIds.has("asymmetric_consent_ui");
  const riskDriverKeys = new Set(options?.regulatoryRisk?.topRiskDrivers.map((driver) => driver.key) ?? []);
  const benchmarkHaystack = `${options?.benchmarkIndustry ?? ""} ${findings.map((finding) => `${finding.label} ${finding.shortSummary}`).join(" ")}`;
  const inferredGamblingContext = /\b(gambling|sports betting|sportsbook|casino|wager|betting)\b/i.test(benchmarkHaystack);
  const inferredHealthContext = /\b(health|medical|patient|symptom|condition|clinical)\b/i.test(benchmarkHaystack);
  const hasGamblingSensitiveContext =
    options?.unifiedContext?.hasSensitiveGamblingTrackingRisk === true || inferredGamblingContext;
  const hasHealthSensitiveContext =
    options?.unifiedContext?.hasSensitiveHealthTrackingRisk === true || inferredHealthContext;
  const hasGenericSensitiveTrackingRisk =
    riskDriverKeys.has("sensitive_context_tracking") ||
    riskDriverKeys.has("sensitive_context_preconsent");
  const hasSensitiveHealthTrackingRisk =
    options?.unifiedContext?.hasSensitiveHealthTrackingRisk ??
    (riskDriverKeys.has("health_identity_data_broker") ||
      riskDriverKeys.has("health_dmp_flow") ||
      riskDriverKeys.has("identity_data_broker_preconsent") ||
      riskDriverKeys.has("dmp_pre_consent") ||
      (hasGenericSensitiveTrackingRisk && hasHealthSensitiveContext && !hasGamblingSensitiveContext));
  const hasSensitiveGamblingTrackingRisk =
    options?.unifiedContext?.hasSensitiveGamblingTrackingRisk ??
    (hasGamblingSensitiveContext && (
      hasGenericSensitiveTrackingRisk ||
      findingIds.has("session_recording_services_detected") ||
      hasTrackingConcern
    ));

  const gdprRegulatoryFindingIds = new Set(GDPR_EPRIVACY_REGULATORY_FINDING_IDS);
  if (shouldMapCrossDomainIdentifierSharingToGdpr({ beforeConsentCookieCount, findingIds })) {
    addMappedFindingId(gdprRegulatoryFindingIds, findingIds, "cross_domain_identifier_sharing_observed");
  }
  if (shouldMapConsentDarkPatternsToGdpr({ beforeConsentCookieCount, findingIds, hasTrackingConcern })) {
    addMappedFindingId(gdprRegulatoryFindingIds, findingIds, "consent_dark_patterns_detected");
  }

  const cpraRegulatoryFindingIds = new Set(CCPA_CPRA_CIPA_REGULATORY_FINDING_IDS);
  if (shouldMapSessionRecordingToCpra({ findingIds, sensitiveTrackingFinding })) {
    addMappedFindingId(cpraRegulatoryFindingIds, findingIds, "session_recording_services_detected");
  }

  const ftcRegulatoryFindingIds = new Set(FTC_REGULATORY_FINDING_IDS);
  if (
    shouldMapPreConsentTrackingToFtc({
      findingIds,
      hasHealthSensitiveContext,
      hasSensitiveGamblingTrackingRisk,
      sensitiveTrackingFinding
    })
  ) {
    addMappedFindingId(ftcRegulatoryFindingIds, findingIds, "pre_consent_tracking_detected");
  }
  if (
    shouldMapProbableFingerprintingToFtc({
      findingIds,
      hasHealthSensitiveContext,
      hasSensitiveGamblingTrackingRisk,
      sensitiveTrackingFinding
    })
  ) {
    addMappedFindingId(ftcRegulatoryFindingIds, findingIds, "probable_fingerprinting");
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

  const cpraNotes = mergeRegulatoryLensFindings([
    ...buildMappedRegulatoryLensFindings({
      context: { lens: "CCPA / CPRA / CIPA", reason: "mapped_regulatory_finding" },
      findingIds: cpraRegulatoryFindingIds,
      findings
    }),
    thirdPartyRequestCount > 0
        ? buildObservedCountLensFinding({
            count: thirdPartyRequestCount,
            id: "third_party_request_count",
            label: `${thirdPartyRequestCount} third-party request records were observed on the initial path.`,
            metric: "thirdPartyRequestCount",
            reviewContextCopy: retainedThirdPartyRequestContextExplanation,
            reviewContextLabel: retainedThirdPartyRequestContextExplanation ? "Why not top-level?" : undefined,
            source: "regulatory_counts"
          })
      : null
  ].filter((item): item is RegulatoryLensFinding => Boolean(item)));

  const ftcNotes = mergeRegulatoryLensFindings(
    buildMappedRegulatoryLensFindings({
      context: { lens: "FTC", reason: "mapped_regulatory_finding" },
      findingIds: ftcRegulatoryFindingIds,
      findings
    })
  );

  const gdprScore = clampScore(
    84 -
      (hasTrackingConcern ? 32 : 0) -
      (findingIds.has("cookie_disclosure_gap") ? 10 : 0) -
      (beforeConsentCookieCount > 0 ? 14 : 0) -
      (hasConsentConcern ? (hasTrackingConcern || beforeConsentCookieCount > 0 ? 16 : 6) : 0) -
      (sensitiveTrackingFinding ? 12 : 0) -
      (findingIds.has("session_recording_services_detected") ? 10 : 0)
  );
  const cpraScore = clampScore(
    82 -
      (hasTrackingConcern ? 24 : 0) -
      (cpraCbaOptOutFinding ? 16 : 0) -
      (findingIds.has("cookie_disclosure_gap") ? 12 : 0) -
      (beforeConsentCookieCount > 0 ? 12 : 0) -
      (sensitiveTrackingFinding ? 14 : 0) -
      (findingIds.has("session_recording_services_detected") ? 10 : 0) -
      (findingIds.has("policy_clarity_risk") ? 8 : 0)
  );
  const ftcScore = clampScore(
    80 -
      (hasConsentConcern ? 24 : 0) -
      (hasTrackingConcern ? 18 : 0) -
      (findingIds.has("cookie_disclosure_gap") ? 10 : 0) -
      (hasSensitiveHealthTrackingRisk ? 16 : 0) -
      (sensitiveTrackingFinding ? 12 : 0) -
      (beforeConsentCookieCount > 0 ? 8 : 0) -
      (findingIds.has("session_recording_services_detected") ? 10 : 0)
  );

  const cpraFindings = cpraNotes.length > 0 || cpraScore >= 72
    ? cpraNotes
    : mergeRegulatoryLensFindings([
        hasTrackingConcern
          ? buildRegulatoryLensScoreDriver({
              evidence: {
                hasTrackingConcern,
                mappedTopLevelFindingCount: cpraNotes.length,
                scoreImpact: -24
              },
              id: "cpra_tracking_score_driver",
              label: "Score driver: retained tracking evidence affected California sale/share review."
            })
          : null,
        beforeConsentCookieCount > 0
          ? buildObservedCountLensFinding({
              count: beforeConsentCookieCount,
              evidence: beforeConsentCookieEvidence,
              id: "cpra_before_consent_cookie_count",
              label: formatBeforeConsentCookieCountLabel(beforeConsentCookieCount, beforeConsentCookieEvidence),
              metric: "beforeConsentCookieCount",
              reviewContextCopy: retainedCookieContextExplanation,
              reviewContextLabel: retainedCookieContextExplanation ? "Why not top-level?" : undefined,
              source: "regulatory_counts"
            })
          : null,
        thirdPartyRequestCount > 0
          ? buildObservedCountLensFinding({
              count: thirdPartyRequestCount,
              id: "cpra_third_party_request_count",
              label: `${thirdPartyRequestCount} third-party request records were observed on the initial path.`,
              metric: "thirdPartyRequestCount",
              reviewContextCopy: retainedThirdPartyRequestContextExplanation,
              reviewContextLabel: retainedThirdPartyRequestContextExplanation ? "Why not top-level?" : undefined,
              source: "regulatory_counts"
            })
          : null,
        sensitiveTrackingFinding
          ? buildRegulatoryLensScoreDriver({
              evidence: { findingId: sensitiveTrackingFinding.id, scoreImpact: -14 },
              id: "cpra_sensitive_tracking_score_driver",
              label: "Score driver: sensitive-data tracking context affected California privacy posture."
            })
          : null
      ].filter((item): item is RegulatoryLensFinding => Boolean(item)));
  const ftcFindings = ftcNotes.length > 0 || ftcScore >= 72
    ? ftcNotes
    : mergeRegulatoryLensFindings([
        hasTrackingConcern
          ? buildRegulatoryLensScoreDriver({
              evidence: {
                hasTrackingConcern,
                mappedTopLevelFindingCount: ftcNotes.length,
                scoreImpact: -18
              },
              id: "ftc_tracking_score_driver",
              label: "Score driver: pre-consent tracking or third-party collection affected the FTC-style review."
            })
          : null,
        hasConsentConcern
          ? buildRegulatoryLensScoreDriver({
              evidence: {
                hasConsentConcern,
                scoreImpact: -24
              },
              id: "ftc_consent_choice_score_driver",
              label: "Score driver: consent-choice design affected the consumer-protection review."
            })
          : null,
        beforeConsentCookieCount > 0
          ? buildObservedCountLensFinding({
              count: beforeConsentCookieCount,
              evidence: beforeConsentCookieEvidence,
              id: "ftc_before_consent_cookie_count",
              label: formatBeforeConsentCookieCountLabel(beforeConsentCookieCount, beforeConsentCookieEvidence),
              metric: "beforeConsentCookieCount",
              reviewContextCopy: retainedCookieContextExplanation,
              reviewContextLabel: retainedCookieContextExplanation ? "Why not top-level?" : undefined,
              source: "regulatory_counts"
            })
          : null,
        sensitiveTrackingFinding
          ? buildRegulatoryLensScoreDriver({
              evidence: { findingId: sensitiveTrackingFinding.id, scoreImpact: -12 },
              id: "ftc_sensitive_tracking_score_driver",
              label: "Score driver: sensitive-data collection alongside tracking affected the FTC-style review."
            })
          : null
      ].filter((item): item is RegulatoryLensFinding => Boolean(item)));

  const gdprDisplay = capContextOnlyLensTone({ findings: privacyTrackingNotes, score: gdprScore, tone: buildTone(gdprScore) });
  const cpraDisplay = capContextOnlyLensTone({ findings: cpraFindings, score: cpraScore, tone: buildTone(cpraScore) });
  const ftcDisplay = capContextOnlyLensTone({ findings: ftcFindings, score: ftcScore, tone: buildTone(ftcScore) });

  const lenses: RegulatoryLens[] = [
    {
      acronym: "CCPA / CPRA / CIPA",
      detailTitle: "Disclosure and downstream sharing issues",
      findings: cpraFindings,
      ratingLabel: cpraDisplay.tone.label,
      score: cpraDisplay.score,
      summary: sensitiveTrackingFinding
        ? "Sensitive-data collection and downstream third-party exposure drive this score."
        : cpraCbaOptOutFinding
        ? "Cross-context behavioral advertising and CPRA opt-out posture drive this score."
        : replayFinding || hasTrackingConcern || hasPreConsentCookieConcern
        ? "Third-party collection and disclosure posture drives this score."
        : "No strong sale/share-style signal surfaced in the top findings.",
      toneClass: cpraDisplay.tone.toneClass
    },
    {
      acronym: "GDPR / ePrivacy",
      detailTitle: "Consent and tracking issues",
      findings: privacyTrackingNotes,
      ratingLabel: gdprDisplay.tone.label,
      score: gdprDisplay.score,
      summary: sensitiveTrackingFinding
        ? "Sensitive-data collection and tracking exposure are the main issue."
        : hasTrackingConcern || hasPreConsentCookieConcern
        ? "Consent and pre-consent tracking risk is the main issue."
        : "No major consent-triggering issue surfaced in the top findings.",
      toneClass: gdprDisplay.tone.toneClass
    },
    {
      acronym: "FTC",
      detailTitle: hasStrongDarkPatternConcern ? "Consent UX and disclosure review" : "Choice architecture review signals",
      findings: ftcFindings,
      ratingLabel: ftcDisplay.tone.label,
      score: ftcDisplay.score,
      summary: hasStrongDarkPatternConcern
        ? "Choice architecture and disclosure clarity are the main FTC-style concerns."
        : sensitiveTrackingFinding
          ? "Sensitive-data collection alongside third-party tracking should be reviewed for consumer-protection context."
        : hasSensitiveGamblingTrackingRisk
          ? "High-risk gambling, financial-behavior, and advertising flows warrant FTC-style review."
        : hasSensitiveHealthTrackingRisk
          ? "Health-context tracking and advertising/data-broker flows warrant FTC-style review."
        : hasConsentConcern
          ? "Consent-choice design should be reviewed for clarity."
        : cookieDisclosureFinding
          ? "Cookie disclosures should be reviewed against observed runtime tracking behavior."
        : hasTrackingConcern || counts.beforeConsentCookieCount > 0
          ? "Pre-consent tracking and third-party collection should be reviewed for consumer-protection context."
            : "No strong consumer-protection cue surfaced in the top findings.",
      toneClass: ftcDisplay.tone.toneClass
    }
  ];

  const dojAdaMapping = options?.agencyMappings?.find((mapping) => mapping.agencyKey === "doj_ada");
  const accessibilitySignals = options?.accessibilitySignals ?? null;
  const accessibilityRiskScore = options?.regulatoryRisk?.accessibilityEnforcementRiskScore ?? null;
  const wcagErrorCountTotal = accessibilitySignals?.wcagErrorCountTotal ?? null;
  const wcagFormLabelErrorCount = accessibilitySignals?.wcagFormLabelErrorCount ?? null;
  const wcagKeyboardNavigationIssueCount = accessibilitySignals?.wcagKeyboardNavigationIssueCount ?? null;
  const wcagMissingAltCount = accessibilitySignals?.wcagMissingAltCount ?? null;
  const accessibilityStatementPresent = accessibilitySignals?.accessibilityStatementPresent ?? null;
  const accessibilityClaimMismatchDetected = accessibilitySignals?.accessibilityClaimMismatchDetected ?? null;
  const accessibilityLitigationRiskScore = accessibilitySignals?.accessibilityLitigationRiskScore ?? null;
  const adaDemandLetterProbability = accessibilitySignals?.adaDemandLetterProbability ?? null;
  const strongAdaDriverLabels = new Set([
    "Accessibility claim mismatch",
    "High automated WCAG issue count",
    "Keyboard navigation issues",
    "Form label accessibility issues",
    "Elevated accessibility risk",
    "Elevated ADA demand-letter exposure"
  ]);
  const hasStrongAdaDriver = Boolean(
    dojAdaMapping?.triggeredSignals.some(
      (signal) => strongAdaDriverLabels.has(signal.label) || signal.key === "accessibility.representative_axe_examples"
    )
  );
  const hasOnlyAccessibilityStatementMissingSignal =
    accessibilityStatementPresent === false &&
    accessibilityClaimMismatchDetected !== true &&
    !((typeof wcagErrorCountTotal === "number" && wcagErrorCountTotal >= 1)) &&
    !((typeof wcagKeyboardNavigationIssueCount === "number" && wcagKeyboardNavigationIssueCount > 0)) &&
    !((typeof wcagFormLabelErrorCount === "number" && wcagFormLabelErrorCount > 0)) &&
    !((typeof wcagMissingAltCount === "number" && wcagMissingAltCount >= 5)) &&
    !((typeof accessibilityLitigationRiskScore === "number" && accessibilityLitigationRiskScore >= 45)) &&
    !((typeof adaDemandLetterProbability === "number" && adaDemandLetterProbability >= 45)) &&
    !((typeof accessibilityRiskScore === "number" && accessibilityRiskScore >= 45)) &&
    !hasStrongAdaDriver;
  const hasSignificantAccessibilitySignals =
    accessibilityClaimMismatchDetected === true ||
    (typeof wcagErrorCountTotal === "number" && wcagErrorCountTotal >= 1) ||
    (typeof wcagKeyboardNavigationIssueCount === "number" && wcagKeyboardNavigationIssueCount > 0) ||
    (typeof wcagFormLabelErrorCount === "number" && wcagFormLabelErrorCount > 0) ||
    (typeof wcagMissingAltCount === "number" && wcagMissingAltCount >= 5) ||
    (typeof accessibilityLitigationRiskScore === "number" && accessibilityLitigationRiskScore >= 45) ||
    (typeof adaDemandLetterProbability === "number" && adaDemandLetterProbability >= 45) ||
    (typeof accessibilityRiskScore === "number" && accessibilityRiskScore >= 45);
  const shouldIncludeAdaLens =
    dojAdaMapping !== undefined &&
    (hasSignificantAccessibilitySignals || (hasStrongAdaDriver && !hasOnlyAccessibilityStatementMissingSignal));

  if (!shouldIncludeAdaLens) {
    lenses.push(
      buildMinimalRegulatoryLens({
        acronym: "DOJ / ADA accessibility",
        detailTitle: "Accessibility and digital access issues",
        ratingLabel: "Audit-only",
        score: null,
        summary: "",
        toneClass: "border-slate-200 bg-slate-50 text-slate-700"
      })
    );

    const financialClaimsLens = buildFinancialClaimsLens({
      findings: financialClaimFindings,
      forceScored: financialRegulatoryBenchmarkActive
    });
    if (financialClaimsLens) {
      lenses.push(financialClaimsLens);
    }

    return lenses;
  }

  const hasDirectAccessibilityStatementFinding = accessibilityStatementPresent === false;
  const normalizedAgencyFindingLabels = (dojAdaMapping?.triggeredSignals ?? [])
    .map((signal) => signal.label)
    .filter((label) =>
      hasDirectAccessibilityStatementFinding
        ? !/accessibility statement (missing|not detected)/i.test(label)
        : true
    );

  const wcagViolations = accessibilitySignals?.wcagViolations ?? [];
  const adaFindings = [
    typeof wcagErrorCountTotal === "number" && wcagErrorCountTotal > 0
      ? buildObservedCountLensFinding({
          count: wcagErrorCountTotal,
          evidence: wcagViolations.length > 0 ? { violations: wcagViolations } : null,
          id: "wcag_error_count_total",
          label: `Automated WCAG issues detected: ${wcagErrorCountTotal}`,
          metric: "wcagErrorCountTotal",
          source: "accessibility_signals"
        })
      : null,
    typeof wcagKeyboardNavigationIssueCount === "number" && wcagKeyboardNavigationIssueCount > 0
      ? buildObservedCountLensFinding({
          count: wcagKeyboardNavigationIssueCount,
          id: "wcag_keyboard_navigation_issue_count",
          label: "Keyboard navigation issues surfaced",
          metric: "wcagKeyboardNavigationIssueCount",
          source: "accessibility_signals"
        })
      : null,
    typeof wcagFormLabelErrorCount === "number" && wcagFormLabelErrorCount > 0
      ? buildObservedCountLensFinding({
          count: wcagFormLabelErrorCount,
          id: "wcag_form_label_error_count",
          label: "Form labeling issues surfaced",
          metric: "wcagFormLabelErrorCount",
          source: "accessibility_signals"
        })
      : null,
    accessibilityStatementPresent === false
      ? buildRegulatoryLensFinding({
          evidence: { observed: false, signal: "accessibilityStatementPresent" },
          id: "accessibility_statement_not_detected",
          label: "Accessibility statement not detected"
        })
      : null,
    accessibilityClaimMismatchDetected === true
      ? buildRegulatoryLensFinding({
          evidence: { observed: true, signal: "accessibilityClaimMismatchDetected" },
          id: "accessibility_claim_mismatch",
          label: "Accessibility claim mismatch surfaced"
        })
      : null,
    typeof accessibilityLitigationRiskScore === "number" && accessibilityLitigationRiskScore >= 45
      ? buildObservedCountLensFinding({
          count: accessibilityLitigationRiskScore,
          id: "accessibility_litigation_risk_score",
          label: `Elevated accessibility risk score (${accessibilityLitigationRiskScore})`,
          metric: "accessibilityLitigationRiskScore",
          source: "accessibility_signals"
        })
      : null,
    typeof adaDemandLetterProbability === "number" && adaDemandLetterProbability >= 45
      ? buildObservedCountLensFinding({
          count: adaDemandLetterProbability,
          id: "ada_demand_letter_probability",
          label: `Elevated ADA demand-letter exposure score (${adaDemandLetterProbability})`,
          metric: "adaDemandLetterProbability",
          source: "accessibility_signals"
        })
      : null,
    typeof wcagMissingAltCount === "number" && wcagMissingAltCount >= 5
      ? buildObservedCountLensFinding({
          count: wcagMissingAltCount,
          id: "wcag_missing_alt_count",
          label: `${wcagMissingAltCount} missing alt-text issues surfaced`,
          metric: "wcagMissingAltCount",
          source: "accessibility_signals"
        })
      : null,
    ...normalizedAgencyFindingLabels.map((label, index) =>
      buildRegulatoryLensFinding({
        evidence: {
          agencyKey: dojAdaMapping?.agencyKey ?? "doj_ada",
          label,
          source: "agency_mapping"
        },
        id: `agency_signal_${index}`,
        label
      })
    ),
    ...((dojAdaMapping?.contributingSubscores ?? []).map((subscore) =>
      buildRegulatoryLensFinding({
        evidence: {
          key: subscore.key,
          label: subscore.label,
          score: subscore.score,
          source: "agency_mapping_subscore"
        },
        id: `agency_subscore_${subscore.key}`,
        label: `${subscore.label} subscore ${subscore.score}`
      })
    ))
  ].filter((item): item is RegulatoryLensFinding => Boolean(item));

  const adaScore = clampScore(100 - (accessibilityRiskScore ?? (dojAdaMapping?.relevanceLevel === "limited" ? 35 : 50)));
  const hasAccessibilityDisclosureGap =
    accessibilityClaimMismatchDetected === true ||
    normalizedAgencyFindingLabels.some((label) => /disclosure|claim/i.test(label));
  const adaSummary =
    accessibilityClaimMismatchDetected === true
      ? "Accessibility claims appear inconsistent with observed barriers."
      : (typeof wcagErrorCountTotal === "number" && wcagErrorCountTotal >= 1) ||
          (typeof wcagKeyboardNavigationIssueCount === "number" && wcagKeyboardNavigationIssueCount > 0) ||
          (typeof wcagFormLabelErrorCount === "number" && wcagFormLabelErrorCount > 0)
        ? hasAccessibilityDisclosureGap
          ? "Accessibility barriers and disclosure gaps are the main review area."
          : "Automated accessibility signals are the main review area."
        : adaScore >= 72
          ? "No significant issues found."
          : hasAccessibilityDisclosureGap
            ? "Accessibility support and disclosure posture needs work."
            : "Automated accessibility signals are the main review area.";
  const adaTone = buildTone(adaScore);

  lenses.push({
    acronym: "DOJ / ADA accessibility",
    detailTitle: "Accessibility and digital access issues",
    findings: adaFindings,
    ratingLabel: adaTone.label,
    score: adaScore,
    summary: adaSummary,
    toneClass: adaTone.toneClass
  });

  const financialClaimsLens = buildFinancialClaimsLens({
    findings: financialClaimFindings,
    forceScored: financialRegulatoryBenchmarkActive
  });
  if (financialClaimsLens) {
    lenses.push(financialClaimsLens);
  }

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
  const hasDojAdaMapping = options?.agencyMappings?.some((mapping) => mapping.agencyKey === "doj_ada") === true;
  const accessibilityOptions =
    hasRepresentativeAccessibilityEvidence
      ? {
          ...options,
          accessibilitySignals: {
            ...(options?.accessibilitySignals ?? {}),
            wcagErrorCountTotal:
              options?.accessibilitySignals?.wcagErrorCountTotal ??
              Math.max(representativeAccessibilityCoverage.representativeExampleCount, representativeAccessibilityPackets.length)
          },
          agencyMappings: [
            ...(hasDojAdaMapping
              ? (options?.agencyMappings ?? []).map((mapping) =>
                  mapping.agencyKey === "doj_ada"
                    ? {
                        ...mapping,
                        triggeredSignals: [
                          ...mapping.triggeredSignals,
                          {
                            key: "accessibility.representative_axe_examples",
                            label: representativeAccessibilitySummary ?? "Representative axe examples retained"
                          }
                        ],
                        topAgencyRiskDrivers: [
                          ...mapping.topAgencyRiskDrivers,
                          representativeAccessibilitySummary ?? "Representative automated accessibility examples were retained."
                        ]
                      }
                    : mapping
                )
              : [
                  ...(options?.agencyMappings ?? []),
                  {
                    agencyKey: "doj_ada",
                    agencyLabel: "U.S. Department of Justice ADA",
                    shortLabel: "DOJ / ADA",
                    category: "accessibility",
                    relevanceLevel: "moderate",
                    relevanceScore: 64,
                    rationale: "Representative automated accessibility examples were retained for surfaced ADA/WCAG review.",
                    helperLabel: "Accessibility evidence retained",
                    triggeredSignals: [
                      {
                        key: "accessibility.representative_axe_examples",
                        label: representativeAccessibilitySummary ?? "Representative axe examples retained"
                      }
                    ],
                    contributingSubscores: [{ key: "accessibility_examples", label: "Representative accessibility examples", score: 64 }],
                    topAgencyRiskDrivers: [
                      representativeAccessibilitySummary ?? "Representative automated accessibility examples were retained."
                    ],
                    relatedOverallRiskLevel: "moderate",
                    isPrimaryAgency: false
                  } satisfies AgencyMapping
                ])
          ]
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
          </span>
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 shadow-sm transition-colors hover:border-slate-400 hover:text-slate-700">
            <span className="sr-only">Show evidence JSON</span>
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M8 4 4 12l4 8" />
              <path d="M16 4l4 8-4 8" />
              <path d="M14 3 10 21" />
            </svg>
          </span>
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

function BenchmarkMetricCard(input: {
  actualValue: number | null;
  benchmarkValue: number | null;
  benchmarkIndustry?: string | null;
  label: string;
  maxValue?: number;
  note?: string | null;
}) {
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
      ? input.label === "Overall score"
        ? `${delta > 0 ? "+" : ""}${delta} vs expected${benchmarkContext}`
        : delta > 0
          ? `+${delta} above expected${benchmarkContext}`
          : delta < 0
            ? `${Math.abs(delta)} below expected${benchmarkContext}`
            : `At expected level${benchmarkContext}`
      : null;
  const actualLabel =
    actualValue === null
      ? "No value retained"
      : input.label === "Overall score"
        ? `${actualValue}/100 overall score`
        : `${actualValue} ${input.label.toLowerCase()}`;
  const tone =
    input.label === "Overall score"
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
  const benchmarkTooltip = [benchmarkTooltipBase, input.note].filter(Boolean).join(" ");

  return (
    <div className={`relative overflow-visible rounded-[1.6rem] border border-slate-200 px-5 py-4 ${tone.card}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
          {input.label === "Overall score" ? (
            <>
              Overall
              <br />
              score
            </>
          ) : input.label === "Third-party requests" ? (
            <>
              Third-party
              <br />
              requests
            </>
          ) : (
            input.label
          )}
        </p>
        <span className="inline-flex items-center gap-1">
          <span className="sr-only">{benchmarkValue !== null ? `Expected ${benchmarkValue}` : "Expected benchmark unavailable"}</span>
          {benchmarkTooltip ? <InfoTip align="end" placement="bottom" text={benchmarkTooltip} /> : null}
        </span>
      </div>
      <div className="mt-5">
        <div className="flex items-end gap-1">
          <span className={`text-[3.2rem] font-semibold leading-none tracking-tight ${tone.value}`}>{actualValue ?? "—"}</span>
          {input.maxValue ? <span className="pb-1 text-[2rem] leading-none text-slate-500">/100</span> : null}
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-600">{actualLabel}</p>
      </div>
      <div className="mt-5 space-y-2">
        <div className={`relative h-3 rounded-full ${tone.rail}`}>
          <div
            className={`absolute left-0 top-0 h-3 rounded-full ${tone.fill}`}
            style={{ width: `${Math.max(actualRatio * 100, actualValue === null ? 0 : 6)}%` }}
          />
          {benchmarkRatio !== null ? (
            <div
              className={`absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${tone.marker}`}
              style={{ left: `${benchmarkRatio * 100}%` }}
            />
          ) : null}
        </div>
        <div className={`h-4 text-[11px] ${deltaClassName}`} aria-hidden="true" />
      </div>
    </div>
  );
}

export function deriveBenchmarkScoreExplanation(input: {
  benchmark: DomainBenchmarkCardData;
  findings: CertScoreFinding[];
  score: number | null;
  vendorNames?: string[];
}) {
  if (!input.benchmark || typeof input.score !== "number") {
    return null;
  }

  const delta = input.score - input.benchmark.expectedOverallScore;
  const findingIds = new Set(input.findings.map((finding) => finding.id));
  const drivers = [
    findingIds.has("pre_consent_tracking_detected") || findingIds.has("third_party_tracking_pre_consent")
      ? "tracking before consent"
      : null,
    findingIds.has("third_party_cookie_pre_consent") ||
    findingIds.has("analytics_cookie_pre_consent") ||
    findingIds.has("adtech_cookie_pre_consent")
      ? "pre-consent tracking cookies"
      : null,
    findingIds.has("rtb_cookie_sync_observed") ? "RTB cookie-sync activity" : null,
    findingIds.has("policy_behavior_contradiction_detected") ||
    findingIds.has("policy_clarity_risk") ||
    findingIds.has("cookie_disclosure_gap")
      ? "a policy/runtime review issue"
      : null,
    findingIds.has("reject_tracking_persists_after_reject") ? "post-reject tracking activity" : null,
    findingIds.has("reject_option_missing_or_hidden") ||
    findingIds.has("asymmetric_consent_ui") ||
    findingIds.has("consent_dark_patterns_detected") ||
    findingIds.has("forced_consent_interaction")
      ? "consent choice interface signals"
      : null,
    findingIds.has("session_recording_services_detected") ||
    findingIds.has("possible_session_replay_on_sensitive_input_surface")
      ? "session replay activity"
      : null,
    findingIds.has("probable_fingerprinting") || findingIds.has("fingerprinting_related_signals_observed")
      ? "fingerprinting-related telemetry"
      : null,
    Array.from(findingIds).some((id) => /accessibility|wcag|contrast|keyboard|screen_reader|missing_alt|form_label|focus/.test(id))
      ? "accessibility"
      : null
  ];
  const driverText = formatInlineList(uniqueStrings(drivers).slice(0, 4));
  const vendorNames = uniqueStrings(input.vendorNames ?? []).slice(0, 3);
  const promotedPrivacyDriverCount = drivers
    .filter((driver): driver is string => typeof driver === "string")
    .filter((driver) => driver !== "accessibility").length;
  const onlyAccessibilityPromoted = promotedPrivacyDriverCount === 0 && drivers.includes("accessibility");
  const vendorText =
    vendorNames.length > 0 && promotedPrivacyDriverCount > 0
      ? ` Representative observed vendors included ${formatInlineList(vendorNames)}.`
      : "";
  const retainedPrivacyContextText =
    onlyAccessibilityPromoted && vendorNames.length > 0
      ? " Third-party and cookie context was retained for review but did not promote to a top-level privacy finding."
      : "";
  const hasConsentUxReviewFinding =
    findingIds.has("reject_option_missing_or_hidden") ||
    findingIds.has("asymmetric_consent_ui") ||
    findingIds.has("forced_consent_interaction") ||
    findingIds.has("consent_dark_patterns_detected") ||
    findingIds.has("blocking_overlay_observed") ||
    findingIds.has("content_obstructed_by_overlay") ||
    findingIds.has("repeated_consent_prompt");
  const consentUxBenchmarkNote =
    hasConsentUxReviewFinding && delta >= -3
      ? " Overall score remains near benchmark, but consent UX findings require review."
      : "";

  if (delta < 0) {
    if (delta >= -3) {
      return driverText
        ? `This score is near the ${input.benchmark.industry} benchmark expectation, with retained review context concentrated in ${driverText}.${consentUxBenchmarkNote}`
        : `This score is near the ${input.benchmark.industry} benchmark expectation for the retained evidence.${consentUxBenchmarkNote}`;
    }

    return driverText
      ? `${sentenceWithPeriod(
          `This score is below the ${input.benchmark.industry} benchmark expectation mainly because retained evidence showed ${driverText}`
        )}${retainedPrivacyContextText}${vendorText}`
      : `This score is below the ${input.benchmark.industry} benchmark expectation based on surfaced findings.`;
  }

  if (delta > 0) {
    return driverText
      ? `This score is above the ${input.benchmark.industry} benchmark expectation, with remaining review context concentrated around ${driverText}.${consentUxBenchmarkNote}`
      : `This score is above the ${input.benchmark.industry} benchmark expectation for the retained evidence.${consentUxBenchmarkNote}`;
  }

  return driverText
    ? `This score is in line with the ${input.benchmark.industry} benchmark expectation, with review context concentrated around ${driverText}.${consentUxBenchmarkNote}`
    : `This score is in line with the ${input.benchmark.industry} benchmark expectation.${consentUxBenchmarkNote}`;
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

function BenchmarkScoreNote({ message }: { message: string }) {
  return (
    <details className="group rounded-[1rem] border border-slate-200 bg-white/85 px-4 py-3 text-sm leading-6 text-slate-700">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="line-clamp-2 min-w-0 group-open:line-clamp-none">
          <span className="font-semibold text-slate-950">Score note:</span>{" "}
          {message}
        </span>
        <span className="shrink-0 text-slate-400 transition-transform group-open:rotate-180">⌄</span>
      </summary>
    </details>
  );
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

  if (finding.id === "asymmetric_consent_ui" || finding.id === "consent_dark_patterns_detected") {
    return {
      href: "https://www.ftc.gov/system/files/ftc_gov/pdf/P214800%20Dark%20Patterns%20Report%209.14.2022%20-%20FINAL.pdf",
      label: "FTC guidance on dark patterns"
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
    finding.id === "asymmetric_consent_ui"
  ) {
    const consentUiEvidence = details.consentUiEvidence;
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

function buildEvidenceBasisCopy(finding: CertScoreFinding) {
  const details = finding.evidenceDetails;
  if (!details) {
    return null;
  }

  if (finding.id === "pre_consent_tracking_detected") {
    const firstRequestMs = details.timing?.firstThirdPartyTrackingRequestMs;
    const vendors = (details.vendors ?? []).map((vendor) => vendor.name).filter(Boolean).slice(0, 3);
    const consentText = details.consentState?.userConsentActionObserved
      ? "Observed before the recorded consent choice in the retained timing sequence."
      : "No accept, reject, manage, or close interaction was recorded before the retained request evidence.";
    const timingText = typeof firstRequestMs === "number"
      ? ` First classified non-essential/tracker request timestamp: ${firstRequestMs}ms.`
      : "";
    const vendorText = vendors.length > 0 ? ` Representative vendors: ${formatInlineList(vendors)}.` : "";
    return `Observed runtime behavior: ${consentText}${timingText}${vendorText} Automated runtime observation supports review; it is not a legal determination.`;
  }

  if (
    finding.id === "consent_dark_patterns_detected" ||
    finding.id === "reject_option_missing_or_hidden" ||
    finding.id === "asymmetric_consent_ui"
  ) {
    return "Observed runtime behavior: The retained consent interaction structure shows reject was not available on the first layer. Retained evidence suggests consent UX review; it is not a legal determination.";
  }

  if (
    finding.id === "third_party_cookie_pre_consent" ||
    finding.id === "analytics_cookie_pre_consent" ||
    finding.id === "adtech_cookie_pre_consent"
  ) {
    const cookieEvidence = details.cookieEvidence;
    const hasDirectCookieTimingEvidence =
      hasRecords(cookieEvidence?.cookieWriteEvidence) || hasRecords(cookieEvidence?.storageEvidence);
    if (cookieEvidence) {
      return hasDirectCookieTimingEvidence
        ? "Cookie timing evidence was retained directly for this finding. Partial means some timing evidence was retained directly, while related vendor/request attribution may be aggregated or unavailable."
        : "Partial means some timing evidence was retained directly, while related vendor/request attribution may be aggregated or unavailable.";
    }
  }

  return null;
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
      confidenceBadge: "border-slate-200 bg-white text-slate-700",
      summary: "border-slate-200 bg-white text-slate-900"
    };
  }

  if (criticalityBadge === "high") {
    return {
      card: "border-slate-200 bg-[linear-gradient(180deg,rgba(252,252,251,0.82),rgba(255,255,255,1))]",
      band: "bg-slate-200",
      severityBadge: "border-slate-200 bg-slate-50 text-slate-800",
      confidenceBadge: "border-slate-200 bg-white text-slate-700",
      summary: "border-slate-200 bg-slate-50/65 text-slate-900"
    };
  }

  return {
    card: "border-slate-200 bg-white",
    band: "bg-slate-200",
    severityBadge: "border-slate-200 bg-slate-50 text-slate-700",
    confidenceBadge: "border-slate-200 bg-white text-slate-700",
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
  | "hidden-choice"
  | "split-choice"
  | "hand-stop"
  | "policy-sync"
  | "document-clarity"
  | "ad-exchange"
  | "default-circle";

function getPreferredFindingTitleIconKeys(findingId: string): FindingTitleIconKey[] {
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
    case "cpra_cba_opt_out_missing":
      return ["privacy-choice", "shield-balance", "ad-exchange"];
    case "session_recording_services_detected":
      return ["video-capture", "shield-video"];
    case "possible_session_replay_on_sensitive_input_surface":
      return ["shield-video", "video-capture"];
    case "sensitive_data_collection_with_third_party_tracking_present":
      return ["shield-network", "shield-video", "device-telemetry"];
    case "consent_dark_patterns_detected":
      return ["shield-balance", "circle-x"];
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
    case "policy_clarity_risk":
      return ["document-clarity", "policy-sync", "default-circle"];
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

function FindingTitleIcon(input: { finding: CertScoreFinding; iconKey?: FindingTitleIconKey }) {
  const common = "h-4 w-4";
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

  if (iconKey === "ad-exchange") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-rose-600`} aria-hidden="true">
        <path d="M5 8h8.5M10.5 4 14 8l-3.5 4M19 16h-8.5M13.5 12 10 16l3.5 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="5" cy="8" r="1.4" fill="currentColor" />
        <circle cx="19" cy="16" r="1.4" fill="currentColor" />
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

function FindingDetailDisclosure(input: { finding: CertScoreFinding }) {
  const reference = getFindingReferenceLink(input.finding);
  const registryContext = getFindingRegulatoryContext(input.finding.id);
  const registryGuideHref = registryContext ? `/findings/${input.finding.id}` : null;
  const evidencePayload = buildFindingEvidenceJsonPayload(input.finding);
  const compactedEvidencePayload = compactEvidenceJsonForDisplay(evidencePayload);
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
  const evidenceBasisItems = buildEvidenceBasisItems(input.finding);
  const evidenceBasisCopy = buildEvidenceBasisCopy(input.finding);

  return (
    <details id={getFindingEvidenceAnchor(input.finding)} className={`group mt-3 scroll-mt-24 rounded-xl border px-3 py-2 ${tone.summary}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-medium leading-5">
        <span className="line-clamp-2 min-w-0 group-open:line-clamp-none">{input.finding.shortSummary}</span>
        <span className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Why this matters</p>
          <p className="text-sm leading-6 text-slate-700">{input.finding.whyItMatters}</p>
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Review and remediation starting points</p>
          <p className="text-sm leading-6 text-slate-700">{getFindingFixText(input.finding)}</p>
          {registryGuideHref ? (
            <a
              href={registryGuideHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-sm font-medium text-sky-700 underline decoration-sky-200 underline-offset-4 hover:text-sky-800"
            >
              Learn how CertScore interprets this finding
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
        {evidenceBasisItems.length > 0 ? (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Evidence basis</p>
              {evidenceBasisCopy ? <p className="text-sm leading-6 text-slate-700">{evidenceBasisCopy}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {evidenceBasisItems.map((item) => (
                <span
                  key={`${item.label}:${item.status}`}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${getEvidenceBasisTone(item.status)}`}
                  title={`${item.label}: ${item.status}`}
                >
                  <span>{item.label}</span>
                  <span aria-hidden="true">·</span>
                  <span>{item.status}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {jsonPayload ? (
          <details
            className="group/json min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5"
            suppressHydrationWarning
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
              <span>Evidence details</span>
              <span className="text-slate-400 transition-transform group-open/json:rotate-180">⌄</span>
            </summary>
            <EvidenceJsonBlock
              payload={jsonPayload}
              className="relative mt-3 min-w-0 max-w-full overflow-hidden rounded-lg bg-slate-950"
              preClassName="max-w-full whitespace-pre-wrap break-words px-3 py-3 pr-12 text-xs leading-5 text-slate-100"
            />
          </details>
        ) : null}
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

  if (typeof findingCount !== "number" || findingCount === input.beforeConsentCookieCount) {
    return null;
  }

  return "Executive metric includes all retained cookie timing records; this finding shows the subset attributed to tracking/storage evidence.";
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
        /reject|confirmed|not_reduced|contradiction/i.test(flag)
      ),
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
      vendors: (details.vendors ?? []).slice(0, 5).map((vendor) =>
        compactObject(vendor, ["name", "category", "preConsent", "firstSeenMs", "representativeUrl"])
      ),
      representativeRequests: compactRepresentativeRequests(details.representativeRequests) ?? [],
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
  coverageMicrocards?: Array<{
    label: string;
    tooltip?: string | null;
    tone?: "amber" | "slate";
  }> | null;
  coverageDiagnosticIndicators?: CoverageDiagnosticIndicator[] | null;
  coverageLevel?: string | null;
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
  scanOutcome?: string | null;
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
  scanInterruptions?: ExecutiveScanInterruption[] | null;
  verifiedPublicSurfacesCount?: number | null;
  lightweightHeroMetrics?: Array<{
    accent?: "sky" | "amber" | "emerald" | "slate";
    helper?: string | null;
    label: string;
    value: number | string | null;
  }> | null;
}) {
  const suppressedTopFindingIds = new Set([
    "multi_vendor_tracking_detected",
    "large_third_party_footprint",
    "collection_endpoints_detected",
    "high_request_density"
  ]);
  const categorySummary = Object.entries(input.vendorCategoryCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([key, count]) => `${formatCategoryLabel(key)} ${count}`)
    .join(" · ");
  const filteredTopFindings = input.topFindings.filter((finding) => !suppressedTopFindingIds.has(finding.id));
  const topFindingIconKeys = assignUniqueFindingTitleIconKeys(filteredTopFindings);
  const regulatoryFindingInput =
    Array.isArray(input.allFindings) && input.allFindings.length > 0 ? input.allFindings : input.topFindings;
  const cookieCountMismatchNote = getCookieCountMismatchNote({
    beforeConsentCookieCount: input.beforeConsentCookieCount,
    findings: regulatoryFindingInput
  });
  const executiveHeadlineFindings = filteredTopFindings.slice(0, 3).map((finding) => {
    const display = getPublicReportFindingDisplayForCertFinding(finding);
    return {
      ...finding,
      label: display.title,
      severity: display.criticality
    };
  });
  const hasScrollableTopFindings = filteredTopFindings.length > 3;
  const namedVendors = uniqueStrings(input.resolvedVendorNames).slice(0, 8);
  const thirdPartyDomains = input.thirdPartyDomains.slice(0, 10);
  const vendorMixDetails = input.topObservedEntities
    .slice(0, 6)
    .map((entity) => `${entity.label} · ${formatCategoryLabel(entity.category)} · ${entity.requestCount} req`);
  const fingerprintEvidence = input.fingerprintReasons.filter(Boolean);
  const hasProbableFingerprintingFinding = regulatoryFindingInput.some((finding) => finding.id === "probable_fingerprinting");
  const shouldShowFingerprintSnapshot =
    fingerprintEvidence.length > 0 || input.fingerprintLabel !== "None detected";
  const vendorEvidence = [
    ...namedVendors,
    ...input.unresolvedVendorHosts.slice(0, Math.max(0, 8 - namedVendors.length))
  ];
  const trackerFootprintDetailSummary = formatTrackerFootprintSummary({
    thirdPartyDomainCount: input.thirdPartyDomains.length,
    vendorCount: namedVendors.length
  });
  const trackerFootprintExpandLabel = formatTrackerFootprintExpandLabel({
    thirdPartyDomainCount: input.thirdPartyDomains.length,
    vendorCount: namedVendors.length
  });
  const domainTruncationNote =
    thirdPartyDomains.length < input.thirdPartyDomains.length
      ? `Showing ${thirdPartyDomains.length} of ${input.thirdPartyDomains.length} observed domains.`
      : null;
  const policySurfaces = input.policySurfaces ?? [];
  const policySurfaceSummary = formatPolicySurfaceSummary(policySurfaces);
  const policySurfaceLabelsByUrl = buildPolicySurfaceSharedUrlLabels(policySurfaces);
  const scanInterruptions = input.scanInterruptions ?? [];
  const displayState = deriveExecutiveDisplayState({
    beforeConsentCookieCount: input.beforeConsentCookieCount,
    coverageLevel: input.coverageLevel,
    domainBenchmark: input.domainBenchmark,
    policySurfaces,
    posture: input.posture,
    scanInterruptions,
    scanOutcome: input.scanOutcome,
    thirdPartyDomains: input.thirdPartyDomains,
    thirdPartyRequestCount: input.thirdPartyRequestCount,
    topFindingCount: filteredTopFindings.length,
    vendorCount: vendorEvidence.length
  });
  const coverageCalloutMicrocards = [
    ...(input.coverageMicrocards ?? []),
    ...(input.coverageDiagnosticIndicators ?? []).map((indicator) => ({
      label: indicator.label,
      tooltip: indicator.message,
      tone: "amber" as const
    }))
  ];
  const hasMeaningfulInterruption = hasMeaningfulExecutiveInterruption({ scanInterruptions });
  const hasProtectedRouteInterruption = scanInterruptions.some((interruption) =>
    /protected route|protected or unavailable|authentication|auth|forbidden|restricted/i.test(
      `${interruption.label} ${interruption.details.join(" ")}`
    )
  );
  const scanMarkedIncomplete = /incomplete|partial|interrupted|degraded/i.test(`${input.status ?? ""} ${input.scanOutcome ?? ""}`);
  const shouldShowHomepageRetainedQualifier =
    scanMarkedIncomplete && filteredTopFindings.length > 0 && (hasProtectedRouteInterruption || hasMeaningfulInterruption);
  const pagesScanned = typeof input.pagesScanned === "number" ? input.pagesScanned : 0;
  const retainedFindingCount = Math.max(input.topFindings.length, input.allFindings?.length ?? 0);
  const policyEnrichmentCount = input.policyEnrichmentCount ?? 0;
  const hasMaterialRetainedCoverage =
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
    scanInterruptions.some((interruption) =>
      /protected route/i.test(`${interruption.label} ${interruption.details.join(" ")}`)
    );
  const hasIncompleteCoverageNotice =
    !hasProtectedRouteOnlyPartialCoverage &&
    (
      (displayState === "Limited review" && !hasMaterialRetainedCoverage) ||
      hasHardCoverageLimit ||
      (!hasMaterialRetainedCoverage &&
        (input.coverageLevel === "limited_partial" ||
          Boolean(input.scanOutcome && /partial|incomplete|degraded/i.test(input.scanOutcome))))
    );
  const executiveHeadline = input.accessLimitationNotice
    ? input.accessLimitationNotice.message
    : formatTopFindingHeadline(executiveHeadlineFindings);
  const narrativePresentation = deriveExecutiveNarrativePresentation({
    accessLimitationNotice: input.accessLimitationNotice,
    executiveHeadline,
    finalHost: input.finalHost,
    coverageLevel: input.coverageLevel,
    legalCoverageScore: input.legalCoverageScore,
    pagesScanned: input.pagesScanned,
    displayState,
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
  const regulatoryCounts = {
    beforeConsentCookieCount: input.beforeConsentCookieCount,
    thirdPartyRequestCount: input.thirdPartyRequestCount
  };
  const regulatoryOptions = {
    accessibilitySignals: input.accessibilitySignals,
    agencyMappings: input.agencyMappings,
    benchmarkIndustry: input.domainBenchmark?.industry ?? null,
    regulatoryRisk: input.regulatoryRisk
  };
  const regulatoryLenses = input.unifiedFindings
    ? buildRegulatoryLensesFromUnifiedPackets(input.unifiedFindings, regulatoryCounts, regulatoryOptions)
    : buildRegulatoryLenses(regulatoryFindingInput, regulatoryCounts, regulatoryOptions);
  const benchmarkScoreExplanation = deriveBenchmarkScoreExplanation({
    benchmark: input.domainBenchmark,
    findings: regulatoryFindingInput,
    score: input.score,
    vendorNames: uniqueStrings([
      ...getRepresentativeVendorsFromFindings(filteredTopFindings),
      ...input.preConsentVendorNames,
      ...input.sessionReplayVendorNames,
      ...input.resolvedVendorNames
    ])
  });

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_18px_60px_-32px_rgba(15,23,42,0.18)]">
      <div
        className="grid items-stretch gap-6 px-6 py-6 lg:grid-cols-[1.35fr_0.9fr] lg:px-8"
        data-executive-summary-layout
      >
        <div className="flex flex-col gap-5 lg:min-h-0">
          <div className="rounded-[1.8rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,1))] p-5 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.28)]">
            <div className="flex flex-wrap items-center gap-3">
              <span
                data-testid="executive-posture-badge"
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] ${getPostureClasses(displayState)}`}
              >
                {displayState}
              </span>
              {input.domainBenchmark ? (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600">
                  Benchmark: {input.domainBenchmark.industry}
                </span>
              ) : null}
            </div>
            <div className="mt-5 space-y-3">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Executive readout</p>
                <h2
                  data-testid="executive-headline"
                  className="max-w-3xl text-[2rem] font-semibold leading-tight tracking-tight text-slate-950 lg:text-[2.5rem]"
                >
                  {narrativePresentation.headline}
                </h2>
                {shouldShowHomepageRetainedQualifier ? (
                  <p className="max-w-3xl text-sm leading-6 text-slate-600">
                    Homepage evidence was retained; some non-homepage routes were protected or unavailable.
                  </p>
                ) : null}
              </div>
              <div
                data-testid="executive-summary-callout"
                className="rounded-[1.2rem] border border-slate-200 bg-white/90 px-4 py-3 text-sm leading-6 text-slate-700"
              >
                <span className="font-medium text-slate-950">{narrativePresentation.summaryLabel}</span>{" "}
                {narrativePresentation.summaryMessage}
                {coverageCalloutMicrocards.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {coverageCalloutMicrocards.map((card) => (
                      <span
                        key={card.label}
                        aria-label={card.tooltip ?? card.label}
                        title={card.tooltip ?? undefined}
                        className={
                          card.tone === "amber"
                            ? "inline-flex rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-950"
                            : "inline-flex rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
                        }
                      >
                        {card.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {input.accessLimitationNotice ? null : input.lightweightHeroMetrics && input.lightweightHeroMetrics.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-3">
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
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <BenchmarkMetricCard
                  label="Overall score"
                  actualValue={input.score}
                  benchmarkValue={input.domainBenchmark?.expectedOverallScore ?? null}
                  benchmarkIndustry={input.domainBenchmark?.industry ?? null}
                  maxValue={100}
                />
                <BenchmarkMetricCard
                  label="Third-party requests"
                  actualValue={input.thirdPartyRequestCount}
                  benchmarkValue={input.domainBenchmark?.expectedThirdPartyRequests ?? null}
                  benchmarkIndustry={input.domainBenchmark?.industry ?? null}
                />
                <BenchmarkMetricCard
                  label="Cookies before consent"
                  actualValue={input.beforeConsentCookieCount}
                  benchmarkValue={input.domainBenchmark?.expectedCookiesBeforeConsent ?? null}
                  benchmarkIndustry={input.domainBenchmark?.industry ?? null}
                  note={cookieCountMismatchNote}
                />
              </div>
              {benchmarkScoreExplanation ? (
                <BenchmarkScoreNote message={benchmarkScoreExplanation} />
              ) : null}
            </div>
          )}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Top findings</p>
                <h2 data-testid="executive-findings-heading" className="text-2xl font-semibold tracking-tight text-slate-950 lg:text-[2.2rem]">
                  {narrativePresentation.findingsHeading}
                </h2>
              </div>
            </div>
          </div>

          <div
            className={
              hasScrollableTopFindings
                ? "grid gap-3 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable] lg:min-h-0"
                : "grid gap-3"
            }
            data-executive-top-findings-list
            data-testid="executive-top-findings-list"
          >
            {hasScrollableTopFindings ? <TopFindingsHeightSync /> : null}
            <FindingHashFocus />
            {filteredTopFindings.length > 0 ? (
              filteredTopFindings.map((finding, index) => {
                const iconKey = topFindingIconKeys.get(finding.id) ?? getFindingTitleIconKey(finding.id);
                const densityBenchmark = getFindingDensityBenchmark(finding.id);
                const display = getPublicReportFindingDisplayForCertFinding(finding);
                const criticalityBadge = display.criticality;
                const cardTone = getFindingCardTone(finding, index === 0, criticalityBadge);
                return (
                <div key={finding.id} className={`overflow-hidden rounded-[1.4rem] border shadow-[0_12px_35px_-26px_rgba(15,23,42,0.18)] ${cardTone.card}`}>
                  <div className={`h-1 w-full ${cardTone.band}`} />
                  <div className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                      {getFindingTypeLabel(finding)}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${cardTone.severityBadge}`}>
                      {criticalityBadge}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${cardTone.confidenceBadge}`}>
                      {getEvidenceConfidenceLabel(finding.confidence)}
                      <InfoTip
                        align="start"
                        placement="bottom"
                        text={getPublicReportConfidenceDefinition({
                          confidence: finding.confidence,
                          findingId: finding.id,
                          section: finding.section
                        })}
                      />
                    </span>
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
                  <div className="mt-2.5 flex items-start gap-2.5">
                      <div
                        data-finding-icon={iconKey}
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50"
                      >
                      <FindingTitleIcon finding={finding} iconKey={iconKey} />
                    </div>
                    <p data-testid="executive-finding-label" className="pt-0.5 text-[17px] font-semibold leading-5 tracking-[-0.02em] text-slate-950">
                      {display.title}
                    </p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{getRecommendedNextStep(finding)}</p>
                  <FindingDetailDisclosure finding={finding} />
                </div>
                </div>
                );
              })
            ) : (
              <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {displayState === "Limited review"
                  ? "No headline homepage issue was confirmed from retained evidence. Review coverage limitations and retained signals before treating this scan as clean."
                  : "No headline issue crossed the executive threshold for this scan. Review the supporting evidence below for lower-priority signals and scan context."}
              </div>
            )}
          </div>
        </div>

        <div
          className="space-y-4 rounded-[1.7rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(241,245,249,0.72))] p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.22)]"
          data-executive-snapshot-pane
        >
          {input.accessLimitationNotice ? (
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
            <>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Signal snapshot</p>
              </div>
              <div className="space-y-3">
                <div id="tracker-footprint" className="scroll-mt-24 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Review lenses</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Findings organized by privacy, consumer protection, and accessibility review context. Automated signals for review, not a legal determination.
                  </p>
                  {hasIncompleteCoverageNotice ? (
                    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                      This scan has incomplete coverage. Treat missing or low-confidence results as unresolved until a complete rescan confirms them.
                    </p>
                  ) : null}
                  <div className="mt-3 space-y-3">
                    {regulatoryLenses.map((lens) => (
                      <details
                        key={lens.acronym}
                        id={getRegulatoryLensAnchor(lens.acronym)}
                        className="group scroll-mt-24 rounded-xl border border-slate-200 bg-slate-50/75 px-3 py-3"
                      >
                        <summary className="relative grid cursor-pointer list-none grid-cols-[1fr_auto] gap-x-3 gap-y-2">
                          <span className="min-w-0 self-start">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">{lens.acronym}</span>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${lens.toneClass}`}>
                                {lens.ratingLabel}
                              </span>
                            </span>
                          </span>
                          <span className="shrink-0 self-start text-right">
                            <span className="block text-xl font-semibold tracking-tight text-slate-900">{lens.score ?? "—"}</span>
                            {typeof lens.score === "number" ? (
                              <RegulatoryRatingBar score={lens.score} toneClass={lens.toneClass} />
                            ) : null}
                          </span>
                          <span className="col-span-2 min-w-0 pr-6 text-xs leading-5 text-slate-600">{lens.summary}</span>
                          <span className="absolute bottom-0 right-0 text-right text-slate-400 transition-transform group-open:rotate-180">⌄</span>
                        </summary>
                        <div className="mt-3 border-t border-slate-200 pt-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{lens.detailTitle}</p>
                          <div className="mt-2 space-y-2">
                            {lens.findings.length > 0 ? (
                              lens.findings.map((item) => (
                                <RegulatoryLensFindingCard
                                  key={`${lens.acronym}-${item.id}-${item.label}`}
                                  finding={item}
                                  lens={lens}
                                />
                              ))
                            ) : (
                              <span className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700">
                                No top-level issue mapped here
                              </span>
                            )}
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
                <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
                  <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Tracker footprint
                    {input.externalCoverageContextAvailable ? (
                      <InfoTip
                        align="end"
                        placement="bottom"
                        text="External public scans may show broader page activity. This is supporting coverage context, not a CertScore-confirmed finding."
                      />
                    ) : null}
                  </p>
                  <p className="mt-2 text-sm text-slate-800">{trackerFootprintDetailSummary}</p>
                  {hasMeaningfulInterruption ? (
                    <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-950">
                      Observed footprint may be incomplete because site protections interrupted runtime collection.
                    </p>
                  ) : null}
                  <DetailDisclosure
                    summary={trackerFootprintExpandLabel}
                    title={namedVendors.length > 0 ? "Observed vendors and domains" : "Observed domains"}
                    items={trackerFootprintExpandLabel ? [...vendorEvidence, ...thirdPartyDomains] : []}
                    truncationNote={domainTruncationNote}
                  />
                </div>
                {policySurfaces.length > 0 ? (
                  <div id="policy-surfaces" className="scroll-mt-24 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Policy Surfaces</p>
                    <p className="mt-2 text-sm text-slate-800">{policySurfaceSummary}</p>
                    <div className="mt-3 space-y-2">
                      {policySurfaces.map((surface) => (
                        <details key={`${surface.pageLabel}:${surface.pageUrl ?? "unknown"}`} className="group rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium text-slate-700">
                            <span>{surface.pageLabel}</span>
                            <span className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
                          </summary>
                          <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                            {surface.pageUrl ? <p className="break-words font-medium text-slate-800">{surface.pageUrl}</p> : null}
                            {surface.pageUrl && (policySurfaceLabelsByUrl.get(surface.pageUrl)?.length ?? 0) > 1 ? (
                              <p>
                                This URL is shared by {formatInlineList(policySurfaceLabelsByUrl.get(surface.pageUrl) ?? [])}.
                              </p>
                            ) : null}
                            {surface.details.length > 0 ? (
                              <ul className="space-y-1">
                                {surface.details.map((detail) => (
                                  <li key={detail}>{detail}</li>
                                ))}
                              </ul>
                            ) : (
                              <p>No additional policy details were retained for this surface.</p>
                            )}
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                ) : null}
                {scanInterruptions.length > 0 ? (
                  <div id="fingerprinting" className="scroll-mt-24 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Scan Interruption</p>
                    <p className="mt-2 text-sm text-slate-800">
                      {scanInterruptions.length} interruption event{scanInterruptions.length === 1 ? "" : "s"} retained
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {hasMeaningfulInterruption
                        ? "Coverage was limited by site protections. Findings shown here are based on retained observable evidence."
                        : "Protected routes were encountered outside the public homepage. Homepage findings are based on observable public-page evidence."}
                    </p>
                    <div className="mt-3 space-y-2">
                      {scanInterruptions.map((event) => (
                        <details key={`${event.label}:${event.details.join("|")}`} className="group rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium text-slate-700">
                            <span>{event.label}</span>
                            <span className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
                          </summary>
                          <div className="mt-3 space-y-1.5 text-xs leading-5 text-slate-600">
                            {event.details.length > 0 ? (
                              event.details.map((detail) => <p key={detail}>{detail}</p>)
                            ) : (
                              <p>No additional interruption details were retained.</p>
                            )}
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                ) : null}
                {shouldShowFingerprintSnapshot ? (
                  <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Fingerprinting</p>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {hasProbableFingerprintingFinding ? "Probable fingerprinting detected" : "No probable fingerprinting detected"}
                    </p>
                    <p className="mt-1 text-sm text-slate-800">
                      {hasProbableFingerprintingFinding
                        ? input.fingerprintNarrative
                        : "Minor fingerprinting indicators retained for review. Insufficient evidence for a probable fingerprinting finding."}
                    </p>
                    <DetailDisclosure
                      summary={`${fingerprintEvidence.length} fingerprint indicators retained`}
                      title="Fingerprint evidence"
                      items={fingerprintEvidence}
                    />
                  </div>
                ) : null}
              </div>
              {categorySummary ? (
                <div id="vendor-mix" className="scroll-mt-24 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Vendor mix</p>
                  <p className="mt-2 text-sm text-slate-800">{categorySummary}</p>
                  <DetailDisclosure
                    summary={`${input.topObservedEntities.length} named entities, ${Object.keys(input.vendorCategoryCounts).length} categories`}
                    title="Category and entity detail"
                    items={[
                      ...Object.entries(input.vendorCategoryCounts).map(([key, count]) => `${formatCategoryLabel(key)} · ${count}`),
                      ...vendorMixDetails,
                      ...input.preConsentVendorNames.slice(0, 3).map((vendor) => `${vendor} · pre-consent`),
                      ...input.sessionReplayVendorNames.slice(0, 3).map((vendor) => `${vendor} · session replay`)
                    ]}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
