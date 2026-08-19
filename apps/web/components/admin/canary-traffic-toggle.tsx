export function CanaryTrafficToggle({
  basePath,
  includeCanary,
  searchParams,
}: {
  basePath: string;
  includeCanary: boolean;
  searchParams: Record<string, string | null | undefined>;
}) {
  return (
    <form action={basePath} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5" data-admin-table-form={basePath} method="get">
      {Object.entries(searchParams).map(([key, value]) => key === "page" || key === "includeCanary" || !value ? null : <input key={key} name={key} type="hidden" value={value} />)}
      <label className="text-xs font-medium text-slate-600" htmlFor={`${basePath.replaceAll("/", "-")}-canary`}>Canary traffic</label>
      <select aria-label="Canary traffic" className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700" defaultValue={includeCanary ? "1" : "0"} id={`${basePath.replaceAll("/", "-")}-canary`} name="includeCanary">
        <option value="0">Excluded</option>
        <option value="1">Included</option>
      </select>
      <button className="app-raised-button h-8 rounded-lg px-2.5 text-xs font-semibold text-slate-700" type="submit">Apply</button>
    </form>
  );
}
