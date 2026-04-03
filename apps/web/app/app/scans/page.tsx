import Link from "next/link";
import type { PlanCode } from "@website-signal-risk-scanner/shared";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { RescanDomainForm } from "../../../components/scans/rescan-domain-form";
import { ScanHistoryLiveRefresh } from "../../../components/scans/scan-history-live-refresh";
import { PendingButtonLink } from "../../../components/ui/pending-link";
import { getRescanAvailability } from "../../../lib/scans/rescan-policy";
import { getDashboardContext } from "../../../server/auth";
import { getOrganizationScansPage } from "../../../server/scans/get-organization-scans";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
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

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getStatusBadgeTone(status: string): "neutral" | "warning" | "success" {
  if (status === "completed") {
    return "success";
  }

  if (status === "failed") {
    return "warning";
  }

  return "neutral";
}

function getStatusCopy(status: string) {
  if (status === "completed") {
    return "Ready for review";
  }

  if (status === "running") {
    return "Actively scanning";
  }

  if (status === "queued") {
    return "Waiting in queue";
  }

  if (status === "failed") {
    return "Needs another pass";
  }

  return "Status updated";
}

function getQualityTone(level: "high" | "moderate" | "low"): "neutral" | "warning" | "success" {
  if (level === "high") {
    return "success";
  }

  if (level === "moderate") {
    return "neutral";
  }

  return "warning";
}

function getPrimaryBadgeTone(scan: Awaited<ReturnType<typeof getOrganizationScansPage>>["items"][number]): "neutral" | "warning" | "success" {
  if (scan.interruptionLabel) {
    return "warning";
  }

  return getQualityTone(scan.scanQualityLevel);
}

function getPrimaryBadgeLabel(scan: Awaited<ReturnType<typeof getOrganizationScansPage>>["items"][number]) {
  return scan.interruptionLabel ?? scan.scanQualityLabel;
}

function formatRescanCooldownMessage(value: string | null, planCode: PlanCode) {
  if (!value) {
    return "This domain cannot be re-scanned yet.";
  }

  return `Next re-scan available ${formatDateTime(value)} for this ${
    planCode === "free" ? "Free" : planCode === "pro" ? "Pro" : "Ultra"
  } plan domain.`;
}

type ScansPageProps = {
  searchParams?: Promise<{
    focusScanId?: string;
    page?: string;
  }>;
};

export default async function ScansPage({ searchParams }: ScansPageProps) {
  const { organization } = await getDashboardContext();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const page = Number.parseInt(resolvedSearchParams.page ?? "1", 10);
  const result = await getOrganizationScansPage(organization.id, {
    page: Number.isFinite(page) && page > 0 ? page : 1
  });
  const scans = result.items;
  const focusScanId = resolvedSearchParams.focusScanId ?? null;
  const hasActiveScans = scans.some((scan) => scan.status === "queued" || scan.status === "running");
  const completedCount = scans.filter((scan) => scan.status === "completed").length;
  const runningCount = scans.filter((scan) => scan.status === "running").length;
  const queuedCount = scans.filter((scan) => scan.status === "queued").length;
  const totalSignals = scans.reduce((sum, scan) => sum + (scan.totalSignals ?? 0), 0);
  const pageStart = result.totalCount === 0 ? 0 : (result.page - 1) * 25 + 1;
  const pageEnd = pageStart === 0 ? 0 : pageStart + scans.length - 1;
  const pageQuery = (targetPage: number) => {
    const params = new URLSearchParams();
    params.set("page", String(targetPage));
    if (focusScanId) {
      params.set("focusScanId", focusScanId);
    }

    return params.toString();
  };

  return (
    <div className="space-y-6 pb-6">
      <ScanHistoryLiveRefresh enabled={hasActiveScans} />
      <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-panel sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">Scan History</h1>
              <Badge className="bg-slate-100 text-slate-700 ring-1 ring-slate-200">Workspace</Badge>
            </div>
            <p className="text-sm text-slate-600">
              Review recent scans and jump straight into anything running or ready for review.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-sm text-slate-600 lg:justify-end">
            <div className="rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">
              <span className="font-semibold text-slate-900">{result.totalCount}</span> scans
            </div>
            <div className="rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">
              <span className="font-semibold text-slate-900">{totalSignals}</span> signals on page
            </div>
            <div className="rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">
              <span className="font-semibold text-slate-900">{completedCount}</span> completed on page
            </div>
            <div className="rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">
              <span className="font-semibold text-slate-900">{runningCount}</span> running on page
            </div>
            <div className="rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">
              <span className="font-semibold text-slate-900">{queuedCount}</span> queued on page
            </div>
            {hasActiveScans ? (
              <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-800 ring-1 ring-emerald-100">
                Live refresh on
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <CardTitle>Recent scans</CardTitle>
              <p className="text-sm text-slate-500">A dense list for desktop, plus stacked cards for smaller screens.</p>
            </div>
            <p className="text-sm text-slate-500">Newest scans appear first.</p>
          </div>
        </CardHeader>
        <CardContent>
          {scans.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
              <p className="text-base font-medium text-slate-900">No scans have been created yet.</p>
              <p className="mt-2 text-sm text-slate-600">Add a website to queue the first scan and start building a history here.</p>
            </div>
          ) : (
            <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-3 pr-4 font-medium">Website</th>
                    <th className="pb-3 pr-4 font-medium">Type</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Scan state</th>
                    <th className="pb-3 pr-4 font-medium">Signals</th>
                    <th className="pb-3 pr-4 font-medium">Findings</th>
                    <th className="pb-3 pr-4 font-medium">Changes</th>
                    <th className="pb-3 pr-4 font-medium">Created</th>
                    <th className="pb-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scans.map((scan) => {
                    const isFocusedScan = focusScanId === scan.id;
                    const canRescan = scan.status === "completed" && Boolean(scan.domainId);
                    const rescanAvailability = canRescan
                      ? getRescanAvailability({
                          activeScanExists: scan.domainActiveScanExists,
                          lastScannedAt: scan.domainLastScannedAt,
                          planCode: organization.plan
                        })
                      : null;
                    const cooldownMessage =
                      canRescan && rescanAvailability
                        ? rescanAvailability.reason
                          ? rescanAvailability.reason
                          : !rescanAvailability.allowed
                            ? formatRescanCooldownMessage(rescanAvailability.nextAllowedAt, organization.plan)
                            : null
                        : null;

                    return (
                    <tr
                      id={`scan-${scan.id}`}
                      key={scan.id}
                      className={isFocusedScan ? "bg-emerald-50/70" : undefined}
                    >
                      <td className="py-4 pr-4">
                        <div className="space-y-1">
                          <p className="font-medium text-slate-900">{scan.domainHostname ?? "Unknown website"}</p>
                          <p className="text-xs text-slate-500">{getStatusCopy(scan.status)}</p>
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-slate-600">{scan.scanType}</td>
                      <td className="py-4 pr-4 text-slate-600">
                        <Badge tone={getStatusBadgeTone(scan.status)}>{formatStatus(scan.status)}</Badge>
                      </td>
                      <td className="py-4 pr-4 text-slate-600">
                        <div className="space-y-1">
                          <Badge tone={getPrimaryBadgeTone(scan)}>{getPrimaryBadgeLabel(scan)}</Badge>
                          {scan.interruptionReason ? <p className="text-xs text-amber-700">{scan.interruptionReason}</p> : null}
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-slate-600">{scan.totalSignals ?? 0}</td>
                      <td className="py-4 pr-4 text-slate-600">{scan.findingCount}</td>
                      <td className="py-4 pr-4 text-slate-600">
                        +{scan.addedCount} / -{scan.removedCount} / ~{scan.changedCount}
                      </td>
                      <td className="py-4 pr-4 text-slate-600">{formatDateTime(scan.createdAt)}</td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <PendingButtonLink
                            ariaLabel="View scan details"
                            className="h-11 w-11 rounded-full border-0 bg-[linear-gradient(180deg,#62cf63_0%,#4fbe51_100%)] p-0 text-white shadow-[0_10px_24px_rgba(79,190,81,0.24)] hover:brightness-[1.03]"
                            href={`/app/scans/${scan.id}`}
                            idleContent={
                              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 19V5" />
                                <path d="m5 12 7-7 7 7" />
                              </svg>
                            }
                            pendingContent={<span className="text-[10px] font-semibold uppercase tracking-[0.12em]">...</span>}
                            size="sm"
                            variant="secondary"
                          />
                          {canRescan && scan.domainId && rescanAvailability ? (
                            <RescanDomainForm
                              cooldownMessage={cooldownMessage}
                              disabled={!rescanAvailability.allowed}
                              domainId={scan.domainId}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid gap-4 lg:hidden">
              {scans.map((scan) => {
                const isFocusedScan = focusScanId === scan.id;
                const canRescan = scan.status === "completed" && Boolean(scan.domainId);
                const rescanAvailability = canRescan
                  ? getRescanAvailability({
                      activeScanExists: scan.domainActiveScanExists,
                      lastScannedAt: scan.domainLastScannedAt,
                      planCode: organization.plan
                    })
                  : null;
                const cooldownMessage =
                  canRescan && rescanAvailability
                    ? rescanAvailability.reason
                      ? rescanAvailability.reason
                      : !rescanAvailability.allowed
                        ? formatRescanCooldownMessage(rescanAvailability.nextAllowedAt, organization.plan)
                        : null
                    : null;

                return (
                  <article
                    id={`scan-${scan.id}`}
                    key={scan.id}
                    className={[
                      "rounded-[28px] border p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]",
                      isFocusedScan ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white"
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={getStatusBadgeTone(scan.status)}>{formatStatus(scan.status)}</Badge>
                          <Badge tone={getPrimaryBadgeTone(scan)}>{getPrimaryBadgeLabel(scan)}</Badge>
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                            {scan.domainHostname ?? "Unknown website"}
                          </h2>
                          <p className="text-sm text-slate-500">{getStatusCopy(scan.status)}</p>
                        </div>
                      </div>
                      <PendingButtonLink
                        ariaLabel="View scan details"
                        className="h-11 w-11 rounded-full border-0 bg-[linear-gradient(180deg,#62cf63_0%,#4fbe51_100%)] p-0 text-white shadow-[0_10px_24px_rgba(79,190,81,0.24)] hover:brightness-[1.03]"
                        href={`/app/scans/${scan.id}`}
                        idleContent={
                          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 19V5" />
                            <path d="m5 12 7-7 7 7" />
                          </svg>
                        }
                        pendingContent={<span className="text-[10px] font-semibold uppercase tracking-[0.12em]">...</span>}
                        size="sm"
                        variant="secondary"
                      />
                    </div>

                    <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <dt className="text-slate-500">Type</dt>
                        <dd className="mt-1 font-medium text-slate-900">{scan.scanType}</dd>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <dt className="text-slate-500">Signals</dt>
                        <dd className="mt-1 font-medium text-slate-900">{scan.totalSignals ?? 0}</dd>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <dt className="text-slate-500">Findings</dt>
                        <dd className="mt-1 font-medium text-slate-900">{scan.findingCount}</dd>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <dt className="text-slate-500">Changes</dt>
                        <dd className="mt-1 font-medium text-slate-900">
                          +{scan.addedCount} / -{scan.removedCount} / ~{scan.changedCount}
                        </dd>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <dt className="text-slate-500">Created</dt>
                        <dd className="mt-1 font-medium text-slate-900">{formatDateTime(scan.createdAt)}</dd>
                      </div>
                    </dl>

                    {scan.scanQualityWarning && scan.scanQualityWarning !== scan.interruptionReason ? (
                      <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        {scan.scanQualityWarning}
                      </p>
                    ) : null}
                    {scan.interruptionReason ? <p className="mt-2 text-sm text-amber-700">{scan.interruptionReason}</p> : null}

                    {canRescan && scan.domainId && rescanAvailability ? (
                      <div className="mt-4 border-t border-slate-200 pt-4">
                        <RescanDomainForm
                          cooldownMessage={cooldownMessage}
                          disabled={!rescanAvailability.allowed}
                          domainId={scan.domainId}
                        />
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing {pageStart}-{pageEnd} of {result.totalCount} scans. Page {result.page} of {Math.max(1, result.pageCount)}.
              </p>
              <div className="flex gap-3">
                {result.page > 1 ? (
                  <Link
                    className="rounded-full border border-slate-300 px-4 py-2 transition hover:border-slate-400 hover:text-slate-950"
                    href={`/app/scans?${pageQuery(result.page - 1)}`}
                  >
                    Previous
                  </Link>
                ) : null}
                {result.page < result.pageCount ? (
                  <Link
                    className="rounded-full border border-slate-300 px-4 py-2 transition hover:border-slate-400 hover:text-slate-950"
                    href={`/app/scans?${pageQuery(result.page + 1)}`}
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
