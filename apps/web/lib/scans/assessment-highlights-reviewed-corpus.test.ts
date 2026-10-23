import assert from "node:assert/strict";
import test from "node:test";
import corpus from "./__fixtures__/assessment-highlights-reviewed-corpus.json";
import { buildAssessmentHighlightsPresentation, type AssessmentHighlightFinding } from "./assessment-highlights";
import type { AssessmentContext, AssessmentScope } from "./assessment-brief";
import { californiaAssessmentPresentation } from "./california-assessment-presentation";

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
  assert.deepEqual(actual,fixture.expected,"Editorial changes require re-review of this retained case and its qualifications.");
  assert.ok(actual.text.length<=500);
  if(actual.expanded){
    assert.ok(actual.expanded.text.length<=1000);
    for(const link of actual.links)assert.ok(actual.expanded.links.some(other=>other.targetId===link.targetId));
  }
  assert.deepEqual(fixture,before,"Rendering must not alter retained projected findings.");
});
