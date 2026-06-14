"use client";

import { useMemo, useState } from "react";
import type { V2ScanLabCandidateSignal } from "../../../../server/admin/v2-scan-lab-artifacts";

export function V2PriorityIssuesCarousel({
  signals,
}: {
  signals: V2ScanLabCandidateSignal[];
}) {
  const slides = useMemo(() => buildSlides(signals), [signals]);
  const [index, setIndex] = useState(0);
  const activeIndex = slides.length > 0 ? Math.min(index, slides.length - 1) : 0;
  const activeSlide = slides[activeIndex] ?? null;

  const goPrevious = () => {
    if (slides.length <= 1) {
      return;
    }
    setIndex((current) => (current - 1 + slides.length) % slides.length);
  };
  const goNext = () => {
    if (slides.length <= 1) {
      return;
    }
    setIndex((current) => (current + 1) % slides.length);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Top findings</p>
          <h4 className="text-2xl font-semibold tracking-tight text-slate-950 lg:text-[2.2rem]">Highest-priority issues</h4>
        </div>
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
          <CarouselButton disabled={slides.length <= 1} label="Previous top finding" onClick={goPrevious}>
            <ChevronLeftIcon />
          </CarouselButton>
          <span>{slides.length > 0 ? activeIndex + 1 : 0} / {Math.max(slides.length, 1)}</span>
          <CarouselButton disabled={slides.length <= 1} label="Next top finding" onClick={goNext}>
            <ChevronRightIcon />
          </CarouselButton>
        </div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-[1.4rem] border border-rose-100 bg-white shadow-[0_12px_35px_-26px_rgba(15,23,42,0.18)]">
        <div className="h-1 w-full bg-rose-200/80" />
        <div className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <FindingPill>v2 candidate</FindingPill>
            <FindingPill tone="warning">Stub top finding</FindingPill>
            <FindingPill>{activeSlide ? `${activeSlide.confidence} / ${activeSlide.directness}` : "no candidate"}</FindingPill>
            {activeSlide ? <FindingPill>{activeSlide.evidenceGroupCount} groups</FindingPill> : null}
          </div>
          <div className="mt-2.5 flex items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-rose-600">
              <PulseIcon />
            </div>
            <div className="min-w-0">
              <p className="break-words pt-0.5 text-[17px] font-semibold leading-5 tracking-[-0.02em] text-slate-950">
                {activeSlide?.title ?? "Stub: no top finding equivalent available"}
              </p>
              <p className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                {activeSlide?.body ?? "The selected v2 artifact chain did not include a candidate that can be shown in this old-report slot."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildSlides(signals: V2ScanLabCandidateSignal[]) {
  return signals.map((signal) => ({
    body: buildSlideBody(signal),
    confidence: signal.confidence,
    directness: signal.directness,
    evidenceGroupCount: signal.evidenceGroupCount,
    id: signal.id,
    title: formatMachineLabel(signal.family),
  }));
}

function buildSlideBody(signal: V2ScanLabCandidateSignal) {
  const excerpt = signal.topDisplaySafeExcerpts[0];
  const parts = [
    signal.sourceFindingKey,
    `${signal.evidenceGroupCount} grouped evidence preview${signal.evidenceGroupCount === 1 ? "" : "s"}`,
    signal.vendorLabels.length > 0 ? `vendors: ${signal.vendorLabels.slice(0, 3).join(", ")}` : null,
    excerpt ? `example: ${excerpt}` : null,
  ].filter((value): value is string => Boolean(value));
  return parts.join(" · ");
}

function CarouselButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function FindingPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warning" }) {
  const classes = tone === "warning"
    ? "border-rose-200 bg-rose-50 text-rose-800"
    : "border-sky-200 bg-sky-50 text-sky-800";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${classes}`}>
      {children}
    </span>
  );
}

function ChevronLeftIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
      <path d="m12 5-5 5 5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
      <path d="m8 5 5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 20 20">
      <path d="M3 10h3l1.2-3.2 2.1 6.4L11 10h2l1-1.8 1 1.8h2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function formatMachineLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
