import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlanDefinition } from "@website-signal-risk-scanner/shared";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { QueueFullScanForm } from "../../../../components/scans/queue-full-scan-form";
import { getDashboardContext } from "../../../../server/auth";
import { getDomainById } from "../../../../server/domains/get-domain-by-id";
import { updateDomainScanFrequencyFormAction } from "../../../../server/domains/update-domain-scan-frequency";
import { getDomainScanHistory } from "../../../../server/history/get-domain-scan-history";
import { getPlanLimits } from "../../../../server/plans/get-plan-limits";
import { getDomainMonitoringState } from "../../../../server/scheduling/get-domain-monitoring-state";
import { getQueueAvailability } from "../../../../lib/env";

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

function formatScheduledAt(value: string | null, dueNow: boolean) {
  if (dueNow) {
    return "Due now";
  }

  if (!value) {
    return "Manual scheduling only";
  }

  return formatDateTime(value);
}

type DomainDetailPageProps = {
  params: Promise<{
    domainId: string;
  }>;
};

export default async function DomainDetailPage({ params }: DomainDetailPageProps) {
  const [{ domainId }, { organization }] = await Promise.all([params, getDashboardContext()]);
  const [domainRecord, planLimits, scanHistory, monitoringState] = await Promise.all([
    getDomainById({
      domainId,
      organizationId: organization.id
    }),
    getPlanLimits(organization.plan),
    getDomainScanHistory({
      domainId,
      organizationId: organization.id
    }),
    getDomainMonitoringState({
      domainId,
      organizationId: organization.id
    })
  ]);

  if (!domainRecord) {
    notFound();
  }

  const latestScan = scanHistory[0] ?? null;
  const queueAvailability = getQueueAvailability();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Badge tone="neutral">{organization.plan} plan</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">{domainRecord.domain.hostname}</h1>
          <p className="max-w-3xl text-slate-600">
            {domainRecord.domain.normalizedUrl} is configured for repeatable scanning, signal summaries, and change tracking.
          </p>
        </div>

        <QueueFullScanForm
          domainId={domainRecord.domain.id}
          disabled={!queueAvailability.enabled}
          unavailableReason={queueAvailability.reason}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Scan profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p>Plan profile: {planLimits.scanProfile}</p>
            <p>Coverage: {getPlanDefinition(planLimits.planCode).coverageLabel}</p>
            <p>Frequency target: {monitoringState?.effectiveFrequency ?? domainRecord.domain.scanFrequency ?? planLimits.scanFrequency}</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Latest scan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p>Status: {latestScan ? formatStatus(latestScan.status) : "Not started"}</p>
            <p>Queued at: {formatDateTime(latestScan?.createdAt ?? null)}</p>
            <p>Completed at: {formatDateTime(latestScan?.completedAt ?? null)}</p>
            <p>Signals: {latestScan?.totalSignals ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Latest change summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            {latestScan ? (
              <>
                <p>Added: {latestScan.addedCount}</p>
                <p>Removed: {latestScan.removedCount}</p>
                <p>Changed: {latestScan.changedCount}</p>
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/app/scans/${latestScan.id}`}>Open latest scan</Link>
                </Button>
              </>
            ) : (
              <>
                <p>No completed scan is available yet.</p>
                <p>Run the first scan to start tracking change history.</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Monitoring schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-2xl font-semibold text-slate-900">{monitoringState?.effectiveFrequency ?? "manual"}</p>
              <p>Effective frequency</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-slate-900">{formatScheduledAt(monitoringState?.nextScheduledAt ?? null, monitoringState?.isDue ?? false)}</p>
              <p>Next scheduled scan</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-slate-900">{formatDateTime(monitoringState?.lastCompletedScanAt ?? null)}</p>
              <p>Last completed scan</p>
            </div>
          </div>

          <form action={updateDomainScanFrequencyFormAction} className="grid gap-4 md:grid-cols-[1fr,auto]">
            <input name="domainId" type="hidden" value={domainRecord.domain.id} />
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor="scanFrequency">
                Website scan frequency
              </label>
              <select
                className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                defaultValue={domainRecord.domain.scanFrequency ?? monitoringState?.effectiveFrequency ?? planLimits.scanFrequency}
                id="scanFrequency"
                name="scanFrequency"
              >
                <option value="manual">Manual</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="md:self-end">
              <Button type="submit" variant="secondary">Save frequency</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Scan history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {scanHistory.length === 0 ? (
            <p className="text-sm text-slate-600">
              No scans have been created yet. Queue the first scan to establish scan history for this website.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-3 pr-4 font-medium">Scan</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Signals</th>
                    <th className="pb-3 pr-4 font-medium">Changes</th>
                    <th className="pb-3 pr-4 font-medium">Created</th>
                    <th className="pb-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scanHistory.map((scan) => (
                    <tr key={scan.id}>
                      <td className="py-4 pr-4 text-slate-900">{scan.scanType}</td>
                      <td className="py-4 pr-4 text-slate-600">{formatStatus(scan.status)}</td>
                      <td className="py-4 pr-4 text-slate-600">{scan.totalSignals ?? 0}</td>
                      <td className="py-4 pr-4 text-slate-600">
                        +{scan.addedCount} / -{scan.removedCount} / ~{scan.changedCount}
                      </td>
                      <td className="py-4 pr-4 text-slate-600">{formatDateTime(scan.createdAt)}</td>
                      <td className="py-4">
                        <Button
                          asChild
                          className="h-11 w-11 rounded-full border-0 bg-[linear-gradient(180deg,#62cf63_0%,#4fbe51_100%)] p-0 text-white shadow-[0_10px_24px_rgba(79,190,81,0.24)] hover:brightness-[1.03]"
                          size="sm"
                          variant="secondary"
                        >
                          <Link aria-label={`View scan for ${scan.scanType}`} href={`/app/scans/${scan.id}`}>
                            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 19V5" />
                              <path d="m5 12 7-7 7 7" />
                            </svg>
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
