import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { OverviewScanHistoryCard } from "../../components/dashboard/overview-scan-history-card";
import { AddDomainForm } from "../../components/domains/add-domain-form";
import { getAdminScanThrottleMs } from "../../lib/scan-access";
import { isPlatformAdminEmail } from "../../server/admin/platform-admin";
import { getDashboardContext } from "../../server/auth";
import { getDashboardScanUsage } from "../../server/dashboard/get-dashboard-scan-usage";
import {
  applyManualRescanLimitOverride,
  getOrganizationManualRescanLimitOverride,
  getPlanLimits
} from "../../server/plans/get-plan-limits";
import { withServerTiming } from "../../server/performance/log-server-timing";
import { getOrganizationScansSummary } from "../../server/scans/get-organization-scans";
import { getOrganizationSettings } from "../../server/settings/get-organization-settings";
import { canUseRestrictedScanOptions } from "../../server/scans/restricted-scan-options";
import type { ServerScanFrom } from "../../components/scans/scan-from-select";

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

function getDashboardScanFromDefault(value: string | null | undefined): ServerScanFrom {
  return value === "eu_de" || value === "eu_ie" || value === "california" ? value : "eu_ie";
}

function isCompletedWithin24Hours(completedAt: string | null) {
  if (!completedAt) {
    return false;
  }

  const completedAtMs = Date.parse(completedAt);
  return Number.isFinite(completedAtMs) && Date.now() - completedAtMs >= 0 && Date.now() - completedAtMs <= 24 * 60 * 60 * 1000;
}

export default async function DashboardPage() {
  const { membership, organization, profile, user } = await withServerTiming("app.dashboard.context", () => getDashboardContext());
  const adminRescanCooldownMs = isPlatformAdminEmail(user.email) ? getAdminScanThrottleMs() : undefined;
  const allowRestrictedScanOptions = canUseRestrictedScanOptions({
    membershipRole: membership.role,
    userEmail: user.email
  });
  const [basePlanLimits, manualRescanLimitOverride, recentScans, organizationSettings] = await withServerTiming("app.dashboard.primary_data", () =>
    Promise.all([
      getPlanLimits(organization.plan),
      getOrganizationManualRescanLimitOverride(organization.id),
      getOrganizationScansSummary(organization.id, 100),
      getOrganizationSettings(organization.id)
    ])
  );
  const planLimits = await applyManualRescanLimitOverride(basePlanLimits, manualRescanLimitOverride);
  const scanUsage = await withServerTiming("app.dashboard.scan_usage", () =>
    getDashboardScanUsage({
      accountCreatedAt: profile.created_at,
      monthlyLimit: planLimits.manualRescanLimitPerMonth,
      organizationId: organization.id
    })
  );
  const monthlyLimitLabel = scanUsage.monthlyLimit === null ? "unlimited" : String(scanUsage.monthlyLimit);
  const remainingScans =
    scanUsage.monthlyLimit === null ? null : Math.max(0, scanUsage.monthlyLimit - scanUsage.monthlyScansUsed);
  const remainingScansLabel = remainingScans === null ? "Unlimited scans" : `${remainingScans} scans`;
  const remainingPercentLabel = scanUsage.remainingPercent === null ? "unlimited" : `${scanUsage.remainingPercent}%`;
  const recentReusableScans = recentScans
    .filter((scan) => scan.status === "completed" && scan.domainHostname && isCompletedWithin24Hours(scan.completedAt))
    .map((scan) => ({
      domain: scan.domainHostname ?? "",
      scanFrom: getDashboardScanFromDefault(scan.scanFromValue)
    }));

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
              {remainingScansLabel} ({remainingPercentLabel})
            </p>
            <p>
              out of {monthlyLimitLabel} available this month. Month ends on {formatDate(scanUsage.monthlyPeriodEnd)}.
            </p>
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
          <AddDomainForm
            allowRestrictedScanOptions={allowRestrictedScanOptions}
            defaultScanFrom={organizationSettings?.defaultScanFrom ?? "eu_ie"}
            planCode={organization.plan}
            recentReusableScans={recentReusableScans}
          />
        </CardContent>
      </Card>

      <OverviewScanHistoryCard
        defaultScanFrom={organizationSettings?.defaultScanFrom ?? "eu_ie"}
        allowRestrictedScanOptions={allowRestrictedScanOptions}
        planCode={organization.plan}
        rescanCooldownMs={adminRescanCooldownMs}
        scans={recentScans}
      />
    </div>
  );
}
