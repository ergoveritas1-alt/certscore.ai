"use client";

import {
  ADMIN_TRAFFIC_SCOPES,
  adminTrafficScopeLabel,
  type AdminTrafficScope,
} from "../../lib/admin/admin-traffic-scope";

const LEGACY_TRAFFIC_PARAMS = new Set([
  "audienceFilters",
  "excludeInternal",
  "excludeMacMiniScanBot",
  "includeCanary",
  "scanBotFilter",
  "traffic",
]);

export function AdminTrafficFilters({
  basePath,
  scope,
  searchParams
}: {
  basePath: string;
  scope: AdminTrafficScope;
  searchParams: Record<string, string | null | undefined>;
}) {
  const idPrefix = basePath.replaceAll("/", "-");

  return (
    <form
      action={basePath}
      aria-label="Traffic visibility"
      className="inline-flex items-center"
      data-admin-table-form={basePath}
      method="get"
    >
      {Object.entries(searchParams).map(([key, value]) =>
        key === "page" || LEGACY_TRAFFIC_PARAMS.has(key) || !value
          ? null
          : <input key={key} name={key} type="hidden" value={value} />
      )}

      <select
        aria-label="Traffic visibility"
        className="h-9 w-[12rem] rounded-full border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 sm:w-[13.5rem]"
        defaultValue={scope}
        id={`${idPrefix}-traffic`}
        name="traffic"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {ADMIN_TRAFFIC_SCOPES.map((value) => (
          <option key={value} value={value}>{adminTrafficScopeLabel(value)}</option>
        ))}
      </select>
    </form>
  );
}
