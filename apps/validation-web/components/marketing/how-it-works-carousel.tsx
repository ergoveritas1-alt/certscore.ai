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
    src: "/images/how-it-works/consent-detail-signals.png",
    alt: "Consent detail signals section showing consent mechanism and privacy request path fields.",
    title: "Consent detail signals",
    highlight: "Spot missing reject controls, DSAR paths, privacy request forms, and cookie volume without digging."
  },
  {
    src: "/images/how-it-works/executive-summary-policy-posture.png",
    alt: "Executive summary and privacy disclosure scan report sections.",
    title: "Executive summary and policy posture",
    highlight: "Surface the section scores, key contradictions, and disclosure coverage in one opening view."
  },
  {
    src: "/images/how-it-works/cookie-banner-post-choice-audit.png",
    alt: "Cookie banner and consent section with post-choice audit details.",
    title: "Cookie banner and post-choice audit",
    highlight: "Compare baseline consent posture with post-reject behavior to see whether controls actually change tracking."
  },
  {
    src: "/images/how-it-works/contradictions-policy-records.png",
    alt: "Contradictions and claim checks with policy document analysis.",
    title: "Contradictions and policy records",
    highlight: "Bring policy claims and runtime behavior into the same evidence surface so contradictions stand out immediately."
  },
  {
    src: "/images/how-it-works/regulatory-crosswalk.png",
    alt: "Regulatory crosswalk showing GDPR, FTC, CPPA, and other mappings.",
    title: "Regulatory crosswalk",
    highlight: "Translate observed scan flags into regulator-oriented groupings for faster legal, compliance, or analyst review."
  },
  {
    src: "/images/how-it-works/tracker-data-collection.png",
    alt: "Tracker and third-party data collection detection details.",
    title: "Tracker and third-party data collection",
    highlight: "Inspect tracker counts, request domains, payment processors, and broader collection surface from the same scan."
  },
  {
    src: "/images/how-it-works/advanced-diagnostics.png",
    alt: "Advanced diagnostics and raw signals sections.",
    title: "Advanced diagnostics and raw signals",
    highlight: "Drill into trust, governance, security, and raw detected signals when you need analyst-level detail."
  },
  {
    src: "/images/how-it-works/consent-detail-signals-variant.png",
    alt: "Consent detail signals screenshot variant.",
    title: "Operational consent evidence",
    highlight: "Use dense signal cards to review implementation posture across request paths, controls, and cookies."
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
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">See how the report turns raw scan data into reviewable telemetry.</h2>
            </div>

            <div className="flex min-h-[245px] flex-col rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(255,255,255,1)_100%)] p-4 shadow-none">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Current highlight</p>
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
                className="object-cover object-top"
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
