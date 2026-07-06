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
    alt: "CertScore.ai scan report executive summary for sample.site showing score, third-party requests, cookies before consent, signal snapshot, policy surfaces, and scan timeline.",
    title: "Executive summary",
    highlight: "Start with the report-level readout: score, pre-consent activity, consent platform, policy surfaces, and the timeline of observed scan signals."
  },
  {
    src: "/how-it-works/highest-priority-issues.png",
    alt: "Pre-consent cookies and trackers section showing purpose mix, priority mix, vendors, first-seen timing, and the GDPR ePrivacy evidence checklist summary.",
    title: "Pre-consent runtime inventory",
    highlight: "Review the concrete cookies, storage events, vendors, domains, purposes, priorities, and first-seen timing behind the scan summary."
  },
  {
    src: "/how-it-works/detailed-finding-packets.png",
    alt: "GDPR ePrivacy evidence checklist showing rating mix, review summary, consent mechanism row, and expanded evidence packet JSON.",
    title: "GDPR/ePrivacy evidence checklist",
    highlight: "Open checklist rows to see whether consent, policy, transparency, and pre-consent runtime evidence was observed, limited, or flagged for review."
  },
  {
    src: "/how-it-works/operational-context.png",
    alt: "Pre-consent runtime checklist rows showing pre-consent third-party cookies and storage, session replay signal, and device identification or fingerprinting signal status.",
    title: "Runtime checklist context",
    highlight: "Use row-specific notes to understand what was retained before consent, what was not observed, and which evidence packet supports each row."
  },
  {
    src: "/how-it-works/review-lenses.png",
    alt: "Third-party services section showing pre-consent third-party tracking, embedded service connections before consent, evidence packets, and correction steps.",
    title: "Pre-consent service findings",
    highlight: "Move from the inventory into reviewable findings for tracking, embedded services, and concrete remediation steps tied to retained evidence."
  },
  {
    src: "/how-it-works/supporting-analysis.png",
    alt: "Reject decline control finding showing retained evidence that reject was not available on the first layer, JSON packet, and correction steps.",
    title: "Consent-control evidence",
    highlight: "Inspect consent-control rows such as reject or decline availability, with the retained evidence packet and repair guidance in the same view."
  },
  {
    src: "/how-it-works/policy-detail.png",
    alt: "Policy excerpt modal for controller contact disclosure showing retained privacy policy text and highlighted matching evidence.",
    title: "Retained policy excerpts",
    highlight: "Open policy-surface evidence to see the retained source URL, matched disclosure text, and highlighted excerpt captured at scan time."
  },
  {
    src: "/how-it-works/evidence-packets.png",
    alt: "Scan options menu showing run via Lambda, fresh re-scan, and scan-from choices for EU-DE, EU-IR, California, and local extension.",
    title: "Regional scan options",
    highlight: "Choose the scan path and location before rerunning, so evidence can reflect the region and execution mode you want to review."
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
