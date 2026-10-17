import assert from "node:assert/strict";
import test from "node:test";
import type { CaliforniaReviewCoverage } from "@certscore/contracts";
import { californiaAssessmentPresentation } from "./california-assessment-presentation";

test("incomplete evidence cannot produce a clean California summary",()=>{
  for(const assessmentState of ["limited","partial"]){
    const coverage={families:[{assessmentState,status:"review"}]} as CaliforniaReviewCoverage;
    assert.equal(californiaAssessmentPresentation(coverage).emptyLabel,"Assessment incomplete");
  }
  assert.equal(californiaAssessmentPresentation(undefined).incomplete,true);
});
test("completed assessment remains distinct from missing capture",()=>{
  const coverage={families:[{assessmentState:"completed",status:"observed"}]} as CaliforniaReviewCoverage;
  assert.equal(californiaAssessmentPresentation(coverage).emptyLabel,"0 CCPA/CPRA issues");
});
