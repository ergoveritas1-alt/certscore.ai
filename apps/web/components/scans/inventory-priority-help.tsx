"use client";

import { useId } from "react";
import { InventoryEvidenceLegend } from "./inventory-evidence-icon";

export function InventoryPriorityHelp({ service = false }: { service?: boolean }) {
  const id = useId();
  return <>
    <button type="button" popoverTarget={id} aria-label={service ? "Explain service priority" : "Explain resource priority"} title="Priority legend" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-sky-100 hover:text-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5M10 6v.01"/></svg>
    </button>
    <div id={id} popover="auto" role="dialog" aria-label="Priority legend" className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 whitespace-normal text-left text-xs font-normal normal-case tracking-normal text-slate-600 shadow-xl">
      <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-900">Priority legend</h3><button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label="Close priority legend" className="rounded px-2 py-1 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">Close</button></div>
      <InventoryEvidenceLegend/>
      <p className="mt-3 leading-5">{service ? "Shows the highest priority among the service’s resources. Expand the service to inspect individual resources." : "Shows each resource’s retained evidence classification. Hover or focus an icon for its label."}</p>
    </div>
  </>;
}
