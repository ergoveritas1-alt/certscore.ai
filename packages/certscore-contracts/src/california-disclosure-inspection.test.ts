import test from "node:test";
import assert from "node:assert/strict";
import {inspectCaliforniaRightsConcepts,californiaDisclosureInspectionSchema} from "./california-disclosure-inspection";

test("equivalent and ambiguous rights wording blocks negative conclusions without claiming adequacy",()=>{
  for(const text of [
    "We won't treat you differently because you make a privacy request.",
    "Using these rights will not change the services or prices you receive.",
    "You will receive the same treatment regardless of whether you ask us to remove your information.",
    "Exercising your choices does not affect how we serve you.",
    "We will not discriminate against you for exercising your rights.",
    "You will not be penalized or retaliated against.",
  ]) assert.equal(inspectCaliforniaRightsConcepts([text]).find(row=>row.topic === "non_discrimination")!.status,"candidate_present",text);
  for(const text of ["You have the right to be forgotten.","Our records are destroyed after the retention period."])
    assert.equal(inspectCaliforniaRightsConcepts([text]).find(row=>row.topic === "right_to_delete")!.status,"candidate_present",text);
  assert.ok(inspectCaliforniaRightsConcepts(["Obtain a copy, request erasure or ask us to fix mistaken data. We guarantee equal treatment."]).every(row=>row.status === "candidate_present"));
});

test("negative inspection binds each topic and document exactly once and reconciles counts",()=>{
  const proof={contractVersion:"certscore.california-disclosure-inspection.v1",sourceBundleSha256:"a".repeat(64),method:"complete_english_policy_concept_inventory.v1",
    documents:[{evidenceRef:"policy-text:policy",textSha256:"b".repeat(64),inspectedChars:1000}],topics:inspectCaliforniaRightsConcepts(["Privacy policy."])};
  assert.ok(californiaDisclosureInspectionSchema.safeParse(proof).success);
  assert.equal(californiaDisclosureInspectionSchema.safeParse({...proof,topics:[...proof.topics.slice(1),proof.topics[1]]}).success,false);
  assert.equal(californiaDisclosureInspectionSchema.safeParse({...proof,topics:proof.topics.map(row=>({...row,candidateCount:1}))}).success,false);
});
