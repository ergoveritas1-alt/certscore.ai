import Link from "next/link";
import type { PlanCode } from "@website-signal-risk-scanner/shared";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { RescanDomainForm } from "../../../components/scans/rescan-domain-form";
import { ScanHistoryLiveRefresh } from "../../../components/scans/scan-history-live-refresh";
import { getRescanAvailability } from "../../../lib/scans/rescan-policy";
import { getDashboardContext } from "../../../server/auth";
import { getOrganizationScans } from "../../../server/scans/get-organization-scans";

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
  }>;
};

export default async function ScansPage({ searchParams }: ScansPageProps) {
  const { organization } = await getDashboardContext();
  const scans = await getOrganizationScans(organization.id);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const focusScanId = resolvedSearchParams.focusScanId ?? null;
  const hasActiveScans = scans.some((scan) => scan.status === "queued" || scan.status === "running");
  const completedCount = scans.filter((scan) => scan.status === "completed").length;
  const runningCount = scans.filter((scan) => scan.status === "running").length;
  const queuedCount = scans.filter((scan) => scan.status === "queued").length;
  const totalSignals = scans.reduce((sum, scan) => sum + (scan.totalSignals ?? 0), 0);

  return (
    <div className="space-y-8 pb-6">
      <ScanHistoryLiveRefresh enabled={hasActiveScans} />
      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(103,199,240,0.24),_transparent_36%),linear-gradient(135deg,#ffffff_0%,#f3fbff_56%,#eef9f2_100%)] shadow-panel">
        <div className="grid gap-6 px-6 py-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)] lg:px-8 lg:py-8">
          <div className="space-y-4">
            <Badge className="bg-white/80 text-sky-800 ring-1 ring-sky-100">Workspace scan activity</Badge>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">Scan History</h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                Review queued, running, and completed scans across your workspace with a faster read on what changed and what needs attention next.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-slate-600">
              <div className="rounded-full bg-white/85 px-4 py-2 ring-1 ring-slate-200">
                <span className="font-semibold text-slate-900">{scans.length}</span> total scans
              </div>
              <div className="rounded-full bg-white/85 px-4 py-2 ring-1 ring-slate-200">
                <span className="font-semibold text-slate-900">{totalSignals}</span> signals captured
              </div>
              {hasActiveScans ? (
                <div className="rounded-full bg-emerald-50 px-4 py-2 text-emerald-800 ring-1 ring-emerald-100">
                  Live updates every 3 seconds while work is in progress
                </div>
              ) : (
                <div className="rounded-full bg-white/85 px-4 py-2 ring-1 ring-slate-200">No active scans right now</div>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-[0_14px_36px_rgba(15,23,42,0.06)] backdrop-blur">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Completed</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{completedCount}</p>
              <p className="mt-1 text-sm text-slate-500">Scans ready for review</p>
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-[0_14px_36px_rgba(15,23,42,0.06)] backdrop-blur">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Running</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{runningCount}</p>
              <p className="mt-1 text-sm text-slate-500">Actively processing now</p>
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-[0_14px_36px_rgba(15,23,42,0.06)] backdrop-blur">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Queued</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{queuedCount}</p>
              <p className="mt-1 text-sm text-slate-500">Waiting to start</p>
            </div>
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
                    <th className="pb-3 pr-4 font-medium">Signals</th>
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
                      <td className="py-4 pr-4 text-slate-600">{scan.totalSignals ?? 0}</td>
                      <td className="py-4 pr-4 text-slate-600">
                        +{scan.addedCount} / -{scan.removedCount} / ~{scan.changedCount}
                      </td>
                      <td className="py-4 pr-4 text-slate-600">{formatDateTime(scan.createdAt)}</td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <Button
                            asChild
                            className="h-11 w-11 rounded-full border-0 bg-[linear-gradient(180deg,#62cf63_0%,#4fbe51_100%)] p-0 text-white shadow-[0_10px_24px_rgba(79,190,81,0.24)] hover:brightness-[1.03]"
                            size="sm"
                            variant="secondary"
                          >
                            <Link aria-label="View scan details" href={`/app/scans/${scan.id}`}>
                              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 19V5" />
                                <path d="m5 12 7-7 7 7" />
                              </svg>
                            </Link>
                          </Button>
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
                        <Badge tone={getStatusBadgeTone(scan.status)}>{formatStatus(scan.status)}</Badge>
                        <div>
                          <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                            {scan.domainHostname ?? "Unknown website"}
                          </h2>
                          <p className="text-sm text-slate-500">{getStatusCopy(scan.status)}</p>
                        </div>
                      </div>
                      <Button
                        asChild
                        className="h-11 w-11 rounded-full border-0 bg-[linear-gradient(180deg,#62cf63_0%,#4fbe51_100%)] p-0 text-white shadow-[0_10px_24px_rgba(79,190,81,0.24)] hover:brightness-[1.03]"
                        size="sm"
                        variant="secondary"
                      >
                        <Link aria-label="View scan details" href={`/app/scans/${scan.id}`}>
                          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 19V5" />
                            <path d="m5 12 7-7 7 7" />
                          </svg>
                        </Link>
                      </Button>
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
