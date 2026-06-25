"use client";

import React from "react";

export function ExecutiveTopFindingsCarousel({
  children,
  count,
  heading
}: {
  children: React.ReactNode;
  count: number;
  heading: string;
}) {
  const items = React.Children.toArray(children);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const safeCount = Math.max(0, Math.min(count, items.length));
  const boundedActiveIndex = Math.min(activeIndex, Math.max(0, safeCount - 1));
  const normalizedHeading = heading.replace("Highest-priority", "High-priority");
  const displayHeading = safeCount > 1
    ? normalizedHeading === "Issues to review"
      ? `${safeCount} issues to review`
      : `${safeCount} high-priority issues`
    : normalizedHeading;

  const goPrevious = () => {
    setActiveIndex((current) => (current - 1 + safeCount) % safeCount);
  };

  const goNext = () => {
    setActiveIndex((current) => (current + 1) % safeCount);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Top findings</p>
          <h2 data-testid="executive-findings-heading" className="text-[1.3rem] font-semibold tracking-tight text-slate-950 lg:text-[1.87rem]">
            {displayHeading}
          </h2>
        </div>
        {safeCount > 1 ? (
          <div className="flex items-center gap-2 rounded-full bg-slate-100 px-2 py-1">
            <button
              type="button"
              aria-label="Previous top finding"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-semibold text-slate-600 shadow-sm transition hover:border-sky-200 hover:text-sky-700"
              onClick={goPrevious}
            >
              ‹
            </button>
            <span className="hidden whitespace-nowrap px-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 sm:inline">
              {activeIndex + 1} / {safeCount}
            </span>
            <button
              type="button"
              aria-label="Next top finding"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-semibold text-slate-600 shadow-sm transition hover:border-sky-200 hover:text-sky-700"
              onClick={goNext}
            >
              ›
            </button>
          </div>
        ) : null}
      </div>
      <div className="min-w-0" data-executive-top-finding-carousel-active>
        {items.slice(0, safeCount).map((item, index) => (
          <div
            key={index}
            aria-hidden={index === boundedActiveIndex ? undefined : true}
            className={index === boundedActiveIndex ? undefined : "hidden"}
            data-executive-top-finding-carousel-item={index === boundedActiveIndex ? "active" : "inactive"}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
