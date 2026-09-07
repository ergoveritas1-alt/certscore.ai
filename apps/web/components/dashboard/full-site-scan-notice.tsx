import React from "react";
import Link from "next/link";

export type FullSiteScanNoticeData = {
  scanId: string;
  hostname: string;
  status: string;
  homepageStatus: string;
};

export function FullSiteScanNotice({ scan }: { scan: FullSiteScanNoticeData }) {
  const failed = scan.homepageStatus === "failed" || scan.status === "stopped";
  const complete = !failed && scan.status === "completed";
  const running = !failed && ["waiting_homepage", "running"].includes(scan.status);
  if (!failed && !complete && !running) return null;
  return (
    <section role="status" aria-live="polite" className={`flex flex-wrap items-center gap-4 rounded-2xl border px-5 py-4 shadow-sm ${failed ? "border-amber-200 bg-amber-50" : "border-sky-200 bg-sky-50/80"}`}>
      <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white ${failed ? "text-amber-600" : "text-sky-600"}`}>
        {running ? <svg className="h-5 w-5 motion-safe:animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity=".2"/><path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> : <span className="text-xl">{complete ? "✓" : "!"}</span>}
      </span>
      <div className="min-w-0 flex-1 basis-60">
        <h2 className="font-semibold text-slate-950">{failed ? "Full-site scan couldn’t finish" : complete ? "Full-site scan complete" : "Full-site scan in progress"}</h2>
        <p className="mt-0.5 break-words text-sm font-medium text-slate-700">{scan.hostname}</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">{failed ? "You can review the scan status and try again. Your Overview is ready below." : complete ? "Your report is ready. You can open it below." : "We’ll email you when the full-site scan is complete. You can keep using Overview or close this page."}</p>
      </div>
      <Link className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500" href={`/app/scans/${scan.scanId}`}>
        {complete ? "View report" : "View scan"} <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
