"use client";

import React from "react";
import { cn } from "@website-signal-risk-scanner/ui";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import { useRegulatoryChecklistAdvancedEvidence } from "./regulatory-checklist-advanced-evidence-context";
import { RegulatoryChecklistEvidenceDetails } from "./regulatory-checklist-evidence-details";
import { ScanReportDisclosureIcon } from "./scan-report-disclosure-icon";
import type {
  CaliforniaPrivacyCoverageAssessmentStatus,
  CaliforniaPrivacyCoverageEvidenceState,
  CaliforniaPrivacyCoverageChecklistItem,
} from "../../lib/scans/california-privacy-coverage-checklist";
import { deriveRegulatoryCoverageScore } from "../../lib/scans/regulatory-coverage-score";

type CaliforniaPrivacyCoverageChecklistCardProps = {
  californiaLens?: {
    ratingLabel: string;
    score: number | null;
    summary?: string;
    toneClass: string;
  } | null;
  defaultOpen?: boolean;
  items: CaliforniaPrivacyCoverageChecklistItem[];
};

function getAssessmentBadgeClasses(status: CaliforniaPrivacyCoverageAssessmentStatus) {
  switch (status) {
    case "gap_observed":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "review_signal":
      return "border-indigo-200 bg-indigo-50 text-indigo-900";
    case "coverage_limitation":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "needs_evidence":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "checked":
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
}

function getEvidenceStateBadgeClasses(state: CaliforniaPrivacyCoverageEvidenceState) {
  switch (state) {
    case "observed":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "not_observed":
      return "border-slate-200 bg-white text-slate-600";
    case "not_testable":
    default:
      return "border-slate-300 bg-slate-100 text-slate-600";
  }
}

function getAssessmentStatusLabel(status: CaliforniaPrivacyCoverageAssessmentStatus) {
  switch (status) {
    case "gap_observed":
      return "Gap observed";
    case "review_signal":
      return "Review signal";
    case "coverage_limitation":
      return "Coverage limitation";
    case "needs_evidence":
      return "Needs evidence";
    case "checked":
    default:
      return "Checked";
  }
}

function getEvidenceStateLabel(state: CaliforniaPrivacyCoverageEvidenceState) {
  switch (state) {
    case "observed":
      return "Observed";
    case "not_observed":
      return "Not observed";
    case "not_testable":
    default:
      return "Not testable";
  }
}

function getCoverageIconMeta(item: CaliforniaPrivacyCoverageChecklistItem) {
  if (item.evidenceState === "not_testable" || item.assessmentStatus === "needs_evidence") {
    return {
      className: "border-slate-300 bg-slate-100 text-slate-600",
      icon: "slash" as const,
      label: "Needs evidence",
      tooltip: "The retained public-web scan context did not support testing this CCPA / CPRA + CIPA coverage area."
    };
  }

  switch (item.assessmentStatus) {
    case "gap_observed":
      return {
        className: "border-rose-200 bg-rose-50 text-rose-700",
        icon: "alert" as const,
        label: "Needs review",
        tooltip: "Canonical evidence projected a gap for this row. Review the retained evidence before drawing conclusions."
      };
    case "review_signal":
      return {
        className: "border-indigo-200 bg-indigo-50 text-indigo-700",
        icon: "flag" as const,
        label: "Needs review",
        tooltip: "Canonical evidence projected a CCPA / CPRA + CIPA review signal. This needs human review, not automatic pass/fail treatment."
      };
    case "coverage_limitation":
      return {
        className: "border-violet-200 bg-violet-50 text-violet-700",
        icon: "question" as const,
        label: "Needs evidence",
        tooltip: "Some canonical evidence exists, but required source signals or report projection gates are incomplete."
      };
    case "checked":
    default:
      return {
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        icon: "check" as const,
        label: "Checked",
        tooltip: item.evidenceState === "not_observed"
          ? "The scan retained enough context for this row and did not observe an eligible issue or signal. This is not a compliance determination."
          : "Automated evidence was retained for this coverage area in the tested public-web context."
      };
  }
}

function CoverageStatusGlyph({ item }: { item: CaliforniaPrivacyCoverageChecklistItem }) {
  const meta = getCoverageIconMeta(item);
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

  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
      <path d="M7.7 7.4a2.5 2.5 0 1 1 3.8 2.2c-.9.5-1.5 1.1-1.5 2.1v.3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M10 15h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function getEvidenceJson(item: CaliforniaPrivacyCoverageChecklistItem) {
  return {
    assessmentStatus: item.assessmentStatus,
    coverageArea: item.label,
    evidenceState: item.evidenceState,
    status: item.status,
    statusLabel: item.statusLabel,
    ...item.criticalEvidence
  };
}

function stringifyEvidenceJson(item: CaliforniaPrivacyCoverageChecklistItem) {
  return JSON.stringify(
    getEvidenceJson(item),
    (_key, value) => typeof value === "bigint" ? value.toString() : value,
    2
  );
}

function getDisplayEvidenceRefs(item: CaliforniaPrivacyCoverageChecklistItem) {
  return item.evidenceRefs
    .map((value) => value.replace(/^Evidence flag:\s*/i, "Evidence: ").replace(/[_:]+/g, " ").replace(/\s+/g, " ").trim())
    .slice(0, 6);
}

function getCaliforniaSummary(input: {
  items: CaliforniaPrivacyCoverageChecklistItem[];
  lensSummary?: string;
  scoreSummary?: string;
}) {
  const allRowsNotTestable = input.items.length > 0 && input.items.every((item) => item.evidenceState === "not_testable");
  if (allRowsNotTestable) {
    return "California privacy review was not scored because retained scanner evidence was not complete enough to evaluate the CCPA / CPRA + CIPA checklist areas. The rows below preserve the missing source-signal reasons for follow-up.";
  }

  const hasIssues = input.items.some((item) => item.assessmentStatus === "gap_observed" || item.assessmentStatus === "review_signal");
  const scorePrefix = input.scoreSummary ? `${input.scoreSummary} ` : "";
  if (input.lensSummary) {
    return `${scorePrefix}${input.lensSummary} CertScore reviewed sale/share, targeted advertising, opt-out availability, GPC handling, sensitive personal information controls, notice alignment, and CIPA-sensitive tracking signals using retained public-web evidence.`;
  }
  return hasIssues
    ? `${scorePrefix}California privacy review signals are centered on sale/share, targeted advertising, opt-out availability, GPC handling, sensitive personal information controls, notice alignment, and CIPA-sensitive tracking signals.`
    : `${scorePrefix}No major California CCPA / CPRA + CIPA issue surfaced in the top findings. CertScore reviewed public privacy notice availability, opt-out paths, targeted advertising signals, GPC handling, sensitive personal information controls, runtime vendor disclosure alignment, and CIPA-sensitive tracking context using retained automated evidence.`;
}

function getSummaryTitle(input: {
  items: CaliforniaPrivacyCoverageChecklistItem[];
  ratingLabel: string;
  score: number | null;
  toneClass?: string;
}) {
  const ratingBucket = typeof input.score === "number" ? Math.max(0, Math.min(5, input.score / 20)) : 0;
  const scoreLabel = typeof input.score === "number" ? input.score : "Not testable";
  const gapCount = input.items.filter((item) => item.assessmentStatus === "gap_observed").length;
  const reviewCount = input.items.filter((item) => item.assessmentStatus === "review_signal").length;
  const checkedCount = input.items.filter((item) => item.assessmentStatus === "checked").length;
  const needsEvidenceCount = input.items.filter((item) =>
    item.evidenceState === "not_testable" ||
    item.assessmentStatus === "coverage_limitation" ||
    item.assessmentStatus === "needs_evidence"
  ).length;
  const statusSummary = [
    { className: "border-rose-200 bg-rose-50 text-rose-700", count: gapCount, icon: "alert" as const, label: "gaps" },
    { className: "border-indigo-200 bg-indigo-50 text-indigo-700", count: reviewCount, icon: "flag" as const, label: "review" },
    { className: "border-emerald-200 bg-emerald-50 text-emerald-700", count: checkedCount, icon: "check" as const, label: "checked" },
    { className: "border-slate-300 bg-slate-100 text-slate-600", count: needsEvidenceCount, icon: "slash" as const, label: "needs evidence" }
  ].filter((item) => item.count > 0);

  return (
    <div className="grid w-full grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(16rem,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-base font-semibold tracking-normal text-slate-950">California CCPA / CPRA + CIPA</p>
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold tracking-normal text-slate-950">
            Score: <span className="text-[1.3rem] leading-none">{scoreLabel}</span>
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
              <span key={index} className="relative h-2 flex-1 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                <span className={cn("absolute inset-y-0 left-0 rounded-full", input.toneClass ?? "bg-slate-400")} style={{ width: `${segmentFill * 100}%` }} />
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

export function CaliforniaPrivacyCoverageChecklistCard({
  californiaLens,
  defaultOpen = true,
  items
}: CaliforniaPrivacyCoverageChecklistCardProps) {
  const { expandAllAdvancedEvidence } = useRegulatoryChecklistAdvancedEvidence();
  const hasTestableCaliforniaEvidence = items.some((item) => item.evidenceState !== "not_testable");
  const checklistScore = deriveRegulatoryCoverageScore({ framework: "california", rows: items });
  const score = hasTestableCaliforniaEvidence ? checklistScore.score : null;
  const ratingLabel = hasTestableCaliforniaEvidence ? checklistScore.ratingLabel : "Not testable";
  const toneClass = hasTestableCaliforniaEvidence ? checklistScore.toneClass : "border-slate-300 bg-slate-100 text-slate-700";
  const summary = getCaliforniaSummary({
    items,
    lensSummary: hasTestableCaliforniaEvidence ? californiaLens?.summary : undefined,
    scoreSummary: hasTestableCaliforniaEvidence ? checklistScore.summary : undefined
  });

  return (
    <CollapsibleSectionCard
      defaultOpen={defaultOpen}
      title={getSummaryTitle({ items, ratingLabel, score, toneClass })}
      contentClassName="space-y-4"
    >
      <details className="group/california-summary rounded-lg border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-start gap-3 px-4 pb-3 pt-4 marker:hidden group-open/california-summary:pb-0 [&::-webkit-details-marker]:hidden">
          <ScanReportDisclosureIcon className="mt-0.5 group-open/california-summary:rotate-90" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              CPRA + CIPA review summary
            </span>
            <span className="mt-1 block max-w-4xl truncate text-sm leading-6 text-slate-600 group-open/california-summary:hidden">
              {summary}
            </span>
          </span>
        </summary>
        <div className="px-4 pb-4 pl-12 pt-1">
          <p className="max-w-4xl text-sm leading-6 text-slate-600">{summary}</p>
        </div>
      </details>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)]">
          <span>Coverage area</span>
          <span className="hidden md:block">Scan-context note</span>
        </div>
        <div className="divide-y divide-slate-200">
          {items.map((item) => (
            <div key={item.id} className="grid grid-cols-1 gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)]">
              <div className="min-w-0 space-y-2">
                <div className="flex items-start gap-3">
                  <CoverageStatusGlyph item={item} />
                  <div className="min-w-0 space-y-2">
                    <p className="font-medium text-slate-950">{item.label}</p>
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
                <p className="text-xs leading-5 text-slate-500 md:hidden">{item.note}</p>
              </div>
              <div className="min-w-0 space-y-1">
                <p className="hidden text-sm leading-6 text-slate-600 md:block">{item.note}</p>
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
