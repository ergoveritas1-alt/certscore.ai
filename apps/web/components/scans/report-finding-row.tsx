"use client";
import { formatRetainedReportTiming } from "../../lib/scans/report-time";
import { projectRejectPresenceDetails, factualCustomerEvidence } from "../../lib/scans/reject-presence-details";
import React, { useRef, type ReactNode } from "react";
import { EvidenceStatusBadge, type EvidenceBadgeTone } from "./evidence-status-badge";
import type { SitePriorityFinding } from "../../lib/scans/full-site-priority-review";
import { VendorBrandChip } from "./vendor-brand-chip";
import { RegulatoryChecklistCorrectionSteps, RegulatoryChecklistEvidenceDetails, hasRegulatoryChecklistCorrectionSteps } from "./regulatory-checklist-evidence-details";
import type { ShadowEvidenceStatus, ShadowFinding } from "./report-lab/shadow-report-data";
import { EvidenceJumpLink } from "./evidence-jump-link";
import { findingEvidenceAnchor } from "../../lib/scans/report-evidence-navigation";
import { topFindingReaderSummary, topFindingWhyItMatters } from "../../lib/scans/top-finding-reader-summary";
import { ENFORCEMENT_REVIEWED_AT, regulatoryReviewContext } from "../../lib/scans/regulatory-review-catalog";
import type { ReportReviewFocus } from "@certscore/api-contracts";
import { FindingApplicabilityNote } from "./finding-applicability-note";
import { DisclosureChevron, FindingDisclosureSummary } from "./finding-disclosure-summary";
import { findingApplicabilityContext } from "../../lib/scans/finding-applicability-context";
import { accessibilityFindingReferences, regulatoryFindingReferences } from "../../lib/scans/finding-references";
import { FindingReferenceLine, FindingReferenceSource } from "./finding-reference-line";
const monoClass = "font-mono tabular-nums";

export { DisclosureChevron } from "./finding-disclosure-summary";

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
      {JSON.stringify(factualCustomerEvidence(value), null, 2)}
    </pre>
  );
}

export function EvidenceToolDisclosure({ label, children }: { label: string; children: ReactNode }) {
  return <details className="group/evidence-tool min-w-0 max-w-full open:basis-full" aria-label={label}>
    <summary className="inline-flex h-7 !min-h-0 w-fit cursor-pointer list-none items-center gap-1.5 whitespace-nowrap rounded-md border border-sky-200 bg-white px-2.5 text-xs font-medium leading-5 text-sky-800 transition-colors hover:border-sky-300 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 group-open/evidence-tool:bg-sky-50 group-open/evidence-tool:text-sky-800 [&::-webkit-details-marker]:hidden">
      <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-sky-700 group-open/evidence-tool:text-sky-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d={label === "JSON evidence" ? "m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16" : "M14.5 6.5a5 5 0 0 0-6.8 6.8L3 18a2.1 2.1 0 0 0 3 3l4.7-4.7a5 5 0 0 0 6.8-6.8L14 13l-3-3 3.5-3.5Z"} />
      </svg>
      {label}<DisclosureChevron className="!h-3.5 !w-3.5 text-sky-700 group-open/evidence-tool:rotate-180 group-open/evidence-tool:text-sky-600" />
    </summary>
    <div className="mt-3 min-w-0 border-l-2 border-sky-100 pl-3">{children}</div>
  </details>;
}

export function EvidenceTools({
  canonicalEvidenceJson,
  correctionSteps,
  evidenceRefs,
  evidenceJson,
  showCorrections = true,
  recommendedFixes,
}: {
  canonicalEvidenceJson?: string;
  correctionSteps: readonly string[];
  evidenceRefs?: string[];
  evidenceJson: Record<string, unknown>;
  stacked?: boolean;
  showCorrections?: boolean;
  recommendedFixes?: ReactNode;
}) {
  const observations = projectRejectPresenceDetails(evidenceJson);
  const gpcFacts=Array.isArray(evidenceJson.combinedGpcFacts)?evidenceJson.combinedGpcFacts.flatMap(row=>
    row && typeof row==="object" && typeof row.label==="string" && typeof row.value==="string"?[{label:row.label as string,value:row.value as string}]:[]):[];
  const gpcVendors=Array.isArray(evidenceJson.combinedGpcVendors)?evidenceJson.combinedGpcVendors.filter((v):v is string=>typeof v==="string"):[];
  let factualJson = canonicalEvidenceJson;
  if (canonicalEvidenceJson) {
    try { factualJson = JSON.stringify(factualCustomerEvidence(JSON.parse(canonicalEvidenceJson))); } catch { /* Preserve malformed historical diagnostics. */ }
  }
  const steps = correctionSteps.filter(step => step.trim().length > 0);
  const hasCorrections = showCorrections && (canonicalEvidenceJson
    ? hasRegulatoryChecklistCorrectionSteps(canonicalEvidenceJson) : steps.length > 0);
  return (
    <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-3">
      {gpcFacts.length ? <EvidenceToolDisclosure label="GPC evidence · …">
        <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
          {gpcFacts.map((fact,index)=><React.Fragment key={`${fact.label}:${index}`}><dt className="font-medium text-zinc-800">{fact.label}</dt><dd className="text-zinc-600">{fact.value}</dd></React.Fragment>)}
        </dl>
        {gpcVendors.length?<ul className="mt-3 space-y-1 text-xs text-zinc-600">{gpcVendors.map(v=><li key={v}>{v}</li>)}</ul>:null}
      </EvidenceToolDisclosure>:null}
      {observations.length ? <div className="w-full min-w-0 space-y-2" data-reject-entity-observations>
        <p className="text-xs text-zinc-600">Non-essential entities and observations after the Reject click. Cookie times describe snapshot presence; request times describe request start.</p>
        <div className="max-h-96 overflow-auto"><table className="w-full text-left text-xs">
          <caption className="sr-only">Non-essential observations after Reject</caption>
          <thead><tr>{["Entity / service", "Evidence", "Purpose", "After Reject click"].map(label => <th key={label} scope="col" className="p-2 align-top">{label}</th>)}</tr></thead>
          <tbody>{observations.map((row, index) => <tr key={`${row.evidenceRef}:${index}`} className="border-t border-zinc-200">
            <td className="p-2 align-top">{row.entity ?? "Entity not attributed"}{row.vendor ? <span className="block text-zinc-500">{row.vendor}</span> : null}</td>
            <td className="max-w-sm break-all p-2 align-top">{row.kind === "cookie_snapshot" ? "Cookie: " : "Request: "}{row.name}{row.hostname ? <span className="block text-zinc-500">{row.hostname}</span> : null}<span className="block text-zinc-500">{row.evidenceRef}</span></td>
            <td className="p-2 align-top">{row.purpose.replace(/_/g, " ")}</td>
            <td className="whitespace-nowrap p-2 align-top">{row.kind === "cookie_snapshot" ? "Snapshot" : "Request start"} +{row.msAfterClick} ms</td>
          </tr>)}</tbody>
        </table></div>
        <p className="text-xs text-zinc-500">Cookie presence does not establish a new write or active use. Clicking Reject does not by itself verify refusal registration.</p>
      </div> : null}
      {recommendedFixes ? <EvidenceToolDisclosure label="Recommended fixes">{recommendedFixes}</EvidenceToolDisclosure> : null}
      <EvidenceToolDisclosure label="JSON evidence">
        {canonicalEvidenceJson ? (
          <RegulatoryChecklistEvidenceDetails evidenceRefs={evidenceRefs} jsonPayload={factualJson!} />
        ) : (
          <JsonEvidence value={evidenceJson} />
        )}
      </EvidenceToolDisclosure>
      {hasCorrections && (canonicalEvidenceJson ? (
        <EvidenceToolDisclosure label="Correction steps">
          <div className="[&>details]:!mt-0 [&>details]:!border-0 [&>details]:!bg-transparent [&>details>summary]:hidden">
            <RegulatoryChecklistCorrectionSteps defaultOpen jsonPayload={factualJson!} />
          </div>
        </EvidenceToolDisclosure>
      ) : (
        <EvidenceToolDisclosure label="Correction steps">
          <ol className="space-y-2 text-sm leading-6 text-zinc-600">
            {steps.map((step, index) => (
              <li className="flex gap-3" key={step}>
                <span className={`${monoClass} text-zinc-400`}>{String(index + 1).padStart(2, "0")}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </EvidenceToolDisclosure>
      ))}
    </div>
  );
}

export function FindingRow({ finding, dense = false, priority = false, pages, observations, idPrefix = "", reviewFocus = "gdpr_eprivacy" }: { reviewFocus?: ReportReviewFocus; finding: ShadowFinding; dense?: boolean; priority?: boolean; pages?: Array<{id: string; url: string; homepage: boolean}>; observations?: SitePriorityFinding["observations"]; idPrefix?: string }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const combinedOptOut = finding.id === "california_privacy_choice_not_observed" && Boolean(finding.evidenceJson.combinedGpcAssessment);
  const context = priority ? regulatoryReviewContext(finding.id, reviewFocus, combinedOptOut) : null;
  const applicability = priority ? findingApplicabilityContext(finding.id, reviewFocus, finding.evidenceJson.presentationGroup) : null;
  const mappedReferences = context ? regulatoryFindingReferences(context.rule) : [];
  const regulatoryReferences = !mappedReferences.length && applicability?.citationRule
    ? regulatoryFindingReferences(applicability.citationRule) : mappedReferences;
  const references = regulatoryReferences.length || !priority
    ? regulatoryReferences : accessibilityFindingReferences(finding.id, finding.evidenceJson);
  const evidenceAnchor = findingEvidenceAnchor(finding.id, finding.evidenceJson.presentationGroup);
  const readerSummary = priority || finding.id === "gpc_response" ? topFindingReaderSummary(finding) : finding.summary;
  const why = context?.why ?? (priority ? topFindingWhyItMatters(finding) : null);
  const id = `${idPrefix}${finding.id}`;
  const rank = String(finding.rank).padStart(2, "0");
  const badge = <StatusBadge status={finding.status} priority={finding.priority} />;
  const detailsContent = (
      <div className={`${dense ? "pl-0 sm:pl-11" : priority ? "px-3 sm:pl-16 sm:pr-4" : "pl-0 sm:pl-12"} pb-6`}>
        {dense ? <p className="mb-3 max-w-3xl text-sm leading-6 text-zinc-600">{formatRetainedReportTiming(readerSummary)}</p> : null}
        {priority && finding.id !== "gpc_response" && readerSummary !== finding.summary ? <p className="mb-4 max-w-3xl text-sm leading-6 text-zinc-600"><span className="font-semibold text-zinc-900">Assessment detail: </span>{formatRetainedReportTiming(finding.summary)}</p> : null}
        {priority || pages?.length ? <div className="mb-4 divide-y divide-zinc-200 border-y border-zinc-200">
          {priority ? <FindingApplicabilityNote findingId={finding.id} reviewFocus={reviewFocus} presentationGroup={finding.evidenceJson.presentationGroup} /> : null}
          {context && !mappedReferences.length ? <p className="py-2"><a href={context.ruleUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-sky-800 underline underline-offset-2">Related guidance · {context.rule} ↗</a></p> : null}
          {references.length > 2 ? <details className="group/finding-disclosure">
            <FindingDisclosureSummary>Additional references</FindingDisclosureSummary>
            <ul className="space-y-3 pb-4 pt-1 text-xs leading-5 text-zinc-700">{references.slice(2).map(reference => <li key={reference.label}>
              <p className="font-semibold text-zinc-950">{reference.label}</p>
              <p>{reference.explanation}</p>
              <FindingReferenceSource reference={reference} />
            </li>)}</ul>
          </details> : null}
          {context?.examples.length ? <details className="group/finding-disclosure">
            <FindingDisclosureSummary>Related enforcement</FindingDisclosureSummary>
            <div className="space-y-4 pb-4 pt-1">{context.examples.map(example => <article key={example.id}>
              <p className="text-sm font-semibold">{example.name} <span className="font-normal text-zinc-500">· {example.date.slice(0, 4)}</span></p>
              <p className="mt-1 text-xs text-zinc-500">{example.authority}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-700">{example.conduct}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-700">{example.outcome}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600"><span className="font-medium">Connection to this finding: </span>{example.relevance}</p>
              <a className="mt-2 inline-block text-xs text-sky-800 underline underline-offset-2" href={example.url} target="_blank" rel="noreferrer">Read the official case ↗</a>
            </article>)}<p className="text-xs text-zinc-500">Examples reviewed {ENFORCEMENT_REVIEWED_AT}.</p></div>
          </details> : null}
          {pages?.length ? <details className="group/finding-disclosure">
            <FindingDisclosureSummary>Affected pages</FindingDisclosureSummary>
            <ul className="max-h-36 space-y-1 overflow-auto pb-4 pt-1 text-sm">{pages.map(page => <li key={page.id}><a className="break-all text-sky-700 underline" href={page.url} target="_blank" rel="noreferrer">{page.url}</a>{page.homepage ? " · Starting page" : ""}</li>)}</ul>
          </details> : null}
        </div> : null}
        {observations?.length ? <div className="mb-4 space-y-3">{observations.map(observation => <section key={observation.id} className="border-l-2 border-sky-300 pl-3">
          <h3 className="text-sm font-semibold">{observation.title}</h3><p className="mt-1 text-sm text-zinc-600">{formatRetainedReportTiming(observation.summary)}</p>
          <p className="mt-1 text-xs text-zinc-500">{observation.pages.length === 1 && observation.pages[0]?.homepage ? "Starting page only" : observation.pages.length ? `${observation.pages.length} pages with this observation` : "Page attribution unavailable"}</p>
          {observation.pages.length ? <details className="group/finding-disclosure mt-2 text-xs"><FindingDisclosureSummary>Observed pages</FindingDisclosureSummary><ul className="mt-1 max-h-28 overflow-auto break-all">{observation.pages.map(page => <li key={page.id}>{page.url}{page.homepage ? " · Starting page" : ""}</li>)}</ul></details> : null}
        </section>)}</div> : null}
        {finding.vendors.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {finding.vendors.map((vendor, index) => <VendorBrandChip key={`${vendor}:${index}`} label={vendor} showMeta={false} />)}
          </div>
        ) : null}
        <ul className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
          {finding.evidence.map((item, index) => (
            <li className="border-l-2 border-sky-300 pl-3 leading-6" key={`${item}:${index}`}>{formatRetainedReportTiming(item)}</li>
          ))}
        </ul>
        <div className="mt-4"><EvidenceTools showCorrections={false} correctionSteps={finding.correctionSteps} evidenceJson={finding.evidenceJson} recommendedFixes={<>
            <EvidenceJumpLink targetId={evidenceAnchor} className="text-xs">{finding.evidenceJson.presentationGroup === "accessibility" ? "View accessibility breakdown in Detailed evidence ↓" : "View supporting evidence ↓"}</EvidenceJumpLink>
          {finding.correctionSteps.length ? <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-600">{finding.correctionSteps.map((step, index) => <li key={`${index}:${step}`}>{step}</li>)}</ol> : <p className="mt-4 text-sm text-zinc-600">Review the supporting evidence for this finding.</p>}
        </>} /></div>
      </div>
  );

  if (priority) return <article id={id} className="group/priority-finding relative cursor-pointer border-b border-zinc-200 transition-colors last:border-b-0 hover:bg-zinc-50 has-[>details[open]]:bg-white"
    onClick={event => {
      const { currentTarget, target } = event;
      if (event.defaultPrevented || !(target instanceof Element) || !currentTarget.contains(target)) return;
      const control = target.closest("a, button, summary, input, label, select, textarea, [popover], [contenteditable], [role=button], [role=link]");
      if (control && currentTarget.contains(control)) return;
      const selection = currentTarget.ownerDocument.getSelection();
      if (selection && !selection.isCollapsed && selection.containsNode(currentTarget, true)) return;
      const details = detailsRef.current;
      if (details) details.open = !details.open;
    }}>
    <div data-finding-header className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-3 px-2 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:pl-3 sm:pr-14">
      <span className={`${monoClass} inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-600`}>{rank}</span>
      <div className="min-w-0">
        <h3 className="pr-10 text-base font-semibold text-zinc-950 sm:pr-0">{finding.title}</h3>
        <FindingReferenceLine references={references.slice(0, 2)} scope={applicability?.scopeCheck ?? ""} />
        {!dense ? <p className="mt-0.5 line-clamp-3 text-xs leading-5 text-zinc-600 group-has-[>details[open]]/priority-finding:line-clamp-none">{formatRetainedReportTiming(readerSummary)}</p> : null}
        {why ? <p className={`mt-1 max-w-3xl text-zinc-700 ${combinedOptOut ? "text-xs leading-5" : "text-sm leading-5"}`}><span className="font-semibold text-zinc-900">Why it matters: </span>{why}</p> : null}
        {!dense ? <span className="mt-2 inline-flex sm:hidden">{badge}</span> : null}
      </div>
      {!dense ? <div className="hidden items-start gap-2 sm:flex">
        {finding.focus ? <span className="hidden rounded-md border border-zinc-200 bg-white px-2 py-1 text-[0.65rem] font-semibold uppercase text-zinc-500 lg:block">{finding.focus}</span> : null}
        {badge}
      </div> : null}
    </div>
    <details ref={detailsRef} className="group/finding-details">
      <summary className="absolute right-2 top-2 inline-flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 sm:right-3 [&::-webkit-details-marker]:hidden">
        <span className="sr-only"><span className="group-open/finding-details:hidden">Show details</span><span className="hidden group-open/finding-details:inline">Hide details</span></span>
        <DisclosureChevron className="group-open/finding-details:rotate-180" />
      </summary>
      {detailsContent}
    </details>
  </article>;

  return <details className="group border-b border-zinc-200 last:border-b-0" id={id}>
    <summary className={`grid cursor-pointer list-none gap-3 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden ${dense ? "grid-cols-[2rem_minmax(0,1fr)_auto]" : "grid-cols-[2.5rem_minmax(0,1fr)] sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto]"}`}>
      <span className={`${monoClass} text-sm font-semibold text-zinc-400`}>{rank}</span>
      <span className="min-w-0">
        <span className={`${dense ? "text-sm" : "text-base"} block font-semibold text-zinc-950`}>{finding.title}</span>
        {!dense ? <span className="mt-1 line-clamp-3 text-sm leading-6 text-zinc-600 group-open:line-clamp-none">{formatRetainedReportTiming(readerSummary)}</span> : null}
        {!dense ? <span className="mt-3 inline-flex sm:hidden">{badge}</span> : null}
      </span>
      {!dense && finding.focus ? <span className="hidden self-start text-xs font-medium text-zinc-500 sm:block">{finding.focus}</span> : null}
      <span className={dense ? "flex items-start gap-2" : "hidden items-start gap-2 sm:flex"}>
        {!dense ? badge : null}
        <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-sky-800">
          <span aria-hidden="true" className="hidden text-xs font-medium sm:inline"><span className="group-open:hidden">Show details</span><span className="hidden group-open:inline">Hide details</span></span>
          <DisclosureChevron className="group-open:rotate-180" />
        </span>
      </span>
    </summary>
    {detailsContent}
  </details>;
}
