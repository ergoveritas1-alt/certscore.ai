import React from "react";
import { gpcRequestCategories, type GpcRequestWindow } from "../../lib/scans/gpc-request-window";

type VisitBreakdown = { nonEssential: number; review?: number };

export function GpcRequestTable({ comparison, visitItems }: {
  comparison: GpcRequestWindow;
  visitItems?: { baseline?: VisitBreakdown; gpc?: VisitBreakdown };
}) {
  return <section aria-label="Baseline versus GPC" className="overflow-hidden rounded-md border border-zinc-200">
    <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-50 px-3 py-2">
      <h4 className="text-sm font-semibold text-zinc-900">Baseline → GPC</h4>
    </div>
    <table className="w-full text-left text-xs">
      <thead className="text-zinc-500"><tr><th scope="col" className="px-3 py-2 font-medium">Measure</th><th scope="col" className="px-3 py-2 font-medium">Baseline</th><th scope="col" className="px-3 py-2 font-medium">GPC</th></tr></thead>
      {visitItems ? <tbody>
        <tr className="border-t border-zinc-200 bg-zinc-50"><th scope="rowgroup" colSpan={3} className="px-3 py-2 font-medium text-zinc-700">Distinct flagged items</th></tr>
        {([["nonEssential", "Non-essential"], ["review", "Review"]] as const).map(([key, label]) =>
          <tr key={key} className="border-t border-zinc-100">
            <th scope="row" className="px-3 py-2 font-medium text-zinc-700">{label}</th>
            <td className="px-3 py-2 font-mono text-zinc-900">{visitItems.baseline?.[key] ?? "NA"}</td>
            <td className="px-3 py-2 font-mono text-zinc-900">{visitItems.gpc?.[key] ?? "NA"}</td>
          </tr>)}
      </tbody> : null}
      <tbody>
        <tr className="border-t border-zinc-200 bg-zinc-50"><th scope="rowgroup" colSpan={3} className="px-3 py-2 font-medium text-zinc-700">Advertising and analytics requests</th></tr>
        {gpcRequestCategories.map(([key, label]) =>
        <tr key={key} className="border-t border-zinc-100"><th scope="row" className="px-3 py-2 font-medium text-zinc-700">{label}</th>
          <td className="px-3 py-2 font-mono text-zinc-900">{comparison.activity[key].baselineRequests}</td>
          <td className="px-3 py-2 font-mono text-zinc-900">{comparison.activity[key].gpcRequests}</td>
        </tr>)}
      </tbody>
    </table>
  </section>;
}
