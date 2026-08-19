import { Button } from "@website-signal-risk-scanner/ui";
import { PaginationNavigationButtons } from "./pagination-navigation-buttons";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 10;

export function normalizePageSize(value: string | undefined | null, fallback = DEFAULT_PAGE_SIZE) {
  const parsed = Number.parseInt(value ?? "", 10);
  return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number]) ? parsed : fallback;
}

export function normalizePage(value: string | undefined | null) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

type PaginationControlsProps = {
  basePath: string;
  hasNext?: boolean;
  itemLabel: string;
  page: number;
  pageCount?: number;
  pageParamName?: string;
  pageSize: number;
  perPageParamName?: string;
  searchParams?: Record<string, string | null | undefined>;
  showPageJump?: boolean;
  totalCount?: number;
  visibleCount: number;
};

function buildHref(input: {
  basePath: string;
  page: number;
  pageParamName?: string;
  pageSize: number;
  perPageParamName?: string;
  searchParams?: Record<string, string | null | undefined>;
}) {
  const pageParamName = input.pageParamName ?? "page";
  const perPageParamName = input.perPageParamName ?? "perPage";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input.searchParams ?? {})) {
    if (key === pageParamName || key === perPageParamName || value === null || value === undefined || value === "") {
      continue;
    }
    params.set(key, value);
  }
  if (input.page > 1) {
    params.set(pageParamName, String(input.page));
  }
  if (input.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set(perPageParamName, String(input.pageSize));
  }
  const query = params.toString();
  return query ? `${input.basePath}?${query}` : input.basePath;
}

export function PaginationControls({
  basePath,
  hasNext,
  itemLabel,
  page,
  pageCount,
  pageParamName = "page",
  pageSize,
  perPageParamName = "perPage",
  searchParams,
  showPageJump = false,
  totalCount,
  visibleCount
}: PaginationControlsProps) {
  const normalizedPageCount = pageCount ?? null;
  const resolvedHasNext = typeof hasNext === "boolean" ? hasNext : normalizedPageCount !== null ? page < normalizedPageCount : visibleCount >= pageSize;
  const pageStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = totalCount === undefined ? (visibleCount === 0 ? 0 : pageStart + visibleCount - 1) : Math.min(pageStart + visibleCount - 1, totalCount);
  const countLabel = totalCount === 0 ? `Showing 0 ${itemLabel}` : `Showing ${pageStart}-${pageEnd} of ${totalCount} ${itemLabel}`;
  const previousHref = page > 1
    ? buildHref({ basePath, page: page - 1, pageParamName, pageSize, perPageParamName, searchParams })
    : null;
  const nextHref = resolvedHasNext
    ? buildHref({ basePath, page: page + 1, pageParamName, pageSize, perPageParamName, searchParams })
    : null;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <p>
        {totalCount === undefined
          ? `Showing ${visibleCount} ${itemLabel} on page ${page}`
          : countLabel}
        {normalizedPageCount !== null ? ` · Page ${page} of ${Math.max(1, normalizedPageCount)}` : ` · Page ${page}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <form action={basePath} className="flex items-center gap-2" data-admin-table-form={basePath}>
          {Object.entries(searchParams ?? {}).map(([key, value]) =>
            key === pageParamName || key === perPageParamName || value === null || value === undefined || value === "" ? null : (
              <input key={key} name={key} type="hidden" value={value} />
            )
          )}
          <select
            className="h-9 rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-700"
            defaultValue={pageSize}
            name={perPageParamName}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} per page
              </option>
            ))}
          </select>
          <Button size="sm" type="submit" variant="secondary">
            Apply
          </Button>
        </form>
        {showPageJump && normalizedPageCount !== null ? (
          <form action={basePath} className="flex items-center gap-2" data-admin-table-form={basePath}>
            {Object.entries(searchParams ?? {}).map(([key, value]) =>
              key === pageParamName || key === perPageParamName || value === null || value === undefined || value === "" ? null : (
                <input key={key} name={key} type="hidden" value={value} />
              )
            )}
            {pageSize !== DEFAULT_PAGE_SIZE ? <input name={perPageParamName} type="hidden" value={pageSize} /> : null}
            <label className="sr-only" htmlFor={`${pageParamName}-jump`}>Go to page</label>
            <input
              className="h-9 w-20 rounded-full border border-slate-300 bg-white px-3 text-center text-sm text-slate-700"
              defaultValue={page}
              id={`${pageParamName}-jump`}
              inputMode="numeric"
              max={Math.max(1, normalizedPageCount)}
              min={1}
              name={pageParamName}
              type="number"
            />
            <Button size="sm" type="submit" variant="secondary">Go</Button>
          </form>
        ) : null}
        <PaginationNavigationButtons nextHref={nextHref} previousHref={previousHref} />
      </div>
    </div>
  );
}
