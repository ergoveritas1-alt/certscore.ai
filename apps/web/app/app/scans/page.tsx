import Link from "next/link";
import type { PlanCode } from "@website-signal-risk-scanner/shared";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
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
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
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

  return (
    <div className="space-y-8">
      <ScanHistoryLiveRefresh enabled={hasActiveScans} />
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Scan History</h1>
        <p className="max-w-3xl text-slate-600">
          Review queued, running, and completed scans across your workspace.
        </p>
        {hasActiveScans ? (
          <p className="text-sm text-slate-500">Live updates are on while queued or running scans are in progress.</p>
        ) : null}
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Recent scans</CardTitle>
        </CardHeader>
        <CardContent>
          {scans.length === 0 ? (
            <p className="text-sm text-slate-600">
              No scans have been created yet. Add a website to queue the first scan.
            </p>
          ) : (
            <div className="overflow-x-auto">
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
                      <td className="py-4 pr-4 text-slate-900">{scan.domainHostname ?? "Unknown website"}</td>
                      <td className="py-4 pr-4 text-slate-600">{scan.scanType}</td>
                      <td className="py-4 pr-4 text-slate-600">{formatStatus(scan.status)}</td>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
