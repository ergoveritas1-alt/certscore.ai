export default function ProductAnalyticsLoading() {
  return (
    <section aria-busy="true" aria-label="Loading product analytics" className="space-y-3">
      <div className="h-10 w-full animate-pulse rounded-xl bg-slate-200" />
      <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        <div className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </div>
      <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    </section>
  );
}
