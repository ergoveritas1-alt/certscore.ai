import React, { type ReactNode } from "react";

/** One compact window for all CMP lists: header plus up to eight 36px rows.
 * Cells wrap on mobile and remain untruncated at every width. */
export function CmpInventoryTable({ label, columns, rows }: {
  label: string;
  columns: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}) {
  if (!rows.length) return null;
  return <div className="min-w-0">
    <p className="mb-2 font-semibold text-zinc-900">{label}</p>
    <div role="region" aria-label={label} tabIndex={0}
      className="max-h-[322px] max-w-full overflow-auto rounded-md border border-zinc-200 bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
      <table className={`w-full table-fixed border-collapse text-left text-[11px] sm:table-auto sm:text-xs ${columns.length === 4 ? "min-w-[40rem]" : ""}`}>
        <caption className="sr-only">{label}</caption>
        <thead className="sticky top-0 z-10 bg-zinc-100 text-zinc-600"><tr className="h-8">
          {columns.map((column, index) => <th key={column} scope="col" className={`px-2 py-1 font-medium sm:px-3 ${index === 0 ? columns.length === 4 ? "w-[30%] sm:w-auto" : "w-[42%] sm:w-auto" : ""}`}>{column}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-zinc-100">{rows.map((cells, index) => <tr key={index} className="h-9">
          {cells.map((cell, column) => column === 0
            ? <th key={column} scope="row" className="break-words px-2 py-2 font-normal text-zinc-900 [overflow-wrap:anywhere] sm:whitespace-nowrap sm:px-3 sm:py-0">{cell}</th>
            : <td key={column} className="break-words px-2 py-2 [overflow-wrap:anywhere] sm:whitespace-nowrap sm:px-3 sm:py-0">{cell}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    {rows.length > 8 ? <p className="mt-1 text-[11px] text-zinc-500">{rows.length} rows · Scroll to see more</p> : null}
  </div>;
}

export function CmpCookieMatch({ matched }: { matched: boolean }) {
  return matched ? <span className="inline-flex items-center gap-1 text-emerald-700">
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 8 3 3 7-7" /></svg><span className="sr-only sm:not-sr-only">Matched</span>
  </span> : <span className="text-amber-800">No match</span>;
}
