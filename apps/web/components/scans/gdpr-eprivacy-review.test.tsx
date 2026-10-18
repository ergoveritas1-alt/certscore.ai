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
