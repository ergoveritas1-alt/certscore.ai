"use client";
import React from "react";
import { EvidenceStatusBadge, type EvidenceBadgeTone } from "./evidence-status-badge";
import type { SitePriorityFinding } from "../../lib/scans/full-site-priority-review";
import { VendorBrandChip } from "./vendor-brand-chip";
import { RegulatoryChecklistCorrectionSteps, RegulatoryChecklistEvidenceDetails } from "./regulatory-checklist-evidence-details";
import type { ShadowEvidenceStatus, ShadowFinding } from "./report-lab/shadow-report-data";
import { findingEvidenceAnchor } from "../../lib/scans/report-evidence-navigation";
import { topFindingReaderSummary } from "../../lib/scans/top-finding-reader-summary";
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

export function StatusBadge({ status, priority }: { status: ShadowEvidenceStatus; priority?: "high" }) {
  const label = priority === "high" && status === "Observed" ? "Review" : status;
  const tone: EvidenceBadgeTone = label === "Potential gap" || label === "Review" || status === "Partial concern" ? "review"
    : status === "Limited" || status === "Not confirmed" ? "limited"
    : status === "Observed" ? "positive"
    : status === "Not observed" ? "neutral" : "context";
  return <EvidenceStatusBadge label={label} tone={tone} showIcon={tone !== "review"} />;
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
  showCorrections = true,
}: {
  canonicalEvidenceJson?: string;
  correctionSteps: readonly string[];
  evidenceRefs?: string[];
  evidenceJson: Record<string, unknown>;
  stacked?: boolean;
  showCorrections?: boolean;
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
      {showCorrections && (canonicalEvidenceJson ? (
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
      ))}
    </div>
  );
}

export function FindingRow({ finding, dense = false, priority = false, pages, observations, idPrefix = "" }: { finding: ShadowFinding; dense?: boolean; priority?: boolean; pages?: Array<{id: string; url: string; homepage: boolean}>; observations?: SitePriorityFinding["observations"]; idPrefix?: string }) {
  const evidenceAnchor = findingEvidenceAnchor(finding.id, finding.evidenceJson.presentationGroup);
  const readerSummary = priority ? topFindingReaderSummary(finding) : finding.summary;
  return (
    <details className={`group border-b border-zinc-200 last:border-b-0 ${priority ? "transition-colors hover:bg-zinc-50 open:bg-white" : ""}`} id={`${idPrefix}${finding.id}`}>
      <summary className={`grid cursor-pointer list-none gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden ${priority ? "relative grid-cols-[2.25rem_minmax(0,1fr)] items-start px-2 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_auto] sm:items-center sm:px-3" : dense ? "grid-cols-[2rem_minmax(0,1fr)_auto] py-4" : "grid-cols-[2.5rem_minmax(0,1fr)] py-4 sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto]"}`}>
        <span className={`${monoClass} font-semibold ${priority ? "inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-xs text-zinc-600" : "text-sm text-zinc-400"}`}>{String(finding.rank).padStart(2, "0")}</span>
        <span className={`min-w-0 ${priority ? "pr-7 sm:pr-0" : ""}`}>
          <span className={`${dense ? "text-sm" : "text-base"} block font-semibold text-zinc-950`}>{finding.title}{pages?.length ? <span className="ml-2 inline-block text-xs font-normal text-zinc-500">{pages.length === 1 && pages[0]?.homepage ? "Starting page" : `${pages.length} ${pages.length === 1 ? "page" : "pages"}`}</span> : null}</span>
          {!dense ? <span className={`${priority ? "mt-0.5 text-xs leading-5 text-zinc-500 sm:pr-4" : "mt-1 text-sm leading-6 text-zinc-600"} overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] group-open:[display:block] group-open:[-webkit-line-clamp:unset]`}>{readerSummary}</span> : null}
          {!dense && !priority ? <span className="mt-3 inline-flex sm:hidden"><StatusBadge status={finding.status} priority={finding.priority} /></span> : null}
        </span>
        {!dense && finding.focus ? <span className={`${priority ? "hidden self-center rounded-md border border-zinc-200 bg-white px-2 py-1 text-[0.65rem] font-semibold uppercase text-zinc-500 lg:block" : "hidden self-start text-xs font-medium text-zinc-500 sm:block"}`}>{finding.focus}</span> : null}
        <span className={priority ? "absolute right-2 top-3 flex items-center gap-2 sm:static" : dense ? "flex items-start gap-2" : "hidden items-start gap-2 sm:flex"}>
          {!dense ? <span className={priority ? "hidden sm:inline-flex" : ""}><StatusBadge status={finding.status} priority={finding.priority} /></span> : null}
          <DisclosureChevron className="mt-1 text-zinc-400 group-open:rotate-180" />
        </span>
      </summary>
      <div className={`${dense ? "pl-0 sm:pl-11" : priority ? "px-3 sm:pl-[4.75rem] sm:pr-4" : "pl-0 sm:pl-12"} pb-6`}>
        {dense ? <p className="mb-3 max-w-3xl text-sm leading-6 text-zinc-600">{finding.summary}</p> : null}
        {priority && readerSummary !== finding.summary ? <p className="mb-4 max-w-3xl text-sm leading-6 text-zinc-600"><span className="font-semibold text-zinc-900">Assessment detail: </span>{finding.summary}</p> : null}
        {pages?.length ? <details className="group/pages mb-4 border-b border-zinc-200 pb-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">Affected pages <DisclosureChevron className="text-zinc-400 group-open/pages:rotate-180" /></summary>
          <ul className="mt-3 max-h-36 space-y-1 overflow-auto text-sm">{pages.map(page => <li key={page.id}><a className="break-all text-sky-700 underline" href={page.url} target="_blank" rel="noreferrer">{page.url}</a>{page.homepage ? " · Starting page" : ""}</li>)}</ul>
        </details> : null}
        {observations?.length ? <div className="mb-4 space-y-3">{observations.map(observation => <section key={observation.id} className="border-l-2 border-sky-300 pl-3">
          <h3 className="text-sm font-semibold">{observation.title}</h3><p className="mt-1 text-sm text-zinc-600">{observation.summary}</p>
          <p className="mt-1 text-xs text-zinc-500">{observation.pages.length === 1 && observation.pages[0]?.homepage ? "Starting page only" : observation.pages.length ? `${observation.pages.length} pages with this observation` : "Page attribution unavailable"}</p>
          {observation.pages.length ? <details className="mt-1 text-xs"><summary className="cursor-pointer text-sky-700">Observed pages</summary><ul className="mt-1 max-h-28 overflow-auto break-all">{observation.pages.map(page => <li key={page.id}>{page.url}{page.homepage ? " · Starting page" : ""}</li>)}</ul></details> : null}
        </section>)}</div> : null}
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
        <details className="group/fixes mt-4 border border-b-0 border-zinc-200 p-4" aria-label="Recommended fixes">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
            Recommended fixes
            <DisclosureChevron className="text-zinc-400 group-open/fixes:rotate-180" />
          </summary>
          <div className="mt-4">
            <a className="text-xs font-semibold text-sky-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600" href={`#${evidenceAnchor}`} onClick={event => {
              let target = document.getElementById(evidenceAnchor) ?? document.getElementById("evidence");
              if (!target) return;
              event.preventDefault();
              for (let parent = target.parentElement; parent; parent = parent.parentElement) if (parent.tagName === "DETAILS" && !parent.hasAttribute("open")) target = parent;
              document.querySelectorAll("[data-evidence-target]").forEach(element => element.removeAttribute("data-evidence-target"));
              target.setAttribute("data-evidence-target", "");
              const focus = target.querySelector<HTMLElement>("summary") ?? target;
              focus.setAttribute("tabindex", "-1");
              window.requestAnimationFrame(() => {
                focus.focus({ preventScroll: true });
                target.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
              });
            }}>{finding.evidenceJson.presentationGroup === "accessibility" ? "View accessibility breakdown in Detailed evidence ↓" : "View supporting evidence ↓"}</a>
          {finding.correctionSteps.length ? <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-600">{finding.correctionSteps.map((step, index) => <li key={`${index}:${step}`}>{step}</li>)}</ol> : <p className="mt-4 text-sm text-zinc-600">Review the supporting evidence for this finding.</p>}
          </div>
        </details>
        <EvidenceTools showCorrections={false} correctionSteps={finding.correctionSteps} evidenceJson={finding.evidenceJson} />
      </div>
    </details>
  );
}
