import { EvidenceStatusBadge } from "./evidence-status-badge";
import { EvidenceHeaderStatus } from "./evidence-header-status";
import React from "react";
import type { CmsSecurityProjection } from "@certscore/contracts";
import { DisclosureChevron } from "./report-finding-row";

/** The assessment is persisted upstream; this view neither detects nor promotes findings. */
export function CmsSecurityEvidence({ projection }: { projection?: CmsSecurityProjection | null }) {
  if (!projection?.assessment.detections.length) return null;
  const { assessment } = projection;
  const flagged = assessment.matches.length > 0;
  const status = assessment.matches.some(row => row.record.kind === "vulnerability") ? "Potential exposure"
    : flagged ? "Older version · support ended"
    : assessment.detections.every(row => row.informationalOnly) ? "Hosted CMS"
    : assessment.detections.every(row => row.informationalOnly || row.version) ? "No match in selected checks"
    : "Version check unavailable";
  const versionLabel = (row: typeof assessment.detections[number]) => row.version ??
    (row.observedVersions.length === 1 ? row.observedVersions[0] : row.observedVersions.length ? "version unclear" : "version unknown");
  return <details id="cms-security-evidence" className="group/cms-security border-b border-r border-zinc-200 bg-white p-5">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase text-zinc-500">CMS &amp; version</span>
        <span className="mt-1 block text-sm font-semibold text-zinc-900">{assessment.detections.map(row => `${row.name} ${versionLabel(row)}`).join(" · ")}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2"><EvidenceHeaderStatus rows={flagged ? [{status: "Warning"}] : status === "Version check unavailable" ? [{status: "Limited"}] : []} /><DisclosureChevron className="shrink-0 text-zinc-400 group-open/cms-security:rotate-180" /></span>
    </summary>
    <div className="mt-3 space-y-4 border-t border-zinc-200 pt-3 text-sm">
      <EvidenceStatusBadge label={status} tone={flagged ? "review" : status === "Version check unavailable" ? "limited" : "neutral"} />
      {assessment.detections.map(detection => {
        const matches = assessment.matches.filter(match => match.detectionRef === detection.evidenceRef);
        return <div key={detection.evidenceRef} id={detection.evidenceRef} className="space-y-2 border-b border-zinc-100 pb-4 last:border-0 last:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="font-semibold text-zinc-900">{detection.name}</h3>
            <span className="font-medium text-zinc-900">{versionLabel(detection)}</span>
          </div>
          <p className="text-xs text-zinc-500">{detection.versionBasis === "declared" ? "Version reported by the page" : "CMS identified from a page asset"}{detection.observedVersions.length > 1 ? ` · Conflicting reported versions: ${detection.observedVersions.join(", ")}` : ""}</p>
          {matches.length ? <div className="space-y-2">{matches.map(match => <div key={match.evidenceRef} id={match.evidenceRef} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="font-medium text-amber-950">{match.record.kind === "vulnerability" ? "Potential exposure" : "Support ended"}: {match.record.title}</p>
            {match.record.fixedVersions?.length ? <p className="mt-1 text-xs text-zinc-700">Vendor fixes: {match.record.fixedVersions.join(", ")}</p> : null}
            <a href={match.record.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-medium text-sky-800 underline">View vendor source</a>
          </div>)}</div> : <p className="text-zinc-600">{detection.informationalOnly ? "Hosted service; version checks do not apply." : detection.version ? "No issue matched in the selected version checks." : "Version could not be checked."}</p>}
        </div>;
      })}
      <p className="text-xs leading-5 text-zinc-500">Page-reported versions and selected vendor advisories. Confirm the installed version and patches with the site administrator.</p>
      {projection.signals.length ? <details className="border-t border-zinc-100 pt-3 text-xs text-zinc-600">
        <summary className="cursor-pointer font-medium">How we identified the CMS</summary>
        <ul className="mt-2 space-y-2">{projection.signals.map(signal => <li id={signal.evidenceRef} key={signal.evidenceRef} className="break-words">
          <span className="font-medium">{signal.kind === "meta_generator" ? "Page metadata" : "Page asset"}: </span>
          <span className="break-all">{signal.value}</span>
          {signal.kind === "asset_path" ? <a className="ml-2 text-sky-700 underline" href={signal.sourceUrl} target="_blank" rel="noopener noreferrer">View asset</a> : null}
        </li>)}</ul>
      </details> : null}
    </div>
  </details>;
}
