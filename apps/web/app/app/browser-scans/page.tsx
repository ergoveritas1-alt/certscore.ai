import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { getDashboardContext } from "../../../server/auth";
import { listBrowserScanSessionsForUser } from "../../../server/browser-scans/repository";

export const dynamic = "force-dynamic";

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

function getStatusTone(status: string) {
  if (status === "complete") {
    return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
  }

  if (status === "failed") {
    return "bg-rose-50 text-rose-800 ring-1 ring-rose-200";
  }

  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
}

function getSignalStatus(scan: { canonical_scan_id?: string | null; observed_signal_count?: number; observed_signals_ingested_at?: string | null; status: string }) {
  if ((scan.observed_signal_count ?? 0) > 0 || scan.observed_signals_ingested_at) {
    return {
      label: "WS01 ingested",
      tone: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
    };
  }

  if (scan.canonical_scan_id && scan.status === "complete") {
    return {
      label: "WS01 pending",
      tone: "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
    };
  }

  return {
    label: "evidence pending",
    tone: "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
  };
}

export default async function BrowserScansPage() {
  const { user } = await getDashboardContext();
  const scans = await listBrowserScanSessionsForUser({
    limit: 50,
    userId: user.id
  });

  const completedCount = scans.filter((scan) => scan.status === "complete").length;
  const totalEvents = scans.reduce((sum, scan) => sum + (scan.event_count ?? 0), 0);

  return (
    <div className="space-y-6 pb-6">
      <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-panel sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">Browser Evidence</h1>
              <Badge className="bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200">BX01</Badge>
            </div>
            <p className="text-sm text-slate-600">
              Supplemental pre-consent evidence captured from the reviewer&apos;s Chrome browser.
            </p>
          </div>

          <div className="space-y-3 lg:text-right">
            <Link
              href="/app/browser-scans/setup"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Install extension
            </Link>
            <div className="flex flex-wrap gap-2 text-sm text-slate-600 lg:justify-end">
              <div className="rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">
                <span className="font-semibold text-slate-900">{scans.length}</span> sessions
              </div>
              <div className="rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">
                <span className="font-semibold text-slate-900">{completedCount}</span> complete
              </div>
              <div className="rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">
                <span className="font-semibold text-slate-900">{totalEvents}</span> events
              </div>
            </div>
          </div>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent Browser Scan Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {scans.length > 0 ? (
            <div className="divide-y divide-slate-200">
              {scans.map((scan) => {
                const summary = scan.summary_json ?? {};
                const signalStatus = getSignalStatus(scan);
                return (
                  <Link
                    key={scan.id}
                    href={`/app/browser-scans/${scan.id}`}
                    className="grid gap-3 py-4 transition hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-2"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-950">{scan.target_hostname}</p>
                        <Badge className={getStatusTone(scan.status)}>{scan.status}</Badge>
                        <Badge className={signalStatus.tone}>{signalStatus.label}</Badge>
                      </div>
                      <p className="break-words text-xs text-slate-500">{scan.target_url}</p>
                    </div>
                    <div className="grid gap-1 text-left text-xs text-slate-500 sm:text-right">
                      <span>{formatDateTime(scan.created_at)}</span>
                      <span>
                        {scan.event_count ?? 0} events · {formatDuration(scan.duration_ms)}
                      </span>
                      <span>
                        {typeof summary.networkRequestCount === "number" ? `${summary.networkRequestCount} requests` : "Requests not summarized"}
                      </span>
                      <span>
                        {(scan.observed_signal_count ?? 0) > 0 ? `${scan.observed_signal_count ?? 0} WS01 signals` : "No WS01 signals yet"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
              <p className="text-sm font-semibold text-slate-900">No browser evidence sessions yet</p>
              <p className="mt-2 text-sm text-slate-600">
                Load the CertScore Chrome extension and run a browser pre-consent scan from the target website.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
