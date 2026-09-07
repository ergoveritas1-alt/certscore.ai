import { estimateFullSiteProgress, type FullSiteProgress } from "../../lib/scans/full-site-progress";
import { scanFailureExplanation } from "../../lib/scans/scan-failure-explanation";
import React from "react";
import Link from "next/link";

export type FullSiteScanNoticeData = {
  scanId: string;
  hostname: string;
  progress?: FullSiteProgress;
  status: string;
  homepageStatus: string;
  errorMessage?: string | null;
  region: string;
  startedAt: string | Date;
  limits: { maxPages: number; concurrency: number; waitSeconds: number };
};

function scanTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short" }).format(new Date(value));
}
const regions: Record<string, string> = {
  "eu-west-1": "🇮🇪 EU-IR · Ireland", "eu-central-1": "🇩🇪 EU-DE · Frankfurt", "us-west-1": "California", "us-west-2": "US West · Oregon",
};

export function FullSiteScanNotice({ scan, statusStale = false, reportPage = false }: { scan: FullSiteScanNoticeData; statusStale?: boolean; reportPage?: boolean }) {
  const Heading = reportPage ? "h1" : "h2";
  const failed = scan.homepageStatus === "failed" || scan.status === "stopped";
  const failure = scanFailureExplanation(scan.errorMessage);
  const complete = !failed && scan.status === "completed";
  const running = !failed && ["waiting_homepage", "running"].includes(scan.status);
  const progress = scan.progress ? estimateFullSiteProgress(scan.progress, scan.limits.maxPages, complete) : null;
  if (!failed && !complete && !running) return null;
  return (
    <section aria-label="Full-site scan" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Full-site scan</p>
          <Heading className="mt-1 break-words text-xl font-semibold tracking-tight text-slate-950">{scan.hostname}</Heading>
        </div>
        <div className="flex items-center gap-3">
          <span role="status" className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${failed ? "bg-amber-50 text-amber-800" : complete ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700 motion-safe:animate-pulse"}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full bg-current ${running ? "motion-safe:animate-pulse" : ""}`} />
            {failed ? "Couldn’t finish" : complete ? "Complete" : "In progress"}
          </span>
          <Link className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-sky-300 hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500" href={reportPage ? "/app" : failed ? "#scan-a-site" : `/app/scans/${scan.scanId}`}>
            {reportPage ? "Overview" : failed ? "Set up new scan" : complete ? "View report" : "View details"} <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
      <div className="border-y border-slate-100 bg-slate-50/60 px-5 py-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-5">
        {[
          ["Scan from", regions[scan.region] ?? scan.region],
          ["Started", scanTime(scan.startedAt)],
          ["Page limit", `${scan.limits.maxPages} pages`],
          ["Concurrency", `${scan.limits.concurrency} pages`],
          ["Scan lag", `${scan.limits.waitSeconds} sec`],
        ].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-0.5 text-sm font-medium text-slate-800">{value}</dd></div>)}
      </dl>
      {progress && scan.progress ? <div className="mt-3 border-t border-slate-200/70 pt-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p aria-live="polite" className="font-medium text-slate-800">{scan.progress.completed} pages complete{scan.progress.partial ? ` · ${scan.progress.partial} partial` : ""}{scan.progress.failed ? ` · ${scan.progress.failed} unsuccessful` : ""}{scan.progress.active ? ` · ${scan.progress.active} scanning` : ""}</p>
          <span className="text-xs text-slate-500">{complete ? "Finished" : failed ? "Stopped" : !scan.progress.discoveryComplete ? `Finding pages · up to ${progress.total}` : `${progress.done} of ${progress.total} pages processed`}</span>
        </div>
        <div role="progressbar" aria-label="Full-site pages processed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none ${failed ? "bg-amber-400" : complete ? "bg-emerald-500" : "bg-sky-500"}`} style={{width:`${progress.percent}%`}} />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">{statusStale ? "Status updates are delayed. Showing the last confirmed progress." : running ? (progress.seconds === null ? "Estimating time after the first page completes." : `About ${Math.max(1, Math.ceil(progress.seconds / 60))} min remaining · ~${Math.max(1, Math.ceil((progress.totalSeconds ?? 0) / 60))} min total${!scan.progress.discoveryComplete ? " at the page limit" : ""} · estimate based on observed page speed`) : "Progress reflects the recorded page outcomes."}</p>
      </div> : null}
      </div>
      <div className="px-5 py-2.5 text-sm text-slate-600">
        {failed ? <div className="space-y-2">
          <p className="font-medium text-slate-900">{failure.title}</p>
          <p className="max-w-3xl leading-6">{failure.detail}</p>
          <p className="max-w-3xl leading-6">{failure.nextStep}</p>
          <p className="break-all text-xs text-slate-500">Scan reference: {scan.scanId}</p>
        </div> : complete ? "Your full-site report is ready." : "We’ll email you when the full-site scan is complete. You can leave this page while it runs."}
      </div>
    </section>
  );
}
