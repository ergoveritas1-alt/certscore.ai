import React, { type ReactNode } from "react";

export function DisclosureChevron({ className = "" }: { className?: string }) {
  return <svg aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${className}`} fill="none" viewBox="0 0 20 20">
    <path d="m6 8 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
  </svg>;
}

/** Use inside details with group/finding-disclosure; native keyboard behavior stays intact. */
export function FindingDisclosureSummary({ children }: { children: ReactNode }) {
  return <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-medium text-zinc-900 transition-colors hover:text-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden">
    <span className="min-w-0">{children}</span>
    <DisclosureChevron className="text-zinc-500 group-open/finding-disclosure:rotate-180" />
  </summary>;
}
