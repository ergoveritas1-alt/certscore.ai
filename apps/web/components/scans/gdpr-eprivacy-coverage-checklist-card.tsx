"use client";

import React from "react";
import { cn } from "@website-signal-risk-scanner/ui";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import { useRegulatoryChecklistAdvancedEvidence } from "./regulatory-checklist-advanced-evidence-context";
import { RegulatoryChecklistCorrectionSteps, RegulatoryChecklistEvidenceDetails } from "./regulatory-checklist-evidence-details";
import { ScanReportDisclosureIcon } from "./scan-report-disclosure-icon";
import type {
  GdprEprivacyCoverageChecklistItem
} from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import {
  deriveGdprEprivacyReviewSummary,
} from "../../lib/scans/gdpr-eprivacy-review-summary";
import { getReportableGdprEprivacyCoverageItems } from "../../lib/scans/gdpr-eprivacy-reportable-rows";
import { deriveRegulatoryCoverageScore } from "../../lib/scans/regulatory-coverage-score";

type GdprEprivacyCoverageChecklistCardProps = {
  defaultOpen?: boolean;
  gdprEprivacyLens?: {
    ratingLabel: string;
    score: number | null;
    summary?: string;
  } | null;
  items: GdprEprivacyCoverageChecklistItem[];
  showDebugConfidenceImprovements?: boolean;
  showSummaryStrip?: boolean;
};

type EvidenceLabel = "Observed" | "Not observed" | "Potential gap" | "Partial" | "Not testable";
type AssessmentDirection =
  | "positive_signal"
  | "neutral_signal"
  | "review_signal"
  | "potential_concern"
  | "technical_limitation";
type RowToolState = Partial<Record<"correction" | "evidence", boolean>>;

const DIRECTION_UI: Record<AssessmentDirection, {
  icon: "alert" | "check" | "equal" | "flag" | "info" | "slash";
  label: "Positive signal" | "Neutral signal" | "Review signal" | "Potential concern" | "Technical limitation";
}> = {
  positive_signal: {
    icon: "check",
    label: "Positive signal"
  },
  neutral_signal: {
    icon: "equal",
    label: "Neutral signal"
  },
  review_signal: {
    icon: "flag",
    label: "Review signal"
  },
  potential_concern: {
    icon: "alert",
    label: "Potential concern"
  },
  technical_limitation: {
    icon: "slash",
    label: "Technical limitation"
  }
};

const REPORT_ROW_GROUPS = [
  {
    title: "Consent Surface",
    rowIds: [
      "consent_surface_observed",
      "reject_all_path_availability",
      "cmp_framework_signal_observed",
      "cookie_notice_policy_availability"
    ]
  },
  {
    title: "Pre-Consent Runtime",
    rowIds: [
      "pre_consent_cookies_storage",
      "pre_consent_third_party_tracking",
      "advertising_retargeting_vendor_signal_observed",
      "analytics_vendor_observed",
      "session_replay_fingerprinting_review",
      "device_identification_fingerprinting_signal_observed",
      "embedded_content_pre_consent"
    ]
  },
  {
    title: "GDPR Transparency",
    rowIds: [
      "privacy_notice_availability",
      "controller_contact_disclosure",
      "processing_purposes_disclosure",
      "legal_basis_disclosure_observed",
      "recipients_vendor_categories_disclosure",
      "retention_disclosure_observed",
      "data_subject_rights_disclosure",
      "international_transfers_disclosure"
    ]
  }
] as const;

const RISK_SIGNAL_ROW_IDS = new Set([
  "pre_consent_cookies_storage",
  "pre_consent_third_party_tracking",
  "advertising_retargeting_vendor_signal_observed",
  "analytics_vendor_observed",
  "session_replay_fingerprinting_review",
  "device_identification_fingerprinting_signal_observed",
  "embedded_content_pre_consent"
]);

const POSITIVE_WHEN_OBSERVED_ROW_IDS = new Set([
  "consent_surface_observed",
  "reject_all_path_availability",
  "cookie_notice_policy_availability",
  "privacy_notice_availability",
  "controller_contact_disclosure",
  "processing_purposes_disclosure",
  "legal_basis_disclosure_observed",
  "recipients_vendor_categories_disclosure",
  "retention_disclosure_observed",
  "data_subject_rights_disclosure",
  "international_transfers_disclosure",
  "dpo_contact_point_disclosure",
  "supervisory_authority_complaint_disclosure",
  "automated_decision_making_profiling_disclosure"
]);

const NEUTRAL_WHEN_OBSERVED_ROW_IDS = new Set([
  "cmp_framework_signal_observed"
]);

const POSITIVE_WHEN_NOT_OBSERVED_ROW_IDS = new Set([
  "pre_consent_cookies_storage",
  "pre_consent_third_party_tracking"
]);

function getEvidenceLabel(item: GdprEprivacyCoverageChecklistItem): EvidenceLabel {
  if (item.assessmentStatus === "coverage_limitation" || item.evidenceState === "not_testable" || item.status === "Not testable") {
    return "Not testable";
  }
  if (item.status === "Gap observed") {
    return "Potential gap";
  }
  if (item.status === "Insufficient evidence" || item.status === "Not confirmed" || item.status === "Review signal") {
    return "Partial";
  }
  if (item.evidenceState === "observed" || item.status === "Observed") {
    return "Observed";
  }
  return "Not observed";
}

function retainedBoolean(item: GdprEprivacyCoverageChecklistItem, keys: string[]) {
  return keys.some((key) => item.criticalEvidence.retainedEvidence[key] === true);
}

function retainedNumber(item: GdprEprivacyCoverageChecklistItem, keys: string[]) {
  for (const key of keys) {
    const value = item.criticalEvidence.retainedEvidence[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function retainedText(item: GdprEprivacyCoverageChecklistItem) {
  return JSON.stringify(
    item.criticalEvidence.retainedEvidence,
    (_key, value) => typeof value === "bigint" ? value.toString() : value
  ).toLowerCase();
}

function evidenceMentions(item: GdprEprivacyCoverageChecklistItem, pattern: RegExp) {
  return pattern.test([
    item.explanation,
    item.note,
    item.criticalEvidence.statusBasis,
    item.evidenceRefs.join(" "),
    retainedText(item)
  ].join(" ").toLowerCase());
}

function retainedRecord(item: GdprEprivacyCoverageChecklistItem, key: string) {
  const value = item.criticalEvidence.retainedEvidence[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function retainedPurposeMixHas(item: GdprEprivacyCoverageChecklistItem, keys: string[]) {
  const mix = retainedRecord(item, "preconsentPurposeRiskMix") ?? retainedRecord(item, "preconsent_purpose_risk_mix");
  if (!mix) {
    return null;
  }
  return keys.some((key) => Array.isArray(mix[key]) && mix[key].length > 0);
}

function hasHighRiskPreconsentPurpose(item: GdprEprivacyCoverageChecklistItem) {
  return retainedPurposeMixHas(item, ["advertising", "retargeting", "marketingAnalytics", "sessionReplay"]);
}

function hasHighConfidenceStorageConcern(item: GdprEprivacyCoverageChecklistItem) {
  return retainedBoolean(item, [
    "eligibleNonEssentialCookieStorageFindingProjected",
    "nonEssentialCookieStorageObserved",
    "non_essential_cookie_storage_observed",
    "thirdPartyCookieStorageObserved",
    "third_party_cookie_storage_observed",
    "advertisingCookieStorageObserved",
    "analyticsCookieStorageObserved",
    "sessionReplayCookieStorageObserved",
    "deviceIdentificationStorageObserved"
  ]);
}

function hasStrictlyNecessaryStorageOnly(item: GdprEprivacyCoverageChecklistItem) {
  return retainedBoolean(item, [
    "strictlyNecessaryStorageOnly",
    "strictly_necessary_storage_only",
    "essentialStorageOnly",
    "essential_storage_only",
    "securityStorageOnly",
    "security_storage_only",
    "sessionStorageOnly",
    "session_storage_only"
  ]) || (
    evidenceMentions(item, /\b(strictly necessary|essential|security|fraud|bot|session only)\b/i) &&
    !hasHighConfidenceStorageConcern(item)
  );
}

function hasHighConfidenceAdvertisingConcern(item: GdprEprivacyCoverageChecklistItem) {
  const highRiskPurpose = retainedPurposeMixHas(item, ["advertising", "retargeting"]);
  if (highRiskPurpose !== null) {
    return highRiskPurpose;
  }
  const count = retainedNumber(item, [
    "advertisingRetargetingVendorCount",
    "advertising_retargeting_vendor_count",
    "adtechVendorCount",
    "adtech_vendor_count"
  ]);
  return (count !== null && count > 0) ||
    evidenceMentions(item, /\b(advertis(?:ing|er)|adtech|retarget|remarket|doubleclick|google ads|meta pixel|facebook pixel|pixel)\b/i);
}

function hasHighConfidenceAnalyticsConcern(item: GdprEprivacyCoverageChecklistItem) {
  const marketingAnalyticsPurpose = retainedPurposeMixHas(item, ["marketingAnalytics"]);
  if (marketingAnalyticsPurpose !== null) {
    return marketingAnalyticsPurpose;
  }
  const count = retainedNumber(item, ["analyticsVendorCount", "analytics_vendor_count"]);
  if (evidenceMentions(item, /\b(limited use|strictly necessary|essential analytics|aggregate only)\b/i)) {
    return false;
  }
  return (count !== null && count > 0) ||
    evidenceMentions(item, /\b(analytics|measurement|google analytics|ga4|gtag|adobe analytics|matomo|mixpanel|amplitude)\b/i);
}

function getDeviceIdentificationDirection(item: GdprEprivacyCoverageChecklistItem): AssessmentDirection {
  if (evidenceMentions(item, /\b(fraud|security|bot|abuse prevention|authentication)\b/i)) {
    return "neutral_signal";
  }
  if (evidenceMentions(item, /\b(fingerprint|device id|device identification|cross[- ]site|identity graph|advertis(?:ing|er)|retarget|probabilistic)\b/i)) {
    return "potential_concern";
  }
  return "review_signal";
}

function getEmbeddedContentDirection(item: GdprEprivacyCoverageChecklistItem): AssessmentDirection {
  const text = retainedText(item);
  if (/\b(fonts\.googleapis\.com|fonts\.gstatic\.com)\b/i.test(text) && !/\b(youtube|vimeo|maps|facebook|instagram|tiktok|linkedin|typeform|calendly|hubspot|chat|widget|iframe|embed)\b/i.test(text)) {
    return "review_signal";
  }
  if (/\b(youtube|vimeo|maps|openstreetmap|spotify|soundcloud|facebook|instagram|tiktok|linkedin|typeform|calendly|hubspot|chat|widget|iframe|embed)\b/i.test(text)) {
    return "potential_concern";
  }
  return "review_signal";
}

function hasPreConsentRuntimeExpectation(item: GdprEprivacyCoverageChecklistItem) {
  return retainedBoolean(item, [
    "preConsentCookiesObserved",
    "pre_consent_cookies_observed",
    "preConsentStorageObserved",
    "pre_consent_storage_observed",
    "preConsentTrackingObserved",
    "pre_consent_tracking_observed",
    "preConsentThirdPartyTrackingObserved",
    "pre_consent_third_party_tracking_observed",
    "advertisingVendorObserved",
    "advertising_vendor_observed",
    "analyticsVendorObserved",
    "analytics_vendor_observed"
  ]);
}

function hasConsentSurfaceExpectation(item: GdprEprivacyCoverageChecklistItem) {
  return retainedBoolean(item, [
    "consentSurfaceObserved",
    "consent_surface_observed",
    "cmpSignalObserved",
    "cmp_signal_observed",
    "bannerObserved",
    "banner_observed"
  ]);
}

function getObservedAssessmentDirection(item: GdprEprivacyCoverageChecklistItem): AssessmentDirection {
  switch (item.id) {
    case "pre_consent_cookies_storage":
      if (hasHighConfidenceStorageConcern(item)) {
        return "potential_concern";
      }
      if (hasStrictlyNecessaryStorageOnly(item)) {
        return "neutral_signal";
      }
      return "review_signal";
    case "pre_consent_third_party_tracking":
      if (hasHighRiskPreconsentPurpose(item) === false) {
        return "review_signal";
      }
      return "potential_concern";
    case "advertising_retargeting_vendor_signal_observed":
      return hasHighConfidenceAdvertisingConcern(item) ? "potential_concern" : "review_signal";
    case "analytics_vendor_observed":
      return hasHighConfidenceAnalyticsConcern(item) ? "potential_concern" : "review_signal";
    case "session_replay_fingerprinting_review":
      return "potential_concern";
    case "device_identification_fingerprinting_signal_observed":
      return getDeviceIdentificationDirection(item);
    case "embedded_content_pre_consent":
      return getEmbeddedContentDirection(item);
    default:
      if (NEUTRAL_WHEN_OBSERVED_ROW_IDS.has(item.id)) {
        return "neutral_signal";
      }
      if (POSITIVE_WHEN_OBSERVED_ROW_IDS.has(item.id)) {
        return "positive_signal";
      }
      return RISK_SIGNAL_ROW_IDS.has(item.id) ? "review_signal" : "neutral_signal";
  }
}

export function getAssessmentDirection(item: GdprEprivacyCoverageChecklistItem): AssessmentDirection {
  const evidenceLabel = getEvidenceLabel(item);
  if (evidenceLabel === "Not testable") {
    return "technical_limitation";
  }
  if (evidenceLabel === "Potential gap" || item.assessmentStatus === "gap_observed") {
    return "potential_concern";
  }
  if (evidenceLabel === "Observed") {
    return getObservedAssessmentDirection(item);
  }
  if (evidenceLabel === "Partial" || item.assessmentStatus === "review_signal") {
    if (item.status === "Review signal" && RISK_SIGNAL_ROW_IDS.has(item.id)) {
      return getObservedAssessmentDirection(item);
    }
    return "review_signal";
  }

  if (POSITIVE_WHEN_NOT_OBSERVED_ROW_IDS.has(item.id)) {
    return "positive_signal";
  }
  if (item.id === "reject_all_path_availability" && hasConsentSurfaceExpectation(item)) {
    return "potential_concern";
  }
  if (
    (
      item.id === "consent_surface_observed" ||
      item.id === "cookie_notice_policy_availability"
    ) &&
    hasPreConsentRuntimeExpectation(item)
  ) {
    return "potential_concern";
  }
  if (item.id === "cmp_framework_signal_observed" && hasPreConsentRuntimeExpectation(item)) {
    return "review_signal";
  }
  return "neutral_signal";
}

function getEvidenceLabelBadgeClasses(label: EvidenceLabel) {
  switch (label) {
    case "Observed":
      return "border-slate-200 bg-white text-slate-700";
    case "Potential gap":
      return "border-slate-200 bg-white text-slate-700";
    case "Partial":
      return "border-slate-200 bg-white text-slate-700";
    case "Not testable":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "Not observed":
    default:
      return "border-slate-200 bg-white text-slate-600";
  }
}

function DebugConfidenceSummary({
  item,
  showImprovements,
}: {
  item: GdprEprivacyCoverageChecklistItem;
  showImprovements: boolean;
}) {
  if (!item.debugConfidence) {
    return null;
  }
  const improvements = item.debugConfidence.improveConfidence.slice(0, 3);
  const coverageMissing = hasScannerCoverageGap(item);
  const pillLabel = coverageMissing ? "Coverage missing" : `Confidence: ${item.debugConfidence.score}`;
  const actionLabel = coverageMissing ? "Next coverage step" : "Improve confidence";
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs leading-5 text-slate-500">
      <span
        className={cn(
          "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]",
          coverageMissing
            ? "border-violet-200 bg-violet-50 text-violet-700"
            : "border-slate-300 bg-white text-slate-700"
        )}
      >
        {pillLabel}
      </span>
      {showImprovements && improvements.length > 0 ? (
        <span className="min-w-0">
          {actionLabel}: {improvements.join(" · ")}
        </span>
      ) : null}
    </div>
  );
}

function hasScannerCoverageGap(item: GdprEprivacyCoverageChecklistItem) {
  if (item.evidenceState !== "not_testable" && item.assessmentStatus !== "coverage_limitation") {
    return false;
  }
  return item.criticalEvidence.missingOrIncompleteSourceSignals.some((gap) =>
    /policysurfacescanner|consentflowruntimescanner|preconsentruntimescanner|scanner did not run|required_source_module_not_run/i.test(String(gap.whyNeeded))
  );
}

function getChecklistRowSummary(items: GdprEprivacyCoverageChecklistItem[]) {
  const coverageMissing = items.filter(hasScannerCoverageGap).length;
  return {
    coverageMissing,
    evaluated: items.filter((item) =>
      item.evidenceState !== "not_testable" &&
      item.evidenceState !== "not_applicable" &&
      !hasScannerCoverageGap(item)
    ).length,
    gaps: items.filter((item) => item.assessmentStatus === "gap_observed").length,
    reviewSignals: items.filter((item) => item.assessmentStatus === "review_signal").length,
  };
}

function ChecklistRowSummaryStrip({ items }: { items: GdprEprivacyCoverageChecklistItem[] }) {
  const summary = getChecklistRowSummary(items);
  const entries = [
    {
      className: "border-slate-200 bg-white text-slate-700",
      count: items.filter((item) => getEvidenceLabel(item) === "Observed").length,
      label: "Observed",
    },
    {
      className: "border-slate-200 bg-white text-slate-700",
      count: items.filter((item) => getEvidenceLabel(item) === "Not observed").length,
      label: "Not observed",
    },
    {
      className: "border-slate-200 bg-white text-slate-700",
      count: items.filter((item) => getEvidenceLabel(item) === "Partial").length,
      label: "Partial",
    },
    {
      className: "border-slate-200 bg-white text-slate-700",
      count: items.filter((item) => getEvidenceLabel(item) === "Potential gap").length + summary.coverageMissing,
      label: "Gaps / limits",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 md:grid-cols-4">
      {entries.map((entry) => (
        <div key={entry.label} className={cn("rounded-md border px-3 py-2", entry.className)}>
          <div className="text-lg font-semibold leading-none text-slate-950">{entry.count}</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em]">{entry.label}</div>
        </div>
      ))}
    </div>
  );
}

function getCoverageIconMeta(direction: AssessmentDirection) {
  switch (direction) {
    case "positive_signal":
      return {
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        icon: "check" as const,
        label: "Positive signal",
        tooltip: "Retained evidence is a positive signal for this row. This is not a compliance determination."
      };
    case "neutral_signal":
      return {
        className: "border-sky-200 bg-sky-50/70 text-sky-600",
        icon: "equal" as const,
        label: "Neutral signal",
        tooltip: "Retained evidence is useful context for this row, but is not inherently positive or concerning."
      };
    case "potential_concern":
      return {
        className: "border-rose-200 bg-rose-50 text-rose-700",
        icon: "alert" as const,
        label: "Potential concern",
        tooltip: "Retained evidence increases review priority for this row. Review the evidence before drawing conclusions."
      };
    case "review_signal":
      return {
        className: "border-amber-200 bg-amber-50 text-amber-700",
        icon: "flag" as const,
        label: "Review signal",
        tooltip: "Retained evidence is context-dependent and needs human review, not automatic pass/fail treatment."
      };
    case "technical_limitation":
      return {
        className: "border-slate-300 bg-slate-100 text-slate-600",
        icon: "slash" as const,
        label: "Technical limitation",
        tooltip: "The retained public-web scan context did not support testing this coverage area."
      };
    default:
      return {
        className: "border-slate-200 bg-white text-slate-600",
        icon: "info" as const,
        label: "Review",
        tooltip: "Review the retained evidence for this coverage area."
      };
  }
}

function CoverageStatusGlyph({ direction }: { direction: AssessmentDirection }) {
  const meta = getCoverageIconMeta(direction);
  return (
    <span className="group/coverage-icon relative inline-flex">
      <span
        aria-label={meta.label}
        title={meta.tooltip}
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
          meta.className
        )}
      >
        <CoverageStatusIcon icon={meta.icon} />
      </span>
      <span className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-normal leading-4 text-slate-600 shadow-lg group-hover/coverage-icon:block">
        {meta.tooltip}
      </span>
    </span>
  );
}

function CoverageStatusIcon({ icon }: { icon: ReturnType<typeof getCoverageIconMeta>["icon"] }) {
  if (icon === "check") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <path d="M5 10.4 8.3 13.7 15 6.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      </svg>
    );
  }

  if (icon === "alert") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <path d="M10 4.2 17 16H3L10 4.2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M10 8.2v3.8M10 14.8h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (icon === "flag") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <path d="M6 16V4.8M6 5.2h8.5l-1.4 3 1.4 3H6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "slash") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="6.8" stroke="currentColor" strokeWidth="1.8" />
        <path d="m5.2 14.8 9.6-9.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "equal") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <path d="M6.4 8.2h7.2M6.4 11.8h7.2" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (icon === "info") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="6.8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 9.2v4.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M10 6.5h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
      <path d="M7.7 7.4a2.5 2.5 0 1 1 3.8 2.2c-.9.5-1.5 1.1-1.5 2.1v.3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M10 15h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function getEvidenceJson(item: GdprEprivacyCoverageChecklistItem) {
  return {
    assessmentStatus: item.assessmentStatus,
    coverageArea: item.label,
    evidenceState: item.evidenceState,
    status: item.status,
    subchecks: item.subchecks,
    ...item.criticalEvidence
  };
}

function stringifyEvidenceJson(item: GdprEprivacyCoverageChecklistItem) {
  return JSON.stringify(
    getEvidenceJson(item),
    (_key, value) => typeof value === "bigint" ? value.toString() : value,
    2
  );
}

function humanizeEvidenceToken(value: string) {
  return value
    .replace(/^Evidence flag:\s*/i, "Evidence: ")
    .replace(/^Evidence strength:\s*/i, "Confidence: ")
    .replace(/[_:]+/g, " ")
    .replace(/\bprivacy\b/gi, "privacy")
    .replace(/\s+/g, " ")
    .trim();
}

function getDisplayEvidenceRefs(item: GdprEprivacyCoverageChecklistItem) {
  return item.evidenceRefs.map(humanizeEvidenceToken).slice(0, 6);
}

export function GdprEprivacyCoverageSummaryPills({ items }: { items: GdprEprivacyCoverageChecklistItem[] }) {
  const directionCounts = items.reduce<Record<AssessmentDirection, number>>((counts, item) => {
    const direction = getAssessmentDirection(item);
    counts[direction] += 1;
    return counts;
  }, {
    neutral_signal: 0,
    positive_signal: 0,
    potential_concern: 0,
    review_signal: 0,
    technical_limitation: 0
  });
  const statusSummary = [
    {
      className: "border-rose-200 bg-rose-50 text-rose-700",
      count: directionCounts.potential_concern,
      icon: "alert" as const,
      label: "potential concerns"
    },
    {
      className: "border-amber-200 bg-amber-50 text-amber-700",
      count: directionCounts.review_signal,
      icon: "flag" as const,
      label: "review signals"
    },
    {
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      count: directionCounts.positive_signal,
      icon: "check" as const,
      label: "positive signals"
    },
    {
      className: "border-sky-200 bg-sky-50 text-sky-700",
      count: directionCounts.neutral_signal,
      icon: "equal" as const,
      label: "neutral signals"
    },
    {
      className: "border-slate-300 bg-slate-100 text-slate-600",
      count: directionCounts.technical_limitation,
      icon: "slash" as const,
      label: "technical limits"
    }
  ].filter((item) => item.count > 0);

  return (
    <>
      {statusSummary.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50/80 px-2 py-1">
          <span className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", item.className)}>
            <CoverageStatusIcon icon={item.icon} />
          </span>
          <span className="whitespace-nowrap text-[11px] font-medium text-slate-600">
            <span className="font-semibold text-slate-950">{item.count}</span> {item.label}
          </span>
        </span>
      ))}
    </>
  );
}

function getGdprSummaryTitle(input: {
  items: GdprEprivacyCoverageChecklistItem[];
  summary: string;
}) {
  return (
    <div className="w-full space-y-2">
      <details className="group rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center gap-2 marker:hidden [&::-webkit-details-marker]:hidden">
          <ScanReportDisclosureIcon className="h-4 w-4 rounded-[0.375rem] [&_svg]:h-2.5 [&_svg]:w-2.5" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Review summary
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-normal leading-5 text-slate-600 group-open:hidden">
            {input.summary}
          </span>
        </summary>
        <p className="mt-2 pl-6 text-xs font-normal leading-5 text-slate-600">{input.summary}</p>
      </details>
    </div>
  );
}

function getScanContextNote(item: GdprEprivacyCoverageChecklistItem) {
    if (item.id === "consent_surface_observed") {
      return item.status === "Observed"
        ? "An actionable cookie/consent banner or preference surface was observed in the tested context."
        : item.status === "Not confirmed"
          ? "Privacy/ad-choice controls were observed, but a first-layer GDPR/ePrivacy cookie consent banner was not confirmed."
        : "No actionable cookie/consent banner or preference surface was observed in the tested context.";
    }

  if (item.id === "pre_consent_cookies_storage") {
    return item.status === "Observed" || item.status === "Gap observed"
      ? "Cookies or browser storage were observed before a recorded consent action. Purpose and essentiality remain review context unless high-confidence non-essential evidence is retained."
      : "No eligible pre-consent cookies or browser storage were observed before a recorded consent action.";
  }

  if (item.id === "pre_consent_third_party_tracking") {
    return item.status === "Observed" || item.status === "Review signal" || item.status === "Gap observed"
      ? "Third-party runtime activity was retained before recorded consent; purpose classification determines whether it is a review signal or a stronger concern."
      : "No eligible third-party tracking requests were observed before recorded consent.";
  }

  if (item.id === "advertising_retargeting_vendor_signal_observed") {
    return item.status === "Observed"
      ? "Advertising, retargeting, or adtech vendor evidence was observed in the retained pre-consent runtime context."
      : item.status === "Review signal"
        ? "Advertising or retargeting classification requires review from retained runtime evidence; security, CDN, bot, and performance/RUM evidence is not enough by itself."
      : "No advertising, retargeting, or adtech vendor signal was observed in the retained runtime context.";
  }

  if (item.id === "analytics_vendor_observed") {
    return item.status === "Observed" || item.status === "Review signal"
      ? "Analytics or measurement vendor evidence was observed in the retained runtime context."
      : "No analytics or measurement vendor signal was observed in the retained runtime context.";
  }

  if (item.id === "embedded_content_pre_consent") {
    return item.status === "Observed" || item.status === "Review signal"
      ? "Concrete third-party embedded content was observed before a recorded consent action."
      : "No concrete third-party embedded content was observed before a recorded consent action.";
  }

  if (item.id === "reject_all_path_availability") {
    return item.status === "Observed"
      ? "A reject-all or equivalent refusal path was observed from structured consent-surface evidence."
      : item.status === "Gap observed"
        ? "A reject-all or equivalent refusal path was not observed as equally available from the consent surface."
        : "Reject-path availability was not resolved from the retained consent-surface evidence.";
  }

  if (item.id === "post_reject_tracking_reduction") {
    return item.status === "Gap observed"
      ? hasQuantitativePostRejectReductionEvidence(item)
        ? "Non-essential tracking did not materially decrease after the recorded reject action."
        : "Non-essential tracking was still observed after the recorded reject action."
      : item.status === "Not testable"
        ? "The retained scan context did not include a confirmed reject action, so post-reject tracking reduction could not be tested."
        : "Post-reject tracking reduction evidence did not produce an eligible gap signal.";
  }

  if (item.id === "preference_withdrawal_control") {
    return item.status === "Observed"
      ? "A way to reopen or change consent preferences after the initial choice was observed."
      : item.status === "Not observed"
        ? "No way to reopen or change consent preferences after the initial choice was observed."
        : "Post-choice consent preference controls require review from the retained lifecycle evidence.";
  }

  if (item.id === "sensitive_surfaces_third_party_tracking") {
    return item.status === "Not observed"
      ? "No eligible sensitive forms or flows were observed alongside third-party tracking in the tested context."
      : "Sensitive forms or flows appeared alongside third-party tracking or measurement scripts in the tested context.";
  }

  if (item.id === "session_replay_fingerprinting_review") {
    return item.explanation || (
      item.status === "Not observed"
        ? "No eligible session replay, behavioral recording, or fingerprinting-like signal was observed in the tested context."
        : "Session replay, behavioral recording, or fingerprinting-like signals require review from the retained runtime evidence."
    );
  }

  if (item.id === "session_replay_before_consent") {
    return item.status === "Gap observed"
      ? "Session replay or behavioral analytics was observed before a recorded consent action."
      : item.status === "Not testable"
        ? "Pre-consent session replay timing could not be evaluated from the retained runtime evidence."
        : "No pre-consent session replay collection signal was retained in the tested context.";
  }

  if (item.id === "session_replay_disclosure_alignment") {
    return item.status === "Gap observed"
      ? "Session replay or behavioral analytics was observed, but the reviewed disclosures did not clearly match the replay vendor or domain."
      : item.status === "Observed"
        ? "Observed session replay or behavioral analytics was matched to retained disclosure evidence."
        : item.status === "Not testable"
          ? "Session replay was observed, but disclosure-comparison evidence was not available for this scan context."
          : "No session replay disclosure mismatch was observed in the tested context.";
  }

  if (item.id === "session_replay_sensitive_surface") {
    return item.status === "Gap observed"
      ? "Session replay or behavioral analytics was observed on the same retained page or flow as a sensitive collection surface."
      : "No same-context sensitive-surface session replay signal was retained in the tested context.";
  }

  if (item.id === "session_replay_after_refusal") {
    return item.status === "Gap observed"
      ? "Session replay or behavioral analytics persisted after a confirmed reject or opt-out action."
      : item.status === "Not testable"
        ? "Post-refusal session replay behavior could not be compared because reject/opt-out action proof was not retained."
        : "No post-refusal session replay persistence signal was retained after a confirmed reject or opt-out action.";
  }

  if (item.id === "cross_border_endpoint_review") {
    if (item.status === "Gap observed") {
      return getStringArrayFromRetainedEvidence(item, "evidenceHighlights")[0] ??
        "Transfer-relevant analytics / behavioral tracking endpoints were observed. Additional third-party asset endpoints were retained as supporting runtime context.";
    }

    return item.status === "Review signal"
      ? "Observed third-party endpoints created a public-web international transfer review signal."
      : "No public-web international transfer review signal was projected from observed third-party endpoints.";
  }

  if (item.id === "accessibility_consent_controls") {
    return item.status === "Review signal"
      ? "Consent controls produced a basic automated accessibility review signal."
      : "No consent/privacy-control accessibility issue was retained in the tested context.";
  }

  const subject = getChecklistSentenceSubject(item.label);
  switch (item.status) {
    case "Observed":
      return `${item.label} was observed in the tested context.`;
    case "Gap observed":
      return `${item.label} produced a gap signal in the tested context.`;
    case "Review signal":
      return `${item.label} produced a review signal in the tested context.`;
    case "Not observed":
      return `No eligible evidence for ${subject} was observed in the tested context.`;
    case "Insufficient evidence":
      return `The scan retained partial evidence for ${subject}, but not enough canonical evidence to resolve the row.`;
    case "Not testable":
      return `The retained scan context did not support testing ${subject}.`;
    case "Out of scope":
      return `${item.label} is outside this public-web scan context.`;
    default:
      return item.explanation;
  }
}

function getChecklistRowRationale(item: GdprEprivacyCoverageChecklistItem) {
  return truncateSentence(
    getSpecificChecklistRowRationale(item) ??
      getEvidenceBackedFallbackRationale(item),
    320
  );
}

export function getGdprEprivacyCoverageChecklistRowRationaleForAudit(item: GdprEprivacyCoverageChecklistItem) {
  return getChecklistRowRationale(item);
}

function getSpecificChecklistRowRationale(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  const vendorPhrase = formatList(getEvidenceVendorNames(item).slice(0, 4));
  const firstSeenMs = getFirstEvidenceMs(item);
  const evidenceLabel = getEvidenceLabel(item);

  if (evidenceLabel === "Not testable") {
    return null;
  }

  if (item.id === "pre_consent_third_party_tracking") {
    if (evidenceLabel === "Not observed") {
      return "No tracking-classified third-party request was observed before a recorded consent action.";
    }
    const canonicalSummary = getCanonicalRuntimeEvidenceSummary({
      fallbackFirstSeenMs: firstSeenMs,
      item,
      lead: "Pre-consent tracking evidence was retained",
      rowKind: "tracking"
    });
    if (canonicalSummary) {
      return canonicalSummary;
    }
    return joinRationaleParts([
      vendorPhrase
        ? `Tracking-classified third-party requests fired before any recorded consent action: ${vendorPhrase}`
        : "Tracking-classified third-party requests fired before any recorded consent action",
      formatFirstSeenPhrase(firstSeenMs)
    ]);
  }

  if (item.id === "pre_consent_cookies_storage") {
    const storageNames = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, [
        "preConsentCookieExamples",
        "pre_consent_cookie_examples",
        "cookieNames",
        "cookie_names",
        "storageKeys",
        "storage_keys"
      ]),
      ...getNestedRecordStrings(evidence.preConsentCookieExamples, ["name", "cookieName", "cookie_name", "key"]),
      ...getNestedRecordStrings(evidence.concreteStorageArtifacts, ["name", "cookieName", "cookie_name", "key"])
    ]).slice(0, 4);
    const storagePhrase = formatList(storageNames);
    if (evidenceLabel === "Not observed") {
      return "No eligible cookie or browser-storage write was observed before a recorded consent action.";
    }
    return joinRationaleParts([
      storagePhrase
        ? `Cookie/storage writes were observed before any recorded consent action: ${storagePhrase}`
        : "Cookie/storage writes were observed before any recorded consent action",
      vendorPhrase ? `associated vendors include ${vendorPhrase}` : null,
      formatFirstSeenPhrase(firstSeenMs)
    ]);
  }

  if (item.id === "advertising_retargeting_vendor_signal_observed") {
    if (evidenceLabel === "Not observed") {
      return "No advertising, retargeting, or adtech vendor signal was observed in retained runtime evidence.";
    }
    if (item.status === "Review signal" && retainedNumber(item, ["advertisingRetargetingVendorCount", "advertising_retargeting_vendor_count", "adtechVendorCount", "adtech_vendor_count"]) === 0) {
      return "No advertising, retargeting, or adtech vendor classification was retained; security, CDN, bot, and performance/RUM evidence remains review context only.";
    }
    const canonicalSummary = getCanonicalRuntimeEvidenceSummary({
      fallbackFirstSeenMs: firstSeenMs,
      item,
      lead: "Advertising/retargeting evidence was retained",
      rowKind: "advertising"
    });
    if (canonicalSummary) {
      return canonicalSummary;
    }
    return joinRationaleParts([
      vendorPhrase
        ? `Advertising or retargeting vendor signals were observed: ${vendorPhrase}`
        : "Advertising or retargeting vendor signals were observed",
      formatFirstSeenPhrase(firstSeenMs),
      getPreConsentQualifier(item)
    ]);
  }

  if (item.id === "analytics_vendor_observed") {
    if (evidenceLabel === "Not observed") {
      return "No analytics or measurement vendor signal was observed in retained runtime evidence.";
    }
    const canonicalSummary = getCanonicalRuntimeEvidenceSummary({
      fallbackFirstSeenMs: firstSeenMs,
      item,
      lead: "Analytics/measurement evidence was retained",
      rowKind: "analytics"
    });
    if (canonicalSummary) {
      return canonicalSummary;
    }
    return joinRationaleParts([
      vendorPhrase
        ? `Analytics or measurement vendor signals were observed: ${vendorPhrase}`
        : "Analytics or measurement vendor signals were observed",
      formatFirstSeenPhrase(firstSeenMs),
      getPreConsentQualifier(item)
    ]);
  }

  if (item.id === "session_replay_fingerprinting_review") {
    const replayEvidence = getRecord(evidence.sessionReplayEvidence);
    const replayVendors = formatList(getStringArray(replayEvidence?.vendors).slice(0, 4));
    const replayFirstSeenMs = getFirstNumberFromRecord(replayEvidence, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms"]);
    if (evidenceLabel === "Not observed") {
      return "No eligible session replay or behavioral-recording vendor was observed in retained runtime evidence.";
    }
    return joinRationaleParts([
      replayVendors
        ? `Session replay or behavioral analytics signals were observed: ${replayVendors}`
        : "Session replay or behavioral analytics signals were observed",
      formatFirstSeenPhrase(replayFirstSeenMs ?? firstSeenMs),
      replayEvidence?.preConsentObserved === true ? "before any recorded consent action" : null
    ]);
  }

  if (item.id === "device_identification_fingerprinting_signal_observed") {
    const fingerprintReasons = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["fingerprintingReasons", "fingerprinting_reasons", "reasons"]),
      ...getStringArrayFromEvidenceKeys(getRecord(evidence.browserDeviceEntropyEvidence) ?? {}, ["reasons", "signals", "vendors"])
    ]).slice(0, 4);
    const reasonPhrase = formatList(fingerprintReasons);
    if (evidenceLabel === "Not observed") {
      return "No eligible device-identification or fingerprinting signal was observed in retained runtime evidence.";
    }
    return joinRationaleParts([
      reasonPhrase
        ? `Device-identification or fingerprinting-like signals were observed: ${reasonPhrase}`
        : "Device-identification or fingerprinting-like signals were observed",
      formatFirstSeenPhrase(firstSeenMs)
    ]);
  }

  if (item.id === "embedded_content_pre_consent") {
    const hosts = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["embeddedContentHosts", "embedded_content_hosts", "embeddedHosts", "embedded_hosts"]),
      ...getNestedRecordStrings(evidence.embeddedContentObservations, ["host", "hostname", "domain"])
    ]).slice(0, 4);
    const hostPhrase = formatList(hosts);
    if (evidenceLabel === "Not observed") {
      return "No eligible third-party embedded content was observed before a recorded consent action.";
    }
    return joinRationaleParts([
      hostPhrase
        ? `Third-party embedded content loaded before any recorded consent action: ${hostPhrase}`
        : "Third-party embedded content loaded before any recorded consent action",
      formatFirstSeenPhrase(firstSeenMs)
    ]);
  }

  if (item.id === "reject_all_path_availability") {
    const labels = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["rejectButtonLabels", "reject_button_labels", "refusalControlLabels", "refusal_control_labels", "buttonLabels", "button_labels"]),
      ...extractQuotedButtonLabels(item.criticalEvidence.statusBasis)
    ]).slice(0, 3);
    if (evidenceLabel === "Observed") {
      return labels.length > 0
        ? `A refusal path was observed from structured consent-control evidence: ${formatList(labels)}. This confirms availability, not post-click behavior.`
        : "A refusal path was observed from structured consent-control evidence. This confirms availability, not post-click behavior.";
    }
    if (evidenceLabel === "Potential gap") {
      return "A first-layer reject-all or equivalent refusal path was expected from the observed consent surface but was not retained.";
    }
  }

  const article13Snippet = getArticle13Snippet(evidence);
  if (article13Snippet) {
    return `${getArticle13RationalePrefix(item)}: ${article13Snippet}`;
  }

  return null;
}

function getArticle13RationalePrefix(item: GdprEprivacyCoverageChecklistItem) {
  if (getEvidenceLabel(item) === "Partial") {
    return "Policy evidence was retained, but the matched disclosure text was incomplete or ambiguous";
  }
  if (getEvidenceLabel(item) === "Potential gap") {
    return "Scanner expected this transparency disclosure but did not retain a clear match";
  }
  if (getEvidenceLabel(item) === "Not observed") {
    return "Scanner did not retain a clear matching transparency disclosure";
  }
  if (item.id === "international_transfers_disclosure") {
    return "Policy text includes international-transfer/safeguards disclosure. This is a transparency signal only and does not validate the sufficiency of the transfer mechanism";
  }
  return "Policy text included matching disclosure evidence";
}

function getArticle13Snippet(evidence: Record<string, unknown>) {
  const article13Signal = getRecord(evidence.article13Signal);
  const text = getString(article13Signal?.evidenceText) ?? getString(article13Signal?.evidence_text);
  return text ? `"${truncateWholeWord(cleanPolicyExcerptStart(text), 180, "...[more in evidence packet]")}"` : null;
}

function getStrongestEvidenceDetail(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  const highlights = getStringArrayFromEvidenceKeys(evidence, ["evidenceHighlights", "evidence_highlights"]);
  if (highlights.length > 0) {
    return cleanEvidenceText(highlights[0] ?? "");
  }
  const vendorPhrase = formatList(getEvidenceVendorNames(item).slice(0, 4));
  const firstSeenMs = getFirstEvidenceMs(item);
  if (vendorPhrase) {
    return joinRationaleParts([`observed vendors include ${vendorPhrase}`, formatFirstSeenPhrase(firstSeenMs)]);
  }
  if (item.criticalEvidence.statusBasis) {
    return cleanEvidenceText(item.criticalEvidence.statusBasis);
  }
  return null;
}

function getEvidenceBackedFallbackRationale(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  const evidenceLabel = getEvidenceLabel(item);
  const source = getRetainedEvidenceSourceSummary(item);
  const statusBasis = item.criticalEvidence.statusBasis ? cleanEvidenceText(item.criticalEvidence.statusBasis) : null;
  const strongestDetail = getStrongestEvidenceDetail(item);
  const missingEvidence = getMissingEvidenceSummary(item);
  const policySurface = getPolicySurfaceSummaryDetail(evidence);
  const projectedFindings = getProjectedFindingSummary(evidence);
  const signalState = getSignalObservedSummary(evidence);

  if (evidenceLabel === "Not testable") {
    return joinRationaleParts([
      `Not testable from retained ${source}`,
      missingEvidence ?? statusBasis,
      policySurface
    ]);
  }

  if (evidenceLabel === "Potential gap") {
    return joinRationaleParts([
      `Potential gap from retained ${source}`,
      strongestDetail ?? statusBasis,
      projectedFindings,
      signalState
    ]);
  }

  if (evidenceLabel === "Partial") {
    return joinRationaleParts([
      `Partial support from retained ${source}`,
      strongestDetail ?? statusBasis,
      missingEvidence,
      policySurface
    ]);
  }

  if (evidenceLabel === "Observed") {
    return joinRationaleParts([
      `Observed from retained ${source}`,
      strongestDetail ?? statusBasis,
      projectedFindings,
      policySurface
    ]);
  }

  return joinRationaleParts([
    `Not observed in retained ${source}`,
    strongestDetail ?? statusBasis,
    missingEvidence,
    signalState
  ]);
}

function getRetainedEvidenceSourceSummary(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  if (getRecord(evidence.policySurfaceSummary)) {
    return "policy-surface evidence";
  }
  if (getRecord(evidence.sessionReplayEvidence) || getRecord(evidence.browserDeviceEntropyEvidence) || getEvidenceVendorNames(item).length > 0) {
    return "runtime evidence";
  }
  if (getStringArrayFromEvidenceKeys(evidence, ["projectedFindings", "projected_findings"]).length > 0 || item.criticalEvidence.projectedFindings.length > 0) {
    return "unified finding projection evidence";
  }
  if (item.criticalEvidence.missingOrIncompleteSourceSignals.length > 0) {
    return "source-signal coverage evidence";
  }
  return "scanner evidence";
}

function getMissingEvidenceSummary(item: GdprEprivacyCoverageChecklistItem) {
  const missing = item.criticalEvidence.missingOrIncompleteSourceSignals.slice(0, 2).flatMap((signal) => {
    const expected = getEvidenceValueSummary(signal.expected);
    const actual = getEvidenceValueSummary(signal.actual);
    return expected ? [`expected ${expected}${actual ? `; retained ${actual}` : ""}`] : [];
  });
  return missing.length > 0 ? `Missing or incomplete source signal: ${missing.join("; ")}` : null;
}

function getEvidenceValueSummary(value: unknown) {
  if (typeof value === "string") {
    return cleanEvidenceText(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? `${value.length} retained value${value.length === 1 ? "" : "s"}` : "";
  }
  if (value && typeof value === "object") {
    return "structured value";
  }
  return "";
}

function getPolicySurfaceSummaryDetail(evidence: Record<string, unknown>) {
  const summary = getRecord(evidence.policySurfaceSummary);
  if (!summary) {
    return null;
  }
  const urls = uniqueStrings([
    ...getStringArrayFromEvidenceKeys(summary, ["privacyPolicyUrls", "privacy_policy_urls"]),
    ...getStringArrayFromEvidenceKeys(summary, ["cookiePolicyUrls", "cookie_policy_urls"])
  ]).slice(0, 2);
  const urlPhrase = formatList(urls);
  const textCount = getFirstNumberFromRecord(summary, [
    "privacyPolicyTextCharacterCount",
    "privacy_policy_text_character_count",
    "retainedTextCharacterCount",
    "retained_text_character_count"
  ]);
  const guessedOnly = getFirstBooleanFromRecord(summary, [
    "keyPageGuessedOnly",
    "key_page_guessed_only",
    "privacyPolicyGuessedOnly",
    "privacy_policy_guessed_only"
  ]);
  return joinRationaleParts([
    urlPhrase ? `policy surface: ${urlPhrase}` : "policy surface retained",
    typeof textCount === "number" ? `${Math.round(textCount)} policy-text characters retained` : null,
    guessedOnly === true ? "policy attribution was guessed/weak" : null
  ]);
}

function getProjectedFindingSummary(evidence: Record<string, unknown>) {
  const projected = getStringArrayFromEvidenceKeys(evidence, ["projectedFindings", "projected_findings"]);
  const projectedObjects = getNestedRecordStrings(evidence.projectedFindings ?? evidence.projected_findings, ["label", "id"]).slice(0, 3);
  const previews = getNestedRecordStrings(evidence.projectedFindingPreview, ["label", "id"]).slice(0, 3);
  const findingEntities = getNestedRecordStrings(evidence.findingEntities, ["id", "label"]).slice(0, 3);
  const phrase = formatList(uniqueStrings([...projected, ...projectedObjects, ...previews, ...findingEntities]).slice(0, 3));
  return phrase ? `projected finding evidence: ${phrase}` : null;
}

function getSignalObservedSummary(evidence: Record<string, unknown>) {
  const signalObserved = evidence.signalObserved ?? evidence.signal_observed;
  if (signalObserved === true) {
    return "structured signalObserved=true retained";
  }
  if (signalObserved === false) {
    return "structured signalObserved=false retained";
  }
  if (signalObserved === "partial") {
    return "structured signalObserved=partial retained";
  }
  return null;
}

type CanonicalRuntimeEvidenceKind = "advertising" | "analytics" | "tracking";

type CanonicalRuntimeEvidenceEntry = {
  category: string | null;
  firstSeenMs: number | null;
  preConsent: boolean | null;
  vendor: string;
};

function getCanonicalRuntimeEvidenceSummary(input: {
  fallbackFirstSeenMs: number | null;
  item: GdprEprivacyCoverageChecklistItem;
  lead: string;
  rowKind: CanonicalRuntimeEvidenceKind;
}) {
  const entries = getCanonicalRuntimeEvidenceEntries(input.item);
  const matchingEntries = entries.filter((entry) => canonicalEntryMatchesKind(entry, input.rowKind));
  const primaryEntries = (
    input.rowKind === "tracking" ? entries :
      matchingEntries.length > 0 ? matchingEntries :
        entries
  ).slice(0, 4);
  if (primaryEntries.length === 0) {
    return null;
  }
  const firstSeenMs = minNumber([
    input.fallbackFirstSeenMs,
    ...primaryEntries.map((entry) => entry.firstSeenMs)
  ]);
  const preConsentObserved = primaryEntries.some((entry) => entry.preConsent === true) || getPreConsentQualifier(input.item) !== null;
  return joinRationaleParts([
    `${input.lead}${preConsentObserved ? " before consent" : ""}: ${formatCanonicalRuntimeEvidenceEntries(primaryEntries)}`,
    formatFirstSeenPhrase(firstSeenMs),
    preConsentObserved ? "no consent action was recorded first" : null
  ]);
}

function getCanonicalRuntimeEvidenceEntries(item: GdprEprivacyCoverageChecklistItem): CanonicalRuntimeEvidenceEntry[] {
  const evidence = getRetainedEvidenceRecord(item);
  const rowEntries = uniqueCanonicalRuntimeEvidenceEntries([
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.preconsent_tracker_vendor_evidence),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.preConsentTrackerVendorEvidence),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.advertisingRetargetingVendorEvidence),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.analyticsVendorEvidence),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.findingEntities),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.representativeRequests),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.representative_requests)
  ]);
  const rowVendors = new Set(rowEntries.map((entry) => entry.vendor.toLowerCase()));
  const vendorListEntries = getEvidenceVendorNames(item)
    .filter((vendor) => !rowVendors.has(vendor.toLowerCase()))
    .map((vendor) => ({
      category: null,
      firstSeenMs: null,
      preConsent: null,
      vendor
    }));
  return uniqueCanonicalRuntimeEvidenceEntries([...rowEntries, ...vendorListEntries]);
}

function getCanonicalRuntimeEvidenceEntriesFromRows(value: unknown): CanonicalRuntimeEvidenceEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const record = getRecord(entry);
    if (!record) {
      return [];
    }
    const vendor = getFirstStringFromRecord(record, [
      "vendor",
      "vendorName",
      "vendor_name",
      "matchedVendorName",
      "matched_vendor_name",
      "name"
    ]);
    if (!vendor) {
      return [];
    }
    return [{
      category: getFirstStringFromRecord(record, ["category", "vendorCategory", "vendor_category", "purpose", "classification"]),
      firstSeenMs: getFirstNumberFromRecord(record, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms", "timestampMs", "timestamp_ms"]),
      preConsent: getFirstBooleanFromRecord(record, ["preConsent", "pre_consent", "beforeConsent", "before_consent"]),
      vendor
    }];
  });
}

function canonicalEntryMatchesKind(entry: CanonicalRuntimeEvidenceEntry, kind: CanonicalRuntimeEvidenceKind) {
  const text = `${entry.vendor} ${entry.category ?? ""}`.toLowerCase();
  if (kind === "advertising") {
    return /\b(ad|ads|adtech|advertis|retarget|remarket|doubleclick|pixel|measurement)\b/i.test(text);
  }
  if (kind === "analytics") {
    return /\b(analytics|measurement|metrics|stats|tag manager|gtm|google analytics)\b/i.test(text);
  }
  return /\b(track|tracking|advertis|analytics|measurement|retarget|cross[- ]site)\b/i.test(text);
}

function formatCanonicalRuntimeEvidenceEntries(entries: CanonicalRuntimeEvidenceEntry[]) {
  return formatList(entries.map((entry) => {
    const details = [
      entry.category ? formatEvidenceCategory(entry.category) : null,
      entry.firstSeenMs !== null ? `${Math.round(entry.firstSeenMs)}ms` : null
    ].filter(Boolean);
    return details.length > 0 ? `${entry.vendor} (${details.join(", ")})` : entry.vendor;
  })) ?? "";
}

function uniqueCanonicalRuntimeEvidenceEntries(entries: CanonicalRuntimeEvidenceEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.vendor.toLowerCase()}|${entry.category ?? ""}|${entry.firstSeenMs ?? ""}|${entry.preConsent ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getFirstStringFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getString(record[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function getFirstBooleanFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}

function formatEvidenceCategory(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function getChecklistSentenceSubject(label: string) {
  const cleanedLabel = label
    .replace(/\s+observed$/i, "")
    .replace(/\s+availability$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleanedLabel.length > 0
    ? cleanedLabel.charAt(0).toLowerCase() + cleanedLabel.slice(1)
    : "this row";
}

function getRetainedEvidenceRecord(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = item.criticalEvidence.retainedEvidence;
  return evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? evidence as Record<string, unknown>
    : {};
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
}

function getStringArrayFromEvidenceKeys(evidence: Record<string, unknown>, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => getStringArray(evidence[key])));
}

function getNestedRecordStrings(value: unknown, keys: string[]) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const record = getRecord(entry);
    if (!record) {
      return [];
    }
    return keys.flatMap((key) => {
      const stringValue = getString(record[key]);
      return stringValue ? [stringValue] : [];
    });
  });
}

function getEvidenceVendorNames(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  return uniqueStrings([
    ...getStringArrayFromEvidenceKeys(evidence, [
      "advertisingRetargetingVendors",
      "advertising_retargeting_vendors",
      "advertisingSharingVendors",
      "analyticsVendors",
      "analytics_vendors",
      "thirdPartyTrackingVendors",
      "third_party_tracking_vendors",
      "preconsent_tracker_vendors",
      "preConsentTrackerVendors",
      "runtime_vendors",
      "runtimeVendors",
      "vendors"
    ]),
    ...getNestedRecordStrings(evidence.preconsent_tracker_vendor_evidence, ["vendor", "vendorName", "vendor_name", "matched_vendor_name"]),
    ...getNestedRecordStrings(evidence.findingEntities, ["vendor", "vendorName", "vendor_name", "matched_vendor_name"])
  ]);
}

function getFirstEvidenceMs(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  const direct = getFirstNumberFromRecord(evidence, [
    "firstObservedMs",
    "first_observed_ms",
    "firstSeenMs",
    "first_seen_ms",
    "firstRuntimeVendorObservedMs",
    "first_runtime_vendor_observed_ms",
    "firstPreConsentTrackingRequestMs",
    "first_pre_consent_tracking_request_ms",
    "firstPreconsentThirdPartyTrackingObservedMs",
    "first_preconsent_third_party_tracking_observed_ms",
    "firstPreConsentThirdPartyTrackingObservedMs",
    "first_pre_consent_third_party_tracking_observed_ms",
    "firstPreconsentCookieOrStorageObservedMs",
    "first_preconsent_cookie_or_storage_observed_ms",
    "firstPreConsentCookieOrStorageObservedMs",
    "first_pre_consent_cookie_or_storage_observed_ms",
    "firstAdvertisingRetargetingVendorObservedMs",
    "first_advertising_retargeting_vendor_observed_ms",
    "firstAnalyticsVendorObservedMs",
    "first_analytics_vendor_observed_ms",
    "firstEmbeddedContentObservedMs",
    "first_embedded_content_observed_ms"
  ]);
  const nested = getFirstNumberFromRows([
    evidence.preconsent_tracker_vendor_evidence,
    evidence.representativeRequests,
    evidence.representative_requests,
    evidence.embeddedContentObservations,
    evidence.embedded_content_observations,
    evidence.preConsentCookieExamples,
    evidence.pre_consent_cookie_examples
  ]);
  const textMs = getFirstMsFromText([
    item.criticalEvidence.statusBasis,
    item.note,
    item.explanation,
    ...getStringArrayFromEvidenceKeys(evidence, ["evidenceHighlights", "evidence_highlights"])
  ]);
  return minNumber([direct, nested, textMs]);
}

function getFirstNumberFromRecord(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) {
    return null;
  }
  return minNumber(keys.map((key) => {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  }));
}

function getFirstNumberFromRows(values: unknown[]) {
  const numbers = values.flatMap((value) => Array.isArray(value) ? value : []).flatMap((entry) => {
    const record = getRecord(entry);
    return record ? [getFirstNumberFromRecord(record, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms", "timestampMs", "timestamp_ms"])] : [];
  });
  return minNumber(numbers);
}

function getFirstMsFromText(values: Array<string | null | undefined>) {
  const numbers = values.flatMap((value) => {
    if (!value) {
      return [];
    }
    return [...value.matchAll(/(\d+(?:\.\d+)?)\s*ms\b/gi)].map((match) => Number(match[1])).filter((number) => Number.isFinite(number) && number >= 0);
  });
  return minNumber(numbers);
}

function minNumber(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  return numbers.length > 0 ? Math.min(...numbers) : null;
}

function formatFirstSeenPhrase(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `first seen ${Math.round(value)}ms after scan start`
    : null;
}

function getConsentActionQualifier(item: GdprEprivacyCoverageChecklistItem) {
  return /consent action was not recorded|before consent action|before any recorded consent/i.test([
    item.criticalEvidence.statusBasis,
    item.note,
    item.explanation
  ].join(" "))
    ? "before any recorded consent action"
    : null;
}

function getPreConsentQualifier(item: GdprEprivacyCoverageChecklistItem) {
  return /pre[- ]consent|before consent|before any recorded consent/i.test([
    item.criticalEvidence.statusBasis,
    item.note,
    item.explanation,
    retainedText(item)
  ].join(" "))
    ? "before any recorded consent action"
    : null;
}

function extractQuotedButtonLabels(value: string | null | undefined) {
  if (!value) {
    return [];
  }
  return [...value.matchAll(/[“"']([^“"']{2,60}?)(?:[”"'])/g)].map((match) => match[1] ?? "").filter(Boolean);
}

function formatList(values: string[]) {
  const uniqueValues = uniqueStrings(values.map((value) => cleanEvidenceText(value)).filter(Boolean));
  if (uniqueValues.length === 0) {
    return null;
  }
  if (uniqueValues.length === 1) {
    return uniqueValues[0] ?? null;
  }
  if (uniqueValues.length === 2) {
    return `${uniqueValues[0]} and ${uniqueValues[1]}`;
  }
  return `${uniqueValues.slice(0, -1).join(", ")}, and ${uniqueValues.at(-1)}`;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function joinRationaleParts(parts: Array<string | null | undefined>) {
  const cleanParts = uniqueStrings(parts.flatMap((part) => {
    const cleaned = part ? cleanEvidenceText(part).replace(/[.;]\s*$/g, "") : "";
    return cleaned ? [cleaned] : [];
  }));
  if (cleanParts.length === 0) {
    return "";
  }
  return `${cleanParts.join("; ")}.`;
}

function cleanEvidenceText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function cleanPolicyExcerptStart(value: string) {
  const raw = value.trim();
  const startsWithUnsafeFragment =
    /^[.…]{1,3}[\p{L}\p{N}]/u.test(raw) ||
    /^[\p{Ll}\p{N}]/u.test(raw);
  const cleaned = cleanEvidenceText(raw.replace(/^[.…\s]+/u, "").replace(/^[^\p{L}\p{N}]+/u, ""));
  if (!startsWithUnsafeFragment) {
    return cleaned;
  }
  const firstWordBoundary = cleaned.search(/\s/u);
  return firstWordBoundary > 0 ? cleaned.slice(firstWordBoundary).trimStart() : cleaned;
}

function truncateSentence(value: string, maxLength: number) {
  const cleaned = cleanEvidenceText(value);
  return truncateWholeWord(cleaned, maxLength);
}

function truncateWholeWord(value: string, maxLength: number, suffix = "...") {
  const cleaned = cleanEvidenceText(value);
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  const hardLimit = Math.max(1, maxLength - suffix.length);
  const clipped = cleaned.slice(0, hardLimit).trimEnd();
  const lastSpace = clipped.lastIndexOf(" ");
  const wordSafeClip = lastSpace > Math.floor(hardLimit * 0.6)
    ? clipped.slice(0, lastSpace)
    : clipped;
  return `${wordSafeClip.replace(/[,:;.!?]+$/g, "").trimEnd()}${suffix}`;
}

function renderRationaleText(value: string) {
  return value.split(/("[^"]+")/g).map((part, index) => {
    if (part.startsWith("\"") && part.endsWith("\"")) {
      return (
        <span className="font-mono text-[0.86em] italic text-slate-700" key={`${index}:${part}`}>
          {part}
        </span>
      );
    }
    return <React.Fragment key={`${index}:${part}`}>{part}</React.Fragment>;
  });
}

function getStringArrayFromRetainedEvidence(item: GdprEprivacyCoverageChecklistItem, key: string) {
  const value = getRetainedEvidenceRecord(item)[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function hasQuantitativePostRejectReductionEvidence(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  return [
    "trackingReductionPercent",
    "trackingReductionRatio",
    "nonEssentialTrackingReductionPercent",
    "baselineRequestCount",
    "postRejectRequestCount",
    "baselineTrackerCount",
    "postRejectTrackerCount"
  ].some((key) => typeof evidence[key] === "number" && Number.isFinite(evidence[key] as number));
}

function getGdprSectionSummary(input: {
  fallbackSummary: string;
  items: GdprEprivacyCoverageChecklistItem[];
  lensSummary?: string;
  reviewSummary: ReturnType<typeof deriveGdprEprivacyReviewSummary>;
  scoreSummary?: string;
}) {
  const primary = input.lensSummary ?? input.fallbackSummary;
  const scorePrefix = input.scoreSummary ? `${input.scoreSummary} ` : "";
  return `${scorePrefix}${primary} ${input.reviewSummary.coverageText} ${input.reviewSummary.priorityReviewText} Review retained evidence for ${getGdprReviewedAreas(input.items)}.`;
}

function getGdprReviewedAreas(items: GdprEprivacyCoverageChecklistItem[]) {
  const rowIds = new Set(items.map((item) => item.id));
  const areas = [
    rowIds.has("pre_consent_cookies_storage") || rowIds.has("pre_consent_third_party_tracking")
      ? "pre-consent storage and tracking"
      : null,
    rowIds.has("consent_surface_observed") ? "consent surface evidence" : null,
    rowIds.has("reject_all_path_availability") ? "refusal path availability" : null,
    rowIds.has("post_reject_tracking_reduction") ? "deferred refusal-path tracking evidence" : null,
    rowIds.has("preference_withdrawal_control") ? "withdrawal or preference-control evidence" : null,
    rowIds.has("sensitive_surfaces_third_party_tracking") ? "sensitive-surface tracking context" : null,
    rowIds.has("session_replay_fingerprinting_review") ||
      rowIds.has("session_replay_before_consent") ||
      rowIds.has("session_replay_disclosure_alignment") ||
      rowIds.has("session_replay_sensitive_surface") ||
      rowIds.has("session_replay_after_refusal")
      ? "session replay and fingerprinting context"
      : null,
    rowIds.has("cross_border_endpoint_review") ? "cross-border analytics/tracking endpoint context" : null,
    rowIds.has("accessibility_consent_controls") ? "consent-control accessibility" : null,
  ].filter((area): area is string => Boolean(area));

  return areas.length > 0 ? areas.join(", ") : "the available GDPR/ePrivacy checklist rows";
}

function RowToolButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: "correction" | "evidence";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "group/tool inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition",
        active
          ? icon === "evidence"
            ? "border-sky-300 bg-sky-50 text-sky-700 shadow-sm"
            : "border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm"
          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800"
      )}
      title={label}
      type="button"
      onClick={onClick}
    >
      {icon === "evidence" ? <EvidenceToolIcon /> : <CorrectionToolIcon />}
    </button>
  );
}

function EvidenceToolIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
      <path d="M5.2 2.8h6.1l3.5 3.5v10.9H5.2V2.8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M11.2 2.9v3.6h3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="m8 9-1.5 1.5L8 12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="m12 9 1.5 1.5L12 12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M10.6 8.6 9.4 12.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function CorrectionToolIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
      <path d="M12.7 3.2a4.2 4.2 0 0 0 4.1 4.1l-8.6 8.6a2.2 2.2 0 0 1-3.1 0l-1-1a2.2 2.2 0 0 1 0-3.1l8.6-8.6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="m5.5 12.5 2 2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M12.6 3.2 16.8 7.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function ChecklistRows({
  expandAllAdvancedEvidence,
  items,
  showDebugConfidenceImprovements
}: {
  expandAllAdvancedEvidence: boolean;
  items: GdprEprivacyCoverageChecklistItem[];
  showDebugConfidenceImprovements: boolean;
}) {
  const [openToolsByRow, setOpenToolsByRow] = React.useState<Record<string, RowToolState>>({});
  const toggleRowTool = (rowId: string, tool: keyof RowToolState) => {
    setOpenToolsByRow((current) => ({
      ...current,
      [rowId]: {
        ...current[rowId],
        [tool]: !current[rowId]?.[tool]
      }
    }));
  };

  return (
    <div className="divide-y divide-slate-200">
      {items.map((item) => {
        const evidenceLabel = getEvidenceLabel(item);
        const assessmentDirection = getAssessmentDirection(item);
        const rowRationale = getChecklistRowRationale(item);
        const rowToolState = openToolsByRow[item.id] ?? {};
        const evidenceOpen = expandAllAdvancedEvidence || Boolean(rowToolState.evidence);
        const correctionOpen = expandAllAdvancedEvidence || Boolean(rowToolState.correction);
        return (
          <div
            key={item.id}
            className="grid grid-cols-1 gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)]"
          >
            <div className="min-w-0 space-y-2">
              <div className="flex items-start gap-3">
                <CoverageStatusGlyph direction={assessmentDirection} />
                <div className="min-w-0 space-y-1.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <p className="min-w-0 font-medium text-slate-950">{item.label}</p>
                    <span
                      className={cn(
                        "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]",
                        getEvidenceLabelBadgeClasses(evidenceLabel)
                      )}
                    >
                      {evidenceLabel}
                    </span>
                  </div>
                  <DebugConfidenceSummary item={item} showImprovements={showDebugConfidenceImprovements} />
                </div>
              </div>
            </div>
            <div className="min-w-0 space-y-1">
              <div className="hidden items-start gap-2 md:flex">
                <div className="flex shrink-0 items-center gap-1 pt-0.5">
                  <RowToolButton
                    active={evidenceOpen}
                    icon="evidence"
                    label={`Toggle evidence packet for ${item.label}`}
                    onClick={() => toggleRowTool(item.id, "evidence")}
                  />
                  <RowToolButton
                    active={correctionOpen}
                    icon="correction"
                    label={`Toggle correction steps for ${item.label}`}
                    onClick={() => toggleRowTool(item.id, "correction")}
                  />
                </div>
                <p className="line-clamp-2 min-w-0 text-sm leading-6 text-slate-600">{renderRationaleText(rowRationale)}</p>
              </div>
              <div className="flex items-start gap-2 md:hidden">
                <div className="flex shrink-0 items-center gap-1 pt-0.5">
                  <RowToolButton
                    active={evidenceOpen}
                    icon="evidence"
                    label={`Toggle evidence packet for ${item.label}`}
                    onClick={() => toggleRowTool(item.id, "evidence")}
                  />
                  <RowToolButton
                    active={correctionOpen}
                    icon="correction"
                    label={`Toggle correction steps for ${item.label}`}
                    onClick={() => toggleRowTool(item.id, "correction")}
                  />
                </div>
                <p className="line-clamp-2 min-w-0 text-xs leading-5 text-slate-500">{renderRationaleText(rowRationale)}</p>
              </div>
              {evidenceOpen ? (
                <details className="mt-2 rounded-md border border-slate-200 bg-white" open>
                  <summary className="cursor-pointer px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                    Evidence packet
                  </summary>
                  <div className="max-h-[50vh] overflow-y-auto">
                    <RegulatoryChecklistEvidenceDetails evidenceRefs={getDisplayEvidenceRefs(item)} jsonPayload={stringifyEvidenceJson(item)} />
                  </div>
                </details>
              ) : null}
              {correctionOpen ? (
                <RegulatoryChecklistCorrectionSteps
                  defaultOpen
                  jsonPayload={stringifyEvidenceJson(item)}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GdprEprivacyCoverageChecklistCard({
  defaultOpen = true,
  gdprEprivacyLens,
  items,
  showDebugConfidenceImprovements = true,
  showSummaryStrip = true
}: GdprEprivacyCoverageChecklistCardProps) {
  const { expandAllAdvancedEvidence } = useRegulatoryChecklistAdvancedEvidence();
  const reportItems = getReportableGdprEprivacyCoverageItems(items);
  const itemsById = new Map(reportItems.map((item) => [item.id, item]));
  const groupedRowIds = new Set<string>(REPORT_ROW_GROUPS.flatMap((group) => [...group.rowIds]));
  const groupedSections = REPORT_ROW_GROUPS.map((group) => ({
    ...group,
    items: group.rowIds.flatMap((rowId) => itemsById.get(rowId) ?? [])
  })).filter((group) => group.items.length > 0);
  const additionalItems = reportItems.filter((item) => !groupedRowIds.has(item.id));
  const checklistScore = deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: reportItems });
  const reviewSummary = deriveGdprEprivacyReviewSummary(reportItems);
  const gdprSectionSummary =
    getGdprSectionSummary({
      fallbackSummary: `${reviewSummary.coverageText} ${reviewSummary.priorityReviewText}`,
      items: reportItems,
      lensSummary: gdprEprivacyLens?.summary,
      reviewSummary,
      scoreSummary: checklistScore.summary
    });

  return (
    <CollapsibleSectionCard
      collapsible={false}
      defaultOpen={defaultOpen}
      showChevron={false}
      title={getGdprSummaryTitle({
        items: reportItems,
        summary: gdprSectionSummary
      })}
      contentClassName="space-y-3 px-4 pb-4"
      summaryClassName="px-4 py-4"
    >
      {showSummaryStrip ? <ChecklistRowSummaryStrip items={reportItems} /> : null}
      {groupedSections.map((group) => (
        <div key={group.title} className="overflow-hidden rounded-lg border border-slate-200">
          <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)]">
            <span>{group.title}</span>
            <span className="hidden md:block">Scan-context note</span>
          </div>
          <ChecklistRows
            expandAllAdvancedEvidence={expandAllAdvancedEvidence}
            items={group.items}
            showDebugConfidenceImprovements={showDebugConfidenceImprovements}
          />
        </div>
      ))}
      {additionalItems.length > 0 ? (
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
            <ScanReportDisclosureIcon className="group-open:rotate-90" />
            <span className="text-sm font-semibold text-slate-950">Additional Review Rows</span>
            <span className="text-xs text-slate-500">{additionalItems.length} retained rows</span>
          </summary>
          <div className="border-t border-slate-200">
            <ChecklistRows
              expandAllAdvancedEvidence={expandAllAdvancedEvidence}
              items={additionalItems}
              showDebugConfidenceImprovements={showDebugConfidenceImprovements}
            />
          </div>
        </details>
      ) : null}
    </CollapsibleSectionCard>
  );
}
