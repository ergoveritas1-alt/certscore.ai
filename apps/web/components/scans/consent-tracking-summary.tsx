"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { GpcRequestTable } from "./gpc-request-table";
import { ClassificationCounts } from "./report-inventory-summary";
import { DisclosureChevron } from "./report-finding-row";
import { EvidenceJumpLink } from "./evidence-jump-link";
import { InfoTip } from "./info-tip";
import { useReportInventoryNavigation } from "./report-inventory-navigation";
import { VendorBrandLogo } from "./vendor-brand-chip";
import type { ConsentTrackingTile } from "../../lib/scans/consent-tracking-overview";

const format = (count: number) => count.toLocaleString("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const compactMobile = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 0 });
const statusLabel = { recorded: "Recorded", partial: "Partial", not_tested: "Not tested", unavailable: "NA" } as const;
const tileDescription = "After Accept, After Reject and GPC enabled each count distinct non-essential resources and resources needing classification review. Repeated requests to the same endpoint count once per known method. Cookies count when the evidence shows they were stored or sent. Services group the counted resources. Zero means none were flagged within the observed scope. NA means the count is unavailable. Each visit can cover a different observation window.";

function ClassificationSignal({ count, review = false }: { count: number; review?: boolean }) {
  const label = review ? "review" : "non-essential";
  return <span className="inline-flex items-center gap-1">
    <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${review ? "bg-amber-500" : "bg-rose-500"}`} />
    <span title={`${format(count)} ${label}`}>
      {count >= 1000 ? <>
        <span className="xl:hidden" aria-hidden="true">{compactMobile.format(count)}</span>
        <span className="hidden xl:inline" aria-hidden="true">{compact.format(count)}</span>
        <span className="sr-only">{format(count)}</span>
      </> : count} {label}
    </span>
  </span>;
}

function hasTileDetails(tile: ConsentTrackingTile, canNavigate: boolean) {
  return Boolean(tile.gpcWindow || tile.notes?.length || tile.facts?.length || tile.services?.length ||
    tile.metrics?.some(metric => metric.value != null || Object.values(metric.counts ?? {}).some(value => value != null)) ||
    tile.evidence === "forms" || tile.evidence === "privacy" || (tile.evidence && canNavigate));
}

type GpcTileCounts = Pick<ConsentTrackingTile, "count" | "breakdown" | "state" | "contributors"> & { scanId: string; graphHash: string };

const GpcContext = createContext<ConsentTrackingTile | undefined>(undefined);

export function GpcInventoryProvider({ tile, children }: { tile?: ConsentTrackingTile; children: ReactNode }) {
  const scanId = tile?.deferredGpc?.scanId;
  const graphHash = tile?.deferredGpc?.graphHash;
  const [resolved, setResolved] = useState<GpcTileCounts | null>(null);
  useEffect(() => {
    if (!scanId || !graphHash) return;
    const controller = new AbortController();
    async function readSummary(scanId: string, graphHash: string) {
      try {
        const result = await fetch(`/api/scans/${encodeURIComponent(scanId)}/runtime-evidence-graph?view=gpc-flagged-items`,
          { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (!result.ok) return;
        const data: GpcTileCounts | null = await result.json();
        if (data?.scanId === scanId && data.graphHash === graphHash && !controller.signal.aborted) setResolved(data);
      } catch { /* Keep the count supported by the report itself. */ }
    }
    void readSummary(scanId, graphHash);
    return () => controller.abort();
  }, [scanId, graphHash]);
  const current = tile && resolved && scanId === resolved.scanId && graphHash === resolved.graphHash
    ? { ...tile, ...resolved } : tile;
  return <GpcContext.Provider value={current}>{children}</GpcContext.Provider>;
}

export function GpcInventoryRecap({ fallback }: { fallback: ReactNode }) {
  const tile = useContext(GpcContext);
  if (!tile) return <>{fallback}</>;
  if (tile.count === null) return <>Flagged-item count unavailable</>;
  return <>{format(tile.count)} flagged {tile.count === 1 ? "item" : "items"} · {format(tile.breakdown!.nonEssential)} non-essential · {format(tile.breakdown!.review ?? 0)} review</>;
}

export function GpcInventoryContributors() {
  const tile = useContext(GpcContext);
  if (!tile?.contributors?.length) return null;
  return <details className="rounded-md border border-zinc-200 px-3 py-2">
    <summary className="cursor-pointer font-medium text-zinc-800">Flagged items by service</summary>
    <table className="mt-2 w-full text-left text-xs tabular-nums"><thead><tr>
      <th scope="col">Service or endpoint</th><th scope="col">Non-essential</th><th scope="col">Review</th>
    </tr></thead><tbody>{tile.contributors.map(group => <tr key={group.service} className="border-t border-zinc-100">
      <th scope="row" className="py-1 font-normal">{group.service}</th><td>{group.nonEssential}</td><td>{group.review}</td>
    </tr>)}</tbody></table>
  </details>;
}

export function ConsentTrackingSummary({ tiles: initialTiles }: { tiles: ConsentTrackingTile[] }) {
  const gpc = useContext(GpcContext);
  const tiles = gpc ? initialTiles.map(tile => tile.id === "gpc" ? gpc : tile) : initialTiles;
  const id = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const navigation = useReportInventoryNavigation();
  const active = tiles.find(tile => tile.id === selected && hasTileDetails(tile, Boolean(navigation)));
  const phase = active?.evidence === "forms" || active?.evidence === "privacy" ? undefined : active?.evidence;

  return <section aria-labelledby={`${id}-title`} data-consent-tracking-summary className="rounded-xl border border-slate-200 bg-white"
    onKeyDown={event => { if (event.key === "Escape" && active) { setSelected(null); opener.current?.focus(); } }}>
    <div className="flex items-center justify-between gap-2 rounded-t-xl border-b border-slate-200 bg-slate-50/70 px-3 py-2 sm:px-4">
      <h3 id={`${id}-title`} className="text-xs font-semibold text-slate-700">Consent &amp; tracking behavior</h3>
      <InfoTip align="end" placement="bottom" className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600" text={tileDescription} />
    </div>
    <div data-consent-tracking-grid className={`grid grid-cols-1 gap-px overflow-hidden bg-slate-200 min-[360px]:grid-cols-2 sm:grid-cols-3 ${active ? "" : "rounded-b-xl"}`}>
      {tiles.map(tile => {
        const open = active?.id === tile.id;
        const expandable = hasTileDetails(tile, Boolean(navigation));
        const counts = tile.count !== null ? tile.breakdown : undefined;
        const partialBaseline = tile.id === "before" && tile.state === "partial" && tile.count === null;
        const retainedNonEssential = partialBaseline ? tile.metrics?.flatMap(metric => {
          const count = metric.counts?.nonEssential;
          return count && count > 0 ? [`${format(count)} ${metric.label.toLowerCase()}`] : [];
        }).join(" · ") : undefined;
        const tileClass = "flex min-h-[85px] min-w-0 flex-col justify-center px-3 py-2.5 text-left sm:px-4";
        const content = <>
          <span className="flex items-center justify-between gap-1.5 text-xs font-semibold leading-4 text-slate-700">
            <span>{tile.label}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {tile.choiceUnconfirmed && tile.state === "recorded" ? <span className="rounded bg-slate-100 px-1 text-[9px] font-medium text-slate-600">Unconfirmed</span> : null}
              {expandable ? <DisclosureChevron className={open ? "rotate-180 text-sky-700" : "text-slate-500"} /> : null}
            </span>
          </span>
          <span className="mt-1 flex min-h-7 items-baseline gap-1.5">
            {partialBaseline ? <span className="text-sm font-medium leading-7 text-slate-700">Partial inventory</span>
              : tile.count === null ? <abbr title="No verified count" className="text-base font-medium leading-7 text-slate-600 no-underline">NA</abbr> : (
              <span className="shrink-0 text-2xl font-semibold leading-7 tracking-tight text-slate-950 tabular-nums" title={format(tile.count)}>
                {tile.count >= 100000 ? <>
                  <span className="xl:hidden" aria-hidden="true">{compact.format(tile.count)}</span>
                  <span className="sr-only xl:not-sr-only">{format(tile.count)}</span>
                </> : format(tile.count)}
              </span>
            )}
          </span>
          <span className="mt-0.5 block min-h-4 text-[10px] leading-4 text-slate-600">
            {partialBaseline ? retainedNonEssential && `Non-essential · ${retainedNonEssential}` : counts ? tile.count === 0 ? null : <span className="flex flex-wrap items-center gap-x-1.5 whitespace-nowrap text-[9px] tabular-nums xl:gap-x-2 xl:text-[10px]">
              {counts.nonEssential > 0 ? <ClassificationSignal count={counts.nonEssential} /> : null}
              {counts.review !== undefined && counts.review > 0 ? <ClassificationSignal count={counts.review} review /> : null}
            </span> : tile.count === null && tile.state === "partial" ? "No verified count" : null}
          </span>
        </>;
        if (!expandable) return <div key={tile.id} id={`${id}-${tile.id}`} className={`${tileClass} bg-white`}>{content}</div>;
        return <button key={tile.id} id={`${id}-${tile.id}`} type="button" aria-expanded={open} aria-controls={`${id}-detail`}
          onClick={event => { opener.current = event.currentTarget; setSelected(open ? null : tile.id); }}
          className={`${tileClass} transition-colors focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-sky-700 ${open ? "bg-sky-50 ring-1 ring-inset ring-sky-400" : "bg-white hover:bg-slate-50"}`}>
          {content}
        </button>;
      })}
    </div>
    <div id={`${id}-detail`} role="region" aria-labelledby={active ? `${id}-${active.id}` : undefined} hidden={!active} data-overview-expanded-content
      className="space-y-3 rounded-b-xl border-t border-slate-200 px-3 py-3 text-xs leading-5 text-slate-600 sm:px-4">
      {active ? <>
        {active.gpcWindow ? <GpcRequestTable comparison={active.gpcWindow} /> : <h4 className="text-sm font-semibold text-slate-900">{active.label} <span className="ml-2 text-[11px] font-medium text-slate-600">{statusLabel[active.state]}</span></h4>}
        {active.id === "gpc" && active.state === "partial" ? <p>The count covers the resources retained from the GPC visit. Capture coverage was limited.</p> : null}
        {active.id === "gpc" && active.count === null ? <p>The scan lacks enough verified resource evidence for a flagged-item count.</p> : null}
        {active.notes?.length ? <ul className="max-h-44 space-y-1 overflow-y-auto">{active.notes.map((note, index) => <li key={index} className="break-words">{note}</li>)}</ul> : null}
        {active.facts?.length ? <dl className="flex flex-wrap gap-x-5 gap-y-2">{active.facts.map(fact => <div key={fact.label}><dt className="font-medium text-slate-800">{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl> : null}
        {active.metrics?.length ? <div className="grid gap-x-4 gap-y-2 border-y border-slate-100 py-2 sm:grid-cols-3">{active.metrics.map(metric => <div key={metric.label} className="min-w-0">
          <h5 className="flex flex-wrap justify-between gap-x-2 font-semibold text-slate-800">{metric.label}<span className="font-medium tabular-nums">{metric.value == null ? "NA" : format(metric.value)}</span></h5>
          <ClassificationCounts counts={metric.counts} showUnavailable />
        </div>)}</div> : null}
        {active.services?.length ? <div>
          <h5 className="font-semibold text-slate-800">Identified services</h5>
          <ul className="mt-1 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
            {active.services.map(service => <li key={service} className="flex max-w-full items-start gap-1.5 rounded-md bg-slate-100 px-2 py-0.5">
              <VendorBrandLogo label={service} bundledOnly className="mt-0.5 !h-4 !w-4" />
              <span className="min-w-0 break-words">{service}
                {active.sharedServices?.includes(service) ? <span className="ml-1 text-slate-500">· also seen before</span> : null}
              </span>
            </li>)}
          </ul>
        </div> : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {active.evidence === "forms" ? <EvidenceJumpLink className="font-medium text-sky-800 hover:underline" targetId="report-forms">View forms and fields ↓</EvidenceJumpLink>
            : active.evidence === "privacy" ? <EvidenceJumpLink className="font-medium text-sky-800 hover:underline" targetId="california-privacy-evidence">View California privacy evidence ↓</EvidenceJumpLink>
            : phase && phase !== "gpc" && navigation ? <button type="button" className="font-medium text-sky-800 hover:underline"
              onClick={() => navigation.navigate(active.id === "services" ? "services" : "resources", active.id === "storage" ? "cookie" : "all", phase)}>View timeline and resources ↓</button> : null}
          {active.id === "gpc" ? <EvidenceJumpLink className="font-medium text-sky-800 hover:underline" targetId="gpc-evidence">View GPC evidence, cookies and services ↓</EvidenceJumpLink> : null}
        </div>
      </> : null}
    </div>
  </section>;
}
