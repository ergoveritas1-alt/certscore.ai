"use client";
import React, { useId, useState } from "react";
import { RuntimeObservationTimeline, type RuntimeObservationTimelineEvent } from "./runtime-observation-sections";
import type { ActionTimelineProjection } from "../../lib/scans/action-timeline-projection";

type Mode = "pre-consent" | "accept" | "reject";
const titles: Record<Mode, string> = {
  "pre-consent": "Pre-consent page event timeline",
  accept: "Post accept click page event timeline",
  reject: "Post reject click page event timeline",
};

export function ReportPageEventTimeline({ events, accept, reject }: {
  events: RuntimeObservationTimelineEvent[];
  accept?: ActionTimelineProjection | null;
  reject?: ActionTimelineProjection | null;
}) {
  const [selected, setSelected] = useState<Mode>("pre-consent");
  const mode = selected === "accept" && !accept || selected === "reject" && !reject ? "pre-consent" : selected;
  const path = mode === "accept" ? accept : mode === "reject" ? reject : null;
  const id = useId();
  const modes: Mode[] = ["pre-consent", ...(accept ? ["accept" as const] : []), ...(reject ? ["reject" as const] : [])];
  return <section aria-label={titles[mode]} className="my-3 border-y border-zinc-200 bg-white py-2">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h2 className="text-xl font-semibold">{titles[mode]}</h2>
      {modes.length > 1 ? <div role="group" aria-label="Page event timeline view" className="ml-auto flex shrink-0 gap-1">
        {modes.map(value => <button key={value} type="button" aria-pressed={value === mode} aria-controls={id} onClick={() => setSelected(value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${value === mode ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
          {value === "pre-consent" ? "Pre-consent" : value === "accept" ? "Accept" : "Reject"}
        </button>)}
      </div> : null}
    </div>
    {path ? <p className="mt-1 text-[11px] text-zinc-500">{path.clockLabel}{path.coverage === "limited" ? <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">Limited</span> : null}</p> : null}
    <div id={id} className="mt-1"><RuntimeObservationTimeline dominant compact responsive events={path?.events ?? events} /></div>
  </section>;
}
