export default function AdminLoading() {
  return (
    <main className="space-y-6" aria-label="Loading admin page" aria-busy="true">
      <div className="space-y-2">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-200" />
      </div>

      <nav aria-label="Admin sections" className="flex flex-wrap gap-2">
        {["Overview", "Users", "Workspaces", "Scans", "API activity", "Monitor Requests"].map((label) => (
          <div key={label} className="h-9 w-24 animate-pulse rounded-full bg-slate-200" />
        ))}
      </nav>

      <section className="min-h-[18rem] animate-pulse rounded-xl border border-slate-200 bg-white p-6 shadow-sm" aria-label="Loading admin data">
        <div className="h-6 w-56 rounded bg-slate-200" />
        <div className="mt-5 space-y-3">
          <div className="h-4 w-full rounded bg-slate-100" />
          <div className="h-4 w-11/12 rounded bg-slate-100" />
          <div className="h-4 w-4/5 rounded bg-slate-100" />
        </div>
      </section>
    </main>
  );
}
