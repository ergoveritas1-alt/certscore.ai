"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import type { OrganizationScanListItem } from "../../server/scans/get-organization-scans";
import { getScanFromMarkerInput, ScanFromMarker } from "../scans/scan-from-icons";
import { PendingButtonLink } from "../ui/pending-link";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    hour12: true, timeZone: "America/Los_Angeles", timeZoneName: "short"
  }).format(new Date(value));
}

function formatDuration(scan: Pick<OrganizationScanListItem, "completedAt" | "createdAt" | "startedAt">) {
  const start = Date.parse(scan.startedAt ?? scan.createdAt);
  const end = scan.completedAt ? Date.parse(scan.completedAt) : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "—";
  const seconds = (end - start) / 1000;
  const rounded = Math.round(seconds * 10) / 10;
  return rounded >= 60 ? `${Math.floor(rounded / 60)}m ${Math.round(rounded % 60)}s` : `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}s`;
}

function freshnessLabel(value: boolean | null) {
  if (value === true) return "Forced fresh";
  if (value === false) return "Standard";
  return "—";
}

function statusIndicator(scan: OrganizationScanListItem) {
  if (scan.status === "failed" || scan.accessPostureClass === "early_loss") return { className: "bg-rose-500", label: scan.interruptionLabel ?? "Failed" };
  if (scan.status === "queued" || scan.status === "running") return { className: "bg-sky-400", label: scan.status === "queued" ? "Queued" : "Running" };
  if (scan.interruptionLabel || scan.accessPostureClass === "degraded_but_useful" || scan.accessPostureClass === "robots_limited") return { className: "bg-amber-400", label: scan.interruptionLabel ?? "Limited" };
  return { className: "bg-emerald-500", label: "Completed" };
}

function ViewIcon() {
  return <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="3" /></svg>;
}

function HistoryIcon() {
  return <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" fill="currentColor" r="1" /><circle cx="4" cy="12" fill="currentColor" r="1" /><circle cx="4" cy="18" fill="currentColor" r="1" /></svg>;
}

type OverviewScanHistoryCardProps = {
  scans: OrganizationScanListItem[];
};

export function OverviewScanHistoryCard({ scans }: OverviewScanHistoryCardProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const groups = useMemo(() => scans.reduce<Array<{ domainId: string | null; hostname: string | null; key: string; scans: OrganizationScanListItem[] }>>((result, scan) => {
    const key = scan.domainId ?? scan.domainHostname ?? scan.id;
    const existing = result.find((group) => group.key === key);
    if (existing) existing.scans.push(scan);
    else result.push({ domainId: scan.domainId, hostname: scan.domainHostname, key, scans: [scan] });
    return result;
  }, []), [scans]);
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const start = (page - 1) * pageSize;
  const visibleGroups = groups.slice(start, start + pageSize);

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1"><CardTitle>Recent website health</CardTitle><p className="text-sm text-slate-500">Latest result for each website, with earlier scans one click away.</p></div>
          <p className="text-sm text-slate-500">{groups.length} website{groups.length === 1 ? "" : "s"}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {groups.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">Scan your first website to start tracking risk signals and changes.</div> : <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
            <p className="text-xs text-slate-500">Showing {start + 1}–{Math.min(start + visibleGroups.length, groups.length)} of {groups.length}</p>
            <div className="flex items-center gap-2">
              <select aria-label="Rows per page" className="h-8 rounded-full border border-slate-300 bg-white px-3 text-xs" onChange={(event) => { setPageSize(Number(event.target.value)); setCurrentPage(1); }} value={pageSize}>{PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option} per page</option>)}</select>
              <button className="app-raised-button h-8 rounded-full px-3 text-xs disabled:opacity-40" disabled={page <= 1} onClick={() => setCurrentPage((value) => Math.max(1, value - 1))} type="button">Previous</button>
              <button className="app-raised-button h-8 rounded-full px-3 text-xs disabled:opacity-40" disabled={page >= totalPages} onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))} type="button">Next</button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="table-fixed text-left text-xs" style={{ minWidth: "1125px" }}>
              <colgroup><col style={{ width: "40px" }} /><col style={{ width: "180px" }} /><col style={{ width: "75px" }} /><col style={{ width: "60px" }} /><col style={{ width: "205px" }} /><col style={{ width: "80px" }} /><col style={{ width: "60px" }} /><col style={{ width: "95px" }} /><col style={{ width: "155px" }} /><col style={{ width: "175px" }} /></colgroup>
              <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500"><tr>{["Status", "Website", "Evidence score", "Top", "Privacy / CMP", "Time", "From", "Freshness", "Scanned", "Actions"].map((label) => <th className="border-b border-slate-200 px-2.5 py-1.5 font-semibold" key={label}>{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {visibleGroups.map((group) => {
                  const latest = group.scans[0];
                  if (!latest) return null;
                  const status = statusIndicator(latest);
                  const marker = getScanFromMarkerInput(latest.scanFromValue);
                  const earlier = group.scans.slice(1, 11);
                  return <tr className="h-[56px] hover:bg-slate-50/70" key={group.key}>
                    <td className="px-2.5 py-1.5 text-center" title={status.label}><span aria-label={status.label} className={`inline-block h-2.5 w-2.5 rounded-full ${status.className}`} /></td>
                    <td className="px-2.5 py-1.5"><p className="truncate font-semibold text-slate-900">{group.hostname ?? "Unknown website"}</p><p className="text-[10px] text-slate-400">{group.scans.length} scan{group.scans.length === 1 ? "" : "s"}</p></td>
                    <td className="px-2.5 py-1.5 font-semibold text-slate-900" title={[latest.scoreLabel, latest.scoreVersion, latest.scoreCoverageConfidence ? `${latest.scoreCoverageConfidence} coverage` : null, latest.scoreScoredAt ? `scored ${latest.scoreScoredAt}` : null].filter(Boolean).join(" · ") || undefined}>{latest.certscoreOverall !== null ? <><span>{latest.certscoreOverall}</span><span className="text-[11px] font-normal text-slate-400">/100</span></> : "—"}</td>
                    <td className="px-2.5 py-1.5 font-semibold text-slate-900">{latest.topFindingCount ?? "—"}</td>
                    <td className="px-2.5 py-1.5"><p>Privacy {latest.privacyPolicyPresent === true ? "✓" : latest.privacyPolicyPresent === false ? "—" : "?"}</p><p className="truncate text-slate-500" title={latest.cmpVendorName ?? undefined}>CMP {latest.cmpVendorName ?? "—"}</p></td>
                    <td className="px-2.5 py-1.5 font-medium">{formatDuration(latest)}</td>
                    <td className="px-2.5 py-1.5" title={latest.scanFromLabel}><ScanFromMarker flag={"flag" in marker ? marker.flag : undefined} icon={"icon" in marker ? marker.icon : undefined} selected /></td>
                    <td className="px-2.5 py-1.5"><span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{freshnessLabel(latest.freshRescanRequested)}</span></td>
                    <td className="px-2.5 py-1.5 text-[11px] text-slate-600">{formatDateTime(latest.completedAt ?? latest.createdAt)}</td>
                    <td className="px-2.5 py-1.5"><div className="flex items-center gap-1">
                      <PendingButtonLink ariaLabel="View latest scan" className="h-8 w-8 rounded-full border border-slate-300 bg-white p-0" href={`/app/scans/${latest.id}`} idleContent={<ViewIcon />} pendingContent="…" size="sm" title="View latest scan" variant="secondary" />
                      {earlier.length > 0 ? <details className="relative"><summary aria-label="Earlier scans" className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full border border-slate-300 bg-white [&::-webkit-details-marker]:hidden"><HistoryIcon /></summary><div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"><p className="px-2 py-1 text-xs font-semibold text-slate-900">Earlier scans</p>{earlier.map((scan) => <Link className="block rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50" href={`/app/scans/${scan.id}`} key={scan.id}>{formatDateTime(scan.completedAt ?? scan.createdAt)} · {scan.certscoreOverall ?? "—"}<span className="text-slate-400">/100 · {scan.scoreLabel ?? "Not scored"}</span></Link>)}</div></details> : null}
                    </div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </>}
      </CardContent>
    </Card>
  );
}
