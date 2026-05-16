import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { OverviewScanHistoryCard } from "../../components/dashboard/overview-scan-history-card";
import { AddDomainForm } from "../../components/domains/add-domain-form";
import { getDashboardContext } from "../../server/auth";
import { listOrganizationChanges } from "../../server/changes/list-organization-changes";
import { getOrganizationDomains } from "../../server/domains/get-organization-domains";
import { getPlanLimits } from "../../server/plans/get-plan-limits";
import { getOrganizationScans } from "../../server/scans/get-organization-scans";

export default async function DashboardPage() {
  const { organization } = await getDashboardContext();
  const [domains, planLimits, recentScans, recentChanges] = await Promise.all([
    getOrganizationDomains(organization.id),
    getPlanLimits(organization.plan),
    getOrganizationScans(organization.id),
    listOrganizationChanges(organization.id, 5)
  ]);

  return (
    <div className="space-y-2.5">
      <h1 className="text-[1.75rem] font-semibold tracking-tight">Overview</h1>

      <div className="grid gap-2.5 lg:grid-cols-3">
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-0.5 pt-4">
            <CardTitle>Domains</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 pb-2.5 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">
              {domains.length}/{planLimits.maxDomains}
            </p>
            <p>Tracked domains in this workspace.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-0.5 pt-4">
            <CardTitle>Scans</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 pb-2.5 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">{recentScans.length}</p>
            <p>Queued, running, or completed scans.</p>
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
          <AddDomainForm maxDomains={planLimits.maxDomains} planCode={organization.plan} />
        </CardContent>
      </Card>

      <OverviewScanHistoryCard planCode={organization.plan} scans={recentScans} />
    </div>
  );
}
