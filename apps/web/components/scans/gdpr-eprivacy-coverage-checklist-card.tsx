import { cn } from "@website-signal-risk-scanner/ui";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import type {
  GdprEprivacyCoverageChecklistItem,
  GdprEprivacyCoverageChecklistStatus
} from "../../lib/scans/gdpr-eprivacy-coverage-checklist";

type GdprEprivacyCoverageChecklistCardProps = {
  defaultOpen?: boolean;
  items: GdprEprivacyCoverageChecklistItem[];
};

function getStatusBadgeClasses(status: GdprEprivacyCoverageChecklistStatus) {
  switch (status) {
    case "Gap observed":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "Review signal":
      return "border-indigo-200 bg-indigo-50 text-indigo-900";
    case "Insufficient evidence":
      return "border-violet-200 bg-violet-50 text-violet-900";
    case "Observed":
      return "border-sky-200 bg-sky-50 text-sky-900";
    case "Not testable":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "Out of scope":
      return "border-slate-200 bg-white text-slate-600";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
}

function getStatusDotClasses(status: GdprEprivacyCoverageChecklistStatus) {
  switch (status) {
    case "Gap observed":
      return "bg-amber-500";
    case "Review signal":
      return "bg-indigo-500";
    case "Insufficient evidence":
      return "bg-violet-500";
    case "Observed":
      return "bg-sky-500";
    case "Not testable":
      return "bg-slate-400";
    case "Out of scope":
      return "bg-slate-200";
    default:
      return "bg-emerald-500";
  }
}

function getStatusSegmentClasses(status: GdprEprivacyCoverageChecklistStatus) {
  switch (status) {
    case "Gap observed":
      return "bg-amber-500";
    case "Review signal":
      return "bg-indigo-500";
    case "Insufficient evidence":
      return "bg-violet-500";
    case "Observed":
      return "bg-sky-500";
    case "Not testable":
      return "bg-slate-400";
    case "Out of scope":
      return "bg-slate-200";
    default:
      return "bg-emerald-500";
  }
}

function getCoverageWeight(status: GdprEprivacyCoverageChecklistStatus) {
  switch (status) {
    case "Insufficient evidence":
      return 0.5;
    case "Not testable":
    case "Out of scope":
      return 0;
    default:
      return 1;
  }
}

const STATUS_ORDER: GdprEprivacyCoverageChecklistStatus[] = [
  "Gap observed",
  "Review signal",
  "Observed",
  "Not observed",
  "Insufficient evidence",
  "Not testable",
  "Out of scope"
];

export function GdprEprivacyCoverageChecklistCard({
  defaultOpen = false,
  items
}: GdprEprivacyCoverageChecklistCardProps) {
  const statusCounts = STATUS_ORDER.map((status) => ({
    count: items.filter((item) => item.status === status).length,
    status
  })).filter((entry) => entry.count > 0);
  const inScopeItems = items.filter((item) => item.status !== "Out of scope");
  const coveredWeight = inScopeItems.reduce((total, item) => total + getCoverageWeight(item.status), 0);
  const coverageScore = inScopeItems.length > 0 ? Math.round((coveredWeight / inScopeItems.length) * 100) : 0;
  const notTestableCount = items.filter((item) => item.status === "Not testable").length;
  const reviewCount = items.filter((item) =>
    item.status === "Gap observed" || item.status === "Review signal" || item.status === "Insufficient evidence"
  ).length;

  return (
    <CollapsibleSectionCard
      defaultOpen={defaultOpen}
      title="GDPR / ePrivacy coverage checklist"
      subtitle="Public-web signals CertScore checked during this scan. Lack of a finding does not necessarily mean compliance; some areas may be not observed, not testable, or out of scope."
      contentClassName="space-y-4"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(13rem,0.45fr)_minmax(0,1fr)]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Evidence coverage</p>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-4xl font-semibold tracking-normal text-slate-950">{coverageScore}</span>
            <span className="pb-1 text-sm font-medium text-slate-500">/ 100</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            {coveredWeight.toFixed(coveredWeight % 1 === 0 ? 0 : 1)} of {inScopeItems.length} in-scope rows have usable automated evidence.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Review items</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{reviewCount}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Not testable</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{notTestableCount}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Rows checked</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{items.length}</p>
            </div>
          </div>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
            {statusCounts.map(({ count, status }) => (
              <div
                key={status}
                className={cn("h-full", getStatusSegmentClasses(status))}
                style={{ width: `${(count / items.length) * 100}%` }}
                title={`${status}: ${count}`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {statusCounts.map(({ count, status }) => (
              <div key={status} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className={cn("h-2 w-2 rounded-full", getStatusDotClasses(status))} />
                <span>{status}</span>
                <span className="font-medium text-slate-950">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)]">
          <span>Coverage area</span>
          <span className="hidden md:block">Scan-context note</span>
        </div>
        <div className="divide-y divide-slate-200">
          {items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-1 gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)]"
            >
              <div className="min-w-0 space-y-2">
                <p className="font-medium text-slate-950">{item.label}</p>
                <span
                  className={cn(
                    "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                    getStatusBadgeClasses(item.status)
                  )}
                >
                  {item.status}
                </span>
                <p className="mt-1 text-xs leading-5 text-slate-500 md:hidden">{item.explanation}</p>
              </div>
              <div className="min-w-0 space-y-1">
                <p className="hidden text-sm leading-6 text-slate-600 md:block">{item.explanation}</p>
                {item.evidenceRefs.length > 0 ? (
                  <p className="text-xs leading-5 text-slate-500">
                    Related projected finding{item.evidenceRefs.length === 1 ? "" : "s"}: {item.evidenceRefs.join(", ")}
                  </p>
                ) : null}
                {item.limitation ? <p className="text-xs leading-5 text-slate-500">{item.limitation}</p> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </CollapsibleSectionCard>
  );
}
