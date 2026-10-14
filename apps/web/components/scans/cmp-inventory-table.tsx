import React, { type ReactNode } from "react";
import { CopyJsonButton } from "./copy-json-button";
import { getVendorBrandMark } from "./vendor-brand-chip";

/** Decorative only: service names are retained identities. Cookie names do not
 * carry vendor attribution, so they always use the neutral cookie symbol. */
export function CmpInventoryIdentity({ name, kind }: { name: string; kind: "cookie" | "service" }) {
  const logoPath = kind === "service" ? getVendorBrandMark(name).logoPath : undefined;
  return <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
    <span aria-hidden="true" className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-zinc-400">
      {logoPath ? <img src={logoPath} alt="" width={16} height={16} loading="lazy" className="h-4 w-4 object-contain" /> :
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {kind === "cookie" ? <>
            <path d="M21 12a9 9 0 1 1-9-9 4 4 0 0 0 4 4 4 4 0 0 0 5 5Z" />
            <path d="M8 8h.01M8 15h.01M13 12h.01M15 16h.01" strokeWidth="3" />
          </> : <>
            <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
          </>}
        </svg>}
    </span>
    <span className={`min-w-0 ${kind === "cookie" ? "font-mono text-[11px]" : ""}`}>{name}</span>
  </span>;
}

/** One compact window for all CMP lists: header plus up to eight 36px rows.
 * Cells wrap on mobile and remain untruncated at every width. */
export function CmpInventoryTable({ label, columns, rows, copyRows, columnClasses }: {
  label: string;
  columns: readonly string[];
  columnClasses?: readonly string[];
  rows: readonly (readonly ReactNode[])[];
  copyRows: readonly (readonly string[])[];
}) {
  if (!rows.length) return null;
  return <div className="min-w-0">
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="font-semibold text-zinc-900">{label}</p>
      <CopyJsonButton payload={buildCmpTableCopyPayload(columns, copyRows)} label={`Copy ${label} table`}
        className="inline-flex h-7 !min-h-0 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600" />
    </div>
    <div role="region" aria-label={label} tabIndex={0}
      className="max-h-[322px] max-w-full overflow-auto rounded-md border border-zinc-200 bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
      <table className={`w-full table-fixed border-collapse text-left text-[11px] sm:table-auto sm:text-xs ${columns.length === 4 ? "min-w-[40rem]" : ""}`}>
        <caption className="sr-only">{label}</caption>
        <thead className="sticky top-0 z-10 bg-zinc-100 text-zinc-600"><tr className="h-8">
          {columns.map((column, index) => <th key={column} scope="col" className={`px-2 py-1 font-medium sm:px-3 ${columnClasses?.[index] ?? (index === 0 ? columns.length === 4 ? "w-[30%] sm:w-auto" : "w-[42%] sm:w-auto" : "")}`}>{column}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-zinc-100">{rows.map((cells, index) => <tr key={index} className="h-9">
          {cells.map((cell, column) => column === 0
            ? <th key={column} scope="row" className="break-words px-2 py-2 font-normal text-zinc-900 [overflow-wrap:anywhere] sm:whitespace-nowrap sm:px-3 sm:py-0">{cell}</th>
            : <td key={column} className="break-words px-2 py-2 [overflow-wrap:anywhere] sm:whitespace-nowrap sm:px-3 sm:py-0">{cell}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    {columns.length === 4 ? <p className="mt-1 text-[11px] text-zinc-500 sm:hidden">Scroll sideways to see all columns.</p> : null}
    {rows.length > 8 ? <p className="mt-1 text-[11px] text-zinc-500">{rows.length} rows · Scroll to see more</p> : null}
  </div>;
}

export function CmpCookieMatch({ matched }: { matched: boolean }) {
  return matched ? <span className="inline-flex items-center gap-1 whitespace-nowrap text-emerald-700">
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 8 3 3 7-7" /></svg><span className="sr-only sm:not-sr-only">Matched</span>
  </span> : <span className="text-amber-800">No match</span>;
}

/** Plain tab-separated text preserves the full list when pasted into a grid.
 * Embedded line breaks and tabs stay inside their cell rather than adding rows. */
export function buildCmpTableCopyPayload(columns: readonly string[], rows: readonly (readonly string[])[]) {
  return [columns, ...rows].map(row => row.map(value => {
    const text = value.replace(/[\t\r\n]+/g, " ").trim();
    // Site-supplied labels stay literal when pasted into spreadsheet cells.
    return /^[=+@-]/.test(text) && !/^[+-]?\d+(?:\.\d+)?(?:\s*(?:ms|s))?$/.test(text) ? `'${text}` : text;
  }).join("\t")).join("\n");
}
