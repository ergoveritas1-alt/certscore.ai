"use client";

import React, { useMemo, useState } from "react";
import { CopyJsonButton } from "./copy-json-button";
import { flattenRetainedFields } from "./runtime-evidence-graph-model";

/** Receives only validated public graph evidence or existing display-safe projections. */
export function RetainedEvidenceFields({ value, label = "All retained fields" }: { value: unknown; label?: string }) {
  const [open, setOpen] = useState(false);
  return <details className="border-t border-slate-200 pt-1" onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open); }}>
    <summary className="cursor-pointer py-3 text-xs font-semibold text-slate-600">{label}</summary>
    {open ? <FieldBrowser value={value} /> : null}
  </details>;
}

function FieldBrowser({ value }: { value: unknown }) {
  const [page, setPage] = useState(0);
  const fields = useMemo(() => flattenRetainedFields(value), [value]);
  const matches = fields;
  const pageCount = Math.max(1, Math.ceil(matches.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  const groups = new Map<string, typeof matches>();
  for (const field of matches.slice(currentPage * 50, (currentPage + 1) * 50)) groups.set(field.group, [...(groups.get(field.group) ?? []), field]);
  const json = useMemo(() => JSON.stringify(value, null, 2), [value]);
  return <div className="space-y-3 pb-3" data-testid="retained-field-browser">
    {[...groups].map(([group, rows]) => <details key={`${group}:${currentPage}`} open={groups.size === 1} className="rounded-lg border border-slate-100 px-3">
      <summary className="cursor-pointer py-2 text-xs font-medium text-slate-700">{group} <span className="text-slate-400">· {rows.length} on this page</span></summary>
      <dl>{rows.map(field => <div key={field.path} className="border-t border-slate-100 py-2">
        <dt className="break-words text-[11px] text-slate-500" title={field.path}>{field.label}</dt>
        <dd className="mt-1 whitespace-pre-wrap break-all text-xs text-slate-800">{field.value || 'Empty string ("")'}</dd>
      </div>)}</dl>
    </details>)}
    {!matches.length ? <p className="text-xs text-slate-500">No retained fields.</p> : null}
    {pageCount > 1 ? <div className="flex items-center justify-between gap-2 text-xs">
      <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded border px-2 py-2 disabled:opacity-40">Previous fields</button>
      <span>{currentPage + 1} / {pageCount}</span>
      <button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)} className="rounded border px-2 py-2 disabled:opacity-40">Next fields</button>
    </div> : null}
    <details className="rounded-lg bg-slate-50 p-3">
      <summary className="cursor-pointer text-xs font-medium text-slate-600">Safe JSON</summary>
      <div className="relative pt-9"><CopyJsonButton payload={json} label="Copy safe evidence JSON" />
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-600">{json}</pre>
      </div>
    </details>
  </div>;
}
