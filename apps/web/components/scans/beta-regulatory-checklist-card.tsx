"use client";

import React from "react";
import { cn } from "@website-signal-risk-scanner/ui";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import { useRegulatoryChecklistAdvancedEvidence } from "./regulatory-checklist-advanced-evidence-context";
import { RegulatoryChecklistEvidenceDetails } from "./regulatory-checklist-evidence-details";

export type BetaRegulatoryChecklistStatus =
  | "checked"
  | "gap_observed"
  | "review_signal"
  | "not_observed"
  | "not_testable"
  | "not_applicable"
  | "litigation_risk_signal";

export type BetaRegulatoryEvidenceCapability =
  | "currently_supported"
  | "near_term_supported"
  | "policy_mapping_only";

export type BetaRegulatoryChecklistRow = {
  evidenceCapability: BetaRegulatoryEvidenceCapability;
  evidenceRefs?: string[];
  id: string;
  label: string;
  note: string;
  regulatoryMapping?: string[];
  status: BetaRegulatoryChecklistStatus;
};

export type BetaRegulatoryChecklistArea = {
  counters: {
    checked: number;
    gaps: number;
    notApplicable?: number;
    notObserved: number;
    notTestable: number;
    review: number;
  };
  id: string;
  maturityLabel?: "Alpha" | "Beta";
  navLabel: string;
  rows: BetaRegulatoryChecklistRow[];
  score?: number | null;
  status?: "strong" | "needs_work" | "review_recommended" | "limited_coverage" | "not_testable";
  subtitle: string;
  summary: string;
  title: string;
};

type BetaRegulatoryChecklistCardProps = {
  area: BetaRegulatoryChecklistArea;
  defaultOpen?: boolean;
};

function getDisplayStatus(status: BetaRegulatoryChecklistStatus) {
  switch (status) {
    case "checked":
      return "Checked";
    case "gap_observed":
      return "Gap observed";
    case "review_signal":
      return "Review signal";
    case "not_observed":
      return "Not observed";
    case "not_testable":
      return "Not testable";
    case "not_applicable":
      return "Not applicable";
    case "litigation_risk_signal":
      return "Litigation-risk signal observed";
  }
}

function getStatusBadgeClasses(status: BetaRegulatoryChecklistStatus) {
  switch (status) {
    case "gap_observed":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "litigation_risk_signal":
      return "border-rose-200 bg-rose-50 text-rose-900";
    case "review_signal":
      return "border-indigo-200 bg-indigo-50 text-indigo-900";
    case "not_testable":
    case "not_applicable":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "not_observed":
      return "border-slate-200 bg-white text-slate-600";
    case "checked":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
}

function getStatusTone(status: BetaRegulatoryChecklistArea["status"]) {
  switch (status) {
    case "strong":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "needs_work":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "review_recommended":
      return "border-indigo-200 bg-indigo-50 text-indigo-800";
    case "not_testable":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "limited_coverage":
    default:
      return "border-sky-200 bg-sky-50 text-sky-800";
  }
}

function getStatusLabel(status: BetaRegulatoryChecklistArea["status"]) {
  switch (status) {
    case "strong":
      return "Strong";
    case "needs_work":
      return "Needs work";
    case "review_recommended":
      return "Review recommended";
    case "not_testable":
      return "Not testable";
    case "limited_coverage":
    default:
      return "Limited coverage";
  }
}

function getCapabilityLabel(capability: BetaRegulatoryEvidenceCapability) {
  switch (capability) {
    case "currently_supported":
      return "Currently supported";
    case "near_term_supported":
      return "Near-term supported";
    case "policy_mapping_only":
      return "Policy mapping only";
  }
}

function stringifyEvidenceJson(area: BetaRegulatoryChecklistArea, row: BetaRegulatoryChecklistRow) {
  return JSON.stringify(
    {
      coverageArea: row.label,
      status: getDisplayStatus(row.status),
      beta: true,
      evidenceCapability: row.evidenceCapability,
      sourceBoundary: {
        ws01: "observed public-web runtime signal identification, evidence capture, and logging",
        wc01: "normalized concern, concern policy, unified finding, and regulatory projection"
      },
      retainedEvidence: {
        evidenceRefs: row.evidenceRefs ?? [],
        regulatoryMapping: row.regulatoryMapping ?? []
      },
      missingOrIncompleteSourceSignals:
        row.evidenceCapability === "currently_supported"
          ? []
          : [
              {
                source: row.evidenceCapability === "near_term_supported" ? "scanner" : "CertScore.ai",
                field:
                  row.evidenceCapability === "near_term_supported"
                    ? "publicWebEvidence.normalizedConcernMapping"
                    : "regulatoryChecklist.policyMapping",
                expected:
                  row.evidenceCapability === "near_term_supported"
                    ? "retained public-web evidence mapped into a normalized concern and eligible unified finding"
                    : "cautious policy-row mapping without scoring penalty",
                actual: "not yet fully mapped for this beta checklist row",
                whyNeeded: "Required before this beta row can move from limited coverage to a stronger evidence-based status."
              }
            ],
      checklist: {
        id: area.id,
        title: area.title,
        status: getStatusLabel(area.status)
      }
    },
    null,
    2
  );
}

type SummaryStatusIconName = "alert" | "check" | "dash" | "flag" | "slash";

function SummaryStatusIcon({ icon }: { icon: SummaryStatusIconName }) {
  if (icon === "check") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 20 20">
        <path d="M5 10.4 8.3 13.7 15 6.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      </svg>
    );
  }

  if (icon === "alert") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 20 20">
        <path d="M10 4.2 17 16H3L10 4.2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M10 8.2v3.8M10 14.8h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (icon === "flag") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 20 20">
        <path d="M6 16V4.8M6 5.2h8.5l-1.4 3 1.4 3H6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "dash") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 20 20">
        <path d="M5.5 10h9" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="6.8" stroke="currentColor" strokeWidth="1.8" />
      <path d="m5.2 14.8 9.6-9.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function getSummaryTitle(area: BetaRegulatoryChecklistArea) {
  const maturityLabel = area.maturityLabel ?? "Beta";
  const ratingBucket = typeof area.score === "number" ? Math.max(0, Math.min(5, area.score / 20)) : 0;
  const statusItems = [
    { className: "border-rose-200 bg-rose-50 text-rose-700", count: area.counters.gaps, icon: "alert" as const, label: "gaps" },
    { className: "border-indigo-200 bg-indigo-50 text-indigo-700", count: area.counters.review, icon: "flag" as const, label: "review" },
    { className: "border-emerald-200 bg-emerald-50 text-emerald-700", count: area.counters.checked, icon: "check" as const, label: "checked" },
    { className: "border-slate-200 bg-white text-slate-500", count: area.counters.notObserved, icon: "dash" as const, label: "not observed" },
    { className: "border-slate-300 bg-slate-100 text-slate-600", count: area.counters.notTestable, icon: "slash" as const, label: "not testable" }
  ].filter((item) => item.count > 0);

  return (
    <div className="grid w-full grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(16rem,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-base font-semibold tracking-normal text-slate-950">{area.title}</p>
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold tracking-normal text-slate-950">
            Score: <span className="text-[1.3rem] leading-none">{area.score ?? "—"}</span>
            {typeof area.score === "number" ? <span className="text-[0.8rem] font-medium text-slate-500">/100</span> : null}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
              getStatusTone(area.status)
            )}
          >
            {getStatusLabel(area.status)}
          </span>
          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
            {maturityLabel}
          </span>
        </div>
        <div className="mt-2 flex w-full max-w-[11rem] items-center gap-1.5">
          {Array.from({ length: 5 }, (_, index) => {
            const segmentFill = Math.max(0, Math.min(1, ratingBucket - index));
            return (
              <span key={index} className="relative h-2 flex-1 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                <span className="absolute inset-y-0 left-0 rounded-full bg-sky-500" style={{ width: `${segmentFill * 100}%` }} />
              </span>
            );
          })}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3 self-center rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2">
        {statusItems.map((item) => (
          <span key={item.label} className="inline-flex min-h-11 items-center gap-2.5 rounded-full bg-white py-1 pl-1 pr-4 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.65)]">
            <span
              aria-hidden="true"
              className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border", item.className)}
            >
              <SummaryStatusIcon icon={item.icon} />
            </span>
            <span className="whitespace-nowrap text-sm font-medium text-slate-600">
              <span className="font-semibold text-slate-950">{item.count}</span> {item.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function BetaRegulatoryChecklistCard({ area, defaultOpen = true }: BetaRegulatoryChecklistCardProps) {
  const { expandAllAdvancedEvidence } = useRegulatoryChecklistAdvancedEvidence();
  const maturityLabel = area.maturityLabel ?? "Beta";

  return (
    <CollapsibleSectionCard defaultOpen={defaultOpen} title={getSummaryTitle(area)} contentClassName="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{area.title} review summary</p>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">{area.summary}</p>
        <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-500">{area.subtitle}</p>
      </section>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)]">
          <span>Coverage area</span>
          <span className="hidden md:block">Scan-context note</span>
        </div>
        <div className="divide-y divide-slate-200">
          {area.rows.map((row) => (
            <div key={row.id} className="grid grid-cols-1 gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)]">
              <div className="min-w-0 space-y-2">
                <p className="font-medium text-slate-950">{row.label}</p>
                <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]", getStatusBadgeClasses(row.status))}>
                  {getDisplayStatus(row.status)}
                </span>
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-sm leading-6 text-slate-600">{row.note}</p>
                <p className="text-xs leading-5 text-slate-500">Evidence capability: {getCapabilityLabel(row.evidenceCapability)}.</p>
                <details className="mt-2 rounded-md border border-slate-200 bg-white" open={expandAllAdvancedEvidence || undefined}>
                  <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Evidence details
                  </summary>
                  <RegulatoryChecklistEvidenceDetails evidenceRefs={row.evidenceRefs} jsonPayload={stringifyEvidenceJson(area, row)} />
                </details>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        {maturityLabel} checklist rows are limited to public-web scan evidence, policy-page review, pre-consent runtime request/cookie/vendor observations, consent/banner control observations, form/sensitive-field detection, and basic accessibility checks.
      </p>
    </CollapsibleSectionCard>
  );
}
