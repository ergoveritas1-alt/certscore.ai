import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SitewideEvidenceCard, SitewideEvidenceContext } from "./sitewide-evidence-card";

test("groups repeated checks without promoting mixed page statuses or listing pages", () => {
  const rows = [{ id: "pre_consent_cookies_storage", title: "Storage check", status: "Gap observed", assessmentStatus: "gap_observed", summary: "Retained storage evidence.", evidenceRefs: ["evidence-1"] }];
  const pages = [1, 2].map(id => ({pageId: String(id), url: `https://example.test/${id}`, sourceHash: "a".repeat(64), homepage: id === 1, rows: id === 1 ? rows : [{...rows[0]!, status: "Insufficient evidence", assessmentStatus: "unknown", summary: "Incomplete observation."}]}));
  const html = renderToStaticMarkup(<SitewideEvidenceContext.Provider value={{pages, limitedPages: 1}}><SitewideEvidenceCard group="runtime"/></SitewideEvidenceContext.Provider>);
  assert.equal((html.match(/Storage check/g) ?? []).length, 1);
  assert.match(html, /1 check needs review/);
  assert.match(html, /Gap observed: 1 page/);
  assert.match(html, /Insufficient evidence: 1 page/);
  assert.match(html, /unavailable or limited coverage/);
  assert.doesNotMatch(html, /https:\/\/example.test|Homepage and verified/);
});
