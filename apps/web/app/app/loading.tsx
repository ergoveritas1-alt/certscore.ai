export default function AppLoading() {
  return (
    <section className="min-h-screen bg-slate-50 px-6 py-8" aria-label="Loading scan view">
      <div className="mx-auto max-w-6xl space-y-5 animate-pulse">
        <div className="h-8 w-72 rounded-lg bg-slate-200" />
        <div className="h-4 w-48 rounded bg-slate-200" />
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
            <div className="space-y-4">
              <div className="h-5 w-44 rounded bg-slate-200" />
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="h-24 rounded-2xl bg-slate-100" />
                <div className="h-24 rounded-2xl bg-slate-100" />
                <div className="h-24 rounded-2xl bg-slate-100" />
              </div>
              <div className="h-56 rounded-2xl bg-slate-100" />
            </div>
            <div className="h-[25rem] rounded-2xl bg-slate-100" />
          </div>
        </section>
      </div>
    </section>
  );
}
