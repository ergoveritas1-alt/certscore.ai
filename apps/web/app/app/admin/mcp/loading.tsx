export default function McpOperationsLoading() {
  return (
    <section aria-busy="true" aria-label="Loading MCP operations" className="space-y-3">
      <div className="h-10 w-full animate-pulse rounded-xl bg-slate-200" />
      <div className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      <div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    </section>
  );
}
