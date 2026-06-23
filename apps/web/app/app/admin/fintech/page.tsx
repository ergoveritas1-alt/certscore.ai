import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import Link from "next/link";
import { OverviewScanHistoryCard } from "../../../../components/dashboard/overview-scan-history-card";
import { AddDomainForm } from "../../../../components/domains/add-domain-form";
import { getAdminScanThrottleMs } from "../../../../lib/scan-access";
import { isPlatformAdminEmail } from "../../../../server/admin/platform-admin";
import { getDashboardContext } from "../../../../server/auth";
import { listOrganizationChanges } from "../../../../server/changes/list-organization-changes";
import { getOrganizationDomains } from "../../../../server/domains/get-organization-domains";
import { getOrganizationScans } from "../../../../server/scans/get-organization-scans";
import { getOrganizationSignalOverview } from "../../../../server/signals/get-organization-signal-overview";

export default async function AdminFintechPage() {
  const { organization, user } = await getDashboardContext();
  const adminRescanCooldownMs = isPlatformAdminEmail(user.email) ? getAdminScanThrottleMs() : undefined;
  const [domains, recentScans, recentChanges, signalOverview] = await Promise.all([
    getOrganizationDomains(organization.id),
    getOrganizationScans(organization.id),
    listOrganizationChanges(organization.id, 5),
    getOrganizationSignalOverview(organization.id)
  ]);

  void signalOverview;
  const fintechDomains = domains.filter((domain) => domain.industryPrimaryLabel === "Fintech");
  const fintechDomainIds = new Set(fintechDomains.map((domain) => domain.id));
  const fintechScans = recentScans.filter((scan) => scan.domainId && fintechDomainIds.has(scan.domainId));
  const fintechScanCount = fintechScans.length;

  return (
    <div className="space-y-2.5">
      <div className="space-y-3">
        <h1 className="text-[1.75rem] font-semibold tracking-tight">Fintech Admin</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/admin/fintech"
            aria-current="page"
            className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Overview
          </Link>
          <Link
            href="/app/admin/fintech/sourcing"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            Sourcing
          </Link>
        </div>
      </div>

      <div className="grid gap-2.5 lg:grid-cols-3">
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-0.5 pt-4">
            <CardTitle>Fintech Domains</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 pb-2.5 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">{fintechDomains.length}</p>
            <p>Domains classified as fintech in this workspace.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-0.5 pt-4">
            <CardTitle>Fintech scans</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 pb-2.5 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">{fintechScanCount}</p>
            <p>Queued, running, or completed scans for fintech domains.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-0.5 pt-4">
            <CardTitle>Recent changes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 pb-2.5 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">{recentChanges.length}</p>
            <p>Signal changes.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-0.5 pt-4">
          <CardTitle>Add domain(s) to scan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 pt-0 pb-3">
          <AddDomainForm allowRestrictedScanOptions planCode={organization.plan} />
        </CardContent>
      </Card>

      <OverviewScanHistoryCard allowRestrictedScanOptions planCode={organization.plan} rescanCooldownMs={adminRescanCooldownMs} scans={fintechScans} />
    </div>
  );
}
