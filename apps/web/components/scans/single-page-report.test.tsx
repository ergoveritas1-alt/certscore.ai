import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportInventorySummary } from "./report-inventory-summary";
import { FullSiteExecutiveSummary } from "./full-site-executive-summary";
import { EvidenceDirectory } from "./report-lab/shadow-scan-report";
import { SHADOW_REPORT } from "./report-lab/shadow-report-data";

test("single-page overview uses the shared report card and keeps zero classifications visible", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary scannedPages={1} pending={false} score={{ value: 56, priorityReview: [], scoredPages: 1, limitedPages: 0 }} homepageVerdict="Retained page assessment" inventorySummary={<ReportInventorySummary metrics={[{ label: "Embedded content", value: 3, counts: { nonEssential: 0, review: 1, contextual: 2, essential: 0 } }]} />} />);
  assert.match(html, /Page score 56 out of 100/);
  assert.match(html, /1 page scanned/);
  assert.match(html, /Retained page assessment/);
  for (const label of ["Non-essential", "Needs review", "Contextual", "Essential"]) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /across your site|Site-wide scoring/);
});

test("compact single-page evidence retains actual checks without a crawl context", () => {
  const html = renderToStaticMarkup(<EvidenceDirectory compact report={{ ...SHADOW_REPORT, fullSite: undefined }} />);
  assert.match(html, /Detailed evidence/);
  assert.match(html, /JSON evidence/);
  assert.doesNotMatch(html, /Sitewide assessment unavailable|Verified sitewide evidence is not available/);
  for (const row of SHADOW_REPORT.trackingExternalRows) assert.ok(html.includes(row.title.replace(/&/g, "&amp;")));
});
