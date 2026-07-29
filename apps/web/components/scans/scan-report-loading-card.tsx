export function ScanReportLoadingCard({
  description = "We’re loading the scan evidence and report for you. This should only take a moment.",
  title = "Preparing your report"
}: {
  description?: string;
  title?: string;
}) {
  return (
    <div aria-busy="true" className="w-full max-w-sm rounded-2xl border border-slate-200 bg-slate-50 px-6 py-6 text-center">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-sky-100 text-2xl text-sky-700" role="img" aria-label="Loading report">
        ⌛
      </div>
      <p className="mt-4 text-[9px] font-semibold uppercase tracking-[0.2em] text-sky-700">CertScore.ai report</p>
      <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{title}</h1>
      <p className="mx-auto mt-2 max-w-[18rem] text-[10px] leading-5 text-slate-600">{description}</p>
    </div>
  );
}
