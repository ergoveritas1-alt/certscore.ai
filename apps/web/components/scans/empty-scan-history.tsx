import Link from "next/link";
import { AUTHENTIC_SAMPLE_REPORT_URL } from "../../lib/marketing/sample-report";

export function EmptyScanHistory() {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-8 text-center sm:px-6 sm:py-10">
      <h2 className="text-lg font-semibold text-slate-900">Start with your first website</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Enter a website to get a CertScore.ai report. Your scans will appear here.</p>
      <div className="mt-5 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
        <Link className="inline-flex min-h-12 items-center justify-center rounded-xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          data-analytics-feature="scan_onboarding" data-analytics-id="empty_scans:start" href="/app#scan-a-site" prefetch={false}>
          Scan your first website
        </Link>
        <Link className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-sky-800 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          data-analytics-feature="scan_onboarding" data-analytics-id="empty_scans:sample_report" href={AUTHENTIC_SAMPLE_REPORT_URL} prefetch={false}>
          Explore a sample report
        </Link>
      </div>
    </div>
  );
}
