"use client";

import React from "react";
import { cn } from "@website-signal-risk-scanner/ui";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import { useRegulatoryChecklistAdvancedEvidence } from "./regulatory-checklist-advanced-evidence-context";
import { RegulatoryChecklistEvidenceDetails } from "./regulatory-checklist-evidence-details";
import type {
  GdprEprivacyCoverageChecklistItem,
  GdprEprivacyCoverageChecklistStatus,
  RegulatoryAssessmentStatus,
  RegulatoryEvidenceState
} from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import {
  deriveGdprEprivacyReviewSummary,
  getGdprEprivacyCustomerLabel
} from "../../lib/scans/gdpr-eprivacy-review-summary";
import { deriveRegulatoryCoverageScore } from "../../lib/scans/regulatory-coverage-score";

type GdprEprivacyCoverageChecklistCardProps = {
  defaultOpen?: boolean;
  gdprEprivacyLens?: {
    ratingLabel: string;
    score: number | null;
    summary?: string;
    toneClass: string;
  } | null;
  items: GdprEprivacyCoverageChecklistItem[];
};

function getAssessmentBadgeClasses(status: RegulatoryAssessmentStatus) {
  switch (status) {
    case "gap_observed":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "review_signal":
      return "border-indigo-200 bg-indigo-50 text-indigo-900";
    case "coverage_limitation":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "not_applicable":
      return "border-slate-200 bg-white text-slate-600";
    case "checked":
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
}

function getEvidenceStateBadgeClasses(state: RegulatoryEvidenceState) {
  switch (state) {
    case "observed":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "not_observed":
      return "border-slate-200 bg-white text-slate-600";
    case "not_testable":
      return "border-slate-300 bg-slate-100 text-slate-600";
    case "not_applicable":
    default:
      return "border-slate-200 bg-white text-slate-500";
  }
}

function getAssessmentStatusLabel(status: RegulatoryAssessmentStatus) {
  switch (status) {
    case "gap_observed":
      return "Gap observed";
    case "review_signal":
      return "Review signal";
    case "coverage_limitation":
      return "Coverage limitation";
    case "not_applicable":
      return "Not applicable";
    case "checked":
    default:
      return "Checked";
  }
}

function getEvidenceStateLabel(state: RegulatoryEvidenceState) {
  switch (state) {
    case "observed":
      return "Observed";
    case "not_observed":
      return "Not observed";
    case "not_testable":
      return "Not testable";
    case "not_applicable":
    default:
      return "Not applicable";
  }
}

function getCoverageIconMeta(status: GdprEprivacyCoverageChecklistStatus) {
  switch (status) {
    case "Observed":
      return {
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        icon: "check" as const,
        label: "Checked",
        tooltip: "Automated evidence was retained for this coverage area in the tested public-web context."
      };
    case "Not observed":
      return {
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        icon: "check" as const,
        label: "Checked",
        tooltip: "The scan retained enough context for this row and did not observe an eligible issue. This is not a compliance determination."
      };
    case "Gap observed":
      return {
        className: "border-rose-200 bg-rose-50 text-rose-700",
        icon: "alert" as const,
        label: "Needs review",
        tooltip: "Canonical evidence projected a gap for this row. Review the retained evidence before drawing conclusions."
      };
      case "Review signal":
      case "Not confirmed":
        return {
          className: "border-indigo-200 bg-indigo-50 text-indigo-700",
        icon: "flag" as const,
        label: "Needs review",
        tooltip: "Canonical evidence projected a review signal. This needs human review, not automatic pass/fail treatment."
      };
    case "Insufficient evidence":
      return {
        className: "border-violet-200 bg-violet-50 text-violet-700",
        icon: "question" as const,
        label: "Needs evidence",
        tooltip: "Some canonical evidence exists, but required source signals or report projection gates are incomplete."
      };
    case "Not testable":
      return {
        className: "border-slate-300 bg-slate-100 text-slate-600",
        icon: "slash" as const,
        label: "Not testable",
        tooltip: "The retained public-web scan context did not support testing this coverage area."
      };
    case "Out of scope":
      return {
        className: "border-slate-200 bg-white text-slate-500",
        icon: "dash" as const,
        label: "Out of scope",
        tooltip: "This coverage area is outside the automated public-web scan context."
      };
    default:
      return {
        className: "border-slate-200 bg-white text-slate-600",
        icon: "question" as const,
        label: "Review",
        tooltip: "Review the retained evidence for this coverage area."
      };
  }
}

function CoverageStatusGlyph({ status }: { status: GdprEprivacyCoverageChecklistStatus }) {
  const meta = getCoverageIconMeta(status);
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

  if (icon === "dash") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <path d="M5.5 10h9" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
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

function getGdprSummaryTitle(input: {
  items: GdprEprivacyCoverageChecklistItem[];
  ratingLabel: string;
  score: number | null;
  toneClass?: string;
}) {
  const ratingBucket = typeof input.score === "number" ? Math.max(0, Math.min(5, input.score / 20)) : 0;
  const gapCount = input.items.filter((item) => item.assessmentStatus === "gap_observed").length;
  const reviewCount = input.items.filter((item) => item.assessmentStatus === "review_signal").length;
  const checkedCount = input.items.filter((item) => item.assessmentStatus === "checked").length;
  const notTestableCount = input.items.filter((item) =>
    item.evidenceState === "not_testable" || item.assessmentStatus === "coverage_limitation"
  ).length;
  const statusSummary = [
    {
      className: "border-rose-200 bg-rose-50 text-rose-700",
      count: gapCount,
      icon: "alert" as const,
      label: "gaps"
    },
    {
      className: "border-indigo-200 bg-indigo-50 text-indigo-700",
      count: reviewCount,
      icon: "flag" as const,
      label: "review"
    },
    {
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      count: checkedCount,
      icon: "check" as const,
      label: "checked"
    },
    {
      className: "border-slate-300 bg-slate-100 text-slate-600",
      count: notTestableCount,
      icon: "slash" as const,
      label: "not testable"
    }
  ].filter((item) => item.count > 0);

  return (
    <div className="grid w-full grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(16rem,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-base font-semibold tracking-normal text-slate-950">GDPR / ePrivacy</p>
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold tracking-normal text-slate-950">
            Score: <span className="text-[1.3rem] leading-none">{input.score ?? "—"}</span>
            {typeof input.score === "number" ? <span className="text-[0.8rem] font-medium text-slate-500">/100</span> : null}
          </span>
        </div>
        <span
          className={cn(
            "mt-1.5 inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
            input.toneClass ?? "border-slate-200 bg-slate-50 text-slate-600"
          )}
        >
          {input.ratingLabel}
        </span>
        <div className="mt-2 flex w-full max-w-[11rem] items-center gap-1.5">
          {Array.from({ length: 5 }, (_, index) => {
            const segmentFill = Math.max(0, Math.min(1, ratingBucket - index));
            return (
              <span
                key={index}
                className="relative h-2 flex-1 overflow-hidden rounded-full border border-slate-200 bg-slate-100"
              >
                <span
                  className={cn("absolute inset-y-0 left-0 rounded-full", input.toneClass ?? "bg-slate-400")}
                  style={{ width: `${segmentFill * 100}%` }}
                />
              </span>
            );
          })}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2.5 self-center rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2">
        {statusSummary.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.55)]">
            <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-full border", item.className)}>
              <CoverageStatusIcon icon={item.icon} />
            </span>
            <span className="whitespace-nowrap text-xs font-medium text-slate-600">
              <span className="font-semibold text-slate-950">{item.count}</span> {item.label}
            </span>
          </span>
        ))}
      </div>
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
    return item.status === "Gap observed"
      ? "Non-essential cookies or browser storage were observed before a recorded consent action."
      : "No eligible non-essential cookies or browser storage were observed before a recorded consent action.";
  }

  if (item.id === "pre_consent_third_party_tracking") {
    return item.status === "Gap observed"
      ? "Analytics, advertising, cross-site measurement, or similar third-party requests were observed before recorded consent."
      : "No eligible third-party tracking requests were observed before recorded consent.";
  }

  if (item.id === "reject_all_path_availability") {
    return item.status === "Observed"
      ? "A reject-all or equivalent refusal path was observed from the consent surface."
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

  if (item.id === "runtime_vendor_disclosure_alignment") {
    return item.status === "Gap observed" || item.status === "Review signal"
      ? "Observed runtime vendors were not clearly matched in the reviewed public privacy/cookie disclosures."
      : item.status === "Not observed"
        ? "No runtime vendor disclosure-alignment issue was observed in the tested context."
        : "Runtime vendor disclosure alignment was reviewed from retained policy and runtime evidence.";
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

  const subject = item.label.charAt(0).toLowerCase() + item.label.slice(1);
  switch (item.status) {
    case "Observed":
      return `${item.label} was observed in the tested context.`;
    case "Gap observed":
      return `${item.label} produced a gap signal in the tested context.`;
    case "Review signal":
      return `${item.label} produced a review signal in the tested context.`;
    case "Not observed":
      return `No eligible ${subject} was observed in the tested context.`;
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

function getRetainedEvidenceRecord(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = item.criticalEvidence.retainedEvidence;
  return evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? evidence as Record<string, unknown>
    : {};
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
  const consentAccessibilityNeedsReview = input.items.some((item) =>
    item.id === "accessibility_consent_controls" &&
    (item.assessmentStatus === "gap_observed" || item.assessmentStatus === "review_signal")
  );
  const reviewAreas = consentAccessibilityNeedsReview
    ? "consent timing, refusal behavior, post-choice controls, runtime vendor disclosure alignment, cross-border analytics/tracking endpoint context, and consent-control accessibility"
    : "consent timing, refusal behavior, post-choice controls, runtime vendor disclosure alignment, and cross-border analytics/tracking endpoint context";
  const scorePrefix = input.scoreSummary ? `${input.scoreSummary} ` : "";
  return `${scorePrefix}${primary} ${input.reviewSummary.coverageText} ${input.reviewSummary.priorityReviewText} Review retained evidence for ${reviewAreas}.`;
}

export function GdprEprivacyCoverageChecklistCard({
  defaultOpen = true,
  gdprEprivacyLens,
  items
}: GdprEprivacyCoverageChecklistCardProps) {
  const { expandAllAdvancedEvidence } = useRegulatoryChecklistAdvancedEvidence();
  const checklistScore = deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: items });
  const gdprScore = checklistScore.score;
  const gdprRatingLabel = checklistScore.ratingLabel;
  const reviewSummary = deriveGdprEprivacyReviewSummary(items);
  const gdprSectionSummary =
    getGdprSectionSummary({
      fallbackSummary: `${reviewSummary.coverageText} ${reviewSummary.priorityReviewText}`,
      items,
      lensSummary: gdprEprivacyLens?.summary,
      reviewSummary,
      scoreSummary: checklistScore.summary
    });

  return (
    <CollapsibleSectionCard
      defaultOpen={defaultOpen}
      title={getGdprSummaryTitle({
        items,
        ratingLabel: gdprRatingLabel,
        score: gdprScore,
        toneClass: checklistScore.toneClass
      })}
      contentClassName="space-y-4"
    >
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">GDPR / ePrivacy review summary</p>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">{gdprSectionSummary}</p>
          </div>
        </div>
      </section>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)]">
          <span>Coverage area</span>
          <span className="hidden md:block">Scan-context note</span>
        </div>
        <div className="divide-y divide-slate-200">
          {items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-1 gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)]"
            >
              <div className="min-w-0 space-y-2">
                <div className="flex items-start gap-3">
                  <CoverageStatusGlyph status={item.status} />
                  <div className="min-w-0 space-y-2">
                    <p className="font-medium text-slate-950">{getGdprEprivacyCustomerLabel(item)}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]",
                          getEvidenceStateBadgeClasses(item.evidenceState)
                        )}
                      >
                        {getEvidenceStateLabel(item.evidenceState)}
                      </span>
                      <span
                        className={cn(
                          "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                          getAssessmentBadgeClasses(item.assessmentStatus)
                        )}
                      >
                        {getAssessmentStatusLabel(item.assessmentStatus)}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500 md:hidden">{getScanContextNote(item)}</p>
              </div>
              <div className="min-w-0 space-y-1">
                <p className="hidden text-sm leading-6 text-slate-600 md:block">{getScanContextNote(item)}</p>
                {item.limitation ? <p className="text-xs leading-5 text-slate-500">{item.limitation}</p> : null}
                <details className="mt-2 rounded-md border border-slate-200 bg-white" open={expandAllAdvancedEvidence || undefined}>
                  <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Evidence packet
                  </summary>
                  <RegulatoryChecklistEvidenceDetails evidenceRefs={getDisplayEvidenceRefs(item)} jsonPayload={stringifyEvidenceJson(item)} />
                </details>
              </div>
            </div>
          ))}
        </div>
      </div>
    </CollapsibleSectionCard>
  );
}
