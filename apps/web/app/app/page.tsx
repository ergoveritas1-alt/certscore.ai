import Link from "next/link";
import type { PlanCode } from "@website-signal-risk-scanner/shared";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { AddDomainForm } from "../../components/domains/add-domain-form";
import { RescanDomainForm } from "../../components/scans/rescan-domain-form";
import { getDashboardContext } from "../../server/auth";
import { listOrganizationChanges } from "../../server/changes/list-organization-changes";
import { getOrganizationDomains } from "../../server/domains/get-organization-domains";
import { getRescanAvailability } from "../../lib/scans/rescan-policy";
import { getPlanLimits } from "../../server/plans/get-plan-limits";
import { getOrganizationScans } from "../../server/scans/get-organization-scans";
import { getOrganizationSignalOverview } from "../../server/signals/get-organization-signal-overview";

function formatDateTime(value: string | null) {
  if (!value) {
    return "No activity yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatRescanCooldownMessage(value: string | null, planCode: PlanCode) {
  if (!value) {
    return "This website cannot be re-scanned yet.";
  }

  return `Next re-scan available ${formatDateTime(value)} for this ${
    planCode === "free" ? "Free" : planCode === "pro" ? "Pro" : "Ultra"
  } plan website.`;
}

function formatMetric(value: number | null) {
  return value ?? "—";
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

  const latestCompletedSignalSet = signalOverview.find((item) => item.latestCompletedAt);
  const shouldShowUpgradePlanCta = organization.plan !== "team" && domains.length >= planLimits.maxDomains;
  const scanCtaHref = shouldShowUpgradePlanCta
    ? "/app/modify-plan"
    : domains[0]
      ? `/app/domains/${domains[0].id}`
      : "/app/domains";
  const scanCtaLabel = shouldShowUpgradePlanCta ? "Upgrade plan" : "Run a scan";
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
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>

      <div className="grid gap-6 lg:grid-cols-4">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Websites</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">
              {domains.length}/{planLimits.maxDomains}
            </p>
            <p>Tracked websites in this workspace.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Pages per scan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">{planLimits.maxPagesPerScan}</p>
            <p>Current page cap for each website scan.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Recent scans</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">{recentScans.length}</p>
            <p>Queued, running, or completed scans.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Recent changes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">{recentChanges.length}</p>
            <p>Signal changes recorded from recent completed scans.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Add a new website to scan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AddDomainForm maxDomains={planLimits.maxDomains} planCode={organization.plan} />
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Recent scan history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {recentScans.length === 0 ? (
            <p className="text-sm text-slate-600">No scans yet. Add a website to start building scan history.</p>
          ) : (
            <div className="space-y-3">
              {recentScansByDomain.map((group) => {
                const latestScan = group.scans[0];
                if (!latestScan) {
                  return null;
                }

                const availability = getRescanAvailability({
                  activeScanExists: latestScan.domainActiveScanExists,
                  lastScannedAt: latestScan.domainLastScannedAt,
                  planCode: organization.plan
                });
                const cooldownMessage = availability.reason
                  ? availability.reason
                  : !availability.allowed
                    ? formatRescanCooldownMessage(availability.nextAllowedAt, organization.plan)
                    : null;

                return (
                  <div key={group.key} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{group.hostname ?? "Unknown website"}</p>
                        <p className="text-sm text-slate-500">
                          {group.scans.length} {group.scans.length === 1 ? "scan" : "scans"} · newest {formatDateTime(latestScan.createdAt)}
                        </p>
                      </div>
                      {group.domainId ? (
                        <RescanDomainForm
                          cooldownMessage={cooldownMessage}
                          disabled={!availability.allowed}
                          domainId={group.domainId}
                        />
                      ) : null}
                    </div>

                    <div
                      className={group.scans.length >= 4 ? "max-h-[320px] space-y-2 overflow-y-auto pt-3 pr-1" : "space-y-2 pt-3"}
                    >
                      {group.scans.map((scan) => (
                        <div
                          key={scan.id}
                          className="flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                            <div className="space-y-1">
                              <p className="text-[13px] font-medium text-slate-900">
                                {scan.scanType} scan · {scan.status} · {formatDateTime(scan.createdAt)}
                              </p>
                              <p className="text-[13px] text-slate-500">
                                Signals {scan.totalSignals ?? 0}
                              </p>
                              <p className="text-[13px] text-slate-600">Overall score: {formatMetric(scan.certscoreOverall)}</p>
                            </div>
                            <div className="text-[13px] text-slate-600 sm:min-w-[160px]">
                              <p>Regulatory score: {formatMetric(scan.regulatoryScore)}</p>
                              <p>Privacy score: {formatMetric(scan.privacyScore)}</p>
                              <p>Accessibility score: {formatMetric(scan.accessibilityScore)}</p>
                            </div>
                          </div>
                          <div className="self-start sm:self-start">
                            <Button asChild size="sm" variant="secondary">
                              <Link href={`/app/scans/${scan.id}`}>View scan</Link>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Latest signal set</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            {latestCompletedSignalSet ? (
              <>
                <p>Website: {latestCompletedSignalSet.hostname}</p>
                <p>Latest completed scan: {formatDateTime(latestCompletedSignalSet.latestCompletedAt)}</p>
                <p>Active signals: {latestCompletedSignalSet.totalSignals ?? 0}</p>
                <div className="space-y-2 pt-2">
                  {latestCompletedSignalSet.signals.slice(0, 5).map((signal) => (
                    <div key={signal.key} className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="font-medium text-slate-900">{signal.label}</p>
                      <p className="text-slate-500">{Array.isArray(signal.value) ? signal.value.join(", ") : String(signal.value)}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p>No completed scans yet.</p>
                <p>Add a website and run the first scan to populate the latest signal summary.</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Recent changes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            {recentChanges.length === 0 ? (
              <>
                <p>No change events yet.</p>
                <p>After a website has at least two completed scans, added and changed signals will appear here.</p>
              </>
            ) : (
              recentChanges.map((change) => (
                <div key={change.id} className="rounded-2xl border border-slate-200 p-4">
                  <p className="font-medium text-slate-900">{change.message}</p>
                  <p className="text-slate-500">
                    {change.domainHostname ?? "Unknown website"} · {formatDateTime(change.createdAt)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
