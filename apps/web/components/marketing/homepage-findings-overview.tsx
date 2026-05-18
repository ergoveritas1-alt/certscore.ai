"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FindingReferenceItem } from "../../lib/marketing/finding-atlas";

type HomepageFindingsOverviewProps = {
  findings: FindingReferenceItem[];
};

function getFindingHref(findingId: string) {
  return `/guides/findings/${findingId}`;
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {direction === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

function formatPrevalence(finding: FindingReferenceItem) {
  return finding.benchmark.contextLabel;
}

function getCondensedEvidence(finding: FindingReferenceItem) {
  const example = finding.exampleEvidence[0];

  if (!example) {
    return null;
  }

  return {
    title: example.title,
    lines: example.code.split("\n").slice(0, 3)
  };
}

function getReviewLensBadges(finding: FindingReferenceItem) {
  const context = finding.regulatoryContext;

  if (!context) {
    return [];
  }

  const labels = [
    context.primaryConcern.label,
    ...context.technicalStandards.map((item) => item.label),
    ...context.jurisdictionalContexts.map((item) => item.label)
  ].join(" ");
  const badges: string[] = [];

  if (/ccpa|cpra|cipa|california/i.test(labels)) {
    badges.push("CCPA / CPRA / CIPA");
  }

  if (/gdpr|eprivacy|pecr|ico|edpb/i.test(labels)) {
    badges.push("GDPR / ePrivacy");
  }

  if (/ftc|consumer protection|dark-pattern|privacy claim/i.test(labels)) {
    badges.push("FTC");
  }

  if (/ada|wcag|section 508|accessibility|doj|en 301 549/i.test(labels)) {
    badges.push("DOJ / ADA");
  }

  return badges;
}

export function HomepageFindingsOverview({ findings }: HomepageFindingsOverviewProps) {
  const defaultIndex = Math.max(0, findings.findIndex((finding) => finding.id === "pre_consent_tracking_detected"));
  const [activeIndex, setActiveIndex] = useState(defaultIndex);
  const activeFinding = useMemo(
    () => findings[activeIndex] ?? findings[0],
    [activeIndex, findings]
  );

  if (!activeFinding) {
    return null;
  }

  const regulatoryLabel = activeFinding.regulatoryContext?.primaryConcern.label;
  const regulatoryCopy = activeFinding.regulatoryContext?.primaryConcern.displayCopy;
  const reviewLensBadges = getReviewLensBadges(activeFinding);
  const evidence = getCondensedEvidence(activeFinding);
  const visibleReviewQuestions = activeFinding.reviewQuestions.slice(0, 2);

  function showPrevious() {
    setActiveIndex((current) => (current === 0 ? findings.length - 1 : current - 1));
  }

  function showNext() {
    setActiveIndex((current) => (current === findings.length - 1 ? 0 : current + 1));
  }

  return (
    <section className="border-y border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-6 lg:grid-cols-[0.64fr_1.36fr] lg:items-start">
          <div className="max-w-sm space-y-4">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Findings overview</p>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                Browse the review items CertScore can surface.
              </h2>
            </div>

            <div className="flex min-h-[245px] flex-col rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(255,255,255,1)_100%)] p-4 shadow-none">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Finding highlights</p>
              <p className="mt-2 text-[1.35rem] font-semibold tracking-tight text-slate-950">{activeFinding.title}</p>
              <p className="mt-2 text-[13px] leading-5 text-slate-600">{activeFinding.observed}</p>

              <div className="mt-auto flex items-center gap-3 pt-4">
                <button
                  type="button"
                  aria-label="Show previous finding"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
                  onClick={showPrevious}
                >
                  <ArrowIcon direction="left" />
                </button>
                <button
                  type="button"
                  aria-label="Show next finding"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
                  onClick={showNext}
                >
                  <ArrowIcon direction="right" />
                </button>
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                  {String(activeIndex + 1).padStart(2, "0")} / {String(findings.length).padStart(2, "0")}
                </p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,252,255,1)_0%,rgba(255,255,255,0.98)_64%,rgba(249,253,250,0.98)_100%)] p-5 shadow-[0_24px_56px_rgba(15,23,42,0.08)]">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,rgba(15,139,215,0.9)_0%,rgba(103,199,240,0.78)_58%,rgba(71,181,74,0.7)_100%)]"
            />
            <div className="relative grid min-h-[18rem] gap-5 lg:grid-cols-[1fr_0.78fr]">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                    {activeFinding.category}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold capitalize text-slate-600 ring-1 ring-slate-200">
                    {activeFinding.criticality} criticality
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                    {formatPrevalence(activeFinding)}
                  </span>
                </div>
                <div>
                  <h3 className="text-2xl font-semibold tracking-tight text-slate-950">{activeFinding.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{activeFinding.observed}</p>
                </div>
                {regulatoryLabel ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Brief regulatory context</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{regulatoryLabel}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {regulatoryCopy ? `${regulatoryCopy.split(". ")[0]}.` : "Automated public-web signals for review, not a legal conclusion."}
                    </p>
                    {reviewLensBadges.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {reviewLensBadges.map((badge) => (
                          <span key={badge} className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                            {badge}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col rounded-[1.5rem] border border-slate-200 bg-white p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Example evidence</p>
                {evidence ? (
                  <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 p-3">
                    <p className="text-xs font-semibold text-slate-100">{evidence.title}</p>
                    <div className="mt-2 space-y-1 font-mono text-[11px] leading-5 text-slate-300">
                      {evidence.lines.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Reviewer prompts</p>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                  {visibleReviewQuestions.slice(0, 1).map((question) => (
                    <li key={question} className="flex gap-2">
                      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                      <span>{question}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-4">
                  <Link
                    href={getFindingHref(activeFinding.id)}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-slate-950 bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    View full finding
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
