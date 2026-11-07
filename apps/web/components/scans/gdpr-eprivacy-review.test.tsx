import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { GdprEprivacyCoverageSummary, GdprEprivacyReview } from "./gdpr-eprivacy-review";

test("EU coverage summarizes projected evidence and keeps complete analysis expandable", () => {
  const rows = [
    {id:"legal_basis_disclosure_observed",status:"Observed"},
    {id:"data_subject_rights_disclosure",status:"Observed"},
    {id:"retention_disclosure_observed",status:"Not confirmed"},
    {id:"automated_decision_making_profiling_disclosure",status:"Potential gap"},
    {id:"unknown",status:"Observed"},
  ] as const;
  const before=structuredClone(rows);
  const summary=renderToStaticMarkup(<GdprEprivacyCoverageSummary rows={rows} policyUrls={["https://example.test/privacy"]}/>);
  assert.match(summary,/GDPR\/ePrivacy coverage/);assert.match(summary.replace(/<[^>]*>/g,""),/2 topics captured/);
  assert.match(summary,/href="#gdpr-eprivacy-evidence"/);
  const html=renderToStaticMarkup(<GdprEprivacyReview rows={rows} policyUrls={["https://example.test/privacy"]}><div id="original-analysis">Original gap and limitation analysis</div></GdprEprivacyReview>);
  const initial=html.split("data-gdpr-eprivacy-review-details")[0]!;
  assert.match(initial,/example.test/);assert.match(initial,/Legal basis/);assert.match(initial,/Data subject rights/);
  assert.doesNotMatch(initial,/Retention|Profiling|Original gap|compliant|passed/i);
  assert.match(html,/id="original-analysis"/);assert.match(html,/Original gap and limitation analysis/);
  assert.match(html,/Evidence &amp; assessment details/);assert.doesNotMatch(html,/<details[^>]+open=/);
  assert.deepEqual(rows,before);
});

test("unresolved EU disclosure rows stay out of the captured wording summary",()=>{
  const html=renderToStaticMarkup(<GdprEprivacyReview rows={[{id:"retention_disclosure_observed",status:"Not confirmed"}]}><p>Not confirmed: retained analysis</p></GdprEprivacyReview>);
  assert.doesNotMatch(html.split("data-gdpr-eprivacy-review-details")[0]!,/Disclosures captured|Retention/);
  assert.match(html,/Not confirmed: retained analysis/);
});


test("unavailable policy retrieval is not presented as zero assessed topics", () => {
  const html = renderToStaticMarkup(<GdprEprivacyCoverageSummary rows={[]} policyUrls={[]} policySurfaceCoverage="limited" policySurfaceLinkObserved />);
  assert.match(html, /Not assessed/);
  assert.match(html, /no verified policy document was available/);
  assert.doesNotMatch(html, /0 topics captured|0 disclosure topics/);
  const absent = renderToStaticMarkup(<GdprEprivacyCoverageSummary rows={[]} policyUrls={[]} policySurfaceCoverage="unavailable" />);
  assert.match(absent, /incomplete or unavailable/);
  assert.doesNotMatch(absent, /A policy link was found/);
});

test("usable topic observations survive partial policy coverage", () => {
  const html = renderToStaticMarkup(<GdprEprivacyCoverageSummary rows={[{id:"legal_basis_disclosure_observed",status:"Observed"}]} policyUrls={[]} policySurfaceCoverage="limited" policySurfaceLinkObserved />);
  assert.match(html.replace(/<[^>]*>/g,""), /1 topic captured/);
  assert.doesNotMatch(html, /Not assessed/);
  const complete = renderToStaticMarkup(<GdprEprivacyCoverageSummary rows={[]} policyUrls={["https://example.test/privacy"]} policySurfaceCoverage="complete" />);
  assert.match(complete.replace(/<[^>]*>/g,""), /0 topics captured/);
  assert.doesNotMatch(complete, /Not assessed/);
});
