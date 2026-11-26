import React from "react";
import type { ReportRequestDetail } from "@certscore/api-contracts";
import { VendorBrandLogo } from "./vendor-brand-chip";

function RequestDetail({ row }: { row: ReportRequestDetail }) {
  return <div className="min-w-0 space-y-1">
    <p>{row.summary}</p>
    {row.endpoint && (row.kind === "same_site_measurement"
      ? <code className="break-all">{row.endpoint}</code>
      : <details><summary className="cursor-pointer text-sky-800">Request endpoint</summary>
        <code className="break-all">{row.endpoint}</code></details>)}
  </div>;
}

function RequestEndpoint({row}: {row: ReportRequestDetail}) {
  if (!row.endpoint) return null;
  const url = new URL(row.endpoint);
  return <code className="adtech-endpoint">{row.method && row.method + " "}{url.origin}<wbr />{url.pathname}</code>;
}

function AdRequestsTable({ rows }: { rows: ReportRequestDetail[] }) {
  return <table className="adtech-requests w-full text-left text-xs">
    <thead><tr>
      <th scope="col" className="pr-2 whitespace-nowrap">Time (ms)</th>
      <th scope="col" className="pr-2">Recipient</th>
      <th scope="col">Request sent</th>
    </tr></thead>
    <tbody>{rows.map(row => <tr key={row.evidenceRef} className="border-t border-slate-100 align-top">
      <td className="py-1 pr-2 tabular-nums">+{row.elapsedMs?.toLocaleString("en-US")}</td>
      <td className="py-1 pr-2"><span className="inline-flex gap-1">
        <VendorBrandLogo label={row.recipient ?? ""} bundledOnly className="mt-0.5 !h-4 !w-4 shrink-0" />
        {row.recipient}
      </span></td>
      <td className="py-1"><RequestEndpoint row={row} /></td>
    </tr>)}</tbody>
  </table>;
}

export function AdTechRequestDetails({ rows = [] }: { rows?: ReportRequestDetail[] }) {
  if (!rows.length) return null;
  const groups = new Map<string, ReportRequestDetail[]>();
  for (const row of rows) {
    const key = row.kind === "california_gpp" ? row.kind + row.recipient : row.kind;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return <div className="my-2 space-y-3 text-xs leading-5 text-slate-700">
    {Array.from(groups, ([key, items]) => {
      const first = items[0]!;
      const table = first.kind === "reject_ad";
      const more = items.slice(table ? 4 : 1);
      return <section key={key} aria-label={first.title} className="adtech-request-card min-w-0 rounded-md border border-slate-200 p-3">
        <h5 className="mb-1 font-semibold text-slate-900">{first.title}</h5>
        {table ? <AdRequestsTable rows={items.slice(0, 4)} /> : <RequestDetail row={first} />}
        {more.length > 0 && <details>
          <summary className="cursor-pointer text-sky-800">{more.length} more {more.length === 1 ? "request" : "requests"}</summary>
          {table ? <AdRequestsTable rows={more} /> : <ul className="mt-1 space-y-2">{more.map(row =>
            <li key={row.evidenceRef + (row.endpoint ?? "")}><RequestDetail row={row} /></li>)}</ul>}
        </details>}
      </section>;
    })}
  </div>;
}
