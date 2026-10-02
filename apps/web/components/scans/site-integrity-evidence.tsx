"use client";
import React, { createContext, useContext, useState } from "react";
import { siteIntegrityScoreDescription } from "../../lib/scans/site-integrity-score-policy";
import { summarizeSiteIntegrityLinks, type SiteIntegrityReportFinding, type SiteIntegritySiteReport } from "../../lib/scans/site-integrity-report";
import { EvidenceHeaderStatus } from "./evidence-header-status";
import { DisclosureChevron } from "./report-finding-row";
import { reportCardTitle } from "./report-typography";

export function SiteIntegrityCallout({ finding }: { finding?: SiteIntegrityReportFinding | null }) {
  if (!finding) return null;
  return <aside aria-label="Site integrity review" className="my-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
    <p className="text-xs font-semibold uppercase text-amber-900">Site integrity · High priority</p>
    <p className="mt-1 font-semibold text-zinc-900">{finding.title}</p>
    <p className="mt-1 text-sm text-zinc-700">{finding.summary}</p>
    <a className="mt-2 inline-block text-sm font-medium text-sky-800 underline" href="#site-integrity-evidence">Review retained evidence</a>
  </aside>;
}

const concealmentLabels = {
  offscreen_position: "Positioned far off-screen",
  zero_size_container: "Zero-size container with clipped overflow",
  zero_font_size: "Zero-size text",
};

export const SiteIntegritySiteContext = createContext<SiteIntegritySiteReport | null>(null);

type DestinationGroup = { domain: string; count: number; methods: Set<keyof typeof concealmentLabels>; pages: Map<string, { finding: SiteIntegrityReportFinding; count: number }> };

function pageLabel(url: string) {
  try { const path = decodeURIComponent(new URL(url).pathname); return path === "/" ? "Starting page" : path; }
  catch { return url; }
}

function groupDestinations(findings: SiteIntegrityReportFinding[]) {
  const groups = new Map<string, DestinationGroup>();
  for (const finding of findings) {
    const observation = finding.evidence.observation;
    for (const link of observation.links) {
      const group = groups.get(link.destinationDomain) ?? { domain: link.destinationDomain, count: 0, methods: new Set(), pages: new Map() };
      group.count++;
      group.methods.add(link.concealment);
      const page = group.pages.get(observation.documentUrl) ?? { finding, count: 0 };
      page.count++;
      group.pages.set(observation.documentUrl, page);
      groups.set(group.domain, group);
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
}

export function SiteIntegrityEvidence({ finding, sampleNotice }: { finding?: SiteIntegrityReportFinding | null; sampleNotice?: string }) {
  const site = useContext(SiteIntegritySiteContext);
  const [view, setView] = useState<"destinations" | "pages">("destinations");
  if (!site && !finding) return null;
  const report: SiteIntegritySiteReport = site ?? { findings: [finding!], coverage: [{ pageId: "homepage", url: finding!.evidence.observation.documentUrl, homepage: true, status: finding!.evidence.observation.truncated ? "limited" : "captured" }] };
  if (!report.findings.length) return null;
  const findings = [...new Map(report.findings.map(item => [item.evidence.observation.documentUrl, item])).values()];
  const destinations = groupDestinations(findings);
  const totals = summarizeSiteIntegrityLinks(report);
  const captured = report.coverage.filter(page => page.status !== "unavailable").length;
  const limited = report.coverage.filter(page => page.status === "limited").length;
  const high = findings.some(item => item.severity === "high");
  return <section id="site-integrity-evidence" aria-label="Site integrity" className="border-b border-r border-zinc-200 bg-white">
    <details className="group/site-integrity">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden">
        <div><p className="text-xs font-semibold uppercase text-zinc-500">Site integrity</p>
          <h3 title="Hidden outbound links" className={`mt-1 ${reportCardTitle}`}>Hidden links</h3>
        </div>
        <span className="flex shrink-0 items-center gap-3">
          {findings.length ? <EvidenceHeaderStatus rows={[{status: "Partial concern", priority: high ? "high" : undefined}]} /> : null}
          <DisclosureChevron className="text-zinc-400 group-open/site-integrity:rotate-180" />
        </span>
      </summary>
    <div className="grid grid-cols-3 divide-x divide-zinc-200 border-y border-zinc-200 bg-zinc-50/60">
      {[{ label: "Link occurrences", value: totals.count === null ? "—" : `${totals.lowerBound ? "≥" : ""}${totals.count}` }, { label: "Affected pages", value: findings.length }, { label: "Destination domains", value: destinations.length }].map(metric => <div key={metric.label} className="px-4 py-3 sm:px-5"><p className="text-xl font-semibold tabular-nums text-zinc-950">{metric.value}</p><p className="mt-0.5 text-xs text-zinc-500">{metric.label}</p></div>)}
    </div>
    <div className="px-4 py-4 sm:px-5">
      <p className="mb-3 text-xs text-zinc-500">{siteIntegrityScoreDescription(findings.flatMap(item => item.scoreEffects ?? []))}</p>
      {sampleNotice ? <p className="mb-3 rounded-md bg-zinc-50 p-3 text-xs text-zinc-600">Sample data · {sampleNotice}</p> : null}
      <p className="text-sm leading-6 text-zinc-700">{findings.length ? "Links were hidden using off-screen positioning or zero-size styling. Review the destinations and affected pages to confirm whether the links belong on the site." : "No policy-eligible hidden-link finding is available in the retained evidence."}</p>
      {findings.length ? <>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3">
          <div role="group" aria-label="Site integrity view" className="inline-flex rounded-lg bg-zinc-100 p-1">
            {(["destinations", "pages"] as const).map(tab => <button key={tab} type="button" aria-pressed={view === tab} onClick={() => setView(tab)} className={`rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 ${view === tab ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"}`}>{tab === "destinations" ? `Destinations (${destinations.length})` : `Affected pages (${findings.length})`}</button>)}
          </div>
          <span className="text-xs text-zinc-500">{view === "destinations" ? "Expand a destination to see its pages" : "Expand a page to inspect its evidence"}</span>
        </div>
        {view === "destinations" ? <div className="divide-y divide-zinc-200">{destinations.map(group => <details key={group.domain} className="group/destination">
          <summary className="flex cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
            <DisclosureChevron className="text-zinc-400 group-open/destination:rotate-180" />
            <span className="min-w-0 flex-1"><span className="block break-all text-sm font-semibold text-zinc-900">{group.domain}</span><span className="mt-1 block text-xs leading-5 text-zinc-500">{[...group.methods].map(method => concealmentLabels[method]).join(" · ")}</span></span>
            <span className="shrink-0 text-right"><span className="block text-sm font-semibold tabular-nums text-zinc-900">{group.count} {group.count === 1 ? "link" : "links"}</span><span className="text-xs text-zinc-500">{group.pages.size} {group.pages.size === 1 ? "page" : "pages"}</span></span>
          </summary>
          <ul className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50/50 px-3">{[...group.pages.values()].map(page => <li key={page.finding.evidence.observation.documentUrl} className="border-b border-zinc-200 py-2.5 text-xs last:border-0"><div className="flex items-start justify-between gap-4"><span title={page.finding.evidence.observation.documentUrl} className="min-w-0 break-all text-zinc-700">{pageLabel(page.finding.evidence.observation.documentUrl)}</span><span className="shrink-0 tabular-nums text-zinc-500">{page.count} {page.count === 1 ? "link" : "links"}</span></div><HiddenLinkCodeEvidence finding={page.finding} domain={group.domain} /></li>)}</ul>
        </details>)}</div> : <div className="divide-y divide-zinc-200">{findings.map(item => <PageIntegrityEvidence key={item.evidence.observation.documentUrl} finding={item} />)}</div>}
      </> : null}
      <details className="group/coverage mt-4 border-t border-zinc-200 pt-3 text-xs text-zinc-500">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden"><span>Capture coverage · {captured} of {report.coverage.length} pages{limited ? ` · ${limited} limited` : ""}</span><DisclosureChevron className="group-open/coverage:rotate-180" /></summary>
        <p className="mt-3 leading-5">Capture retained for {captured} of {report.coverage.length} scanned pages. {limited ? `${limited} ${limited === 1 ? "capture was" : "captures were"} limited. ` : ""}{report.coverage.length > captured ? `${report.coverage.length - captured} ${report.coverage.length - captured === 1 ? "page has" : "pages have"} unavailable evidence. ` : ""}Coverage follows the scan’s page limit and excludes unvisited pages.</p>
        <ul className="mt-2 divide-y divide-zinc-100">{report.coverage.map(page => <li key={page.pageId} className="flex items-start justify-between gap-3 py-2"><span className="min-w-0 break-all" title={page.url}>{pageLabel(page.url)}</span><span className="shrink-0">{page.status === "captured" ? "Retained" : page.status === "limited" ? "Limited" : "Unavailable"}</span></li>)}</ul>
      </details>
      <p className="mt-3 text-xs leading-5 text-zinc-500">Counts include occurrences on different pages. Concealment alone does not establish compromise or personal-data disclosure. Destination pages were not opened.</p>
    </div>
    </details>
  </section>;
}

function PageIntegrityEvidence({ finding }: { finding: SiteIntegrityReportFinding }) {
  const observation = finding.evidence.observation;
  return <details className="group/page-integrity">
    <summary className="flex cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
      <DisclosureChevron className="text-zinc-400 group-open/page-integrity:rotate-180" />
      <span className="min-w-0 flex-1 break-all text-sm font-medium text-zinc-900" title={observation.documentUrl}>{pageLabel(observation.documentUrl)}</span>
      <span className="shrink-0 text-xs tabular-nums text-zinc-500">{observation.links.length} links{observation.truncated ? " · Limited" : ""}</span>
    </summary>
    <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3">
      <p className="break-all text-xs text-zinc-500">{observation.documentUrl}</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs">
        <caption className="sr-only">Retained hidden outbound links</caption>
        <thead className="text-zinc-500"><tr><th className="pb-2 pr-3 font-medium">Destination</th><th className="pb-2 pr-3 font-medium">Concealment</th><th className="pb-2 text-right font-medium">Links</th></tr></thead>
        <tbody>{groupDestinations([finding]).map(group => <tr key={group.domain} className="border-t border-zinc-200"><td className="break-all py-2 pr-3">{group.domain}</td><td className="py-2 pr-3">{[...group.methods].map(method => concealmentLabels[method]).join(" · ")}</td><td className="text-right tabular-nums">{group.count}</td></tr>)}</tbody>
      </table></div>
      <HiddenLinkCodeEvidence finding={finding} />
      <details className="mt-3 border-t border-zinc-200 pt-3 text-xs text-zinc-500"><summary className="cursor-pointer">Evidence provenance</summary>
        <p className="mt-2">Captured {observation.capturedAt}. {observation.truncated ? "Capture was limited; retained links are a sample." : "Bounded inspection of this page’s main document."}</p>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-white p-3">{JSON.stringify(finding.evidence, null, 2)}</pre>
      </details>
    </div>
  </details>;
}


/** Proof presentation only; eligibility and concealment come from the retained projection. */
export function HiddenLinkCodeEvidence({ finding, domain }: { finding: SiteIntegrityReportFinding; domain?: string }) {
  const observation = finding.evidence.observation;
  const links = observation.links.filter(link => !domain || link.destinationDomain === domain);
  const proofView = (link: (typeof links)[number]) => {
    const proof = link.codeProof;
    if (!proof) return <p className="py-3 text-xs text-zinc-500">{link.codeProofUnavailableReason === "capture_limit" ? "Code excerpt not retained: the bounded capture limit was reached." : "Code excerpt not retained for this link."} The destination and concealment method remain available above.</p>;
    const measured = link.concealment === "offscreen_position"
      ? `Link bounds: right ${proof.linkRect.right}px, bottom ${proof.linkRect.bottom}px relative to the viewport. Hiding element: position ${proof.computedStyle.position}.`
      : link.concealment === "zero_size_container"
        ? `Hiding element: ${proof.concealingRect.width} × ${proof.concealingRect.height}px with overflow ${proof.computedStyle.overflow}.`
        : `Computed font size on the link: ${proof.computedStyle.fontSizePx}px.`;
    return <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-3 py-2"><p className="text-xs font-medium text-zinc-800">{concealmentLabels[link.concealment]}</p><p className="mt-1 text-xs leading-5 text-zinc-600">{measured}</p></div>
      <pre aria-label={`Sanitized DOM excerpt for ${link.destinationDomain}`} className="max-h-64 overflow-auto py-2 text-[11px] leading-6 text-zinc-800"><code>{proof.lines.map((line, index) => <span key={index} className={`block whitespace-pre px-3 ${index === proof.highlightedLine ? "border-l-2 border-amber-500 bg-amber-50 font-semibold" : "border-l-2 border-transparent"}`}>{line}</span>)}</code></pre>
      <div className="border-t border-zinc-100 px-3 py-2 text-[11px] leading-5 text-zinc-500">
        <p>Highlighted: the element responsible for concealment. Measurements above use computed styles, including stylesheet rules.</p>
        <p>Sanitized DOM excerpt. Text, URL paths and unrelated attributes omitted.{proof.truncated ? " Excerpt truncated." : ""}</p>
        <details className="mt-1"><summary className="cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600">Capture details</summary><p className="mt-1 break-all">{observation.documentUrl}</p><p>Captured {observation.capturedAt}</p><p className="break-all">Evidence: {link.evidenceRef}</p><p className="break-all">Source hash: {finding.evidence.sourceHash}</p></details>
      </div>
    </div>;
  };
  return <details className="group/code-proof mt-2 text-xs">
    <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded py-1 text-sky-700 hover:text-sky-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden"><DisclosureChevron className="group-open/code-proof:rotate-180" />View code evidence{links.length > 1 ? ` (${links.length} links)` : ""}</summary>
    {links.length === 1 ? proofView(links[0]!) : <div className="mt-1 divide-y divide-zinc-200">{links.map((link, index) => <details key={link.evidenceRef} className="py-2"><summary className="cursor-pointer rounded text-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600">Link {index + 1} · {link.destinationDomain} · {concealmentLabels[link.concealment]}</summary>{proofView(link)}</details>)}</div>}
  </details>;
}
