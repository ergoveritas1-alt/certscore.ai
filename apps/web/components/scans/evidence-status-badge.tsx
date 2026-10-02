import React from "react";

export type EvidenceBadgeTone = "concern" | "review" | "limited" | "positive" | "context" | "neutral";
const tones: Record<EvidenceBadgeTone, string> = {
  concern: "border-rose-200 bg-rose-50 text-rose-800",
  review: "border-amber-200 bg-amber-50 text-amber-900",
  limited: "border-zinc-200 bg-zinc-50 text-zinc-600",
  positive: "border-emerald-200 bg-emerald-50 text-emerald-800",
  context: "border-sky-200 bg-sky-50 text-sky-800",
  neutral: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

/** Shared visual treatment for header and expanded evidence status badges. */
export function EvidenceStatusBadge({ label, tone, description }: { label: string; tone: EvidenceBadgeTone; description?: string }) {
  const warning = tone === "concern" || tone === "review";
  return <span title={description} aria-label={description} className={`inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[10px] font-semibold leading-4 ${tones[tone]}`}>
    <svg aria-hidden="true" className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {warning ? <path d="M12 3 2 21h20ZM12 9v5m0 3v1" /> : tone === "positive" ? <path d="m5 12 4 4L19 6" /> : tone === "neutral" ? <path d="M5 12h14" /> : <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.01" /></>}
    </svg>
    {label}
  </span>;
}
