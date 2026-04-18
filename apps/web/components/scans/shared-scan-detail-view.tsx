import type { ReactNode } from "react";
import Link from "next/link";
import {
  REPORT_PRIMARY_PILLARS,
  getReportEvidenceCategoriesForSection,
  getReportSectionsForPillar,
  getReportSignalsForEvidenceCategory,
  getReportUnifiedFindingByAlias,
  getReportUnifiedFindingForValidationRule,
  type PreviewScanPayload,
  type PreviewSampleFinding,
  type ReportSignalDefinition,
  type SignalEnrichmentWorkflowStageStatus
} from "@website-signal-risk-scanner/shared";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import { CookieStoragePanel } from "./cookie-storage-panel";
import { DiagnosticsPanel } from "./diagnostics-panel";
import { ExecutiveSummaryCard } from "./executive-summary-card";
import { FindingsSection } from "./findings-section";
import { FullScanProgressCard } from "./full-scan-progress-card";
import { FingerprintingPanel } from "./fingerprinting-panel";
import { InfoTip } from "./info-tip";
import { RedirectFlowPanel } from "./redirect-flow-panel";
import { ScanPageHeader } from "./scan-page-header";
import { VendorFootprintCard } from "./vendor-footprint-card";
import {
  EMPHASIS_METRIC_CARD_CLASS,
  EMPHASIS_METRIC_CARD_VALUE_CLASS,
  METRIC_CARD_CLASS,
  METRIC_CARD_VALUE_CLASS,
  METRIC_GRID_CLASS,
  SectionSubsection,
  StaticSubsection,
  SummaryMetricTile
} from "./report-primitives";
import {
  isRightsFrictionSignal,
  shouldSurfacePrimarySignalFinding
} from "../../lib/scans/finding-evidence-gates";
import {
  buildAccessibilitySupportFallbackEvidence,
  buildCookiePolicyFallbackEvidence,
  buildSnapshotDisclosureFallbackEvidence,
  buildChildContextFallbackEvidence,
  isChildContextSignalKey
} from "../../lib/scans/signal-fallback-evidence";
import {
  deriveCertScoreFindings,
} from "../../lib/scans/derive-findings";
import {
  getHybridDerivedSignalValue,
  getHybridRuntimeEvidence,
  getHybridSignalFallbackEvidence
} from "../../lib/scans/hybrid-runtime-evidence";
import { selectTopFindings } from "../../lib/scans/rank-findings";
import {
  buildUnifiedFindingDisplayPackets,
  getUnifiedFindingCategoryRelation,
  type UnifiedFindingDisplayPacket
} from "../../lib/scans/unified-findings";
import {
  getSurfacingDecisionStateBadgeClasses,
  getSurfacingDecisionStateLabel,
  getSurfacingLaneBadgeClasses,
  getSurfacingLaneLabel,
  isConfidenceCoverageSurfacing,
  isMainNarrativeSurfacing,
  isSupportingContextSurfacing
} from "../../lib/scans/report-surfacing-presentation";
import {
  getPolicyPositiveSignalSpec,
  isPolicyPositiveSignalKey,
  isPrivacyRightsSignalKey
} from "../../lib/scans/policy-positive-signal-contract";
import {
  isMeaningfulPolicyText,
  normalizePolicySnippet,
  normalizePolicySnippetList
} from "../../lib/scans/policy-snippet-normalization";
import {
  getPolicyActionableFlags,
  getPolicyEvidenceSnippets,
  getPolicyMentions,
  getPolicyPageType,
  getPolicyPageUrl,
  getPolicySummaryText
} from "../../lib/scans/policy-enrichment-row";
import {
  type ContradictionEvidenceBundle
} from "../../lib/scans/contradiction-evidence-contract";
import {
  buildValidationFindingLookup,
  findValidationFindingForKeys,
  getValidationMatchKeysForReviewReason,
  getValidationMatchKeysForSignal,
  getValidationMatchKeysForTitle,
  type ScanValidationFinding
} from "../../lib/scans/validation-review-linking";
import {
  groupSnapshotFieldsByPrimaryCategory,
  PRIMARY_SCAN_CATEGORY_META
} from "../../lib/scans/signal-taxonomy";
import { deriveScanExecutionSummary } from "../../lib/scans/scan-timeout-summary";
import { deriveScanStopReason } from "../../lib/scans/scan-stop-reason";
import {
  formatCollectionEndpointType,
} from "../../lib/scans/tracker-risk";
import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";
import { PendingButtonLink } from "../ui/pending-link";
import type { CertScoreFinding } from "../../lib/scans/finding-registry";

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(value));
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) {
    return "Not observed";
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "[]";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function formatCompactValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Not observed";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "Not observed";
    }

    if (value.length <= 3) {
      return value.join(", ");
    }

    return `${value.slice(0, 3).join(", ")} +${value.length - 3} more`;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function formatDurationMs(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "—";
  }

  if (value < 1000) {
    return `${value}ms`;
  }

  const totalSeconds = Math.round(value / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(" ");
}

function formatReasonLabel(value: string) {
  return value
    .split("_")
    .filter((part) => part.length > 0)
    .map((part, index) => (index === 0 ? `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}` : part))
    .join(" ");
}

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatRating(value: unknown) {
  const numericValue = getFiniteNumber(value);

  if (numericValue === null) {
    return "—";
  }

  const clamped = Math.min(100, Math.max(0, numericValue));
  const rating = Math.round((clamped / 20) * 10) / 10;
  return `${rating.toFixed(1)}/5`;
}

function averageNumbers(values: Array<number | null | undefined>) {
  const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (filtered.length === 0) {
    return null;
  }

  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function invertRiskScore(value: unknown) {
  const numericValue = getFiniteNumber(value);
  if (numericValue === null) {
    return null;
  }

  return Math.min(100, Math.max(0, 100 - numericValue));
}

function derivePreconsentSectionScore(input: {
  consentAuditCompleted: boolean;
  consentRejectReducedTracking: unknown;
  preConsentTrackingObserved: boolean;
  preconsentViolationCount: number | null;
}) {
  let score = 100;

  if (input.preConsentTrackingObserved) {
    score -= 35;
  }

  const violationCount = input.preconsentViolationCount ?? 0;
  if (violationCount > 0) {
    score -= Math.min(35, violationCount * 12);
  }

  if (input.consentAuditCompleted && input.consentRejectReducedTracking === false) {
    score -= 15;
  }

  return Math.min(100, Math.max(0, score));
}

function getSnapshotNumber(snapshot: Record<string, unknown>, key: string) {
  const value = snapshot[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getSnapshotBoolean(snapshot: Record<string, unknown>, key: string) {
  return snapshot[key] === true;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getRecordBoolean(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return false;
  }

  return (record as Record<string, unknown>)[key] === true;
}

function getRecordNumber(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  const value = (record as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRecordStringArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function getRecordObjectArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    : [];
}

function getHybridRuntimeSummaryRows(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  if (!hybrid) {
    return null;
  }

  const networkSummary = getRecord(hybrid.networkSummary);
  const consentSummary = getRecord(hybrid.consentSummary);
  const storageSummary = getRecord(hybrid.storageSummary);
  const uiSummary = getRecord(hybrid.uiSummary);
  const mediaSummary = getRecord(hybrid.mediaSummary);
  const fingerprintSummary = getRecord(hybrid.fingerprintSummary);
  const vendorSummary = getRecord(hybrid.vendorSummary);

  return [
    { label: "Requests observed", value: networkSummary?.totalRequestCount },
    { label: "Third-party requests", value: networkSummary?.thirdPartyRequestCount },
    { label: "Third-party domains", value: vendorSummary?.rawThirdPartyDomains },
    { label: "Consent banner", value: consentSummary?.bannerPresent },
    { label: "Reject option present", value: consentSummary?.rejectPresent },
    { label: "Cookie wall detected", value: consentSummary?.cookieWallDetected },
    { label: "Cookies seen", value: storageSummary?.cookiesSeenCount },
    {
      label: "Storage writes",
      value:
        storageSummary?.localStorageWriteDetected === true || storageSummary?.sessionStorageWriteDetected === true
          ? "Observed"
          : "Not observed"
    },
    { label: "Fingerprint tier", value: fingerprintSummary?.tier },
    { label: "Fingerprint reasons", value: fingerprintSummary?.reasons },
    { label: "Popup count", value: uiSummary?.popupCount },
    {
      label: "Overlay or forced action",
      value:
        uiSummary?.overlayDetected === true || uiSummary?.forcedActionRequired === true || uiSummary?.interstitialDetected === true
    },
    {
      label: "Autoplay observed",
      value: mediaSummary?.autoplayVideoObserved === true || mediaSummary?.autoplayAudioObserved === true
    }
  ];
}

function getPolicyField(record: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return null;
}

type PolicyBehaviorContradiction = {
  claim: string;
  evidence: string[];
  observedBehavior: string;
  policyPageUrl: string | null;
  policySnippet: string | null;
  policySummary: string | null;
  relatedVendors: string[];
  runtimeSummary: string;
  runtimeVendors: string[];
  supportingSignals: string[];
  severity: "high" | "medium";
  status: "contradiction" | "violation risk" | "likely contradiction";
  title: string;
};

function deriveConsentAuditFindings(
  snapshot: Record<string, unknown> | null,
  runtimeArtifacts: Record<string, unknown> | null
) {
  if (!getRecordBoolean(runtimeArtifacts, "consent_audit_completed")) {
    return [] as PreviewSampleFinding[];
  }

  const findings: PreviewSampleFinding[] = [];
  const rejectWorked = getRecordBoolean(runtimeArtifacts, "consent_reject_interaction_succeeded");
  const acceptWorked = getRecordBoolean(runtimeArtifacts, "consent_accept_interaction_succeeded");
  const rejectReducedTracking = runtimeArtifacts?.consent_reject_reduced_tracking;
  const rejectReducedThirdPartyCookies = runtimeArtifacts?.consent_reject_reduced_third_party_cookies;
  const baselineTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_baseline_tracker_vendor_names");
  const baselineTrackerEvidenceUrls = getRecordStringArray(runtimeArtifacts, "consent_baseline_tracker_evidence_urls");
  const postRejectTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_post_reject_tracker_vendor_names");
  const rejectPersistedTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_reject_persisted_tracker_vendor_names");
  const rejectNewTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_reject_new_tracker_vendor_names");

  if ((getRecordNumber(runtimeArtifacts, "consent_preconsent_violation_count") ?? 0) > 0) {
    findings.push({
      affectedPage: "Homepage",
      category: "privacy",
      severity: "high",
      title: "Trackers fired before consent interaction",
      description:
        baselineTrackerVendors.length > 0
          ? baselineTrackerEvidenceUrls.length > 0
            ? `The first page render triggered tracker vendors before consent interaction: ${baselineTrackerVendors.join(", ")}. Evidence URLs were captured for ${baselineTrackerEvidenceUrls.length} request${baselineTrackerEvidenceUrls.length === 1 ? "" : "s"}.`
            : `The first page render triggered tracker vendors before consent interaction: ${baselineTrackerVendors.join(", ")}.`
          : "The first page render triggered tracking activity before a consent interaction was completed."
    });
  }

  if (rejectWorked && rejectReducedTracking === false) {
    findings.push({
      affectedPage: "Homepage",
      category: "privacy",
      severity: "high",
      title: "Reject interaction did not reduce tracking",
      description:
        rejectNewTrackerVendors.length > 0
          ? `The consent audit completed a reject interaction, but new tracker vendors still appeared after rejection: ${rejectNewTrackerVendors.join(", ")}.`
          : rejectPersistedTrackerVendors.length > 0
            ? `The consent audit completed a reject interaction, but these tracker vendors still remained after rejection: ${rejectPersistedTrackerVendors.join(", ")}.`
            : postRejectTrackerVendors.length > baselineTrackerVendors.length
              ? `The consent audit completed a reject interaction, but tracking vendors increased from ${baselineTrackerVendors.length} to ${postRejectTrackerVendors.length} after rejection.`
              : "The consent audit completed a reject interaction, but tracking activity still remained after rejection."
    });
  }

  if (rejectWorked && rejectReducedThirdPartyCookies === false) {
    const baselineCookieCount = getRecordNumber(runtimeArtifacts, "consent_baseline_third_party_cookie_count");
    const postRejectCookieCount = getRecordNumber(runtimeArtifacts, "consent_post_reject_third_party_cookie_count");

    findings.push({
      affectedPage: "Homepage",
      category: "privacy",
      severity: "medium",
      title: "Reject interaction did not reduce third-party cookies",
      description:
        baselineCookieCount !== null && postRejectCookieCount !== null
          ? `Third-party cookies changed from ${baselineCookieCount} before interaction to ${postRejectCookieCount} after reject, indicating reject did not suppress that cookie activity.`
          : "Third-party cookie activity was still present after the reject interaction completed."
    });
  }

  if (!getSnapshotBoolean(snapshot ?? {}, "cookie_banner_present") && rejectWorked) {
    findings.push({
      affectedPage: "Homepage",
      category: "privacy",
      severity: "medium",
      title: "Consent surface required deeper interaction sweep",
      description:
        "The initial homepage pass did not surface a banner clearly, but the consent interaction audit later found and used a working consent control."
    });
  }

  if (rejectWorked && acceptWorked === false) {
    findings.push({
      affectedPage: "Homepage",
      category: "privacy",
      severity: "low",
      title: "Accept flow was unavailable after reject in-session",
      description:
        "The audit could complete a reject interaction, but an accept path was not available afterward in the same session, limiting direct within-session comparison."
    });
  }

  return findings;
}

function getFindingTopicKey(finding: PreviewSampleFinding) {
  const haystack = `${finding.title} ${finding.description}`.toLowerCase();

  if (haystack.includes("before consent") || haystack.includes("pre-consent")) {
    return "preconsent_tracking";
  }

  if (haystack.includes("contradiction") || haystack.includes("conflicts with runtime behavior")) {
    return "policy_behavior_contradiction";
  }

  if (haystack.includes("reject interaction")) {
    return "reject_interaction";
  }

  if (haystack.includes("session replay")) {
    return "session_replay";
  }

  if (haystack.includes("advertising stack") || haystack.includes("tracker")) {
    return "tracker_stack";
  }

  if (haystack.includes("accessibility")) {
    return "accessibility";
  }

  return finding.title.toLowerCase();
}

function dedupeHeadlineFindings(findings: PreviewSampleFinding[]) {
  const seen = new Set<string>();
  const deduped: PreviewSampleFinding[] = [];

  for (const finding of findings) {
    const key = `${finding.category}:${getFindingTopicKey(finding)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(finding);
  }

  return deduped;
}

function buildExecutiveSupplementalFindings(input: {
  certFindings: CertScoreFinding[];
  contradictions: PolicyBehaviorContradiction[];
  snapshot: Record<string, unknown> | null;
}) {
  const findings: CertScoreFinding[] = [];
  const hasDarkPatternCard = input.certFindings.some((finding) => finding.id === "consent_dark_patterns_detected");
  const asymmetricConsentFinding = input.certFindings.find((finding) => finding.id === "asymmetric_consent_ui") ?? null;
  const darkPatternFlags = [
    getSnapshotBoolean(input.snapshot ?? {}, "dark_pattern_accept_button_prominence") ? "Accept button prominence" : null,
    getSnapshotBoolean(input.snapshot ?? {}, "dark_pattern_reject_button_missing") ? "Reject button missing" : null,
    getSnapshotBoolean(input.snapshot ?? {}, "dark_pattern_forced_consent_wall") ? "Forced consent wall" : null,
    getSnapshotBoolean(input.snapshot ?? {}, "dark_pattern_accept_only_banner") ? "Accept-only banner" : null,
    getSnapshotBoolean(input.snapshot ?? {}, "dark_pattern_dismiss_without_reject") ? "Dismiss without reject" : null
  ].filter((value): value is string => Boolean(value));
  const darkPatternSignals = darkPatternFlags.length > 0
    ? darkPatternFlags
    : asymmetricConsentFinding
      ? [asymmetricConsentFinding.shortSummary]
      : [];

  if (!hasDarkPatternCard && darkPatternSignals.length > 0) {
    findings.push({
      id: "consent_dark_patterns_detected",
      label: "Dark pattern consent signals detected",
      section: "Consent Experience",
      defaultSurfacePriority: 95,
      whyItMatters:
        "Choice architecture that steers users toward acceptance can undermine meaningful consent and create dark-pattern risk.",
      remediation:
        "Expose reject and settings at the first layer, remove accept-only or forced paths, and equalize button prominence and interaction cost across consent choices.",
      confidence: darkPatternFlags.length > 0 ? "strong" : "good",
      directVsInferred: darkPatternFlags.length > 0 ? "direct" : "mixed",
      evidencePreview: darkPatternSignals.slice(0, 4),
      evidenceRefs: [],
      severity: "high",
      shortSummary:
        darkPatternFlags.length > 0
          ? `Detected consent-interface dark pattern signals: ${darkPatternSignals.join(", ")}.`
          : asymmetricConsentFinding?.shortSummary ?? "Consent-interface dark pattern risk was detected."
    });
  }

  const primaryContradiction = input.contradictions.find((row) => row.status === "contradiction") ?? input.contradictions[0] ?? null;
  if (primaryContradiction) {
    findings.push({
      id: "policy_behavior_contradiction_detected",
      label: primaryContradiction.title,
      section: "Privacy & Tracking",
      defaultSurfacePriority: 97,
      whyItMatters:
        "A mismatch between public policy language and observed runtime behavior is one of the clearest reasons for targeted analyst review.",
      remediation:
        "Compare the retained policy claim against the observed runtime behavior, then either correct the implementation or narrow the policy language so it accurately reflects what the site does in practice.",
      confidence: primaryContradiction.status === "contradiction" ? "strong" : "good",
      directVsInferred: "mixed",
      evidencePreview: [
        primaryContradiction.claim,
        primaryContradiction.observedBehavior,
        ...primaryContradiction.relatedVendors.slice(0, 2)
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0),
      evidenceRefs: primaryContradiction.evidence,
      severity: primaryContradiction.severity,
      shortSummary: primaryContradiction.observedBehavior
    });
  }

  return findings;
}

function derivePolicyBehaviorContradictions(input: {
  mergedSignals?: Array<{
    key: string;
    value: boolean | number | string | string[] | null;
    selectedPopulation?: { value?: boolean | number | string | string[] | null } | null;
  }>;
  primaryPolicyEnrichment?: Record<string, unknown> | null;
  policyEnrichments: Array<Record<string, unknown>>;
  preconsentViolations: Array<{
    evidenceUrls: string[];
    vendorCategory: string;
    vendorName: string;
  }>;
  runtimeArtifacts: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
  trackerVendors: Array<{
    beforeConsent: boolean | null;
    vendorCategory: string;
    vendorName: string;
  }>;
}) {
  const privacyEnrichment =
    input.primaryPolicyEnrichment ??
    input.policyEnrichments.find((row) => getPolicyPageType(row) === "privacy_policy") ??
    input.policyEnrichments[0] ??
    null;
  const contradictions: PolicyBehaviorContradiction[] = [];
  const trackerVendors = input.trackerVendors.map((tracker) => tracker.vendorName);
  const advertisingVendors = input.trackerVendors
    .filter((tracker) => tracker.vendorCategory === "advertising")
    .map((tracker) => tracker.vendorName);
  const sessionReplayVendors = input.trackerVendors
    .filter((tracker) => tracker.vendorCategory === "session_replay")
    .map((tracker) => tracker.vendorName);
  const preconsentVendors = input.preconsentViolations.map((row) => row.vendorName);
  const preconsentEvidence = [...new Set(input.preconsentViolations.flatMap((row) => row.evidenceUrls))];
  const hasPolicyBehaviorConflict =
    input.snapshot?.policy_behavior_conflict_detected === true || input.snapshot?.policyBehaviorConflictDetected === true;
  const mergedPolicyFlags = findMergedSignalValue(input.mergedSignals, "policyActionableFlags");
  const policyFlags = Array.isArray(mergedPolicyFlags)
    ? mergedPolicyFlags.filter((value): value is string => typeof value === "string")
    : [];
  const mergedPolicyDoNotSell = findMergedSignalValue(input.mergedSignals, "policyDoNotSell");
  const policyDoNotSell = typeof mergedPolicyDoNotSell === "string" ? mergedPolicyDoNotSell : "unknown";
  const policyPageUrl = privacyEnrichment ? getPolicyPageUrl(privacyEnrichment) : null;
  const policySummary = privacyEnrichment ? getPolicySummaryText(privacyEnrichment) : null;

  if (preconsentVendors.length > 0) {
    contradictions.push({
      title: "Consent-gated tracking claim conflicts with runtime behavior",
      status: "violation risk",
      severity: "high",
      claim: "The policy and consent surface imply tracking should begin only after a valid consent interaction.",
      observedBehavior: `Trackers fired on first render before consent interaction: ${preconsentVendors.join(", ")}.`,
      evidence: preconsentEvidence.slice(0, 3),
      policyPageUrl,
      policySnippet: "The policy and consent surface imply tracking should begin only after a valid consent interaction.",
      policySummary,
      relatedVendors: preconsentVendors,
      runtimeSummary: `Trackers fired on first render before consent interaction: ${preconsentVendors.join(", ")}.`,
      runtimeVendors: preconsentVendors,
      supportingSignals: ["consent_gating_claim"]
    });
  }

  if ((policyDoNotSell === "present_link" || policyDoNotSell === "present_text") && advertisingVendors.length > 0) {
    contradictions.push({
      title: "Do-not-sell / sharing disclosure conflicts with observed adtech stack",
      status: "likely contradiction",
      severity: "medium",
      claim: "The policy makes an explicit do-not-sell or sharing disclosure, which raises the bar for consistency around third-party marketing data use.",
      observedBehavior: `Advertising or retargeting vendors were observed at runtime: ${advertisingVendors.join(", ")}.`,
      evidence: advertisingVendors.slice(0, 4),
      policyPageUrl,
      policySnippet: "The policy makes an explicit do-not-sell or sharing disclosure, which raises the bar for consistency around third-party marketing data use.",
      policySummary,
      relatedVendors: advertisingVendors,
      runtimeSummary: `Advertising or retargeting vendors were observed at runtime: ${advertisingVendors.join(", ")}.`,
      runtimeVendors: advertisingVendors,
      supportingSignals: [policyDoNotSell]
    });
  }

  if (hasPolicyBehaviorConflict || policyFlags.includes("policy_behavior_conflict_candidate")) {
    contradictions.push({
      title: "Policy/behavior conflict detected",
      status: "contradiction",
      severity: "high",
      claim: "Observed runtime behavior appears to conflict with policy representations about tracking or third-party data use.",
      observedBehavior:
        advertisingVendors.length > 0
          ? `Observed adtech vendors include ${advertisingVendors.join(", ")}${sessionReplayVendors.length > 0 ? `; session replay tooling includes ${sessionReplayVendors.join(", ")}.` : "."}`
          : trackerVendors.length > 0
            ? `Observed tracker vendors include ${trackerVendors.slice(0, 6).join(", ")}.`
            : "The scan flagged a policy/behavior conflict based on runtime evidence and policy semantics.",
      evidence: [
        ...(preconsentEvidence.slice(0, 2) ?? []),
        ...advertisingVendors.slice(0, 2),
        ...sessionReplayVendors.slice(0, 1)
      ].slice(0, 4),
      policyPageUrl,
      policySnippet: "Observed runtime behavior appears to conflict with policy representations about tracking or third-party data use.",
      policySummary,
      relatedVendors: uniqueStrings([...advertisingVendors, ...sessionReplayVendors, ...preconsentVendors]).slice(0, 6),
      runtimeSummary:
        advertisingVendors.length > 0
          ? `Observed adtech vendors include ${advertisingVendors.join(", ")}${sessionReplayVendors.length > 0 ? `; session replay tooling includes ${sessionReplayVendors.join(", ")}.` : "."}`
          : trackerVendors.length > 0
            ? `Observed tracker vendors include ${trackerVendors.slice(0, 6).join(", ")}.`
            : "The scan flagged a policy/behavior conflict based on runtime evidence and policy semantics.",
      runtimeVendors: uniqueStrings([...advertisingVendors, ...sessionReplayVendors, ...preconsentVendors]).slice(0, 6),
      supportingSignals: uniqueStrings([
        hasPolicyBehaviorConflict ? "policy_behavior_conflict_detected" : null,
        policyFlags.includes("policy_behavior_conflict_candidate") ? "policy_behavior_conflict_candidate" : null
      ])
    });
  }

  return contradictions.filter(
    (row, index, rows) =>
      rows.findIndex((candidate) => candidate.title === row.title && candidate.observedBehavior === row.observedBehavior) === index
  );
}

function derivePreconsentViolationRows(input: {
  persistedViolations: Array<{
    collectionEndpointType: string;
    confidence: number;
    detectionSource: string;
    evidenceUrls: string[];
    firstPartyOrThirdParty: string;
    matchedSignatureId: string | null;
    scriptHost: string | null;
    vendorCategory: string;
    vendorName: string;
  }>;
  runtimeArtifacts: Record<string, unknown> | null;
  trackerVendors: Array<{
    beforeConsent: boolean | null;
    collectionEndpointType: string;
    confidence: number;
    detectionSource: string;
    matchedSignatureId: string | null;
    scriptHost: string | null;
    vendorCategory: string;
    vendorName: string;
  }>;
}) {
  if (input.persistedViolations.length > 0) {
    return input.persistedViolations;
  }

  const baselineTrackerVendors = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_vendor_names");
  const baselineEvidenceUrls = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_evidence_urls");

  return baselineTrackerVendors.map((vendorName) => {
    const tracker = input.trackerVendors.find((candidate) => candidate.vendorName === vendorName);
    const vendorEvidenceUrls = baselineEvidenceUrls.filter((url) => {
      const lowerUrl = url.toLowerCase();
      const lowerVendor = vendorName.toLowerCase();

      if (lowerVendor.includes("linkedin")) {
        return lowerUrl.includes("linkedin") || lowerUrl.includes("licdn");
      }
      if (lowerVendor.includes("google")) {
        return lowerUrl.includes("google") || lowerUrl.includes("doubleclick") || lowerUrl.includes("googletagmanager");
      }
      if (lowerVendor.includes("marketo")) {
        return lowerUrl.includes("marketo") || lowerUrl.includes("munchkin");
      }
      if (lowerVendor.includes("reddit")) {
        return lowerUrl.includes("reddit");
      }
      if (lowerVendor.includes("clarity")) {
        return lowerUrl.includes("clarity");
      }

      return lowerUrl.includes(lowerVendor.replace(/\s+/g, ""));
    });

    return {
      collectionEndpointType: tracker?.collectionEndpointType ?? "unknown",
      confidence: tracker?.confidence ?? 0,
      detectionSource: tracker?.detectionSource ?? "runtime_audit",
      evidenceUrls: vendorEvidenceUrls,
      firstPartyOrThirdParty: "unknown",
      matchedSignatureId: tracker?.matchedSignatureId ?? null,
      scriptHost: tracker?.scriptHost ?? null,
      vendorCategory: tracker?.vendorCategory ?? "unknown",
      vendorName
    };
  });
}

function deriveAccessibilityIssueRows(snapshot: Record<string, unknown>) {
  const rows = [
    {
      key: "contrast",
      count: getSnapshotNumber(snapshot, "wcag_contrast_failures_count"),
      description: "Contrast failures can make text and controls hard to perceive for low-vision users.",
      label: "Contrast failures"
    },
    {
      key: "alt",
      count: getSnapshotNumber(snapshot, "wcag_missing_alt_count"),
      description: "Missing alt text reduces screen-reader access to informative images.",
      label: "Missing alt text"
    },
    {
      key: "navigation",
      count: getSnapshotNumber(snapshot, "wcag_keyboard_navigation_issue_count") + getSnapshotNumber(snapshot, "wcag_focus_indicator_issue_count"),
      description: "Keyboard/focus issues make navigation harder without a mouse.",
      label: "Navigation issues"
    },
    {
      key: "aria",
      count: getSnapshotNumber(snapshot, "wcag_aria_error_count"),
      description: "ARIA issues can break semantics or assistive-technology interpretation.",
      label: "ARIA problems"
    },
    {
      key: "labels",
      count: getSnapshotNumber(snapshot, "wcag_form_label_error_count"),
      description: "Form label issues make inputs less understandable and harder to complete.",
      label: "Form label issues"
    }
  ].filter((row) => row.count > 0);

  return rows.sort((left, right) => right.count - left.count);
}

function getAccessibilitySeverity(count: number) {
  if (count >= 20) {
    return "high";
  }
  if (count >= 5) {
    return "medium";
  }
  return "low";
}

function formatWcagCriteria(criteria: string[]) {
  return criteria.join(", ");
}

type AccessibilityRuleEvidenceRow = {
  criteria: string[];
  description: string | null;
  family: string;
  help: string | null;
  helpUrl: string | null;
  impact: string;
  instanceCount: number;
  pageUrl: string | null;
  remediation: string;
  representativeSelectors: string[];
  ruleCode: string;
  ruleGroup: string;
  severity: string;
  weightedPriority: number;
};

function getAccessibilityRuleMetadata(ruleCode: string, ruleGroup: string) {
  const metadataByRuleCode: Record<
    string,
    {
      criteria: string[];
      family: string;
      impact: string;
      remediation: string;
    }
  > = {
    "color-contrast": {
      criteria: ["WCAG 1.4.3", "WCAG 1.4.11"],
      family: "Contrast",
      impact: "Low-vision users may struggle to read text or distinguish controls.",
      remediation: "Adjust foreground, background, and focus-state contrast on primary UI elements."
    },
    "image-alt": {
      criteria: ["WCAG 1.1.1"],
      family: "Alt text",
      impact: "Screen-reader users may miss meaningful image content.",
      remediation: "Add descriptive alt text for informative images and empty alt text for decorative images."
    },
    "label": {
      criteria: ["WCAG 1.3.1", "WCAG 3.3.2"],
      family: "Form labels",
      impact: "Inputs become harder to understand and complete with assistive technology.",
      remediation: "Associate visible labels or robust accessible names with every user-input control."
    },
    "aria-valid-attr-value": {
      criteria: ["WCAG 4.1.2"],
      family: "ARIA",
      impact: "Broken ARIA values can confuse assistive technologies or invalidate semantics.",
      remediation: "Correct invalid ARIA attributes and values to restore reliable semantics."
    },
    "aria-required-attr": {
      criteria: ["WCAG 4.1.2"],
      family: "ARIA",
      impact: "Missing required ARIA attributes can break expected component behavior for assistive technology.",
      remediation: "Add the required ARIA attributes for each custom widget pattern."
    },
    "button-name": {
      criteria: ["WCAG 4.1.2", "WCAG 2.4.4"],
      family: "Navigation",
      impact: "Unnamed controls create ambiguity for screen-reader and keyboard users.",
      remediation: "Ensure every actionable control has a clear accessible name."
    },
    "link-name": {
      criteria: ["WCAG 2.4.4", "WCAG 4.1.2"],
      family: "Navigation",
      impact: "Links without names make navigation and page comprehension harder.",
      remediation: "Provide descriptive visible or accessible names for each link target."
    },
    "heading-order": {
      criteria: ["WCAG 1.3.1", "WCAG 2.4.6"],
      family: "Structure",
      impact: "Broken heading hierarchy makes content harder to scan and navigate.",
      remediation: "Restore logical heading order and hierarchy across primary content sections."
    },
    "landmark-one-main": {
      criteria: ["WCAG 1.3.1"],
      family: "Navigation",
      impact: "Missing landmarks can make page regions less navigable for assistive technology.",
      remediation: "Add consistent landmark structure, especially a single main region."
    }
  };

  const directMatch = metadataByRuleCode[ruleCode];
  if (directMatch) {
    return directMatch;
  }

  const metadataByRuleGroup: Record<
    string,
    {
      criteria: string[];
      family: string;
      impact: string;
      remediation: string;
    }
  > = {
    alt: {
      criteria: ["WCAG 1.1.1"],
      family: "Alt text",
      impact: "Non-text content is less accessible to screen-reader users.",
      remediation: "Add or repair alternative text coverage on meaningful image content."
    },
    contrast: {
      criteria: ["WCAG 1.4.3", "WCAG 1.4.11"],
      family: "Contrast",
      impact: "Insufficient contrast reduces readability and control discoverability.",
      remediation: "Raise text, icon, and control contrast across affected UI states."
    },
    aria: {
      criteria: ["WCAG 4.1.2"],
      family: "ARIA",
      impact: "ARIA implementation issues can break semantics and announcements.",
      remediation: "Repair custom component semantics and invalid ARIA usage."
    },
    label: {
      criteria: ["WCAG 1.3.1", "WCAG 3.3.2"],
      family: "Form labels",
      impact: "Users may not understand what a form control expects.",
      remediation: "Add explicit labels and stable accessible names for each form input."
    },
    keyboard: {
      criteria: ["WCAG 2.1.1", "WCAG 2.4.7"],
      family: "Keyboard",
      impact: "Keyboard users can lose navigation flow or focus visibility.",
      remediation: "Fix keyboard navigation traps, missing focus styles, and tab order issues."
    },
    focus: {
      criteria: ["WCAG 2.4.7"],
      family: "Keyboard",
      impact: "Users may lose sight of where focus is on the page.",
      remediation: "Restore strong visible focus indicators on interactive elements."
    },
    landmark: {
      criteria: ["WCAG 1.3.1"],
      family: "Navigation",
      impact: "Missing landmarks reduce efficient page navigation for assistive technology.",
      remediation: "Add and validate landmark roles for major page regions."
    },
    heading: {
      criteria: ["WCAG 1.3.1", "WCAG 2.4.6"],
      family: "Structure",
      impact: "Heading structure problems make pages harder to navigate and understand.",
      remediation: "Repair heading levels and page outline consistency."
    },
    link: {
      criteria: ["WCAG 2.4.4"],
      family: "Navigation",
      impact: "Weak or missing link names make navigation ambiguous.",
      remediation: "Use descriptive link text and accessible names."
    }
  };

  return (
    metadataByRuleGroup[ruleGroup] ?? {
      criteria: ["WCAG review needed"],
      family: "Other",
      impact: "Automated accessibility issues were detected in this rule family.",
      remediation: "Review the affected components and validate the issue against the relevant WCAG success criteria."
    }
  );
}

function deriveAccessibilityRuleEvidenceRows(input: {
  examples: Array<{
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
  ruleCounts: Array<{
    instanceCount: number;
    ruleCode: string;
    ruleGroup: string;
    severity: string;
  }>;
}): AccessibilityRuleEvidenceRow[] {
  if (input.examples.length > 0) {
    return input.examples.map((example) => {
      const metadata = getAccessibilityRuleMetadata(example.ruleCode, example.ruleGroup);
      const weightedPriority =
        (example.severity === "high" ? 30 : example.severity === "medium" ? 20 : 10) + Math.min(example.nodeCount, 25);

      return {
        ...example,
        ...metadata,
        instanceCount: example.nodeCount,
        weightedPriority
      };
    });
  }

  return input.ruleCounts.map((rule) => {
    const metadata = getAccessibilityRuleMetadata(rule.ruleCode, rule.ruleGroup);
    const weightedPriority =
      (rule.severity === "high" ? 30 : rule.severity === "medium" ? 20 : 10) + Math.min(rule.instanceCount, 25);

    return {
      ...rule,
      ...metadata,
      description: null,
      help: null,
      helpUrl: null,
      pageUrl: null,
      representativeSelectors: [],
      weightedPriority
    };
  });
}

function getRepresentativeAccessibilityExamplesForSignal(input: {
  rows: AccessibilityRuleEvidenceRow[];
  signalKey: string;
}) {
  const matches = input.rows.filter((row) => {
    if (/wcag_contrast_failures_count/i.test(input.signalKey)) {
      return row.ruleCode === "color-contrast" || row.ruleGroup === "contrast";
    }

    if (/wcag_form_label_error_count/i.test(input.signalKey)) {
      return row.ruleCode === "label" || row.ruleGroup === "label";
    }

    if (/wcag_link_name_error_count/i.test(input.signalKey)) {
      return row.ruleCode === "link-name" || row.ruleGroup === "link";
    }

    return false;
  });

  return matches.slice(0, 3).map((row) => ({
    description: row.description,
    help: row.help,
    helpUrl: row.helpUrl,
    pageUrl: row.pageUrl,
    representativeSelectors: row.representativeSelectors.slice(0, 3),
    ruleCode: row.ruleCode,
    ruleGroup: row.ruleGroup
  }));
}

function hasTruthySignal(
  signals: Array<{ key: string; value: boolean | number | string | string[] }>,
  key: string
) {
  return signals.some((signal) => {
    const matches = signal.key === key || signal.key.endsWith(`.${key}`);
    return matches && signal.value === true;
  });
}

const OPERATIONAL_SNAPSHOT_SECTIONS = [
  {
    title: "Coverage",
    fields: [
      "total_signals",
      "accessibility_signal_count",
      "privacy_signal_count",
      "disclosure_signal_count",
      "certscore_overall",
      "privacy_score",
      "consent_score",
      "tracker_risk_score",
      "accessibility_score",
      "data_collection_risk_score",
      "consumer_protection_score",
      "children_privacy_risk_score",
      "legal_coverage_score",
      "regulatory_exposure_score",
      "compliance_maturity_tier"
    ]
  },
  {
    title: "Crawl And Site",
    fields: [
      "scan_timestamp",
      "scanner_schema_version",
      "detection_engine_version",
      "domain",
      "registered_domain",
      "crawl_source",
      "crawl_tier",
      "robots_allowed",
      "robots_fetch_status",
      "robots_fetch_http_status",
      "homepage_fetch_status",
      "homepage_fetch_http_status",
      "final_url",
      "redirect_count",
      "render_mode_used",
      "scan_confidence",
      "partial_scan",
      "timeout_flag",
      "blocked_flag",
      "captcha_flag",
      "country_inferred",
      "jurisdiction_guess",
      "traffic_tier_estimate"
    ]
  },
] as const;

const SNAPSHOT_SECTION_HELP: Record<string, string> = {
  Coverage: "A compact view of how many signals the scan surfaced and how the main scoring layers resolved.",
  "Crawl And Site": "Core crawl outcome, fetch behavior, and site-level context captured during the scan."
};

type ResultMetric = {
  label: string;
  value: string;
  tooltip: string;
};

type ResultDetail = {
  label: string;
  value: unknown;
};

type CanonicalReviewIssue = {
  description: string;
  evidence?: string[];
  fallbackEvidence?: Record<string, unknown>;
  linkedValidationRuleKeys?: string[];
  severity: "high" | "medium" | "low";
  title: string;
};

type CanonicalReviewFinding = {
  categoryId?: string;
  description: string;
  evidence?: string[];
  fallbackEvidence?: Record<string, unknown>;
  id: string;
  linkedValidationFinding?: ScanValidationFinding | null;
  observedValue: string | null;
  severity: "high" | "medium" | "low";
  signalKey?: string;
  signalLabel?: string;
  signalSource?: ReportSignalDefinition["source"];
  sourceType: "issue" | "signal";
  title: string;
};

type ScanRecordData = ScanDetailResponse;

type CanonicalTaxonomyReviewProps = {
  accessibilityIssueRows: ReturnType<typeof deriveAccessibilityIssueRows>;
  consentAuditFindings: PreviewSampleFinding[];
  createAccountHref?: string | null;
  executiveSummary: {
    badges: Array<{
      label: string;
      tone?: "neutral" | "warning";
      tooltip?: string;
    }>;
    metrics: Array<{
      href?: string;
      label: string;
      tooltip?: string;
      value: string;
    }>;
    statusCallout: {
      details: string[];
      title: string;
      tone: "danger" | "success" | "warning";
    } | null;
  };
  policyBehaviorContradictions: PolicyBehaviorContradiction[];
  preconsentViolationRows: ReturnType<typeof derivePreconsentViolationRows>;
  prioritizedAccessibilityRuleRows: ReturnType<typeof deriveAccessibilityRuleEvidenceRows>;
  previewMode?: "full" | "homepage";
  scanRecord: ScanRecordData;
  scanReportReviewIssues: Array<{
    description: string;
    key: string;
    pageType: string;
    pageUrl: string | null;
    reason: string;
    reviewStatus: string;
    reviewVerdict: unknown;
    summary: unknown;
  }>;
  snapshot: Record<string, unknown>;
};

function ScanSectionFallback(input: { message: string; title: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
      <p className="font-semibold">{input.title}</p>
      <p className="mt-1 text-amber-900">{input.message}</p>
    </div>
  );
}

function renderCanonicalTaxonomyReviewSafely(input: CanonicalTaxonomyReviewProps) {
  try {
    return <CanonicalTaxonomyReview {...input} />;
  } catch (error) {
    console.error("Failed to render canonical scan review", error);
    return (
      <ScanSectionFallback
        title="Review sections unavailable"
        message="The live scan completed, but the structured review sections could not be rendered for this scan. Advanced diagnostics are still available below."
      />
    );
  }
}

type CanonicalSignalItem = {
  key: string;
  label: string;
  relation: "primary" | "secondary" | "overlay";
  source: ReportSignalDefinition["source"];
  value: unknown;
};

function getSignalNamespaceKey(key: string) {
  const separatorIndex = key.indexOf(".");
  return separatorIndex >= 0 ? key.slice(separatorIndex + 1) : key;
}

function findPersistedSignalValue(
  signals: Array<{ key: string; value: boolean | number | string | string[] }>,
  key: string
) {
  return signals.find((signal) => signal.key === key)?.value ?? null;
}

function findMergedSignalValue(
  mergedSignals: Array<{
    key: string;
    value: boolean | number | string | string[] | null;
    selectedPopulation?: { value?: boolean | number | string | string[] | null } | null;
  }> | null | undefined,
  key: string
) {
  const row = mergedSignals?.find((signal) => signal.key === key) ?? null;
  return row?.selectedPopulation?.value ?? row?.value ?? null;
}

function getSnapshotSignalValue(snapshot: Record<string, unknown> | null, signalKey: string) {
  if (!snapshot) {
    return null;
  }

  const snapshotKey = getSignalNamespaceKey(signalKey);
  const directValue = snapshot[snapshotKey];
  if (directValue !== null && directValue !== undefined) {
    return directValue;
  }

  switch (signalKey) {
    case "privacy.children_privacy_context_without_supporting_disclosure":
      return (
        (snapshot.children_audience_likely === true || snapshot.kid_directed_content_detected === true) &&
        snapshot.privacy_policy_present !== true &&
        snapshot.privacy_contact_channel_type === "none"
      );
    case "privacy.consent_mechanism_absent":
      return snapshot.consent_mechanism_type === "none";
    case "privacy.consent_surface_missing":
      return (
        snapshot.consent_mechanism_type === "none" &&
        snapshot.cookie_banner_present !== true &&
        !snapshot.cmp_vendor_name &&
        (!snapshot.consent_interaction_model || snapshot.consent_interaction_model === "none")
      );
    case "privacy.privacy_contact_channel_missing":
      return snapshot.privacy_contact_channel_type === "none";
    case "privacy.sale_sharing_controls_missing":
      return snapshot.retargeting_pixel_detected === true && snapshot.do_not_sell_link_present === false;
    case "accessibility.accessibility_support_path_missing":
      return snapshot.accessibility_contact_method_present === false;
    case "privacy.cmp_vendor_detected":
      return snapshot.cmp_vendor_name ?? null;
    default:
      return null;
  }
}

function getReportSignalValue(input: {
  mergedSignals?: Array<{
    key: string;
    value: boolean | number | string | string[] | null;
    selectedPopulation?: { value?: boolean | number | string | string[] | null } | null;
  }>;
  policyEnrichment: Array<Record<string, unknown>>;
  runtimeArtifacts: Record<string, unknown> | null;
  signals: Array<{ key: string; value: boolean | number | string | string[] }>;
  snapshot: Record<string, unknown> | null;
  signal: ReportSignalDefinition;
}) {
  const hybridDerivedValue = getHybridDerivedSignalValue(input.runtimeArtifacts, input.signal.key);
  if (hybridDerivedValue !== undefined) {
    return hybridDerivedValue;
  }
  const mergedSignalValue = findMergedSignalValue(input.mergedSignals, input.signal.key);

  if (input.signal.source === "snapshot_signal") {
    return getSnapshotSignalValue(input.snapshot, input.signal.key) ?? mergedSignalValue ?? findPersistedSignalValue(input.signals, input.signal.key);
  }

  if (input.signal.source === "runtime_artifact_signal") {
    return input.runtimeArtifacts?.[input.signal.key] ?? mergedSignalValue ?? findPersistedSignalValue(input.signals, input.signal.key);
  }

  return mergedSignalValue ?? findPersistedSignalValue(input.signals, input.signal.key);
}

function isSignalValuePopulated(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return false;
    }

    if (/score|window_days|word_count|semantic_confidence/i.test(key)) {
      return true;
    }

    return value > 0;
  }

  if (typeof value === "string") {
    return value.trim().length > 0 && value !== "unknown" && value !== "absent" && value !== "none";
  }

  return true;
}

function isConcerningSignal(key: string, value: unknown) {
  if (!isSignalValuePopulated(key, value)) {
    return false;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    return false;
  }

  const negativePatterns = [
    /dark_pattern/,
    /preconsent/,
    /fingerprinting/,
    /gpc_signal_not_honored/,
    /weak_cookie_security_attributes_detected/,
    /conflict/,
    /mismatch/,
    /litigation_risk_score/,
    /error_count/,
    /warning_count/,
    /issue_count/,
    /failures_count/,
    /store_credit_only/,
    /termination_for_cause/,
    /service_suspension_or_termination/,
    /retargeting_pixel/,
    /session_replay/,
    /popup_behavior/,
    /autoplay_media/,
    /overlay_blocking/,
    /functional_misalignment/,
    /technical_disclosure/,
    /disclosure_gap/,
    /surface_missing/,
    /fetch_failed/,
    /extraction_limited/,
    /bounded_search/,
    /structurally_obstructed/,
    /likely_obstructed/,
    /high_sensitivity_data_collection_detected/,
    /limited_time_offer_language_present/,
    /discount_claim_present/,
    /original_price_comparison_present/,
    /children_audience_likely/,
    /kid_directed_content_detected/,
    /form_collects_birthdate/,
    /policyChildrenReference/
  ];

  if (negativePatterns.some((pattern) => pattern.test(key))) {
    return true;
  }

  if (
    isPolicyPositiveSignalKey(key) ||
    /accessibility_contact_method_present|affiliate_disclosure_present|disclosure\.privacy_policy_present|disclosure\.terms_of_service_present|disclosure\.cookie_policy_present|disclosure\.contact_page_present|privacy\.do_not_sell_link_present/i.test(
      key
    )
  ) {
    return true;
  }

  if (typeof value === "number") {
    if (/risk_score|ambiguity_score|friction_score/i.test(key)) {
      return value > 0;
    }
    if (/window_days/i.test(key)) {
      return false;
    }
  }

  return false;
}

function getSignalConcernReason(key: string, value: unknown) {
  if (!isConcerningSignal(key, value)) {
    return null;
  }

  if (/preconsent|tracking_before_consent/i.test(key)) {
    return "Observed before a clear user choice was made.";
  }

  if (/fingerprinting/i.test(key)) {
    return "Observed coordinated browser or device attribute collection consistent with fingerprinting review risk.";
  }

  if (/gpc_signal_not_honored/i.test(key)) {
    return "A browser-level opt-out preference signal appears not to have been honored during the scan.";
  }

  if (/popup_behavior|autoplay_media|overlay_blocking/i.test(key)) {
    return "Observed intrusive or blocking runtime behavior that may interfere with normal page use.";
  }

  if (/children_audience_likely|kid_directed_content_detected|form_collects_birthdate|policyChildrenReference/i.test(key)) {
    return "The scan flagged age-related or youth-directed context that may raise children’s privacy review expectations.";
  }

  if (/weak_cookie_security_attributes_detected/i.test(key)) {
    return "Observed cookies appear to rely on weaker security attributes than expected.";
  }

  if (/surface_missing/i.test(key)) {
    return "A key disclosure or support page surface was not detected during the scan.";
  }

  if (/fetch_failed/i.test(key)) {
    return "A key disclosure or support page was linked from the scanned site, but automated retrieval of that target was limited during the scan.";
  }

  if (/extraction_limited/i.test(key)) {
    return "A key disclosure page was linked and fetched, but the retrieved content was too limited for reliable automated extraction on its own.";
  }

  if (/key_page_discovery_unresolved_after_bounded_search/i.test(key)) {
    return "The scanner exhausted its bounded key-page discovery budget without confirming one or more expected legal or support pages.";
  }

  if (/cookie_policy_structurally_obstructed/i.test(key)) {
    return "The cookie policy did not expose enough structured disclosure metadata to reconcile runtime cookies with confidence.";
  }

  if (/conflict|mismatch/i.test(key)) {
    return "Signals a contradiction or mismatch that merits direct review.";
  }

  if (/dark_pattern|limited_time_offer_language_present|discount_claim_present|original_price_comparison_present/i.test(key)) {
    return "Promotional or choice architecture may need closer disclosure review.";
  }

  if (/affiliate_disclosure_present/i.test(key)) {
    return "The scan retained a clear affiliate disclosure path that signals when recommendations or links may involve a financial relationship.";
  }

  if (/disclosure\.privacy_policy_present/i.test(key)) {
    return "The scan retained a reachable privacy-policy surface that users and reviewers can use to find core notice disclosures.";
  }

  if (/disclosure\.terms_of_service_present/i.test(key)) {
    return "The scan retained a reachable terms surface that users and reviewers can use to find the site's core legal terms.";
  }

  if (/disclosure\.cookie_policy_present/i.test(key)) {
    return "The scan retained a reachable cookie-policy or cookie-settings surface that users can use to find tracking disclosures and related controls.";
  }

  if (/disclosure\.contact_page_present/i.test(key)) {
    return "The scan retained a reachable contact or feedback path that users can use when they need help or want to reach the operator.";
  }

  if (/privacy\.do_not_sell_link_present/i.test(key)) {
    return "The scan retained a reachable targeted-advertising or do-not-sell/share choice path that users can use to manage related privacy controls.";
  }

  const policyPositiveSpec = getPolicyPositiveSignalSpec(key);

  if (policyPositiveSpec?.unifiedFindingId === "privacy_rights_path_present") {
    return "The scan retained a clear policy-based privacy-rights request path that users can rely on when seeking access, deletion, export, or related controls.";
  }

  if (policyPositiveSpec?.unifiedFindingId === "gpc_disclosure_present") {
    return "The scan retained a disclosure indicating how the site says it handles Global Privacy Control or similar browser-level opt-out signals.";
  }

  if (policyPositiveSpec?.unifiedFindingId === "tracking_technologies_disclosure_present") {
    return "The scan retained a disclosure describing cookies, pixels, tags, beacons, scripts, or similar tracking technologies used on the site.";
  }

  if (policyPositiveSpec?.unifiedFindingId === "targeted_advertising_disclosure_present") {
    return "The scan retained a disclosure describing targeted advertising, sale, or sharing practices and related user controls.";
  }

  if (policyPositiveSpec?.unifiedFindingId === "behavioral_analytics_disclosure_present") {
    return "The scan retained a disclosure describing behavioral analytics, session-observation, or replay-style tooling on at least some pages.";
  }

  if (/accessibility_contact_method_present/i.test(key)) {
    return "The scan retained a visible accessibility support or accommodation path that users can use when they need help.";
  }

  if (policyPositiveSpec?.unifiedFindingId === "arbitration_clause_present") {
    return "The scan retained terms language that appears to include arbitration or dispute-resolution provisions worth reading directly.";
  }

  if (/store_credit_only/i.test(key)) {
    return "Post-purchase remedy may be more restrictive than expected.";
  }

  if (/termination_for_cause|service_suspension_or_termination/i.test(key)) {
    return "Terms reserve restrictive enforcement rights that should be read directly.";
  }

  if (/risk_score|ambiguity_score|friction_score/i.test(key)) {
    return "Scanner-derived risk indicator is elevated.";
  }

  if (/error_count|warning_count|issue_count|failures_count/i.test(key)) {
    return "Automated issues were surfaced in this area.";
  }

  return "This signal is worth reviewer attention.";
}

function buildSectionReviewIssues(input: {
  accessibilityIssueRows: ReturnType<typeof deriveAccessibilityIssueRows>;
  consentAuditFindings: PreviewSampleFinding[];
  policyBehaviorContradictions: PolicyBehaviorContradiction[];
  preconsentViolationRows: ReturnType<typeof derivePreconsentViolationRows>;
  runtimeArtifacts: Record<string, unknown> | null;
  scanReportReviewIssues: CanonicalTaxonomyReviewProps["scanReportReviewIssues"];
  sectionId: string;
  snapshot: Record<string, unknown>;
}) {
  const issues: CanonicalReviewIssue[] = [];

  if (input.sectionId === "policy_clarity_consistency_review") {
    issues.push(
      ...input.policyBehaviorContradictions.map((row) => ({
        description: row.observedBehavior,
        evidence: row.evidence,
        fallbackEvidence: {
          contradictionEvidence: {
            claim: row.claim,
            contradictionBasis: row.status,
            conflictBridge: {
              conflictType: null,
              reasoning: row.runtimeSummary,
              supportsPromotion: false
            },
            evidenceSufficiency: {
              conflictBridgePresent: false,
              policyAnchorPresent: Boolean(row.policySnippet && row.policyPageUrl),
              promotionEligible: false,
              reviewStatus: "insufficient_evidence_for_policy_behavior_conflict",
              runtimeAnchorPresent: row.evidence.length > 0
            },
            explicitPolicySnippet: row.policySnippet ?? null,
            policyAnchor: {
              claimType: null,
              confidence: null,
              extractionStatus: null,
              normalizedClaim: row.claim,
              snippet: row.policySnippet ?? row.claim,
              sourceUrl: row.policyPageUrl
            },
            policySnippet: row.policySnippet ?? row.claim,
            policySourceUrl: row.policyPageUrl,
            policySummaryShort: row.policySummary,
            relatedVendors: row.relatedVendors,
            runtimeAnchor: {
              confidence: null,
              cookies: [],
              observationType: null,
              phase: "unknown",
              requests: [],
              sourceUrl: row.policyPageUrl,
              storageArtifacts: [],
              vendors: row.runtimeVendors
            },
            runtimeEvidenceArtifacts: row.evidence,
            runtimeSummary: row.runtimeSummary,
            runtimeVendors: row.runtimeVendors,
            sourceUrls: row.policyPageUrl ? [row.policyPageUrl] : [],
            supportingSignals: row.supportingSignals
          } satisfies ContradictionEvidenceBundle,
          claim: row.claim,
          pageUrl: row.policyPageUrl,
          policySnippets: row.policySnippet ? [row.policySnippet] : [],
          policySummaryShort: row.policySummary,
          relatedVendors: row.relatedVendors,
          runtimeEvidenceArtifacts: row.evidence,
          runtimeSummary: row.runtimeSummary,
          runtimeVendors: row.runtimeVendors,
          sourceUrls: row.policyPageUrl ? [row.policyPageUrl] : [],
          supportingSignals: row.supportingSignals
        },
        severity: row.severity,
        title: row.title
      }))
    );

    issues.push(
      ...dedupeReviewIssues(
        input.scanReportReviewIssues.map((row) => {
          const reviewSeverity: CanonicalReviewIssue["severity"] =
            row.reason === "policy_behavior_conflict_candidate" ? "high" : "medium";

          return {
            description: row.description,
            evidence: row.pageUrl ? [row.pageUrl] : [],
            linkedValidationRuleKeys: getValidationMatchKeysForReviewReason(row.reason),
            severity: reviewSeverity,
            title: formatReviewIssueReason(row.reason)
          };
        })
      )
    );
  }

  if (input.sectionId === "tracking_third_party_ecosystem" && input.preconsentViolationRows.length > 0) {
    issues.push({
      description: `Observed vendor activity before consent for ${input.preconsentViolationRows.length} vendor${input.preconsentViolationRows.length === 1 ? "" : "s"}.`,
      evidence: input.preconsentViolationRows.flatMap((row) => row.evidenceUrls).slice(0, 3),
      fallbackEvidence: {
        preconsent_tracker_evidence_urls: uniqueStrings(
          input.preconsentViolationRows.flatMap((row) => row.evidenceUrls)
        ),
        preconsent_tracker_vendors: uniqueStrings(input.preconsentViolationRows.map((row) => row.vendorName)),
        preconsent_tracking_detected: true,
        supportingSignals: ["privacy.preconsent_tracking_detected", "privacy.tracking_before_consent_detected"],
        tracking_before_consent_detected: true
      },
      severity: "high",
      title: "Pre-consent tracking incidents detected"
    });
  }

  if (input.sectionId === "consent_controls_enforcement") {
    issues.push(
      ...input.consentAuditFindings.map((finding) => {
        const baselineTrackerVendors = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_vendor_names");
        const baselineTrackerEvidenceUrls = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_evidence_urls");
        const persistedTrackerVendors = getRecordStringArray(input.runtimeArtifacts, "consent_reject_persisted_tracker_vendor_names");
        const newTrackerVendors = getRecordStringArray(input.runtimeArtifacts, "consent_reject_new_tracker_vendor_names");
        const postRejectTrackerVendors = getRecordStringArray(input.runtimeArtifacts, "consent_post_reject_tracker_vendor_names");

        let fallbackEvidence: Record<string, unknown> | undefined;
        if (finding.title === "Trackers fired before consent interaction") {
          fallbackEvidence = {
            preconsent_tracker_evidence_urls: baselineTrackerEvidenceUrls,
            preconsent_tracker_vendors: baselineTrackerVendors,
            preconsent_tracking_detected: true,
            supportingSignals: ["privacy.preconsent_tracking_detected", "privacy.tracking_before_consent_detected"],
            tracking_before_consent_detected: true
          };
        } else if (finding.title === "Reject interaction did not reduce tracking") {
          fallbackEvidence = {
            persisted_tracker_vendors: uniqueStrings([...persistedTrackerVendors, ...newTrackerVendors, ...postRejectTrackerVendors]),
            post_reject_tracker_vendors: postRejectTrackerVendors,
            reject_did_not_reduce_tracking: true,
            runtimeEvidenceUrls: baselineTrackerEvidenceUrls
          };
        } else if (finding.title === "Reject interaction did not reduce third-party cookies") {
          fallbackEvidence = {
            consent_post_reject_third_party_cookie_count: input.runtimeArtifacts?.consent_post_reject_third_party_cookie_count ?? null,
            consent_reject_reduced_third_party_cookies: false,
            consentBaselineTrackerEvidenceUrls: baselineTrackerEvidenceUrls
          };
        }

        return {
          description: finding.description,
          fallbackEvidence,
          severity: finding.severity === "info" ? "low" : finding.severity,
          title: finding.title
        };
      })
    );
  }

  if (input.sectionId === "access_barriers_task_completion") {
    issues.push(
      ...input.accessibilityIssueRows
        .filter((row) => row.count > 0)
        .slice(0, 3)
        .map((row) => {
          const severity: CanonicalReviewIssue["severity"] = row.count >= 5 ? "high" : row.count >= 2 ? "medium" : "low";

          return {
            description: `${row.count} observed in the automated accessibility audit.`,
            severity,
            title: row.label
          };
        })
    );
  }

  if (input.sectionId === "accessibility_commitments_conformance_support" && input.snapshot.accessibility_claim_mismatch_detected === true) {
    issues.push({
      description: "Public-facing accessibility claims appear to conflict with the automated issue profile captured during the scan.",
      severity: "high",
      title: "Accessibility claim mismatch detected"
    });
  }

  if (input.sectionId === "billing_cancellation_post_purchase_rights" && input.snapshot.store_credit_only_policy_present === true) {
    issues.push({
      description: "The refund/remedy posture appears to lean on store credit only, which is worth direct reviewer attention.",
      severity: "medium",
      title: "Store-credit-only remedy detected"
    });
  }

  return issues;
}

function dedupeReviewIssues(issues: CanonicalReviewIssue[]) {
  const seen = new Set<string>();

  return issues.filter((issue) => {
    const key = [
      issue.title.trim().toLowerCase(),
      issue.description.trim().toLowerCase(),
      issue.severity,
      ...(issue.evidence ?? []).map((entry) => entry.trim().toLowerCase()).sort()
    ].join("::");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function severityRank(severity: CanonicalReviewFinding["severity"]) {
  switch (severity) {
    case "high":
      return 0;
    case "medium":
      return 1;
    default:
      return 2;
  }
}

function getKeyPageTypeForSignal(key: string) {
  if (/disclosure\.privacy_policy_(fetch_failed|extraction_limited)/i.test(key)) {
    return "privacy_policy";
  }
  if (/disclosure\.terms_of_service_(fetch_failed|extraction_limited)/i.test(key)) {
    return "terms_of_service";
  }
  if (/disclosure\.cookie_policy_(fetch_failed|extraction_limited)/i.test(key)) {
    return "cookie_policy";
  }
  if (/disclosure\.accessibility_statement_(fetch_failed|extraction_limited)/i.test(key)) {
    return "accessibility_statement";
  }
  if (/disclosure\.contact_page_fetch_failed/i.test(key)) {
    return "contact";
  }
  return null;
}

function getPolicySignalFallbackEvidence(input: {
  mergedSignals?: Array<{
    key: string;
    value: boolean | number | string | string[] | null;
    selectedPopulation?: { value?: boolean | number | string | string[] | null } | null;
  }>;
  policyEnrichment: Array<Record<string, unknown>>;
  signalKey: string;
  signalLabel: string;
  signalValue: unknown;
}) {
  const rightsSnippetKeys = [
    "dsar",
    "access",
    "delete",
    "correct",
    "export",
    "manage",
    "state_rights",
    "authorized_agent",
    "appeal",
    "privacy_controls",
    "privacy_contact"
  ] as const;
  const policyPositiveSpec = getPolicyPositiveSignalSpec(input.signalKey);
  const topicKey = policyPositiveSpec?.evidenceSnippetKey ?? null;
  const pageType = policyPositiveSpec?.pageType ?? "privacy_policy";
  const row =
    input.policyEnrichment.find((entry) => getPolicyPageType(entry) === pageType) ??
    input.policyEnrichment[0] ??
    null;

  const pageUrl = row ? getPolicyPageUrl(row) : null;
  const policySummaryShort = row ? getPolicySummaryText(row) : null;
  const evidenceSnippets = row ? getPolicyEvidenceSnippets(row) : null;
  const mergedPolicyRightsSignals = findMergedSignalValue(input.mergedSignals, "policyRightsSignals");
  const policyRightsSignals = Array.isArray(mergedPolicyRightsSignals)
    ? mergedPolicyRightsSignals.filter((value): value is string => typeof value === "string")
    : [];
  const topicSnippetKeys = topicKey
    ? [topicKey]
    : policyPositiveSpec?.unifiedFindingId === "privacy_contact_path_present"
      ? ["privacy_contact", "notice_contact", "dsar"]
      : policyPositiveSpec?.unifiedFindingId === "children_privacy_disclosure_present"
        ? ["topic:children", "children"]
        : [];
  const topicSnippets = topicSnippetKeys.flatMap((key) =>
    isMeaningfulPolicyText(evidenceSnippets?.[key]) ? [String(evidenceSnippets[key])] : []
  );
  const rightsSnippets = isPrivacyRightsSignalKey(input.signalKey)
    ? rightsSnippetKeys
        .flatMap((key) => (isMeaningfulPolicyText(evidenceSnippets?.[key]) ? [String(evidenceSnippets[key])] : []))
        .slice(0, 2)
    : [];
  const policySnippets = normalizePolicySnippetList([...topicSnippets, ...rightsSnippets]);
  const mergedPrivacyContactChannelType = findMergedSignalValue(input.mergedSignals, "privacyContactChannelType");
  const privacyContactChannelType =
    typeof mergedPrivacyContactChannelType === "string" && isMeaningfulPolicyText(mergedPrivacyContactChannelType)
      ? mergedPrivacyContactChannelType
      : null;
  const mergedPolicyChildrenReference = findMergedSignalValue(input.mergedSignals, "policyChildrenReference");
  const policyChildrenReference =
    typeof mergedPolicyChildrenReference === "string" && isMeaningfulPolicyText(mergedPolicyChildrenReference)
      ? mergedPolicyChildrenReference
      : null;

  return {
    pageUrl,
    pageUrls: pageUrl ? [pageUrl] : [],
    policySnippets,
    policyRightsSignals,
    privacyContactChannelType,
    policyChildrenReference,
    policySummaryShort: policySnippets.length > 0 ? null : policySummaryShort,
    signalKey: input.signalKey,
    signalLabel: input.signalLabel,
    signalValue: input.signalValue,
    sourceUrls: pageUrl ? [pageUrl] : []
  };
}

function getKeyPageDiscoveryPageSummary(
  summary: unknown,
  pageType: string
): {
  attemptCount: number | null;
  attemptedUrls: string[];
  bestDiscoverySource: string | null;
  fetchQuality: string | null;
  guessedOnly: boolean;
  stopReason: string | null;
} | null {
  if (!summary || typeof summary !== "object") {
    return null;
  }

  const pageSummaries = (summary as { pageSummaries?: unknown }).pageSummaries;
  if (!Array.isArray(pageSummaries)) {
    return null;
  }

  const match = pageSummaries.find(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === "object" && entry.pageType === pageType
  );

  if (!match) {
    return null;
  }

  return {
    attemptCount: typeof match.attemptCount === "number" ? match.attemptCount : null,
    attemptedUrls: Array.isArray(match.attemptedUrls)
      ? match.attemptedUrls.filter((value): value is string => typeof value === "string")
      : [],
    bestDiscoverySource: typeof match.bestDiscoverySource === "string" ? match.bestDiscoverySource : null,
    fetchQuality: typeof match.fetchQuality === "string" ? match.fetchQuality : null,
    guessedOnly: match.guessedOnly === true
    ,
    stopReason: typeof match.stopReason === "string" ? match.stopReason : null
  };
}

function buildReviewFindings(input: {
  allSignals?: Array<{ key: string; value: unknown }>;
  categoryId?: string;
  issues: CanonicalReviewIssue[];
  mergedSignals?: Array<{
    key: string;
    value: boolean | number | string | string[] | null;
    selectedPopulation?: { value?: boolean | number | string | string[] | null } | null;
  }>;
  policyEnrichment?: Array<Record<string, unknown>>;
  prioritizedAccessibilityRuleRows: AccessibilityRuleEvidenceRow[];
  runtimeArtifacts?: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
  sectionId: string;
  sectionItems: CanonicalSignalItem[];
  validationFindingLookup?: Map<string, ScanValidationFinding>;
}) {
  const signalFindings: CanonicalReviewFinding[] = input.sectionItems
    .filter((item) => item.relation === "primary" && isConcerningSignal(item.key, item.value))
    .flatMap((item): CanonicalReviewFinding[] => {
      const linkedValidationFinding = input.validationFindingLookup
        ? findValidationFindingForKeys(input.validationFindingLookup, getValidationMatchKeysForSignal(item.key))
        : null;
      const keyPageType = getKeyPageTypeForSignal(item.key);
      const keyPageSummary =
        keyPageType
          ? getKeyPageDiscoveryPageSummary(input.runtimeArtifacts?.key_page_discovery_summary, keyPageType)
          : null;
      const accessibilityRuleExamples = getRepresentativeAccessibilityExamplesForSignal({
        rows: input.prioritizedAccessibilityRuleRows,
        signalKey: item.key
      });

      const baseFallbackEvidence =
        isRightsFrictionSignal(item.key)
          ? {
              consentBlockerPageTitle:
                typeof input.runtimeArtifacts?.consent_blocker_page_title === "string"
                  ? input.runtimeArtifacts.consent_blocker_page_title
                  : null,
              consentBlockerTextSnippet:
                typeof input.runtimeArtifacts?.consent_blocker_text_snippet === "string"
                  ? input.runtimeArtifacts.consent_blocker_text_snippet
                  : null,
              consentBlockerType:
                typeof input.runtimeArtifacts?.consent_blocker_type === "string"
                  ? input.runtimeArtifacts.consent_blocker_type
                  : null,
              consentBlockerUrl:
                typeof input.runtimeArtifacts?.consent_blocker_url === "string"
                  ? input.runtimeArtifacts.consent_blocker_url
                  : null,
              consentEvidencePassCount:
                typeof input.runtimeArtifacts?.consent_evidence_pass_count === "number"
                  ? input.runtimeArtifacts.consent_evidence_pass_count
                  : null,
              consentFrictionDelta:
                typeof input.runtimeArtifacts?.consent_friction_delta === "number"
                  ? input.runtimeArtifacts.consent_friction_delta
                  : null,
              consentOptInClicks:
                typeof input.runtimeArtifacts?.consent_opt_in_clicks === "number"
                  ? input.runtimeArtifacts.consent_opt_in_clicks
                  : null,
              consentOptOutClicks:
                typeof input.runtimeArtifacts?.consent_opt_out_clicks === "number"
                  ? input.runtimeArtifacts.consent_opt_out_clicks
                  : null,
              consentRedirectOrAuthRequired: input.runtimeArtifacts?.consent_redirect_or_auth_required === true,
              signalKey: item.key,
              signalLabel: item.label,
              signalValue: item.value
            }
          : (item.source === "policy_enrichment_signal" || item.source === "document_semantic_signal") &&
              isPolicyPositiveSignalKey(item.key)
            ? getPolicySignalFallbackEvidence({
                mergedSignals: input.mergedSignals,
                policyEnrichment: input.policyEnrichment ?? [],
                signalKey: item.key,
                signalLabel: item.label,
                signalValue: item.value
              })
          : /privacy\.gpc_signal_not_honored/i.test(item.key)
            ? {
                gpcVerification:
                  input.runtimeArtifacts?.gpc_verification && typeof input.runtimeArtifacts.gpc_verification === "object"
                    ? input.runtimeArtifacts.gpc_verification
                    : null,
                signalKey: item.key,
                signalLabel: item.label,
                signalValue: item.value,
                sourceUrls:
                  input.runtimeArtifacts?.gpc_verification &&
                  typeof input.runtimeArtifacts.gpc_verification === "object" &&
                  Array.isArray((input.runtimeArtifacts.gpc_verification as { evidenceUrls?: unknown }).evidenceUrls)
                    ? ((input.runtimeArtifacts.gpc_verification as { evidenceUrls: string[] }).evidenceUrls)
                    : []
              }
            : /privacy\.weak_cookie_security_attributes_detected/i.test(item.key)
              ? {
                  cookieAttributeSummary:
                    input.runtimeArtifacts?.cookie_attribute_summary && typeof input.runtimeArtifacts.cookie_attribute_summary === "object"
                      ? input.runtimeArtifacts.cookie_attribute_summary
                      : null,
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value
                }
            : /commerce\.high_sensitivity_data_collection_detected/i.test(item.key)
              ? {
                  sensitivePayloadViolations: Array.isArray(input.runtimeArtifacts?.sensitive_payload_violations)
                  ? input.runtimeArtifacts.sensitive_payload_violations.slice(0, 3)
                  : [],
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value
                }
          : isChildContextSignalKey(item.key)
              ? buildChildContextFallbackEvidence({
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value,
                  snapshot: input.snapshot
                })
            : /accessibility\.accessibility_contact_method_present/i.test(item.key)
              ? buildAccessibilitySupportFallbackEvidence({
                  keyPageDiscoverySummary: input.runtimeArtifacts?.key_page_discovery_summary ?? null,
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value,
                  snapshot: input.snapshot
                })
            : /disclosure\.cookie_policy_structurally_obstructed/i.test(item.key)
              ? buildCookiePolicyFallbackEvidence({
                  keyPageDiscoverySummary: input.runtimeArtifacts?.key_page_discovery_summary ?? null,
                  policyEnrichment: input.policyEnrichment ?? [],
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value
                })
            : /commerce\.affiliate_disclosure_present|disclosure\.key_page_discovery_unresolved_after_bounded_search|disclosure\.privacy_policy_present|disclosure\.terms_of_service_present|disclosure\.cookie_policy_present|disclosure\.contact_page_present|privacy\.do_not_sell_link_present/i.test(item.key)
              ? buildSnapshotDisclosureFallbackEvidence({
                  keyPageDiscoverySummary: input.runtimeArtifacts?.key_page_discovery_summary ?? null,
                  policyEnrichment: input.policyEnrichment ?? [],
                  relatedSignals: (input.allSignals ?? input.sectionItems).map((signalLike) => ({
                    key: signalLike.key,
                    value: signalLike.value
                  })),
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value,
                  snapshot: input.snapshot
                })
            : keyPageType
              ? {
                  fetchQuality: keyPageSummary?.fetchQuality ?? null,
                  keyPageAttemptCount: keyPageSummary?.attemptCount ?? null,
                  keyPageDiscoverySource: keyPageSummary?.bestDiscoverySource ?? null,
                  keyPageGuessedOnly: keyPageSummary?.guessedOnly ?? null,
                  keyPageAttemptedUrls: keyPageSummary?.attemptedUrls ?? [],
                  keyPageStopReason: keyPageSummary?.stopReason ?? null,
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value
                }
              : {
                  accessibilityRuleExamples,
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value
                };
      const hybridFallbackEvidence = getHybridSignalFallbackEvidence({
        runtimeArtifacts: input.runtimeArtifacts,
        signalKey: item.key,
        signalLabel: item.label,
        signalValue: item.value
      });
      const fallbackEvidence =
        hybridFallbackEvidence && baseFallbackEvidence
          ? { ...baseFallbackEvidence, ...hybridFallbackEvidence }
          : hybridFallbackEvidence ?? baseFallbackEvidence;

      if (!shouldSurfacePrimarySignalFinding({
        fallbackEvidence,
        key: item.key,
        linkedValidationEvidence: linkedValidationFinding?.evidence ?? null,
        signalSource: item.source
      })) {
        return [];
      }

      return [{
        categoryId: input.categoryId,
        description: getSignalConcernReason(item.key, item.value) ?? "This signal is worth reviewer attention.",
        fallbackEvidence,
        id: `${input.sectionId}-signal-${item.key}`,
        linkedValidationFinding,
        observedValue: formatCompactValue(item.value),
        severity: getSignalFindingSeverity(item.key, item.value),
        signalKey: item.key,
        signalLabel: item.label,
        signalSource: item.source,
        sourceType: "signal",
        title: item.label
      }];
    });

  const issueFindings: CanonicalReviewFinding[] = input.issues.map((issue, index) => ({
    categoryId: input.categoryId ?? getDefaultIssueCategoryId(input.sectionId),
    description: issue.description,
    evidence: issue.evidence,
    fallbackEvidence: issue.fallbackEvidence,
    id: `${input.sectionId}-issue-${index}`,
    linkedValidationFinding: input.validationFindingLookup
      ? findValidationFindingForKeys(
          input.validationFindingLookup,
          issue.linkedValidationRuleKeys && issue.linkedValidationRuleKeys.length > 0
            ? issue.linkedValidationRuleKeys
            : getValidationMatchKeysForTitle(issue.title)
        )
      : null,
    observedValue: summarizeObservedIssueEvidence(issue.evidence, issue.severity),
    severity: issue.severity,
    sourceType: "issue",
    title: issue.title
  }));

  return [...signalFindings, ...issueFindings].sort(
    (left, right) => severityRank(left.severity) - severityRank(right.severity) || left.title.localeCompare(right.title)
  );
}

function getDefaultIssueCategoryId(sectionId: string) {
  switch (sectionId) {
    case "policy_clarity_consistency_review":
      return "cross_document_consistency";
    default:
      return undefined;
  }
}

function getSignalFindingSeverity(key: string, value: unknown): CanonicalReviewFinding["severity"] {
  if (isPolicyPositiveSignalKey(key) || /accessibility_contact_method_present/i.test(key)) {
    return "low";
  }

  if (/preconsent|tracking_before_consent|session_replay|conflict|mismatch/i.test(key)) {
    return "high";
  }

  if (/fingerprinting/i.test(key)) {
    return "high";
  }

  if (/popup_behavior|autoplay_media|overlay_blocking/i.test(key)) {
    return "medium";
  }

  if (/gpc_signal_not_honored/i.test(key)) {
    return "high";
  }

  if (/privacy_policy_(surface_missing|fetch_failed)/i.test(key)) {
    return "high";
  }

  if (/weak_cookie_security_attributes_detected|key_page_discovery_unresolved_after_bounded_search|surface_missing|fetch_failed|extraction_limited|dark_pattern|limited_time_offer_language_present|discount_claim_present|original_price_comparison_present|store_credit_only|termination_for_cause|service_suspension_or_termination/i.test(key)) {
    return "medium";
  }

  if (typeof value === "number" && /risk_score|ambiguity_score|friction_score/i.test(key)) {
    return value >= 70 ? "high" : "medium";
  }

  return "medium";
}

function ReviewFindingLinks(input: { finding: UnifiedFindingDisplayPacket }) {
  const shouldShowReferenceLink =
    input.finding.referenceUrl &&
    input.finding.referenceUrl !== input.finding.presentation.suggestedBestPractice?.url;

  if (!input.finding.sourceUrl && !shouldShowReferenceLink) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {input.finding.sourceUrl ? (
        <Link
          href={input.finding.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700"
        >
          <span>?</span>
          <span>{input.finding.sourceLabel ?? "Source"}</span>
        </Link>
      ) : null}
      {shouldShowReferenceLink ? (
        <Link
          href={input.finding.referenceUrl!}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700"
        >
          <span>↗</span>
          <span>{input.finding.referenceLabel ?? "Reference"}</span>
        </Link>
      ) : null}
    </div>
  );
}

function formatValidationSupport(finding: UnifiedFindingDisplayPacket) {
  if (!finding.linkedValidationFinding) {
    return null;
  }

  const parts = [
    finding.linkedValidationFinding.verdict ? `Validation ${finding.linkedValidationFinding.verdict.replaceAll("_", " ")}` : null,
    finding.linkedValidationFinding.agreementScore !== null ? `agreement ${finding.linkedValidationFinding.agreementScore}` : null,
    finding.linkedValidationFinding.systemConfidenceBand
      ? `system confidence ${finding.linkedValidationFinding.systemConfidenceBand.replaceAll("_", " ")}`
      : null
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatFindingPageLabel(pageUrl: string) {
  try {
    const parsed = new URL(pageUrl);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.trim();
    const looksLikeTrackingRequest =
      parsed.search.length > 80 ||
      pathname.includes("/collect") ||
      pathname.includes("/g/collect") ||
      host.includes("google-analytics.com") ||
      host.includes("googletagmanager.com");

    if (looksLikeTrackingRequest) {
      return null;
    }

    const path = `${parsed.pathname}${parsed.search}`.trim();
    if (!path || path === "/") {
      return parsed.hostname;
    }
    return path;
  } catch {
    return null;
  }
}

function getFindingPageAttributionSummary(finding: UnifiedFindingDisplayPacket) {
  if (finding.primaryPageUrl) {
    const pageLabel = formatFindingPageLabel(finding.primaryPageUrl);
    if (pageLabel && finding.affectedPageCount > 1) {
      return `Seen on ${finding.affectedPageCount} pages including ${pageLabel}.`;
    }
    if (pageLabel) {
      return `Seen on ${pageLabel}.`;
    }
  }

  if (finding.affectedPageCount > 0) {
    return `Seen on ${finding.affectedPageCount} page${finding.affectedPageCount === 1 ? "" : "s"}.`;
  }

  return null;
}

function summarizeObservedIssueEvidence(evidence: string[] | undefined, severity: CanonicalReviewFinding["severity"]) {
  if (!evidence || evidence.length === 0) {
    return `${severity} severity`;
  }

  const normalizedEvidence = evidence.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  if (normalizedEvidence.length === 0) {
    return `${severity} severity`;
  }

  const nonUrlEvidence = normalizedEvidence.filter((entry) => !/^https?:\/\//i.test(entry.trim()));
  if (nonUrlEvidence.length > 0) {
    return summarizeReviewIssueEvidence(nonUrlEvidence);
  }

  return normalizedEvidence.length === 1 ? "Linked evidence available" : `${normalizedEvidence.length} linked evidence items`;
}

function isPositiveSurfaceFinding(finding: UnifiedFindingDisplayPacket) {
  return new Set([
    "accessibility_support_path_present",
    "affiliate_disclosure_present",
    "arbitration_clause_present",
    "behavioral_analytics_disclosure_present",
    "children_privacy_disclosure_present",
    "contact_support_path_present",
    "cookie_policy_present",
    "gpc_disclosure_present",
    "privacy_contact_path_present",
    "privacy_policy_present",
    "privacy_rights_path_present",
    "targeted_advertising_choices_present",
    "targeted_advertising_disclosure_present",
    "terms_of_service_present",
    "third_party_advertising_disclosure_present",
    "tracking_technologies_disclosure_present"
  ]).has(finding.unifiedFindingId);
}

function getFindingToneClasses(finding: UnifiedFindingDisplayPacket) {
  if (isPositiveSurfaceFinding(finding)) {
    return "border-emerald-200 bg-emerald-50";
  }

  switch (finding.severity) {
    case "high":
      return "border-rose-200 bg-rose-50";
    case "medium":
      return "border-amber-200 bg-amber-50";
    default:
      return "border-sky-200 bg-sky-50";
  }
}

function getFindingBadgeClasses(finding: UnifiedFindingDisplayPacket) {
  if (isPositiveSurfaceFinding(finding)) {
    return "bg-emerald-100 text-emerald-900";
  }

  switch (finding.severity) {
    case "high":
      return "bg-rose-100 text-rose-900";
    case "medium":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-sky-100 text-sky-900";
  }
}

function getScanFindingSeverityWeight(severity: UnifiedFindingDisplayPacket["severity"]) {
  switch (severity) {
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function getConfidenceBadgeClasses(band: UnifiedFindingDisplayPacket["confidenceBand"]) {
  switch (band) {
    case "high":
      return "bg-emerald-100 text-emerald-900";
    case "moderate":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function getPresentationStatusBadgeClasses(status: UnifiedFindingDisplayPacket["presentationDecision"]["status"]) {
  switch (status) {
    case "surface":
      return "bg-emerald-100 text-emerald-900";
    case "audit_only":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-slate-200 text-slate-700";
  }
}

function getVerificationBadgeClasses(state: UnifiedFindingDisplayPacket["presentationDecision"]["verificationState"]) {
  switch (state) {
    case "verified":
      return "bg-emerald-100 text-emerald-900";
    case "runtime":
      return "bg-sky-100 text-sky-900";
    case "discovered":
      return "bg-amber-100 text-amber-900";
    case "blocked":
      return "bg-rose-100 text-rose-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function getCollapsedFindingSummary(finding: UnifiedFindingDisplayPacket) {
  const source = (finding.observedValue ?? "").trim();
  if (!source) {
    return null;
  }

  const normalized = source.endsWith(".") ? source.slice(0, -1) : source;
  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 117).trimEnd()}...`;
}

function DisclosureChevron(input?: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={input?.className ?? "h-4 w-4"}
      viewBox="0 0 20 20"
      fill="none"
    >
      <path d="M7 4L13 10L7 16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" />
    </svg>
  );
}

function ReviewFindingCard(input: { finding: UnifiedFindingDisplayPacket }) {
  const validationSupport = formatValidationSupport(input.finding);
  const pageAttribution = getFindingPageAttributionSummary(input.finding);
  const evidenceSummary = summarizeEvidence(input.finding);
  const confidenceRationale = input.finding.presentationDecision.confidenceRationale;
  const collapsedSummary = getCollapsedFindingSummary(input.finding);
  const findingJsonPayload = JSON.stringify(input.finding, null, 2);
  const positiveSurfaceFinding = isPositiveSurfaceFinding(input.finding);

  return (
    <details className={`group/finding rounded-lg border px-3 py-3 ${getFindingToneClasses(input.finding)}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 marker:hidden [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-flex shrink-0 text-slate-400 transition-transform group-open/finding:rotate-90">
          <DisclosureChevron />
        </span>
        <p className="shrink-0 whitespace-nowrap text-sm font-semibold text-slate-950">
          {input.finding.presentation.findingName}
        </p>
        <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getFindingBadgeClasses(input.finding)}`}>
          {positiveSurfaceFinding ? "Positive surface" : input.finding.severity}
        </span>
        <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getPresentationStatusBadgeClasses(input.finding.presentationDecision.status)}`}>
          {input.finding.presentationDecision.status === "surface"
            ? "Surface"
            : input.finding.presentationDecision.status === "audit_only"
              ? "Audit only"
              : "Suppressed"}
        </span>
        <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getSurfacingLaneBadgeClasses(input.finding.surfacingDecision.reportLane)}`}>
          {getSurfacingLaneLabel(input.finding.surfacingDecision.reportLane)}
        </span>
        <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getSurfacingDecisionStateBadgeClasses(input.finding.surfacingDecision.decisionState)}`}>
          {getSurfacingDecisionStateLabel(input.finding.surfacingDecision.decisionState)}
        </span>
        <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getVerificationBadgeClasses(input.finding.presentationDecision.verificationState)}`}>
          {input.finding.presentationDecision.verificationLabel}
        </span>
        {collapsedSummary ? (
          <p className="min-w-0 truncate text-xs font-mono text-slate-500">
            <span aria-hidden="true" className="mr-2 text-slate-300">
              •
            </span>
            {collapsedSummary}
          </p>
        ) : null}
      </summary>

      <div className="mt-4 grid gap-4 md:grid-cols-[1.1fr_1.5fr_1.8fr]">
        <div className="min-w-0 space-y-2">
          <div>
            <p className="mt-1 text-sm text-slate-700">
              {input.finding.observedValue ?? (positiveSurfaceFinding ? "Positive surface detected" : `${input.finding.severity} severity`)}
            </p>
            {pageAttribution ? <p className="mt-1 text-xs text-slate-500">{pageAttribution}</p> : null}
          </div>
          {input.finding.presentation.confidenceScore ? (
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Confidence {input.finding.presentation.confidenceScore}</p>
          ) : null}
          {validationSupport ? <p className="text-xs text-slate-500">{validationSupport}</p> : null}
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Why It Matters</p>
          <p className="text-sm text-slate-700">{input.finding.presentation.whyThisMatters}</p>
        </div>
        <div className="min-w-0 space-y-2">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Suggested Fix</p>
            <p className="text-sm text-slate-700">{input.finding.presentation.suggestedFix}</p>
          </div>
          {input.finding.presentation.suggestedBestPractice ? (
            <Link
              href={input.finding.presentation.suggestedBestPractice.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700"
            >
              <span>↗</span>
              <span>{input.finding.presentation.suggestedBestPractice.label}</span>
            </Link>
          ) : null}
          <ReviewFindingLinks finding={input.finding} />
        </div>
      </div>
      <details className="group/evidence mt-3 rounded-lg border border-slate-200/80 bg-white/60 px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 marker:hidden [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="inline-flex shrink-0 text-slate-400 transition-transform group-open/evidence:rotate-90">
            <DisclosureChevron />
          </span>
          <span>Evidence</span>
        </summary>
        <div className="mt-2 space-y-2 text-xs text-slate-500">
          <p>{evidenceSummary}</p>
          <p>{confidenceRationale}</p>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Surfacing Decision</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getSurfacingLaneBadgeClasses(input.finding.surfacingDecision.reportLane)}`}>
                {getSurfacingLaneLabel(input.finding.surfacingDecision.reportLane)}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getSurfacingDecisionStateBadgeClasses(input.finding.surfacingDecision.decisionState)}`}>
                {getSurfacingDecisionStateLabel(input.finding.surfacingDecision.decisionState)}
              </span>
              {input.finding.surfacingDecision.supportTargetId ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 ring-1 ring-slate-200">
                  supports {input.finding.surfacingDecision.supportTargetId}
                </span>
              ) : null}
              {input.finding.surfacingDecision.supports.length > 0 ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 ring-1 ring-slate-200">
                  anchors {input.finding.surfacingDecision.supports.length}
                </span>
              ) : null}
            </div>
            <p>{input.finding.surfacingDecision.decisionReasons[0] ?? "No surfacing rationale retained."}</p>
            <p className="font-mono text-[11px] text-slate-500">
              {input.finding.surfacingDecision.appliedRules.join(", ")}
            </p>
          </div>
          {input.finding.presentationDecision.downgradeReasons.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Why It Was Limited</p>
              <ul className="space-y-1 text-xs text-slate-600">
                {input.finding.presentationDecision.downgradeReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <details className="group/json">
            <summary className="flex cursor-pointer list-none items-center gap-2 marker:hidden [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden="true"
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-slate-500"
                title="Show technical JSON"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 4 4 12l4 8" />
                  <path d="M16 4l4 8-4 8" />
                  <path d="M14 3 10 21" />
                </svg>
              </span>
            </summary>
            <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-[11px] leading-5 text-slate-600">
              {findingJsonPayload}
            </pre>
          </details>
        </div>
      </details>
    </details>
  );
}

function summarizeEvidence(packet: UnifiedFindingDisplayPacket) {
  const primaryPageLabel = packet.primaryPageUrl ? formatFindingPageLabel(packet.primaryPageUrl) : null;
  const parts = [
    primaryPageLabel
      ? packet.affectedPageCount > 1
        ? `${packet.affectedPageCount} pages including ${primaryPageLabel}`
        : `page ${primaryPageLabel}`
      : packet.affectedPageCount > 0
        ? `${packet.affectedPageCount} page${packet.affectedPageCount === 1 ? "" : "s"}`
        : null,
    packet.confidenceInputs.signalCount > 0 ? `${packet.confidenceInputs.signalCount} signal${packet.confidenceInputs.signalCount === 1 ? "" : "s"}` : null,
    packet.confidenceInputs.validationCount > 0
      ? `${packet.confidenceInputs.validationCount} validation row${packet.confidenceInputs.validationCount === 1 ? "" : "s"}`
      : null,
    packet.confidenceInputs.issueCount > 0 ? `${packet.confidenceInputs.issueCount} synthesized issue${packet.confidenceInputs.issueCount === 1 ? "" : "s"}` : null
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" · ") : "Evidence packet assembled for this finding.";
}

function deriveAgencyAdvisoryThemes(findings: UnifiedFindingDisplayPacket[]) {
  const themes = new Set<string>();

  for (const finding of findings) {
    switch (finding.details?.family) {
      case "consent_tracking":
        themes.add("consent and tracking controls");
        break;
      case "contradiction":
        themes.add("public claims versus observed behavior");
        break;
      case "rights_gap":
      case "policy_extraction":
      case "coverage_gap":
        themes.add("policy and disclosure coverage");
        break;
      case "accessibility":
        themes.add("accessibility and task completion");
        break;
      case "commercial":
        themes.add("commercial transparency and pressure tactics");
        break;
      case "sensitive_data":
        themes.add("sensitive-data handling");
        break;
      case "financial_promotion":
        themes.add("financial promotions and disclosure risk");
        break;
      case "context":
        themes.add("high-risk market context");
        break;
      default:
        break;
    }
  }

  return [...themes];
}

export function deriveExecutiveSummaryThemeNarrative(themes: string[]) {
  if (themes.length === 0) {
    return "The surfaced findings do not yet point to one dominant risk pattern.";
  }

  if (themes.length === 1) {
    return `The strongest pattern in this scan involves ${themes[0]}.`;
  }

  if (themes.length === 2) {
    return `The strongest patterns in this scan involve ${themes[0]} and ${themes[1]}.`;
  }

  return `The strongest patterns in this scan involve ${themes[0]}, ${themes[1]}, and ${themes[2]}.`;
}

function deriveThemeCounts(findings: UnifiedFindingDisplayPacket[]) {
  const counts = new Map<string, { count: number; highCount: number; mediumCount: number; lowCount: number }>();

  for (const finding of findings) {
    let theme: string | null = null;

    switch (finding.details?.family) {
      case "consent_tracking":
        theme = "Consent & tracking";
        break;
      case "contradiction":
        theme = "Claims vs behavior";
        break;
      case "rights_gap":
      case "policy_extraction":
      case "coverage_gap":
        theme = "Policy & disclosure";
        break;
      case "accessibility":
        theme = "Accessibility";
        break;
      case "commercial":
        theme = "Commercial practices";
        break;
      case "sensitive_data":
        theme = "Sensitive-data handling";
        break;
      case "financial_promotion":
        theme = "Financial promotions";
        break;
      case "context":
        theme = "High-risk context";
        break;
      default:
        theme = null;
        break;
    }

    if (theme) {
      const current = counts.get(theme) ?? { count: 0, highCount: 0, mediumCount: 0, lowCount: 0 };
      counts.set(theme, {
        count: current.count + 1,
        highCount: current.highCount + (finding.severity === "high" ? 1 : 0),
        mediumCount: current.mediumCount + (finding.severity === "medium" ? 1 : 0),
        lowCount: current.lowCount + (finding.severity === "low" ? 1 : 0)
      });
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([label, value]) => ({ ...value, label }));
}

function formatVendorGroupLabel(key: string) {
  switch (key) {
    case "analytics":
      return "Analytics";
    case "advertising":
      return "Advertising";
    case "social":
      return "Social";
    case "session_replay":
      return "Session replay";
    case "tag_manager":
      return "Tag manager";
    case "cmp":
      return "Consent management";
    case "accessibility_widget":
      return "Accessibility widget";
    case "payment":
      return "Payment";
    case "chat_support":
      return "Chat support";
    case "marketing":
      return "Marketing";
    case "fingerprinting":
      return "Fingerprinting";
    case "hosting":
      return "Hosting";
    case "ai_assistant":
      return "AI assistant";
    default:
      return key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function deriveVendorContext(input: {
  scanRecord: ScanRecordData;
  snapshot: Record<string, unknown>;
}) {
  const vendorGroups = new Map<string, Set<string>>();

  const pushVendor = (groupKey: string, vendorName: string | null | undefined) => {
    if (!vendorName || vendorName.trim().length === 0) {
      return;
    }

    const normalizedName = vendorName.trim();
    const current = vendorGroups.get(groupKey) ?? new Set<string>();
    current.add(normalizedName);
    vendorGroups.set(groupKey, current);
  };

  for (const tracker of input.scanRecord.trackerVendors) {
    pushVendor(tracker.vendorCategory || "other", tracker.vendorName);
  }

  pushVendor("cmp", typeof input.snapshot.cmp_vendor_name === "string" ? input.snapshot.cmp_vendor_name : null);
  pushVendor("ai_assistant", typeof input.snapshot.ai_chatbot_vendor === "string" ? input.snapshot.ai_chatbot_vendor : null);

  return [...vendorGroups.entries()]
    .map(([key, items]) => ({
      key,
      label: formatVendorGroupLabel(key),
      vendors: [...items].sort((left, right) => left.localeCompare(right))
    }))
    .filter((group) => group.vendors.length > 0)
    .sort((left, right) => left.label.localeCompare(right.label));
}

function deriveSectionScore(findings: UnifiedFindingDisplayPacket[]) {
  if (findings.length === 0) {
    return 5;
  }

  const highCount = findings.filter((finding) => finding.severity === "high").length;
  const mediumCount = findings.filter((finding) => finding.severity === "medium").length;
  const lowCount = findings.filter((finding) => finding.severity === "low").length;
  const penalty = Math.min(5, highCount * 1.15 + mediumCount * 0.55 + lowCount * 0.2);
  const score = Math.max(0, 5 - penalty);

  return Math.round(score * 10) / 10;
}

function formatSectionScore(value: number) {
  return `${value.toFixed(1)}/5`;
}

type UnverifiedHomepageReview = {
  coverageLabel: string;
  guidance: string[];
  message: string;
  outcomeTitle: string;
  verifiedPolicyInsights: Array<{
    flags: string[];
    pageLabel: string;
    pageUrl: string | null;
    summary: string | null;
    topics: string[];
  }>;
  verifiedSurfaces: string[];
  recommendationTitle: string;
  reason: string;
  title: string;
  whatThisMeans: string[];
};

type ExecutiveAccessLimitationNotice = {
  finding: CertScoreFinding;
  review: UnverifiedHomepageReview;
  summary: string;
};

export function buildPreviewExecutiveAccessLimitationNotice(input: {
  resultState: {
    code?: string;
    coverageLevel?: string;
    message: string;
    title: string;
  };
  review: UnverifiedHomepageReview | null;
}): ExecutiveAccessLimitationNotice {
  const coverageLabel =
    input.review?.coverageLabel ??
    (input.resultState.coverageLevel === "limited_partial" ? "Partial public verification available" : "No public verification available");
  const review: UnverifiedHomepageReview =
    input.review ??
    {
      coverageLabel,
      guidance: [
        "Retry from a normal browsing session or allow scanner access to the public homepage before relying on privacy findings.",
        "Treat this result as an access limitation, not a substantive privacy or consent review."
      ],
      message: input.resultState.message,
      outcomeTitle: input.resultState.title,
      recommendationTitle: "Protected-Site Workflow Recommended",
      reason: "Reason: preview scores were withheld because the live pass did not verify a trustworthy public site surface.",
      title: input.resultState.title,
      verifiedPolicyInsights: [],
      verifiedSurfaces: [],
      whatThisMeans: [
        "This scan does not support reliable privacy or consent conclusions.",
        "Apparent runtime signals from this limited pass should be treated as non-actionable until a normal public page can be verified."
      ]
    };

  return {
    summary: "Preview scores were withheld because the live pass did not verify a trustworthy public site surface.",
    review,
    finding: {
      id: "access_limited_no_reliable_findings",
      label: "Public site access was limited",
      section: "Runtime & Diagnostics",
      defaultSurfacePriority: 110,
      whyItMatters:
        "When the scanner cannot verify a usable public page, any apparent runtime privacy signals are too thin to treat as trustworthy findings.",
      remediation:
        "Retry from a normal browsing environment or allow scanner access to the public homepage and core legal pages before relying on privacy findings.",
      confidence: "strong",
      directVsInferred: "direct",
      evidencePreview: [review.message, review.reason],
      evidenceRefs: [],
      severity: "medium",
      shortSummary: input.resultState.message
    }
  };
}

type ScanEventSummaryRecord = {
  eventType: string;
  message: string;
  metadataJson: unknown;
};

function getRecordString(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  const value = (record as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getNestedRecord(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  const value = (record as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function deriveProtectedSiteRecommendation(snapshot: Record<string, unknown>, scanEvents: ScanEventSummaryRecord[]) {
  const limitationEvent = [...scanEvents].reverse().find((event) => event.eventType === "access.limitations_detected");
  const limitationMetadata = limitationEvent?.metadataJson ?? null;
  const challengeHeaders = getNestedRecord(limitationMetadata, "challengeHeaders");
  const challengeServer = getRecordString(challengeHeaders, "server");
  const challengeMitigation = getRecordString(challengeHeaders, "cfMitigated");
  const botChallengeDetected = getRecordBoolean(limitationMetadata, "botChallengeDetected");
  const homepageFetchStatus =
    typeof snapshot.homepage_fetch_status === "string" ? snapshot.homepage_fetch_status.toLowerCase() : null;
  const homepageFetchHttpStatus = getRecordNumber(snapshot, "homepage_fetch_http_status");

  const likelyProtectedSite =
    botChallengeDetected === true ||
    (typeof challengeServer === "string" && /cloudflare/i.test(challengeServer)) ||
    (typeof challengeMitigation === "string" && /challenge/i.test(challengeMitigation)) ||
    ((homepageFetchStatus === "forbidden" || homepageFetchStatus === "blocked") && homepageFetchHttpStatus === 403);

  if (!likelyProtectedSite) {
    return {
      recommendationTitle: "Recommended next step",
      guidance: [
        "Confirm the site is reachable outside the scanner and rerun only after the underlying access issue is resolved.",
        "Use the diagnostics below to separate robots restrictions, transport failure, and homepage availability issues before drawing conclusions."
      ]
    };
  }

  return {
    recommendationTitle: "Protected-Site Workflow Recommended",
    guidance: [
      "Treat this as a protected-domain result: the site appears to allow robots access but is challenging or blocking automated browsing.",
      "Use a manual or supervised browser review for evidence collection instead of relying on repeated automated reruns from the same scanner path.",
      "If this domain matters operationally, request allowlisting or a supported review path from the site owner before treating automation as authoritative."
    ]
  };
}

function deriveVerifiedPublicSurfaces(snapshot: Record<string, unknown>) {
  const surfaces: string[] = [];

  if (snapshot.privacy_policy_present === true) {
    surfaces.push("Privacy policy");
  }

  if (snapshot.terms_of_service_present === true) {
    surfaces.push("Terms of service");
  }

  if (snapshot.cookie_policy_present === true) {
    surfaces.push("Cookie policy");
  }

  if (snapshot.contact_page_present === true) {
    surfaces.push("Contact page");
  }

  return surfaces;
}

function isEvidenceRichZeroPagePreviewSnapshot(snapshot: Record<string, unknown>) {
  const verifiedSurfaces = deriveVerifiedPublicSurfaces(snapshot);
  const homepageFetchStatus = getRecordString(snapshot, "homepage_fetch_status");
  const homepageFetchHttpStatus = getRecordNumber(snapshot, "homepage_fetch_http_status");
  const totalSignals = getRecordNumber(snapshot, "total_signals");
  const homepageFetchHttpStatusSuccessful =
    homepageFetchHttpStatus === null || (homepageFetchHttpStatus >= 200 && homepageFetchHttpStatus < 400);

  return (
    getRecordNumber(snapshot, "pages_scanned") === 0 &&
    homepageFetchStatus === "ok" &&
    homepageFetchHttpStatusSuccessful &&
    snapshot.blocked_flag !== true &&
    snapshot.captcha_flag !== true &&
    snapshot.auth_wall_detected !== true &&
    snapshot.auth_wall_suspected !== true &&
    snapshot.challenge_suspected !== true &&
    (
      verifiedSurfaces.length > 0 ||
      (typeof totalSignals === "number" && totalSignals > 0) ||
      snapshot.tracking_before_consent_detected === true ||
      snapshot.preconsent_tracking_detected === true ||
      snapshot.third_party_cookie_set_before_consent === true
    )
  );
}

function humanizePolicyTopic(topic: string) {
  return topic
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function humanizePolicyFlag(flag: string) {
  return flag
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function deriveVerifiedPolicyInsights(policyEnrichments: Array<Record<string, unknown>>) {
  return policyEnrichments
    .filter((row) => {
      const pageType = String(getPolicyPageType(row) ?? "");
      return pageType === "privacy_policy" || pageType === "terms_of_service" || pageType === "cookie_policy";
    })
    .map((row) => {
      const pageType = String(getPolicyPageType(row) ?? "");
      const pageUrl = getPolicyPageUrl(row);
      const summary = getPolicySummaryText(row);
      const policyMentions = getPolicyMentions(row);
      const policyFlags = getPolicyActionableFlags(row);
      const topics = Array.isArray(policyMentions)
        ? policyMentions
            .map((item) =>
              item && typeof item === "object" && typeof (item as Record<string, unknown>).topic === "string"
                ? humanizePolicyTopic(String((item as Record<string, unknown>).topic))
                : null
            )
            .filter((value): value is string => Boolean(value))
            .slice(0, 4)
        : [];
      const flags = Array.isArray(policyFlags)
        ? policyFlags
            .filter((value): value is string => typeof value === "string" && value !== "blocked_homepage_direct_policy_page")
            .map((value) => humanizePolicyFlag(value))
            .slice(0, 3)
        : [];

      return {
        flags,
        pageLabel:
          pageType === "privacy_policy"
            ? "Privacy policy"
            : pageType === "terms_of_service"
              ? "Terms of service"
              : "Cookie policy",
        pageUrl,
        summary,
        topics
      };
    })
    .filter((item) => item.summary || item.topics.length > 0 || item.flags.length > 0);
}

function deriveLoggedNoResultsReason(scanEvents: ScanEventSummaryRecord[]) {
  const shortCircuitEvent = [...scanEvents].reverse().find((event) => event.eventType === "runtime.build_phase_diagnostic" && (
    getRecordString(event.metadataJson, "phase") === "scan_short_circuit" ||
    getRecordString(event.metadataJson, "stepKey") === "scan_short_circuit"
  ));

  if (shortCircuitEvent) {
    const metadata = shortCircuitEvent.metadataJson;
    const reason = getRecordString(metadata, "reason");
    const homepageFetchHttpStatus =
      metadata && typeof metadata === "object" && !Array.isArray(metadata) && typeof (metadata as Record<string, unknown>).homepageFetchHttpStatus === "number"
        ? Number((metadata as Record<string, unknown>).homepageFetchHttpStatus)
        : null;

    if (reason === "robots_disallowed") {
      return "Reason: robots.txt disallowed scanner access to the homepage.";
    }
    if (reason === "homepage_blocked") {
      return homepageFetchHttpStatus
        ? `Reason: homepage request was blocked with HTTP ${homepageFetchHttpStatus}.`
        : "Reason: homepage request was blocked by bot protection, access controls, or a forbidden response.";
    }
    if (reason === "homepage_timeout") {
      return "Reason: homepage navigation timed out before the scanner could verify a usable page surface.";
    }
    if (reason === "homepage_not_found") {
      return homepageFetchHttpStatus
        ? `Reason: homepage returned HTTP ${homepageFetchHttpStatus} Not Found.`
        : "Reason: homepage returned a not-found response.";
    }
    if (reason === "homepage_unreachable") {
      return "Reason: homepage could not be reached reliably because of a connection, DNS, TLS, or other transport failure.";
    }
  }

  const browserDiagnostic = [...scanEvents].reverse().find((event) => event.eventType === "runtime.browser_pass_diagnostic");
  const browserError =
    getRecordString(browserDiagnostic?.metadataJson, "error") ??
    getRecordString(browserDiagnostic?.metadataJson, "navigationError") ??
    browserDiagnostic?.message ??
    null;

  if (browserError) {
    if (/err_name_not_resolved|dns|name not resolved/i.test(browserError)) {
      return "Reason: homepage could not be reached because the domain failed DNS resolution.";
    }
    if (/ssl|tls|certificate|protocol/i.test(browserError)) {
      return "Reason: homepage could not be reached because the connection failed during TLS or SSL setup.";
    }
    if (/timeout|timed out/i.test(browserError)) {
      return "Reason: homepage navigation timed out before the scanner could verify a usable page surface.";
    }
    if (/403|forbidden|access denied|blocked/i.test(browserError)) {
      return "Reason: homepage request was blocked by bot protection, access controls, or a forbidden response.";
    }
  }

  return null;
}

function deriveUnverifiedHomepageReason(snapshot: Record<string, unknown>, scanEvents: ScanEventSummaryRecord[] = []) {
  const canonicalStopReasonDetail =
    typeof snapshot.stop_reason_detail === "string" && snapshot.stop_reason_detail.trim().length > 0
      ? snapshot.stop_reason_detail.trim()
      : null;
  if (canonicalStopReasonDetail) {
    return `Reason: ${canonicalStopReasonDetail}`;
  }

  const loggedReason = deriveLoggedNoResultsReason(scanEvents);
  if (loggedReason) {
    return loggedReason;
  }

  return (
    deriveScanStopReason({
      authWallDetected: snapshot.auth_wall_detected === true,
      blockedFlag: snapshot.blocked_flag === true,
      captchaFlag: snapshot.captcha_flag === true,
      homepageFetchHttpStatus:
        typeof snapshot.homepage_fetch_http_status === "number" ? snapshot.homepage_fetch_http_status : null,
      homepageFetchStatus: typeof snapshot.homepage_fetch_status === "string" ? snapshot.homepage_fetch_status : null,
      pagesScanned: typeof snapshot.pages_scanned === "number" ? snapshot.pages_scanned : null,
      robotsAllowed: snapshot.robots_allowed === true ? true : snapshot.robots_allowed === false ? false : null,
      robotsFetchHttpStatus: typeof snapshot.robots_fetch_http_status === "number" ? snapshot.robots_fetch_http_status : null,
      robotsFetchStatus: typeof snapshot.robots_fetch_status === "string" ? snapshot.robots_fetch_status : null
    })?.reason ?? "Reason: the scanner could not verify a usable homepage surface."
  );
}

export function deriveUnverifiedHomepageReview(
  snapshot: Record<string, unknown>,
  scanEvents: ScanEventSummaryRecord[] = [],
  policyEnrichments: Array<Record<string, unknown>> = []
): UnverifiedHomepageReview | null {
  if (isEvidenceRichZeroPagePreviewSnapshot(snapshot)) {
    return null;
  }

  const reason = deriveUnverifiedHomepageReason(snapshot, scanEvents);
  const recommendation = deriveProtectedSiteRecommendation(snapshot, scanEvents);
  const verifiedSurfaces = deriveVerifiedPublicSurfaces(snapshot);
  const verifiedPolicyInsights = deriveVerifiedPolicyInsights(policyEnrichments);
  const stopReason = deriveScanStopReason({
    authWallDetected: snapshot.auth_wall_detected === true,
    blockedFlag: snapshot.blocked_flag === true,
    captchaFlag: snapshot.captcha_flag === true,
    homepageFetchHttpStatus: typeof snapshot.homepage_fetch_http_status === "number" ? snapshot.homepage_fetch_http_status : null,
    homepageFetchStatus: typeof snapshot.homepage_fetch_status === "string" ? snapshot.homepage_fetch_status : null,
    pagesScanned: typeof snapshot.pages_scanned === "number" ? snapshot.pages_scanned : null,
    robotsAllowed: snapshot.robots_allowed === true ? true : snapshot.robots_allowed === false ? false : null,
    robotsFetchHttpStatus: typeof snapshot.robots_fetch_http_status === "number" ? snapshot.robots_fetch_http_status : null,
    robotsFetchStatus: typeof snapshot.robots_fetch_status === "string" ? snapshot.robots_fetch_status : null
  });

  if (!stopReason) {
    return null;
  }

  return {
    coverageLabel: verifiedSurfaces.length > 0 ? "Partial public verification available" : "No public verification available",
    guidance: recommendation.guidance,
    reason,
    outcomeTitle: stopReason.outcomeTitle,
    verifiedPolicyInsights,
    verifiedSurfaces,
    recommendationTitle: recommendation.recommendationTitle,
    title: stopReason.reviewTitle,
    message:
      verifiedSurfaces.length > 0
        ? `${stopReason.reviewMessage} Verified public surfaces detected: ${verifiedSurfaces.join(", ")}.`
        : stopReason.reviewMessage,
    whatThisMeans: stopReason.whatThisMeans
  };
}

export function deriveExecutiveSummaryScanCondition(snapshot: Record<string, unknown>) {
  const review = deriveUnverifiedHomepageReview(snapshot);
  if (!review) {
    return null;
  }

  return `${review.message} ${review.reason}`;
}

function deriveBrowserBlockReason(scanEvents: ScanEventSummaryRecord[]) {
  for (const event of scanEvents) {
    if (event.eventType !== "runtime.build_phase_diagnostic") {
      continue;
    }

    const metadata = getRecord(event.metadataJson);
    if (!metadata) {
      continue;
    }

    const phase = getRecordString(metadata, "phase");
    const reason = getRecordString(metadata, "reason");
    const reasonDetail = getRecordString(metadata, "reasonDetail");
    const finalDocumentStatus = getRecordNumber(metadata, "finalDocumentStatus");

    if ((phase === "hybrid_auto_decision" || phase === "hybrid_auto_browser_bypass") && reason === "http_block_status") {
      return reasonDetail ?? (typeof finalDocumentStatus === "number" ? `The live browser pass reached a protected page with HTTP ${finalDocumentStatus}.` : null);
    }

    if (typeof finalDocumentStatus === "number" && finalDocumentStatus >= 400) {
      return reasonDetail ?? `The live browser pass reached a protected page with HTTP ${finalDocumentStatus}.`;
    }
  }

  return null;
}

export function deriveExecutiveAccessLimitationNotice(
  snapshot: Record<string, unknown>,
  scanEvents: ScanEventSummaryRecord[] = [],
  policyEnrichments: Array<Record<string, unknown>> = []
): ExecutiveAccessLimitationNotice | null {
  const review = deriveUnverifiedHomepageReview(snapshot, scanEvents, policyEnrichments);
  const verifiedSurfaceCount =
    typeof snapshot.verified_public_surfaces_count === "number"
      ? snapshot.verified_public_surfaces_count
      : review?.verifiedSurfaces.length ?? 0;
  const browserBlockReason = deriveBrowserBlockReason(scanEvents);
  const verifiedPolicyInsights = review?.verifiedPolicyInsights ?? [];
  const blockedAccessObserved =
    snapshot.blocked_flag === true ||
    snapshot.auth_wall_detected === true ||
    snapshot.captcha_flag === true ||
    typeof browserBlockReason === "string" ||
    getRecordString(snapshot, "homepage_fetch_status") === "forbidden" ||
    getRecordString(snapshot, "homepage_fetch_status") === "blocked" ||
    (typeof snapshot.homepage_fetch_http_status === "number" && snapshot.homepage_fetch_http_status >= 400);

  if (!blockedAccessObserved) {
    return null;
  }

  if (verifiedSurfaceCount > 0 || verifiedPolicyInsights.length > 0) {
    return null;
  }

  const effectiveReview: UnverifiedHomepageReview =
    review ??
    {
      coverageLabel: "No public verification available",
      guidance: [
        "Retry from a normal browsing session or allow scanner access to the public homepage before relying on privacy findings.",
        "Treat this result as an access limitation, not a substantive privacy or consent review."
      ],
      message: "The live browser pass hit a protected page before the scan could establish a trustworthy public browsing path.",
      outcomeTitle: "Access limited during live browser verification",
      verifiedPolicyInsights: [],
      verifiedSurfaces: [],
      recommendationTitle: "Protected-Site Workflow Recommended",
      reason: browserBlockReason ? `Reason: ${browserBlockReason}` : "Reason: the live browser pass did not yield a trustworthy public page.",
      title: "Access limited by site protections",
      whatThisMeans: [
        "This scan does not support reliable privacy or consent conclusions.",
        "Any apparent runtime signals from this blocked session should be treated as non-actionable until a normal public page can be verified."
      ]
    };

  return {
    summary:
      "No reliable privacy or consent findings were retained because the live scan could not verify a trustworthy public page.",
    review: effectiveReview,
    finding: {
      id: "access_limited_no_reliable_findings",
      label: "Public site access was limited",
      section: "Runtime & Diagnostics",
      defaultSurfacePriority: 110,
      whyItMatters:
        "When the scanner cannot verify a usable public page, any apparent runtime privacy signals are too thin to treat as trustworthy findings.",
      remediation:
        "Retry from a normal browsing environment or allow scanner access to the public homepage and core legal pages before relying on privacy findings.",
      confidence: "strong",
      directVsInferred: "direct",
      evidencePreview: [browserBlockReason ?? effectiveReview.message, effectiveReview.reason],
      evidenceRefs: [],
      severity: "medium",
      shortSummary:
        "No reliable privacy or consent findings were retained because the live browser pass did not produce a trustworthy public page."
    }
  };
}

function LimitedSurfaceReview(input: { review: UnverifiedHomepageReview }) {
  return (
    <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5">
      <div className="space-y-1">
        <p className="text-base font-semibold text-amber-950">Executive summary</p>
        <p className="text-sm font-semibold text-amber-950">{input.review.title}</p>
      </div>
      <div className="rounded-xl border border-amber-200/80 bg-white/60 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">Scan Outcome</p>
        <p className="mt-1 text-sm font-medium text-amber-950">{input.review.outcomeTitle}</p>
      </div>
      <div className="rounded-xl border border-amber-200/80 bg-white/60 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">Coverage</p>
        <p className="mt-1 text-sm font-medium text-amber-950">{input.review.coverageLabel}</p>
      </div>
      <div className="rounded-xl border border-amber-200/80 bg-white/60 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">Exact Stop Reason</p>
        <p className="mt-1 text-sm font-medium text-amber-950">{input.review.reason}</p>
      </div>
      <p className="text-sm text-amber-900">{input.review.message}</p>
      {input.review.verifiedSurfaces.length > 0 ? (
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">Verified Public Surfaces</p>
          <ul className="mt-2 space-y-2 text-sm text-emerald-950">
            {input.review.verifiedSurfaces.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {input.review.verifiedPolicyInsights.length > 0 ? (
        <div className="rounded-xl border border-sky-200/80 bg-sky-50/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">Verified Policy Insights</p>
          <div className="mt-3 space-y-3">
            {input.review.verifiedPolicyInsights.map((item) => (
              <div key={`${item.pageLabel}:${item.pageUrl ?? item.summary ?? "policy"}`} className="space-y-1 text-sm text-sky-950">
                <p className="font-medium">
                  {item.pageUrl ? (
                    <Link href={item.pageUrl} className="underline underline-offset-2">
                      {item.pageLabel}
                    </Link>
                  ) : (
                    item.pageLabel
                  )}
                </p>
                {item.summary ? <p>{item.summary}</p> : null}
                {item.topics.length > 0 ? <p>Topics: {item.topics.join(", ")}</p> : null}
                {item.flags.length > 0 ? <p>Flags: {item.flags.join(", ")}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="rounded-xl border border-amber-200/80 bg-white/60 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">What this means</p>
        <ul className="mt-2 space-y-2 text-sm text-amber-950">
          {input.review.whatThisMeans.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-amber-200/80 bg-white/60 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">{input.review.recommendationTitle}</p>
        <ul className="mt-2 space-y-2 text-sm text-amber-950">
          {input.review.guidance.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function formatExecutionTierLabel(value: string | null | undefined) {
  switch (value) {
    case "tier0_passive":
      return "Tier 0";
    case "tier1_front_door":
      return "Tier 1";
    case "tier2_browser_surface":
      return "Tier 2";
    case "tier3_runtime_observation":
      return "Tier 3";
    case "tier4a_surface_inspection":
      return "Tier 4A";
    case "tier4b_bounded_interaction":
      return "Tier 4B";
    case "tier4c_comparative_interaction":
      return "Tier 4C";
    case "tier5_full_scan":
      return "Tier 5";
    default:
      return null;
  }
}

function formatRecoverableFindingClass(value: string) {
  switch (value) {
    case "access_surface":
      return "Access surface";
    case "privacy_surface":
      return "Privacy surface";
    case "cmp_presence":
      return "CMP presence";
    case "initial_tracking":
      return "Initial tracking";
    case "initial_storage":
      return "Initial storage";
    case "implicit_consent_state":
      return "Implicit consent state";
    case "privacy_choice_surface":
      return "Privacy choice surface";
    case "preferences_ui_exposure":
      return "Preferences UI exposure";
    case "consent_effectiveness":
      return "Consent effectiveness";
    case "policy_runtime_contradiction":
      return "Policy/runtime contradiction";
    default:
      return value;
  }
}

function AccessPostureSummaryCard(input: {
  summary: {
    accessPostureClass: string | null;
    blockVendorGuess?: string | null;
    blockPageClassification?: string | null;
    cmpVendorName?: string | null;
    finalEffectiveUrl?: string | null;
    homepageFetchHttpStatus?: number | null;
    homepageFetchStatus?: string | null;
    highestSuccessfulTier: string | null;
    interruptionLabel: string | null;
    interruptionReason: string | null;
    pagesScanned?: number | null;
    recoverableFindingClasses: string[];
    robotsAllowed?: boolean | null;
    robotsFetchHttpStatus?: number | null;
    serverHeader?: string | null;
    stopTier: string | null;
    stopOutcomeTitle?: string | null;
    stopReason?: string | null;
    stopReviewTitle?: string | null;
    totalSignals?: number | null;
    whatThisMeans?: string[];
    verifiedPublicSurfacesCount?: number | null;
  } | null | undefined;
}) {
  if (!input.summary?.interruptionLabel) {
    return null;
  }

  const formatHomepageEvidence = () => {
    if (typeof input.summary?.homepageFetchHttpStatus === "number") {
      return `HTTP ${input.summary.homepageFetchHttpStatus}`;
    }

    if (typeof input.summary?.homepageFetchStatus === "string" && input.summary.homepageFetchStatus.length > 0) {
      return input.summary.homepageFetchStatus;
    }

    return null;
  };

  const highestSuccessfulTier = formatExecutionTierLabel(input.summary.highestSuccessfulTier);
  const stopTier = formatExecutionTierLabel(input.summary.stopTier);
  const recoverableFindingClasses = input.summary.recoverableFindingClasses
    .filter((value) => typeof value === "string" && value.length > 0)
    .slice(0, 6)
    .map(formatRecoverableFindingClass);
  const robotsPosture =
    input.summary.robotsAllowed === true
      ? typeof input.summary.robotsFetchHttpStatus === "number"
        ? `Allowed (HTTP ${input.summary.robotsFetchHttpStatus})`
        : "Allowed"
      : input.summary.robotsAllowed === false
        ? typeof input.summary.robotsFetchHttpStatus === "number"
          ? `Restricted (HTTP ${input.summary.robotsFetchHttpStatus})`
          : "Restricted"
        : null;
  const evidenceTiles = [
    {
      label: "Homepage",
      value: formatHomepageEvidence()
    },
    {
      label: "Final URL",
      value: input.summary.finalEffectiveUrl
    },
    {
      label: "Server",
      value: input.summary.serverHeader
    },
    {
      label: "Block vendor",
      value: input.summary.blockVendorGuess
    },
    {
      label: "Block page",
      value: input.summary.blockPageClassification
    },
    {
      label: "Robots",
      value: robotsPosture
    },
    {
      label: "Verified surfaces",
      value:
        typeof input.summary.verifiedPublicSurfacesCount === "number" && input.summary.verifiedPublicSurfacesCount > 0
          ? String(input.summary.verifiedPublicSurfacesCount)
          : null
    },
    {
      label: "CMP",
      value: input.summary.cmpVendorName
    },
    {
      label: "Signals retained",
      value:
        typeof input.summary.totalSignals === "number" && input.summary.totalSignals > 0
          ? String(input.summary.totalSignals)
          : null
    },
    {
      label: "Pages scanned",
      value:
        typeof input.summary.pagesScanned === "number" && input.summary.pagesScanned > 0
          ? String(input.summary.pagesScanned)
          : null
    }
  ].filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
  const deepestTierReached = highestSuccessfulTier ?? stopTier;
  const notYetVerified = (() => {
    switch (input.summary.stopTier) {
      case "tier1_front_door":
      case "tier0_passive":
        return [
          "No rendered browser surface was verified.",
          "No initial cookies, storage, or tracker activity were captured.",
          "No consent or privacy interaction flow was tested."
        ];
      case "tier2_browser_surface":
        return [
          "No initial runtime cookie or request capture was completed.",
          "No consent-state or tracker timing evidence was confirmed.",
          "No privacy-choice interaction flow was tested."
        ];
      case "tier3_runtime_observation":
        return [
          "No privacy-choice or preferences interaction flow was tested.",
          "No reject-path or consent-effectiveness verification was completed.",
          "No comparative accept vs reject interaction evidence was collected."
        ];
      case "tier4a_surface_inspection":
        return [
          "No bounded consent action was completed.",
          "No reject-path effectiveness was verified.",
          "No comparative interaction burden was measured."
        ];
      case "tier4b_bounded_interaction":
        return [
          "No comparative accept vs reject interaction evidence was collected.",
          "No full Tier 5 public-surface scan was completed."
        ];
      default:
        return [];
    }
  })();

  return (
    <div className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50 px-6 py-5">
      <div className="space-y-1">
        <p className="text-base font-semibold text-sky-950">Access posture</p>
        <p className="text-sm text-sky-900">
          This scan retained some evidence before access limitations cut off deeper tiers.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-sky-200/80 bg-white/70 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">Deepest tier reached</p>
          <p className="mt-1 text-sm font-medium text-sky-950">{deepestTierReached ?? "Not established"}</p>
        </div>
        <div className="rounded-xl border border-sky-200/80 bg-white/70 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">Status</p>
          <p className="mt-1 text-sm font-medium text-sky-950">{input.summary.interruptionLabel}</p>
        </div>
        {highestSuccessfulTier && highestSuccessfulTier !== deepestTierReached ? (
          <div className="rounded-xl border border-sky-200/80 bg-white/70 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">Highest successful tier</p>
            <p className="mt-1 text-sm font-medium text-sky-950">{highestSuccessfulTier}</p>
          </div>
        ) : null}
        {stopTier && stopTier !== deepestTierReached ? (
          <div className="rounded-xl border border-sky-200/80 bg-white/70 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">Stop tier</p>
            <p className="mt-1 text-sm font-medium text-sky-950">{stopTier}</p>
          </div>
        ) : null}
      </div>
      {evidenceTiles.length > 0 ? (
        <div className="rounded-xl border border-sky-200/80 bg-white/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">What We Uncovered</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {evidenceTiles.map((item) => (
              <div key={item.label} className="rounded-xl border border-sky-200/80 bg-sky-50/60 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">{item.label}</p>
                <p className="mt-1 text-sm font-medium break-all text-sky-950">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {notYetVerified.length > 0 ? (
        <div className="rounded-xl border border-slate-200/80 bg-white/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">What We Could Not Yet Verify</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-900">
            {notYetVerified.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {input.summary.interruptionReason ? (
        <div className="rounded-xl border border-sky-200/80 bg-white/70 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">Why The Scan Stopped Here</p>
          <p className="mt-1 text-sm text-sky-950">{input.summary.interruptionReason}</p>
        </div>
      ) : null}
      {recoverableFindingClasses.length > 0 ? (
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">Recoverable coverage</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {recoverableFindingClasses.map((item) => (
              <span key={item} className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs text-emerald-900">
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AgencyAdvisorySummary(input: {
  sectionTiles: Array<{
    className?: string;
    href: string;
    label: string;
    showValueText?: boolean;
    tooltip?: string;
    value: string;
    valueClassName?: string;
  }>;
  findings: UnifiedFindingDisplayPacket[];
  badges: CanonicalTaxonomyReviewProps["executiveSummary"]["badges"];
  metrics: CanonicalTaxonomyReviewProps["executiveSummary"]["metrics"];
  vendorGroups: Array<{
    key: string;
    label: string;
    vendors: string[];
  }>;
  snapshot: Record<string, unknown>;
  statusCallout: CanonicalTaxonomyReviewProps["executiveSummary"]["statusCallout"];
}) {
  const mainNarrativeFindings = input.findings.filter((finding) => isMainNarrativeFinding(finding));
  const highPriorityCount = mainNarrativeFindings.filter((finding) => finding.severity === "high").length;
  const mediumPriorityCount = mainNarrativeFindings.filter((finding) => finding.severity === "medium").length;
  const lowPriorityCount = mainNarrativeFindings.filter((finding) => finding.severity === "low").length;
  const scanConditionSummary = deriveExecutiveSummaryScanCondition(input.snapshot);
  const themes = deriveAgencyAdvisoryThemes(mainNarrativeFindings).slice(0, 3);
  const topThemes = deriveThemeCounts(mainNarrativeFindings);
  const infrastructureItems = deriveInfrastructureContext(input.snapshot);
  const audienceItems = deriveAudienceSensitivityContext(input.snapshot);
  const summaryBullets = [
    scanConditionSummary,
    highPriorityCount > 0
      ? mediumPriorityCount > 0
        ? `This scan surfaced ${highPriorityCount} high and ${mediumPriorityCount} medium-priority finding${highPriorityCount + mediumPriorityCount === 1 ? "" : "s"} that should be reviewed.`
        : `This scan surfaced ${highPriorityCount} high-priority finding${highPriorityCount === 1 ? "" : "s"} that should be reviewed.`
      : mediumPriorityCount > 0
        ? `This scan surfaced ${mediumPriorityCount} medium-priority finding${mediumPriorityCount === 1 ? "" : "s"} that should be reviewed.`
        : "This scan did not surface any high- or medium-priority findings in the main report.",
    lowPriorityCount > 0
      ? `The report also includes ${lowPriorityCount} advisory finding${lowPriorityCount === 1 ? "" : "s"} shown in blue in the detailed findings below.`
      : null,
    deriveExecutiveSummaryThemeNarrative(themes),
    "Some of these patterns can increase regulatory, customer-trust, or platform-enforcement risk if they are not supported by accurate disclosures and user controls."
  ].filter((bullet): bullet is string => Boolean(bullet));

  const maxThemeCount = topThemes.reduce((max, theme) => Math.max(max, theme.count), 0);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-6 py-5">
      <div className="space-y-4">
        <p className="text-base font-semibold text-slate-900">Supporting analysis</p>

        {topThemes.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Finding mix</p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                  <span>High</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span>Medium</span>
                </span>
                {lowPriorityCount > 0 ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                    <span>Advisory</span>
                  </span>
                ) : null}
              </div>
            </div>
            {lowPriorityCount > 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                Counts below include {lowPriorityCount} advisory finding{lowPriorityCount === 1 ? "" : "s"} shown in blue.
              </p>
            ) : null}
            <div className="mt-3 space-y-3">
              {topThemes.map((theme) => {
                const width = maxThemeCount > 0 ? (theme.count / maxThemeCount) * 75 : 0;
                const highWidth = theme.count > 0 ? (theme.highCount / theme.count) * 100 : 0;
                const mediumWidth = theme.count > 0 ? (theme.mediumCount / theme.count) * 100 : 0;
                const lowWidth = theme.count > 0 ? (theme.lowCount / theme.count) * 100 : 0;
                return (
                  <div key={theme.label} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm text-slate-700">
                      <span>{theme.label}</span>
                      <span className="text-xs text-slate-500">{theme.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="flex h-full" style={{ width: `${width}%` }}>
                        {theme.highCount > 0 ? (
                          <div className="h-full bg-rose-400" style={{ width: `${highWidth}%` }} />
                        ) : null}
                        {theme.mediumCount > 0 ? (
                          <div className="h-full bg-amber-400" style={{ width: `${mediumWidth}%` }} />
                        ) : null}
                        {theme.lowCount > 0 ? (
                          <div className="h-full bg-sky-400" style={{ width: `${lowWidth}%` }} />
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {input.sectionTiles.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Coverage navigation</p>
              <p className="text-xs text-slate-500">Jump into the lower taxonomy matrix if you need section-level review.</p>
            </div>
            <div className="grid gap-2 md:grid-cols-5">
              {input.sectionTiles.map((metric) => (
                <SummaryMetricTile
                  key={metric.label}
                  className={metric.className}
                  href={metric.href}
                  label={metric.label}
                  showValueText={metric.showValueText}
                  tooltip={metric.tooltip}
                  value={metric.value}
                  valueClassName={metric.valueClassName}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
          <ul className="space-y-2 text-sm text-slate-700">
            {summaryBullets.map((bullet) => (
              <li key={bullet}>• {bullet}</li>
            ))}
          </ul>
        </div>

        {(infrastructureItems.length > 0 || audienceItems.length > 0 || input.vendorGroups.length > 0 || input.statusCallout) ? (
          <details className="group/context rounded-lg border border-slate-200/80 bg-white/60 px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 marker:hidden [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="inline-flex shrink-0 text-slate-400 transition-transform group-open/context:rotate-90">
                  <DisclosureChevron />
                </span>
                <span>Operational context</span>
              </summary>

              <div className="mt-2 space-y-4">
                <p className="text-xs text-slate-500">
                  Supporting context from the scan: infrastructure, audience sensitivity, observed vendors, and scan-pass conditions that can affect how findings are interpreted.
                </p>

                <div className="grid gap-4 xl:grid-cols-2">
                  {input.vendorGroups.length > 0 ? (
                    <details className="group/context-card rounded-lg border border-slate-200/80 bg-white/60 px-3 py-2">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 marker:hidden [&::-webkit-details-marker]:hidden">
                        <span aria-hidden="true" className="inline-flex shrink-0 text-slate-400 transition-transform group-open/context-card:rotate-90">
                          <DisclosureChevron />
                        </span>
                        <span>Vendors</span>
                      </summary>
                      <div className="mt-3 space-y-3">
                        {input.vendorGroups.map((group) => (
                          <div key={group.key} className="space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                              {group.label}
                            </p>
                            <ul className="space-y-1 text-sm text-slate-700">
                              {group.vendors.map((vendor) => (
                                <li key={`${group.key}-${vendor}`}>• {vendor}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  <details className="group/context-card rounded-lg border border-slate-200/80 bg-white/60 px-3 py-2">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 marker:hidden [&::-webkit-details-marker]:hidden">
                      <span aria-hidden="true" className="inline-flex shrink-0 text-slate-400 transition-transform group-open/context-card:rotate-90">
                        <DisclosureChevron />
                      </span>
                      <span>Infrastructure profile</span>
                    </summary>
                    {infrastructureItems.length > 0 ? (
                      <ul className="mt-3 space-y-2 text-sm text-slate-700">
                        {infrastructureItems.map((item) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-slate-600">No compact infrastructure context was retained for this scan.</p>
                    )}
                  </details>
                  <details className="group/context-card rounded-lg border border-slate-200/80 bg-white/60 px-3 py-2">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 marker:hidden [&::-webkit-details-marker]:hidden">
                      <span aria-hidden="true" className="inline-flex shrink-0 text-slate-400 transition-transform group-open/context-card:rotate-90">
                        <DisclosureChevron />
                      </span>
                      <span>Audience & sensitive context</span>
                    </summary>
                    {audienceItems.length > 0 ? (
                      <ul className="mt-3 space-y-2 text-sm text-slate-700">
                        {audienceItems.map((item) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                  ) : (
                      <p className="mt-3 text-sm text-slate-600">No children’s-privacy or age-gate context was retained for this scan.</p>
                    )}
                  </details>
                </div>

                <ScanPassWarningCallout badges={input.badges} statusCallout={input.statusCallout} />
              </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function ScanPassWarningCallout(input: {
  badges: CanonicalTaxonomyReviewProps["executiveSummary"]["badges"];
  statusCallout: CanonicalTaxonomyReviewProps["executiveSummary"]["statusCallout"];
}) {
  if (!input.statusCallout) {
    return null;
  }

  const toneClasses =
    input.statusCallout.tone === "danger"
      ? "rounded-lg border border-rose-200/80 bg-rose-50/60 px-3 py-2 text-sm text-rose-950"
      : input.statusCallout.tone === "success"
        ? "rounded-lg border border-emerald-200/80 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-950"
        : "rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-sm text-amber-950";
  const detailClasses =
    input.statusCallout.tone === "danger"
      ? "mt-2 space-y-1 text-rose-900"
      : input.statusCallout.tone === "success"
        ? "mt-2 space-y-1 text-emerald-900"
        : "mt-2 space-y-1 text-amber-900";

  return (
    <details className={`${toneClasses} group/warning`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] marker:hidden [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-flex shrink-0 opacity-70 transition-transform group-open/warning:rotate-90">
          <DisclosureChevron />
        </span>
        <span>{input.statusCallout.title}</span>
      </summary>
      <ul className={detailClasses}>
        {input.statusCallout.details.map((detail) => (
          <li key={detail}>• {detail}</li>
        ))}
      </ul>
      {input.badges.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {input.badges.map((badge) => (
            <div
              key={badge.label}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${
                badge.tone === "warning" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
              }`}
            >
              <span>{badge.label}</span>
              {badge.tooltip ? <InfoTip align="start" text={badge.tooltip} /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </details>
  );
}

function deriveInfrastructureContext(snapshot: Record<string, unknown>) {
  const items = [
    typeof snapshot.hosting_or_cdn_provider === "string" && snapshot.hosting_or_cdn_provider.trim().length > 0
      ? `Hosting/CDN: ${snapshot.hosting_or_cdn_provider}`
      : null,
    typeof snapshot.cdn_provider === "string" && snapshot.cdn_provider.trim().length > 0
      ? `CDN: ${snapshot.cdn_provider}`
      : null,
    typeof snapshot.tls_version_min_supported === "string" && snapshot.tls_version_min_supported.trim().length > 0
      ? `TLS minimum: ${snapshot.tls_version_min_supported}`
      : null,
    typeof snapshot.certificate_authority === "string" && snapshot.certificate_authority.trim().length > 0
      ? `Certificate authority: ${snapshot.certificate_authority}`
      : null,
    typeof snapshot.domain_age_years === "number"
      ? `Domain age: ${snapshot.domain_age_years.toFixed(1)} year${snapshot.domain_age_years === 1 ? "" : "s"}`
      : null,
    snapshot.domain_privacy_protection_enabled === true
      ? "Domain privacy protection is enabled."
      : snapshot.domain_privacy_protection_enabled === false
        ? "Domain privacy protection is not enabled."
        : null,
    typeof snapshot.country_inferred === "string" && snapshot.country_inferred.trim().length > 0
      ? `Country inferred: ${snapshot.country_inferred}`
      : null,
    typeof snapshot.jurisdiction_guess === "string" && snapshot.jurisdiction_guess.trim().length > 0
      ? `Jurisdiction guess: ${snapshot.jurisdiction_guess}`
      : null
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return items.slice(0, 6);
}

function deriveAudienceSensitivityContext(snapshot: Record<string, unknown>) {
  const items = [
    snapshot.children_audience_likely === true
      ? "The site appears likely to target or attract children or younger audiences."
      : null,
    snapshot.kid_directed_content_detected === true
      ? "Kid-directed content cues were detected in the scanned pages."
      : null,
    snapshot.age_gate_present === true
      ? "An age gate was present in the scanned experience."
      : null,
    snapshot.parental_consent_reference_present === true
      ? "Parental-consent language was detected."
      : null,
    snapshot.mentions_coppa === true
      ? "COPPA-related policy language was detected."
      : null,
    snapshot.mentions_under_13 === true
      ? "Under-13 policy language was detected."
      : null,
    snapshot.mentions_under_16 === true
      ? "Under-16 policy language was detected."
      : null,
    typeof snapshot.children_privacy_risk_score === "number" && snapshot.children_privacy_risk_score > 0
      ? `Children’s privacy risk score: ${snapshot.children_privacy_risk_score}.`
      : null,
    snapshot.form_collects_birthdate === true || snapshot.date_of_birth_input_present === true
      ? "Birthdate or age-related collection cues were present."
      : null
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return items.slice(0, 6);
}

export function deriveFindingEvidenceQualitySummary(findings: UnifiedFindingDisplayPacket[]) {
  return {
    auditOnlyCount: findings.filter((finding) => finding.presentationDecision.status === "audit_only").length,
    blockedCount: findings.filter((finding) => finding.presentationDecision.verificationState === "blocked").length,
    discoveredCount: findings.filter((finding) => finding.presentationDecision.verificationState === "discovered").length,
    runtimeCount: findings.filter((finding) => finding.presentationDecision.verificationState === "runtime").length,
    triageCount: findings.filter((finding) => finding.presentationDecision.verificationState === "triage").length,
    verifiedCount: findings.filter((finding) => finding.presentationDecision.verificationState === "verified").length
  };
}

type FindingEvidenceDiagnosticRow = {
  decisionState: UnifiedFindingDisplayPacket["surfacingDecision"]["decisionState"];
  fetchQuality: string | null;
  findingName: string;
  negativeEvidenceFlags: string[];
  reportLane: UnifiedFindingDisplayPacket["surfacingDecision"]["reportLane"];
  status: UnifiedFindingDisplayPacket["presentationDecision"]["status"];
  verificationLabel: string;
};

export function deriveFindingEvidenceDiagnosticRows(findings: UnifiedFindingDisplayPacket[]): FindingEvidenceDiagnosticRow[] {
  return findings.map((finding) => ({
    decisionState: finding.surfacingDecision.decisionState,
    fetchQuality: finding.evidence?.fetchQuality ?? null,
    findingName: finding.presentation.findingName,
    negativeEvidenceFlags: finding.concernContext?.negativeEvidenceFlags ?? [],
    reportLane: finding.surfacingDecision.reportLane,
    status: finding.presentationDecision.status,
    verificationLabel: finding.presentationDecision.verificationLabel
  }));
}

function isMainNarrativeFinding(finding: UnifiedFindingDisplayPacket) {
  return isMainNarrativeSurfacing(finding.surfacingDecision);
}

function isConfidenceCoverageFinding(finding: UnifiedFindingDisplayPacket) {
  return isConfidenceCoverageSurfacing(finding.surfacingDecision);
}

function isSupportingContextFinding(finding: UnifiedFindingDisplayPacket) {
  return isSupportingContextSurfacing(finding.surfacingDecision);
}

function FindingsOverview(input: { findings: UnifiedFindingDisplayPacket[] }) {
  const sortedFindings = [...input.findings].sort((left, right) => {
    const severityDelta = getScanFindingSeverityWeight(right.severity) - getScanFindingSeverityWeight(left.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    const confidenceWeight = { high: 3, moderate: 2, low: 1 } as const;
    const confidenceDelta = confidenceWeight[right.confidenceBand] - confidenceWeight[left.confidenceBand];
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }

    return left.presentation.findingName.localeCompare(right.presentation.findingName);
  });
  const positiveSurfaceFindings = sortedFindings.filter((finding) => isPositiveSurfaceFinding(finding));
  const reviewFindings = sortedFindings.filter((finding) => !isPositiveSurfaceFinding(finding));
  const mainFindings = reviewFindings.filter((finding) => isMainNarrativeFinding(finding));
  const confidenceCoverageFindings = reviewFindings.filter((finding) => isConfidenceCoverageFinding(finding));
  const supportingContextFindings = reviewFindings.filter((finding) => isSupportingContextFinding(finding));
  const highPriorityCount = mainFindings.filter((finding) => finding.severity === "high").length;
  const mediumPriorityCount = mainFindings.filter((finding) => finding.severity === "medium").length;
  const lowPriorityCount = mainFindings.filter((finding) => finding.severity === "low").length;
  const hasAnyFindings =
    mainFindings.length > 0 ||
    confidenceCoverageFindings.length > 0 ||
    supportingContextFindings.length > 0 ||
    positiveSurfaceFindings.length > 0;

  if (!hasAnyFindings) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-6 py-5">
      <details className="group/noteworthy" open={true}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="inline-flex shrink-0 text-slate-400 transition-transform group-open/noteworthy:rotate-90">
              <DisclosureChevron />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-slate-900">Detailed review findings</span>
                <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-rose-800">
                  {highPriorityCount} high
                </span>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-amber-800">
                  {mediumPriorityCount} medium
                </span>
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-sky-800">
                  {lowPriorityCount} advisory
                </span>
              </span>
              <p className="mt-1 text-sm text-slate-500">
                Expanded finding packets, evidence lanes, and review-oriented detail from the lower taxonomy layer.
                {lowPriorityCount > 0 ? ` This scan also surfaced ${lowPriorityCount} advisory finding${lowPriorityCount === 1 ? "" : "s"} shown in blue.` : ""}
              </p>
            </span>
          </span>
        </summary>

        <div className="mt-4">
          {mainFindings.length > 0 ? (
            <div className="space-y-4">
              {mainFindings.map((finding) => (
                <ReviewFindingCard key={`priority-${finding.unifiedFindingId}`} finding={finding} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-sm text-slate-600">No main risk findings were promoted for this scan.</p>
            </div>
          )}

          {confidenceCoverageFindings.length > 0 ? (
            <div className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">Confidence & Coverage</p>
                <p className="text-sm text-slate-500">
                  Important uncertainty, discovery, and extraction limitations surfaced by the scan.
                </p>
              </div>
              <div className="space-y-4">
                {confidenceCoverageFindings.map((finding) => (
                  <ReviewFindingCard key={`confidence-${finding.unifiedFindingId}`} finding={finding} />
                ))}
              </div>
            </div>
          ) : null}

          {positiveSurfaceFindings.length > 0 ? (
            <div className="mt-6 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">Detected Disclosures & Support Surfaces</p>
                <p className="text-sm text-slate-600">
                  Positive first-party legal, privacy, accessibility, and support surfaces retained by the scan.
                </p>
              </div>
              <div className="space-y-4">
                {positiveSurfaceFindings.map((finding) => (
                  <ReviewFindingCard key={`positive-${finding.unifiedFindingId}`} finding={finding} />
                ))}
              </div>
            </div>
          ) : null}

          {supportingContextFindings.length > 0 ? (
            <div className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">Supporting Context</p>
                <p className="text-sm text-slate-500">
                  Related findings retained as support for stronger lead findings in this report.
                </p>
              </div>
              <div className="space-y-4">
                {supportingContextFindings.map((finding) => (
                  <ReviewFindingCard key={`support-${finding.unifiedFindingId}`} finding={finding} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function FindingEvidenceDiagnostics(input: { findings: UnifiedFindingDisplayPacket[] }) {
  const rows = deriveFindingEvidenceDiagnosticRows(input.findings);

  if (rows.length === 0) {
    return (
      <CollapsibleSectionCard
        title={
          <span className="flex items-center gap-1.5">
            <span>Finding evidence diagnostics</span>
            <InfoTip text="Verification quality, fetch quality, and downgrade flags for surfaced findings." />
          </span>
        }
      >
        <p className="text-sm text-slate-600">No surfaced findings were available for evidence diagnostics on this scan.</p>
      </CollapsibleSectionCard>
    );
  }

  return (
    <CollapsibleSectionCard
      title={
        <span className="flex items-center gap-1.5">
          <span>Finding evidence diagnostics</span>
          <InfoTip text="Verification quality, fetch quality, and downgrade flags for surfaced findings." />
        </span>
      }
      contentClassName="space-y-4"
    >
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.findingName} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-slate-900">{row.findingName}</p>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 ring-1 ring-slate-200">
                {row.status === "surface" ? "Surface" : row.status === "audit_only" ? "Audit only" : "Suppressed"}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getSurfacingLaneBadgeClasses(row.reportLane)}`}>
                {getSurfacingLaneLabel(row.reportLane)}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getSurfacingDecisionStateBadgeClasses(row.decisionState)}`}>
                {getSurfacingDecisionStateLabel(row.decisionState)}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 ring-1 ring-slate-200">
                {row.verificationLabel}
              </span>
              {row.fetchQuality ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 ring-1 ring-slate-200">
                  fetch: {row.fetchQuality}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-600">
              {row.negativeEvidenceFlags.length > 0
                ? row.negativeEvidenceFlags.join(", ")
                : "No negative evidence flags retained."}
            </p>
          </div>
        ))}
      </div>
    </CollapsibleSectionCard>
  );
}

function formatReviewFindingSummaryTitle(title: string) {
  const normalized = title
    .replace(/^Possible /i, "")
    .replace(/^Observed /i, "")
    .replace(/\s+detected$/i, "")
    .replace(/\s+present$/i, "")
    .replace(/\s+incidents$/i, "")
    .replace(/\s+candidate$/i, "")
    .trim();

  switch (normalized) {
    case "Pre-consent tracking":
    case "Pre-consent tracking incidents":
      return "Pre-consent tracking";
    case "Session replay tool":
    case "Session replay":
    case "Undisclosed session replay":
      return "Session replay";
    case "Policy-to-behavior conflict":
      return "Policy conflict";
    case "Accessibility claim mismatch":
      return "Claim mismatch";
    case "Store-credit-only remedy":
      return "Store-credit-only remedy";
    case "Low-confidence policy extraction":
      return "Low-confidence extraction";
    default:
      return normalized;
  }
}

function summarizeSectionFindings(findings: UnifiedFindingDisplayPacket[]) {
  if (findings.length === 0) {
    return "No surfaced findings in this section.";
  }

  const labels = findings
    .slice(0, 3)
    .map((finding) => formatReviewFindingSummaryTitle(finding.presentation.findingName));
  const remainder = findings.length - labels.length;

  return `${findings.length} surfaced finding${findings.length === 1 ? "" : "s"}${
    labels.length > 0 ? `: ${labels.join(", ")}${remainder > 0 ? `, +${remainder} more` : ""}` : ""
  }.`;
}

function summarizeSectionFindingCoverage(input: {
  findings: UnifiedFindingDisplayPacket[];
  visibleCategories: Array<{
    category: ReturnType<typeof getReportEvidenceCategoriesForSection>[number];
    items: CanonicalSignalItem[];
  }>;
}) {
  const { findings, visibleCategories } = input;
  const findingCount = findings.length;

  if (findingCount === 0) {
    const populatedCategories = visibleCategories.filter(({ items }) => items.length > 0);
    if (populatedCategories.length === 0) {
      return "No surfaced findings or retained signal context in this section.";
    }

    const labels = populatedCategories.slice(0, 2).map(({ category }) => category.label);
    const remainder = populatedCategories.length - labels.length;
    return `No surfaced findings, but signal context was retained in ${populatedCategories.length} categor${populatedCategories.length === 1 ? "y" : "ies"}${labels.length > 0 ? `: ${labels.join(", ")}${remainder > 0 ? `, +${remainder} more` : ""}` : ""}.`;
  }

  return summarizeSectionFindings(findings);
}

function getMatrixCountTone(count: number) {
  if (count >= 3) {
    return "bg-rose-100 text-rose-900";
  }
  if (count >= 1) {
    return "bg-amber-100 text-amber-900";
  }
  return "bg-slate-100 text-slate-600";
}

function CategorySeverityCounts(input: { findings: UnifiedFindingDisplayPacket[] }) {
  const highCount = input.findings.filter((finding) => finding.severity === "high").length;
  const mediumCount = input.findings.filter((finding) => finding.severity === "medium").length;
  const lowCount = input.findings.filter((finding) => finding.severity === "low").length;

  if (highCount === 0 && mediumCount === 0 && lowCount === 0) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-600">
        —
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {highCount > 0 ? (
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-rose-900">
          {highCount}
        </span>
      ) : null}
      {mediumCount > 0 ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-amber-900">
          {mediumCount}
        </span>
      ) : null}
      {lowCount > 0 ? (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
          {lowCount}
        </span>
      ) : null}
    </div>
  );
}

function CategoryFindingSummaryCard(input: { finding: UnifiedFindingDisplayPacket }) {
  const summary = getCollapsedFindingSummary(input.finding) ?? input.finding.presentation.whyThisMatters;
  const whyItMatters = input.finding.presentation.whyThisMatters;
  const suggestedFix = input.finding.presentation.suggestedFix;
  const findingJsonPayload = JSON.stringify(input.finding, null, 2);
  const positiveSurfaceFinding = isPositiveSurfaceFinding(input.finding);

  return (
    <div className="relative rounded-lg border border-slate-200 bg-white px-3 pt-3 pb-12">
      <div className="flex items-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-slate-900">{input.finding.presentation.findingName}</p>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${getFindingBadgeClasses(input.finding)}`}>
            {positiveSurfaceFinding ? "positive surface" : input.finding.severity}
          </span>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-600">{summary}</p>
      <div className="mt-3 space-y-2">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Why it matters</p>
          <p className="text-xs text-slate-700">{whyItMatters}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Fix it</p>
          <p className="text-xs text-slate-700">{suggestedFix}</p>
        </div>
        {input.finding.presentation.suggestedBestPractice ? (
          <Link
            href={input.finding.presentation.suggestedBestPractice.url}
            target="_blank"
            rel="noreferrer"
            className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700"
          >
            <span>↗</span>
            <span>{input.finding.presentation.suggestedBestPractice.label}</span>
          </Link>
        ) : null}
        <details className="group/json mt-3 group-open/json:rounded-lg group-open/json:bg-slate-50 group-open/json:p-3">
          <summary className="absolute bottom-3 left-3 inline-flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 shadow-sm marker:hidden transition-colors hover:border-slate-400 hover:text-slate-700 group-open/json:static group-open/json:mb-2 group-open/json:border-slate-200 group-open/json:bg-white/80 [&::-webkit-details-marker]:hidden">
            <span className="sr-only">Show technical JSON</span>
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 4 4 12l4 8" />
              <path d="M16 4l4 8-4 8" />
              <path d="M14 3 10 21" />
            </svg>
          </summary>
          <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-600">
            {findingJsonPayload}
          </pre>
        </details>
      </div>
    </div>
  );
}

function CoverageMatrix(input: {
  pillarSections: Array<{
    pillar: (typeof REPORT_PRIMARY_PILLARS)[number];
    sections: Array<{
      alignedReviewFindings: UnifiedFindingDisplayPacket[];
      ownerReviewFindings: UnifiedFindingDisplayPacket[];
      section: ReturnType<typeof getReportSectionsForPillar>[number];
      visibleCategories: Array<{
        category: ReturnType<typeof getReportEvidenceCategoriesForSection>[number];
        items: CanonicalSignalItem[];
      }>;
    }>;
  }>;
}) {
  return (
    <CollapsibleSectionCard
      title="Coverage matrix"
      subtitle="A compact map of where surfaced findings landed across the report taxonomy."
      defaultOpen={false}
      contentClassName="space-y-6"
    >
      {input.pillarSections.map(({ pillar, sections }) => {
        return (
          <div key={pillar.id} className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">{pillar.label}</p>

            <div className="space-y-3">
              {sections.map(({ alignedReviewFindings, ownerReviewFindings, section, visibleCategories }) => (
                <div
                  key={section.id}
                  id={`coverage-section-${section.id}`}
                  className="scroll-mt-24 rounded-xl border border-slate-200 bg-white px-4 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{section.label}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {summarizeSectionFindingCoverage({
                        findings: alignedReviewFindings,
                        visibleCategories
                      })}
                    </p>
                  </div>

                  {visibleCategories.length > 0 ? (
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {visibleCategories.map(({ category }) => {
                        const categoryFindings = alignedReviewFindings.filter(
                          (finding) => getUnifiedFindingCategoryRelation(finding, category.id) !== null
                        );

                        if (categoryFindings.length === 0) {
                          return (
                            <div
                              key={category.id}
                              id={`coverage-category-${category.id}`}
                              className="scroll-mt-24 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm text-slate-700">{category.label}</p>
                                <CategorySeverityCounts findings={categoryFindings} />
                              </div>
                            </div>
                          );
                        }

                        return (
                          <details
                            key={category.id}
                            id={`coverage-category-${category.id}`}
                            className="group/category scroll-mt-24 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                          >
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
                              <div className="flex min-w-0 items-center gap-2">
                                <span aria-hidden="true" className="inline-flex shrink-0 text-slate-400 transition-transform group-open/category:rotate-90">
                                  <DisclosureChevron />
                                </span>
                                <p className="text-sm text-slate-700">{category.label}</p>
                              </div>
                              <CategorySeverityCounts findings={categoryFindings} />
                            </summary>
                            {categoryFindings.length > 0 ? (
                              <div className="mt-3 space-y-2">
                                {categoryFindings.map((finding) => (
                                  <CategoryFindingSummaryCard
                                    key={`${category.id}-${finding.unifiedFindingId}`}
                                    finding={finding}
                                  />
                                ))}
                              </div>
                            ) : null}
                          </details>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </CollapsibleSectionCard>
  );
}

function HomepagePreviewGate(input: {
  href: string;
  mode: "partial" | "full";
}) {
  return (
    <div
      className={
        input.mode === "full"
          ? "pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-white/85 px-6 py-8 backdrop-blur-[2px]"
          : "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex min-h-[45%] items-end justify-center rounded-b-[inherit] bg-[linear-gradient(180deg,rgba(248,250,252,0)_0%,rgba(248,250,252,0.86)_28%,rgba(255,255,255,0.97)_100%)] px-6 py-8"
      }
    >
      <PendingButtonLink
        href={input.href}
        idleContent="Create account to view"
        pendingContent="Opening..."
        className="pointer-events-auto border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
      />
    </div>
  );
}

export function debugBuildScanReportUnifiedFindingState(scanRecord: ScanDetailResponse) {
  const snapshot = scanRecord.snapshot;
  if (!snapshot) {
    return {
      allReviewFindingCandidates: [] as CanonicalReviewFinding[],
      globalUnifiedFindings: [] as UnifiedFindingDisplayPacket[],
      sectionDrafts: [] as Array<{
        sections: Array<{
          categories: Array<{ reviewFindings: CanonicalReviewFinding[] }>;
          issueFindings: CanonicalReviewFinding[];
          sectionCategoryIds: Set<string>;
        }>;
      }>
    };
  }

  const runtimeArtifacts = scanRecord.runtimeArtifacts;

  try {
    const policyEnrichmentById = new Map(scanRecord.policyEnrichment.map((row) => [String(row.id ?? ""), row]));
    const scanReportReviewIssues = scanRecord.policyReviewQueue.map((row, index) => {
      const enrichment = policyEnrichmentById.get(String(row.policyEnrichmentId ?? row.policy_enrichment_id ?? "")) ?? null;

      return {
        description: formatReviewIssueDescription(String(row.reason ?? "")),
        key: String(row.id ?? `${row.reason ?? "review"}-${index}`),
        pageType: String(enrichment?.pageType ?? enrichment?.page_type ?? "unknown"),
        pageUrl:
          typeof (enrichment?.pageUrl ?? enrichment?.page_url) === "string"
            ? String(enrichment?.pageUrl ?? enrichment?.page_url)
            : null,
        reason: String(row.reason ?? ""),
        reviewStatus: String(row.reviewStatus ?? row.review_status ?? "pending"),
        reviewVerdict: row.reviewVerdict ?? row.review_verdict ?? null,
        summary: enrichment?.policySummaryShort ?? enrichment?.policy_summary_short ?? null
      };
    });
    const preconsentViolationRows = derivePreconsentViolationRows({
      persistedViolations: scanRecord.preconsentViolations,
      runtimeArtifacts,
      trackerVendors: scanRecord.trackerVendors
    });
    const policyBehaviorContradictions = derivePolicyBehaviorContradictions({
      mergedSignals: scanRecord.mergedSignals,
      primaryPolicyEnrichment: scanRecord.primaryPolicyEnrichment,
      policyEnrichments: scanRecord.policyEnrichment,
      preconsentViolations: preconsentViolationRows,
      runtimeArtifacts,
      snapshot,
      trackerVendors: scanRecord.trackerVendors
    });
    const consentAuditFindings = dedupeHeadlineFindings(deriveConsentAuditFindings(snapshot, runtimeArtifacts));
    const accessibilityIssueRows = deriveAccessibilityIssueRows(snapshot);
    const accessibilityRuleEvidenceRows = deriveAccessibilityRuleEvidenceRows({
      examples: scanRecord.accessibilityRuleExamples ?? [],
      ruleCounts: scanRecord.accessibilityRuleCounts ?? []
    });
    const prioritizedAccessibilityRuleRows = [...accessibilityRuleEvidenceRows]
      .sort((left, right) => right.weightedPriority - left.weightedPriority)
      .slice(0, 6);
    const validationFindingLookup = buildValidationFindingLookup(scanRecord.validationFindings);
    const sectionDrafts = REPORT_PRIMARY_PILLARS.map((pillar) => {
      const sections = getReportSectionsForPillar(pillar.id).map((section) => {
        const sectionCategoryIds = new Set(getReportEvidenceCategoriesForSection(section.id).map((category) => category.id));
        const categories = getReportEvidenceCategoriesForSection(section.id).map((category) => {
          const items = getReportSignalsForEvidenceCategory(category.id)
            .map(({ relation, signal }) => ({
              key: signal.key,
              label: signal.label,
              relation,
              source: signal.source,
              value: getReportSignalValue({
                mergedSignals: scanRecord.mergedSignals,
                policyEnrichment: scanRecord.policyEnrichment,
                runtimeArtifacts: scanRecord.runtimeArtifacts,
                signals: scanRecord.signals,
                snapshot: scanRecord.snapshot,
                signal
              })
            }))
            .filter((item) => isSignalValuePopulated(item.key, item.value))
            .sort((left, right) => {
              const relationOrder = { primary: 0, secondary: 1, overlay: 2 } as const;
              return relationOrder[left.relation] - relationOrder[right.relation] || left.label.localeCompare(right.label);
            });

          const reviewFindings = buildReviewFindings({
            allSignals: scanRecord.signals,
            categoryId: category.id,
            issues: [],
            mergedSignals: scanRecord.mergedSignals,
            policyEnrichment: scanRecord.policyEnrichment,
            prioritizedAccessibilityRuleRows,
            runtimeArtifacts: scanRecord.runtimeArtifacts,
            snapshot,
            sectionId: section.id,
            sectionItems: items,
            validationFindingLookup
          });

          return {
            category,
            items,
            reviewFindings
          };
        });

        const issues = buildSectionReviewIssues({
          accessibilityIssueRows,
          consentAuditFindings,
          policyBehaviorContradictions,
          preconsentViolationRows,
          runtimeArtifacts,
          scanReportReviewIssues,
          sectionId: section.id,
          snapshot
        });
        const issueFindings = buildReviewFindings({
          allSignals: scanRecord.signals,
          issues,
          mergedSignals: scanRecord.mergedSignals,
          policyEnrichment: scanRecord.policyEnrichment,
          prioritizedAccessibilityRuleRows,
          runtimeArtifacts: scanRecord.runtimeArtifacts,
          snapshot,
          sectionId: section.id,
          sectionItems: [],
          validationFindingLookup
        });

        return {
          categories,
          issueFindings,
          sectionCategoryIds
        };
      });

      return { sections };
    });

    const allReviewFindingCandidates = sectionDrafts.flatMap(({ sections }) =>
      sections.flatMap((section) => [
        ...section.categories.flatMap((category) => category.reviewFindings),
        ...section.issueFindings
      ])
    );
    const globalUnifiedFindings = buildUnifiedFindingDisplayPackets({
      mergedSignals: scanRecord.mergedSignals,
      policyEnrichment: scanRecord.policyEnrichment,
      reviewFindingCandidates: allReviewFindingCandidates,
      scanEvents: scanRecord.events,
      validationFindings: scanRecord.validationFindings,
      validationFindingLookup
    }).filter((finding) => finding.presentationDecision.status !== "suppress");

    return {
      allReviewFindingCandidates,
      globalUnifiedFindings,
      sectionDrafts
    };
  } catch (error) {
    console.error("Failed to build scan report unified finding state", error);
    return {
      allReviewFindingCandidates: [] as CanonicalReviewFinding[],
      globalUnifiedFindings: [] as UnifiedFindingDisplayPacket[],
      sectionDrafts: [] as Array<{
        sections: Array<{
          categories: Array<{ reviewFindings: CanonicalReviewFinding[] }>;
          issueFindings: CanonicalReviewFinding[];
          sectionCategoryIds: Set<string>;
        }>;
      }>
    };
  }
}

export function buildScanReportUnifiedFindings(scanRecord: ScanDetailResponse) {
  const snapshot = scanRecord.snapshot;
  if (!snapshot) {
    return [] as UnifiedFindingDisplayPacket[];
  }

  try {
    const { globalUnifiedFindings, sectionDrafts } = debugBuildScanReportUnifiedFindingState(scanRecord);

    const pillarSections = sectionDrafts.map(({ sections }) => {
      return {
        sections: sections.map(({ categories, sectionCategoryIds }) => {
          const reviewFindings = globalUnifiedFindings.filter((finding) =>
            finding.categoryAlignments.some((alignment) => sectionCategoryIds.has(alignment.evidenceCategoryId))
          );
          const ownerReviewFindings = reviewFindings.filter((finding) => {
            const ownerCategoryId = finding.categoryAlignments.find((alignment) => alignment.relation === "owner")?.evidenceCategoryId;
            return ownerCategoryId ? sectionCategoryIds.has(ownerCategoryId) : false;
          });

          return {
            ownerReviewFindings
          };
        })
      };
    });

    return [
      ...new Map(
        pillarSections
          .flatMap(({ sections }) => sections.flatMap((section) => section.ownerReviewFindings))
          .map((finding) => [finding.unifiedFindingId, finding])
      ).values()
    ];
  } catch (error) {
    console.error("Failed to build scan report unified findings", error);
    return [] as UnifiedFindingDisplayPacket[];
  }
}

export function deriveExecutiveSummaryBadgeCounts(findings: UnifiedFindingDisplayPacket[]) {
  const surfacedFindings = findings.filter(
    (finding) => finding.presentationDecision.status === "surface" && isMainNarrativeFinding(finding)
  );

  return {
    contradictionCount: surfacedFindings.filter((finding) => finding.details?.family === "contradiction").length,
    preconsentConflictCount: surfacedFindings.filter((finding) => finding.unifiedFindingId === "preconsent_tracking").length
  };
}

function CanonicalTaxonomyReview(input: CanonicalTaxonomyReviewProps) {
  const showHomepagePreviewGate = input.previewMode === "homepage" && Boolean(input.createAccountHref);
  const validationFindingLookup = buildValidationFindingLookup(input.scanRecord.validationFindings);
  const sectionDrafts = REPORT_PRIMARY_PILLARS.map((pillar) => {
    const sections = getReportSectionsForPillar(pillar.id).map((section) => {
      const sectionCategoryIds = new Set(
        getReportEvidenceCategoriesForSection(section.id).map((category) => category.id)
      );
      const categories = getReportEvidenceCategoriesForSection(section.id).map((category) => {
        const items = getReportSignalsForEvidenceCategory(category.id)
          .map(({ relation, signal }) => ({
            key: signal.key,
            label: signal.label,
            relation,
            source: signal.source,
            value: getReportSignalValue({
              mergedSignals: input.scanRecord.mergedSignals,
              policyEnrichment: input.scanRecord.policyEnrichment,
              runtimeArtifacts: input.scanRecord.runtimeArtifacts,
              signals: input.scanRecord.signals,
              snapshot: input.scanRecord.snapshot,
              signal
            })
          }))
          .filter((item) => isSignalValuePopulated(item.key, item.value))
          .sort((left, right) => {
            const relationOrder = { primary: 0, secondary: 1, overlay: 2 } as const;
            return relationOrder[left.relation] - relationOrder[right.relation] || left.label.localeCompare(right.label);
          });

        const reviewFindings = buildReviewFindings({
          allSignals: input.scanRecord.signals,
          categoryId: category.id,
          issues: [],
          mergedSignals: input.scanRecord.mergedSignals,
          policyEnrichment: input.scanRecord.policyEnrichment,
          prioritizedAccessibilityRuleRows: input.prioritizedAccessibilityRuleRows,
          runtimeArtifacts: input.scanRecord.runtimeArtifacts,
          snapshot: input.snapshot,
          sectionId: section.id,
          sectionItems: items,
          validationFindingLookup
        });

        return {
          category,
          emptySignalCount: getReportSignalsForEvidenceCategory(category.id).length - items.length,
          items,
          reviewFindings
        };
      });

      const issues = buildSectionReviewIssues({
        accessibilityIssueRows: input.accessibilityIssueRows,
        consentAuditFindings: input.consentAuditFindings,
        policyBehaviorContradictions: input.policyBehaviorContradictions,
        preconsentViolationRows: input.preconsentViolationRows,
        runtimeArtifacts: input.scanRecord.runtimeArtifacts,
        scanReportReviewIssues: input.scanReportReviewIssues,
        sectionId: section.id,
        snapshot: input.snapshot
      });
      const issueFindings = buildReviewFindings({
        allSignals: input.scanRecord.signals,
        issues,
        mergedSignals: input.scanRecord.mergedSignals,
        policyEnrichment: input.scanRecord.policyEnrichment,
        prioritizedAccessibilityRuleRows: input.prioritizedAccessibilityRuleRows,
        runtimeArtifacts: input.scanRecord.runtimeArtifacts,
        snapshot: input.snapshot,
        sectionId: section.id,
        sectionItems: [],
        validationFindingLookup
      });

      return {
        categories,
        issueFindings,
        pillar,
        section,
        sectionCategoryIds
      };
    });

    return { pillar, sections };
  });
  const allReviewFindingCandidates = sectionDrafts.flatMap(({ sections }) =>
    sections.flatMap((section) => [
      ...section.categories.flatMap((category) => category.reviewFindings),
      ...section.issueFindings
    ])
  );
  const globalUnifiedFindings = buildUnifiedFindingDisplayPackets({
    mergedSignals: input.scanRecord.mergedSignals,
    policyEnrichment: input.scanRecord.policyEnrichment,
    reviewFindingCandidates: allReviewFindingCandidates,
    scanEvents: input.scanRecord.events,
    validationFindings: input.scanRecord.validationFindings,
    validationFindingLookup
  }).filter((finding) => finding.presentationDecision.status !== "suppress");
  const pillarSections = sectionDrafts.map(({ pillar, sections }) => {
    return {
      pillar,
      sections: sections.map(({ categories, section, sectionCategoryIds }) => {
        const reviewFindings = globalUnifiedFindings.filter((finding) =>
          finding.categoryAlignments.some((alignment) => sectionCategoryIds.has(alignment.evidenceCategoryId))
        );
        const sectionItems = categories.flatMap((category) => category.items);
        const alignedReviewFindings = reviewFindings;
        const ownerReviewFindings = reviewFindings.filter((finding) => {
          const ownerCategoryId = finding.categoryAlignments.find((alignment) => alignment.relation === "owner")?.evidenceCategoryId;
          return ownerCategoryId ? sectionCategoryIds.has(ownerCategoryId) : false;
        });
        const visibleCategories = categories.filter(({ category, items }) => {
          const ownerFindingsForCategory = reviewFindings.filter(
            (finding) => getUnifiedFindingCategoryRelation(finding, category.id) === "owner"
          );
          const mirrorFindingsForCategory = reviewFindings.filter(
            (finding) => getUnifiedFindingCategoryRelation(finding, category.id) === "mirror"
          );
          const overlayFindingsForCategory = reviewFindings.filter(
            (finding) => getUnifiedFindingCategoryRelation(finding, category.id) === "overlay"
          );

          return (
            ownerFindingsForCategory.length > 0 ||
            mirrorFindingsForCategory.length > 0 ||
            overlayFindingsForCategory.length > 0 ||
            items.length > 0
          );
        });

        return {
          alignedReviewFindings,
          ownerReviewFindings,
          reviewFindings,
          section,
          sectionItems,
          unifiedFindings: reviewFindings,
          visibleCategories
        };
      })
    };
  });
  const reviewFindings = [
    ...new Map(
      pillarSections
        .flatMap(({ sections }) => sections.flatMap((section) => section.ownerReviewFindings))
        .map((finding) => [finding.unifiedFindingId, finding])
    ).values()
  ];
  const vendorGroups = deriveVendorContext({
    scanRecord: input.scanRecord,
    snapshot: input.snapshot
  });
  const suppressEmptyBlockedChrome =
    input.scanRecord.accessPostureSummary?.accessPostureClass === "early_loss" &&
    input.scanRecord.accessPostureSummary?.stopTier === "tier1_front_door" &&
    reviewFindings.length === 0;
  const sectionTiles = [
    ...new Map(
      pillarSections.flatMap(({ sections }) =>
        sections.map(({ alignedReviewFindings, section }) => {
          const sectionScore = deriveSectionScore(alignedReviewFindings);
          return [
            section.id,
            {
              href: `#coverage-section-${section.id}`,
              label: section.label,
              showValueText: false,
              value: formatSectionScore(sectionScore)
            }
          ] as const;
        })
      )
    ).values()
  ];

  return (
    <div className="space-y-6">
      {!suppressEmptyBlockedChrome ? (
        <CollapsibleSectionCard
          title="Analyst detail"
          subtitle="Expanded taxonomy review, coverage matrix, and supporting evidence below the executive findings layer."
          defaultOpen={false}
          contentClassName="space-y-6"
        >
          <AgencyAdvisorySummary
            badges={input.executiveSummary.badges}
            findings={reviewFindings}
            metrics={input.executiveSummary.metrics}
            sectionTiles={sectionTiles}
            snapshot={input.snapshot}
            statusCallout={input.executiveSummary.statusCallout}
            vendorGroups={vendorGroups}
          />
          <div className="relative overflow-hidden rounded-2xl">
            <FindingsOverview findings={reviewFindings} />
            {showHomepagePreviewGate && input.createAccountHref ? (
              <HomepagePreviewGate href={input.createAccountHref} mode="partial" />
            ) : null}
          </div>

          <div className="relative overflow-hidden rounded-2xl">
            <CoverageMatrix
              pillarSections={pillarSections.map(({ pillar, sections }) => ({
                pillar,
                sections: sections.map(({ alignedReviewFindings, ownerReviewFindings, section, visibleCategories }) => ({
                  alignedReviewFindings,
                  ownerReviewFindings,
                  section,
                  visibleCategories
                }))
              }))}
            />
            {showHomepagePreviewGate && input.createAccountHref ? (
              <HomepagePreviewGate href={input.createAccountHref} mode="partial" />
            ) : null}
          </div>
        </CollapsibleSectionCard>
      ) : null}
    </div>
  );
}

function formatReviewIssueReason(reason: string) {
  switch (reason) {
    case "policy_behavior_conflict_candidate":
      return "Possible policy-to-behavior conflict";
    case "session_replay_without_disclosure_detected":
      return "Possible undisclosed session replay";
    case "missing_dsar_high_exposure":
      return "Possible missing DSAR path";
    case "low_confidence_critical_fields":
      return "Low-confidence policy extraction";
    default:
      return reason.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function formatReviewIssueDescription(reason: string) {
  switch (reason) {
    case "policy_behavior_conflict_candidate":
      return "Observed site behavior may conflict with the site’s public-facing policy language.";
    case "session_replay_without_disclosure_detected":
      return "Session replay behavior may be present without a clear matching disclosure in the scanned policy pages.";
    case "missing_dsar_high_exposure":
      return "The site may have elevated exposure while still lacking a clear DSAR path in policy disclosures.";
    case "low_confidence_critical_fields":
      return "Critical policy extraction fields were low confidence and need manual review in the scan report.";
    default:
      return `This issue was added to the scan report review queue under ${formatReviewIssueReason(reason)}.`;
  }
}

function getReviewIssueNextStep(issue: CanonicalReviewIssue) {
  if (issue.evidence && issue.evidence.length > 0) {
    return "Review the linked evidence in this section and confirm whether the issue reflects an actual policy or disclosure gap.";
  }

  return "Inspect the supporting signals in this section and confirm whether the issue reflects a real reviewer concern.";
}

function summarizeReviewIssueEvidence(evidence: string[]) {
  if (evidence.length === 1) {
    return evidence[0] ?? "";
  }

  const [first, second] = evidence;
  const remainingCount = evidence.length - 2;

  return remainingCount > 0
    ? `${first} | ${second} | +${remainingCount} more`
    : `${first} | ${second}`;
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function getResultStatusTone(status: string) {
  switch (status) {
    case "completed":
      return {
        badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
        panel: "from-emerald-100 via-white to-sky-100"
      };
    case "failed":
      return {
        badge: "border-rose-200 bg-rose-50 text-rose-800",
        panel: "from-rose-100 via-white to-orange-100"
      };
    case "running":
    case "queued":
      return {
        badge: "border-sky-200 bg-sky-50 text-sky-800",
        panel: "from-sky-100 via-white to-cyan-100"
      };
    default:
      return {
        badge: "border-slate-200 bg-slate-50 text-slate-700",
        panel: "from-slate-100 via-white to-slate-50"
      };
  }
}

function getWorkflowStageTone(status: SignalEnrichmentWorkflowStageStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "running":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "blocked":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function formatWorkflowStageStatus(status: SignalEnrichmentWorkflowStageStatus) {
  switch (status) {
    case "completed":
      return "Completed";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    case "blocked":
      return "Blocked";
    default:
      return "Queued";
  }
}

function getLatestNanoDocRetrievalDiagnostics(scanEvents: ScanEventSummaryRecord[]) {
  const event = [...scanEvents].reverse().find((row) => row.eventType === "signals.nano_doc_retrieval_completed");
  const metadata = event?.metadataJson;

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return {
    candidateCount: getRecordNumber(metadata, "candidateCount"),
    documentSourceCount: getRecordNumber(metadata, "documentSourceCount"),
    duplicateCount: getRecordNumber(metadata, "duplicateCount"),
    errorCount: getRecordNumber(metadata, "errorCount"),
    insufficientCount: getRecordNumber(metadata, "insufficientCount"),
    intermediaryCount: getRecordNumber(metadata, "intermediaryCount"),
    nonOkCount: getRecordNumber(metadata, "nonOkCount"),
    rejectedCount: getRecordNumber(metadata, "rejectedCount")
  };
}

function SignalEnrichmentWorkflowCard(input: {
  finalHost: string | null;
  landedOnDifferentHost: boolean;
  requestedHost: string | null;
  scanRecord: ScanDetailResponse;
}) {
  const workflow = input.scanRecord.signalEnrichmentWorkflow;
  const retrievalDiagnostics = getLatestNanoDocRetrievalDiagnostics(input.scanRecord.events);
  const counts = {
    stagesCompleted: workflow.stages.filter((stage) => stage.status === "completed").length,
    totalStages: workflow.stages.length
  };

  return (
    <CollapsibleSectionCard
      title="Signal enrichment workflow"
      defaultOpen={input.scanRecord.scan.status !== "completed"}
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">
          Scanner, nano, merge, and finding-derivation status for this scan.
        </p>
        {input.landedOnDifferentHost && input.requestedHost && input.finalHost ? (
          <div className="rounded-2xl border border-sky-200/80 bg-sky-50/75 px-4 py-3 text-sm text-sky-950">
            Findings reflect the landed domain <span className="font-semibold">{input.finalHost}</span>, not the requested domain{" "}
            <span className="font-semibold">{input.requestedHost}</span>.
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-4">
          <SummaryMetricTile label="Preferred mode" value={workflow.preferredMode === "parallel_evidence_collection" ? "Parallel" : workflow.preferredMode} />
          <SummaryMetricTile label="Actual mode" value={workflow.actualMode === "parallelized" ? "Parallelized" : "Serial bridge"} />
          <SummaryMetricTile label="Merged signals" value={workflow.mergedSignalsReady ? "Ready" : "Pending"} />
          <SummaryMetricTile label="Findings" value={workflow.findingsReady ? "Ready" : "Pending"} />
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <SummaryMetricTile label="Time to merged signals" value={formatDurationMs(workflow.timings.timeToMergedSignalsMs)} />
          <SummaryMetricTile label="Time to findings" value={formatDurationMs(workflow.timings.timeToFindingsMs)} />
          <SummaryMetricTile label="Nano retrieval" value={formatDurationMs(workflow.timings.nanoDocRetrievalDurationMs)} />
          <SummaryMetricTile label="Nano signal pass" value={formatDurationMs(workflow.timings.nanoDocSignalsDurationMs)} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SummaryMetricTile label="Fresh extractions" value={String(workflow.extractionMetrics.freshExtractions)} />
          <SummaryMetricTile label="Reused extractions" value={String(workflow.extractionMetrics.reusedExtractions)} />
        </div>
        {workflow.extractionMetrics.skippedExtractions > 0 ? (
          <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <span className="font-medium">Skipped extractions</span>
              <span>{workflow.extractionMetrics.skippedExtractions}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(workflow.extractionMetrics.skippedByReason).map(([reason, count]) => (
                <span
                  key={reason}
                  className="inline-flex items-center rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-900"
                >
                  {formatReasonLabel(reason)}: {count}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
            {counts.stagesCompleted} of {counts.totalStages} stages completed
          </div>
          {retrievalDiagnostics ? (
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <div className="font-medium text-slate-900">Nano doc retrieval diagnostics</div>
              <div className="mt-2 grid gap-2 md:grid-cols-4">
                <div>Candidates: {retrievalDiagnostics.candidateCount ?? "—"}</div>
                <div>Retained docs: {retrievalDiagnostics.documentSourceCount ?? "—"}</div>
                <div>Rejected docs: {retrievalDiagnostics.rejectedCount ?? "—"}</div>
                <div>Duplicates dropped: {retrievalDiagnostics.duplicateCount ?? "—"}</div>
              </div>
              <div className="mt-1 grid gap-2 md:grid-cols-4">
                <div>Interstitial drops: {retrievalDiagnostics.intermediaryCount ?? "—"}</div>
                <div>Insufficient docs: {retrievalDiagnostics.insufficientCount ?? "—"}</div>
                <div>Non-OK fetches: {retrievalDiagnostics.nonOkCount ?? "—"}</div>
                <div>Fetch/runtime errors: {retrievalDiagnostics.errorCount ?? "—"}</div>
              </div>
            </div>
          ) : null}
          <div className="divide-y divide-slate-200">
            {workflow.stages.map((stage) => (
              <div key={stage.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900">{stage.label}</p>
                    <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", getWorkflowStageTone(stage.status))}>
                      {formatWorkflowStageStatus(stage.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{stage.description}</p>
                  {stage.dependsOn.length > 0 ? (
                    <p className="mt-1 text-xs text-slate-500">Depends on: {stage.dependsOn.join(", ")}</p>
                  ) : null}
                </div>
                <div className="shrink-0 text-sm text-slate-600 md:text-right">
                  <div>Items: {typeof stage.itemCount === "number" ? stage.itemCount : "—"}</div>
                  <div>Duration: {formatDurationMs(stage.durationMs)}</div>
                  <div>Started: {stage.startedAt ? formatDateTime(stage.startedAt) : "—"}</div>
                  <div>Completed: {stage.completedAt ? formatDateTime(stage.completedAt) : "—"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </CollapsibleSectionCard>
  );
}

function buildResultHeroHighlights(input: {
  findingPackets: UnifiedFindingDisplayPacket[];
  hybridRuntimeSummaryRows: Array<{ label: string; value: unknown }> | null;
  runtimeArtifacts: Record<string, unknown> | null;
}) {
  const highlights: string[] = [];
  const hybrid = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const consentSummary = getRecord(hybrid?.consentSummary);
  const consentVisual = getRecord(hybrid?.consentVisual);
  const uiSummary = getRecord(hybrid?.uiSummary);
  const mediaSummary = getRecord(hybrid?.mediaSummary);
  const fingerprintSummary = getRecord(hybrid?.fingerprintSummary);
  const networkSummary = getRecord(hybrid?.networkSummary);

  if ((getFiniteNumber(networkSummary?.preConsentThirdPartyRequestCount) ?? 0) > 0) {
    highlights.push("Pre-consent tracking observed");
  }
  if (consentSummary?.cookieWallDetected === true || uiSummary?.forcedActionRequired === true) {
    highlights.push("Consent wall or forced interaction");
  }
  if (consentSummary?.rejectPresent === false || consentVisual?.rejectHidden === true) {
    highlights.push("Reject path weakened");
  }
  if ((getFiniteNumber(fingerprintSummary?.tier) ?? 0) >= 2) {
    highlights.push(`Fingerprinting tier ${fingerprintSummary?.tier}`);
  }
  if ((getFiniteNumber(uiSummary?.popupCount) ?? 0) > 0) {
    highlights.push("Popup behavior observed");
  }
  if (mediaSummary?.autoplayVideoObserved === true || mediaSummary?.autoplayAudioObserved === true) {
    highlights.push("Autoplay observed");
  }

  if (highlights.length === 0) {
    const topFindings = input.findingPackets
      .slice(0, 3)
      .map((finding) => finding.presentation.findingName)
      .filter((value, index, values) => values.indexOf(value) === index);
    highlights.push(...topFindings);
  }

  if (highlights.length === 0 && input.hybridRuntimeSummaryRows) {
    const nonEmptyLabels = input.hybridRuntimeSummaryRows
      .filter((row) => row.value !== null && row.value !== undefined && row.value !== false)
      .slice(0, 3)
      .map((row) => row.label);
    highlights.push(...nonEmptyLabels);
  }

  return highlights.slice(0, 4);
}

function ResultHeroPanel(input: {
  consentAuditCompleted: boolean;
  consentRejectInteractionSucceeded: boolean;
  consentRejectReducedTracking: unknown;
  findingPackets: UnifiedFindingDisplayPacket[];
  hybridRuntimeSummaryRows: Array<{ label: string; value: unknown }> | null;
  preConsentTrackingObserved: boolean;
  runtimeArtifacts: Record<string, unknown> | null;
  scanExecutionSummary: ReturnType<typeof deriveScanExecutionSummary>;
  scanRecord: ScanDetailResponse;
}) {
  const tone = getResultStatusTone(input.scanRecord.scan.status);
  const hybrid = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const networkSummary = getRecord(hybrid?.networkSummary);
  const vendorSummary = getRecord(hybrid?.vendorSummary);
  const fingerprintSummary = getRecord(hybrid?.fingerprintSummary);
  const uiSummary = getRecord(hybrid?.uiSummary);
  const surfacedCount = input.findingPackets.length;
  const highlights = buildResultHeroHighlights({
    findingPackets: input.findingPackets,
    hybridRuntimeSummaryRows: input.hybridRuntimeSummaryRows,
    runtimeArtifacts: input.runtimeArtifacts
  });
  const scoreTiles = [
    {
      label: "Surfaced findings",
      value: surfacedCount > 0 ? surfacedCount : "None"
    },
    {
      label: "Third-party domains",
      value: getRecordStringArray(vendorSummary, "rawThirdPartyDomains").length || "None"
    },
    {
      label: "Fingerprint tier",
      value: getFiniteNumber(fingerprintSummary?.tier) ?? "0"
    },
    {
      label: "Runtime friction",
      value:
        uiSummary?.forcedActionRequired === true
          ? "Forced"
          : uiSummary?.overlayDetected === true
            ? "Overlay"
            : "Clear"
    }
  ];

  return (
    <section
      className={cx(
        "relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-gradient-to-br p-6 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] md:p-7",
        tone.panel
      )}
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(15,23,42,0.10),transparent_52%)]" />
      <div className="relative grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]", tone.badge)}>
              {input.scanRecord.scan.status}
            </span>
            {input.scanExecutionSummary ? (
              <span className="rounded-full border border-slate-200/80 bg-white/75 px-3 py-1 text-xs font-medium text-slate-700">
                {input.scanExecutionSummary.title}
              </span>
            ) : null}
            {input.preConsentTrackingObserved ? (
              <span className="rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1 text-xs font-medium text-amber-800">
                Pre-consent activity
              </span>
            ) : null}
          </div>

          <div className="space-y-2">
            <h2 className="max-w-4xl text-3xl font-semibold tracking-tight text-slate-950 md:text-[2.1rem]">
              {input.scanRecord.scan.domainHostname ?? "Scan results"}
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-slate-600 md:text-[15px]">
              {surfacedCount > 0
                ? `The primary scan surfaced ${surfacedCount} prioritized finding${surfacedCount === 1 ? "" : "s"} with hybrid runtime evidence driving consent, tracking, and intrusive-behavior coverage.`
                : "The hybrid scanner completed with a lighter runtime footprint and no prioritized findings surfaced at the top layer."}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[1.35rem] border border-white/70 bg-white/78 p-4 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Consent posture</p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                {input.consentAuditCompleted
                  ? input.consentRejectInteractionSucceeded
                    ? input.consentRejectReducedTracking === true
                      ? "Reject reduced tracking"
                      : input.consentRejectReducedTracking === false
                        ? "Reject did not reduce tracking"
                        : "Reject path completed"
                    : "Audit incomplete"
                  : "Runtime-only coverage"}
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-white/70 bg-white/78 p-4 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Network posture</p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                {(getFiniteNumber(networkSummary?.thirdPartyRequestCount) ?? 0) > 0
                  ? `${getFiniteNumber(networkSummary?.thirdPartyRequestCount) ?? 0} third-party requests`
                  : "No third-party traffic observed"}
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-white/70 bg-white/78 p-4 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Signals in focus</p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                {highlights[0] ?? "No high-priority runtime flags"}
              </p>
            </div>
          </div>

          {highlights.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {highlights.map((highlight) => (
                <span
                  key={highlight}
                  className="rounded-full border border-slate-200/80 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700 backdrop-blur"
                >
                  {highlight}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {scoreTiles.map((tile) => (
            <div
              key={tile.label}
              className="rounded-[1.4rem] border border-slate-200/80 bg-white/78 p-4 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.35)] backdrop-blur"
            >
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{tile.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{tile.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ResultCategorySection(input: {
  title: string;
  metrics: ResultMetric[];
  details: ResultDetail[];
  defaultOpen?: boolean;
  collapsible?: boolean;
  intro?: string;
  includes?: string;
  collapseDetails?: boolean;
  detailsTitle?: string;
  staticSection?: boolean;
}) {
  const visibleDetails = input.details.filter((detail) => {
    if (detail.value === null || detail.value === undefined || detail.value === "") {
      return false;
    }

    if (Array.isArray(detail.value)) {
      return detail.value.length > 0;
    }

    return true;
  });

  const body = (
    <>
      <div className={METRIC_GRID_CLASS}>
        {input.metrics.map((metric) => (
          <SummaryMetricTile
            key={`${input.title}-${metric.label}`}
            label={metric.label}
            tooltip={metric.tooltip}
            value={metric.value}
          />
        ))}
      </div>

      {visibleDetails.length > 0 ? (
        input.collapseDetails ? (
          <CollapsibleSectionCard title={input.detailsTitle ?? "Detail signals"} defaultOpen={false}>
              <div className={METRIC_GRID_CLASS}>
                {visibleDetails.map((detail) => (
                <SummaryMetricTile
                  key={`${input.title}-${detail.label}`}
                  label={detail.label}
                  value={formatCompactValue(detail.value)}
                />
              ))}
            </div>
          </CollapsibleSectionCard>
        ) : (
          <div className={METRIC_GRID_CLASS}>
            {visibleDetails.map((detail) => (
              <SummaryMetricTile
                key={`${input.title}-${detail.label}`}
                label={detail.label}
                value={formatCompactValue(detail.value)}
              />
            ))}
          </div>
        )
      ) : null}
    </>
  );

  if (input.staticSection) {
    return (
      <StaticSubsection title={input.title} intro={input.intro} tooltip={input.intro}>
        {body}
      </StaticSubsection>
    );
  }

  if (input.collapsible === false) {
    return (
      <SectionSubsection
        title={input.title}
        intro={input.intro}
        tooltip={input.intro}
      >
        {body}
      </SectionSubsection>
    );
  }

  return (
    <CollapsibleSectionCard
      title={
        <span className="flex items-center gap-1.5">
          <span>{input.title}</span>
          {input.intro ? <InfoTip text={input.intro} /> : null}
        </span>
      }
      subtitle={input.intro}
      defaultOpen={input.defaultOpen}
      contentClassName="space-y-4"
    >
      {body}
    </CollapsibleSectionCard>
  );
}

export function deriveExecutiveDisplayedScore(input: {
  findings: CertScoreFinding[];
  previewMode?: "full" | "homepage";
  snapshot: Record<string, unknown> | null;
  storedScore: number | null;
}) {
  if (typeof input.storedScore !== "number" || !Number.isFinite(input.storedScore)) {
    return null;
  }

  if (input.previewMode !== "homepage" || !input.snapshot) {
    return input.storedScore;
  }

  if (
    input.storedScore === 0 &&
    isEvidenceRichZeroPagePreviewSnapshot(input.snapshot) &&
    getRecordNumber(input.snapshot, "privacy_score") === 0 &&
    getRecordNumber(input.snapshot, "consent_score") === 0
  ) {
    return null;
  }

  const findingIds = new Set(input.findings.map((finding) => finding.id));
  const hasConsentWeightedFinding =
    findingIds.has("pre_consent_tracking_detected") ||
    findingIds.has("third_party_tracking_pre_consent") ||
    findingIds.has("storage_before_consent") ||
    findingIds.has("third_party_cookie_pre_consent") ||
    findingIds.has("analytics_cookie_pre_consent") ||
    findingIds.has("adtech_cookie_pre_consent") ||
    findingIds.has("reject_option_missing_or_hidden") ||
    findingIds.has("asymmetric_consent_ui") ||
    findingIds.has("forced_consent_interaction") ||
    findingIds.has("consent_dark_patterns_detected");
  const hasPrivacyWeightedFinding =
    hasConsentWeightedFinding ||
    findingIds.has("session_recording_services_detected") ||
    findingIds.has("identifier_transmission_detected") ||
    findingIds.has("telemetry_rich_identification_observed") ||
    findingIds.has("device_data_collection_detected") ||
    findingIds.has("probable_fingerprinting") ||
    findingIds.has("non_cookie_tracking_detected");

  const consentScore =
    typeof input.snapshot.consent_score === "number" && Number.isFinite(input.snapshot.consent_score)
      ? input.snapshot.consent_score
      : null;
  const privacyScore =
    typeof input.snapshot.privacy_score === "number" && Number.isFinite(input.snapshot.privacy_score)
      ? input.snapshot.privacy_score
      : null;
  const caps = [input.storedScore];

  if (hasConsentWeightedFinding && consentScore !== null) {
    caps.push(consentScore);
  }

  if (hasPrivacyWeightedFinding && privacyScore !== null) {
    caps.push(privacyScore);
  }

  return Math.min(...caps);
}

type SharedScanDetailViewProps = {
  autoRefresh?: ReactNode;
  createAccountHref?: string | null;
  executiveAccessLimitationOverride?: ExecutiveAccessLimitationNotice | null;
  headerActions?: ReactNode;
  previewNotice?: ReactNode;
  previewPayload?: PreviewScanPayload | null;
  previewMode?: "full" | "homepage";
  scanRecord: ScanDetailResponse;
};

export function SharedScanDetailView({
  autoRefresh = null,
  createAccountHref = null,
  executiveAccessLimitationOverride = null,
  headerActions = null,
  previewNotice = null,
  previewPayload = null,
  previewMode = "full",
  scanRecord
}: SharedScanDetailViewProps) {
  const snapshot = scanRecord.snapshot;
  const unverifiedHomepageReview = snapshot
    ? deriveUnverifiedHomepageReview(snapshot, scanRecord.events, scanRecord.policyEnrichment)
    : null;
  const executiveAccessLimitationNotice =
    executiveAccessLimitationOverride ??
    (snapshot ? deriveExecutiveAccessLimitationNotice(snapshot, scanRecord.events, scanRecord.policyEnrichment) : null);
  const suppressLimitedSurfaceReview =
    scanRecord.accessPostureSummary?.accessPostureClass === "early_loss" &&
    scanRecord.accessPostureSummary?.stopTier === "tier1_front_door";
  const runtimeArtifacts = scanRecord.runtimeArtifacts;
  const hybridRuntimeSummaryRows = getHybridRuntimeSummaryRows(runtimeArtifacts);
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(runtimeArtifacts);
  const hybridVendorSummary = getRecord(hybridRuntimeEvidence?.vendorSummary);
  const hybridStorageSummary = getRecord(hybridRuntimeEvidence?.storageSummary);
  const hybridFingerprintSummary = getRecord(hybridRuntimeEvidence?.fingerprintSummary);
  const hybridNavigationSummary = getRecord(hybridRuntimeEvidence?.navigationSummary);
  const hybridUiSummary = getRecord(hybridRuntimeEvidence?.uiSummary);
  const hybridMediaSummary = getRecord(hybridRuntimeEvidence?.mediaSummary);
  const runtimeInitialCookieCount = getRecordNumber(runtimeArtifacts, "initial_cookie_count") ?? getRecordNumber(runtimeArtifacts, "initialCookieCount") ?? 0;
  const certScoreSummary = deriveCertScoreFindings(scanRecord);
  const fallbackEvidence = previewPayload?.fallbackEvidence ?? null;
  const fallbackTechnologyNames = uniqueStrings(fallbackEvidence?.entities?.technologyNames ?? []);
  const fallbackObservedRequestCount = getFiniteNumber(fallbackEvidence?.metrics?.requestCount) ?? 0;
  const fallbackObservedCookieCount = getFiniteNumber(fallbackEvidence?.metrics?.initialCookieCount) ?? 0;
  const fallbackObservedDomainCount = getFiniteNumber(fallbackEvidence?.metrics?.domainCount) ?? 0;
  const fallbackObservedIpCount = getFiniteNumber(fallbackEvidence?.metrics?.ipCount) ?? 0;
  const fallbackObservedTechnologyCount = fallbackTechnologyNames.length;
  const fallbackServerNames = uniqueStrings(fallbackEvidence?.entities?.serverNames ?? []);
  const fallbackTopDomains = uniqueStrings(fallbackEvidence?.entities?.topDomains ?? []);
  const fallbackVerifiedSurfaceTargets = uniqueStrings(fallbackEvidence?.entities?.verifiedSurfaceTargets ?? []);
  const fallbackThirdPartyRequestCount = getFiniteNumber(fallbackEvidence?.metrics?.thirdPartyRequestCount) ?? 0;
  const executiveResolvedVendorNames = uniqueStrings([
    ...certScoreSummary.resolvedVendorNames,
    ...fallbackTechnologyNames
  ]);
  const executiveThirdPartyDomains = uniqueStrings([
    ...getRecordStringArray(hybridVendorSummary, "rawThirdPartyDomains"),
    ...fallbackTopDomains
  ]);
  const executiveThirdPartyRequestCount = Math.max(certScoreSummary.thirdPartyRequestCount, fallbackThirdPartyRequestCount);
  const executiveTopObservedEntities =
    certScoreSummary.topObservedEntities.length > 0
      ? certScoreSummary.topObservedEntities
      : [
          ...fallbackTechnologyNames.map((label) => ({
            label,
            category: "unknown",
            requestCount: executiveThirdPartyRequestCount
          })),
          ...fallbackTopDomains
            .filter((label) => !fallbackTechnologyNames.includes(label))
            .slice(0, Math.max(0, 6 - fallbackTechnologyNames.length))
            .map((label) => ({
              label,
              category: "unknown",
              requestCount: executiveThirdPartyRequestCount
            }))
        ];
  const executiveVendorCategoryCounts =
    Object.keys(certScoreSummary.vendorCategoryCounts).length > 0
      ? certScoreSummary.vendorCategoryCounts
      : fallbackTechnologyNames.length > 0
        ? { unknown: fallbackTechnologyNames.length }
        : fallbackServerNames.length > 0
          ? { unknown: fallbackServerNames.length }
          : certScoreSummary.vendorCategoryCounts;
  const executiveTrackerSummary =
    certScoreSummary.trackerSummary === "No meaningful third-party footprint observed"
      ? fallbackEvidence?.vendorFootprint?.summary ??
        fallbackEvidence?.requestFootprint?.summary ??
        (executiveThirdPartyRequestCount > 0
          ? `${executiveThirdPartyRequestCount} third-party request${executiveThirdPartyRequestCount === 1 ? "" : "s"} retained from an indirect scan source.`
          : certScoreSummary.trackerSummary)
      : certScoreSummary.trackerSummary;
  const executiveUnresolvedVendorHosts = uniqueStrings([
    ...certScoreSummary.unresolvedVendorHosts,
    ...fallbackTopDomains
  ]);
  const executiveFingerprintReasons = uniqueStrings([
    ...getRecordStringArray(hybridFingerprintSummary, "reasons"),
    ...(fallbackServerNames.length > 0 ? [`Indirect source retained infrastructure signals: ${fallbackServerNames.join(", ")}`] : []),
    ...(fallbackVerifiedSurfaceTargets.length > 0 ? [`Indirect source retained disclosure surfaces: ${fallbackVerifiedSurfaceTargets.join(", ")}`] : [])
  ]);
  const executiveDisplayedScore = deriveExecutiveDisplayedScore({
    findings: certScoreSummary.findings,
    previewMode,
    snapshot,
    storedScore: certScoreSummary.score
  });
  const useLightweightHeroMetrics =
    Boolean(previewPayload?.fallbackEvidence) &&
    (
      fallbackObservedRequestCount > 0 ||
      fallbackObservedCookieCount > 0 ||
      fallbackObservedDomainCount > 0 ||
      fallbackObservedTechnologyCount > 0
    );
  const lightweightHeroMetrics = useLightweightHeroMetrics
    ? [
        {
          accent: "sky" as const,
          helper: "Indirect-source footprint",
          label: "Requests observed",
          value: fallbackObservedRequestCount || null
        },
        {
          accent: "emerald" as const,
          helper: "Observed in retained runtime payload",
          label: "Cookies observed",
          value: fallbackObservedCookieCount || null
        },
        {
          accent: "amber" as const,
          helper: fallbackObservedDomainCount > 0
            ? "Distinct domains contacted"
            : "Named technologies retained",
          label: fallbackObservedDomainCount > 0 ? "Domains observed" : "Technologies retained",
          value: fallbackObservedDomainCount > 0 ? fallbackObservedDomainCount : fallbackObservedTechnologyCount || null
        }
      ]
    : null;
  const cookiesSeenCount = Math.max(
    getRecordNumber(hybridStorageSummary, "cookiesSeenCount") ?? 0,
    getRecordNumber(snapshot, "cookie_count_total") ?? 0,
    runtimeInitialCookieCount,
    fallbackObservedCookieCount
  );
  const thirdPartyCookiesSeenCount = Math.max(
    getRecordNumber(hybridStorageSummary, "thirdPartyCookieCount") ?? 0,
    getRecordNumber(snapshot, "third_party_cookie_count") ?? 0,
    certScoreSummary.thirdPartyCookieNamesSeen.length
  );
  const cookiesBeforeConsentCount = Math.max(
    getRecordNumber(hybridStorageSummary, "cookiesBeforeConsentCount") ?? 0,
    certScoreSummary.cookieNamesBeforeConsent.length,
    runtimeInitialCookieCount
  );
  let reviewSectionError: string | null = null;
  let scanReportReviewIssues: CanonicalTaxonomyReviewProps["scanReportReviewIssues"] = [];
  let preconsentViolationRows: ReturnType<typeof derivePreconsentViolationRows> = [];
  let policyBehaviorContradictions: PolicyBehaviorContradiction[] = [];
  let consentAuditFindings: PreviewSampleFinding[] = [];
  let accessibilityIssueRows: ReturnType<typeof deriveAccessibilityIssueRows> = [];
  let accessibilityRuleEvidenceRows: ReturnType<typeof deriveAccessibilityRuleEvidenceRows> = [];
  let prioritizedAccessibilityRuleRows: ReturnType<typeof deriveAccessibilityRuleEvidenceRows> = [];
  let taxonomySnapshotSections: Array<{ description: string; fields: string[]; title: string }> = [];

  try {
    const policyEnrichmentById = new Map(
      scanRecord.policyEnrichment.map((row) => [String(row.id ?? ""), row])
    );
    scanReportReviewIssues = scanRecord.policyReviewQueue.map((row, index) => {
      const enrichment = policyEnrichmentById.get(String(row.policyEnrichmentId ?? row.policy_enrichment_id ?? "")) ?? null;

      return {
        description: formatReviewIssueDescription(String(row.reason ?? "")),
        key: String(row.id ?? `${row.reason ?? "review"}-${index}`),
        pageType: String(enrichment?.pageType ?? enrichment?.page_type ?? "unknown"),
        pageUrl:
          typeof (enrichment?.pageUrl ?? enrichment?.page_url) === "string"
            ? String(enrichment?.pageUrl ?? enrichment?.page_url)
            : null,
        reason: String(row.reason ?? ""),
        reviewStatus: String(row.reviewStatus ?? row.review_status ?? "pending"),
        reviewVerdict: row.reviewVerdict ?? row.review_verdict ?? null,
        summary: enrichment?.policySummaryShort ?? enrichment?.policy_summary_short ?? null
      };
    });
    preconsentViolationRows = derivePreconsentViolationRows({
      persistedViolations: scanRecord.preconsentViolations,
      runtimeArtifacts,
      trackerVendors: scanRecord.trackerVendors
    });
    policyBehaviorContradictions = derivePolicyBehaviorContradictions({
      mergedSignals: scanRecord.mergedSignals,
      primaryPolicyEnrichment: scanRecord.primaryPolicyEnrichment,
      policyEnrichments: scanRecord.policyEnrichment,
      preconsentViolations: preconsentViolationRows,
      runtimeArtifacts,
      snapshot,
      trackerVendors: scanRecord.trackerVendors
    });
    consentAuditFindings = dedupeHeadlineFindings(deriveConsentAuditFindings(snapshot, runtimeArtifacts));
    accessibilityIssueRows = snapshot ? deriveAccessibilityIssueRows(snapshot) : [];
    accessibilityRuleEvidenceRows = deriveAccessibilityRuleEvidenceRows({
      examples: scanRecord.accessibilityRuleExamples ?? [],
      ruleCounts: scanRecord.accessibilityRuleCounts ?? []
    });
    prioritizedAccessibilityRuleRows = [...accessibilityRuleEvidenceRows]
      .sort((left, right) => right.weightedPriority - left.weightedPriority)
      .slice(0, 6);
    taxonomySnapshotSections = snapshot
      ? groupSnapshotFieldsByPrimaryCategory(Object.keys(snapshot)).map((group) => ({
          title: group.category.label,
          description: group.category.description,
          fields: group.entries.map((entry) => entry.key)
        }))
      : [];
  } catch (error) {
    reviewSectionError = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to prepare scan review sections", error);
  }

  const preConsentTrackingObserved =
    snapshot?.preconsent_tracking_detected === true ||
    snapshot?.tracking_before_consent_detected === true ||
    hasTruthySignal(scanRecord.signals, "tracking_before_consent_detected") ||
    hasTruthySignal(scanRecord.signals, "preconsent_tracking_detected") ||
    hasTruthySignal(scanRecord.signals, "third_party_cookie_set_before_consent");
  const consentAuditCompleted = getRecordBoolean(runtimeArtifacts, "consent_audit_completed");
  const consentRejectInteractionSucceeded = getRecordBoolean(runtimeArtifacts, "consent_reject_interaction_succeeded");
  const consentAcceptInteractionSucceeded = getRecordBoolean(runtimeArtifacts, "consent_accept_interaction_succeeded");
  const consentRejectReducedTracking = runtimeArtifacts?.consent_reject_reduced_tracking;
  const consentRejectReducedThirdPartyCookies = runtimeArtifacts?.consent_reject_reduced_third_party_cookies;
  const consentBaselineCookieCount = getRecordNumber(runtimeArtifacts, "consent_baseline_cookie_count");
  const consentPostRejectCookieCount = getRecordNumber(runtimeArtifacts, "consent_post_reject_cookie_count");
  const consentPreconsentViolationCount = getRecordNumber(runtimeArtifacts, "consent_preconsent_violation_count");
  const consentBaselineTrackerEvidenceUrls = getRecordStringArray(runtimeArtifacts, "consent_baseline_tracker_evidence_urls");
  const consentBaselineTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_baseline_tracker_vendor_names");
  const consentPostRejectTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_post_reject_tracker_vendor_names");
  const consentPostRejectTrackerEvidenceUrls = getRecordStringArray(runtimeArtifacts, "consent_post_reject_tracker_evidence_urls");
  const consentRejectPersistedTrackerVendors = getRecordStringArray(
    runtimeArtifacts,
    "consent_reject_persisted_tracker_vendor_names"
  );
  const consentRejectNewTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_reject_new_tracker_vendor_names");
  const consentAcceptNewTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_accept_new_tracker_vendor_names");
  const consentPostAcceptTrackerEvidenceUrls = getRecordStringArray(runtimeArtifacts, "consent_post_accept_tracker_evidence_urls");
  const buildPhaseSummaries = getRecordObjectArray(runtimeArtifacts, "build_phase_summaries").map((row) => ({
    attempts: typeof row.attempts === "number" ? row.attempts : null,
    completedAt: typeof row.completedAt === "string" ? row.completedAt : null,
    durationMs: typeof row.durationMs === "number" ? row.durationMs : null,
    error: typeof row.error === "string" ? row.error : null,
    outcome: typeof row.outcome === "string" ? row.outcome : "unknown",
    phase: typeof row.phase === "string" ? row.phase : "unknown",
    startedAt: typeof row.startedAt === "string" ? row.startedAt : null
  }));
  const privacyLegalSectionScore = averageNumbers([
    getFiniteNumber(snapshot?.privacy_score),
    getFiniteNumber(snapshot?.legal_coverage_score)
  ]);
  const cookieConsentSectionScore = getFiniteNumber(snapshot?.consent_score);
  const trackerSectionScore = averageNumbers([
    invertRiskScore(snapshot?.tracker_risk_score),
    invertRiskScore(snapshot?.data_collection_risk_score)
  ]);
  const preconsentSectionScore = derivePreconsentSectionScore({
    consentAuditCompleted,
    consentRejectReducedTracking,
    preConsentTrackingObserved,
    preconsentViolationCount: consentPreconsentViolationCount
  });
  const accessibilityConsumerSectionScore = averageNumbers([
    getFiniteNumber(snapshot?.accessibility_score),
    getFiniteNumber(snapshot?.consumer_protection_score)
  ]);
  const showHomepagePreviewGate = previewMode === "homepage" && Boolean(createAccountHref);
  const findingEvidenceDiagnostics = snapshot && !reviewSectionError ? buildScanReportUnifiedFindings(scanRecord) : [];
  const shouldPreferCanonicalReview =
    findingEvidenceDiagnostics.length > 0 ||
    scanRecord.policyEnrichment.length > 0 ||
    scanRecord.preconsentViolations.length > 0 ||
    scanRecord.trackerVendors.length > 0;
  const executiveSummaryBadgeCounts = deriveExecutiveSummaryBadgeCounts(findingEvidenceDiagnostics);
  const executiveSupplementalFindings = buildExecutiveSupplementalFindings({
    certFindings: certScoreSummary.findings,
    contradictions: policyBehaviorContradictions,
    snapshot
  });
  const hasSupplementalDarkPatternFinding = executiveSupplementalFindings.some((finding) => finding.id === "consent_dark_patterns_detected");
  const filteredCertFindings = certScoreSummary.findings.filter((finding) =>
    hasSupplementalDarkPatternFinding ? finding.id !== "asymmetric_consent_ui" : true
  );
  const presentedCertScoreFindings = executiveAccessLimitationNotice ? [] : certScoreSummary.findings;
  const baseExecutiveFindings = selectTopFindings(filteredCertFindings, 5);
  const topExecutiveFindings = executiveAccessLimitationNotice
    ? [executiveAccessLimitationNotice.finding]
    : selectTopFindings(
        [...executiveSupplementalFindings, ...baseExecutiveFindings],
        Math.min(6, 5 + executiveSupplementalFindings.length)
      );
  const scanExecutionSummary = deriveScanExecutionSummary({
    accessibilityRuleCountTotal: scanRecord.accessibilityRuleCounts.length,
    authWallDetected: snapshot?.auth_wall_detected === true,
    blockedFlag: snapshot?.blocked_flag === true,
    captchaFlag: snapshot?.captcha_flag === true,
    consentAuditCompleted,
    consentPreconsentViolationCount,
    errorMessage: scanRecord.scan.errorMessage,
    events: scanRecord.events,
    homepageFetchHttpStatus: typeof snapshot?.homepage_fetch_http_status === "number" ? snapshot.homepage_fetch_http_status : null,
    homepageFetchStatus: typeof snapshot?.homepage_fetch_status === "string" ? snapshot.homepage_fetch_status : null,
    keyPageDiscoverySummary:
      runtimeArtifacts && typeof runtimeArtifacts === "object" ? (runtimeArtifacts.key_page_discovery_summary ?? null) : null,
    pagesRequested: scanRecord.scan.pagesRequested,
    pagesScanned: scanRecord.scan.pagesScanned,
    preconsentTrackingDetected: snapshot?.preconsent_tracking_detected === true,
    renderModeUsed: typeof snapshot?.render_mode_used === "string" ? snapshot.render_mode_used : null,
    robotsAllowed: snapshot?.robots_allowed === true ? true : snapshot?.robots_allowed === false ? false : null,
    robotsFetchHttpStatus: typeof snapshot?.robots_fetch_http_status === "number" ? snapshot.robots_fetch_http_status : null,
    robotsFetchStatus: typeof snapshot?.robots_fetch_status === "string" ? snapshot.robots_fetch_status : null,
    status: scanRecord.scan.status,
    timeoutFlag: snapshot?.timeout_flag === true,
    trackingBeforeConsentDetected: snapshot?.tracking_before_consent_detected === true,
    trackerEvidenceUrlCount: consentBaselineTrackerEvidenceUrls.length,
    wcagErrorCountTotal: getRecordNumber(snapshot, "wcag_error_count_total")
  });
  const isScanInFlight = scanRecord.scan.status === "queued" || scanRecord.scan.status === "running";

  return (
    <div className="min-w-0 overflow-x-hidden space-y-8">
      <ScanPageHeader
        actions={headerActions}
        autoRefresh={autoRefresh}
        createdAtLabel={`Created ${formatDateTime(scanRecord.scan.createdAt)}`}
        status={scanRecord.scan.status}
        title={`Scan: ${scanRecord.scan.domainHostname ?? "Unknown website"}`}
      />
      {isScanInFlight ? (
        <FullScanProgressCard
          buildPhaseSummaries={buildPhaseSummaries}
          createdAt={scanRecord.scan.createdAt}
          events={scanRecord.events}
          executionSummary={scanRecord.scan.executionSummary}
          status={scanRecord.scan.status}
        />
      ) : null}
      {previewNotice}
      {!isScanInFlight ? (
        <>
          <ExecutiveSummaryCard
            accessLimitationNotice={
              executiveAccessLimitationNotice
                ? {
                    coverageLabel: executiveAccessLimitationNotice.review.coverageLabel,
                    guidance: executiveAccessLimitationNotice.review.guidance,
                    headline: "Public site access was limited during this scan",
                    message: executiveAccessLimitationNotice.finding.shortSummary,
                    recommendationTitle: executiveAccessLimitationNotice.review.recommendationTitle,
                    reason: executiveAccessLimitationNotice.review.reason,
                    title: executiveAccessLimitationNotice.review.title,
                    whatThisMeans: executiveAccessLimitationNotice.review.whatThisMeans
                  }
                : null
            }
            beforeConsentCookieCount={cookiesBeforeConsentCount}
            domainBenchmark={scanRecord.domainBenchmark}
            finalHost={certScoreSummary.finalHost}
            fingerprintReasons={executiveFingerprintReasons}
            fingerprintLabel={certScoreSummary.fingerprintLabel}
            fingerprintNarrative={certScoreSummary.fingerprintNarrative}
            landedOnDifferentHost={certScoreSummary.landedOnDifferentHost}
            lastScannedAt={certScoreSummary.lastScannedAt}
            posture={executiveAccessLimitationNotice ? "Watch" : certScoreSummary.posture}
            preConsentVendorNames={certScoreSummary.preConsentVendorNames}
            requestedHost={certScoreSummary.requestedHost}
            resolvedVendorNames={executiveResolvedVendorNames}
            score={executiveDisplayedScore}
            sessionReplayVendorNames={certScoreSummary.sessionReplayVendorNames}
            thirdPartyRequestCount={executiveThirdPartyRequestCount}
            thirdPartyDomains={executiveThirdPartyDomains}
            topFindings={topExecutiveFindings}
            topObservedEntities={executiveTopObservedEntities}
            trackerSummary={executiveTrackerSummary}
            unresolvedVendorHosts={executiveUnresolvedVendorHosts}
            vendorCategoryCounts={executiveVendorCategoryCounts}
            lightweightHeroMetrics={lightweightHeroMetrics}
          />
          {presentedCertScoreFindings.length > 0 ? (
        <section className="space-y-6">
          <div className="space-y-2.5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Key risk signals</p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Evidence-backed findings</h2>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              Plain-language findings first. Direct evidence, confidence, and analyst detail are available immediately below each card.
            </p>
          </div>
          <CollapsibleSectionCard
            title="Supporting evidence"
            subtitle="Tracker, storage, navigation, and UI evidence kept available without dominating the main report."
            defaultOpen={false}
            contentClassName="space-y-4"
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <VendorFootprintCard
                adtechHosts={certScoreSummary.rawAdtechHosts}
                domains={executiveThirdPartyDomains}
                observedCookieCount={cookiesSeenCount}
                observedDomainCount={fallbackObservedDomainCount || undefined}
                observedIpCount={fallbackObservedIpCount || undefined}
                observedRequestCount={fallbackObservedRequestCount || undefined}
                preConsentVendors={certScoreSummary.preConsentVendorNames}
                sessionReplayVendors={certScoreSummary.sessionReplayVendorNames}
                topObservedEntities={executiveTopObservedEntities}
                trackerSummary={executiveTrackerSummary}
                unresolvedHosts={executiveUnresolvedVendorHosts}
                vendorCategoryCounts={executiveVendorCategoryCounts}
                vendors={executiveResolvedVendorNames}
              />
              <FingerprintingPanel
                categories={getRecordObjectArray(hybridFingerprintSummary, "attributeCategories").map((row) => ({
                  count: typeof row.count === "number" ? row.count : 0,
                  firstSeenMs: typeof row.firstSeenMs === "number" ? row.firstSeenMs : null,
                  name: typeof row.name === "string" ? row.name : "unknown"
                }))}
                confidence={typeof hybridFingerprintSummary?.confidence === "string" ? hybridFingerprintSummary.confidence : null}
                label={certScoreSummary.fingerprintLabel}
                narrative={certScoreSummary.fingerprintNarrative}
                reasons={executiveFingerprintReasons}
              />
              <CookieStoragePanel
                adtechCookieNames={certScoreSummary.adtechCookieNames}
                analyticsCookieNames={certScoreSummary.analyticsCookieNames}
                cookieNamesBeforeConsent={certScoreSummary.cookieNamesBeforeConsent}
                cookiesBeforeConsentCount={certScoreSummary.cookieNamesBeforeConsent.length > 0 ? certScoreSummary.cookieNamesBeforeConsent.length : cookiesBeforeConsentCount}
                cookiesSeenCount={cookiesSeenCount}
                localStorageKeys={getRecordStringArray(hybridStorageSummary, "localStorageKeySample")}
                securityCookieNames={certScoreSummary.securityCookieNames}
                sessionStorageKeys={getRecordStringArray(hybridStorageSummary, "sessionStorageKeySample")}
                storageWrittenBeforeConsent={hybridStorageSummary?.storageWrittenBeforeConsent === true}
                thirdPartyCookieNames={certScoreSummary.thirdPartyCookieNamesSeen}
                thirdPartyCookieBeforeConsentCount={
                  certScoreSummary.thirdPartyCookieNamesBeforeConsent.length > 0
                    ? certScoreSummary.thirdPartyCookieNamesBeforeConsent.length
                    : (getRecordNumber(hybridStorageSummary, "thirdPartyCookieBeforeConsentCount") ?? 0)
                }
                thirdPartyCookieNamesBeforeConsent={certScoreSummary.thirdPartyCookieNamesBeforeConsent}
                thirdPartyCookiesSeenCount={thirdPartyCookiesSeenCount}
              />
              <RedirectFlowPanel
                autoRedirect={hybridNavigationSummary?.autoRedirect === true}
                crossDomainHopCount={getRecordNumber(hybridNavigationSummary, "crossDomainHopCount") ?? 0}
                finalUrl={typeof hybridNavigationSummary?.finalUrl === "string" ? hybridNavigationSummary.finalUrl : null}
                initialUrl={typeof hybridNavigationSummary?.initialUrl === "string" ? hybridNavigationSummary.initialUrl : null}
                redirectHopCount={getRecordNumber(hybridNavigationSummary, "redirectHopCount") ?? 0}
              />
              <div className="xl:col-span-2">
                <DiagnosticsPanel
                  autoplayObserved={hybridMediaSummary?.autoplayVideoObserved === true || hybridMediaSummary?.autoplayAudioObserved === true}
                  forcedActionRequired={hybridUiSummary?.forcedActionRequired === true}
                  interstitialDetected={hybridUiSummary?.interstitialDetected === true}
                  overlayDetected={hybridUiSummary?.overlayDetected === true}
                  popupCount={getRecordNumber(hybridUiSummary, "popupCount") ?? 0}
                />
              </div>
            </div>
          </CollapsibleSectionCard>
          <div className="space-y-5">
            {certScoreSummary.groupedFindings.map((group) => (
              <FindingsSection key={group.section} findings={group.findings} section={group.section} />
            ))}
          </div>
        </section>
          ) : null}
        </>
      ) : null}
      {!isScanInFlight && snapshot ? (
        <>
          {reviewSectionError ? (
            <ScanSectionFallback
              title="Review sections unavailable"
              message={`The live scan loaded, but the structured review sections could not be prepared for this scan. ${reviewSectionError}`}
            />
          ) : executiveAccessLimitationNotice ? (
            <LimitedSurfaceReview review={executiveAccessLimitationNotice.review} />
          ) : unverifiedHomepageReview && !suppressLimitedSurfaceReview && !shouldPreferCanonicalReview ? (
            <LimitedSurfaceReview review={unverifiedHomepageReview} />
          ) : (
            renderCanonicalTaxonomyReviewSafely({
              accessibilityIssueRows,
              consentAuditFindings,
              createAccountHref,
              executiveSummary: {
                badges: [
                  ...(executiveSummaryBadgeCounts.contradictionCount > 0
                    ? [
                        {
                          label: `${executiveSummaryBadgeCounts.contradictionCount} contradiction${executiveSummaryBadgeCounts.contradictionCount === 1 ? "" : "s"}`,
                          tone: "warning" as const,
                          tooltip:
                            "Number of policy-versus-behavior contradictions surfaced from comparing public claims with observed runtime behavior."
                        }
                      ]
                    : []),
                  ...(executiveSummaryBadgeCounts.preconsentConflictCount > 0
                    ? [
                        {
                          label: `${executiveSummaryBadgeCounts.preconsentConflictCount} pre-consent conflict${executiveSummaryBadgeCounts.preconsentConflictCount === 1 ? "" : "s"}`,
                          tone: "warning" as const,
                          tooltip:
                            "Number of tracker vendors with persisted evidence showing they fired before a consent interaction was completed."
                        }
                      ]
                    : []),
                  ...(consentAuditCompleted
                    ? [
                        {
                          label: `reject ${
                            consentRejectReducedTracking === false
                              ? "failed"
                              : consentRejectReducedTracking === true
                                ? "reduced tracking"
                                : "audit completed"
                          }`,
                          tooltip:
                            "Outcome of the consent interaction audit after attempting a reject path. This shows whether tracking activity actually changed after the choice."
                        }
                      ]
                    : [])
                ],
                metrics: [
                  {
                    href: "#coverage-section-privacy_notices_rights_data_handling",
                    label: "Privacy & disclosure",
                    tooltip:
                      "Combined 1 to 5 section rating for privacy-policy quality, policy-page coverage, and consumer-facing disclosure posture.",
                    value: formatRating(privacyLegalSectionScore)
                  },
                  {
                    href: "#coverage-section-consent_controls_enforcement",
                    label: "Consent",
                    tooltip:
                      "Combined 1 to 5 section rating for banner visibility, choice quality, CMP posture, and consent-flow behavior.",
                    value: formatRating(cookieConsentSectionScore)
                  },
                  {
                    href: "#coverage-section-tracking_third_party_ecosystem",
                    label: "Trackers",
                    tooltip:
                      "Combined 1 to 5 section rating for tracker risk, third-party collection surface, and the observed vendor ecosystem.",
                    value: formatRating(trackerSectionScore)
                  },
                  {
                    href: "#coverage-section-tracking_third_party_ecosystem",
                    label: "Pre-consent",
                    tooltip:
                      "Combined 1 to 5 section rating for whether trackers fired before consent and whether the consent audit showed enforcement failures.",
                    value: formatRating(preconsentSectionScore)
                  },
                  {
                    href: "#coverage-section-access_barriers_task_completion",
                    label: "Accessibility & consumer",
                    tooltip:
                      "Combined 1 to 5 section rating for accessibility posture, WCAG-oriented findings, and broader consumer-facing signals.",
                    value: formatRating(accessibilityConsumerSectionScore)
                  }
                ],
                statusCallout: scanExecutionSummary
                  ? {
                      title: scanExecutionSummary.title,
                      details: scanExecutionSummary.details,
                      tone: scanExecutionSummary.tone
                    }
                  : null
              },
              policyBehaviorContradictions,
              preconsentViolationRows,
              previewMode,
              prioritizedAccessibilityRuleRows,
              scanRecord,
              scanReportReviewIssues,
              snapshot
            })
          )}
        </>
      ) : null}

      <SignalEnrichmentWorkflowCard
        finalHost={certScoreSummary.finalHost}
        landedOnDifferentHost={certScoreSummary.landedOnDifferentHost}
        requestedHost={certScoreSummary.requestedHost}
        scanRecord={scanRecord}
      />

      <div className="relative overflow-hidden rounded-2xl">
        <CollapsibleSectionCard
          title={
            <span className="flex items-center gap-1.5">
              <span>Advanced diagnostics</span>
              <InfoTip text="Raw scan records, execution metadata, and lower-level evidence retained for deeper review or troubleshooting. This area is intentionally schema-heavier than the primary result sections above." />
            </span>
          }
          contentClassName="space-y-6"
        >
          <CollapsibleSectionCard
            title={
              <span className="flex items-center gap-1.5">
                <span>Scan coverage & access posture</span>
                <InfoTip text="Operational scan-stop detail, access posture, and retained early-surface evidence. Kept here for troubleshooting instead of the main narrative." />
              </span>
            }
            defaultOpen={false}
          >
            <AccessPostureSummaryCard summary={scanRecord.accessPostureSummary} />
          </CollapsibleSectionCard>

          {snapshot ? (
            <CollapsibleSectionCard
              title={
                <span className="flex items-center gap-1.5">
                  <span>AI, Automation & Emerging Practices</span>
                  <InfoTip text="AI assistants, automation disclosures, AI answer experiences, and related emerging-practice signals kept in diagnostics for research and lower-priority review." />
                </span>
              }
            >
              <ResultCategorySection
                title={PRIMARY_SCAN_CATEGORY_META.ai_automation_emerging_practices.label}
                collapsible={false}
                metrics={[
                  {
                    label: "AI chatbot",
                    value: formatCompactValue(snapshot.ai_chatbot_present),
                    tooltip:
                      "Whether the scan detected a likely visible chatbot or assistant experience based on vendor signatures, widget markers, and explicit assistant language."
                  },
                  {
                    label: "AI vendor",
                    value: formatCompactValue(snapshot.ai_chatbot_vendor),
                    tooltip:
                      "The strongest visible AI or chat-assistant vendor signature detected on the site during the scan, if any."
                  },
                  {
                    label: "AI disclosure",
                    value: formatCompactValue(snapshot.ai_disclosure_text_present),
                    tooltip:
                      "Whether visible page text suggested explicit AI-related disclosure language such as AI-generated responses, powered by AI, or automated assistant messaging."
                  },
                  {
                    label: "AI search/answers",
                    value: formatCompactValue(snapshot.ai_search_or_answer_experience_detected),
                    tooltip:
                      "Whether the scan detected a clearly AI-labeled question-to-answer or instant-answer experience, beyond generic site search."
                  }
                ]}
                details={[
                  { label: "AI assistant widget", value: snapshot.ai_assistant_widget_detected },
                  { label: "AI policy reference", value: snapshot.ai_terms_or_policy_ai_reference },
                  { label: "AI help-center reference", value: snapshot.ai_help_center_ai_reference },
                  { label: "Hiring automation signal", value: snapshot.ai_hiring_automation_signal_detected }
                ]}
              />
            </CollapsibleSectionCard>
          ) : null}

          {snapshot ? (
            <ResultCategorySection
              title={PRIMARY_SCAN_CATEGORY_META.security_trust_governance.label}
              intro={PRIMARY_SCAN_CATEGORY_META.security_trust_governance.description}
              includes="Transport and headers, DNS authentication, trust and disclosure pages, and incident or vulnerability transparency signals."
              collapsible={false}
              metrics={[
                {
                  label: "TLS minimum",
                  value: formatCompactValue(snapshot.tls_version_min_supported),
                  tooltip:
                    "The minimum TLS protocol version observed or inferred for the site, used as a basic indicator of transport security posture."
                },
                {
                  label: "HSTS",
                  value: formatCompactValue(snapshot.hsts_enabled),
                  tooltip:
                    "Whether HTTP Strict Transport Security was observed, which helps enforce HTTPS usage in supported browsers."
                },
                {
                  label: "CSP",
                  value: formatCompactValue(snapshot.csp_header_present),
                  tooltip:
                    "Whether a Content Security Policy header was observed, which is a basic indicator of script and resource-loading controls."
                },
                {
                  label: "DMARC",
                  value: formatCompactValue(snapshot.dmarc_record_present),
                  tooltip:
                    "Whether a DMARC record was detected for the domain, which is a useful public signal of email authentication governance."
                }
              ]}
              details={[
                { label: "Permissions policy", value: snapshot.permissions_policy_present },
                { label: "security.txt", value: snapshot.security_txt_present },
                { label: "Vulnerability disclosure page", value: snapshot.vulnerability_disclosure_page_present },
                { label: "Trust center", value: snapshot.trust_center_present },
                { label: "Incident status page", value: snapshot.incident_status_page_present },
                { label: "DNSSEC", value: snapshot.dnssec_enabled },
                { label: "SPF", value: snapshot.spf_record_present },
                { label: "DKIM", value: snapshot.dkim_record_detected },
                { label: "Certificate authority", value: snapshot.certificate_authority },
                { label: "Security posture changed", value: snapshot.security_header_posture_changed },
                { label: "Infrastructure changed", value: snapshot.infrastructure_change_detected },
                { label: "Country inferred", value: snapshot.country_inferred },
                { label: "Jurisdiction guess", value: snapshot.jurisdiction_guess }
              ]}
            />
          ) : null}

          <FindingEvidenceDiagnostics findings={findingEvidenceDiagnostics} />

        <CollapsibleSectionCard
          title={
            <span className="flex items-center gap-1.5">
              <span>Raw signals</span>
              <InfoTip text="The active structured signals persisted for this scan. These normalized flags and counts drive the downstream summaries and scores." />
            </span>
          }
        >
          {scanRecord.signals.length === 0 ? (
            <p className="text-sm text-slate-600">No structured signals are available for this scan yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {scanRecord.signals.map((signal, index) => (
                <div key={`${signal.key}:${index}`} className="rounded-2xl border border-slate-200 p-4">
                  <p className="font-medium text-slate-900">{signal.label}</p>
                  <p className="mt-1 text-sm text-slate-500">{signal.primaryCategoryLabel}{signal.subcategory ? ` · ${signal.subcategory}` : ""}</p>
                  <p className="mt-3 text-sm text-slate-700">
                    {Array.isArray(signal.value) ? signal.value.join(", ") : String(signal.value)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSectionCard>

        {snapshot ? (
          <div className="grid gap-6 xl:grid-cols-2">
            {OPERATIONAL_SNAPSHOT_SECTIONS.map((section) => (
              <CollapsibleSectionCard
                key={section.title}
                title={
                  <span className="flex items-center gap-1.5">
                    <span>{section.title}</span>
                    <InfoTip text={SNAPSHOT_SECTION_HELP[section.title] ?? "Structured snapshot fields persisted for this area of the scan."} />
                  </span>
                }
                contentClassName="space-y-2 text-sm"
              >
                {section.fields.map((field) => (
                  <div key={field} className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
                    <span className="font-medium text-slate-700">{field}</span>
                    <span className="max-w-[60%] text-right text-slate-600">{formatValue(snapshot[field])}</span>
                  </div>
                ))}
              </CollapsibleSectionCard>
            ))}

            {taxonomySnapshotSections.map((section) => (
              <CollapsibleSectionCard
                key={section.title}
                title={
                  <span className="flex items-center gap-1.5">
                    <span>{section.title}</span>
                    <InfoTip text={section.description} />
                  </span>
                }
                contentClassName="space-y-2 text-sm"
              >
                {section.fields.map((field) => (
                  <div key={field} className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
                    <span className="font-medium text-slate-700">{field}</span>
                    <span className="max-w-[60%] text-right text-slate-600">{formatValue(snapshot[field])}</span>
                  </div>
                ))}
              </CollapsibleSectionCard>
            ))}
          </div>
        ) : null}

        {snapshot ? (
          <CollapsibleSectionCard
            title={
              <span className="flex items-center gap-1.5">
                <span>Accessibility metrics</span>
                <InfoTip text="Automated accessibility metrics and related public-facing accessibility signals detected during this scan." />
              </span>
            }
            contentClassName="grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4"
          >
            <p>Accessibility score: {formatValue(snapshot.accessibility_score)}</p>
            <p>Automated score: {formatValue(snapshot.accessibility_score_automated)}</p>
            <p>WCAG errors: {formatValue(snapshot.wcag_error_count_total)}</p>
            <p>WCAG warnings: {formatValue(snapshot.wcag_warning_count_total)}</p>
            <p>Missing alt text: {formatValue(snapshot.wcag_missing_alt_count)}</p>
            <p>Form label issues: {formatValue(snapshot.wcag_form_label_error_count)}</p>
            <p>Keyboard issues: {formatValue(snapshot.wcag_keyboard_navigation_issue_count)}</p>
            <p>Claim mismatch detected: {formatValue(snapshot.accessibility_claim_mismatch_detected)}</p>
            <p>Accessibility statement present: {formatValue(snapshot.accessibility_statement_present)}</p>
            <p>Accessibility contact present: {formatValue(snapshot.accessibility_contact_method_present)}</p>
            <p>Widget present: {formatValue(snapshot.accessibility_widget_present)}</p>
            <p>Accessibility risk score: {formatValue(snapshot.accessibility_litigation_risk_score)}</p>
          </CollapsibleSectionCard>
        ) : null}

        {runtimeArtifacts ? (
          <CollapsibleSectionCard
            title={
              <span className="flex items-center gap-1.5">
                <span>{hybridRuntimeSummaryRows ? "Hybrid Runtime Evidence" : "Runtime evidence"}</span>
                <InfoTip text="Compact browser-run evidence from the active hybrid scanner. When available, this summary is sourced directly from hybrid runtime evidence instead of legacy flat runtime fields." />
              </span>
            }
            contentClassName="grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4"
          >
            {hybridRuntimeSummaryRows
              ? hybridRuntimeSummaryRows.map((row) => <p key={row.label}>{row.label}: {formatValue(row.value)}</p>)
              : (
                <>
                  <p>Third-party request count: {formatValue(runtimeArtifacts.third_party_request_count)}</p>
                  <p>Third-party request domains: {formatValue(runtimeArtifacts.third_party_request_domains)}</p>
                  <p>Initial cookie count: {formatValue(runtimeArtifacts.initial_cookie_count)}</p>
                  <p>Initial cookie names: {formatValue(runtimeArtifacts.initial_cookie_names)}</p>
                  <p>Script tag count: {formatValue(runtimeArtifacts.script_tag_count)}</p>
                  <p>Script source domains: {formatValue(runtimeArtifacts.script_src_domains)}</p>
                  <p>DOM node count: {formatValue(runtimeArtifacts.dom_node_count)}</p>
                  <p>DOM structure hash: {formatValue(runtimeArtifacts.dom_structure_hash)}</p>
                </>
              )}
          </CollapsibleSectionCard>
        ) : null}
        </CollapsibleSectionCard>
        {showHomepagePreviewGate && createAccountHref ? (
          <HomepagePreviewGate href={createAccountHref} mode="full" />
        ) : null}
      </div>
    </div>
  );
}
