import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CaliforniaPrivacyWorkpaper, RegulatoryReviewFocus } from "./regulatory-review-focus";
import { ShadowReportShareMenu } from "./report-lab/shadow-report-actions";

test("review selector exposes the selected focus, geographic caveat and unchanged score meaning", () => {
  const markup = renderToStaticMarkup(<RegulatoryReviewFocus focus="ccpa_cpra" scanFrom="eu_ie" gpcSummary="Indeterminate" />);
  assert.match(markup, /value="ccpa_cpra"[^>]+aria-pressed="true"/);
  assert.match(markup, /California visitor behavior was not tested/);
  assert.match(markup, /href="#gpc-evidence"/);
  assert.match(markup, /GPC: Indeterminate/);
  assert.match(markup, /A separate CCPA\/CPRA score is not available/);
  const unknown = renderToStaticMarkup(<CaliforniaPrivacyWorkpaper expanded />);
  assert.match(unknown, /<details[^>]+open=""/);
  assert.match(unknown, /This is not evidence of absence/);
});

test("share and download links preserve focus, with tracking exports explicitly starting-page scoped", () => {
  const markup = renderToStaticMarkup(<ShadowReportShareMenu reportUrl="/scan/fixture?reviewFocus=ccpa_cpra" scanId="fixture" siteLabel="example.test" fullSite />);
  assert.match(markup, /format=pdf[^"<]*reviewFocus=ccpa_cpra/);
  assert.match(markup, /format=csv[^"<]*reviewFocus=ccpa_cpra/);
  assert.match(markup, /workpaper=tracking[^"<]*reviewFocus=ccpa_cpra/);
  assert.match(markup, /https%3A%2F%2Fcertscore.ai%2Fscan%2Ffixture%3FreviewFocus%3Dccpa_cpra/);
  assert.doesNotMatch(markup, /format=csv[^"<]*scope=full-site/);
});
