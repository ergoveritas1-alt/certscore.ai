import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssessmentHighlightsText } from "./assessment-highlights-text";
import { FullSiteExecutiveSummary } from "./full-site-executive-summary";
import { buildAssessmentHighlightsPresentation, type AssessmentHighlightFinding } from "../../lib/scans/assessment-highlights";
import canaries from "../../lib/scans/__fixtures__/assessment-highlights-canaries.json";
import type { FullSiteReportResponse } from "../../server/scans/full-site-report";

test("disclosure starts collapsed, keeps links, and exposes a keyboard-operable labeled button", () => {
  const copy = buildAssessmentHighlightsPresentation(canaries[0]!.findings as AssessmentHighlightFinding[], { kind: "page" });
  assert.ok(copy.expanded);
  const html = renderToStaticMarkup(<p><AssessmentHighlightsText {...copy} /></p>);
  assert.match(html, /<button type="button" aria-expanded="false" aria-controls="[^"]+" aria-label="Show more assessment highlights"/);
  assert.match(html, />…<\/button>/);
  assert.doesNotMatch(html, /Show less/);
  for (const link of copy.links) assert.ok(html.includes(`href="#${link.targetId}"`));
  const sparse = renderToStaticMarkup(<AssessmentHighlightsText {...buildAssessmentHighlightsPresentation([], { kind: "page" })} />);
  assert.doesNotMatch(sparse, /button|aria-expanded/);
});

test("review focus includes projected non-regulatory findings in the expandable summary", () => {
  for (const focus of ["ccpa_cpra", "gdpr_eprivacy"] as const) {
    const priorityReview = canaries[0]!.findings as NonNullable<FullSiteReportResponse["score"]>["priorityReview"];
    const html = renderToStaticMarkup(<FullSiteExecutiveSummary pending={false} scannedPages={1} reviewFocus={focus}
      score={{ value: 44, priorityReview, scoredPages: 1 }} />);
    assert.match(html, /href="#site-integrity-evidence"/);
    assert.match(html, /Show more assessment highlights/);
    if (focus === "ccpa_cpra") assert.match(html, /href="#gpc-evidence"/);
    else assert.match(html, /href="#accessibility-evidence"/);
  }
});

test("single-page homepage projection carries the same expansion as full-site highlights", () => {
  const copy = buildAssessmentHighlightsPresentation(canaries[0]!.findings as AssessmentHighlightFinding[], { kind: "page" });
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary pending={false} scannedPages={1}
    homepageVerdict={copy.text} homepageHighlightLinks={copy.links} homepageHighlightExpansion={copy.expanded} />);
  assert.match(html, /Show more assessment highlights/);
  for (const link of copy.links) assert.ok(html.includes(`href="#${link.targetId}"`));
});
