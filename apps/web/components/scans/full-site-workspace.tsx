"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  FULL_SITE_CONDITION,
  type CrawlOptions,
} from "@website-signal-risk-scanner/shared/full-site-crawl";
import { API_READ_RATE_POLICY } from "@website-signal-risk-scanner/shared/api-read-rate-policy";
import { SitewideInventorySummary } from "./sitewide-inventory-summary";
import { InventoryPurposeChip } from "./inventory-cell-formatting";
import { InventoryResourceProvider, InventoryResourceRow } from "./inventory-resource-details";
import type { ApiRuntimeEvidenceGraphProjection } from "@certscore/api-contracts";
import { VendorBrandIcon } from "./vendor-brand-chip";

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
  kind: "all",
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
  cookie: "Cookies / storage",
  request: "Requests",
  embed: "Embeds",
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

function CrawlResourceScope({ homepage, children }: { homepage: boolean; children: ReactNode }) {
  return homepage ? children : <InventoryResourceProvider>{children}</InventoryResourceProvider>;
}

export function FullSiteWorkspace({
  scanId,
  requested,
  homepageGraph,
  children,
}: {
  scanId: string;
  requested: CrawlOptions;
  homepageGraph?: ApiRuntimeEvidenceGraphProjection;
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
        setData(previous => offset && previous ? {
          ...next,
          resources: { ...next.resources, rows: [...new Map([...previous.resources.rows, ...next.resources.rows].map(row => [row.key, row])).values()] },
          pages: { ...next.pages, rows: [...new Map([...previous.pages.rows, ...next.pages.rows].map(row => [row.id, row])).values()] },
        } : next);
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
  const shortPage = (url: string) => url.length > 30 ? `${url.slice(0, 29)}…` : url;
  const evidenceSymbol = (label: string) => ({ "Non-essential": "△", Essential: "◇", Review: "♢", Contextual: "ⓘ" }[label] ?? "ⓘ");
  const evidenceStyle = (label: string) => ({ "Non-essential": "text-rose-500", Essential: "text-blue-500", Review: "text-amber-500", Contextual: "text-sky-500" }[label] ?? "text-zinc-500");
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
      className="mx-auto max-w-[1500px] px-4 py-4 text-zinc-900 sm:px-6"
      data-full-site-report
    >
      <header className="border-b border-zinc-200 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Site scan results</h1>
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">{state?.status.replaceAll("_", " ") ?? "Loading"}</span>
          </div>
          <div className="flex gap-2">
            <a className={`${button} inline-flex items-center gap-1.5 !py-1.5`} href={`/api/scans/${scanId}/report-export?format=pdf`}><span aria-hidden="true">↓</span>PDF</a>
            <a className={`${button} inline-flex items-center gap-1.5 !py-1.5`} href={`/api/scans/${scanId}/report-export?format=json`}><span aria-hidden="true">⇩</span>Export</a>
          </div>
        </div>
        <div aria-live="polite" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
          <span><strong className="text-zinc-900">{counts?.completed ?? "—"}</strong> complete · {counts?.partial ?? 0} partial · {counts?.blockedFailed ?? 0} failed · {counts?.pending ?? 0} pending</span>
          <span>Limit {requested.maxPages} pages</span><span>{state?.region}</span>
          <span>{FULL_SITE_CONDITION}</span>
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
        <details className="mt-2 text-xs text-zinc-600">
          <summary className="cursor-pointer font-medium">
            Coverage & timing ·{" "}
            {duration(
              state
                ? Date.parse(state.completedAt ?? new Date().toISOString()) -
                    Date.parse(state.startedAt)
                : null,
            )}
          </summary>
          <dl className="mt-2 grid gap-2 sm:grid-cols-3">
            {[
              ["Page limit", requested.maxPages],
              ["Concurrency", state?.effective.concurrency ?? requested.concurrency],
              ["Seconds between starts", state?.effective.waitSeconds ?? requested.waitSeconds],
              ["Stopped because", state?.stopReason?.replaceAll("_", " ") ?? "In progress"],
              ["Excluded links (not crawled)", counts?.excluded ?? 0],
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
          <div className="mt-3 grid grid-cols-2 gap-px border-y border-zinc-200 bg-zinc-200 sm:grid-cols-4">
            {[
              [
                "Pages scanned",
                counts ? counts.completed + counts.partial : null,
                "pages",
                "",
              ],
              ["Cookies / storage", s ? s.totals.cookies + s.totals.storage : null, "resources", "cookie"],
              [
                "Requests",
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
            ].map(([label, value, target, kind]) => (
              <button
                key={String(label)}
                className="min-w-0 bg-white py-2 pr-3 text-left hover:bg-sky-50 focus-visible:outline focus-visible:outline-sky-600"
                onClick={() =>
                  target === "pages"
                    ? (setTab("pages"),
                      setOffset(0),
                      setFilters({ ...initialFilters, status: "observed" }))
                    : filter(
                        {
                          kind: "all",
                          additional: kind === "additional" ? "true" : "",
                        },
                        true,
                      )
                }
              >
                <span className="block text-xs text-zinc-500">{label}</span>
                <strong className="block text-lg leading-6 tabular-nums">
                  {typeof value === "number" ? value.toLocaleString() : "—"}
                </strong>
                {data?.resourceGroups[String(kind)] ? <span className="block text-xs text-zinc-500">{data.resourceGroups[String(kind)]?.services} services · {data.resourceGroups[String(kind)]?.additionalServices} on additional pages</span> : null}
              </button>
            ))}
          </div>
      <nav
        aria-label="Scan report workspace"
        className="my-3 flex flex-wrap gap-2"
      >
        {(["resources", "homepage"] as const).map((value) => (
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
              ? "Homepage"
              : "Full site report"}
          </button>
        ))}
      </nav>
      <div hidden={tab !== "homepage"} id="homepage-audit" className="[&_.mx-auto]:!max-w-none [&_.mx-auto]:!px-0 [&_.p-5]:!px-0">
        {children}
      </div>
      {tab !== "homepage" ? (
        <>
          <p className="mb-2 text-xs text-zinc-600">{tab === "resources" ? "Inventory combines resources across all scanned pages." : "Pages shows the resources and coverage retained for each URL."} Additional pages receive inventory checks only; scores and findings belong to the homepage.</p>
          {data && tab === "resources" ? <SitewideInventorySummary mix={data.inventoryMix} /> : null}
          <section className="min-w-0 border-y border-zinc-200 bg-white py-4">
            <h2 className="mb-3 text-xl font-semibold">{tab === "pages" ? "Page observations and coverage" : "Resource details"}</h2>
            {tab === "resources" ? <div className="mb-4 flex flex-wrap gap-5 text-xs text-zinc-600">{["Non-essential", "Essential", "Review", "Contextual"].map(label => <span key={label} className="flex items-center gap-2"><span className={evidenceStyle(label)} aria-hidden="true">{evidenceSymbol(label)}</span>{label}</span>)}</div> : null}
            {activeFilters.length ? <button className="mb-2 text-xs text-sky-800 underline" onClick={() => { setFilters(initialFilters); setOffset(0); }}>Show all {units[filters.kind as keyof typeof units]?.toLowerCase()}</button> : null}
            <div className="max-h-[488px] overflow-auto" tabIndex={0} aria-label={tab === "pages" ? "Scrollable page observations" : "Scrollable resources"}
              onScroll={event => {
                const el = event.currentTarget;
                const table = tab === "pages" ? data?.pages : data?.resources;
                if (table && el.scrollTop + el.clientHeight >= el.scrollHeight - 40 && table.rows.length < table.total && table.offset === offset) setOffset(offset + table.limit);
              }}>
              <InventoryResourceProvider projection={homepageGraph}><table className="w-full text-left text-xs">
                <caption className="sr-only">
                  {tab === "pages" ? "Page observations" : "Resource evidence"};
                  additional pages receive inventory classification, not full diagnostic audits.
                </caption>
                {tab === "pages" ? (
                  <>
                    <thead className="sticky top-0 z-10 h-10 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
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
                        <tr key={page.id} className="h-14 border-b border-zinc-100">
                          <td className="max-w-[260px] py-2 pr-3">
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
                    <thead className="sticky top-0 z-10 h-10 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
                      <tr>
                        {[
                          "Priority", "Type", "Vendor", "Name", "Purpose", "First seen", "Domains", "Relationship", "Page",
                        ].map((h) => (
                          <th className="h-10 whitespace-nowrap border-b px-3 first:pl-0" key={h}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data?.resources.rows.map((row) => (
                        <CrawlResourceScope key={row.key} homepage={data.pages.rows.find(page => page.id === row.pageIds[0])?.source === "homepage"}>
                        <InventoryResourceRow inspect relationships={Boolean(homepageGraph && data.pages.rows.find(page => page.id === row.pageIds[0])?.source === "homepage")} identity={{cookieRefs: [], nodeRefs: row.occurrence.evidenceRefs, requests: row.occurrence.kind === "request" ? (() => { try {const url = new URL(row.occurrence.label);return [{hostname: url.hostname, path: url.pathname, method: typeof row.occurrence.details.method === "string" ? row.occurrence.details.method : null}];} catch {return [];}})() : []}} facts={{ name: row.occurrence.label, type: row.occurrence.kind, vendor: row.occurrence.vendor, domains: row.occurrence.domain ? [row.occurrence.domain] : [], purpose: row.purposes.join(", "), evidence: row.inventoryEvidence, confidence: row.confidences.join(", "), pages: row.pageIds.map(pageName), firstSeenMs: row.occurrence.firstSeenMs, relationship: row.relationships.join(", "), eventCount: row.eventCount }} evidence={{ ...row.occurrence.details, evidenceRefs: row.occurrence.evidenceRefs, resourceIdentity: row.occurrence.identity }}>
                        <tr className="h-14 border-b border-zinc-100" key={row.key}>
                          <td className="h-14 pr-3"><button title={row.inventoryEvidence} aria-label={`${row.inventoryEvidence}: inspect ${row.occurrence.label}`} className={`text-lg ${evidenceStyle(row.inventoryEvidence)}`} onClick={() => openResource(row.key)}>{evidenceSymbol(row.inventoryEvidence)}</button></td>
                          <td className="px-3"><span className="text-sky-700" title={row.occurrence.kind}>{row.occurrence.kind === "request" ? "⇄" : row.occurrence.kind === "embed" ? "‹›" : row.occurrence.kind === "cookie" ? "◉" : "▤"}</span><span className="sr-only">{row.occurrence.kind}</span></td>
                          <td className="px-3"><span className="inline-flex max-w-40 items-center gap-2 rounded-full border border-zinc-200 px-2 py-1"><VendorBrandIcon label={row.occurrence.vendor ?? row.occurrence.domain ?? row.occurrence.label} /><span className="truncate" title={row.occurrence.vendor ?? undefined}>{row.occurrence.vendor ?? row.occurrence.domain ?? "Unknown"}</span></span></td>
                          <td className="px-3"><button className="block max-w-56 truncate text-left text-sky-800 hover:underline" title={row.occurrence.label} onClick={() => openResource(row.key)}>{row.occurrence.label}</button></td>
                          <td className="px-3"><span className="inline-flex max-w-40"><InventoryPurposeChip purpose={row.purposes.join(", ").replaceAll("_", " ")} /></span></td>
                          <td className="whitespace-nowrap px-3" title="From the start of the retained page observation">{duration(row.occurrence.firstSeenMs)}</td>
                          <td className="px-3"><span className="block max-w-44 truncate font-mono" title={row.occurrence.domain ?? undefined}>{row.occurrence.domain ?? "Unknown"}</span></td>
                          <td className="whitespace-nowrap px-3 capitalize">{row.relationships.join(", ").replaceAll("_", " ")}</td>
                          <td className="px-3"><button className="whitespace-nowrap text-left text-sky-800 hover:underline" title={row.pageIds.map(pageName).join("\n")} onClick={() => openResource(row.key)}>{shortPage(pageName(row.pageIds[0] ?? ""))}{row.pageIds.length > 1 ? <span className="ml-2 text-zinc-500">+{row.pageIds.length - 1}</span> : null}</button></td>
                        </tr>
                        </InventoryResourceRow>
                        </CrawlResourceScope>
                      ))}
                    </tbody>
                  </>
                )}
              </table></InventoryResourceProvider>
            </div>
            <p className="mt-2 text-xs text-zinc-500">{tab === "pages" ? data?.pages.total : data?.resources.total} rows · Scroll to view all. Select a row for retained evidence.</p>
          </section>
          {detailPage ? (
            <section
              ref={detailRef}
              tabIndex={-1}
              className="mt-6 border-y-2 border-sky-200 bg-white py-5"
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
