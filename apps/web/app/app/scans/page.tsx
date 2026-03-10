import Link from "next/link";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { ScanHistoryLiveRefresh } from "../../../components/scans/scan-history-live-refresh";
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
                        <Button asChild size="sm" variant="secondary">
                          <Link href="/app/signals">View scan</Link>
                        </Button>
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
