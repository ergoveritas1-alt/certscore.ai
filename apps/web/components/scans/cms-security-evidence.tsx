import { EvidenceHeaderStatus } from "./evidence-header-status";
import React from "react";
import type { CmsSecurityProjection } from "@certscore/contracts";
import { DisclosureChevron } from "./report-finding-row";

/** The assessment is persisted upstream; this view neither detects nor promotes findings. */
export function CmsSecurityEvidence({ projection }: { projection?: CmsSecurityProjection | null }) {
  if (!projection || !projection.assessment.detections.length && !projection.pluginInventory?.detections.length) return null;
  const { assessment } = projection;
  const plugins = projection.pluginInventory?.detections ?? [];
  const flagged = assessment.matches.length > 0;
  const versionLabel = (row: typeof assessment.detections[number]) => row.version ??
    (row.versionStatus === "conflicting" ? "Conflicting versions" : row.observedVersions.length === 1 ? `${row.observedVersions[0]} · ${row.versionBasis === "inferred" ? "Asset version" : "Partial version"}` : row.informationalOnly ? "Hosted service" : "Version not detected");
  const sourceLabels = { meta_generator: "Page metadata", asset_path: "Page asset", html_generator_comment: "Generator comment", core_asset_version: "Core asset version", feed_generator: "Linked feed generator" };
  return <details id="cms-security-evidence" className="group/cms-security border-b border-r border-zinc-200 bg-white p-5">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase text-zinc-500">CMS &amp; version</span>
        <span className="mt-1 block text-sm font-semibold text-zinc-900">{assessment.detections.map(row => `${row.name}${row.version ? " " : " · "}${versionLabel(row)}`).join(" · ") || "Plugins detected"}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2"><EvidenceHeaderStatus rows={flagged ? [{status: "Warning"}] : []} /><DisclosureChevron className="shrink-0 text-zinc-400 group-open/cms-security:rotate-180" /></span>
    </summary>
    <div className="mt-3 space-y-4 border-t border-zinc-200 pt-3 text-sm">
      {assessment.detections.map(detection => {
        const matches = assessment.matches.filter(match => match.detectionRef === detection.evidenceRef);
        if (assessment.detections.length === 1 && !matches.length && !detection.version && !detection.informationalOnly) return null;
        return <div key={detection.evidenceRef} id={detection.evidenceRef} className="space-y-2 border-b border-zinc-100 pb-4 last:border-0 last:pb-0">
          {assessment.detections.length > 1 ? <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="font-semibold text-zinc-900">{detection.name}</h3>
            <span className="font-medium text-zinc-900">{versionLabel(detection)}</span>
          </div> : null}
          {matches.length ? <div className="space-y-2">{matches.map(match => <div key={match.evidenceRef} id={match.evidenceRef} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="font-medium text-amber-950">{match.record.kind === "vulnerability" ? "Potential exposure" : "Support ended"}: {match.record.title}</p>
            {match.record.fixedVersions?.length ? <p className="mt-1 text-xs text-zinc-700">Vendor fixes: {match.record.fixedVersions.join(", ")}</p> : null}
            <a href={match.record.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-medium text-sky-800 underline">View vendor source</a>
          </div>)}</div> : detection.version || detection.informationalOnly ? <p className="text-zinc-600">{detection.informationalOnly ? "Hosted service; version checks do not apply." : detection.version ? "No issue matched in the selected version checks." : ""}</p> : null}
        </div>;
      })}
      {plugins.length ? <div>
        <h3 className="mb-2 font-semibold text-zinc-900">Plugins <span className="ml-1 font-normal text-zinc-500">{plugins.length}</span></h3>
        <table className="w-full table-fixed text-left text-sm">
          <thead className="text-xs text-zinc-500"><tr><th scope="col" className="w-2/3 pb-2 font-medium">Plugin</th><th scope="col" className="pb-2 text-right font-medium">Version</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">{plugins.map(plugin => <tr key={plugin.evidenceRef} id={plugin.evidenceRef}>
            <th scope="row" className="py-2 pr-3 font-medium text-zinc-800"><span className="line-clamp-2 break-words">{plugin.name}</span></th>
            <td className="py-2 text-right tabular-nums text-zinc-600"><span className="line-clamp-2">{plugin.version ?? (plugin.versionStatus === "conflicting" ? "Conflicting" : <span aria-label="Version not detected">—</span>)}</span></td>
          </tr>)}</tbody>
        </table>
      </div> : null}
      {projection.signals.length ? <details className="border-t border-zinc-100 pt-3 text-xs text-zinc-600">
        <summary className="cursor-pointer font-medium">How we identified this</summary>
        <ul className="mt-2 space-y-2">{projection.signals.map(signal => <li id={signal.evidenceRef} key={signal.evidenceRef} className="break-words">
          <span className="font-medium">{sourceLabels[signal.kind]}: </span>
          <span className="break-all">{signal.value}</span>
          {signal.kind === "asset_path" || signal.kind === "core_asset_version" || signal.kind === "feed_generator" ? <a className="ml-2 text-sky-700 underline" href={signal.sourceUrl} target="_blank" rel="noopener noreferrer">View source</a> : null}
        </li>)}</ul>
      </details> : null}
    </div>
  </details>;
}
