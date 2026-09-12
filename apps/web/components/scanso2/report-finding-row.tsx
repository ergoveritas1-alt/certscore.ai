"use client";
import { VendorBrandChip } from "./vendor-brand-chip";
import { RegulatoryChecklistCorrectionSteps, RegulatoryChecklistEvidenceDetails } from "./regulatory-checklist-evidence-details";
import type { ShadowEvidenceStatus, ShadowFinding } from "./report-lab/shadow-report-data";
const monoClass = "font-mono tabular-nums";

export function DisclosureChevron({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 transition-transform ${className}`}
      fill="none"
      viewBox="0 0 20 20"
    >
      <path d="m6 8 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
    </svg>
  );
}

function statusClasses(status: ShadowEvidenceStatus) {
  if (status === "Potential gap") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "Partial concern") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "Observed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "Not observed") return "border-zinc-200 bg-zinc-50 text-zinc-700";
  if (status === "Limited") return "border-zinc-300 bg-zinc-100 text-zinc-700";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

export function StatusBadge({ status }: { status: ShadowEvidenceStatus }) {
  const symbol = status === "Observed" ? "✓" : status === "Partial concern" ? "±" : "—";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[0.68rem] font-semibold uppercase ${statusClasses(status)}`}>
      {status === "Potential gap" ? (
        <svg aria-hidden="true" className="h-3 w-3 shrink-0 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3 2 21h20ZM12 9v5m0 3v1" />
        </svg>
      ) : <span aria-hidden="true">{symbol}</span>}
      {status}
    </span>
  );
}

export function JsonEvidence({ value }: { value: Record<string, unknown> }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-zinc-950 p-3 text-[0.68rem] leading-5 text-zinc-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function EvidenceTools({
  canonicalEvidenceJson,
  correctionSteps,
  evidenceRefs,
  evidenceJson,
}: {
  canonicalEvidenceJson?: string;
  correctionSteps: readonly string[];
  evidenceRefs?: string[];
  evidenceJson: Record<string, unknown>;
  stacked?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 border-l border-t border-zinc-200">
      <details className="group/tool border-b border-r border-zinc-200 p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
          JSON evidence
          <DisclosureChevron className="text-zinc-400 group-open/tool:rotate-180" />
        </summary>
        <div className="mt-4">
          {canonicalEvidenceJson ? (
            <RegulatoryChecklistEvidenceDetails evidenceRefs={evidenceRefs} jsonPayload={canonicalEvidenceJson} />
          ) : (
            <JsonEvidence value={evidenceJson} />
          )}
        </div>
      </details>
      {canonicalEvidenceJson ? (
        <details className="group/correction border-b border-r border-zinc-200 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
            Correction steps
            <DisclosureChevron className="text-zinc-400 group-open/correction:rotate-180" />
          </summary>
          <div className="mt-4 [&>details]:!mt-0 [&>details]:!border-0 [&>details]:!bg-transparent [&>details>summary]:hidden">
            <RegulatoryChecklistCorrectionSteps defaultOpen jsonPayload={canonicalEvidenceJson} />
          </div>
        </details>
      ) : (
        <details className="group/tool border-b border-r border-zinc-200 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
            Correction steps
            <DisclosureChevron className="text-zinc-400 group-open/tool:rotate-180" />
          </summary>
          <ol className="mt-4 space-y-2 text-sm leading-6 text-zinc-600">
            {correctionSteps.map((step, index) => (
              <li className="flex gap-3" key={step}>
                <span className={`${monoClass} text-zinc-400`}>{String(index + 1).padStart(2, "0")}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

export function FindingRow({ finding, dense = false, priority = false, pages, idPrefix = "" }: { finding: ShadowFinding; dense?: boolean; priority?: boolean; pages?: Array<{id: string; url: string; homepage: boolean}>; idPrefix?: string }) {
  return (
    <details className={`group border-b border-zinc-200 last:border-b-0 ${priority ? "transition-colors hover:bg-rose-50/40 open:bg-white" : ""}`} id={`${idPrefix}${finding.id}`}>
      <summary className={`grid cursor-pointer list-none gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden ${priority ? "relative grid-cols-[2.25rem_minmax(0,1fr)] items-start px-2 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_auto] sm:items-center sm:px-3" : dense ? "grid-cols-[2rem_minmax(0,1fr)_auto] py-4" : "grid-cols-[2.5rem_minmax(0,1fr)] py-4 sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto]"}`}>
        <span className={`${monoClass} font-semibold ${priority ? "inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-xs text-rose-700" : "text-sm text-zinc-400"}`}>{String(finding.rank).padStart(2, "0")}</span>
        <span className={`min-w-0 ${priority ? "pr-7 sm:pr-0" : ""}`}>
          <span className={`${dense ? "text-sm" : "text-base"} block font-semibold text-zinc-950`}>{finding.title}{pages?.length ? <span className="ml-2 inline-block text-xs font-normal text-zinc-500">{pages.length === 1 && pages[0]?.homepage ? "Homepage" : `${pages.length} ${pages.length === 1 ? "page" : "pages"}`}</span> : null}</span>
          {!dense ? <span className={`${priority ? "mt-0.5 text-xs leading-5 text-zinc-500 sm:pr-4" : "mt-1 text-sm leading-6 text-zinc-600"} overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] group-open:[display:block] group-open:[-webkit-line-clamp:unset]`}>{finding.summary}</span> : null}
          {!dense && !priority ? <span className="mt-3 inline-flex sm:hidden"><StatusBadge status={finding.status} /></span> : null}
        </span>
        {!dense && finding.focus ? <span className={`${priority ? "hidden self-center rounded-md border border-zinc-200 bg-white px-2 py-1 text-[0.65rem] font-semibold uppercase text-zinc-500 lg:block" : "hidden self-start text-xs font-medium text-zinc-500 sm:block"}`}>{finding.focus}</span> : null}
        <span className={priority ? "absolute right-2 top-3 flex items-center gap-2 sm:static" : dense ? "flex items-start gap-2" : "hidden items-start gap-2 sm:flex"}>
          {!dense ? <span className={priority ? "hidden sm:inline-flex" : ""}><StatusBadge status={finding.status} /></span> : null}
          <DisclosureChevron className="mt-1 text-zinc-400 group-open:rotate-180" />
        </span>
      </summary>
      <div className={`${dense ? "pl-0 sm:pl-11" : priority ? "px-3 sm:pl-[4.75rem] sm:pr-4" : "pl-0 sm:pl-12"} pb-6`}>
        {dense ? <p className="mb-3 max-w-3xl text-sm leading-6 text-zinc-600">{finding.summary}</p> : null}
        {pages?.length ? <details className="group/pages mb-4 border-b border-zinc-200 pb-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">Affected pages <DisclosureChevron className="text-zinc-400 group-open/pages:rotate-180" /></summary>
          <ul className="mt-3 max-h-36 space-y-1 overflow-auto text-sm">{pages.map(page => <li key={page.id}><a className="break-all text-sky-700 underline" href={page.url} target="_blank" rel="noreferrer">{page.url}</a>{page.homepage ? " · Homepage" : ""}</li>)}</ul>
        </details> : null}
        {finding.vendors.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {finding.vendors.map((vendor, index) => <VendorBrandChip key={`${vendor}:${index}`} label={vendor} showMeta={false} />)}
          </div>
        ) : null}
        <ul className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
          {finding.evidence.map((item, index) => (
            <li className="border-l-2 border-sky-300 pl-3 leading-6" key={`${item}:${index}`}>{item}</li>
          ))}
        </ul>
        <div className="mt-5"><EvidenceTools correctionSteps={finding.correctionSteps} evidenceJson={finding.evidenceJson} /></div>
      </div>
    </details>
  );
}
