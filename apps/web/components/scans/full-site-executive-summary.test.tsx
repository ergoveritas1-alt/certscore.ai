import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FullSiteExecutiveSummary } from "./full-site-executive-summary";

const score = {version: "test", value: 29, assessedNonEssentialStorage: 9, scoredPages: 10, limitedPages: 0, scope: "Retained evidence", priorityReview: [], sources: []};

test("executive score uses the full-site projection while homepage context remains scoped", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={score} pending={false} scannedPages={10} homepageVerdict="Retained homepage assessment." snapshot={<p>Consent controls</p>} />);
  assert.match(html, /Site score 29 out of 100/);
  assert.match(html, /10 pages scanned/);
  assert.match(html, /Consent controls/);
  assert.match(html, /Site assessment/);
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

test("a terminal unavailable score stays unavailable", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={null} pending={false} scannedPages={10} />);
  assert.match(html, /Site-wide scoring is unavailable/);
  assert.doesNotMatch(html, /Assessment in progress/);
});

test("one scanned page shows only the single page assessment", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={{...score,scoredPages:1}} pending={false} scannedPages={1} homepageVerdict="Retained single-page verdict." />);
  assert.match(html,/Page score 29 out of 100/);
  assert.match(html,/>Page score</);
  assert.match(html,/Single page assessment/);
  assert.match(html,/Retained single-page verdict/);
  assert.doesNotMatch(html,/>Site score</);
  assert.doesNotMatch(html,/<h3[^>]*>Site assessment/);
});

test("executive overview does not render a separate assessment coverage note", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={score} pending={false} scannedPages={10} homepageVerdict="Retained homepage assessment." />);
  assert.doesNotMatch(html, /Assessment coverage:/);
});
