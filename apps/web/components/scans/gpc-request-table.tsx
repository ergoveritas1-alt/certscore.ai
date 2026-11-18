import React from "react";
import { gpcRequestCategories, gpcWindowDuration, type GpcRequestWindow } from "../../lib/scans/gpc-request-window";

export function GpcRequestTable({ comparison }: { comparison: GpcRequestWindow }) {
  const observationWindow = gpcWindowDuration(comparison.durationMs);
  return <section aria-label="Baseline versus GPC" className="overflow-hidden rounded-md border border-zinc-200">
    <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-50 px-3 py-2">
      <h4 className="text-sm font-semibold text-zinc-900">Baseline → GPC</h4>
      <span className="text-xs text-zinc-600">Requests observed during the first {observationWindow} after each page loaded.</span>
    </div>
    <table className="w-full text-left text-xs">
      <thead className="text-zinc-500"><tr><th scope="col" className="px-3 py-2 font-medium">Observed requests</th><th scope="col" className="px-3 py-2 font-medium">Baseline</th><th scope="col" className="px-3 py-2 font-medium">GPC</th></tr></thead>
      <tbody>{gpcRequestCategories.map(([key, label]) =>
        <tr key={key} className="border-t border-zinc-100"><th scope="row" className="px-3 py-2 font-medium text-zinc-700">{label}</th>
          <td className="px-3 py-2 font-mono text-zinc-900">{comparison.activity[key].baselineRequests}</td>
          <td className="px-3 py-2 font-mono text-zinc-900">{comparison.activity[key].gpcRequests}</td>
        </tr>)}</tbody>
    </table>
  </section>;
}
