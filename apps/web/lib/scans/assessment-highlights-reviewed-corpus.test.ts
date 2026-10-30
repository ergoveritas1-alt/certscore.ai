import assert from "node:assert/strict";
import test from "node:test";
import corpus from "./__fixtures__/assessment-highlights-reviewed-corpus.json";
import { buildAssessmentHighlightsPresentation, type AssessmentHighlightFinding } from "./assessment-highlights";
import type { AssessmentContext, AssessmentScope } from "./assessment-brief";
import { californiaAssessmentPresentation } from "./california-assessment-presentation";
import { buildRegulatoryAssessmentHighlights } from "./regulatory-assessment-highlights";

test("reviewed corpus retains both 20-site cohorts and multi-page coverage",()=>{
  assert.equal(corpus.cases.length,80);
  for(const cohort of ["broad","targeted"]){
    const rows=corpus.cases.filter(row=>row.cohort===cohort);
    assert.equal(rows.length,40);
    assert.equal(new Set(rows.map(row=>row.domain)).size,20);
  }
  assert.equal(corpus.cases.filter(row=>row.scope.kind==="site").length,12);
});

for(const fixture of corpus.cases)test(`reviewed assessment: ${fixture.id}`,()=>{
  const before=structuredClone(fixture);
  const empty=californiaAssessmentPresentation();
  const actual=fixture.findings.length
    ?buildAssessmentHighlightsPresentation(fixture.findings as AssessmentHighlightFinding[],fixture.scope as AssessmentScope,fixture.context as AssessmentContext)
    :{text:fixture.focus==="ccpa_cpra"?empty.emptySummary:"No GDPR/ePrivacy priority issues were identified in the assessed evidence.",links:fixture.focus==="ccpa_cpra"?empty.emptySummaryLinks:[]};
  // Preserve the historical reviewed corpus. The owner-requested executive
  // empty-state copy changes here; finding-bearing qualifications stay pinned.
  const expected=fixture.focus==="ccpa_cpra"&&!fixture.findings.length
    ?{text:"View the California privacy checks in Detailed evidence.",links:[{label:"Detailed evidence",targetId:"evidence"}]}
    :fixture.expected;
  assert.deepEqual(actual,expected,"Finding-bearing editorial changes require re-review of the retained case and its qualifications.");
  const projected = (fixture.findings as Array<AssessmentHighlightFinding & { id: string; status: string }>).map((finding, index) => ({ ...finding, rank: index + 1 }));
  const regulatory = buildRegulatoryAssessmentHighlights(projected, fixture.focus as "ccpa_cpra" | "gdpr_eprivacy",
    fixture.scope as AssessmentScope, fixture.context as AssessmentContext);
  assert.deepEqual(regulatory.highlights, expected, "The shared regulatory path must preserve the reviewed highlights.");
  assert.ok(actual.text.length<=500);
  if(actual.expanded){
    assert.ok(actual.expanded.text.length<=1000);
    for(const link of actual.links)assert.ok(actual.expanded.links.some(other=>other.targetId===link.targetId));
  }
  assert.deepEqual(fixture,before,"Rendering must not alter retained projected findings.");
});
