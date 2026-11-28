import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sitePriorityFindingSchema } from "../../lib/scans/full-site-priority-review";
import { REGULATORY_PREVIEW_FINDINGS } from "../../app/dev-fixtures/regulatory-review/preview-data";
import { SitePriorityReview } from "./site-priority-review";

test("empty partial California priority review uses scoped review copy and links details",()=>{
  const html=renderToStaticMarkup(<SitePriorityReview findings={[]} pending={false} sitewideAvailable scannedPages={1} reviewFocus="ccpa_cpra"/>);
  assert.match(html,/California privacy review/);
  assert.match(html,/href="#evidence"/);
  assert.doesNotMatch(html,/Assessment incomplete|assessment is incomplete|unresolved checks|>0 issues</);
});

test("projected California findings remain visible while coverage is partial",()=>{
  const finding=sitePriorityFindingSchema.parse({id:"california_notice_at_collection_destination_error",title:"Notice-at-collection link unavailable",summary:"The named notice destination returned an error.",status:"Potential gap",rank:1,pages:[],evidence:[],evidenceJson:{},correctionSteps:["Repair the named notice destination."]});
  const findings=[finding],before=structuredClone(findings);
  const html=renderToStaticMarkup(<SitePriorityReview findings={findings} pending={false} sitewideAvailable scannedPages={1} reviewFocus="ccpa_cpra"/>);
  assert.match(html,/Notice-at-collection link unavailable/);
  assert.match(html,/1 issue/);
  assert.doesNotMatch(html,/Assessment incomplete|View the California privacy checks/);
  assert.deepEqual(findings,before);
});

test("affected pages show on multi-page reports even when the finding affects only one page", () => {
  const page = { id: "home", url: "https://example.com/", homepage: true };
  const finding = sitePriorityFindingSchema.parse({
    id: "california_notice_at_collection_destination_error", title: "Notice-at-collection link unavailable",
    summary: "The named notice destination returned an error.", status: "Potential gap", rank: 1,
    pages: [page], evidence: ["Retained destination status"], evidenceJson: {}, correctionSteps: [],
  });
  const render = (scannedPages: number) => renderToStaticMarkup(<SitePriorityReview findings={[finding]} pending={false}
    sitewideAvailable scannedPages={scannedPages} reviewFocus="ccpa_cpra" />);

  const singlePage = render(1);
  assert.doesNotMatch(singlePage, /Affected pages|1 affected page/);
  assert.match(singlePage, /Regulatory applicability/);
  assert.match(singlePage, /Retained destination status/);
  assert.match(render(2), /1 affected page/);
  assert.match(render(2), /Affected pages[\s\S]*href="https:\/\/example\.com\/"/);
  assert.deepEqual(finding.pages, [page]);
});

test("single-page reviews offer scrolling only when there are more than two findings", () => {
  const findings = REGULATORY_PREVIEW_FINDINGS.filter(finding =>
    ["post-refusal", "preconsent-tracking", "transport"].includes(String(finding.evidenceJson.topicId)));
  assert.equal(findings.length, 3);
  const render = (scannedPages: number, count: number) => renderToStaticMarkup(<SitePriorityReview findings={findings.slice(0, count)}
    pending={false} sitewideAvailable scannedPages={scannedPages} />);

  const scrolling = render(1, 3);
  assert.match(scrolling, /aria-label="Priority issues" tabindex="0"/);
  assert.match(scrolling, /Scroll for more findings\./);
  assert.equal((scrolling.match(/data-finding-header/g) ?? []).length, 3);
  assert.doesNotMatch(render(1, 2), /Scroll for more findings/);
  assert.doesNotMatch(render(2, 3), /Scroll for more findings/);
});
