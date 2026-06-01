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
    case "Observed":
    case "Insufficient evidence":
      return "border-sky-200 bg-sky-50 text-sky-900";
    case "Not testable":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "Out of scope":
      return "border-slate-200 bg-white text-slate-600";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
}

export function GdprEprivacyCoverageChecklistCard({
  defaultOpen = false,
  items
}: GdprEprivacyCoverageChecklistCardProps) {
  return (
    <CollapsibleSectionCard
      defaultOpen={defaultOpen}
      title="GDPR / ePrivacy coverage checklist"
      subtitle="Public-web signals CertScore checked during this scan. Lack of a finding does not necessarily mean compliance; some areas may be not observed, not testable, or out of scope."
      contentClassName="space-y-4"
    >
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid-cols-[minmax(13rem,0.8fr)_minmax(8rem,auto)_minmax(0,1.5fr)]">
          <span>Coverage area</span>
          <span>Status</span>
          <span className="hidden md:block">Scan-context note</span>
        </div>
        <div className="divide-y divide-slate-200">
          {items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(13rem,0.8fr)_minmax(8rem,auto)_minmax(0,1.5fr)]"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-950">{item.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500 md:hidden">{item.explanation}</p>
              </div>
              <div>
                <span
                  className={cn(
                    "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                    getStatusBadgeClasses(item.status)
                  )}
                >
                  {item.status}
                </span>
              </div>
              <div className="col-span-2 min-w-0 space-y-1 md:col-span-1">
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
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
        Checklist results are based on automated public-web observations in this scan context. They are provided for review and do not constitute legal advice, certification, or a GDPR compliance determination.
      </p>
    </CollapsibleSectionCard>
  );
}
