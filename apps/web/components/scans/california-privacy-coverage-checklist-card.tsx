import { cn } from "@website-signal-risk-scanner/ui";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import { EvidenceJsonBlock } from "./evidence-json-block";
import type {
  CaliforniaPrivacyCoverageChecklistItem,
  CaliforniaPrivacyCoverageChecklistStatus
} from "../../lib/scans/california-privacy-coverage-checklist";

type CaliforniaPrivacyCoverageChecklistCardProps = {
  californiaLens?: {
    ratingLabel: string;
    score: number | null;
    summary?: string;
    toneClass: string;
  } | null;
  defaultOpen?: boolean;
  items: CaliforniaPrivacyCoverageChecklistItem[];
};

function getStatusBadgeClasses(status: CaliforniaPrivacyCoverageChecklistStatus) {
  switch (status) {
    case "Gap observed":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "Review signal":
      return "border-indigo-200 bg-indigo-50 text-indigo-900";
    case "Insufficient evidence":
      return "border-violet-200 bg-violet-50 text-violet-900";
    case "Not testable":
    case "Not applicable":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "Not observed":
      return "border-slate-200 bg-white text-slate-600";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
}

function stringifyEvidenceJson(item: CaliforniaPrivacyCoverageChecklistItem) {
  return JSON.stringify(
    {
      coverageArea: item.label,
      status: item.status,
      ...item.criticalEvidence
    },
    (_key, value) => typeof value === "bigint" ? value.toString() : value,
    2
  );
}

function getDisplayEvidenceRefs(item: CaliforniaPrivacyCoverageChecklistItem) {
  return item.evidenceRefs
    .map((value) => value.replace(/^Evidence flag:\s*/i, "Evidence: ").replace(/[_:]+/g, " ").replace(/\s+/g, " ").trim())
    .slice(0, 6);
}

function getCaliforniaSummary(input: {
  items: CaliforniaPrivacyCoverageChecklistItem[];
  lensSummary?: string;
}) {
  const hasIssues = input.items.some((item) => item.status === "Gap observed" || item.status === "Review signal");
  if (input.lensSummary) {
    return `${input.lensSummary} CertScore reviewed sale/share, targeted advertising, opt-out availability, GPC handling, sensitive personal information controls, and notice alignment using retained public-web evidence.`;
  }
  return hasIssues
    ? "California privacy review signals are centered on sale/share, targeted advertising, opt-out availability, GPC handling, sensitive personal information controls, and notice alignment."
    : "No major California CCPA / CPRA issue surfaced in the top findings. CertScore reviewed public privacy notice availability, opt-out paths, targeted advertising signals, GPC handling, sensitive personal information controls, and runtime vendor disclosure alignment using retained automated evidence.";
}

function getSummaryTitle(input: {
  items: CaliforniaPrivacyCoverageChecklistItem[];
  ratingLabel: string;
  score: number | null;
  toneClass?: string;
}) {
  const ratingBucket = typeof input.score === "number" ? Math.max(0, Math.min(5, input.score / 20)) : 0;
  const gapCount = input.items.filter((item) => item.status === "Gap observed").length;
  const reviewCount = input.items.filter((item) => item.status === "Review signal" || item.status === "Insufficient evidence").length;
  const checkedCount = input.items.filter((item) => item.status === "Checked" || item.status === "Not observed" || item.status === "Not applicable").length;
  const notTestableCount = input.items.filter((item) => item.status === "Not testable").length;
  const statusSummary = [
    { className: "border-rose-200 bg-rose-50 text-rose-700", count: gapCount, label: "gaps" },
    { className: "border-indigo-200 bg-indigo-50 text-indigo-700", count: reviewCount, label: "review" },
    { className: "border-emerald-200 bg-emerald-50 text-emerald-700", count: checkedCount, label: "checked" },
    { className: "border-slate-300 bg-slate-100 text-slate-600", count: notTestableCount, label: "not testable" }
  ].filter((item) => item.count > 0);

  return (
    <div className="grid w-full grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(16rem,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-base font-semibold tracking-normal text-slate-950">California CCPA / CPRA</p>
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold tracking-normal text-slate-950">
            Score: <span className="text-[1.3rem] leading-none">{input.score ?? "—"}</span>
            {typeof input.score === "number" ? <span className="text-[0.8rem] font-medium text-slate-500">/100</span> : null}
          </span>
        </div>
        <span
          className={cn(
            "mt-1.5 inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
            input.toneClass ?? "border-slate-200 bg-slate-50 text-slate-600"
          )}
        >
          {input.ratingLabel}
        </span>
        <div className="mt-2 flex w-full max-w-[11rem] items-center gap-1.5">
          {Array.from({ length: 5 }, (_, index) => {
            const segmentFill = Math.max(0, Math.min(1, ratingBucket - index));
            return (
              <span key={index} className="relative h-2 flex-1 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                <span className={cn("absolute inset-y-0 left-0 rounded-full", input.toneClass ?? "bg-slate-400")} style={{ width: `${segmentFill * 100}%` }} />
              </span>
            );
          })}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2.5 self-center rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2">
        {statusSummary.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.55)]">
            <span className={cn("inline-flex h-2.5 w-2.5 rounded-full border", item.className)} />
            <span className="whitespace-nowrap text-xs font-medium text-slate-600">
              <span className="font-semibold text-slate-950">{item.count}</span> {item.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function CaliforniaPrivacyCoverageChecklistCard({
  californiaLens,
  defaultOpen = true,
  items
}: CaliforniaPrivacyCoverageChecklistCardProps) {
  const score = typeof californiaLens?.score === "number" ? californiaLens.score : null;
  const ratingLabel = californiaLens?.ratingLabel ?? "Not scored";
  const summary = getCaliforniaSummary({ items, lensSummary: californiaLens?.summary });

  return (
    <CollapsibleSectionCard
      defaultOpen={defaultOpen}
      title={getSummaryTitle({ items, ratingLabel, score, toneClass: californiaLens?.toneClass })}
      contentClassName="space-y-4"
    >
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">California CCPA / CPRA review summary</p>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">{summary}</p>
      </section>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)]">
          <span>Coverage area</span>
          <span className="hidden md:block">Scan-context note</span>
        </div>
        <div className="divide-y divide-slate-200">
          {items.map((item) => (
            <div key={item.id} className="grid grid-cols-1 gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)]">
              <div className="min-w-0 space-y-2">
                <p className="font-medium text-slate-950">{item.label}</p>
                <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]", getStatusBadgeClasses(item.status))}>
                  {item.status}
                </span>
                <p className="text-xs leading-5 text-slate-500 md:hidden">{item.limitation}</p>
              </div>
              <div className="min-w-0 space-y-1">
                <p className="hidden text-sm leading-6 text-slate-600 md:block">{item.limitation}</p>
                <details className="mt-2 rounded-md border border-slate-200 bg-white">
                  <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Advanced evidence
                  </summary>
                  {item.evidenceRefs.length > 0 ? (
                    <p className="border-t border-slate-200 px-3 py-2 text-xs leading-5 text-slate-500">
                      Evidence reference{item.evidenceRefs.length === 1 ? "" : "s"}: {getDisplayEvidenceRefs(item).join(", ")}
                    </p>
                  ) : null}
                  <EvidenceJsonBlock payload={stringifyEvidenceJson(item)} className="rounded-none border-t border-slate-800" preClassName="max-h-72 px-3 py-3 pr-12 font-mono text-[11px] leading-5" />
                </details>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Public-web signals CertScore checked during this scan. Results are review aids, not legal advice, certification, or a compliance determination.
      </p>
    </CollapsibleSectionCard>
  );
}
