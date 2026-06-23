"use client";

import { useMemo, useState } from "react";
import type { PlanCode } from "@website-signal-risk-scanner/shared/types/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { getScanThrottleCopy } from "../../lib/scan-access";
import { getRescanAvailability } from "../../lib/scans/rescan-policy";
import type { OrganizationScanListItem } from "../../server/scans/get-organization-scans";
import { FreshRescanBadge } from "../scans/fresh-rescan-badge";
import { RescanDomainForm } from "../scans/rescan-domain-form";
import type { ServerScanFrom } from "../scans/scan-from-select";
import { PendingButtonLink } from "../ui/pending-link";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const DEFAULT_SCAN_HISTORY_PAGE_SIZE = 20;

function formatDateTime(value: string | null) {
  if (!value) {
    return "No activity yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(value));
}

function formatRescanCooldownMessage(nextAllowedAt: string | null, planCode: PlanCode) {
  void planCode;

  if (!nextAllowedAt) {
    return getScanThrottleCopy();
  }

  return getScanThrottleCopy(formatDateTime(nextAllowedAt));
}

function ViewScanIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ScanHistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function DomainRowActionButton({
  children,
  tooltip
}: {
  children: React.ReactNode;
  tooltip: string;
}) {
  return (
    <div className="group relative inline-flex">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-lg group-hover:block">
        {tooltip}
      </div>
    </div>
  );
}

function getPrimaryBadgeClassName(scan: OrganizationScanListItem) {
  if (scan.interruptionLabel) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (scan.scanQualityLevel === "high") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (scan.scanQualityLevel === "moderate") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }

  return "border-amber-200 bg-amber-50 text-amber-800";
}

function getPrimaryBadgeLabel(scan: OrganizationScanListItem) {
  return scan.interruptionLabel ?? scan.scanQualityLabel;
}

type OverviewScanHistoryCardProps = {
  allowRestrictedScanOptions?: boolean;
  defaultScanFrom?: ServerScanFrom;
  planCode: PlanCode;
  rescanCooldownMs?: number;
  scans: OrganizationScanListItem[];
};

export function OverviewScanHistoryCard({
  allowRestrictedScanOptions = false,
  defaultScanFrom = "eu_ie",
  planCode,
  rescanCooldownMs,
  scans
}: OverviewScanHistoryCardProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_SCAN_HISTORY_PAGE_SIZE);
  const scanGroups = useMemo(
    () =>
      scans.reduce<
        Array<{
          key: string;
          domainId: string | null;
          hostname: string | null;
          scans: OrganizationScanListItem[];
        }>
      >((groups, scan) => {
        const key = scan.domainId ?? scan.domainHostname ?? scan.id;
        const existingGroup = groups.find((group) => group.key === key);

        if (existingGroup) {
          existingGroup.scans.push(scan);
          return groups;
        }

        groups.push({
          key,
          domainId: scan.domainId,
          hostname: scan.domainHostname,
          scans: [scan]
        });

        return groups;
      }, []),
    [scans]
  );

  const totalPages = Math.max(1, Math.ceil(scanGroups.length / pageSize));
  const normalizedPage = Math.min(currentPage, totalPages);
  const pageStart = (normalizedPage - 1) * pageSize;
  const visibleGroups = scanGroups.slice(pageStart, pageStart + pageSize);

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Scan history</CardTitle>
            <p className="text-sm text-slate-500">Newest domain activity first.</p>
          </div>
          <p className="text-sm text-slate-500">{scanGroups.length} domains with recent scans</p>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {scans.length === 0 ? (
          <p className="text-sm text-slate-600">No scans yet. Add a website to start building scan history.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                Showing {scanGroups.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + visibleGroups.length, scanGroups.length)} of{" "}
                {scanGroups.length} scan history items · Page {normalizedPage} of {totalPages}
              </p>
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                <select
                  className="h-9 rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-700"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setCurrentPage(1);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option} per page
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={normalizedPage <= 1}
                  className={[
                    "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition",
                    normalizedPage <= 1
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-950"
                  ].join(" ")}
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={normalizedPage >= totalPages}
                  className={[
                    "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition",
                    normalizedPage >= totalPages
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-950"
                  ].join(" ")}
                >
                  Next
                </button>
              </div>
            </div>
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-slate-50/40">
              {visibleGroups.map((group) => {
                const latestScan = group.scans[0];
                if (!latestScan) {
                  return null;
                }

                const rescanAvailability =
                  group.domainId
                    ? getRescanAvailability({
                        activeScanExists: latestScan.domainActiveScanExists,
                        lastScannedAt: latestScan.domainLastScannedAt,
                        planCode,
                        rescanCooldownMs
                      })
                    : null;

                const cooldownMessage = rescanAvailability
                  ? rescanAvailability.reason ??
                    (!rescanAvailability.allowed
                      ? formatRescanCooldownMessage(rescanAvailability.nextAllowedAt, planCode)
                      : null)
                  : null;
                const earlierScans = group.scans.slice(1, 11);
                return (
                  <div key={group.key} className="px-4 py-3 first:rounded-t-2xl last:rounded-b-2xl">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div>
                          <p className="truncate font-medium text-slate-900">{group.hostname ?? "Unknown website"}</p>
                          <p className="text-xs text-slate-500">
                            {group.scans.length} scan{group.scans.length === 1 ? "" : "s"} · newest {formatDateTime(latestScan.createdAt)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                          <span className="font-medium text-slate-900">{latestScan.status}</span>
                          <span
                            className={[
                              "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                              getPrimaryBadgeClassName(latestScan)
                            ].join(" ")}
                            title={latestScan.interruptionReason ?? getPrimaryBadgeLabel(latestScan)}
                          >
                            {getPrimaryBadgeLabel(latestScan)}
                          </span>
                          <span>Signals {latestScan.totalSignals ?? 0}</span>
                          <span>Findings {latestScan.findingCount}</span>
                          {latestScan.topFindingCount !== null ? <span>Top findings {latestScan.topFindingCount}</span> : null}
                          {latestScan.certscoreOverall !== null ? <span>Overall {latestScan.certscoreOverall}</span> : null}
                          {latestScan.cmpVendorName ? <span>CMP {latestScan.cmpVendorName}</span> : null}
                          {latestScan.cookieBannerPresent === false ? <span>Banner not visible</span> : null}
                          <FreshRescanBadge value={latestScan.freshRescanRequested} />
                        </div>
                        {latestScan.scanQualityWarning && latestScan.scanQualityWarning !== latestScan.interruptionReason ? (
                          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            {latestScan.scanQualityWarning}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-start gap-2 self-start sm:pt-0.5">
                        <DomainRowActionButton tooltip="View latest scan">
                          <PendingButtonLink
                            href={`/app/scans/${latestScan.id}`}
                            ariaLabel="View latest scan"
                            idleContent={<ViewScanIcon />}
                            pendingContent="Opening..."
                            size="sm"
                            variant="secondary"
                            className="h-8 w-8 rounded-full border border-slate-300 bg-white p-0 text-slate-700 shadow-sm hover:border-slate-400 hover:text-slate-950"
                            title="View latest scan"
                          />
                        </DomainRowActionButton>
                        <DomainRowActionButton tooltip="List earlier scans">
                          <details className="relative">
                            <summary
                              className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-950 [&::-webkit-details-marker]:hidden"
                              aria-label="List earlier scans"
                              title="List earlier scans"
                            >
                              <ScanHistoryIcon />
                            </summary>
                            <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                              <div className="border-b border-slate-100 px-3 py-2">
                                <p className="text-sm font-medium text-slate-900">Earlier scans</p>
                                <p className="text-xs text-slate-500">
                                  {earlierScans.length > 0
                                    ? `Showing up to ${earlierScans.length} earlier scans for ${group.hostname ?? "this domain"}.`
                                    : `No earlier scans available for ${group.hostname ?? "this domain"}.`}
                                </p>
                              </div>
                              {earlierScans.length > 0 ? (
                                <div className="max-h-80 overflow-y-auto py-1">
                                  {earlierScans.map((scan) => (
                                    <a
                                      key={scan.id}
                                      href={`/app/scans/${scan.id}`}
                                      className="block rounded-xl px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                                    >
                                      <span className="block font-medium text-slate-900">
                                        {scan.scanType} · {scan.status}
                                      </span>
                                      <span className="block text-xs text-slate-500">{formatDateTime(scan.createdAt)}</span>
                                      <span className="mt-1 block">
                                        <FreshRescanBadge value={scan.freshRescanRequested} />
                                      </span>
                                    </a>
                                  ))}
                                </div>
                              ) : (
                                <p className="px-3 py-3 text-sm text-slate-500">No earlier scans yet.</p>
                              )}
                            </div>
                          </details>
                        </DomainRowActionButton>
                        {group.domainId && rescanAvailability ? (
                          <DomainRowActionButton tooltip={rescanAvailability.allowed ? "Re-scan domain" : cooldownMessage ?? "Re-scan unavailable"}>
                            <RescanDomainForm
                              allowRestrictedScanOptions={allowRestrictedScanOptions}
                              compact
                              cooldownMessage={cooldownMessage}
                              defaultScanFrom={defaultScanFrom}
                              disabled={!rescanAvailability.allowed}
                              domainId={group.domainId}
                              showLabel
                            />
                          </DomainRowActionButton>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
