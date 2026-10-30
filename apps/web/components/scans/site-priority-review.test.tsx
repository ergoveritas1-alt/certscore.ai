import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sitePriorityFindingSchema } from "../../lib/scans/full-site-priority-review";
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
