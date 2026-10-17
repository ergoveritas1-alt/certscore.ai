import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {assessCaliforniaSaleSharingClauses,californiaSaleSharingAssessmentSchema} from "./california-sale-sharing-assessment";
const hash="a".repeat(64);
function assess(text:string){return assessCaliforniaSaleSharingClauses([{evidenceRef:"policy-text:policy",url:"https://example.test/privacy",text,textSha256:createHash("sha256").update(text).digest("hex")}],hash);}
test("sale, cross-context sharing, operational disclosure and analytics are independent claims",()=>{
  const text="We do not sell personal information. We share personal information with service providers for billing and technical support. We use analytics to understand website traffic.";
  const result=assess(text);
  assert.deepEqual(result.topics.map(row=>row.status),["denied","not_observed","described","described"]);
  assert.equal(result.choiceBasis,"unresolved","no-sale alone cannot establish no cross-context sharing");
  for(const topic of result.topics)for(const passage of topic.passages)assert.equal(text.slice(passage.start,passage.end),passage.excerpt);
});
test("explicit denials, qualifications, conflicts and informational headings stay distinct",()=>{
  const neither=assess("We do not sell personal information. We do not share personal information for cross-context behavioral advertising.");
  assert.equal(neither.choiceBasis,"declared_neither");
  assert.equal(assess("We may share personal information for targeted advertising.").choiceBasis,"declared_sale_or_sharing");
  assert.equal(assess("We do not sell personal information except in certain circumstances.").topics[0]!.status,"qualified");
  assert.equal(assess("We do not sell personal information. However, exceptions may apply.").topics[0]!.status,"qualified");
  assert.equal(assess("We do not sell personal information. We may sell personal information to advertising partners.").topics[0]!.status,"conflicting");
  assert.equal(assess("Sale of personal information. You may opt out of the sale of your personal information.").topics[0]!.status,"review");
  assert.equal(assess("We sell internet services and equipment.").topics[0]!.status,"not_observed");
  assert.equal(assess("Our providers do not sell personal information.").topics[0]!.status,"review","recipient claims cannot become a business-wide denial");
  assert.equal(assess("We require our providers do not sell personal information.").topics[0]!.status,"review");
});
test("sale/sharing schemas reject forged claim basis, duplicate topics and missing evidence",()=>{
  const result=assess("We do not sell personal information.");
  assert.equal(californiaSaleSharingAssessmentSchema.safeParse({...result,choiceBasis:"declared_neither"}).success,false);
  assert.equal(californiaSaleSharingAssessmentSchema.safeParse({...result,topics:result.topics.map(()=>result.topics[0])}).success,false);
  assert.equal(californiaSaleSharingAssessmentSchema.safeParse({...result,topics:result.topics.map(row=>({...row,passages:[]}))}).success,false);
});
