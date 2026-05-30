import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { ScanStatusAutoRefresh } from "../../../components/scans/scan-status-auto-refresh";
import { getBrowserScanSessionById } from "../../../server/browser-scans/repository";

export const dynamic = "force-dynamic";

type BrowserScanPublicPageProps = {
  params: Promise<{
    browserScanId: string;
  }>;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
    month: "short",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
    year: "numeric"
  }).format(new Date(value));
}

function formatDuration(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "Not available";
  }

  return `${Math.round(value / 100) / 10}s`;
}

export default async function BrowserScanPublicPage({ params }: BrowserScanPublicPageProps) {
  const { browserScanId } = await params;
  const scan = await getBrowserScanSessionById({ browserScanId });

  if (!scan) {
    notFound();
  }

  if (scan.user_id !== null) {
    redirect(scan.canonical_scan_id ? `/app/scans/${scan.canonical_scan_id}` : `/app/browser-scans/${scan.id}`);
  }

  if (scan.canonical_scan_id) {
    redirect(`/scan/${scan.canonical_scan_id}`);
  }

  const summary = scan.summary_json ?? {};

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6">
      <ScanStatusAutoRefresh status={scan.status === "started" ? "running" : scan.status} />

      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-panel sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">Browser Evidence</h1>
                <Badge className="bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200">BX01</Badge>
              </div>
              <p className="break-words text-sm text-slate-600">{scan.target_url}</p>
            </div>
            <Badge className="w-fit bg-slate-100 text-slate-700 ring-1 ring-slate-200">{scan.status}</Badge>
          </div>
        </section>

        {scan.canonical_scan_id ? (
          <Link
            href={`/scan/${scan.canonical_scan_id}`}
            className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Open canonical scan report
          </Link>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Pre-Consent Browser Observations</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-slate-700 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Host</p>
              <p>{scan.target_hostname}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed</p>
              <p>{formatDateTime(scan.scan_completed_at)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Duration</p>
              <p>{formatDuration(scan.duration_ms)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Events</p>
              <p>{scan.event_count ?? 0} events, {scan.artifact_count ?? 0} artifacts</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Network requests</p>
              <p>{typeof summary.networkRequestCount === "number" ? summary.networkRequestCount : "Not available"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cookie changes</p>
              <p>{typeof summary.cookieEventCount === "number" ? summary.cookieEventCount : "Not available"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>See Fuller Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-slate-700">
            <p>
              This browser-observed summary is a lightweight BX01 evidence capture. Create a CertScore account to connect this evidence with fuller tracker classification, report history, monitoring, and server-side scan comparison.
            </p>
            <Link
              href="/login?mode=create_account"
              className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Sign up to see fuller analysis
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
