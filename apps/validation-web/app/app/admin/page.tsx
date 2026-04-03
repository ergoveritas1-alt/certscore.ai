import Link from "next/link";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { getAdminScanOverviewMetrics, listAdminScans } from "../../../server/admin/list-admin-scans";
import { listAdminUsers } from "../../../server/admin/list-admin-users";

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

export default async function AdminOverviewPage() {
  const [users, scans, scanMetrics] = await Promise.all([listAdminUsers(), listAdminScans(10), getAdminScanOverviewMetrics()]);
  const organizations = new Set(users.flatMap((user) => (user.organizationId ? [user.organizationId] : [])));
  const activePlans = users.reduce<Record<string, number>>((accumulator, user) => {
    if (!user.plan) {
      return accumulator;
    }

    accumulator[user.plan] = (accumulator[user.plan] ?? 0) + 1;
    return accumulator;
  }, {});

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">{users.length}</p>
            <p className="text-sm text-slate-600">User records with organization bootstrap state.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Workspaces</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">{organizations.size}</p>
            <p className="text-sm text-slate-600">Organizations currently attached to user memberships.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Scans</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">{scanMetrics.totalScans}</p>
            <p className="text-sm text-slate-600">All recorded scans across all workspaces.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Plan Mix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-slate-600">
            <p>Free: {activePlans.free ?? 0}</p>
            <p>Pro: {activePlans.pro ?? 0}</p>
            <p>Ultra: {activePlans.team ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Access Frictions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-slate-600">
            <p>403: {scanMetrics.http403Count}</p>
            <p>429: {scanMetrics.http429Count}</p>
            <p>Blocked/CAPTCHA: {scanMetrics.blockedOrCaptchaCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Recent Users</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {users.slice(0, 8).map((user) => (
              <div key={user.id} className="rounded-2xl border border-slate-200 p-4">
                <p className="font-medium text-slate-900">{user.email}</p>
                <p className="text-sm text-slate-500">
                  {user.organizationName ?? "No workspace"} · {user.plan ?? "No plan"} · {user.membershipRole ?? "No role"}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Domains {user.domainCount} · Scans {user.totalScans} · Last completed {formatDateTime(user.lastCompletedScanAt)}
                </p>
              </div>
            ))}
            <Button asChild variant="secondary">
              <Link href="/app/admin/users">Open user admin</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Recent Scans</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {scans.slice(0, 8).map((scan) => (
              <div key={scan.scanId} className="rounded-2xl border border-slate-200 p-4">
                <p className="font-medium text-slate-900">{scan.domainHostname ?? "Unknown domain"}</p>
                <p className="text-sm text-slate-500">
                  {scan.organizationName ?? "Unknown workspace"} · {scan.scanType} · {scan.status}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Signals {scan.totalSignals ?? 0} · CertScore.ai {scan.certscoreOverall ?? "n/a"} · Completed {formatDateTime(scan.completedAt)}
                </p>
                <div className="mt-3">
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/app/admin/scans/${scan.scanId}`}>Inspect snapshot</Link>
                  </Button>
                </div>
              </div>
            ))}
            <Button asChild variant="secondary">
              <Link href="/app/admin/scans">Open scan admin</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
