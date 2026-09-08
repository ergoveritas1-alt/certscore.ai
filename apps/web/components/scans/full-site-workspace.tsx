"use client";
import { describeSiteTechnology, type SiteMetadataProjection } from "@certscore/contracts";
import { SitePriorityReview } from "./site-priority-review";
import type { ShadowFinding } from "./report-lab/shadow-report-data";
import { FullSiteServices } from "./full-site-services-table";
import { ServiceResourceRows } from "./service-resource-rows";
import { FullSiteResourceContext } from "./full-site-resource-context";
import { CollectionSurfacesTable } from "./collection-surfaces-table";
import { describeFullSitePageFailure } from "../../lib/scans/full-site-page-failure";
import { fullSiteFinalizationDelayed } from "../../lib/scans/full-site-finalization";
import { scanFailureExplanation } from "../../lib/scans/scan-failure-explanation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  FULL_SITE_CONDITION,
  type CrawlOptions,
} from "@website-signal-risk-scanner/shared/full-site-crawl";
import { API_READ_RATE_POLICY } from "@website-signal-risk-scanner/shared/api-read-rate-policy";
import { ScanLiveValue } from "./scan-live-value";
import { SitewideInventorySummary } from "./sitewide-inventory-summary";
import { InventoryPriorityHelp } from "./inventory-priority-help";
import { InventoryResourceProvider, InventoryResourceMobile, type InventoryGraphSource } from "./inventory-resource-details";
import type { ApiRuntimeEvidenceGraphProjection } from "@certscore/api-contracts";

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
  sort: "priority",
  pageSort: "url",
};
const sortKeys: Record<string, string> = { Priority: "priority", Vendor: "vendor", Name: "label", Purpose: "purpose", "Policy disclosure": "policy", Location: "transfer", "First seen": "time", Page: "page" };
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

const FullSiteRegionContext = createContext<string | undefined>(undefined);
export function FullSiteRegion({ children }: { children: ReactNode }) {
  const region = useContext(FullSiteRegionContext);
  return region === "Local" ? <span className="rounded-md border border-zinc-300 bg-white px-2 py-1">Scanned locally</span> : children;
}

const FullSiteTimingContext = createContext<ReactNode>(null);
export function FullSiteTiming() {
  return useContext(FullSiteTimingContext);
}

function CrawlResourceScope({ homepage, source, children }: { homepage: boolean; source?: InventoryGraphSource; children: ReactNode }) {
  return homepage ? children : <InventoryResourceProvider source={source} preload>{children}</InventoryResourceProvider>;
}

export function FullSiteWorkspace({
  scanId,
  requested,
  homepageGraph,
  homepageFindings = [],
  homepageUrl,
  siteMetadata,
  initialStartedAt,
  identity,
  identityWithoutSharing,
  scanNext,
  children,
}: {
  scanId: string;
  requested: CrawlOptions;
  homepageGraph?: ApiRuntimeEvidenceGraphProjection;
  homepageFindings?: ShadowFinding[];
  homepageUrl?: string;
  siteMetadata?: SiteMetadataProjection | null;
  initialStartedAt?: string;
  identity?: ReactNode;
  identityWithoutSharing?: ReactNode;
  scanNext?: ReactNode;
  children: ReactNode;
}) {
  const [inventoryView, setInventoryView] = useState<"resources" | "services">("services");
  const [collapseVersion, setCollapseVersion] = useState(0);
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
  const [isFetching, setIsFetching] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const stopInFlight = useRef(false);
  const terminal = useRef(false);
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // This controller cancels report reads only; the background worker owns the crawl.
    const controller = new AbortController();
    terminal.current = false;
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
    let loading = false;
    let failures = 0;
    const load = async () => {
      if (loading || document.hidden || controller.signal.aborted) return;
      loading = true;
      setIsFetching(true);
      let delay = Math.max(15000, pollMs);
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
        if (controller.signal.aborted) return;
        setData(previous => offset && previous ? {
          ...next,
          resources: { ...next.resources, rows: [...new Map([...previous.resources.rows, ...next.resources.rows].map(row => [row.key, row])).values()] },
          pages: { ...next.pages, rows: [...new Map([...previous.pages.rows, ...next.pages.rows].map(row => [row.id, row])).values()] },
        } : next);
        setError(null);
        failures = 0;
        terminal.current =
          !["waiting_homepage", "running"].includes(
            next.summary.state.status,
          ) && next.summary.counts.active === 0;
      } catch (e) {
        failures += 1;
        delay = Math.max(delay, Math.min(120000, 15000 * 2 ** failures));
        if (!controller.signal.aborted) setError((e as Error).message);
      }
      loading = false;
      if (!controller.signal.aborted) setIsFetching(false);
      if (!controller.signal.aborted && !document.hidden && !terminal.current)
        timer = setTimeout(() => void load(), delay);
    };
    const resume = () => {
      if (timer) clearTimeout(timer);
      if (!document.hidden) {
        setNow(Date.now());
        void load();
      }
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    timer = setTimeout(() => void load(), filters.q ? 300 : 0);
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      if (timer) clearTimeout(timer);
    };
  }, [scanId, filters, offset, detailPage, resource, detailOffset, refreshVersion]);
  async function stopCrawl() {
    if (stopInFlight.current) return;
    stopInFlight.current = true;
    setStopping(true);
    setStopError(null);
    try {
      const response = await fetch(`/api/scans/${scanId}/full-site/stop`, {
        method: "POST", headers: { "x-certscore-full-site-action": "stop" }, signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Could not stop this crawl. Please try again.");
      // Reload persisted state; do not convert locally cached evidence or counts.
      setRefreshVersion(version => version + 1);
    } catch (error) {
      setStopError(error instanceof Error && error.name === "TimeoutError"
        ? "Stop could not be confirmed. Refresh the report or try again."
        : error instanceof Error ? error.message : "Could not stop this crawl. Please try again.");
    }
    finally { stopInFlight.current = false; setStopping(false); }
  }
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
  const running = Boolean(state && (
    ["waiting_homepage", "running"].includes(state.status) ||
    (counts?.active ?? 0) > 0
  ));
  const valuesUpdating = Boolean(state && ["waiting_homepage", "running"].includes(state.status));
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  const startTime = Date.parse(state?.startedAt ?? initialStartedAt ?? "");
  const elapsedSeconds = now !== null && Number.isFinite(startTime) ? Math.max(0, Math.floor((now - startTime) / 1000)) : 0;
  const finishedPages = (counts?.completed ?? 0) + (counts?.partial ?? 0) + (counts?.blockedFailed ?? 0);
  const scannedPages = counts ? counts.completed + counts.partial : null;
  const selectedPages = Math.min(requested.maxPages, finishedPages + (counts?.pending ?? 0));
  const queuedPages = Math.min(counts?.queued ?? 0, Math.max(0, requested.maxPages - finishedPages - (counts?.active ?? 0)));
  // Discovery can grow the denominator. Never imply completion while the crawl is active.
  const pageProgress = selectedPages > 0 ? Math.min(99, finishedPages / selectedPages * 100) : 0;
  const completed = state?.status === "completed" && !running;
  const finalizing = valuesUpdating && Boolean(data?.finalizationStartedAt);
  const finalizationDelayed = finalizing && fullSiteFinalizationDelayed(data?.finalizationStartedAt, now);
  const stoppingWorkers = state?.status === "cancelled" && running;
  const progressLabel = stoppingWorkers ? "Stopping" : finalizationDelayed ? "Finalization delayed" : finalizing ? "Finalizing results" : "In progress";
  const failedPages = data?.pageChoices.filter(page => ["partial", "failed", "blocked"].includes(page.status)) ?? [];
  const outcomeText = counts ? `${counts.completed} succeeded · ${counts.partial} partial · ${counts.blockedFailed} failed or blocked` : "";
  const timingEnd = state?.completedAt ? Date.parse(state.completedAt) : now;
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
  const technology = describeSiteTechnology(siteMetadata?.observation);
  const timing = (
        <details className="text-xs text-zinc-600 sm:relative">
          <summary className="cursor-pointer font-medium">
            Coverage & timing ·{" "}
            {duration(
              state && timingEnd !== null
                ? Math.max(0, Math.floor((timingEnd - Date.parse(state.startedAt)) / 1000) * 1000)
                : null,
            )}
          </summary>
          <div className="absolute left-4 right-4 z-20 mt-2 max-h-[70vh] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-3 shadow-lg sm:left-0 sm:right-auto sm:top-full sm:w-[min(38rem,85vw)]">
            <dl className="mb-3 grid gap-2 border-b border-zinc-200 pb-3 text-xs sm:grid-cols-2">
              <div className="flex items-baseline justify-between gap-3"><dt className="text-zinc-500">CMS / generator</dt><dd className="text-right font-medium text-zinc-800">{technology.platform}</dd></div>
              <div className="flex items-baseline justify-between gap-3"><dt className="text-zinc-500">Declared version</dt><dd className="text-right font-medium tabular-nums text-zinc-800">{technology.version === "Unknown" ? "Not available" : technology.version}</dd></div>
            </dl>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { title: "Coverage", rows: [
                  ["Pages discovered", data?.coverage?.discovered ?? "Loading…"],
                  ["Robots-allowed", data?.coverage ? data.coverage.unknown === data.coverage.discovered && data.coverage.unknown > 0 ? "Not verified" : data.coverage.allowed : "Loading…"],
                  ["Robots-blocked", data?.coverage ? data.coverage.unknown === data.coverage.discovered && data.coverage.unknown > 0 ? "Not verified" : data.coverage.blocked : "Loading…"],
                  ...(data?.coverage?.unknown ? [["Robots not verified", data.coverage.unknown]] : []),
                  ["Page limit", requested.maxPages],
                  ["Excluded links", counts?.excluded ?? 0],
                  ["Stop reason", state?.stopReason === "max_pages" ? "Page limit reached" : state?.stopReason?.replaceAll("_", " ") ?? (running ? "In progress" : "Not stopped")],
                  ["Worker limit", state?.effective.concurrency ?? requested.concurrency],
                  ["Peak workers", state?.peakWorkers ?? "Unavailable"],
                  ["Start interval", `${state?.effective.waitSeconds ?? requested.waitSeconds}s`],
                ] },
                { title: "Timing", rows: [
                  ["Homepage audit", duration(state?.homepageDurationMs)],
                  ["Resource crawl", duration(data?.timing.crawlStartedAt && timingEnd !== null
                    ? Math.max(0, Math.floor((timingEnd - Date.parse(data.timing.crawlStartedAt)) / 1000) * 1000) : null)],
                  ["Median page", duration(s?.timing.medianPageMs)],
                  ["Slowest page", duration(s?.timing.slowestPageMs)],
                  ["Page samples", s?.timing.sampleCount ?? 0],
                  ["Backoff", duration(state?.pauseMs)],
                ] },
              ].map(group => (
                <div key={group.title}>
                  <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{group.title}</h3>
                  <dl className="divide-y divide-zinc-100">
                    {group.rows.map(([label, value]) => (
                      <div key={label} className="flex items-baseline justify-between gap-3 py-1.5 text-xs leading-4">
                        <dt className="text-zinc-500">{label}</dt>
                        <dd className="text-right font-medium tabular-nums text-zinc-800" title={value === "Unavailable" ? "Unavailable" : undefined}>{value === "Unavailable" ? "-" : value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
            <dl className="mt-2 border-t border-zinc-200 pt-2 text-[11px] leading-4">
              {[["Started", timestamp(state?.startedAt)], ["Completed", timestamp(state?.completedAt)]].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 py-0.5">
                  <dt className="text-zinc-500">{label}</dt>
                  <dd className="text-right tabular-nums text-zinc-600">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </details>
  );
  return (
    <FullSiteRegionContext.Provider value={state?.region}>
    <FullSiteTimingContext.Provider value={timing}>
    <div
      className="mx-auto max-w-[1500px] px-4 py-4 text-zinc-900 sm:px-6"
      data-full-site-report
    >
      <header className="border-b border-zinc-200 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Site scan results</h1>
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">{!state ? "Loading report…" : running ? progressLabel : state?.status === "cancelled" ? "Cancelled" : state?.status === "stopped" ? "Unsuccessful" : state?.status === "completed" && (counts?.blockedFailed || counts?.partial) ? "Completed with limitations" : state?.status === "completed" ? "Completed" : state?.status.replaceAll("_", " ") ?? "Loading"}</span>
          </div>
          <div className="flex w-full flex-wrap items-start justify-end gap-2 lg:w-auto lg:flex-1">
            {valuesUpdating ? <button type="button" className={button} onClick={() => void stopCrawl()} disabled={stopping}
              title="Stops additional page visits and keeps captured evidence. An initial page audit or active page visit may finish.">
              {stopping ? "Stopping…" : "Stop site crawl"}
            </button> : null}
            {completed ? scanNext : null}

          </div>
        </div>
        {state?.status === "cancelled" ? <p role="status" className="mt-3 text-sm text-slate-600">
          Site crawl cancelled. Captured evidence is preserved.{running ? " Active page visits are finishing; no additional visits will start." : ""}
        </p> : null}
        {state && counts && !running ? <p className="mt-2 text-xs text-slate-600">{outcomeText}</p> : null}
        {failedPages.length ? <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-amber-950">{failedPages.length} pages with capture limitations — view reasons</summary>
          <p className="mt-2 text-xs text-slate-600">These are page capture outcomes. A page can return an HTTP error even when some content renders.</p>
          <ul className="mt-2 max-h-60 space-y-2 overflow-auto" aria-label="Page capture limitations">
            {failedPages.slice(0, 50).map(page => <li key={page.id} className="flex flex-wrap justify-between gap-1 border-t border-amber-100 pt-2">
              <span className="min-w-0 break-all text-xs text-slate-700">{page.url}</span>
              <strong className="text-xs font-medium text-amber-950">{describeFullSitePageFailure(page)}</strong>
            </li>)}
          </ul>
          {failedPages.length > 50 ? <p className="mt-2 text-xs text-slate-600">Showing the first 50 of {failedPages.length} affected pages.</p> : null}
        </details> : null}
        {stopError ? <p role="alert" className="mt-3 text-sm text-rose-700">{stopError}</p> : null}
        {state?.status === "stopped" ? <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200/70 bg-amber-50/50 px-4 py-3">
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-zinc-900">Full-site scan couldn’t finish</p>
            <p className="mt-1 max-w-2xl text-zinc-600">{state.stopReason === "dispatch_queue_unavailable" ? "Full site scan was unsuccessful. Partial results of the scan are shown below. Try to scan the site again. Contact support@certscore.ai if you encounter more issues." : scanFailureExplanation(state.stopReason).detail}</p>
          </div>
        </div> : null}
        <div className="mt-3">{completed ? identity : identityWithoutSharing ?? identity}</div>
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

        {running ? (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/60 p-4" data-full-site-progress>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-900 motion-safe:animate-pulse motion-safe:[animation-duration:3s]">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 motion-safe:animate-[scan-hourglass-flip_3.2s_ease-in-out_infinite]" fill="none">
                  <path d="M5 3h14M5 21h14M7 3v4c0 2 3 4 5 5-2 1-5 3-5 5v4M17 3v4c0 2-3 4-5 5 2 1 5 3 5 5v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M9 6h6v1l-3 3-3-3V6Zm3 8 3 3v2H9v-2l3-3Z" fill="currentColor" />
                </svg> {progressLabel}
              </span>
              <span className="tabular-nums text-slate-600">{elapsedSeconds}s elapsed</span>
            </div>
            <div role="progressbar" aria-label="Full site scan page progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pageProgress} aria-valuetext={selectedPages ? `${finishedPages} of ${selectedPages} pages processed; ${outcomeText}` : "Discovering pages"} className="h-2 overflow-hidden rounded-full bg-sky-100">
              <div className="h-full rounded-full bg-sky-600 transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${pageProgress}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-sky-900" aria-live="polite">
              <span className="font-medium tabular-nums">{selectedPages ? `${finishedPages} / ${selectedPages} pages processed` : "Discovering pages"}</span>
              <span>{counts?.active ?? 0} active · {queuedPages} queued · up to {requested.maxPages} pages</span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{outcomeText}</p>
            <p role={finalizationDelayed ? "status" : undefined} className="mt-1 text-xs text-slate-500">
              {stoppingWorkers ? "Waiting for active page visits to finish within their existing time limits."
                : finalizationDelayed ? "Page visits have finished, but finalization is taking longer than expected. You can stop this crawl and keep the captured evidence."
                : finalizing ? "Page visits have finished. Finalizing the retained results."
                : "Results update as pages finish. Discovery may add more pages."}
            </p>
          </div>
        ) : null}
        {error ? (
          <p role="status" className="text-sm text-amber-800">
            {error} Retained results remain visible.
          </p>
        ) : null}
      </header>
      <section className="my-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 md:grid-cols-5" aria-label="Scan summary">
        <div className="col-span-2 flex min-w-0 flex-col bg-slate-50 px-3 py-3 md:col-span-1">
          <span className="text-xs font-medium text-slate-600">Full site score</span>
          <div className="my-1 flex items-baseline gap-1.5 tabular-nums">
            <strong className="text-2xl font-semibold tracking-tight text-slate-950"><ScanLiveValue value={data?.score?.value} active={valuesUpdating} /></strong>
            <span className="text-xs text-slate-500">/ 100</span>
          </div>
          <p className="text-xs leading-4 tabular-nums text-slate-600"><ScanLiveValue value={scannedPages === null ? "Loading page count…" : `${scannedPages} ${scannedPages === 1 ? "page" : "pages"} scanned`} active={valuesUpdating} /></p>
          <div className="mt-1 text-[11px] leading-4 text-slate-500" title={data?.score?.scope}>
            {data?.score ? data.score.limitedPages ? "Limited coverage" : "Site-wide assessment" : valuesUpdating ? "Awaiting scored evidence" : "Full site score unavailable"}
          </div>
        </div>
        <div className="flex min-w-0 flex-col bg-white px-3 py-3">
          <span className="text-xs font-medium text-slate-500">Forms</span>
          <strong className="my-1 block text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">
            <ScanLiveValue active={valuesUpdating} value={data?.collectionSurfaces && (data.collectionSurfaces.rows.length > 0 || (data.collectionSurfaces.pagesWithoutInventory === 0 && data.collectionSurfaces.limitedPages === 0))
              ? data.collectionSurfaces.rows.length
              : null} />
          </strong>
          <div className="text-xs leading-4 tabular-nums text-slate-600">
            {data?.collectionSurfaces ? <>
              <ScanLiveValue active={valuesUpdating} value={`${data.collectionSurfaces.rows.reduce((sum, row) => sum + row.form.retainedFieldCount, 0)} fields · ${data.collectionSurfaces.rows.filter(row => row.snapshot.status === "available").length} snapshots`} />
              {data.collectionSurfaces.pagesWithoutInventory > 0 || data.collectionSurfaces.limitedPages > 0
                ? <span className="mt-1 block">{data.collectionSurfaces.rows.length > 0 ? "Limited coverage" : "Inventory unavailable"}</span> : null}
            </> : "Loading inventory…"}
          </div>
        </div>
        {[
          { label: "Cookies / storage", value: s ? s.totals.cookies + s.totals.storage : null, group: "cookies" },
          { label: "Requests", value: s?.totals.requestEvents, group: "requests" },
          { label: "Embed instances", value: s?.totals.embedInstances, group: "embeds" },
        ].map(metric => (
          <div key={metric.group} className="flex min-w-0 flex-col bg-white px-3 py-3">
            <span className="text-xs font-medium text-slate-500">{metric.label}</span>
            <strong className="my-1 block text-2xl font-semibold tracking-tight text-slate-950 tabular-nums"><ScanLiveValue value={metric.value} active={valuesUpdating} /></strong>
            {metric.group !== "embeds" ? (
              <dl className="space-y-0.5 text-xs leading-4 tabular-nums">
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5 text-slate-600"><span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />Non-essential</dt>
                  <dd className="font-medium text-slate-900"><ScanLiveValue value={data?.priorityTotals?.[metric.group]?.nonEssential} active={valuesUpdating} /></dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5 text-slate-600"><span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />Review</dt>
                  <dd className="font-medium text-slate-900"><ScanLiveValue value={data?.priorityTotals?.[metric.group]?.review} active={valuesUpdating} /></dd>
                </div>
              </dl>
            ) : (
              <dl className="space-y-0.5 text-xs leading-4 text-slate-600 tabular-nums" aria-label="Embed categories">
                {data?.charts.embeds.slice(0, 3).map(category => (
                  <div key={category.label} className="flex justify-between gap-2">
                    <dt className="capitalize">{category.label === "unknown" ? "Unclassified" : category.label.replaceAll("_", " ")}</dt>
                    <dd className="font-medium text-slate-900"><ScanLiveValue value={category.count} active={valuesUpdating} /></dd>
                  </div>
                ))}
                {data && data.charts.embeds.length > 3 ? <div className="flex justify-between gap-2"><dt>Other</dt><dd className="font-medium text-slate-900"><ScanLiveValue value={data.charts.embeds.slice(3).reduce((sum, category) => sum + category.count, 0)} active={valuesUpdating} /></dd></div> : null}
                {!data ? <dt>Loading categories…</dt> : !data.charts.embeds.length ? <dt>None observed</dt> : null}
              </dl>
            )}
          </div>
        ))}
      </section>
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
              setDetailPage("");
              setResource("");
            }}
          >
            {value === "homepage"
              ? "Homepage report"
              : "Full site report"}
          </button>
        ))}
      </nav>
      <div hidden={tab !== "homepage"} id="homepage-audit" className="[&_.mx-auto]:!max-w-none [&_.mx-auto]:!px-0 [&_.p-5]:!px-0">
        {children}
      </div>
      {tab !== "homepage" ? (
        <>
          <SitePriorityReview findings={data?.score?.priorityReview ?? homepageFindings.map(finding => ({ ...finding, pages: homepageUrl ? [{ id: scanId, url: homepageUrl, homepage: true }] : [] }))} pending={!data || valuesUpdating} sitewideAvailable={Boolean(data?.score)} />
          {data && tab === "resources" ? <SitewideInventorySummary mix={data.inventoryMix} updating={valuesUpdating} /> : null}
          <section className="min-w-0 border-y border-zinc-200 bg-white py-4">
            <h2 className="mb-3 text-xl font-semibold">{tab === "pages" ? "Page observations and coverage" : "Resources and Services Details"}</h2>
            {activeFilters.length ? <button className="mb-2 text-xs text-sky-800 underline" onClick={() => { setFilters(initialFilters); setOffset(0); }}>Show all {units[filters.kind as keyof typeof units]?.toLowerCase()}</button> : null}
              <div className="mb-3 flex gap-2" role="group" aria-label="Inventory view">{(["services", "resources"] as const).map(view => <button key={view} type="button" aria-pressed={inventoryView === view} className={`${button} capitalize ${inventoryView === view ? "!bg-slate-900 !text-white" : ""}`} onClick={() => setInventoryView(view)}>{view}</button>)}</div>
            <div className="my-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="shrink-0"><ScanLiveValue key={inventoryView} active={valuesUpdating} value={data ? `${inventoryView === "services" ? data.services.length : data.resources.total} ${inventoryView}` : "Loading inventory…"} /></span><span className="text-slate-500">{inventoryView === "services" ? "· Organized by root integration; expand for linked services and resources." : "· Distinct resources across scanned pages; expand to see parent/child links."}</span></div>
              <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => setCollapseVersion(value => value + 1)} className="rounded-md px-2 py-1.5 text-sky-700 hover:bg-sky-50">Collapse all</button></div>
            </div>
            <div className="max-h-[488px] overflow-auto rounded-lg border border-zinc-200" tabIndex={0} aria-busy={isFetching} aria-label={tab === "pages" ? "Scrollable page observations" : `Scrollable ${inventoryView}`}
              onScroll={event => {
                const el = event.currentTarget;
                const table = tab === "pages" ? data?.pages : data?.resources;
                if (inventoryView === "resources" && table && el.scrollTop + el.clientHeight >= el.scrollHeight - 40 && table.rows.length < table.total && table.offset === offset) setOffset(offset + table.limit);
              }}>

              {inventoryView === "services" && data ? <FullSiteServices key={collapseVersion} scenario="pre_consent" services={data.services} pageName={pageName} pageChoices={data.pageChoices} homepageGraph={homepageGraph} /> : null}
              <div hidden={inventoryView !== "resources"}>
              <InventoryResourceProvider projection={homepageGraph} preload><table className="w-full min-w-[1000px] text-left text-xs">
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
                              {page.limitations.map(value => value.replaceAll("_", " ")).join(", ")}
                            </p>
                          </td>
                          <td className="p-3">{page.status}{page.httpStatus !== null ? ` · HTTP ${page.httpStatus}` : ""}</td>
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
                          "Count", "Type", "Name", "Priority", "Purpose", "Policy disclosure", "Location", "First seen", "Domain", "Site relationship", "Page", "JSON",
                        ].map((h) => (
                          <th className={`h-10 whitespace-nowrap border-b ${!h ? "w-10 px-1" : h === "Count" ? "w-14 px-2 text-center" : "px-3"} ${h === "JSON" ? "sticky right-0 bg-zinc-50" : ""}`} key={h} aria-sort={sortKeys[h] && filters.sort.replace(/_desc$/, "") === sortKeys[h] ? filters.sort.endsWith("_desc") ? "descending" : "ascending" : undefined}>
                            <div className={`flex items-center gap-1 ${h === "Count" ? "justify-center" : ""}`}>{sortKeys[h] ? <button className="flex items-center gap-1 rounded uppercase tracking-wider hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500" onClick={() => { setFilters(current => ({ ...current, sort: current.sort === sortKeys[h] ? `${sortKeys[h]}_desc` : sortKeys[h]! })); setOffset(0); }}>{h}<span aria-hidden="true">{filters.sort === sortKeys[h] ? "↑" : filters.sort === `${sortKeys[h]}_desc` ? "↓" : "↕"}</span></button> : h === "JSON" || !h ? <span className="sr-only">{h === "JSON" ? "JSON evidence" : "Expand relationships"}</span> : h}{h === "Priority" ? <InventoryPriorityHelp/> : null}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data?.resources.rows.map((row) => (
                        <CrawlResourceScope key={row.key} source={data.pageChoices.find(page => page.id === row.pageIds[0])?.graphSource} homepage={data.pageChoices.find(page => page.id === row.pageIds[0])?.source === "homepage"}>
                        <ServiceResourceRows row={{ ...row, name: row.occurrence.label, kind: row.occurrence.kind }} resourceContext={row} pageName={pageName} scenario="pre_consent" collapseVersion={collapseVersion}/>

                        </CrawlResourceScope>
                      ))}
                    </tbody>
                  </>
                )}
              </table></InventoryResourceProvider></div>
            </div>
            {inventoryView !== "services" || !data || isFetching ? <p className="mt-2 text-xs text-zinc-500">{!data ? "Loading inventory…" : isFetching ? "Updating inventory…" : `${tab === "pages" ? data.pages.total : data.resources.total} ${(tab === "pages" ? data.pages.total : data.resources.total) === 1 ? "row" : "rows"} · Scroll to view all.`}</p> : null}
          </section>
          {tab === "resources" ? <CollectionSurfacesTable rows={data?.collectionSurfaces?.rows ?? []} loading={!data} scanning={valuesUpdating} pagesWithoutInventory={data?.collectionSurfaces?.pagesWithoutInventory} limitedPages={data?.collectionSurfaces?.limitedPages} /> : null}
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
                  : error ?? "Loading page evidence…"}
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
              {data?.selectedResourceDetails?.key === resource && data.selectedResourceDetails.pageId === detailPage ? <FullSiteResourceContext context={data.selectedResourceDetails.context} destinations={data.selectedResourceDetails.destinations} /> : null}
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
                    <InventoryResourceProvider key={`${detailPage}:${row.id}`} projection={data?.evidence?.page?.source === "homepage" ? homepageGraph : undefined} source={data?.pageChoices.find(page => page.id === detailPage)?.graphSource}>
                      <InventoryResourceMobile identity={{ nodeRefs: row.graphNodeRefs ?? row.evidenceRefs, cookieRefs: row.kind === "cookie" ? row.evidenceRefs : [], requests: [] }} facts={{ name: row.label, type: row.kind, purpose: row.purpose, evidencePage: pageName(detailPage), firstSeenMs: row.firstSeenMs, domains: row.domain ? [row.domain] : [], relationship: row.relationship }} />
                    </InventoryResourceProvider>
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
                  {data?.evidence?.pageId === detailPage ? `${data.evidence.total} retained rows` : "Evidence pending"}
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
    </FullSiteTimingContext.Provider>
    </FullSiteRegionContext.Provider>
  );
}
