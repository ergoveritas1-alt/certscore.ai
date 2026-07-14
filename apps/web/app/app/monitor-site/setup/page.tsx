import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { PendingSubmitButton } from "../../../../components/ui/pending-submit-button";
import {
  connectMonitorSiteRequestFormAction,
  getMonitorSiteSetupCandidate
} from "../../../../server/monitor-site/connect-monitor-site-request";

export const dynamic = "force-dynamic";

type MonitorSiteSetupPageProps = {
  searchParams: Promise<{
    error?: string;
    linked?: string;
    token?: string;
  }>;
};

function formatDateTime(value: string) {
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

function formatFrequency(value: string | null) {
  if (!value) {
    return "Not selected";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getErrorMessage(error: string | undefined, fallback: string | null) {
  switch (error) {
    case "closed":
      return "This monitoring request is closed. Submit a new request if setup should be reviewed again.";
    case "dns":
      return "We could not verify DNS for this site right now. Review the domain before connecting it to your workspace.";
    case "email-mismatch":
      return "Sign in with the work email used on the monitoring request to connect it to this workspace.";
    case "invalid-domain":
      return "This monitoring request website could not be normalized for workspace setup.";
    case "not-found":
      return "This monitoring request link was not found.";
    default:
      return fallback;
  }
}

export default async function MonitorSiteSetupPage({ searchParams }: MonitorSiteSetupPageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  if (!/^[A-Za-z0-9_-]{20,120}$/.test(token)) {
    notFound();
  }

  const request = await getMonitorSiteSetupCandidate(token);
  if (!request) {
    notFound();
  }

  const isLinked = params.linked === "1" || Boolean(request.monitorSetup);
  const errorMessage = getErrorMessage(params.error, request.error);
  const canSubmit = request.canConnect && request.monitorSetup?.setupStatus !== "pending_setup";

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Badge tone={isLinked ? "success" : "neutral"}>{isLinked ? "Pending setup" : "Monitor setup"}</Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Connect monitoring request</h1>
        <p className="max-w-3xl text-sm leading-7 text-slate-600">
          Link this pending monitoring request to your CertScore.ai workspace. This does not activate monitoring, schedule
          recurring scans, or change existing scan results. CertScore.ai will still confirm setup before monitoring becomes active.
        </p>
      </div>

      {errorMessage ? (
        <Card className="border-amber-200 bg-amber-50 shadow-none">
          <CardContent className="p-5 text-sm leading-6 text-amber-900">{errorMessage}</CardContent>
        </Card>
      ) : null}

      {isLinked ? (
        <Card className="border-emerald-200 bg-emerald-50 shadow-none">
          <CardContent className="space-y-3 p-5 text-sm leading-6 text-emerald-900">
            <p className="font-medium">This request is linked to a workspace and is waiting for setup confirmation.</p>
            <p>Monitoring is not active until setup is confirmed. Requested cadence: {formatFrequency(request.monitorSetup?.requestedFrequency ?? null)}.</p>
            <div className="flex flex-wrap gap-3 pt-1">
              {request.connectedDomainId ? (
                <Button asChild size="sm">
                  <Link href={`/app/domains/${request.connectedDomainId}`}>View website</Link>
                </Button>
              ) : null}
              <Button asChild size="sm" variant="secondary">
                <Link href={`/monitor-site/status/${encodeURIComponent(token)}`}>View request status</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-slate-200 bg-white shadow-none">
        <CardHeader>
          <CardTitle>Request details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-[11rem_1fr]">
            <dt className="font-medium text-slate-500">Site</dt>
            <dd className="text-slate-900">{request.hostname}</dd>
            <dt className="font-medium text-slate-500">Requested by</dt>
            <dd className="text-slate-900">{request.requestEmail}</dd>
            <dt className="font-medium text-slate-500">Signed in as</dt>
            <dd className="text-slate-900">{request.signedInEmail}</dd>
            <dt className="font-medium text-slate-500">Goal</dt>
            <dd className="text-slate-900">{request.monitoringGoal}</dd>
            <dt className="font-medium text-slate-500">Submitted</dt>
            <dd className="text-slate-900">{formatDateTime(request.createdAt)}</dd>
            <dt className="font-medium text-slate-500">Last updated</dt>
            <dd className="text-slate-900">{formatDateTime(request.updatedAt)}</dd>
          </dl>

          {canSubmit ? (
            <form action={connectMonitorSiteRequestFormAction} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
              <input name="token" type="hidden" value={token} />
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="requestedFrequency">
                  Requested cadence for setup review
                </label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:max-w-xs"
                  defaultValue="weekly"
                  id="requestedFrequency"
                  name="requestedFrequency"
                >
                  <option value="manual">Manual only</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <p className="max-w-2xl text-xs leading-5 text-slate-500">
                  Connecting this request creates or links a workspace website with manual scheduling. The cadence is saved
                  for setup review and is not activated automatically.
                </p>
              </div>
              <PendingSubmitButton idleContent="Connect to my workspace" pendingContent="Connecting..." />
            </form>
          ) : null}

          <p className="text-sm leading-7 text-slate-600">
            CertScore.ai uses automated public-web observations as review signals. Monitoring setup context is operational
            workflow information, not legal advice, certification, or a compliance determination.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
