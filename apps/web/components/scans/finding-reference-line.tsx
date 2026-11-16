import React, { useId } from "react";
import type { FindingReference } from "../../lib/scans/finding-references";

const linkClass = "text-sky-800 underline decoration-sky-800/35 underline-offset-2 hover:text-sky-950 hover:decoration-current focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500";

export function FindingReferenceSource({ reference }: { reference: FindingReference }) {
  return <a href={reference.url} target="_blank" rel="noreferrer" className={linkClass}>Official text · {reference.publisher} ↗</a>;
}

export function FindingReferenceLine({ references, scope }: { references: readonly FindingReference[]; scope: string }) {
  const id = useId();
  if (!references.length) return null;
  const isStandard = references.every(reference => reference.kind === "Technical standard");
  const label = isStandard ? "Relevant standard" : "Relevant law";
  return <div role="group" aria-label={label} className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs leading-5 text-zinc-600">
    <span className="inline-flex items-center gap-1.5">
      {!isStandard ? <svg aria-hidden="true" focusable="false" className="h-3.5 w-3.5 shrink-0 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v18m-5 0h10M3 7h18M3 14l3-7 3 7a3 3 0 0 1-6 0Zm12 0 3-7 3 7a3 3 0 0 1-6 0Z" />
      </svg> : null}
      {label}
    </span>
    {references.map((reference, index) => {
      const popoverId = `${id}-${index}`;
      return <div key={reference.label} className="inline-flex items-baseline gap-2">
        {index > 0 ? <span aria-hidden="true" className="text-zinc-400">·</span> : null}
        <button type="button" popoverTarget={popoverId} aria-haspopup="dialog" className={`${linkClass} text-left font-medium`}>{reference.label}</button>
        <div id={popoverId} popover="auto" role="dialog" aria-labelledby={`${popoverId}-title`} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(23rem,calc(100vw-2rem))] overflow-auto whitespace-normal rounded-xl border border-zinc-200 bg-white p-4 text-left text-sm leading-5 text-zinc-700 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-zinc-500">{reference.kind}</p>
              <h3 id={`${popoverId}-title`} className="font-semibold text-zinc-950">{reference.label}</h3>
            </div>
            <button type="button" popoverTarget={popoverId} popoverTargetAction="hide" className="rounded px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">Close</button>
          </div>
          <p className="mt-2">{reference.explanation}</p>
          <p className="mt-2 text-xs leading-5 text-zinc-600">{scope}</p>
          <p className="mt-3 text-xs"><FindingReferenceSource reference={reference} /></p>
        </div>
      </div>;
    })}
  </div>;
}
