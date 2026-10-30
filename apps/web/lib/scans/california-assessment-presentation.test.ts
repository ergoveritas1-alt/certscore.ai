import assert from "node:assert/strict";
import test from "node:test";
import type { CaliforniaReviewCoverage } from "@certscore/contracts";
import { californiaAssessmentPresentation } from "./california-assessment-presentation";

test("partial evidence uses a review heading without implying a clean California result",()=>{
  for(const assessmentState of ["limited","partial"]){
    const coverage={families:[{assessmentState,status:"review"}]} as CaliforniaReviewCoverage;
    assert.equal(californiaAssessmentPresentation(coverage).emptyLabel,"California privacy review");
  }
  assert.equal(californiaAssessmentPresentation(undefined).incomplete,true);
});
test("completed assessment remains distinct from missing capture",()=>{
  const coverage={families:[{assessmentState:"completed",status:"observed"}]} as CaliforniaReviewCoverage;
  assert.equal(californiaAssessmentPresentation(coverage).emptyLabel,"0 CCPA/CPRA issues");
});


test("partial California coverage points to evidence without presenting a scan failure",()=>{
  const coverage={families:[{assessmentState:"completed",status:"review"},...Array(4).fill({assessmentState:"partial",status:"review"}),{assessmentState:"limited",status:"limited"}]} as CaliforniaReviewCoverage;
  const before=structuredClone(coverage),presentation=californiaAssessmentPresentation(coverage);
  assert.equal(presentation.incomplete,true);
  assert.equal(presentation.emptySummary,"View the California privacy checks in Detailed evidence.");
  assert.deepEqual(presentation.emptySummaryLinks,[{label:"Detailed evidence",targetId:"evidence"}]);
  assert.doesNotMatch(presentation.emptyLabel+presentation.emptySummary,/incomplete|unresolved|0 CCPA|no.*issues|compliant|all clear/i);
  assert.deepEqual(coverage,before);
});
