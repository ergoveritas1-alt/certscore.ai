import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { AdminSettingsCard } from "../../../components/settings/admin-settings-card";
import { ApiKeysCard } from "../../../components/settings/api-keys-card";
import { EmailVerificationCard } from "../../../components/settings/email-verification-card";
import { ScanLocationSettingsCard } from "../../../components/settings/scan-location-settings-card";
import { isPlatformAdminEmail } from "../../../server/admin/platform-admin";
import { getDashboardContext } from "../../../server/auth";
import { getBetterAuthVerificationStatus } from "../../../server/better-auth/user";
import { getDashboardScanUsage } from "../../../server/dashboard/get-dashboard-scan-usage";
import { getSystemHealth } from "../../../server/health/get-system-health";
import { listIntegrationApiKeysForOrganization } from "../../../server/integrations/api-keys";
import { getOrganizationSettings } from "../../../server/settings/get-organization-settings";
import { deleteAccountFormAction } from "../../../server/settings/account-actions";
import { loadSettingsActivity } from "../../../server/settings/repository";
import {
  applyManualRescanLimitOverride,
  getOrganizationManualRescanLimitOverride,
  getPlanLimits
} from "../../../server/plans/get-plan-limits";

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
    timeZone: "America/Los_Angeles",
    timeZoneName: "short"
  }).format(new Date(value));
}

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

function formatPlanLabel(plan: string) {
  if (plan === "team") {
    return "Custom";
  }
  if (plan === "individual") {
    return "Starter";
  }
  if (plan === "free") {
    return "Trial";
  }
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function formatMissingTables(tables: string[]) {
  return tables.join(", ");
}

export default async function SettingsPage() {
  const { organization, profile, user } = await getDashboardContext();
  const isPlatformAdmin = isPlatformAdminEmail(user.email);
  const userProviders = user.authProvider.split(",").map((provider) => provider.trim());
  const [basePlanLimits, manualRescanLimitOverride, systemHealth, verificationStatus, apiKeys, organizationSettings, activity] = await Promise.all([
    getPlanLimits(organization.plan),
    getOrganizationManualRescanLimitOverride(organization.id),
    isPlatformAdmin ? getSystemHealth() : Promise.resolve(null),
    userProviders.includes("password") ? getBetterAuthVerificationStatus(user.betterAuthUserId ?? user.id) : Promise.resolve(null),
    listIntegrationApiKeysForOrganization(organization.id),
    getOrganizationSettings(organization.id),
    loadSettingsActivity({ organizationId: organization.id, userEmail: user.email })
  ]);
  const planLimits = await applyManualRescanLimitOverride(basePlanLimits, manualRescanLimitOverride);
  const scanUsage = await getDashboardScanUsage({
    accountCreatedAt: profile.created_at,
    monthlyLimit: planLimits.manualRescanLimitPerMonth,
    organizationId: organization.id
  });
  const verificationIsVerified = Boolean(verificationStatus?.isVerified);
  const monthlyLimitLabel = scanUsage.monthlyLimit === null ? "unlimited" : String(scanUsage.monthlyLimit);
  const remainingScans =
    scanUsage.monthlyLimit === null ? null : Math.max(0, scanUsage.monthlyLimit - scanUsage.monthlyScansUsed);
  const remainingScansLabel = remainingScans === null ? "Unlimited" : `${remainingScans}`;
  const usagePercent = scanUsage.monthlyLimit === null || scanUsage.monthlyLimit <= 0
    ? null
    : Math.min(100, Math.round((scanUsage.monthlyScansUsed / scanUsage.monthlyLimit) * 100));

  return (
    <div className="min-w-0 space-y-6">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.14),_transparent_42%),linear-gradient(145deg,#ffffff_0%,#f8fafc_100%)] shadow-sm">
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1fr_360px] lg:items-center lg:px-8">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Settings</h1>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">{formatPlanLabel(organization.plan)}</span>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Manage scan defaults, account access, and your organization’s CertScore.ai capacity.</p>
            {isPlatformAdmin ? <Link className="mt-4 inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400" href="/app/settings/company">Manage workspace</Link> : null}
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
              {isPlatformAdmin ? <span><strong className="font-semibold text-slate-700">Workspace</strong> {organization.name}</span> : null}
              <span><strong className="font-semibold text-slate-700">Member since</strong> {formatDate(profile.created_at)}</span>
              <span><strong className="font-semibold text-slate-700">Status</strong> {formatPlanLabel(organization.planStatus)}</span>
              <span><strong className="font-semibold text-slate-700">Last login</strong> {formatDateTime(activity.last_login_at)}</span>
              <span><strong className="font-semibold text-slate-700">Last scan</strong> {formatDateTime(activity.last_scan_at)}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm backdrop-blur">
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Scans available</p><p className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{remainingScansLabel}<span className="ml-1 text-sm font-medium text-slate-400">/ {monthlyLimitLabel}</span></p></div>
              <p className="text-xs font-semibold text-sky-700">{usagePercent === null ? "Unlimited" : `${usagePercent}% used`}</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Monthly scan allowance used" aria-valuemax={100} aria-valuemin={0} aria-valuenow={usagePercent ?? undefined}><div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400" style={{ width: `${usagePercent ?? 0}%` }} /></div>
            <p className="mt-2 text-xs text-slate-500">{scanUsage.monthlyScansUsed} used · resets {formatDate(scanUsage.monthlyPeriodEnd)}</p>
          </div>
        </div>
      </section>

      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">Integrations</p>
              <CardTitle>API keys</CardTitle>
              <p className="text-sm text-slate-600">Create scoped keys for the Pulse API, SDK, and MCP integrations.</p>
            </div>
            <div className="max-w-sm rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm leading-6 text-slate-600">
              <p className="font-semibold text-slate-900">Questions about using the API?</p>
              <p>
                Email <a className="font-semibold text-sky-800 underline decoration-sky-200 underline-offset-2" href="mailto:support@certscore.ai">support@certscore.ai</a> or visit the{" "}
                <a className="font-semibold text-sky-800 underline decoration-sky-200 underline-offset-2" href="/developers">Developer API page</a>.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent><ApiKeysCard apiKeys={apiKeys} referenceTime={new Date().toISOString()} /></CardContent>
      </Card>

      <div className={verificationStatus ? "grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]" : "min-w-0"}>
        <Card className="min-w-0 border border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">Scan defaults</p>
            <CardTitle>Preferred scan location</CardTitle>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">Choose the region CertScore.ai preselects when you start a scan. Your last successful choice becomes the new default.</p>
          </CardHeader>
          <CardContent><ScanLocationSettingsCard lastScanFrom={organizationSettings?.defaultScanFrom ?? "eu_ie"} /></CardContent>
        </Card>

        {verificationStatus ? (
          <Card className="border border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Account access</p><CardTitle>Email</CardTitle></CardHeader>
            <CardContent><EmailVerificationCard email={verificationStatus.email} isVerified={verificationIsVerified} verifiedAt={verificationStatus.verifiedAt} /></CardContent>
          </Card>
        ) : null}
      </div>

      <Card className="border border-rose-200 bg-rose-50/40 shadow-sm">
        <CardHeader className="pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700">Danger zone</p>
          <CardTitle>Delete account</CardTitle>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">Permanently remove your login, profile, and company membership. Company scans and workspace data will remain with the company.</p>
        </CardHeader>
        <CardContent>
          <form action={deleteAccountFormAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 max-w-md flex-1 text-xs font-semibold text-slate-600">Enter your email to confirm<input autoComplete="email" className="mt-1 h-10 w-full rounded-lg border border-rose-200 bg-white px-3 text-sm font-normal" name="confirmationEmail" required type="email" /></label>
            <button className="h-10 shrink-0 rounded-lg border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-700 hover:bg-rose-100" type="submit">Delete my account</button>
          </form>
          <p className="mt-3 text-xs text-slate-500">Ensure there is at least one advanced company user before deleting your account.</p>
        </CardContent>
      </Card>

      {isPlatformAdmin ? (
        <section className="space-y-4 border-t border-slate-200 pt-6">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700">Platform administration</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Advanced controls</h2><p className="mt-1 text-sm text-slate-500">Internal configuration and environment health for this workspace.</p></div>
          <div className="grid gap-5 xl:grid-cols-2">
          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2"><CardTitle>Admin settings</CardTitle><span className="rounded-full bg-violet-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-violet-700 ring-1 ring-violet-200">Admin only</span></div>
              <p className="text-sm text-slate-600">Control optional cards in the Signal snapshot section.</p>
            </CardHeader>
            <CardContent>
              <AdminSettingsCard
                showSignalSnapshotFingerprinting={organizationSettings?.showSignalSnapshotFingerprinting ?? true}
                showSignalSnapshotReviewLenses={organizationSettings?.showSignalSnapshotReviewLenses ?? true}
                showSignalSnapshotScanInterruption={organizationSettings?.showSignalSnapshotScanInterruption ?? true}
              />
            </CardContent>
          </Card>

          {systemHealth ? (
            <Card className="border border-slate-200 bg-white xl:col-span-2">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2"><CardTitle>System health</CardTitle><span className="rounded-full bg-violet-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-violet-700 ring-1 ring-violet-200">Admin only</span></div>
              </CardHeader>
              <CardContent className="grid gap-6 text-sm text-slate-600 lg:grid-cols-2">
                <div className="space-y-2">
                  <p>
                    Database connectivity:{" "}
                    <span className={systemHealth.auth.databaseConnected ? "font-medium text-emerald-700" : "font-medium text-rose-700"}>
                      {systemHealth.auth.databaseConnected ? "connected" : "connection issue"}
                    </span>
                  </p>
                  <p>
                    Better Auth schema:{" "}
                    <span className={systemHealth.auth.authSchemaReady ? "font-medium text-emerald-700" : "font-medium text-rose-700"}>
                      {systemHealth.auth.authSchemaReady ? "ready" : "incomplete"}
                    </span>
                  </p>
                  {!systemHealth.auth.authSchemaReady && systemHealth.auth.missingTables.length > 0 ? (
                    <p>Missing auth tables: {formatMissingTables(systemHealth.auth.missingTables)}</p>
                  ) : null}
                  <p>
                    Google sign-in:{" "}
                    <span className={systemHealth.auth.googleEnabled ? "font-medium text-emerald-700" : "font-medium text-slate-500"}>
                      {systemHealth.auth.googleEnabled ? "enabled" : "disabled"}
                    </span>
                  </p>
                  <p>
                    Lambda scanner fleet:{" "}
                    <span className={
                      systemHealth.scanners.status === "healthy"
                        ? "font-medium text-emerald-700"
                        : systemHealth.scanners.status === "degraded" || systemHealth.scanners.status === "unknown"
                          ? "font-medium text-amber-700"
                          : "font-medium text-rose-700"
                    }>
                      {systemHealth.scanners.status}
                    </span>
                  </p>
                  <p>
                    {systemHealth.scanners.regions.map((region) => `${region.region}: ${region.status}`).join(" · ")}
                  </p>
                  <p>Scanner health last checked: {formatDateTime(systemHealth.scanners.checkedAt)}</p>
                  <p>
                    Worker activity:{" "}
                    <span className={systemHealth.worker.recentActivity ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
                      {systemHealth.worker.recentActivity ? "recent activity detected" : "no recent activity detected"}
                    </span>
                  </p>
                  <p>
                    Last worker event: {systemHealth.worker.lastEventType ?? "Not available"} ·{" "}
                    {formatDateTime(systemHealth.worker.lastActivityAt)}
                  </p>
                </div>

                <div className="space-y-2">
                  <p>
                    Artifacts bucket `{systemHealth.storage.artifacts.name}`:{" "}
                    <span className={systemHealth.storage.artifacts.exists ? "font-medium text-emerald-700" : "font-medium text-rose-700"}>
                      {systemHealth.storage.artifacts.exists ? "present" : "missing"}
                    </span>
                  </p>
                  <p>
                    Live counts: {systemHealth.database.counts.organizations} orgs · {systemHealth.database.counts.domains} domains ·{" "}
                    {systemHealth.database.counts.scans} scans
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
