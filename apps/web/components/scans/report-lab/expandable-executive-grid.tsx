"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function ExpandableExecutiveGrid({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const baselineHeightRef = useRef<number | null>(null);
  const expandedRef = useRef(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const overview = root?.querySelector<HTMLElement>("[data-testid='executive-overview-column']");
    if (!root || !overview) return;

    const retainCollapsedHeight = () => {
      if (!expandedRef.current) baselineHeightRef.current = overview.getBoundingClientRect().height;
    };
    retainCollapsedHeight();
    const observer = new ResizeObserver(retainCollapsedHeight);
    observer.observe(overview);

    const retainHeightBeforeSignalToggle = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const summary = target.closest("[data-testid='executive-signal-snapshot'] summary");
      if (!summary || !root.contains(summary)) return;
      const details = summary.closest("details");

      const hasOpenSignal = Boolean(
        root.querySelector("[data-testid='executive-signal-snapshot'] details[open]"),
      );
      if (!hasOpenSignal) {
        baselineHeightRef.current = overview.getBoundingClientRect().height;
      }
      // Prevent ResizeObserver from replacing the collapsed baseline with the
      // expanded grid height before the native toggle event is delivered.
      if (details && !details.open) {
        expandedRef.current = true;
      }
    };

    const handleToggle = () => {
      const hasOpenSignal = Boolean(
        root.querySelector("[data-testid='executive-signal-snapshot'] details[open]"),
      );
      expandedRef.current = hasOpenSignal;
      overview.style.height = hasOpenSignal && baselineHeightRef.current !== null
        ? `${baselineHeightRef.current}px`
        : "";
      setExpanded(hasOpenSignal);
    };
    root.addEventListener("click", retainHeightBeforeSignalToggle, true);
    root.addEventListener("toggle", handleToggle, true);
    return () => {
      observer.disconnect();
      overview.style.height = "";
      root.removeEventListener("click", retainHeightBeforeSignalToggle, true);
      root.removeEventListener("toggle", handleToggle, true);
    };
  }, []);

  return (
    <div
      className="mt-6 grid gap-8 border-t border-zinc-200 pt-6 lg:grid-cols-[minmax(20rem,0.95fr)_minmax(0,1.65fr)] lg:gap-10"
      data-signal-snapshot-expanded={expanded ? "true" : "false"}
      ref={rootRef}
      style={{ alignItems: expanded ? "start" : "stretch" }}
    >
      {children}
    </div>
  );
}
