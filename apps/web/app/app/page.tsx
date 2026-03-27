import type { PlanCode } from "@website-signal-risk-scanner/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { AddDomainForm } from "../../components/domains/add-domain-form";
import { RescanDomainForm } from "../../components/scans/rescan-domain-form";
import { PendingButtonLink } from "../../components/ui/pending-link";
import { getRescanAvailability } from "../../lib/scans/rescan-policy";
import { getDashboardContext } from "../../server/auth";
import { listOrganizationChanges } from "../../server/changes/list-organization-changes";
import { getOrganizationDomains } from "../../server/domains/get-organization-domains";
import { getPlanLimits } from "../../server/plans/get-plan-limits";
import { getOrganizationScans } from "../../server/scans/get-organization-scans";
import { getOrganizationSignalOverview } from "../../server/signals/get-organization-signal-overview";

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
  if (!nextAllowedAt) {
    return "This website was scanned recently. Please try again later.";
  }

  const formattedTime = formatDateTime(nextAllowedAt);
  return planCode === "free"
    ? `Free plans can re-scan once every 30 days. Try again after ${formattedTime}.`
    : `This website was scanned recently. Try again after ${formattedTime}.`;
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

export default async function DashboardPage() {
  const { organization } = await getDashboardContext();
  const [domains, planLimits, recentScans, recentChanges, signalOverview] = await Promise.all([
    getOrganizationDomains(organization.id),
    getPlanLimits(organization.plan),
    getOrganizationScans(organization.id),
    listOrganizationChanges(organization.id, 5),
    getOrganizationSignalOverview(organization.id)
  ]);

  const recentScansByDomain = recentScans.reduce<
    Array<{
      key: string;
      domainId: string | null;
      hostname: string | null;
      scans: typeof recentScans;
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
  }, []);

  return (
    <div className="space-y-3">
      <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-1.5">
            <CardTitle>Domains</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5 pb-4 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">
              {domains.length}/{planLimits.maxDomains}
            </p>
            <p>Tracked domains in this workspace.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-1.5">
            <CardTitle>Scans</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5 pb-4 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">{recentScans.length}</p>
            <p>Queued, running, or completed scans.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-1.5">
            <CardTitle>Recent changes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5 pb-4 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">{recentChanges.length}</p>
            <p>Signal changes.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-1.5">
          <CardTitle>Add domain(s) to scan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <AddDomainForm maxDomains={planLimits.maxDomains} planCode={organization.plan} />
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Recent scan history</CardTitle>
              <p className="text-sm text-slate-500">Newest domain activity first.</p>
            </div>
            <p className="text-sm text-slate-500">{recentScansByDomain.length} domains with recent scans</p>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {recentScans.length === 0 ? (
            <p className="text-sm text-slate-600">No scans yet. Add a website to start building scan history.</p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-slate-50/40">
              {recentScansByDomain.map((group) => {
                const latestScan = group.scans[0];
                if (!latestScan) {
                  return null;
                }

                const rescanAvailability =
                  group.domainId
                    ? getRescanAvailability({
                        activeScanExists: latestScan.domainActiveScanExists,
                        lastScannedAt: latestScan.domainLastScannedAt,
                        planCode: organization.plan
                      })
                    : null;

                const cooldownMessage = rescanAvailability
                  ? rescanAvailability.reason ??
                    (!rescanAvailability.allowed
                      ? formatRescanCooldownMessage(rescanAvailability.nextAllowedAt, organization.plan)
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
                          <span>
                            <span className="font-medium text-slate-900">{latestScan.scanType}</span> · {latestScan.status}
                          </span>
                          <span>Signals {latestScan.totalSignals ?? 0}</span>
                          {latestScan.certscoreOverall !== null ? <span>Overall {latestScan.certscoreOverall}</span> : null}
                          {latestScan.cmpVendorName ? <span>CMP {latestScan.cmpVendorName}</span> : null}
                          {latestScan.cookieBannerPresent === false ? <span>Banner not visible</span> : null}
                        </div>
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
                              compact
                              cooldownMessage={cooldownMessage}
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
          )}
        </CardContent>
      </Card>

    </div>
  );
}
