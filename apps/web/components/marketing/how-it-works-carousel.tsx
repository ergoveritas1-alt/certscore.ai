"use client";

import Image from "next/image";
import { useState } from "react";

type CarouselSlide = {
  alt: string;
  highlight: string;
  src: string;
  title: string;
};

const SLIDES: CarouselSlide[] = [
  {
    src: "/how-it-works/executive-summary.png",
    alt: "CertScore.ai report executive summary showing score, cookies before consent, third-party requests, and review lenses.",
    title: "Executive summary",
    highlight: "Start with a plain-English readout of the site's highest-level privacy, consent, tracker, and accessibility posture."
  },
  {
    src: "/how-it-works/highest-priority-issues.png",
    alt: "Highest-priority findings cards showing tracking cookies before consent and session recording services detected.",
    title: "Highest-priority issues",
    highlight: "Focus first on the findings that are most actionable, with severity, evidence strength, and market-density context."
  },
  {
    src: "/how-it-works/detailed-finding-packets.png",
    alt: "Detailed review findings list with severity, surface, evidence, and review-status badges.",
    title: "Detailed finding packets",
    highlight: "Expand lower-level findings when you need the underlying taxonomy, evidence lane, status, and retained signal context."
  },
  {
    src: "/how-it-works/operational-context.png",
    alt: "Operational context panel showing observed vendors, infrastructure profile, audience context, and scan warnings.",
    title: "Operational context",
    highlight: "Review vendors, scan-pass warnings, infrastructure notes, and audience context that may affect interpretation."
  },
  {
    src: "/how-it-works/review-lenses.png",
    alt: "Regulatory review lens cards grouping findings by EU privacy, California privacy, and U.S. accessibility context.",
    title: "Review lenses",
    highlight: "See how findings are organized into privacy, consumer-protection, and accessibility review contexts without making legal conclusions."
  },
  {
    src: "/how-it-works/supporting-analysis.png",
    alt: "Supporting analysis section showing finding mix bars and coverage navigation tiles.",
    title: "Supporting analysis",
    highlight: "Use the finding mix and coverage navigation to understand where signals clustered across the scan."
  },
  {
    src: "/how-it-works/policy-detail.png",
    alt: "Disclosure clarity finding card with next step, why this matters, how to fix, and JSON evidence section.",
    title: "Policy detail",
    highlight: "Review retained disclosure snippets and plain-English remediation guidance when policy language appears weak or generic."
  },
  {
    src: "/how-it-works/evidence-packets.png",
    alt: "Tracking cookies set before consent finding card with expanded JSON evidence payload.",
    title: "Evidence packets",
    highlight: "Open structured JSON evidence when you need auditable details behind a surfaced finding."
  }
];

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {direction === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

export function HowItWorksCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSlide = SLIDES[activeIndex] ?? SLIDES[0]!;

  function showPrevious() {
    setActiveIndex((current) => (current === 0 ? SLIDES.length - 1 : current - 1));
  }

  function showNext() {
    setActiveIndex((current) => (current === SLIDES.length - 1 ? 0 : current + 1));
  }

  return (
    <section className="border-y border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-8 lg:grid-cols-[0.6fr_1.4fr] lg:items-start">
          <div className="max-w-sm space-y-4">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Scan walkthrough</p>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">See how the report turns observed signals into reviewable findings.</h2>
            </div>

            <div className="flex min-h-[245px] flex-col rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(255,255,255,1)_100%)] p-4 shadow-none">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Report highlights</p>
              <p className="mt-2 text-[1.35rem] font-semibold tracking-tight text-slate-950">{activeSlide.title}</p>
              <p className="mt-2 text-[13px] leading-5 text-slate-600">{activeSlide.highlight}</p>

              <div className="mt-auto flex items-center gap-3 pt-4">
                <button
                  type="button"
                  aria-label="Show previous screenshot"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
                  onClick={showPrevious}
                >
                  <ArrowIcon direction="left" />
                </button>
                <button
                  type="button"
                  aria-label="Show next screenshot"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
                  onClick={showNext}
                >
                  <ArrowIcon direction="right" />
                </button>
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                  {String(activeIndex + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
                </p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,252,255,1)_0%,rgba(255,255,255,0.98)_64%,rgba(249,253,250,0.98)_100%)] p-6 shadow-[0_24px_56px_rgba(15,23,42,0.08)]">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,rgba(15,139,215,0.9)_0%,rgba(103,199,240,0.78)_58%,rgba(71,181,74,0.7)_100%)]"
            />
            <div className="relative aspect-[16/9.2] overflow-hidden rounded-[1.55rem] border border-slate-200 bg-white">
              <Image
                key={activeSlide.src}
                src={activeSlide.src}
                alt={activeSlide.alt}
                fill
                className="object-contain object-top"
                sizes="(min-width: 1024px) 55vw, 100vw"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
