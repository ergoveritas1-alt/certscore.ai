import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlanDefinition } from "@website-signal-risk-scanner/shared";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { MonitorSetupTimeline } from "../../../../components/monitor-site/monitor-setup-timeline";
import { QueueFullScanForm } from "../../../../components/scans/queue-full-scan-form";
import { PendingButtonLink } from "../../../../components/ui/pending-link";
import { PendingSubmitButton } from "../../../../components/ui/pending-submit-button";
import { getDashboardContext } from "../../../../server/auth";
import { getDomainById } from "../../../../server/domains/get-domain-by-id";
import { listIndustries } from "../../../../server/domains/list-industries";
import { updateDomainIndustryFormAction } from "../../../../server/domains/update-domain-industry";
import { updateDomainScanFrequencyFormAction } from "../../../../server/domains/update-domain-scan-frequency";
import { getDomainScanHistory } from "../../../../server/history/get-domain-scan-history";
import { getPlanLimits } from "../../../../server/plans/get-plan-limits";
import { getDomainMonitoringState } from "../../../../server/scheduling/get-domain-monitoring-state";
import { getDomainMonitorSiteSetup } from "../../../../server/monitor-site/get-domain-monitor-site-setup";
import { getQueueAvailability } from "../../../../lib/env";

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

function getQualityTone(level: "high" | "moderate" | "low"): "neutral" | "warning" | "success" {
  if (level === "high") {
    return "success";
  }

  if (level === "moderate") {
    return "neutral";
  }

  return "warning";
}

function getPrimaryBadgeTone(scan: NonNullable<Awaited<ReturnType<typeof getDomainScanHistory>>[number]>): "neutral" | "warning" | "success" {
  if (scan.interruptionLabel) {
    return "warning";
  }

  return getQualityTone(scan.scanQualityLevel);
}

function getPrimaryBadgeLabel(scan: NonNullable<Awaited<ReturnType<typeof getDomainScanHistory>>[number]>) {
  return scan.interruptionLabel ?? scan.scanQualityLabel;
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

function formatFrequency(value: string | null) {
  if (!value) {
    return "Not selected";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

type DomainDetailPageProps = {
  params: Promise<{
    domainId: string;
  }>;
};

export default async function DomainDetailPage({ params }: DomainDetailPageProps) {
  const [{ domainId }, { organization }] = await Promise.all([params, getDashboardContext()]);
  const [domainRecord, planLimits, scanHistory, monitoringState, monitorSiteSetup, industries] = await Promise.all([
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
    }),
    getDomainMonitorSiteSetup({
      domainId,
      organizationId: organization.id
    }),
    listIndustries()
  ]);
  const domainRecordResult = domainRecord;

  if (!domainRecordResult) {
    notFound();
  }

  const latestScan = scanHistory[0] ?? null;
  const queueAvailability = getQueueAvailability();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Badge tone="neutral">{organization.plan} plan</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">{domainRecordResult.domain.hostname}</h1>
          <p className="max-w-3xl text-slate-600">
            {domainRecordResult.domain.normalizedUrl} is configured for repeatable scanning, signal summaries, and change tracking.
          </p>
        </div>

        <QueueFullScanForm
          domainId={domainRecordResult.domain.id}
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
            <p>Frequency target: {monitoringState?.effectiveFrequency ?? domainRecordResult.domain.scanFrequency ?? planLimits.scanFrequency}</p>
            <p>Primary industry: {domainRecordResult.domain.industryPrimaryLabel ?? "Unassigned"}</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Latest scan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p>Status: {latestScan ? formatStatus(latestScan.status) : "Not started"}</p>
            {latestScan ? <p>Scan state: <Badge tone={getPrimaryBadgeTone(latestScan)}>{getPrimaryBadgeLabel(latestScan)}</Badge></p> : null}
            <p>Queued at: {formatDateTime(latestScan?.createdAt ?? null)}</p>
            <p>Completed at: {formatDateTime(latestScan?.completedAt ?? null)}</p>
            <p>Signals: {latestScan?.totalSignals ?? 0}</p>
            <p>Findings: {latestScan?.findingCount ?? 0}</p>
            {latestScan?.scanQualityWarning && latestScan.scanQualityWarning !== latestScan.interruptionReason ? <p>{latestScan.scanQualityWarning}</p> : null}
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
                <PendingButtonLink href={`/app/scans/${latestScan.id}`} idleContent="Open latest scan" pendingContent="Opening..." size="sm" variant="secondary" />
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
          <CardTitle>Industry classification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <p>Assign the primary industry used for segmentation, reporting, and admin workflows.</p>
          <form action={updateDomainIndustryFormAction} className="grid gap-4 md:grid-cols-[1fr,auto]">
            <input name="domainId" type="hidden" value={domainRecordResult.domain.id} />
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor="industryPrimaryId">
                Primary industry
              </label>
              <select
                className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                defaultValue={domainRecordResult.domain.industryPrimaryId ?? ""}
                id="industryPrimaryId"
                name="industryPrimaryId"
              >
                <option value="">Unassigned</option>
                {industries.map((industry) => (
                  <option key={industry.id} value={industry.id}>
                    {industry.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:self-end">
              <PendingSubmitButton idleContent="Save industry" pendingContent="Saving..." variant="secondary" />
            </div>
          </form>
        </CardContent>
      </Card>

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
            <input name="domainId" type="hidden" value={domainRecordResult.domain.id} />
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor="scanFrequency">
                Website scan frequency
              </label>
              <select
                className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                defaultValue={domainRecordResult.domain.scanFrequency ?? monitoringState?.effectiveFrequency ?? planLimits.scanFrequency}
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
              <PendingSubmitButton idleContent="Save frequency" pendingContent="Saving..." variant="secondary" />
            </div>
          </form>
        </CardContent>
      </Card>

      {monitorSiteSetup ? (
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Monitor request setup</CardTitle>
              <Badge tone={monitorSiteSetup.setupStatus === "activated" ? "success" : "neutral"}>
                {monitorSiteSetup.setupStatus === "activated" ? "Setup confirmed" : "Pending setup confirmation"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <p>
              This website is linked to a monitor request. Monitoring is active only after setup is confirmed; pending
              setup does not schedule recurring scans or change existing scan results.
            </p>
            <dl className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[12rem_1fr]">
              <dt className="font-medium text-slate-500">Request status</dt>
              <dd className="text-slate-900">{formatStatus(monitorSiteSetup.requestStatus)}</dd>
              <dt className="font-medium text-slate-500">Requested cadence</dt>
              <dd className="text-slate-900">{formatFrequency(monitorSiteSetup.requestedFrequency)}</dd>
              <dt className="font-medium text-slate-500">Active cadence</dt>
              <dd className="text-slate-900">
                {monitorSiteSetup.setupStatus === "activated" ? formatFrequency(monitorSiteSetup.activeFrequency) : "Not active"}
              </dd>
              <dt className="font-medium text-slate-500">Submitted by</dt>
              <dd className="text-slate-900">{monitorSiteSetup.workEmail}</dd>
              <dt className="font-medium text-slate-500">Goal</dt>
              <dd className="text-slate-900">{monitorSiteSetup.monitoringGoal}</dd>
              <dt className="font-medium text-slate-500">Setup source</dt>
              <dd className="text-slate-900">
                {monitorSiteSetup.setupSource === "account_self_serve" ? "Connected from account" : "Admin linked"}
              </dd>
              <dt className="font-medium text-slate-500">Last updated</dt>
              <dd className="text-slate-900">{formatDateTime(monitorSiteSetup.updatedAt)}</dd>
              {monitorSiteSetup.setupStatus === "activated" ? (
                <>
                  <dt className="font-medium text-slate-500">Confirmed</dt>
                  <dd className="text-slate-900">
                    {formatDateTime(monitorSiteSetup.activationConfirmedAt ?? monitorSiteSetup.activatedAt)}
                  </dd>
                  <dt className="font-medium text-slate-500">Customer confirmation</dt>
                  <dd className="text-slate-900">
                    {monitorSiteSetup.confirmationEmailSentAt
                      ? `Sent ${formatDateTime(monitorSiteSetup.confirmationEmailSentAt)}`
                      : "Not recorded"}
                  </dd>
                </>
              ) : null}
            </dl>
            <MonitorSetupTimeline
              activatedAt={monitorSiteSetup.activatedAt}
              activationConfirmedAt={monitorSiteSetup.activationConfirmedAt}
              confirmationEmailSentAt={monitorSiteSetup.confirmationEmailSentAt}
              createdAt={monitorSiteSetup.createdAt}
              linkedAt={monitorSiteSetup.linkedAt}
              setupStatus={monitorSiteSetup.setupStatus}
            />
            <div className="flex flex-wrap gap-3">
              {monitorSiteSetup.publicStatusToken ? (
                <PendingButtonLink
                  href={`/monitor-site/status/${encodeURIComponent(monitorSiteSetup.publicStatusToken)}`}
                  idleContent="View request status"
                  pendingContent="Opening..."
                  size="sm"
                  variant="secondary"
                />
              ) : null}
              {monitorSiteSetup.setupStatus !== "activated" ? (
                <PendingButtonLink
                  href="/contact-sales"
                  idleContent="Contact setup team"
                  pendingContent="Opening..."
                  size="sm"
                  variant="secondary"
                />
              ) : null}
            </div>
            <p className="text-xs leading-5 text-slate-500">
              CertScore uses automated public-web observations as review signals. Monitor setup context is operational
              workflow information, not legal advice, certification, or a compliance determination.
            </p>
          </CardContent>
        </Card>
      ) : null}

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
                    <th className="pb-3 pr-4 font-medium">Scan state</th>
                    <th className="pb-3 pr-4 font-medium">Signals</th>
                    <th className="pb-3 pr-4 font-medium">Findings</th>
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
