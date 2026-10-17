import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {assessCaliforniaRightsClauses,californiaRightsClauseAssessmentSchema} from "./california-clause-assessment";
const hash="a".repeat(64);
function assess(text:string){return assessCaliforniaRightsClauses([{text,url:"https://example.test/privacy",textSha256:createHash("sha256").update(text).digest("hex"),evidenceRef:"policy-text:policy"}],hash);}

test("consumer clauses resolve access and correction without a California heading; retention/security do not grant deletion",()=>{
  const text="Privacy Policy. We will give the individual access to that information upon request. A customer shall be able to challenge the accuracy of personal information and to have it amended as appropriate. We maintain practices for information and records retention and destruction when no longer necessary. Such information shall be destroyed, erased or made anonymous. We protect personal information against risks as loss, theft or destruction through appropriate security measures.";
  const result=assess(text);
  assert.deepEqual(result.topics.map(row=>[row.topic,row.status]),[["right_to_know","disclosed"],["right_to_delete","not_observed"],["right_to_correct","disclosed"],["non_discrimination","not_observed"]]);
  assert.equal(result.topics[0]!.context,"general_consumer_wording");
  assert.ok(result.topics[1]!.excludedPassages.length>0);
  for(const row of result.topics)for(const passage of [...row.passages,...row.excludedPassages])assert.equal(text.slice(passage.start,passage.end),passage.excerpt);
});

test("rights requests beat retention context; ambiguous wording and jurisdiction-only clauses stay review",()=>{
  assert.equal(assess("We retain personal information for five years. You may request that we erase your personal information.").topics[1]!.status,"disclosed");
  assert.equal(assess("Contact us to discuss erasure of your personal information.").topics[1]!.status,"review");
  assert.equal(assess("Deletion. See our portal.").topics[1]!.status,"review");
  assert.equal(assess("Retention information. Erasure. Submit requests through our portal.").topics[1]!.status,"review");
  assert.equal(assess("Our records retention practices include erasure after customers ask for it.").topics[1]!.status,"review");
  assert.equal(assess("Under GDPR, you have the right to delete your personal information.").topics[1]!.status,"review");
  const all=assess("You have the right to access personal information. You may request that we delete your personal information. You have the right to correct personal information. We will not discriminate against you for exercising your privacy rights.");
  assert.ok(all.topics.every(row=>row.status === "disclosed"));
  assert.equal(assess("We will not discriminate against employees when processing personal information.").topics[3]!.status,"review");
});

test("clause assessments require unique topics, positive passages and honest offsets",()=>{
  const result=assess("You have the right to access personal information.");
  assert.equal(californiaRightsClauseAssessmentSchema.safeParse({...result,topics:result.topics.map(row=>({...row,passages:[]}))}).success,false);
  const forged=structuredClone(result);forged.topics[0]!.passages[0]!.end++;
  assert.equal(californiaRightsClauseAssessmentSchema.safeParse(forged).success,false);
});
