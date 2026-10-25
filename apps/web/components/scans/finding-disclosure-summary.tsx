import React, { type ReactNode } from "react";

/** Use inside details with group/finding-disclosure; native keyboard behavior stays intact. */
export function FindingDisclosureSummary({ children }: { children: ReactNode }) {
  return <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-md border border-sky-200 bg-white/80 px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors hover:border-sky-300 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 group-open/finding-disclosure:bg-sky-50 [&::-webkit-details-marker]:hidden">
    <span aria-hidden="true" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-sky-200 bg-sky-50 text-sky-800">
      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
        <path d="M3 8h10" /><path className="group-open/finding-disclosure:hidden" d="M8 3v10" />
      </svg>
    </span>
    <span className="min-w-0 flex-1">{children}</span>
    <span aria-hidden="true" className="hidden shrink-0 text-xs font-medium text-sky-800 sm:inline">
      <span className="group-open/finding-disclosure:hidden">Show details</span>
      <span className="hidden group-open/finding-disclosure:inline">Hide details</span>
    </span>
  </summary>;
}
