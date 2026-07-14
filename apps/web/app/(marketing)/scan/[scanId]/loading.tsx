import { SiteFooter } from "../../../../components/layout/site-footer";
import { SiteHeader } from "../../../../components/layout/site-header";

export default function PublicScanLoading() {
  return (
    <main aria-busy="true" className="min-h-screen bg-white">
      <SiteHeader />
      <section className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-6xl items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-slate-50 px-6 py-10 text-center shadow-sm sm:px-10">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-sky-100 text-4xl text-sky-700 motion-safe:animate-[spin_1.8s_ease-in-out_infinite] motion-reduce:animate-none" role="img" aria-label="Loading report">
            ⌛
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">CertScore.ai report</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Preparing your report</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
            We’re loading the scan evidence and report for you. This should only take a moment.
          </p>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
