"use client";

import { ReportInventoryNavigation } from "../../../components/scans/report-inventory-navigation";
import { ReportInventorySummary } from "../../../components/scans/report-inventory-summary";
import { FullSiteExecutiveSummary } from "../../../components/scans/full-site-executive-summary";
import { SinglePageResourceInventory } from "../../../components/scans/single-page-resource-inventory";
import { SitePriorityReview } from "../../../components/scans/site-priority-review";

import { FullSiteIdentity } from "../../../components/scans/full-site-identity";
import { ReportCoverageTiming } from "../../../components/scans/report-coverage-timing";
import { ScanFromMarker } from "../../../components/scans/scan-from-icons";
import { RuntimeObservationTimeline } from "../../../components/scans/runtime-observation-sections";
import { CollectionSurfacesTable } from "../../../components/scans/collection-surfaces-table";

import type { ReactNode } from "react";
import type { buildInventoryPreviewData } from "./inventory-preview-data";

export function InventoryOverviewPreview({ data, signalSnapshot, scanNext, evidenceDirectory }: {
  data: ReturnType<typeof buildInventoryPreviewData>;
  signalSnapshot: ReactNode;
  scanNext: ReactNode;
  evidenceDirectory: ReactNode;
}) {
  const { snapshot, fixture, priorities, fixtureForm } = data;
  return <ReportInventoryNavigation><main data-scan-report-preview className="mx-auto max-w-[1500px] bg-white px-4 py-6 text-zinc-900 sm:px-6">
    <aside aria-label="Sample report notice" className="sticky top-0 z-30 mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-950"><strong>Sample report · not a saved scan.</strong> All results below are illustrative. No website was scanned, and no privacy-policy document or form screenshot was captured for this preview.</aside>
    <header className="pb-1">
      <div className="mt-1 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-x-4 lg:gap-x-6 sm:[&>div:first-child]:contents sm:[&>div:first-child>header]:contents sm:[&>div:first-child>header>div:last-child]:col-span-full">
        <div><FullSiteIdentity scanId={snapshot.scan.id} host={snapshot.scan.host} url={snapshot.scan.url} createdAt={snapshot.scan.createdAt}
          visualEvidenceAction={<button type="button" disabled aria-label="Captured image unavailable in layout fixture" title="Captured image unavailable in layout fixture" className="inline-flex h-[1.625rem] w-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-500"><svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="3"/></svg></button>}
          region={<span className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-2 py-1"><ScanFromMarker flag="california" selected />Sample region: California</span>}
          timing={<ReportCoverageTiming duration="1m 35s" technology={{ platform: "Not available in fixture", version: "Unknown" }} groups={[{ title: "Coverage", rows: [["Pages scanned", 10], ["Scan region", "California"], ["Evidence", "Illustrative layout fixture"]] }]} started="Sep 17, 2026, 7:22:36 AM UTC" completed="Not retained in fixture" />} /></div>
        <fieldset disabled title="Layout fixture: scan submission is disabled" className="mt-3 flex min-w-0 justify-end sm:col-start-2 sm:row-start-1 sm:mt-0 sm:w-full sm:max-w-xl sm:justify-self-end">{scanNext}</fieldset>
      </div>
    </header>
    <FullSiteExecutiveSummary inventorySummary={<ReportInventorySummary key="inventory-summary" metrics={fixture.metrics} />} score={{ value: snapshot.score.value, scoredPages: 10, priorityReview: priorities }} pending={false} scannedPages={10} statusLabel="Sample data" snapshot={signalSnapshot} />
    <SitePriorityReview findings={priorities} pending={false} sitewideAvailable scannedPages={10} />
    <section aria-label="Starting-page event timeline" className="my-3 border-y border-zinc-200 bg-white py-2"><h2 className="text-xl font-semibold">Starting-page event timeline</h2><div className="mt-1"><RuntimeObservationTimeline dominant compact events={snapshot.timeline} /></div></section>
    <SinglePageResourceInventory inventory={fixture.inventory} report={snapshot} />
    <CollectionSurfacesTable rows={[fixtureForm]} loading={false} />
    {evidenceDirectory}
    <p className="mt-6 pb-6 text-center text-xs text-zinc-500">CertScore.ai can make mistakes. Verify all findings.</p>
  </main></ReportInventoryNavigation>;
}
