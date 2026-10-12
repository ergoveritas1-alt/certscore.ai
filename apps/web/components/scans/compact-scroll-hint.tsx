"use client";

import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";

export function CompactScrollHint({ atBottom, onClick, children }: { atBottom: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className="mt-0.5 -ml-1 flex h-6 shrink-0 items-center gap-1 rounded px-1 text-left text-[11px] font-medium leading-4 text-zinc-600 transition-colors hover:bg-sky-100 group-hover/scroll:bg-sky-100 group-hover/scroll:font-semibold group-hover/scroll:text-sky-900 group-focus-within/scroll:bg-sky-100 group-focus-within/scroll:font-semibold group-focus-within/scroll:text-sky-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${atBottom ? "rotate-180" : ""}`}><path d="M10 4v12m-4-4 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    {children}
  </button>;
}

/** Follow actual overflow, including tab changes, expanded rows and responsive wrapping. */
export function TableScrollHint({ scrollRef, noun }: { scrollRef: RefObject<HTMLDivElement | null>; noun: "services" | "resources" }) {
  const [overflowing, setOverflowing] = useState(false);
  const [atBottom, setAtBottom] = useState(false);
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const measure = () => {
      const overflow = root.scrollHeight > root.clientHeight + 1;
      setOverflowing(overflow);
      setAtBottom(overflow && root.scrollTop + root.clientHeight >= root.scrollHeight - 2);
    };
    const resize = new ResizeObserver(measure);
    const observe = () => {
      resize.disconnect();
      resize.observe(root);
      root.querySelectorAll("table").forEach(table => resize.observe(table));
      measure();
    };
    const mutations = new MutationObserver(observe);
    mutations.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "open", "class"] });
    root.addEventListener("scroll", measure, { passive: true });
    observe();
    return () => { resize.disconnect(); mutations.disconnect(); root.removeEventListener("scroll", measure); };
  }, [scrollRef]);
  if (!overflowing) return null;
  return <CompactScrollHint atBottom={atBottom} onClick={() => {
    const root = scrollRef.current;
    if (!root) return;
    root.scrollBy({ top: atBottom ? -root.scrollHeight : root.clientHeight * 0.85,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }}>{atBottom ? `Scroll up to earlier ${noun}.` : `Scroll for more ${noun}.`}</CompactScrollHint>;
}
