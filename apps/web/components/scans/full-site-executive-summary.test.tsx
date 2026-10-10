import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSiteAssessmentSummary, FullSiteExecutiveSummary } from "./full-site-executive-summary";

const score = {version: "test", value: 29, assessedNonEssentialStorage: 9, scoredPages: 10, limitedPages: 0, scope: "Retained evidence", priorityReview: [], sources: []};

test("summary handles zero, one and a few issues without losing title casing", () => {
  assert.equal(buildSiteAssessmentSummary([], 10), "No priority issues were identified in the assessed evidence.");
  const one = buildSiteAssessmentSummary([{ title: "GPC response review" }], 1);
  assert.match(one, /1 priority issue across 1 page\. The finding is “GPC response review”\./);
  for (const count of [2, 3]) {
    const summary = buildSiteAssessmentSummary(Array.from({ length: count }, (_, i) => ({ title: `Issue ${i + 1}` })), 10);
    assert.match(summary, new RegExp(`${count} priority issues across 10 pages\\.`));
    assert.ok(summary.includes(`“Issue ${count}”`));
    assert.doesNotMatch(summary, /full list/);
  }
});

test("large issue lists retain the total but preview at most three projected titles", () => {
  for (const count of [4, 1000]) {
    const summary = buildSiteAssessmentSummary(Array.from({ length: count }, (_, i) => ({ title: `Issue ${i + 1}` })), 10);
    assert.ok(summary.includes(`${count.toLocaleString("en-US")} priority issues`));
    assert.match(summary, /The leading finding is “Issue 1”\. Other issues include “Issue 2” and “Issue 3”\./);
    assert.doesNotMatch(summary, /Issue 4/);
    assert.match(summary, /Regulatory Risk Review for the full list/);
    assert.ok(summary.length < 400);
  }
});

test("site summary uses only the leading finding's first retained sentence", () => {
  const summary = buildSiteAssessmentSummary([
    { title: "Classified non-essential pre-consent storage", summary: "5 storage items were observed before consent. Direct write-level timing was captured for 2." },
    { title: "Decline consent control", summary: "No observable refusal path was retained." },
  ], 10);
  assert.match(summary, /5 storage items were observed before consent\./);
  assert.match(summary, /Other issues include “Decline consent control”\./);
  assert.doesNotMatch(summary, /Direct write-level timing|No observable refusal path/);
});

test("long titles cannot overwhelm the summary or cause lower-ranked titles to jump ahead", () => {
  const oversized = "Long title ".repeat(1000);
  for (const titles of [[oversized], ["GPC review", oversized, "Later issue"], [oversized, "Later issue"]]) {
    const summary = buildSiteAssessmentSummary(titles.map(title => ({ title })), null);
    assert.ok(summary.length < 400);
    assert.doesNotMatch(summary, /Long title|Later issue|across 0 pages/);
    assert.match(summary, /Regulatory Risk Review for the full list/);
  }
});

test("executive score uses the full-site projection while homepage context remains scoped", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={score} pending={false} scannedPages={10} homepageVerdict="Retained homepage assessment." snapshot={<p>Consent controls</p>} />);
  assert.match(html, /Site score 29 out of 100/);
  assert.match(html, /10 pages scanned/);
  assert.match(html, /Consent controls/);
  assert.match(html, /Assessment highlights/);
  assert.doesNotMatch(html, /Retained homepage assessment|10 assessed/);
  assert.doesNotMatch(html, /benchmark/i);
  assert.doesNotMatch(html, /Diagnostic score|62 out of 100/);
});

test("pending site assessment never borrows a homepage score or claims no issues", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={null} pending scannedPages={1} homepageVerdict="Homepage assessment already ready." />);
  assert.match(html, /Page score awaiting scored evidence/);
  assert.match(html, /page score will appear/i);
  assert.doesNotMatch(html, /No priority issues|0 priority issues|out of 100/);
});

test("a completed report waiting for its saved sitewide result does not claim assessment is running", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={null} pending loadingSavedResult scannedPages={null} />);
  assert.match(html, /Loading saved assessment/);
  assert.match(html, /sitewide score will appear when the saved result loads/);
  assert.doesNotMatch(html, /Assessment in progress|Waiting for page outcomes|Page evidence is still being assessed/);
});

test("a terminal unavailable score stays unavailable", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={null} pending={false} scannedPages={10} />);
  assert.match(html, /Site-wide scoring is unavailable/);
  assert.doesNotMatch(html, /Assessment in progress/);
});

test("one scanned page shows only the single page assessment", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={{...score,scoredPages:1}} pending={false} scannedPages={1} homepageVerdict="Retained single-page verdict." />);
  assert.match(html,/Page score 29 out of 100/);
  assert.match(html,/>Page score</);
  assert.match(html,/Assessment highlights/);
  assert.match(html,/1 page assessed/);
  assert.match(html,/Retained single-page verdict/);
  assert.doesNotMatch(html,/>Site score</);
  assert.doesNotMatch(html,/<h3[^>]*>Site assessment/);
});

test("executive overview does not render a separate assessment coverage note", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={score} pending={false} scannedPages={10} homepageVerdict="Retained homepage assessment." />);
  assert.doesNotMatch(html, /Assessment coverage:/);
});

test("completed clean score omits the redundant scope paragraph", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={{...score,value:100,scoredPages:4}} pending={false} scannedPages={4} />);
  assert.match(html, /Site score 100 out of 100/);
  assert.match(html, /0 priority issues/);
  assert.doesNotMatch(html, /Scope:/);
  assert.doesNotMatch(html, /network requests need classification review/);
  assert.doesNotMatch(html, /does not mean every policy topic was confirmed/);
});
