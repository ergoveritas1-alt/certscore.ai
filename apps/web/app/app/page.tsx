import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { OverviewScanHistoryCard } from "../../components/dashboard/overview-scan-history-card";
import { AddDomainForm } from "../../components/domains/add-domain-form";
import { getDashboardContext } from "../../server/auth";
import { getDashboardScanUsage } from "../../server/dashboard/get-dashboard-scan-usage";
import { getPlanLimits } from "../../server/plans/get-plan-limits";
import { getOrganizationScans } from "../../server/scans/get-organization-scans";

function formatDate(value: string | null) {
  if (!value) {
    return "Not available";
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles"
  }).format(date);
}

export default async function DashboardPage() {
  const { organization, profile } = await getDashboardContext();
  const [planLimits, recentScans] = await Promise.all([
    getPlanLimits(organization.plan),
    getOrganizationScans(organization.id)
  ]);
  const scanUsage = await getDashboardScanUsage({
    accountCreatedAt: profile.created_at,
    monthlyLimit: planLimits.manualRescanLimitPerMonth,
    organizationId: organization.id
  });
  const monthlyLimitLabel = scanUsage.monthlyLimit === null ? "unlimited" : String(scanUsage.monthlyLimit);
  const remainingPercentLabel = scanUsage.remainingPercent === null ? "unlimited" : `${scanUsage.remainingPercent}%`;

  return (
    <div className="space-y-2.5">
      <h1 className="text-[1.75rem] font-semibold tracking-tight">Overview</h1>

      <div className="grid gap-2.5 lg:grid-cols-2">
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-0.5 pt-4">
            <CardTitle>Usage remaining</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 pb-2.5 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">
              {scanUsage.monthlyScansUsed}/{monthlyLimitLabel} ({remainingPercentLabel})
            </p>
            <p>scans this month. Month ends on {formatDate(scanUsage.monthlyPeriodEnd)}.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-0.5 pt-4">
            <CardTitle>Scans</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 pb-2.5 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">Total scans: {scanUsage.totalScans}</p>
            <p>since inception on {formatDate(scanUsage.accountCreatedAt)}.</p>
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
