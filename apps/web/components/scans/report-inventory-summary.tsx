"use client";
import { INVENTORY_METRIC_LABELS, INVENTORY_CLASSIFICATION_ORDER, INVENTORY_CLASSIFICATION_LABELS, INVENTORY_CLASSIFICATION_DESCRIPTIONS, inventoryMetricLabel, inventoryMetricOrder } from "../../lib/scans/inventory-resource-semantics";
import type { ExecutiveRuntimeCard } from "../../lib/scans/executive-runtime-cards";
import type { NetworkInventoryOverview } from "../../lib/scans/network-inventory-overview";
import { DisclosureChevron } from "./report-finding-row";
import { VendorBrandIcon } from "./vendor-brand-chip";
import { ServicesSignalSnapshot } from "./services-signal-snapshot";
import { summarizeSiteIntegrityLinks, type SiteIntegritySiteReport } from "../../lib/scans/site-integrity-report";
import { InventoryTileHeading, inventoryTileDisclosure, inventoryTilePadding } from "./inventory-tile-heading";
import { ScanLiveValue } from "./scan-live-value";
import { isAfterAcceptForm } from "../../lib/scans/collection-surface-table-row";

export type InventoryAssessmentCounts = { nonEssential: number; review: number; contextual: number; essential: number; unclassified?: number };
export type ReportInventoryMetric = { label: string; value: number | null | undefined; lowerBound?: boolean; counts?: InventoryAssessmentCounts; note?: string; overview?: NetworkInventoryOverview };

const classificationColors = { nonEssential: "bg-rose-500", review: "bg-amber-500", unclassified: "bg-slate-400", contextual: "bg-sky-500", essential: "bg-blue-500" } as const;

const classificationKeys = { "Non-essential": "nonEssential", Review: "review", Unclassified: "unclassified", Contextual: "contextual", Essential: "essential" } as const;
const classifications = INVENTORY_CLASSIFICATION_ORDER.map(value => [INVENTORY_CLASSIFICATION_LABELS[value]!, classificationKeys[value], INVENTORY_CLASSIFICATION_DESCRIPTIONS[value]] as const);

function InventoryCount({ value, updating, label }: { value: number | null | undefined; updating: boolean; label: string }) {
  const count = <ScanLiveValue value={value} active={updating} />;
  return value == null
    ? <span tabIndex={0} aria-label={`${label} unavailable; not a verified zero`} title={`${label} unavailable; this is not a verified zero.`} className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600">{count}</span>
    : count;
}

/** Only projected privacy evidence belongs in the executive cards. */
export function ReportRuntimeSummary({ cards }: { cards: ExecutiveRuntimeCard[] }) {
  return <section aria-label="Pre-consent privacy evidence" className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
    <div className="grid divide-y divide-zinc-200 md:grid-cols-3 md:divide-y-0">
      {cards.map((card, index) => {
        const state = card.state === "observed" ? "Observed" : card.state === "review" ? "Review needed" : card.state === "not_observed" ? "Not observed" : "Not confirmed";
        const dot = card.state === "observed" ? "bg-rose-500" : card.state === "review" ? "bg-amber-500" : "bg-slate-400";
        return <div key={card.id} className={`flex min-w-0 flex-col px-4 py-3 ${index ? "md:border-l md:border-zinc-200" : ""}`}>
          <h3 className="text-sm font-medium text-slate-500">{card.label}</h3>
          <div className="mt-2 flex min-h-9 flex-wrap items-baseline gap-x-3 gap-y-1">
            {card.count !== null ? <p title={card.lowerBound ? "At least this many distinct items are verified in retained evidence" : undefined} className="text-3xl font-semibold tracking-tight text-slate-950 tabular-nums">{card.lowerBound ? "≥" : ""}{card.count.toLocaleString()}</p> : null}
            <p className={`flex items-center gap-2 ${card.count === null ? "text-lg font-semibold text-slate-800" : "text-xs text-slate-600"}`}><span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />{state}</p>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-600">{card.description}</p>
          {card.vendors.length ? <div className="mt-2 flex flex-wrap items-center gap-2">{card.vendors.slice(0, 2).map(name => <span key={name} className="inline-flex min-w-0 items-center gap-1.5 text-xs text-slate-600"><VendorBrandIcon label={name} /><span className="max-w-36 truncate" title={name}>{name}</span></span>)}{card.vendors.length > 2 ? <span className="text-xs text-slate-500">+{card.vendors.length - 2} more</span> : null}</div> : null}
          <a href="#evidence" className="mt-auto inline-block self-start rounded pt-2 text-xs font-medium text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600" aria-label={`View ${card.label.toLowerCase()} evidence`}>View evidence <span aria-hidden="true">↗</span></a>
        </div>;
      })}
    </div>

  </section>;
}

/** Inventory only. Risk and remediation remain in canonical priority findings. */
export function ReportInventorySummary({ metrics, updating = false, siteIntegrity, formCount, formsSummary, formCountStatus, forms = [], onViewEvidence }: {
  metrics: ReportInventoryMetric[];
  updating?: boolean;
  formCount?: number;
  formsSummary?: import("@certscore/api-contracts").ScanFormsSummary | null;
  formCountStatus?: "captured" | "limited" | "not_captured";
  forms?: import("./collection-surfaces-table").CollectionSurfaceTableRow[];
  onViewEvidence?: () => void;
  siteIntegrity?: SiteIntegritySiteReport;
}) {
  const afterAcceptCount = formsSummary?.afterAcceptObserved ?? forms.filter(isAfterAcceptForm).length;
  const preConsentCount = formsSummary?.preConsentObserved ?? formCount ?? forms.filter(row => !row.capturePhase).length;
  const formObservationCount = formsSummary?.totalObserved ?? preConsentCount + afterAcceptCount;
  const network = metrics.find(metric => metric.overview);
  const overview = network?.overview;
  const technical: ReportInventoryMetric[] = overview ? [
    { label: INVENTORY_METRIC_LABELS.requests, value: overview.distinctResources, counts: overview.distinctClassifications?.requests },
    { label: INVENTORY_METRIC_LABELS.storage, value: overview.distinctStorage, counts: overview.distinctClassifications?.storage },
    { label: INVENTORY_METRIC_LABELS.frames, value: overview.distinctEmbeds, counts: overview.distinctClassifications?.embeds },
  ] : metrics.map(metric => ({ ...metric, label: inventoryMetricLabel(metric.label) })).sort((a, b) => inventoryMetricOrder(a.label) - inventoryMetricOrder(b.label));
  const hiddenLinks = siteIntegrity ? summarizeSiteIntegrityLinks(siteIntegrity) : null;
  const destinationCounts = new Map<string, number>();
  const findings = new Map((siteIntegrity?.findings ?? []).map(finding => [finding.evidence.observation.documentUrl, finding]));
  for (const finding of findings.values()) for (const link of finding.evidence.observation.links) {
    destinationCounts.set(link.destinationDomain, (destinationCounts.get(link.destinationDomain) ?? 0) + 1);
  }
  const hiddenLinkDestinations = [...destinationCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Inventory summary">
    {technical.length ? <details className="group/technical border-b border-slate-200 bg-slate-50/70">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs marker:hidden hover:bg-slate-100/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 font-medium text-zinc-700"><DisclosureChevron className="text-zinc-400 group-open/technical:rotate-180" />Pre-consent resource counts & classifications</span>
      </summary>
      <div className="overflow-x-auto border-t border-zinc-100 bg-white px-4 py-3">
        <p className="mb-4 max-w-3xl text-xs leading-5 text-zinc-500">{overview ? "Each resource is counted once. Services group requests, cookies/storage and frames." : "Retained inventory counts and classifications."}</p>
        <div className="grid grid-cols-1 gap-4 divide-y divide-zinc-200 md:min-w-[508px] md:grid-cols-3 md:gap-0 md:divide-x md:divide-y-0">{technical.map((metric, index) => <div key={metric.label} className={`min-w-0 py-0 ${index ? "pt-4 md:pt-0 md:pl-4" : ""} ${index < technical.length - 1 ? "md:pr-4" : ""}`}>
          <p className="mb-2 text-xs font-semibold text-zinc-700">{metric.label}<span className="ml-2 font-normal text-zinc-500 tabular-nums">{metric.value?.toLocaleString() ?? "Unavailable"}</span></p>
          <ClassificationCounts counts={metric.counts} />
        </div>)}</div>
      </div>
    </details> : null}
    <div className="grid grid-cols-3 items-stretch divide-x divide-slate-200 border-b border-slate-200 bg-white">
      <ServicesSignalSnapshot overview={overview} card />
      {formObservationCount > 0 ? <details className="group/forms min-w-0">
        <summary className={inventoryTileDisclosure}><InventoryTileHeading label="Forms" value={formObservationCount} chevron={<DisclosureChevron className="group-open/forms:rotate-180" />} /></summary>
        <div className="border-t border-slate-100 px-3 pb-3 sm:px-4">
        {afterAcceptCount ? <p className="mt-3 text-xs text-slate-500">{preConsentCount} pre-consent · {afterAcceptCount} after Accept click</p> : null}
        <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-xs leading-5 text-slate-600" aria-label="Observed forms">{forms.map(({ id, form, capturePhase }) => <li key={id}><p className="break-words font-medium">{form.title || form.surfaceType.replaceAll("_", " ")}</p><p>{form.retainedFieldCount} {form.retainedFieldCount === 1 ? "field" : "fields"} · {form.method}{capturePhase ? " · After Accept click" : ""}</p></li>)}</ul>
        <a href="#report-forms" className="mt-3 inline-block text-xs text-sky-700 hover:underline" onClick={event => { event.preventDefault(); onViewEvidence?.(); document.getElementById("report-forms")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>View forms ↗</a>
        </div>
      </details> : <div className={`min-w-0 ${inventoryTilePadding}`}><InventoryTileHeading label="Forms" value={(formsSummary?.countStatus ?? formCountStatus) === "not_captured"
        ? <span className="text-base font-medium text-slate-500">Not captured</span>
        : <InventoryCount value={formsSummary?.totalObserved ?? formCount} updating={updating} label="Form count" />} /></div>}
      {(hiddenLinks?.count ?? 0) > 0 ? <details className="group/hidden-links min-w-0">
        <summary className={inventoryTileDisclosure}>
          <InventoryTileHeading label="Hidden links" value={<>{hiddenLinks?.count != null && hiddenLinks.lowerBound ? "≥" : ""}<ScanLiveValue value={hiddenLinks?.count} active={updating} /></>} chevron={<DisclosureChevron className="group-open/hidden-links:rotate-180" />} />
        </summary>
        <div className="space-y-2 border-t border-slate-100 px-3 py-3 text-xs leading-5 text-slate-600 sm:px-4">
          {hiddenLinks?.count == null ? <p>Hidden-link evidence is unavailable.</p> : hiddenLinks.count === 0 ? <p>No hidden outbound links observed.</p> : <>
            <p>{hiddenLinks.pages} affected {hiddenLinks.pages === 1 ? "page" : "pages"}</p>
            <ul className="max-h-48 space-y-1 overflow-y-auto" aria-label="Hidden link destinations">{hiddenLinkDestinations.map(([domain, count]) => <li key={domain} className="flex items-start justify-between gap-2"><span className="min-w-0 break-all">{domain}</span><span className="shrink-0 tabular-nums">{count}</span></li>)}</ul>
          </>}
          {hiddenLinks?.lowerBound ? <p>Capture was limited; more links may be present.</p> : null}
          {hiddenLinks?.count ? <a href="#site-integrity-evidence" className="inline-block pt-1 text-sky-700 hover:underline" onClick={event => {
            event.preventDefault();
            onViewEvidence?.();
            const section = document.getElementById("site-integrity-evidence");
            if (!section) return;
            section.querySelectorAll("details").forEach((details, index) => { if (index === 0) details.open = true; });
            for (let parent = section.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
            section.scrollIntoView({ behavior: "smooth", block: "start" });
          }}>View hidden links ↗</a> : null}
        </div>
      </details> : <div className={`min-w-0 ${inventoryTilePadding}`}><InventoryTileHeading label="Hidden links" value={<InventoryCount value={hiddenLinks?.count} updating={updating} label="Hidden-link count" />} /></div>}
    </div>
    <div className="overflow-x-auto" role="region" aria-label="Inventory totals" tabIndex={0}>
      <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-3 md:divide-x md:divide-y-0">
        {technical.map(tile => <div key={tile.label} className="min-w-0 px-3 py-2 sm:px-4">
          <InventoryTileHeading
            label={tile.label}
            value={<InventoryCount value={tile.value} updating={updating} label={`${tile.label} count`} />}
            detail={<InventoryQuickSignals counts={tile.counts} />}
          />
        </div>)}
      </div>
    </div>
    {metrics.filter(metric => metric.note).map(metric => <p key={metric.label} className="border-t border-zinc-100 px-4 py-2 text-xs leading-5 text-slate-600">{metric.note}</p>)}
  </section>;
}

function InventoryQuickSignals({ counts }: { counts?: InventoryAssessmentCounts }) {
  if (!counts) return null;
  const nonEssential = counts.nonEssential;
  const review = counts.review;
  return <span className="flex flex-nowrap items-center gap-x-2 whitespace-nowrap text-[10px] leading-4 text-slate-600 tabular-nums">
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${nonEssential === 0 ? "text-slate-400" : ""}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${nonEssential === 0 ? "bg-slate-300" : "bg-rose-500"}`} /><span className="text-xs font-semibold">{nonEssential.toLocaleString()}</span> non-essential</span>
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${review === 0 ? "text-slate-400" : ""}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${review === 0 ? "bg-slate-300" : "bg-amber-500"}`} /><span className="text-xs font-semibold">{review.toLocaleString()}</span> review</span>
  </span>;
}

function ClassificationCounts({ counts }: { counts?: InventoryAssessmentCounts }) {
  return counts ? <dl className="mt-3 space-y-1.5 text-[11px] tabular-nums">{classifications.filter(([, key]) => counts[key] != null).map(([label, key, description]) => <div key={key} className="flex items-start justify-between gap-2"><dt title={description} className="flex shrink-0 items-start gap-1.5 whitespace-nowrap text-slate-600"><span aria-hidden="true" className={`mt-1 h-2 w-2 shrink-0 rounded-full ${classificationColors[key]}`} />{label}</dt><dd className="shrink-0 text-zinc-700">{counts[key]}</dd></div>)}</dl> : <p className="mt-3 text-xs text-zinc-500">Classification unavailable.</p>;
}
