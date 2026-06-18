import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { AdminSettingsCard } from "../../../components/settings/admin-settings-card";
import { ApiKeysCard } from "../../../components/settings/api-keys-card";
import { EmailVerificationCard } from "../../../components/settings/email-verification-card";
import { ScanLocationSettingsCard } from "../../../components/settings/scan-location-settings-card";
import { SCAN_ACCESS, formatScanThrottleIntervalLabel } from "../../../lib/scan-access";
import { isPlatformAdminEmail } from "../../../server/admin/platform-admin";
import { getDashboardContext } from "../../../server/auth";
import { getBetterAuthVerificationStatus } from "../../../server/better-auth/user";
import { getDashboardScanUsage } from "../../../server/dashboard/get-dashboard-scan-usage";
import { getSystemHealth } from "../../../server/health/get-system-health";
import { listIntegrationApiKeysForOrganization } from "../../../server/integrations/api-keys";
import { getOrganizationSettings } from "../../../server/settings/get-organization-settings";
import {
  applyManualRescanLimitOverride,
  getOrganizationManualRescanLimitOverride,
  getPlanLimits
} from "../../../server/plans/get-plan-limits";

function formatDateTime(value: string | null) {
  if (!value) {
    return "No recent worker activity";
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
  const [basePlanLimits, manualRescanLimitOverride, systemHealth, verificationStatus, apiKeys, organizationSettings] = await Promise.all([
    getPlanLimits(organization.plan),
    getOrganizationManualRescanLimitOverride(organization.id),
    isPlatformAdmin ? getSystemHealth() : Promise.resolve(null),
    userProviders.includes("password") ? getBetterAuthVerificationStatus(user.betterAuthUserId ?? user.id) : Promise.resolve(null),
    isPlatformAdmin ? listIntegrationApiKeysForOrganization(organization.id) : Promise.resolve([]),
    getOrganizationSettings(organization.id)
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

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="max-w-3xl text-slate-600">Review account status and system health.</p>
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Account basics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Subscription</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{formatPlanLabel(organization.plan)}</p>
              <p className="mt-1 text-xs text-slate-500">{formatPlanLabel(organization.planStatus)}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-700">Scan pacing</p>
              <p className="mt-2 text-lg font-semibold text-emerald-950">{formatScanThrottleIntervalLabel()}</p>
              <p className="mt-1 text-xs text-emerald-700">Between scan requests</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Account created</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{formatDate(profile.created_at)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Monthly cycle ends</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{formatDate(scanUsage.monthlyPeriodEnd)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Usage remaining</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {remainingScansLabel}/{monthlyLimitLabel} scans
              </p>
              <p className="mt-1 text-xs text-slate-500">{scanUsage.monthlyScansUsed} used this month</p>
            </div>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm leading-6 text-slate-700">
            <p className="font-semibold text-slate-950">Scan pacing</p>
            <p className="mt-1">
              To keep capacity reliable, scan requests are limited to one request every {formatScanThrottleIntervalLabel()}.
            </p>
            <p className="mt-2">
              Teams interested in higher request throughput or batch scanning can contact{" "}
              <a className="font-semibold text-sky-800 underline decoration-sky-300 underline-offset-2" href={SCAN_ACCESS.salesHref}>
                {SCAN_ACCESS.salesEmail}
              </a>
              .
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Last scan location</CardTitle>
          <p className="text-sm text-slate-600">
            CertScore preselects this location for your next scan and updates it after each successful scan request.
          </p>
        </CardHeader>
        <CardContent>
          <ScanLocationSettingsCard lastScanFrom={organizationSettings?.defaultScanFrom ?? "eu_ie"} />
        </CardContent>
      </Card>

      {verificationStatus ? (
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Email verification</CardTitle>
          </CardHeader>
          <CardContent>
            <EmailVerificationCard
              email={verificationStatus.email}
              isVerified={verificationIsVerified}
              verifiedAt={verificationStatus.verifiedAt}
            />
          </CardContent>
        </Card>
      ) : null}

      {isPlatformAdmin ? (
        <>
          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Admin settings</CardTitle>
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

          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>API keys</CardTitle>
              <p className="text-sm text-slate-600">Create scoped keys for the Pulse API and MCP integrations.</p>
            </CardHeader>
            <CardContent>
              <ApiKeysCard apiKeys={apiKeys} />
            </CardContent>
          </Card>

          {systemHealth ? (
            <Card className="border border-slate-200 bg-white">
              <CardHeader>
                <CardTitle>System health</CardTitle>
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
                    Background worker lane:{" "}
                    <span className={systemHealth.queue.enabled ? "font-medium text-emerald-700" : "font-medium text-rose-700"}>
                      {systemHealth.queue.enabled ? "configured" : "unavailable"}
                    </span>
                  </p>
                  {systemHealth.queue.reason ? <p>{systemHealth.queue.reason}</p> : null}
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
        </>
      ) : null}
    </div>
  );
}
