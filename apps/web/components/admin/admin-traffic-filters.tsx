export function AdminTrafficFilters({
  basePath,
  excludeMacMiniScanBot,
  includeCanary,
  searchParams
}: {
  basePath: string;
  excludeMacMiniScanBot: boolean;
  includeCanary: boolean;
  searchParams: Record<string, string | null | undefined>;
}) {
  const idPrefix = basePath.replaceAll("/", "-");

  return (
    <form
      action={basePath}
      aria-label="Traffic visibility"
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-1.5"
      data-admin-table-form={basePath}
      method="get"
    >
      {Object.entries(searchParams).map(([key, value]) =>
        key === "page" || key === "includeCanary" || key === "scanBotFilter" || key === "excludeMacMiniScanBot" || !value
          ? null
          : <input key={key} name={key} type="hidden" value={value} />
      )}
      <input name="scanBotFilter" type="hidden" value="1" />

      <select
        aria-label="Canary traffic"
        className="h-8 w-[7.25rem] rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 sm:w-[8.75rem]"
        defaultValue={includeCanary ? "1" : "0"}
        id={`${idPrefix}-canary`}
        name="includeCanary"
      >
        <option value="0">Canary excluded</option>
        <option value="1">Canary included</option>
      </select>

      <select
        aria-label="Mac mini scan bot traffic"
        className="h-8 w-[8.25rem] rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 sm:w-[9.5rem]"
        defaultValue={excludeMacMiniScanBot ? "1" : "0"}
        id={`${idPrefix}-scan-bot`}
        name="excludeMacMiniScanBot"
      >
        <option value="1">Mac mini excluded</option>
        <option value="0">Mac mini included</option>
      </select>

      <button className="app-raised-button h-8 rounded-lg px-3 text-xs font-semibold text-slate-700" type="submit">Apply</button>
    </form>
  );
}
