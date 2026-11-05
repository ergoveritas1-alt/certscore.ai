"use client";
import React, { useEffect, useState } from "react";
import type { ShadowReportData } from "./report-lab/shadow-report-data";
import { ReportPageEventTimeline, type ReportEvidencePhase } from "./report-page-event-timeline";
import { SinglePageResourceInventory } from "./single-page-resource-inventory";

/** A single phase owns the timeline, inventory rows and all breakdown tallies. */
export function ReportPhaseEvidence({ report, initialFallback }: { report: ShadowReportData; initialFallback?: React.ReactNode }) {
  const [selected, setSelected] = useState<ReportEvidencePhase>("pre-consent");
  const phase = selected === "accept" && !report.actionTimelines?.accept || selected === "reject" && !report.actionTimelines?.reject || selected === "gpc" && !report.gpcTimeline ? "pre-consent" : selected;
  const [gpc, setGpc] = useState<{scanId:string; value:import("../../lib/scans/action-resource-inventory").ActionResourceInventory | null; error?:boolean} | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (phase !== "gpc" || gpc?.scanId === report.scan.id) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/scans/${encodeURIComponent(report.scan.id)}/runtime-evidence-graph?view=gpc-inventory`, {credentials:"same-origin",cache:"no-store",signal:controller.signal});
        if (!response.ok) throw new Error("Inventory unavailable");
        const value = await response.json();
        if (!controller.signal.aborted) setGpc({scanId:report.scan.id,value});
      } catch { if (!controller.signal.aborted) setGpc({scanId:report.scan.id,value:null,error:true}); }
    })();
    return () => controller.abort();
  }, [phase, report.scan.id, gpc?.scanId, retry]);
  const initial = phase === "pre-consent";
  const action = phase === "accept" || phase === "reject" ? report.actionInventories?.[phase] : phase === "gpc" && gpc?.scanId === report.scan.id ? gpc.value : null;
  const inventory = initial ? report.resourceInventory : action?.inventory;
  const label = initial ? "Pre-consent" : phase === "accept" ? "After Accept" : phase === "reject" ? "After Reject" : "GPC";
  return <section aria-label="Page timeline and supporting evidence" className="my-5 rounded-xl border border-zinc-200 bg-white p-4 lg:p-5">
    <ReportPageEventTimeline embedded events={report.timeline} accept={report.actionTimelines?.accept} reject={report.actionTimelines?.reject} gpc={report.gpcTimeline} selectedPhase={phase} onPhaseChange={setSelected} />
    {action && phase !== "gpc" ? <p className="mt-4 text-xs leading-5 text-zinc-600" role="status">{action.note} {action.clockLabel}.</p> : null}
    {phase === "accept" && report.afterAcceptFormsLimited && !report.collectionTableRows?.some(row => row.capturePhase)
      ? <p className="mt-2 text-xs leading-5 text-zinc-600">After Accept form capture was limited; no forms were retained.</p> : null}
    {inventory ? <SinglePageResourceInventory key={phase} embedded inventory={inventory} report={report} initialVisit={initial} phaseLabel={label} />
      : initial && initialFallback ? <div id="report-resource-inventory">{initialFallback}</div>
      : <div id="report-resource-inventory" className="mt-4"><p className="text-xs font-semibold uppercase text-zinc-500">{label} supporting evidence</p><h2 className="mt-2 text-xl font-semibold">Services &amp; Resources</h2><p className="mt-2 text-sm text-zinc-600">{phase === "gpc" && gpc?.scanId !== report.scan.id ? "Loading retained GPC inventory…" : phase === "gpc" && gpc?.error ? "GPC inventory could not be loaded." : "Resource inventory was not retained for this phase."}</p>{phase === "gpc" && gpc?.error ? <button type="button" className="mt-2 text-sm text-sky-700 underline" onClick={() => {setGpc(null);setRetry(value => value+1);}}>Retry GPC inventory</button> : null}</div>}
  </section>;
}
