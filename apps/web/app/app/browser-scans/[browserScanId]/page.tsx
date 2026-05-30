import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { ScanStatusAutoRefresh } from "../../../../components/scans/scan-status-auto-refresh";
import { getDashboardContext } from "../../../../server/auth";
import { getBrowserScanSessionById, getBrowserScanSessionForUser } from "../../../../server/browser-scans/repository";

export const dynamic = "force-dynamic";

type BrowserScanPageProps = {
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

function getProcessingTone(ready: boolean) {
  return ready
    ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
    : "bg-amber-50 text-amber-900 ring-1 ring-amber-200";
}

type ProgressStepState = "active" | "complete" | "pending";

function getStepTone(state: ProgressStepState) {
  if (state === "complete") {
    return {
      dot: "border-emerald-200 bg-emerald-500 text-white",
      label: "text-slate-950",
      rail: "bg-emerald-100"
    };
  }

  if (state === "active") {
    return {
      dot: "border-sky-200 bg-sky-500 text-white",
      label: "text-slate-950",
      rail: "bg-sky-100"
    };
  }

  return {
    dot: "border-slate-200 bg-white text-slate-400",
    label: "text-slate-500",
    rail: "bg-slate-100"
  };
}

function BrowserScanProgressCard({
  canonicalScanMaterialized,
  observedSignalsIngested,
  rawEvidenceCaptured,
  status
}: {
  canonicalScanMaterialized: boolean;
  observedSignalsIngested: boolean;
  rawEvidenceCaptured: boolean;
  status: string;
}) {
  const completed = status === "completed";
  const failed = status === "failed";
  const steps: Array<{ description: string; label: string; state: ProgressStepState }> = [
    {
      description: "BX01 opens the target in Chrome and prepares a fresh visit.",
      label: "Open target",
      state: failed ? "pending" : "complete"
    },
    {
      description: "Network, cookie, consent UI, and screenshot evidence are observed.",
      label: "Capture evidence",
      state: rawEvidenceCaptured || completed ? "complete" : failed ? "pending" : "active"
    },
    {
      description: "Bounded browser-extension evidence is stored with BX01 provenance.",
      label: "Upload evidence",
      state: rawEvidenceCaptured ? "complete" : completed ? "active" : "pending"
    },
    {
      description: "WS01 converts BX01 evidence into normalized observed runtime signals.",
      label: "Normalize signals",
      state: observedSignalsIngested ? "complete" : rawEvidenceCaptured ? "active" : "pending"
    },
    {
      description: "WC01 routes normalized concerns through policy and unified findings.",
      label: "Prepare report",
      state: canonicalScanMaterialized ? "complete" : observedSignalsIngested ? "active" : "pending"
    }
  ];
  const activeStep =
    steps.find((step) => step.state === "active") ??
    [...steps].reverse().find((step) => step.state === "complete") ??
    steps[0];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Local-extension scan progress</CardTitle>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {failed
                ? "BX01 could not finish this browser evidence session. Review the extension popup for the latest error."
                : activeStep?.description ?? "CertScore is preparing browser-extension evidence."}
            </p>
          </div>
          <Badge className="w-fit bg-sky-50 text-sky-800 ring-1 ring-sky-200">
            {failed ? "needs attention" : canonicalScanMaterialized ? "report ready" : activeStep?.label ?? "working"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-5">
          {steps.map((step, index) => {
            const tone = getStepTone(step.state);
            return (
              <div key={step.label} className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${tone.dot}`}>
                    {step.state === "complete" ? "OK" : index + 1}
                  </span>
                  <span className={`min-w-0 text-sm font-semibold ${tone.label}`}>{step.label}</span>
                </div>
                <div className={`mt-3 h-1.5 rounded-full ${tone.rail}`} />
                <p className="mt-2 text-xs leading-5 text-slate-500">{step.description}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function BrowserScanPage({ params }: BrowserScanPageProps) {
  const [{ browserScanId }, { user }] = await Promise.all([params, getDashboardContext()]);
  const scan = await getBrowserScanSessionForUser({
    browserScanId,
    userId: user.id
  }) ?? (process.env.NODE_ENV === "development" && process.env.BROWSER_SCANS_ALLOW_DEV_ANONYMOUS === "1"
    ? await getBrowserScanSessionById({ browserScanId })
    : null);

  if (!scan) {
    notFound();
  }

  if (scan.canonical_scan_id) {
    redirect(`/app/scans/${scan.canonical_scan_id}`);
  }

  const summary = scan.summary_json ?? {};
  const notice =
    typeof summary.evidenceNotice === "string"
      ? summary.evidenceNotice
      : "Browser-observed supplemental evidence from the reviewer's Chrome browser. Automated public-web observations for review, not legal advice, certification, or a compliance determination.";
  const observedSignalCount =
    typeof scan.observed_signal_count === "number"
      ? scan.observed_signal_count
      : typeof summary.observedSignalCount === "number"
        ? summary.observedSignalCount
        : 0;
  const observedSignalsIngestedAt =
    scan.observed_signals_ingested_at ??
    (typeof summary.observedSignalsIngestedAt === "string" ? summary.observedSignalsIngestedAt : null);
  const rawEvidenceCaptured = (scan.event_count ?? 0) > 0 || (scan.artifact_count ?? 0) > 0;
  const canonicalScanMaterialized = Boolean(scan.canonical_scan_id);
  const observedSignalsIngested = observedSignalCount > 0 || Boolean(observedSignalsIngestedAt);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  const ws01Command = [
    `BX01_WC01_API_BASE_URL=${appUrl} \\`,
    "BX01_OBSERVED_SIGNAL_INGEST_TOKEN=<shared-token> \\",
    `BX01_BROWSER_SCAN_ID=${scan.id} \\`,
    "pnpm --filter @signal-scanner/scanner bx01-normalize-once"
  ].join("\n");

  return (
    <div className="space-y-6 pb-6">
      <ScanStatusAutoRefresh status={scan.status === "started" ? "running" : scan.status} />

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
        <a
          href={`/app/scans/${scan.canonical_scan_id}`}
          className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Open canonical scan report
        </a>
      ) : null}

      <BrowserScanProgressCard
        canonicalScanMaterialized={canonicalScanMaterialized}
        observedSignalsIngested={observedSignalsIngested}
        rawEvidenceCaptured={rawEvidenceCaptured}
        status={scan.status}
      />

      <Card>
        <CardHeader>
          <CardTitle>Pre-Consent Browser Observations</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-slate-700 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source</p>
            <p>{scan.source_type ?? "browser_extension"} / {scan.source_id ?? "BX01"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Host</p>
            <p>{scan.target_hostname}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Started</p>
            <p>{formatDateTime(scan.scan_started_at)}</p>
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
          <CardTitle>Canonical Processing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-3">
            <div className="border-l border-slate-200 pl-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-950">Raw BX01 evidence</p>
                <Badge className={getProcessingTone(rawEvidenceCaptured)}>
                  {rawEvidenceCaptured ? "captured" : "pending"}
                </Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                {scan.event_count ?? 0} events and {scan.artifact_count ?? 0} artifacts stored with browser-extension provenance.
              </p>
            </div>

            <div className="border-l border-slate-200 pl-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-950">Canonical scan</p>
                <Badge className={getProcessingTone(canonicalScanMaterialized)}>
                  {canonicalScanMaterialized ? "materialized" : "waiting"}
                </Badge>
              </div>
              <p className="mt-2 break-all text-xs leading-5 text-slate-600">
                {scan.canonical_scan_id ?? "Created after the extension completes the scan session."}
              </p>
            </div>

            <div className="border-l border-slate-200 pl-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-950">WS01 observed signals</p>
                <Badge className={getProcessingTone(observedSignalsIngested)}>
                  {observedSignalsIngested ? "ingested" : "pending"}
                </Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                {observedSignalsIngested
                  ? `${observedSignalCount} normalized signals accepted${observedSignalsIngestedAt ? ` on ${formatDateTime(observedSignalsIngestedAt)}` : ""}.`
                  : "Run WS01 normalization before report-driving findings can use BX01 observations."}
              </p>
            </div>
          </div>

          {canonicalScanMaterialized && !observedSignalsIngested ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-950">WS01 normalization command</p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-50">
                <code>{ws01Command}</code>
              </pre>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evidence Framing</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-slate-700">{notice}</p>
        </CardContent>
      </Card>
    </div>
  );
}
