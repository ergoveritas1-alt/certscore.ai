import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { EmailVerificationCard } from "../../../components/settings/email-verification-card";
import { BrandingSettingsForm } from "../../../components/settings/branding-settings-form";
import { getDashboardContext } from "../../../server/auth";
import { getBetterAuthVerificationStatus } from "../../../server/better-auth/user";
import { getSystemHealth } from "../../../server/health/get-system-health";
import { getPasswordAuthVerificationStatus } from "../../../server/password-auth/user";
import { getOrganizationSettings } from "../../../server/settings/get-organization-settings";

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

export default async function SettingsPage() {
  const { organization, user } = await getDashboardContext();
  const userProviders = user.authProvider.split(",").map((provider) => provider.trim());
  const [settings, systemHealth, verificationStatus] = await Promise.all([
    getOrganizationSettings(organization.id),
    getSystemHealth(),
    userProviders.includes("password")
      ? getBetterAuthVerificationStatus(user.id).then((result) => result ?? getPasswordAuthVerificationStatus(user.id))
      : Promise.resolve(null)
  ]);
  const verificationIsVerified: boolean =
    verificationStatus && "isVerified" in verificationStatus
      ? Boolean((verificationStatus as { isVerified?: boolean }).isVerified)
      : Boolean(verificationStatus?.verifiedAt);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="max-w-3xl text-slate-600">
          Configure workspace defaults and review system health. Websites without an override continue to follow your default scan cadence.
        </p>
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Default monitoring</CardTitle>
        </CardHeader>
        <CardContent>
          <BrandingSettingsForm
            defaultValues={{
              defaultScanFrequency: settings?.defaultScanFrequency ?? null
            }}
          />
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

      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>System health</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 text-sm text-slate-600 lg:grid-cols-2">
          <div className="space-y-2">
            <p>
              App auth and database:{" "}
              <span className={systemHealth.auth.databaseConnected ? "font-medium text-emerald-700" : "font-medium text-rose-700"}>
                {systemHealth.auth.databaseConnected ? "connected" : "connection issue"}
              </span>
            </p>
            <p>
              Google sign-in:{" "}
              <span className={systemHealth.auth.googleEnabled ? "font-medium text-emerald-700" : "font-medium text-slate-500"}>
                {systemHealth.auth.googleEnabled ? "enabled" : "disabled"}
              </span>
            </p>
            <p>
              Redis queue:{" "}
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
              Last worker event: {systemHealth.worker.lastEventType ?? "Not available"} · {formatDateTime(systemHealth.worker.lastActivityAt)}
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
    </div>
  );
}
