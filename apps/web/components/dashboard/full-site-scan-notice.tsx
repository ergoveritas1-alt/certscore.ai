import React from "react";
import Link from "next/link";

export type FullSiteScanNoticeData = {
  scanId: string;
  hostname: string;
  status: string;
  homepageStatus: string;
  region: string;
  startedAt: string | Date;
  limits: { maxPages: number; concurrency: number; waitSeconds: number };
  earlierResults: Array<{ scanId: string; startedAt: string; label: string }>;
};

function scanTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short" }).format(new Date(value));
}
const regions: Record<string, string> = {
  "eu-west-1": "🇮🇪 EU-IR · Ireland", "eu-central-1": "🇩🇪 EU-DE · Frankfurt", "us-west-1": "California", "us-west-2": "US West · Oregon",
};

export function FullSiteScanNotice({ scan }: { scan: FullSiteScanNoticeData }) {
  const failed = scan.homepageStatus === "failed" || scan.status === "stopped";
  const complete = !failed && scan.status === "completed";
  const running = !failed && ["waiting_homepage", "running"].includes(scan.status);
  if (!failed && !complete && !running) return null;
  return (
    <section aria-label="Full-site scan" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Full-site scan</p>
          <h2 className="mt-1 break-words text-xl font-semibold tracking-tight text-slate-950">{scan.hostname}</h2>
        </div>
        <div className="flex items-center gap-3">
          <span role="status" className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${failed ? "bg-amber-50 text-amber-800" : complete ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full bg-current ${running ? "motion-safe:animate-pulse" : ""}`} />
            {failed ? "Couldn’t finish" : complete ? "Complete" : "In progress"}
          </span>
          <Link className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-sky-300 hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500" href={`/app/scans/${scan.scanId}`}>
            {complete ? "View report" : "View details"} <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-slate-100 bg-slate-50/60 px-5 py-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ["Scan from", regions[scan.region] ?? scan.region],
          ["Started", scanTime(scan.startedAt)],
          ["Page limit", `${scan.limits.maxPages} pages`],
          ["Concurrency", `${scan.limits.concurrency} pages`],
          ["Scan lag", `${scan.limits.waitSeconds} sec`],
        ].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-medium text-slate-800">{value}</dd></div>)}
      </dl>
      <div className="px-5 py-3 text-sm text-slate-600">
        {failed ? "This scan couldn’t finish. Open details to review what happened." : complete ? "Your full-site report is ready." : "We’ll email you when the full-site scan is complete. You can leave this page while it runs."}
      </div>
      <div className="border-t border-slate-100 px-5 py-3">
        <h3 className="text-xs font-medium text-slate-500">Earlier results</h3>
        {scan.earlierResults.length ? <ul className="mt-1 divide-y divide-slate-100">
          {scan.earlierResults.map(result => <li key={result.scanId}><Link className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm text-slate-700 hover:text-sky-700" href={`/app/scans/${result.scanId}`}><span>{result.label}</span><span className="text-xs text-slate-500">{scanTime(result.startedAt)} <span aria-hidden="true" className="ml-2">→</span></span></Link></li>)}
        </ul> : <p className="mt-1 text-sm text-slate-500">No earlier completed scans for this site.</p>}
      </div>
    </section>
  );
}
