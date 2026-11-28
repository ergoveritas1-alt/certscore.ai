import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { FullSiteReportContinuity, useFullSiteReportContinuity } from "./full-site-report-continuity";
import { aggregateFullSite } from "@website-signal-risk-scanner/shared/full-site-crawl";
import { buildNetworkInventoryOverview } from "../../lib/scans/network-inventory-overview";
import { ShadowScanReport } from "./report-lab/shadow-scan-report";
import { SHADOW_REPORT } from "./report-lab/shadow-report-data";
import {FullSiteWorkspace} from "./full-site-workspace";

test("a completed report awaiting its first sitewide response does not claim an active scan or zero forms", () => {
 const html=renderToStaticMarkup(<FullSiteWorkspace scanId="loading" requested={{maxPages:20,concurrency:4,waitSeconds:5}} evidenceDirectory={<section id="evidence"><h2>Detailed evidence</h2><details><summary>Consent evidence</summary><p>Retained control</p></details></section>}><p>Homepage report content</p></FullSiteWorkspace>);
 assert.match(html,/Loading report…/);
 assert.match(html,/Loading saved assessment/);
 assert.match(html,/Supporting details/);
 assert.match(html,/Loading services, resources &amp; evidence…/);
 assert.match(html,/scan-hourglass-flip/);
 assert.match(html,/<section id="evidence"><h2>Detailed evidence<\/h2>/);
 assert.match(html,/<summary>Consent evidence<\/summary><p>Retained control<\/p>/);
 assert.doesNotMatch(html,/View services, resources &amp; evidence/);
 assert.doesNotMatch(html,/data-full-site-progress|0 forms|0s elapsed|Pages scanned|Across scanned pages/);
});

for (const status of ["completed", "cancelled", "stopped"]) {
 test(`a known ${status} crawl does not show optimistic active progress`, () => {
  const html = renderToStaticMarkup(<FullSiteWorkspace scanId="terminal" requested={{maxPages:10,concurrency:2,waitSeconds:1}} initialPending initialNotice={{scanId:"terminal",hostname:"example.com",status,homepageStatus:"completed",region:"Local",startedAt:"2026-09-11T20:00:00Z",limits:{maxPages:10,concurrency:2,waitSeconds:1}}}><p>Homepage</p></FullSiteWorkspace>);
  assert.doesNotMatch(html, /data-full-site-progress|Stop site crawl/);
 });
}

test("switching posture previews the score shown in the destination overview", () => {
  Object.assign(globalThis, { React });
  const requested = { maxPages: 30, concurrency: 4, waitSeconds: 5 };
  const report = {
    ...SHADOW_REPORT,
    fullSite: requested,
    score: { ...SHADOW_REPORT.score, value: 67 },
    californiaScore: { policyVersion: "california-regulatory-posture.v9" as const, scope: "starting_page" as const,
      score: 83, coverage: "limited" as const, assessmentSourceHash: null, deductions: [] },
  };
  const summary = aggregateFullSite({
    scanId: report.scan.id, status: "completed", requested, effective: requested, region: "EU-DE",
    configurationHash: "fixture", startedAt: "2026-11-25T08:00:00Z", completedAt: "2026-11-25T08:03:00Z",
    homepageDurationMs: null, stopReason: null, discoveryExhausted: true, discovered: 29, peakWorkers: 4, pauseMs: null,
  }, []);
  function SavedPreview({ siteScore }: { siteScore: number | null }) {
    const cache = useFullSiteReportContinuity()!;
    if (siteScore !== null) cache.preview = {
      version: "full-site-report-preview.v1",
      summary: { ...summary, resources: undefined, counts: { ...summary.counts, completed: 28, partial: 1 } },
      score: { value: siteScore, scoredPages: 29, limitedPages: 1, assessedNonEssentialStorage: 6, priorityReview: [],
        version: "full-site-distinct-findings.v12", scope: "Site" },
      cacheable: true, finalizationStartedAt: null, networkOverview: buildNetworkInventoryOverview([]),
      hiddenLinks: null, hiddenLinkDestinations: [], timing: { crawlStartedAt: null }, homepageUrl: report.scan.url,
      coverage: { discovered: 29, allowed: 29, unknown: 0, blocked: 0, outOfScope: 0 },
      failedPages: [], forms: { count: 0, limited: false },
    };
    return null;
  }
  function render(focus: "ccpa_cpra" | "gdpr_eprivacy", siteScore: number | null) {
    const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
    return renderToStaticMarkup(<AppRouterContext.Provider value={router}><FullSiteReportContinuity scanId={report.scan.id} cacheScope="test">
      <SavedPreview siteScore={siteScore} />
      <ShadowScanReport header={<header />} variant="timeline" report={report} reviewFocus={focus} />
    </FullSiteReportContinuity></AppRouterContext.Provider>);
  }
  for (const siteScore of [6, 0]) {
    const eu = render("gdpr_eprivacy", siteScore);
    const ca = render("ccpa_cpra", siteScore);
    assert.match(eu, new RegExp('aria-label="Site score ' + siteScore + ' out of 100"'));
    assert.match(eu, /title="83\/100" data-posture-preview-score/);
    assert.match(ca, /aria-label="Starting-page score 83 out of 100"/);
    assert.match(eu, /1 page has limited scoring coverage/);
    assert.doesNotMatch(ca, /limited scoring coverage/);
    assert.match(ca, /29 pages scanned in this crawl/);
    assert.match(ca, />Starting-page score<\/p>/);
    assert.match(ca, new RegExp('title="' + siteScore + '/100" data-posture-preview-score'));
    assert.doesNotMatch(ca, /title="67\/100"/);
  }
  const loading = render("ccpa_cpra", null);
  assert.match(loading, /aria-label="Review focus"/);
  assert.doesNotMatch(loading, /data-posture-preview-score/);
});
