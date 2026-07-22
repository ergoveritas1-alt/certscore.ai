import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import Link from "next/link";
import { OverviewScanHistoryCard } from "../../components/dashboard/overview-scan-history-card";
import { AddDomainForm } from "../../components/domains/add-domain-form";
import { getDashboardContext } from "../../server/auth";
import { getDashboardScanUsage } from "../../server/dashboard/get-dashboard-scan-usage";
import {
  applyManualRescanLimitOverride,
  getOrganizationManualRescanLimitOverride,
  getPlanLimits
} from "../../server/plans/get-plan-limits";
import { withServerTiming } from "../../server/performance/log-server-timing";
import { getOrganizationScans } from "../../server/scans/get-organization-scans";
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
  const allowRestrictedScanOptions = canUseRestrictedScanOptions({
    membershipRole: membership.role,
    userEmail: user.email
  });
  const [basePlanLimits, manualRescanLimitOverride, recentScans, organizationSettings] = await withServerTiming("app.dashboard.primary_data", () =>
    Promise.all([
      getPlanLimits(organization.plan),
      getOrganizationManualRescanLimitOverride(organization.id),
      getOrganizationScans(organization.id, 100),
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
  const remainingScans =
    scanUsage.monthlyLimit === null ? null : Math.max(0, scanUsage.monthlyLimit - scanUsage.monthlyScansUsed);
  const remainingScansLabel = remainingScans === null ? "Unlimited scans" : `${remainingScans} scans`;
  const recentReusableScans = recentScans
    .filter((scan) => scan.status === "completed" && scan.domainHostname && isCompletedWithin24Hours(scan.completedAt))
    .map((scan) => ({
      domain: scan.domainHostname ?? "",
      scanFrom: getDashboardScanFromDefault(scan.scanFromValue)
    }));
  const latestByWebsite = Array.from(
    recentScans.reduce((items, scan) => {
      const key = scan.domainId ?? scan.domainHostname ?? scan.id;
      if (!items.has(key)) items.set(key, scan);
      return items;
    }, new Map<string, (typeof recentScans)[number]>()).values()
  );
  const latestCompletedScan = recentScans.find((scan) => scan.status === "completed") ?? null;
  const websitesNeedingReview = latestByWebsite.filter(
    (scan) =>
      (scan.topFindingCount ?? 0) > 0 ||
      (scan.scoreLabel === "GDPR/ePrivacy evidence" && scan.certscoreOverall !== null && scan.certscoreOverall < 75) ||
      Boolean(scan.interruptionLabel)
  ).length;
  const websitesWithPrivacyPolicy = latestByWebsite.filter((scan) => scan.privacyPolicyPresent === true).length;
  const scanUsagePercent = scanUsage.monthlyLimit === null || scanUsage.monthlyLimit <= 0
    ? null
    : Math.min(100, Math.round((scanUsage.monthlyScansUsed / scanUsage.monthlyLimit) * 100));
  const firstName = profile.full_name?.trim().split(/\s+/)[0] || null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[1.9rem] font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-slate-500">Scan a website, review what needs attention, and track meaningful changes over time.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-sky-100 bg-[linear-gradient(145deg,#ffffff_0%,#f5fbff_100%)] shadow-sm">
          <CardHeader className="pb-2 pt-5">
            <CardTitle>Scan a site</CardTitle>
          </CardHeader>
          <CardContent className="pb-5 pt-0">
            <AddDomainForm
              allowRestrictedScanOptions={allowRestrictedScanOptions}
              defaultScanFrom={organizationSettings?.defaultScanFrom ?? "eu_ie"}
              planCode={organization.plan}
              recentReusableScans={recentReusableScans}
            />
            <Link
              className="mt-3 inline-flex items-center gap-2 px-1 py-1 text-xs font-medium text-slate-500 transition hover:text-slate-900"
              href="/app/browser-scans/setup"
            >
              <span><strong>Scan from Chrome.</strong> Install the public CertScore.ai Browser Evidence extension.</span>
              <span aria-hidden="true" className="text-slate-400">→</span>
            </Link>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2 pt-5">
            <CardTitle>Your portfolio</CardTitle>
            <p className="text-sm text-slate-500">The signals most likely to need your attention now.</p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 p-0">
            <div className="bg-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Scans available</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{remainingScansLabel}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Monthly scan allowance used" aria-valuemax={100} aria-valuemin={0} aria-valuenow={scanUsagePercent ?? undefined}>
                <div className="h-full rounded-full bg-sky-500" style={{ width: `${scanUsagePercent ?? 0}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">{scanUsagePercent === null ? "No monthly limit" : `${scanUsagePercent}% used`} · resets {formatDate(scanUsage.monthlyPeriodEnd)}</p>
            </div>
            <div className="bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{latestCompletedScan?.scoreLabel ?? "GDPR/ePrivacy evidence"}</p><p className="mt-1 text-2xl font-semibold text-slate-950">{latestCompletedScan?.certscoreOverall ?? "—"}{latestCompletedScan?.certscoreOverall !== null && latestCompletedScan ? <span className="text-sm text-slate-400">/100</span> : null}</p><p className="truncate text-xs text-slate-500">{latestCompletedScan?.domainHostname ?? "No completed scan"}</p></div>
            <div className="bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Needs review</p><p className="mt-1 text-2xl font-semibold text-slate-950">{websitesNeedingReview}</p><p className="text-xs text-slate-500">of {latestByWebsite.length} websites</p></div>
            <div className="bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Privacy coverage</p><p className="mt-1 text-2xl font-semibold text-slate-950">{websitesWithPrivacyPolicy}<span className="text-sm text-slate-400">/{latestByWebsite.length}</span></p><p className="text-xs text-slate-500">latest scans found a privacy policy</p></div>
          </CardContent>
        </Card>
      </div>

      <OverviewScanHistoryCard
        scans={recentScans}
      />
    </div>
  );
}
