import React from "react";

const statuses = {
  "Non-essential": { color: "text-rose-500", path: "M12 3 2 21h20ZM12 9v5m0 3v1" },
  Essential: { color: "text-blue-500", path: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6ZM8 12l3 3 5-6" },
  Review: { color: "text-amber-500", path: "m12 2 10 10-10 10L2 12ZM12 7v6m0 3v1" },
  Contextual: { color: "text-sky-500", path: "M12 8v1m0 3v5M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0" },
} as const;

export function InventoryEvidenceIcon({ evidence, legend = false }: { evidence?: string; legend?: boolean }) {
  if (!evidence || !Object.prototype.hasOwnProperty.call(statuses, evidence)) {
    return <span aria-hidden="true" className="inline-block h-4 w-4 shrink-0" />;
  }
  const label = evidence as keyof typeof statuses;
  const status = statuses[label];
  const description = label;
  return <span role="img" aria-label={description} title={description} tabIndex={legend ? undefined : 0} className={`inline-flex shrink-0 items-center justify-center rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${status.color}`}>
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={status.path}/></svg>
  </span>;
}

export function InventoryEvidenceLegend() {
  return <span aria-label="Evidence classification legend" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-normal text-slate-600">
    {Object.keys(statuses).map(label => <span key={label} className="inline-flex items-center gap-1.5"><InventoryEvidenceIcon evidence={label} legend />{label}</span>)}
  </span>;
}
