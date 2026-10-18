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

test("verified positive clauses survive missing supplements while negatives remain review",()=>{
 const text="California Privacy Notice. You have the right to ask that we delete your personal information. You have the right to ask that we correct your personal information. We will not retaliate against you for exercising your rights.";
 const documents=[{text,url:"https://example.test/california",evidenceRef:"policy-text:ca",textSha256:createHash("sha256").update(text).digest("hex")}];
 const result=assessCaliforniaRightsClauses(documents,hash,{completeCoverage:false});
 assert.deepEqual(result.topics.map(t=>t.status),["review","disclosed","disclosed","disclosed"]);
 const us=assess("Correction Request that we amend or update your personal data where it is inaccurate. You will not receive discriminatory treatment for exercising any of your privacy rights.");
 assert.equal(us.topics[2]!.status,"disclosed");assert.equal(us.topics[3]!.status,"disclosed");
});

test("qualified California rights wording remains a positive disclosure rather than an omission",()=>{
 const text="Rights for California Residents. As a California resident, you may have the following rights under the CCPA: the right to know the personal information collected; the right to request, on legitimate grounds, deletion of your personal information; the right, in certain circumstances, to correct inaccurate personal information; and the right not to be discriminated against for exercising any of these rights.";
 const result=assess(text);assert.deepEqual(result.topics.map(t=>t.status),['disclosed','disclosed','disclosed','disclosed']);
 for(const topic of result.topics)for(const p of topic.passages)assert.equal(text.slice(p.start,p.end),p.excerpt);
});

test("positive passage language policy cannot authorize an absence conclusion",()=>{
 const text="Privacy information. Contact our privacy office for more information.";
 const result=assessCaliforniaRightsClauses([{text,url:"https://example.test/privacy",textSha256:createHash("sha256").update(text).digest("hex"),evidenceRef:"policy-text:policy"}],hash,{positivePassageLanguage:true,completeCoverage:true});
 assert.ok(result.topics.every(topic=>topic.status==='review'));
 assert.equal(result.sourceCoverage?.policyVersion,'verified_positive_clauses.v2');
});

test("rights audience survives list/sentence boundaries and a later US grant resets foreign scope",()=>{
 const foreign="4. International Users. If you are located in countries outside the United States, including the EU and UK, you may have the following rights: The right to request the deletion of your personal data; the right to transfer or obtain a copy of your personal data; the right to correct personal information.";
 const result=assess(foreign);
 for(const topic of result.topics.slice(0,3)){assert.equal(topic.status,"review");assert.equal(topic.context,"other_jurisdiction_only");}
 const states=assess("Your Colorado and Oregon Privacy Choices. If you are a Colorado or Oregon resident you may have these rights: Right of access. You may request a copy of personal information. Right to correction. You have the right to correct personal information.");
 assert.equal(states.topics[0]!.status,"review");assert.equal(states.topics[2]!.context,"other_jurisdiction_only");
 const health=assess("Your Privacy Rights. The MHMD Act provides the following rights: You have the right to access personal information.");
 assert.equal(health.topics[0]!.context,"other_jurisdiction_only");
 const us=assess(foreign+" Your Privacy Rights. U.S. privacy laws provide consumers with rights. If you are a U.S. consumer, you have the right to access personal information.");
 assert.equal(us.topics[0]!.status,"disclosed");
});

test("feature access cannot serve as a consumer data-access grant; exact operative clauses win",()=>{
 const text="We use personal information to provide services and provide you access to certain areas and features of the Platforms; verify identity; advertise products. Your Privacy Rights. Right to Know and Access. You may have the right to request that we provide you with the Personal Information we have collected about you.";
 const result=assess(text);assert.equal(result.topics[0]!.status,"disclosed");
 assert.match(result.topics[0]!.passages[0]!.excerpt,/right to request/);
 assert.doesNotMatch(result.topics[0]!.passages[0]!.excerpt,/features of the Platforms/);
});

test("short rights lists inherit their explicit grant and retain exact original passages",()=>{
 const text='Your privacy rights. Depending upon your location and in accordance with applicable laws, you may have the right to: Access information about you consistent with legal requirements. Request Correction of your information where it is inaccurate or incomplete. Request Deletion of your information, subject to statutory exceptions. Not be Discriminated Against by us for exercising your privacy rights.';
 const result=assess(text);assert.ok(result.topics.every(row=>row.status==='disclosed'),JSON.stringify(result.topics.map(row=>[row.topic,row.status,row.context])));
 assert.equal(result.assessmentPolicyVersion,'rights_section_context.v2');
 for(const row of result.topics)for(const p of row.passages)assert.equal(text.slice(p.start,p.end),p.excerpt);
 const withoutGrant=assess('About our services. Access information about you. Request Correction of your information.');
 assert.ok(withoutGrant.topics.every(row=>row.status!=='disclosed'));
 assert.equal(assess('Non-Discrimination: We may not discriminate against you for exercising your rights.').topics[3]!.status,'disclosed');
 assert.equal(assess('A consumer has the right not to receive discriminatory treatment by the covered business for the exercise of privacy rights conferred by the CCPA.').topics[3]!.status,'disclosed');
 assert.equal(assess('We may not discriminate when hiring employees.').topics[3]!.status,'review');
});

test("foreign section headings and Oregon audience remain scoped across list items",()=>{
 for(const heading of ['Individual Rights of the Data Subject under the EU GDPR','Individual Rights Under the PIPL','Oregon residents']) {
  const result=assess(`${heading}. You have the following rights: Access information about you. Request Correction of your information. Request Deletion of your information.`);
  for(const topic of result.topics.slice(0,3)){assert.equal(topic.status,'review');assert.equal(topic.context,'other_jurisdiction_only',heading+' '+topic.topic);}
 }
 const text='Newsletter update information. Your consumer rights. Oregon residents have the right to request that we correct or delete personal information. Contact us about accuracy.';
 const result=assess(text);assert.match(result.topics[2]!.passages[0]!.excerpt,/Oregon residents/);
 assert.equal(result.topics[2]!.context,'other_jurisdiction_only');
});
