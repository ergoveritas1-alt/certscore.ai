import React from "react";

export function ScanReportLoadingCard({
  description = "We’re organizing the evidence into your report now. It will open automatically when it’s ready.",
  title = "Finishing your report",
  variant = "report"
}: {
  description?: string;
  title?: string;
  variant?: "report" | "status";
}) {
  const isStatusLoading = variant === "status";

  return (
    <div aria-busy="true" className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-sky-100 bg-[radial-gradient(circle_at_50%_0%,rgba(224,242,254,0.95),transparent_56%),linear-gradient(145deg,#ffffff_0%,#f8fbff_100%)] px-6 py-9 text-center shadow-[0_24px_70px_-42px_rgba(14,116,144,0.5)] sm:px-10 sm:py-12">
      <div aria-hidden="true" className="absolute left-1/2 top-0 h-1 w-32 -translate-x-1/2 rounded-b-full bg-gradient-to-r from-cyan-300 via-sky-500 to-indigo-400" />
      <div aria-label={isStatusLoading ? "Loading scan status" : "Finishing report"} className="mx-auto grid h-20 w-20 place-items-center rounded-[1.75rem] border border-sky-200/80 bg-white/80 text-sky-700 shadow-[0_12px_30px_-16px_rgba(14,165,233,0.7)]" role="img">
        <div className="scan-hourglass motion-reduce:animate-none">
          <span className="scan-hourglass__top" />
          <span className="scan-hourglass__bottom" />
          <span className="scan-hourglass__sand" />
        </div>
      </div>
      <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {isStatusLoading ? "Connecting" : "Almost there"}
      </div>
      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700">
        {isStatusLoading ? "CertScore.ai scan" : "CertScore.ai report"}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}
