import React from "react";

const paths: Record<string, string> = {
  service: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
  request: "M4 8h16m-5-5 5 5-5 5M20 16H4m5-5-5 5 5 5",
  response: "M20 12H4m6-6-6 6 6 6",
  script: "m8 7-5 5 5 5m8-10 5 5-5 5m-3-12-2 14",
  embed: "M3 4h18v16H3ZM3 8h18m-12 4-3 2 3 2m6-4 3 2-3 2",
  cookie: "M20 13a8 8 0 1 1-9-9 4 4 0 0 0 5 5 4 4 0 0 0 4 4ZM8 9h.01M8 15h.01M13 14h.01",
  storage: "M4 4h16v6H4ZM4 14h16v6H4ZM7 7h.01M7 17h.01",
  document: "M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8M8 17h5",
  frame: "M3 4h18v16H3ZM3 8h18M7 12h10v5H7Z",
  worker: "M8 8h8v8H8ZM9 3v5m6-5v5M9 16v5m6-5v5M3 9h5m-5 6h5m8-6h5m-5 6h5",
};

export function InventoryTypeIcon({ kind }: { kind: string }) {
  const label = kind.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());
  return <span role="img" aria-label={label} title={label} tabIndex={0} className="inline-flex items-center justify-center rounded-sm text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"><path d={paths[kind] ?? paths.document}/></svg>
  </span>;
}
