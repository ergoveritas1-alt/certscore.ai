"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  FULL_SITE_CONDITION,
  type CrawlOptions,
} from "@website-signal-risk-scanner/shared/full-site-crawl";
import { API_READ_RATE_POLICY } from "@website-signal-risk-scanner/shared/api-read-rate-policy";
import type { FullSiteReportResponse } from "../../server/scans/full-site-report";

type Filters = {
  kind: string;
  q: string;
  purpose: string;
  relationship: string;
  assessment: string;
  confidence: string;
  resourceType: string;
  persistence: string;
  page: string;
  status: string;
  additional: string;
  sort: string;
  pageSort: string;
};
const initialFilters: Filters = {
  kind: "service",
  q: "",
  purpose: "",
  relationship: "",
  assessment: "",
  confidence: "",
  resourceType: "",
  persistence: "",
  page: "",
  status: "",
  additional: "",
  sort: "pages",
  pageSort: "url",
};
const units = {
  service: "Services",
  cookie: "Cookies",
  request: "Requests",
  embed: "Embeds",
  storage: "Other storage",
  script: "Scripts",
};
const duration = (ms: number | null | undefined) =>
  ms === null || ms === undefined
    ? "Unavailable"
    : ms < 60000
      ? `${(ms / 1000).toFixed(1)}s`
      : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
const timestamp = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "long",
      }).format(new Date(value))
    : "In progress";
const button =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:border-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600";

export function FullSiteWorkspace({
  scanId,
  requested,
  children,
}: {
  scanId: string;
  requested: CrawlOptions;
  children: ReactNode;
}) {
  const [tab, setTab] = useState<"resources" | "pages" | "homepage">(
    "resources",
  );
  const [filters, setFilters] = useState(initialFilters),
    [offset, setOffset] = useState(0);
  const [data, setData] = useState<FullSiteReportResponse | null>(null),
    [error, setError] = useState<string | null>(null);
  const [detailPage, setDetailPage] = useState(""),
    [resource, setResource] = useState(""),
    [detailOffset, setDetailOffset] = useState(0);
  const [cookieView, setCookieView] = useState<
    "cookies" | "cookieRelationship" | "cookiePersistence"
  >("cookies");
  const [requestView, setRequestView] = useState<"requests" | "requestPurpose">(
    "requests",
  );
  const terminal = useRef(false);
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const burst = API_READ_RATE_POLICY.profiles.status.windows[0];
    const pollMs =
      Math.ceil(
        (burst.windowSeconds *
          1000 *
          (detailPage
            ? API_READ_RATE_POLICY.weights.evidence
            : API_READ_RATE_POLICY.weights.ordinary)) /
          burst.limits.callerTarget,
      ) * 2;
    const load = async () => {
      let delay = pollMs;
      try {
        const params = new URLSearchParams({
          ...filters,
          offset: String(offset),
          ...(detailPage
            ? { detailPage, resource, detailOffset: String(detailOffset) }
            : {}),
        });
        for (const [key, value] of [...params]) if (!value) params.delete(key);
        const response = await fetch(
          `/api/scans/${scanId}/full-site?${params}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) {
          delay = Math.max(
            delay,
            Number(response.headers.get("retry-after") ?? 0) * 1000,
          );
          throw new Error(
            response.status === 429
              ? "Updates paused until the read limit resets."
              : "Inventory updates are temporarily unavailable.",
          );
        }
        const next = (await response.json()) as FullSiteReportResponse;
        setData(next);
        setError(null);
        terminal.current =
          !["waiting_homepage", "running"].includes(
            next.summary.state.status,
          ) && next.summary.counts.active === 0;
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
      if (!controller.signal.aborted && !terminal.current)
        timer = setTimeout(() => void load(), delay);
    };
    timer = setTimeout(() => void load(), filters.q ? 300 : 0);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [scanId, filters, offset, detailPage, resource, detailOffset]);
  function filter(patch: Partial<Filters>, reset = false) {
    setFilters((previous) => ({
      ...(reset ? initialFilters : previous),
      ...patch,
    }));
    setOffset(0);
    setTab("resources");
  }
  function openResource(key: string, pageId?: string) {
    setResource(key);
    setDetailPage(
      pageId ??
        [
          ...(data?.resources.rows ?? []),
          ...(data?.discovery.beyond ?? []),
          ...(data?.discovery.widespread ?? []),
        ].find((r) => r.key === key)?.pageIds[0] ??
        "",
    );
    setDetailOffset(0);
    setTimeout(() => detailRef.current?.focus(), 0);
  }
  function openPage(id: string) {
    setDetailPage(id);
    setResource("");
    setDetailOffset(0);
    setTimeout(() => detailRef.current?.focus(), 0);
  }
  const s = data?.summary,
    counts = s?.counts,
    state = s?.state;
  const running =
    !state ||
    ["waiting_homepage", "running"].includes(state.status) ||
    (counts?.active ?? 0) > 0;
  function bars(
    title: string,
    rows: Array<{ label: string; count: number }>,
    kind: string,
    field: keyof Filters,
    unit: string,
  ) {
    const maximum = Math.max(1, ...rows.map((r) => r.count));
    return (
      <section className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mb-3 text-xs text-zinc-500">
          {unit}; click a row to inspect evidence.
        </p>
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.label}>
              <button
                className="w-full rounded text-left focus-visible:outline focus-visible:outline-sky-500"
                onClick={() => filter({ kind, [field]: row.label }, true)}
              >
                <span className="flex justify-between gap-3 text-xs">
                  <span className="truncate">{row.label}</span>
                  <strong>{row.count.toLocaleString()}</strong>
                </span>
                <span
                  aria-hidden="true"
                  className="mt-1 block h-1.5 rounded bg-zinc-100"
                >
                  <span
                    className="block h-1.5 rounded bg-sky-600"
                    style={{ width: `${(100 * row.count) / maximum}%` }}
                  />
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!rows.length ? (
          <p className="text-sm text-zinc-500">
            No positive observations retained yet.
          </p>
        ) : null}
      </section>
    );
  }
  const activeFilters = Object.entries(filters).filter(
    ([key, value]) => value && !["kind", "sort", "pageSort"].includes(key),
  );
  const pageName = (id: string) =>
    data?.pageChoices.find((p) => p.id === id)?.url ??
    (data?.evidence?.pageId === id ? data.evidence.page?.url : undefined) ??
    id;
  const selectedResource =
    data?.selectedResource ??
    data?.resources.rows.find((r) => r.key === resource) ??
    [
      ...(data?.discovery.beyond ?? []),
      ...(data?.discovery.widespread ?? []),
    ].find((r) => r.key === resource);
  return (
    <div
      className="mx-auto max-w-[1500px] px-4 py-8 text-zinc-900 sm:px-8"
      data-full-site-report
    >
      <header className="space-y-4 border-b border-zinc-200 pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Scan results
          </h1>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold">
            {state?.status.replaceAll("_", " ") ?? "Loading coverage"}
          </span>
        </div>
        <p className="max-w-4xl text-sm leading-6 text-zinc-600">
          Full homepage audit plus resource inventories from additional public
          pages. Additional pages were opened independently without a consent
          action.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <a
            className="text-sky-800 underline"
            href={`/api/scans/${scanId}/report-export?format=pdf`}
          >
            Download full report PDF
          </a>
          <a
            className="text-sky-800 underline"
            href={`/api/scans/${scanId}/report-export?format=json`}
          >
            Export scope, coverage and page attribution
          </a>
        </div>
        <dl className="flex flex-wrap gap-x-7 gap-y-3 rounded-xl bg-zinc-100 p-4 text-sm">
          {[
            ["Max pages", `${requested.maxPages} (includes homepage)`],
            ["Requested concurrency", requested.concurrency],
            ["Wait between page starts", `${requested.waitSeconds}s`],
            ["Region", state?.region ?? "Loading"],
            ["Observation condition", FULL_SITE_CONDITION],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-zinc-500">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <div
          aria-live="polite"
          className="flex flex-wrap gap-x-5 gap-y-2 text-sm"
        >
          <span>
            Completed: <strong>{counts?.completed ?? "—"}</strong>
          </span>
          <span>
            Partial: <strong>{counts?.partial ?? "—"}</strong>
          </span>
          <span>
            Blocked/failed: <strong>{counts?.blockedFailed ?? "—"}</strong>
          </span>
          <span>
            Pending: <strong>{counts?.pending ?? "—"}</strong>
          </span>
          {state?.stopReason ? (
            <span>
              Stop reason:{" "}
              <strong>{state.stopReason.replaceAll("_", " ")}</strong>
            </span>
          ) : null}
        </div>
        {state?.robotsRestriction ? (
          <p
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
          >
            {state.robotsRestriction}
          </p>
        ) : null}
        {state &&
        (state.effective.concurrency !== requested.concurrency ||
          state.effective.waitSeconds !== requested.waitSeconds) ? (
          <p className="text-sm text-sky-800">
            Effective shared restrictions: at most {state.effective.concurrency}{" "}
            active page workers; at least {state.effective.waitSeconds}s between
            starts. Backoff and homepage audits may pause dispatch.
          </p>
        ) : null}
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            Timing · total elapsed{" "}
            {duration(
              state
                ? Date.parse(state.completedAt ?? new Date().toISOString()) -
                    Date.parse(state.startedAt)
                : null,
            )}
          </summary>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              ["Started", timestamp(state?.startedAt)],
              ["Completed", timestamp(state?.completedAt)],
              ["Homepage audit", duration(state?.homepageDurationMs)],
              [
                "Resource crawl",
                duration(
                  data?.timing.crawlStartedAt
                    ? Date.parse(
                        state?.completedAt ?? new Date().toISOString(),
                      ) - Date.parse(data.timing.crawlStartedAt)
                    : null,
                ),
              ],
              [
                `Median completed-page observation (${s?.timing.sampleCount ?? 0} samples)`,
                duration(s?.timing.medianPageMs),
              ],
              [
                "Slowest completed-page observation",
                duration(s?.timing.slowestPageMs),
              ],
              [
                "Measured peak page workers",
                state?.peakWorkers ?? "Unavailable",
              ],
              ["Measured backoff duration", duration(state?.pauseMs)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-zinc-500">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-zinc-500">
            Wait is a start interval. Page duration measures one observation;
            total duration is wall-clock time. Overlapping durations are not
            added. Load latency is not reported.
          </p>
        </details>
        {running ? (
          <p className="text-sm text-sky-800">
            Results so far · {state?.discovered ?? 0} discovered ·{" "}
            {counts?.queued ?? 0} queued · {counts?.active ?? 0} active ·{" "}
            {(counts?.completed ?? 0) +
              (counts?.partial ?? 0) +
              (counts?.blockedFailed ?? 0)}{" "}
            terminal observations. Discovery may still expand.
          </p>
        ) : null}
        {error ? (
          <p role="status" className="text-sm text-amber-800">
            {error} Retained results remain visible.
          </p>
        ) : null}
      </header>
      <nav
        aria-label="Scan report workspace"
        className="my-6 flex flex-wrap gap-2"
      >
        {(["resources", "pages", "homepage"] as const).map((value) => (
          <button
            key={value}
            className={`${button} ${tab === value ? "!border-zinc-900 !bg-zinc-900 !text-white" : ""}`}
            aria-pressed={tab === value}
            onClick={() => {
              setTab(value);
              setOffset(0);
            }}
          >
            {value === "homepage"
              ? "Homepage audit"
              : value === "pages"
                ? "Pages"
                : "Resources"}
          </button>
        ))}
      </nav>
      <div hidden={tab !== "homepage"} id="homepage-audit">
        <h2 className="mb-2 text-xl font-semibold">Homepage audit</h2>
        <p className="mb-4 text-sm text-zinc-600">
          Homepage audit score and findings. Consent, CMP, privacy, GDPR
          transparency, and transport assessments on additional pages: Not
          assessed.
        </p>
        {children}
      </div>
      {tab !== "homepage" ? (
        <>
          <h2 className="text-lg font-semibold">Across observed pages</h2>
          <p className="mb-4 max-w-4xl text-sm text-zinc-600">
            Totals combine independent page visits, not one continuous visitor
            session. Positive partial-page evidence contributes; incomplete and
            unvisited pages are never negative observations.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              [
                "Pages observed",
                counts ? counts.completed + counts.partial : null,
                "pages",
                "",
              ],
              [
                "Distinct identified services",
                s?.totals.services,
                "resources",
                "service",
              ],
              ["Distinct cookies", s?.totals.cookies, "resources", "cookie"],
              [
                "Request events",
                s?.totals.requestEvents,
                "resources",
                "request",
              ],
              [
                "Embed instances",
                s?.totals.embedInstances,
                "resources",
                "embed",
              ],
              [
                "Not observed on homepage",
                s?.totals.additionalServices,
                "resources",
                "additional",
              ],
            ].map(([label, value, target, kind]) => (
              <button
                key={String(label)}
                className="rounded-xl border border-zinc-200 bg-white p-4 text-left hover:border-sky-600 focus-visible:outline focus-visible:outline-sky-600"
                onClick={() =>
                  target === "pages"
                    ? (setTab("pages"),
                      setOffset(0),
                      setFilters({ ...initialFilters, status: "observed" }))
                    : filter(
                        {
                          kind:
                            kind === "additional" ? "service" : String(kind),
                          additional: kind === "additional" ? "true" : "",
                        },
                        true,
                      )
                }
              >
                <span className="block text-xs text-zinc-500">{label}</span>
                <strong className="my-2 block text-2xl tabular-nums">
                  {typeof value === "number" ? value.toLocaleString() : "—"}
                </strong>
                <span className="text-xs text-zinc-500">
                  {kind === "embed"
                    ? `${s?.totals.embedServices ?? 0} distinct embed services · `
                    : ""}
                  {counts?.completed ?? 0} complete + {counts?.partial ?? 0}{" "}
                  partial pages
                </span>
              </button>
            ))}
          </div>
          {data ? (
            <>
              <div className="my-6 grid gap-4 lg:grid-cols-4">
                <div>
                  <label className="mb-2 block text-xs">
                    Cookie breakdown{" "}
                    <select
                      className="ml-1"
                      value={cookieView}
                      onChange={(e) =>
                        setCookieView(e.target.value as typeof cookieView)
                      }
                    >
                      <option value="cookies">Purpose</option>
                      <option value="cookieRelationship">Relationship</option>
                      <option value="cookiePersistence">Persistence</option>
                    </select>
                  </label>
                  {bars(
                    "Cookies",
                    data.charts[cookieView],
                    "cookie",
                    cookieView === "cookies"
                      ? "purpose"
                      : cookieView === "cookieRelationship"
                        ? "relationship"
                        : "persistence",
                    "Distinct cookie identities",
                  )}
                </div>
                <div>
                  <label className="mb-2 block text-xs">
                    Request breakdown{" "}
                    <select
                      className="ml-1"
                      value={requestView}
                      onChange={(e) =>
                        setRequestView(e.target.value as typeof requestView)
                      }
                    >
                      <option value="requests">Resource type</option>
                      <option value="requestPurpose">Purpose</option>
                    </select>
                  </label>
                  {bars(
                    "Requests",
                    data.charts[requestView],
                    "request",
                    requestView === "requests" ? "resourceType" : "purpose",
                    "Request events",
                  )}
                </div>
                {bars(
                  "Embeds",
                  data.charts.embeds,
                  "embed",
                  "purpose",
                  "Embed instances",
                )}
                {bars(
                  "Services",
                  data.charts.services,
                  "service",
                  "purpose",
                  "Distinct identified services",
                )}
              </div>
              <div className="mb-6 grid min-w-0 gap-4 lg:grid-cols-3">
                {[
                  ["Beyond the homepage", data.discovery.beyond],
                  ["Most widespread", data.discovery.widespread],
                ].map(([label, items]) => (
                  <section
                    className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4"
                    key={String(label)}
                  >
                    <h3 className="mb-3 font-semibold">{String(label)}</h3>
                    {label === "Beyond the homepage" && !s?.baselineComplete ? (
                      <p className="text-sm text-zinc-600">
                        Comparison unavailable: the homepage baseline is
                        incomplete or not comparable.
                      </p>
                    ) : (
                      (
                        items as FullSiteReportResponse["discovery"]["beyond"]
                      ).map((row) => (
                        <button
                          key={row.key}
                          className="mb-2 flex w-full justify-between gap-2 text-left text-sm text-sky-800 hover:underline"
                          onClick={() => openResource(row.key, row.pageIds[0])}
                        >
                          <span>{row.occurrence.label}</span>
                          <span>{row.pageIds.length} pages</span>
                        </button>
                      ))
                    )}
                  </section>
                ))}
                <section className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4">
                  <h3 className="mb-3 font-semibold">Pages to review</h3>
                  {data.discovery.review.map((page) => (
                    <button
                      key={page.id}
                      className="mb-3 block w-full text-left text-sm"
                      onClick={() => openPage(page.id)}
                    >
                      <span className="block truncate text-sky-800">
                        {page.url}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {(page.additionalServices ?? 0) > 0
                          ? `${page.additionalServices} additional services. `
                          : ""}
                        {page.limitations.length
                          ? `Coverage: ${page.limitations.join(", ")}`
                          : ""}
                      </span>
                    </button>
                  ))}
                </section>
              </div>
            </>
          ) : null}
          <section className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap gap-2">
              {tab === "resources" ? (
                Object.entries(units).map(([kind, label]) => (
                  <button
                    className={`${button} ${filters.kind === kind ? "!border-sky-600 bg-sky-50" : ""}`}
                    aria-pressed={filters.kind === kind}
                    key={kind}
                    onClick={() =>
                      filter({
                        kind,
                        purpose: "",
                        resourceType: "",
                        persistence: "",
                      })
                    }
                  >
                    {label}
                  </button>
                ))
              ) : (
                <h3 className="text-lg font-semibold">
                  Page observations and coverage
                </h3>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs text-zinc-600">
                Search resources, vendors, domains or pages
                <input
                  type="search"
                  className={`${button} mt-1 w-full`}
                  value={filters.q}
                  onChange={(e) => {
                    setFilters({ ...filters, q: e.target.value });
                    setOffset(0);
                  }}
                />
              </label>
              {tab === "resources"
                ? (
                    [
                      ["purpose", "Purpose", data?.facets.purposes ?? []],
                      [
                        "relationship",
                        "Relationship",
                        data?.facets.relationships ?? [],
                      ],
                      [
                        "assessment",
                        "Assessment",
                        data?.facets.assessments ?? [],
                      ],
                      [
                        "confidence",
                        "Confidence",
                        data?.facets.confidences ?? [],
                      ],
                      [
                        "resourceType",
                        "Resource type",
                        data?.facets.resourceTypes ?? [],
                      ],
                    ] as const
                  ).map(([key, label, values]) => (
                    <label className="text-xs text-zinc-600" key={key}>
                      {label}
                      <select
                        className={`${button} mt-1 w-full`}
                        value={filters[key]}
                        onChange={(e) => filter({ [key]: e.target.value })}
                      >
                        <option value="">All</option>
                        {values.map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                  ))
                : null}
              <label className="text-xs text-zinc-600">
                Observation status
                <select
                  className={`${button} mt-1 w-full`}
                  value={filters.status}
                  onChange={(e) => {
                    setFilters({ ...filters, status: e.target.value });
                    setOffset(0);
                  }}
                >
                  <option value="">All</option>
                  {[
                    "observed",
                    "completed",
                    "partial",
                    "blocked",
                    "failed",
                    "queued",
                    "active",
                    "excluded",
                    "cancelled",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              {tab === "resources" ? (
                <label className="text-xs text-zinc-600">
                  Page
                  <select
                    className={`${button} mt-1 w-full`}
                    value={filters.page}
                    onChange={(e) => filter({ page: e.target.value })}
                  >
                    <option value="">All observed pages</option>
                    {data?.pageChoices.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.url}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="text-xs text-zinc-600">
                Sort
                <select
                  className={`${button} mt-1 w-full`}
                  value={tab === "pages" ? filters.pageSort : filters.sort}
                  onChange={(e) => {
                    setFilters({
                      ...filters,
                      [tab === "pages" ? "pageSort" : "sort"]: e.target.value,
                    });
                    setOffset(0);
                  }}
                >
                  {(tab === "pages"
                    ? [
                        ["url", "Page URL"],
                        ["duration", "Longest observation"],
                        ["services", "Most services"],
                        ["status", "Status"],
                      ]
                    : [
                        ["pages", "Most observed pages"],
                        ["label", "Name"],
                        ["events", "Most events"],
                      ]
                  ).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="my-4 flex flex-wrap items-center gap-2">
              <label className="mr-3 text-sm">
                <input
                  className="mr-2"
                  type="checkbox"
                  disabled={!s?.baselineComplete}
                  checked={filters.additional === "true"}
                  onChange={(e) =>
                    filter({ additional: e.target.checked ? "true" : "" })
                  }
                />
                Not observed on homepage
              </label>
              {activeFilters.map(([key, value]) => (
                <button
                  className="rounded-full bg-sky-50 px-3 py-1 text-xs text-sky-800"
                  key={key}
                  onClick={() => setFilters({ ...filters, [key]: "" })}
                >
                  {key}: {key === "page" ? pageName(value) : value} ×
                </button>
              ))}
              <button
                className="text-sm underline"
                onClick={() => {
                  setFilters(initialFilters);
                  setOffset(0);
                }}
              >
                Reset filters
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  {tab === "pages" ? "Page observations" : "Resource evidence"};
                  additional-page assessments were not performed.
                </caption>
                {tab === "pages" ? (
                  <>
                    <thead>
                      <tr>
                        {[
                          "Page",
                          "Status",
                          "Services / cookies",
                          "Requests / embeds",
                          "Additional services",
                          "Duration",
                        ].map((h) => (
                          <th
                            className="whitespace-nowrap border-b p-3"
                            key={h}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data?.pages.rows.map((page) => (
                        <tr key={page.id} className="border-b border-zinc-100">
                          <td className="max-w-sm p-3">
                            <button
                              className="block w-full truncate text-left text-sky-800 hover:underline"
                              onClick={() => openPage(page.id)}
                            >
                              {page.url}
                            </button>
                            {page.finalUrl && page.finalUrl !== page.url ? (
                              <p className="truncate text-xs text-zinc-500">
                                Final: {page.finalUrl}
                              </p>
                            ) : null}
                            <p className="text-xs text-zinc-500">
                              {page.limitations.join(", ")}
                            </p>
                            <p className="text-xs text-zinc-500">
                              Discovered {page.discoveryCount ?? 1} time(s) ·{" "}
                              {page.selectionReason}
                            </p>
                          </td>
                          <td className="p-3">{page.status}</td>
                          <td className="p-3">
                            {["completed", "partial"].includes(page.status)
                              ? `${page.services} / ${page.cookies}`
                              : "Unavailable"}
                          </td>
                          <td className="p-3">
                            {page.requestEvents ?? "—"} /{" "}
                            {page.embedInstances ?? "—"}
                          </td>
                          <td className="p-3">
                            {page.additionalServices ?? "—"}
                          </td>
                          <td className="p-3">{duration(page.durationMs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                ) : (
                  <>
                    <thead>
                      <tr>
                        {[
                          "Resource / vendor",
                          "Type / purpose",
                          "Evidence",
                          "Observed pages",
                          "Counting unit",
                          "Homepage",
                        ].map((h) => (
                          <th className="border-b p-3" key={h}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data?.resources.rows.map((row) => (
                        <tr className="border-b border-zinc-100" key={row.key}>
                          <td className="max-w-sm p-3">
                            <button
                              className="block w-full truncate text-left font-medium text-sky-800 hover:underline"
                              onClick={() => openResource(row.key)}
                            >
                              {row.occurrence.label}
                            </button>
                            <span className="text-xs text-zinc-500">
                              {row.occurrence.vendor ?? "Unclassified vendor"}
                            </span>
                          </td>
                          <td className="p-3">
                            {row.occurrence.resourceType}
                            <span className="block text-xs text-zinc-500">
                              {row.purposes.join(", ")}
                            </span>
                          </td>
                          <td className="p-3 text-xs">
                            {row.assessments.join(", ")}
                            <span className="block">
                              Confidence: {row.confidences.join(", ")}
                            </span>
                          </td>
                          <td className="p-3">
                            <button
                              className="text-sky-800"
                              onClick={() => openResource(row.key)}
                            >
                              {row.pageIds.length} pages
                            </button>
                            <span className="block text-xs text-zinc-500">
                              {row.partialPageIds.length} partial
                            </span>
                          </td>
                          <td className="p-3">
                            {row.occurrence.kind === "request" ||
                            row.occurrence.kind === "embed"
                              ? `${row.eventCount} ${row.occurrence.kind === "request" ? "events" : "instances"}`
                              : "1 distinct identity"}
                          </td>
                          <td className="p-3 text-xs">
                            {row.homepage.replaceAll("_", " ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-sm">
              <button
                className={button}
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                Previous
              </button>
              <span>
                {((tab === "pages"
                  ? data?.pages.total
                  : data?.resources.total) ?? 0)
                  ? offset + 1
                  : 0}
                –
                {Math.min(
                  offset + 50,
                  (tab === "pages"
                    ? data?.pages.total
                    : data?.resources.total) ?? 0,
                )}{" "}
                of{" "}
                {(tab === "pages"
                  ? data?.pages.total
                  : data?.resources.total) ?? 0}
              </span>
              <button
                className={button}
                disabled={
                  offset + 50 >=
                  ((tab === "pages"
                    ? data?.pages.total
                    : data?.resources.total) ?? 0)
                }
                onClick={() => setOffset(offset + 50)}
              >
                Next
              </button>
            </div>
          </section>
          {detailPage ? (
            <section
              ref={detailRef}
              tabIndex={-1}
              className="mt-6 rounded-xl border-2 border-sky-200 bg-white p-5"
              aria-label="Page-specific inventory evidence"
            >
              <div className="flex justify-between gap-4">
                <div>
                  <h3 className="font-semibold">
                    {selectedResource?.occurrence.label ??
                      "Page inventory and evidence"}
                  </h3>
                  <p className="break-all text-sm text-zinc-600">
                    {pageName(detailPage)}
                  </p>
                </div>
                <button
                  className={button}
                  onClick={() => {
                    setDetailPage("");
                    setResource("");
                  }}
                >
                  Close
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {FULL_SITE_CONDITION} Page-relative timing; interior-page
                assessments: Not assessed.
              </p>
              {selectedResource ? (
                <div className="my-3 flex flex-wrap gap-2">
                  {selectedResource.pageIds.map((id) => (
                    <button
                      className={`${button} max-w-sm truncate`}
                      key={id}
                      onClick={() => {
                        setDetailPage(id);
                        setDetailOffset(0);
                      }}
                    >
                      {pageName(id)}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="my-3 flex gap-3">
                <button
                  className="text-sm text-sky-800 underline"
                  onClick={() => filter({ page: detailPage })}
                >
                  Resources observed on this page
                </button>
                <a
                  className="text-sm text-sky-800 underline"
                  href={`/api/scans/${scanId}/full-site?detailPage=${detailPage}&resource=${encodeURIComponent(resource)}`}
                >
                  Evidence JSON
                </a>
              </div>
              {data?.evidence?.pageId === detailPage ? (
                <p className="my-2 break-all text-xs text-zinc-600">
                  Status: {data.evidence.page?.status} · Requested:{" "}
                  {data.evidence.page?.url} · Final:{" "}
                  {data.evidence.page?.finalUrl ?? "Unavailable"} ·{" "}
                  {data.evidence.page?.selectionReason} · Sources:{" "}
                  {data.evidence.page?.discoverySources?.join(", ")}
                </p>
              ) : null}
              <p className="my-2 text-xs text-zinc-600">
                {data?.evidence?.pageId === detailPage
                  ? data.evidence.page?.limitations.join(", ")
                  : "Loading page evidence…"}
              </p>
              {data?.evidence?.pageId === detailPage ? (
                <details className="my-3 text-xs">
                  <summary>Verified source and attempt provenance</summary>
                  <pre className="overflow-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(
                      {
                        source: data.evidence.page?.evidence,
                        attempts: data.evidence.attempts,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              ) : null}
              <ul className="divide-y divide-zinc-100">
                {(data?.evidence?.pageId === detailPage
                  ? data.evidence.rows
                  : []
                )?.map((row) => (
                  <li key={`${row.kind}:${row.id}`} className="py-3">
                    <div className="flex flex-wrap justify-between gap-3">
                      <strong className="break-all text-sm">{row.label}</strong>
                      <span className="text-xs">
                        {row.kind} · {duration(row.firstSeenMs)} from page start
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {row.vendor ?? "Unknown vendor"} · {row.purpose} ·{" "}
                      {row.relationship} · confidence {row.confidence}
                    </p>
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer">
                        Retained evidence {row.id}
                      </summary>
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-3">
                        {JSON.stringify(
                          {
                            identity: row.identity,
                            evidenceRefs: row.evidenceRefs,
                            ...row.details,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                    {row.serviceId ? (
                      <button
                        className="mt-1 text-xs text-sky-800 underline"
                        onClick={() =>
                          openResource(`service:${row.serviceId}`, detailPage)
                        }
                      >
                        Service evidence on this page
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-3">
                <button
                  className={button}
                  disabled={!detailOffset}
                  onClick={() =>
                    setDetailOffset(Math.max(0, detailOffset - 50))
                  }
                >
                  Previous evidence
                </button>
                <span className="self-center text-xs">
                  {data?.evidence?.total ?? 0} retained rows
                </span>
                <button
                  className={button}
                  disabled={detailOffset + 50 >= (data?.evidence?.total ?? 0)}
                  onClick={() => setDetailOffset(detailOffset + 50)}
                >
                  Next evidence
                </button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
