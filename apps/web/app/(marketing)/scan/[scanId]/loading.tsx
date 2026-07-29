import { SiteFooter } from "../../../../components/layout/site-footer";
import { SiteHeader } from "../../../../components/layout/site-header";

export default function PublicScanLoading() {
  return (
    <main aria-busy="true" className="min-h-screen bg-white">
      <SiteHeader />
      <section className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-6xl items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-slate-50 px-6 py-6 text-center">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-sky-100 text-2xl text-sky-700" role="img" aria-label="Loading report">
            ⌛
          </div>
          <p className="mt-4 text-[9px] font-semibold uppercase tracking-[0.2em] text-sky-700">CertScore.ai report</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">Preparing your report</h1>
          <p className="mx-auto mt-2 max-w-[18rem] text-[10px] leading-5 text-slate-600">
            We’re loading the scan evidence and report for you. This should only take a moment.
          </p>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
