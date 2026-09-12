import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {FullSiteWorkspace} from "./full-site-workspace";

test("a report awaiting its first response does not claim an active scan or zero forms", () => {
 const html=renderToStaticMarkup(<FullSiteWorkspace scanId="loading" requested={{maxPages:20,concurrency:4,waitSeconds:5}}><p>Homepage report content</p></FullSiteWorkspace>);
 assert.match(html,/Loading report…/);
 assert.match(html,/Waiting for page outcomes/);
 assert.doesNotMatch(html,/data-full-site-progress|0 forms|0s elapsed|Pages scanned|Across scanned pages/);
});

for (const status of ["completed", "cancelled", "stopped"]) {
 test(`a known ${status} crawl does not show optimistic active progress`, () => {
  const html = renderToStaticMarkup(<FullSiteWorkspace scanId="terminal" requested={{maxPages:10,concurrency:2,waitSeconds:1}} initialPending initialNotice={{scanId:"terminal",hostname:"example.com",status,homepageStatus:"completed",region:"Local",startedAt:"2026-09-11T20:00:00Z",limits:{maxPages:10,concurrency:2,waitSeconds:1}}}><p>Homepage</p></FullSiteWorkspace>);
  assert.doesNotMatch(html, /data-full-site-progress|Stop site crawl/);
 });
}
