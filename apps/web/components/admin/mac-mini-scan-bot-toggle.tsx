export function MacMiniScanBotToggle({
  basePath,
  excludeMacMiniScanBot,
  searchParams
}: {
  basePath: string;
  excludeMacMiniScanBot: boolean;
  searchParams: Record<string, string | null | undefined>;
}) {
  const id = `${basePath.replaceAll("/", "-")}-exclude-mac-mini-scan-bot`;

  return (
    <form action={basePath} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3" data-admin-table-form={basePath} method="get">
      {Object.entries(searchParams).map(([key, value]) =>
        key === "page" || key === "scanBotFilter" || key === "excludeMacMiniScanBot" || !value
          ? null
          : <input key={key} name={key} type="hidden" value={value} />
      )}
      <input name="scanBotFilter" type="hidden" value="1" />
      <label className="flex items-center gap-2 text-xs font-medium text-slate-700" htmlFor={id}>
        <input defaultChecked={excludeMacMiniScanBot} id={id} key={excludeMacMiniScanBot ? "exclude-scan-bot" : "include-scan-bot"} name="excludeMacMiniScanBot" type="checkbox" value="1" />
        Exclude Mac mini scan bot
      </label>
      <button className="app-raised-button h-8 rounded-lg px-2.5 text-xs font-semibold text-slate-700" type="submit">Apply</button>
    </form>
  );
}
