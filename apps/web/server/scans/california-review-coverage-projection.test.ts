import assert from "node:assert/strict";
import test from "node:test";
import {policyTextEvidenceProjectionSchema,deriveConsentControlAssessment,locateCaliforniaReviewTopics,californiaPrivacyReviewSchema,privacyChoiceInspectionSchema,type CanonicalEvidenceBundle} from "@certscore/contracts";
import {californiaCoverageFixture,CA_FIXTURE_URL,CA_FIXTURE_SOURCE,CA_FIXTURE_POLICY} from "./california-review-coverage.fixture";
import {projectCaliforniaPrivacyReview} from "./california-privacy-review-projection";
import {deriveCaliforniaRegulatoryScore} from "../../lib/scans/california-regulatory-score";
import {buildUnifiedFindingDisplayPackets} from "../../lib/scans/unified-findings";
import {buildApiV2PostureScores} from "../../lib/api-v2/posture-scores";

function assess(fixture=californiaCoverageFixture()) {
  const child=projectCaliforniaPrivacyReview(fixture.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,fixture.policyEvidence)!;
  const parent=deriveConsentControlAssessment({scan:{scanId:fixture.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
  const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent}});
  return {child,packets,score:deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:packets})};
}
test("insufficient retained policy bodies cannot prove California rights absence", () => {
  for (const text of ["BOS - Internet Banking - Unavailable. Please try again later.", "Privacy policy Navigation Contact Products Solutions Careers Privacy policy"]) {
    const f = californiaCoverageFixture(text);
    f.bundle.policySurfaceInspection!.californiaReviewPolicy = "california-privacy-review.v10";
    for (const surface of f.bundle.policySurfaceObservations) {
      surface.documentLanguage = "en";
      surface.governingPolicyBodyAssessment = { contractVersion: "governing_policy_body_assessment.v1", state: "insufficient", canonicalContextTermCount: 0,
        documentTextChars: text.length, evidenceBoundObservedTopicCount: 0, substantiveDisclosureSignalCount: 0, reasonCodes: ["policy_body_substance_insufficient"] };
    }
    const { child, score, packets } = assess(f);
    assert.ok(child?.contractVersion === "certscore.california-privacy-review.v10");
    assert.equal(child.disclosureInspection, undefined);
    assert.deepEqual(score.deductions, []);
    assert.ok(!packets.some(packet => packet.unifiedFindingId === "california_privacy_rights_not_disclosed"));
  }
});

test("completed zero-choice inspection retains provenance without a policy document", () => {
  const f = californiaCoverageFixture();
  f.bundle.policySurfaceInspection!.californiaReviewPolicy = "california-privacy-review.v10";
  f.bundle.policySurfaceObservations = [];
  f.policyEvidence.projection.documents = [];
  f.policyEvidence.texts = [];
  const { child } = assess(f);
  assert.ok(child, "Optional California child must survive strict validation");
  assert.equal(californiaPrivacyReviewSchema.safeParse(child).success, true);
  assert.match(JSON.stringify(child), /CanonicalEvidenceBundle\.json#policySurfaceInspection\.privacyChoiceInspection/);
});
test("nonmaterial translations and unrelated links do not invalidate verified governing text; missing CA supplements still limit",()=>{
 const f=californiaCoverageFixture();const parent=f.bundle.policySurfaceObservations[0]!;
 for(const [i,label,path]of [[0,"Deutsch","/de/privacy-policy"],[1,"Modern Slavery Statement","/privacy-pages/uk/modern-slavery-statement"],[2,"UK Editorial Complaints Policy","/privacy-pages/uk/complaints/policy"]] as const)
  f.bundle.policySurfaceObservations.push({...parent,observationId:`alternate-${i}`,surfaceType:"privacy_policy",parentObservationId:parent.observationId,traversalDepth:1,
   linkText:label,url:new URL(path,parent.normalizedUrl).href,normalizedUrl:new URL(path,parent.normalizedUrl).href,status:"observed",documentFetchState:"not_attempted"});
 assert.equal(assess(f).score.score,100);
 const alternate=f.bundle.policySurfaceObservations.at(-1)!;
 f.bundle.policySurfaceObservations.push({...alternate,observationId:"material-ca",surfaceType:"california_notice",linkText:"California Privacy Supplement",url:new URL('/california',parent.normalizedUrl).href});
 assert.equal(assess(f).score.score,null);
});
test("v3 scores completed real-world capture while disclosure questions remain review",()=>{
  const f=californiaCoverageFixture("Canadian Privacy Policy. We retain personal information only as long as necessary. To exercise your privacy rights, contact privacy@example.test.");
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v3";
  f.bundle.collectionSurfaceInventory!.scenario="fresh_pre_consent";
  const {child,score,packets}=assess(f);
  assert.equal(child.contractVersion,"certscore.california-privacy-review.v3");
  assert.equal(score.policyVersion,"california-regulatory-posture.v3");
  assert.equal(score.score,100);assert.equal(score.coverage,"limited");
  assert.ok(score.reviewCoverage?.families.some(row=>row.id === "california_rights" && row.status === "review"));
  assert.ok(packets.some(packet=>packet.unifiedFindingId === "california_privacy_choice_not_observed"));
  assert.deepEqual(score.deductions,[]);
  for(const change of [
    (fixture:typeof f)=>{fixture.bundle.collectionSurfaceInventory!.coverage.status="limited";},
    (fixture:typeof f)=>{fixture.policyEvidence.projection.documents[0]!.documentTextCoverage.status="truncated";},
    (fixture:typeof f)=>{fixture.bundle.runtimeCoverage!.coverageStatus="limited_partial";},
    (fixture:typeof f)=>{fixture.bundle.policySurfaceInspection!.privacyChoiceInspection!.coverage="limited";},
  ]) {const changed=structuredClone(f);change(changed);assert.equal(assess(changed).score.score,null,"Incomplete retained capture must not support a clean score");}
});
test("new canonical California coverage requires six families; absent choice is score-neutral and EU-independent",()=>{
  const {child,score,packets}=assess();
  assert.equal(child.contractVersion,"certscore.california-privacy-review.v2");
  assert.equal(score.policyVersion,"california-regulatory-posture.v2");
  assert.equal(score.score,100);
  assert.equal(score.reviewCoverage?.scoreReady,true);
  assert.equal(score.reviewCoverage?.families.length,6);
  assert.deepEqual(score.deductions,[]);
  assert.ok(!packets.some(packet=>packet.unifiedFindingId==="california_privacy_choice_not_observed"),"no missing-choice issue is inferred from a retained no-sale/sharing claim");
  assert.ok(packets.every(packet=>!packet.scoreEffects?.length));
  const api=buildApiV2PostureScores({score:73,californiaScore:score});
  assert.equal(api.gdprEprivacy.score,73);assert.equal(api.ccpaCpra.score,100);
  assert.equal(api.ccpaCpra.coverageSummary?.evidenceFamilies,6);
  assert.equal(api.ccpaCpra.policyVersion,score.policyVersion);
});
test("generic Canadian rights, cookie settings and analytics do not establish California rights or sale/sharing",()=>{
  const fixture=californiaCoverageFixture("Canadian Privacy Policy. You may access and correct your personal information by contacting privacy@example.test. We share information with service providers. We use Google Analytics. Cookie Settings.");
  const {score}=assess(fixture);
  assert.equal(score.score,null);assert.equal(score.coverage,"limited");
  assert.equal(score.reviewCoverage?.policyStatement,"not_identified");
  assert.ok(!score.reviewCoverage?.topics.some(row=>row.topic==="right_to_delete"||row.topic==="right_to_know"));
  assert.deepEqual(score.deductions,[]);
});
test("bounded section indexes do not negate checksum-verified complete policy text",()=>{
  const f=californiaCoverageFixture();
  for(const document of f.policyEvidence.projection.documents) document.contentCoverage={...document.contentCoverage!,status:"truncated",
    extractedSectionCount:62,retainedSectionCount:20,limitationKeys:["policy_section_inventory_bounded","policy_section_text_bounded"]};
  const {score}=assess(f);
  assert.equal(score.score,100);
  assert.ok(score.reviewCoverage?.sourceDocuments.every(document=>document.complete));
  f.policyEvidence.projection.documents[0]!.documentTextCoverage.status="truncated";
  assert.equal(assess(f).score.score,null,"Actual text truncation remains limited");
});
test("v5 parsed-document proof supports a complete inventory; loading or limited proof cannot be upgraded",()=>{
  const f=californiaCoverageFixture();
  const proof={...f.bundle.policySurfaceInspection!.privacyChoiceInspection!,contractVersion:"certscore.privacy-choice-inspection.v5",
    readinessPolicy:"document_bound_dom_inventory.v1",documentReadyState:"interactive",limitationKeys:[]};
  f.bundle.policySurfaceInspection!.privacyChoiceInspection=privacyChoiceInspectionSchema.parse(proof);
  assert.equal(assess(f).score.score,100);
  assert.equal(privacyChoiceInspectionSchema.safeParse({...proof,documentReadyState:"loading"}).success,false);
  assert.equal(privacyChoiceInspectionSchema.safeParse({...proof,limitationKeys:["document_binding_unverified"]}).success,false);
  const unresolved=californiaCoverageFixture("Canadian Privacy Policy. To exercise your privacy rights, contact privacy@example.test. We use personal information to provide requested services.");
  unresolved.bundle.policySurfaceInspection!.privacyChoiceInspection=privacyChoiceInspectionSchema.parse(proof);
  const result=assess(unresolved);
  assert.equal(result.child.choiceSurface,"not_observed_in_inspected_scope");
  assert.equal(result.score.score,null,"A complete choice inventory does not resolve California policy obligations");
  assert.ok(result.packets.some(packet=>packet.unifiedFindingId === "california_privacy_choice_not_observed"));
  assert.deepEqual(result.score.deductions,[]);
});
test("policy source drift, wrong ownership, partial text, missing material supplements and runtime failure block clean scores",()=>{
  const cases=[
    (f:ReturnType<typeof californiaCoverageFixture>)=>{f.policyEvidence.texts[0]!.text+=" changed";},
    (f:ReturnType<typeof californiaCoverageFixture>)=>{f.policyEvidence.projection.sourceBundle.sha256="c".repeat(64);},
    (f:ReturnType<typeof californiaCoverageFixture>)=>{f.policyEvidence.projection.documents[0]!.targetRelationship="service_provider";},
    (f:ReturnType<typeof californiaCoverageFixture>)=>{f.policyEvidence.projection.documents[0]!.documentTextCoverage.status="truncated";},
    (f:ReturnType<typeof californiaCoverageFixture>)=>{f.policyEvidence.projection.documents.push({...f.policyEvidence.projection.documents[0]!,observationId:"unretained-supplement",artifactVerificationStatus:"missing_manifest_entry"});},
    (f:ReturnType<typeof californiaCoverageFixture>)=>{f.bundle.modulesRun[0]!.status="partial";},
    (f:ReturnType<typeof californiaCoverageFixture>)=>{f.bundle.policySurfaceObservations[1]!.linkVisibility="hidden";},
  ];
  for(const change of cases){const f=californiaCoverageFixture();change(f);const {score}=assess(f);assert.equal(score.score,null,change.toString());assert.equal(score.reviewCoverage?.scoreReady,false);}
});
test("failed new inspection stays v2 limited, and coverage cannot be forged to permit scoring",()=>{
  const f=californiaCoverageFixture();delete f.bundle.policySurfaceInspection!.privacyChoiceInspection;
  const {child,score}=assess(f);assert.equal(child.contractVersion,"certscore.california-privacy-review.v2");assert.equal(score.score,null);
  if(child.contractVersion!=="certscore.california-privacy-review.v2")throw new Error("v2 expected");
  assert.equal(californiaPrivacyReviewSchema.safeParse({...child,reviewCoverage:{...child.reviewCoverage,scoreReady:true}}).success,false);
});
test("GPC evidence and actual scan region cannot change new California coverage or score",()=>{
  const a=assess();const f=californiaCoverageFixture();Object.assign(f.bundle,{gpcResponse:{status:"no_observable_response"},scanFrom:"eu_de"});
  const b=assess(f);assert.deepEqual(b.score,a.score);
});

test("a verified broken choice deducts once through canonical concern policy under v2",()=>{
  const f=californiaCoverageFixture();f.bundle.policySurfaceInspection!.privacyChoiceInspection!.namedChoiceCandidateCount=1;
  f.bundle.policySurfaceObservations.push({...f.bundle.policySurfaceObservations[0]!,observationId:"choice",surfaceType:"do_not_sell_or_share",
    url:`${CA_FIXTURE_URL}choice`,normalizedUrl:`${CA_FIXTURE_URL}choice`,finalUrl:`${CA_FIXTURE_URL}choice`,
    linkText:"Do Not Sell or Share My Personal Information",classifierProvenance:"privacy_surface_classifier.v1",status:"failed",documentFetchState:"failed",fetchFailureReason:"http_error",httpStatus:404});
  const {score,packets}=assess(f);
  assert.equal(score.score,86);assert.equal(score.deductions.length,1);
  const effect=packets.flatMap(packet=>packet.scoreEffects??[]).find(effect=>effect.policyKey==="california.choice_destination_error")!;
  assert.equal(effect.policyVersion,"california-regulatory-posture.v2");assert.equal(effect.deductionPoints,14);assert.equal(effect.appliesTo,"california_posture");
  const missingProof=deriveCaliforniaRegulatoryScore({assessment:assess(f).child,checklistRows:[],unifiedFindings:[]});
  assert.equal(missingProof.score,null);
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v3";
  const current=assess(f);
  assert.equal(current.score.score,86);
  assert.equal(current.score.deductions.length,1);
  assert.equal(current.packets.flatMap(packet=>packet.scoreEffects??[]).find(effect=>effect.policyKey === "california.choice_destination_error")?.policyVersion,"california-regulatory-posture.v3");
});
test("topic location preserves matching passages and rejects denial/hypothetical vendor-only wording",()=>{
  const text="California Privacy Notice. "+"Navigation item ".repeat(100)+"You have the right to delete your personal information. We do not sell or share personal information.";
  const evidence=locateCaliforniaReviewTopics(text,{californiaNotice:true});
  assert.match(evidence.topics.find(row=>row.topic==="right_to_delete")!.excerpt,/right to delete/);
  assert.match(evidence.topics.find(row=>row.topic==="sale_sharing_statement")!.excerpt,/We do not sell or share/);
  assert.equal(locateCaliforniaReviewTopics("California Privacy. You do not have the right to delete your personal information.").topics.some(row=>row.topic==="right_to_delete"),false);
  assert.equal(locateCaliforniaReviewTopics(CA_FIXTURE_POLICY).policyStatement,"declares_no_sale_sharing");
  assert.equal(locateCaliforniaReviewTopics("We do not sell or share personal information, except for advertising partners.").policyStatement,"not_identified");
  const canadian=locateCaliforniaReviewTopics("For a customer, such information includes billing records and service history. We shall retain personal information only as long as is necessary for the stated purposes.");
  assert.ok(canadian.topics.some(row=>row.topic === "categories"));
  assert.ok(canadian.topics.some(row=>row.topic === "retention"));
  assert.ok(!canadian.topics.some(row=>row.topic.startsWith("right_to_")),"Shared disclosure topics do not establish California rights");
});

test("a personal-data form requires a bound purpose notice and retained policy destination",()=>{
  const f=californiaCoverageFixture();const inventory=f.bundle.collectionSurfaceInventory!;
  inventory.forms=[{formRef:"contact",pageUrl:CA_FIXTURE_URL,structure:"native_form",surfaceType:"contact",method:"post",actionRelationship:"self",
    candidateFieldCount:1,retainedFieldCount:1,fieldsTruncated:false,confidence:1,directVsInferred:"direct",evidenceRefs:[{refId:"form-contact"}],
    fields:[{fieldRef:"email",elementType:"input",inputType:"email",semanticCategory:"email",label:"Email",required:true,disabled:false,readOnly:false,
      confidence:1,directVsInferred:"direct",evidenceRefs:[{refId:"field-email"}]}]}];
  Object.assign(inventory.coverage,{candidateFormCount:1,retainedFormCount:1,candidateFieldCount:1,retainedFieldCount:1,inspectedFormCandidateCount:1,inspectedFieldCandidateCount:1});
  assert.equal(assess(f).score.score,null);
  inventory.forms[0]!.privacyDisclosure={version:1,truncated:false,excerpts:[{text:"We use personal information to respond to your request.",association:"adjacent_notice",
    links:[{label:"Notice at Collection",url:`${CA_FIXTURE_URL}notice`}]}]};
  assert.equal(assess(f).score.score,100);
  inventory.forms[0]!.privacyDisclosure.excerpts[0]!.links[0]!.url="https://unrelated.test/privacy";
  assert.equal(assess(f).score.score,null);
  inventory.forms[0]!.fields[0]!.semanticCategory="search";
  inventory.forms[0]!.fieldsTruncated=true;
  inventory.forms[0]!.candidateFieldCount=2;
  Object.assign(inventory.coverage,{candidateFieldCount:2,inspectedFieldCandidateCount:2});
  assert.equal(assess(f).score.score,null,"A retained search field cannot excuse omitted fields");
});

test("a no-sale/sharing claim alongside baseline advertising needs role review; GPC-only advertising cannot affect CA scoring",()=>{
  const f=californiaCoverageFixture();
  f.bundle.networkEvents=[{eventId:"ad",scenario:"pre_consent"} as CanonicalEvidenceBundle["networkEvents"][number]];
  f.bundle.normalizedVendorObservations=[{purpose:"advertising",matchSources:[{scenario:"pre_consent",sourceEventId:"ad"}]} as CanonicalEvidenceBundle["normalizedVendorObservations"][number]];
  assert.equal(assess(f).score.score,null);
  f.bundle.networkEvents[0]!.scenario="gpc";f.bundle.normalizedVendorObservations[0]!.matchSources[0]!.scenario="gpc";
  assert.equal(assess(f).score.score,100);
});

test("v4 complete English inspection projects one bounded rights-disclosure finding and CA-only deduction",()=>{
  const f=californiaCoverageFixture("Privacy Policy. We collect personal information to provide services. You may access and correct personal information. Records are destroyed after the retention period. Contact privacy@example.test for access requests.");
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v4";
  f.bundle.policySurfaceObservations.forEach(surface=>{surface.documentLanguage="en-CA";});
  const {child,packets,score}=assess(f);
  assert.equal(child.contractVersion,"certscore.california-privacy-review.v4");
  assert.equal(score.policyVersion,"california-regulatory-posture.v4");
  assert.equal(score.score,88);assert.equal(score.coverage,"limited");
  assert.equal(score.deductions.length,1);assert.equal(score.deductions[0]!.policyKey,"california.rights_disclosure_not_observed");
  assert.ok(packets.find(row=>row.unifiedFindingId === "california_rights_disclosure_not_observed")?.scoreEffects?.every(effect=>effect.appliesTo === "california_posture"));
  if(child.contractVersion!=="certscore.california-privacy-review.v4")throw new Error("v4 expected");
  assert.deepEqual(child.disclosureInspection?.topics.filter(row=>row.status === "not_observed").map(row=>row.topic),["non_discrimination"]);
  assert.equal(child.disclosureInspection?.documents[0]!.inspectedChars,f.policyEvidence.texts[0]!.text.length);
  assert.equal(deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:[]}).score,null,"No scoring shortcut around canonical findings");
  const wrongSource=structuredClone(child);wrongSource.disclosureInspection!.sourceBundleSha256="f".repeat(64);
  assert.equal(californiaPrivacyReviewSchema.safeParse(wrongSource).success,false);
  for(const mutation of [
    (row:typeof f)=>{row.bundle.policySurfaceObservations[0]!.documentLanguage=undefined;},
    (row:typeof f)=>{row.bundle.policySurfaceObservations[0]!.documentLanguage="fr";},
    (row:typeof f)=>{row.bundle.policySurfaceObservations[0]!.translationApplied=true;},
    (row:typeof f)=>{row.policyEvidence.texts[0]!.text+=" drift";},
    (row:typeof f)=>{row.policyEvidence.projection.documents[0]!.documentTextCoverage.status="truncated";},
    (row:typeof f)=>{row.bundle.policySurfaceObservations.push({...row.bundle.policySurfaceObservations[0]!,observationId:"missing-supplement",traversalDepth:1});},
  ]) {const copy=structuredClone(f);mutation(copy);const result=assess(copy);assert.ok(!result.packets.some(packet=>packet.unifiedFindingId === "california_rights_disclosure_not_observed"),mutation.toString());}
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v3";
  assert.equal(assess(f).score.score,100,"Historical v3 conclusions and weights are preserved");
});

test("v4 broad equivalent wording prevents a missing-rights finding despite failed positive passage matches",()=>{
  const f=californiaCoverageFixture("Privacy Policy. Obtain a copy of your information. Ask us to erase your records or rectify inaccuracies. We do not deny you goods or services for exercising privacy rights.");
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v4";
  f.bundle.policySurfaceObservations.forEach(surface=>{surface.documentLanguage="en";});
  const {child,score,packets}=assess(f);
  assert.equal(score.score,100);
  assert.ok(!packets.some(packet=>packet.unifiedFindingId === "california_rights_disclosure_not_observed"));
  assert.ok(child.contractVersion === "certscore.california-privacy-review.v4" && child.disclosureInspection?.topics.every(row=>row.status === "candidate_present"));
});

test("v5 clause assessments distinguish rights grants from retention and keep one canonical deduction",()=>{
  const f=californiaCoverageFixture("Privacy Policy. We give the individual access to that information upon request. A customer may challenge the accuracy of personal information and have it amended. We maintain controls for records retention and destruction when information is no longer necessary. Such information shall be destroyed, erased or made anonymous. We protect personal information from loss, theft or destruction through security measures.");
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v5";
  f.bundle.policySurfaceObservations.forEach(surface=>{surface.documentLanguage="en";});
  const {child,score,packets}=assess(f);
  assert.equal(child.contractVersion,"certscore.california-privacy-review.v5");
  assert.equal(score.policyVersion,"california-regulatory-posture.v5");assert.equal(score.score,88);assert.equal(score.deductions.length,1);
  assert.equal(packets.filter(row=>row.unifiedFindingId === "california_rights_disclosure_not_observed").length,1);
  if(child.contractVersion!=="certscore.california-privacy-review.v5")throw new Error("v5 expected");
  assert.equal(child.rightsAssessment?.topics.find(row=>row.topic === "right_to_know")!.status,"disclosed");
  assert.equal(child.rightsAssessment?.topics.find(row=>row.topic === "right_to_correct")!.status,"disclosed");
  assert.equal(child.rightsAssessment?.topics.find(row=>row.topic === "right_to_delete")!.status,"not_observed");
  assert.ok(child.rightsAssessment?.topics.find(row=>row.topic === "right_to_delete")!.excludedPassages.length);
  const forged=structuredClone(child);forged.rightsAssessment!.topics[0]!.passages[0]!.textSha256="d".repeat(64);
  assert.equal(californiaPrivacyReviewSchema.safeParse(forged).success,false);
  f.policyEvidence.projection.documents[0]!.documentTextCoverage.status="truncated";
  const limited=assess(f);assert.equal(limited.score.score,null);
  assert.ok(limited.child.contractVersion === "certscore.california-privacy-review.v5" && !limited.child.rightsAssessment);
  assert.ok(!limited.packets.some(row=>row.unifiedFindingId === "california_rights_disclosure_not_observed"));
});

test("v6 persists assessed rights gaps, separate sale/sharing claims and evidence-bound collection rows",()=>{
  const f=californiaCoverageFixture("Privacy Policy. We give the individual access to personal information upon request. A customer may request correction of personal information. We share personal information with service providers for billing. We use analytics to understand website traffic.");
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v6";
  f.bundle.policySurfaceObservations.forEach(surface=>{surface.documentLanguage="en";});
  const {child,score}=assess(f);
  if(child.contractVersion!=="certscore.california-privacy-review.v6")throw new Error("v6 expected");
  assert.equal(score.policyVersion,"california-regulatory-posture.v6");assert.equal(score.score,88);assert.equal(score.deductions.length,1);
  assert.equal(child.reviewCoverage.families.find(row=>row.id === "california_rights")!.status,"assessed_gap");
  assert.equal(child.saleSharingAssessment?.topics.find(row=>row.topic === "operational_disclosures")!.status,"described");
  assert.equal(child.saleSharingAssessment?.choiceBasis,"unresolved");
  assert.equal(child.collectionNoticeAssessment.contractVersion,"certscore.california-collection-notice-matching.v2");
  assert.equal(buildApiV2PostureScores({score:73,californiaScore:score}).ccpaCpra.coverageSummary?.families.find(row=>row.id === "california_rights")!.status,"assessed_gap");
  const forged=structuredClone(child);forged.saleSharingAssessment!.topics[2]!.passages[0]!.textSha256="f".repeat(64);
  assert.equal(californiaPrivacyReviewSchema.safeParse(forged).success,false);
  const forgedGap=structuredClone(child);forgedGap.reviewCoverage.families.find(row=>row.id === "privacy_choices")!.status="assessed_gap";
  assert.equal(californiaPrivacyReviewSchema.safeParse(forgedGap).success,false);
  f.policyEvidence.projection.documents[0]!.documentTextCoverage.status="truncated";
  const limited=assess(f);assert.equal(limited.score.score,null);
  assert.ok(limited.child.contractVersion === "certscore.california-privacy-review.v6" && !limited.child.saleSharingAssessment);
});

test("v7 persists completion and follow-ups separately, without altering the canonical rights deduction",()=>{
  const f=californiaCoverageFixture("Privacy Policy. We give the individual access to personal information upon request. A customer may request correction of personal information. We share personal information with service providers for billing. We use cookies for analytics.");
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v7";
  f.bundle.policySurfaceObservations.forEach(surface=>{surface.documentLanguage="en";});
  f.bundle.cookieEvents=[{eventId:"cookie",scenario:"fresh_pre_consent",documentUrl:CA_FIXTURE_URL,cookieName:"sid",cookiePurpose:"unknown"}] as never;
  const {child,score}=assess(f);
  if(child.contractVersion!=="certscore.california-privacy-review.v7")throw new Error("v7 expected");
  assert.equal(score.policyVersion,"california-regulatory-posture.v7");assert.equal(score.score,88);assert.equal(score.deductions.length,1);
  const sale=child.reviewCoverage.families.find(row=>row.id === "sale_sharing")!,choice=child.reviewCoverage.families.find(row=>row.id === "privacy_choices")!,collection=child.reviewCoverage.families.find(row=>row.id === "collection_notice")!;
  assert.equal(sale.assessmentState,"completed");assert.equal(sale.followUp,"recipient_roles");assert.equal(sale.status,"review");
  assert.equal(choice.assessmentState,"completed");assert.equal(choice.followUp,"applicability");
  assert.equal(collection.assessmentState,"partial");assert.equal(collection.followUp,"purpose");
  assert.match(collection.reason,/1 of 1 collection points/);
  const api=buildApiV2PostureScores({score:73,californiaScore:score});assert.equal(api.ccpaCpra.coverageSummary?.families.find(row=>row.id === "sale_sharing")!.assessmentState,"completed");
  const forged=structuredClone(child);forged.reviewCoverage.families.find(row=>row.id === "collection_notice")!.assessmentState="completed";
  assert.equal(californiaPrivacyReviewSchema.safeParse(forged).success,false);
  f.policyEvidence.projection.documents[0]!.documentTextCoverage.status="truncated";
  const limited=assess(f);assert.equal(limited.score.score,null);
  assert.ok(limited.child.contractVersion === "certscore.california-privacy-review.v7" && limited.child.reviewCoverage.families.find(row=>row.id === "sale_sharing")!.assessmentState!=="completed");
});

test("v10 keeps rights scoring while vendor-only opt-out requests are review-only; historical v9 retains its rule", async()=>{
  const {californiaFindingScoreEffect}=await import("../../lib/scans/california-regulatory-score");
  const f=californiaCoverageFixture("Privacy Policy. We give the individual access to personal information upon request. A customer may request correction of personal information.");
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";
  f.bundle.policySurfaceObservations.forEach(surface=>{surface.documentLanguage="en";});
  const {child,score}=assess(f);
  assert.equal(child.contractVersion,"certscore.california-privacy-review.v10");
  assert.equal(score.policyVersion,"california-regulatory-posture.v11-wcag");assert.equal(score.score,88);
  assert.deepEqual(californiaFindingScoreEffect("california_sale_sharing_opt_out_activity","evidence","certscore.california-privacy-review.v10"),[]);
  assert.equal(californiaFindingScoreEffect("california_sale_sharing_opt_out_activity","evidence","certscore.california-privacy-review.v9")[0]!.deductionPoints,18);
  assert.equal(californiaFindingScoreEffect("california_sale_sharing_opt_out_activity","evidence","certscore.california-privacy-review.v9")[0]!.policyVersion,"california-regulatory-posture.v7");
});

test('v10 numeric risk score survives unrelated runtime limits when the governing notice is fully verified',()=>{
 const f=californiaCoverageFixture();f.bundle.policySurfaceInspection!.californiaReviewPolicy='california-privacy-review.v10';
 f.bundle.policySurfaceObservations.forEach(surface=>{surface.documentLanguage='en';});
 f.bundle.runtimeCoverage!.coverageStatus='limited_partial';
 const {score}=assess(f);assert.equal(score.score,100);assert.equal(score.coverage,'limited');assert.equal(score.reviewCoverage?.scoreReady,false);
 f.policyEvidence.projection.documents.forEach(document=>{document.documentTextCoverage.status='truncated';});
 assert.equal(assess(f).score.score,null,'No clean numeric score from missing or truncated notice evidence');
});

test('unobserved guessed 404 paths do not invalidate a separately verified governing privacy notice',()=>{
 const f=californiaCoverageFixture();f.bundle.policySurfaceInspection!.californiaReviewPolicy='california-privacy-review.v10';
 f.bundle.policySurfaceObservations.forEach(surface=>{surface.documentLanguage='en';});
 const document=structuredClone(f.policyEvidence.projection.documents[0]!);document.observationId='guessed-missing';
 document.documentFetchState='failed';document.documentEvaluationState='not_attempted';document.artifactVerificationStatus='missing_manifest_entry';
 f.policyEvidence.projection.documents.push(document);f.policyEvidence.projection.projectionStatus='verified_partial';
 f.bundle.policySurfaceObservations.push({...f.bundle.policySurfaceObservations[0]!,observationId:'guessed-missing',discoveryMethod:'guessed_common_path',linkObservationState:'candidate',status:'failed',documentFetchState:'failed',httpStatus:404});
 policyTextEvidenceProjectionSchema.parse(f.policyEvidence.projection);
 const {child,score}=assess(f);assert.ok(child,"Canonical child must remain valid");assert.ok(score.reviewCoverage && "captureCoverage" in score.reviewCoverage);assert.equal(score.reviewCoverage.captureCoverage.policyTextComplete,true);assert.equal(score.score,100);
});

test("positive rights clauses remain assessable with a missing governing supplement, without absence or score effects",()=>{
 const f=californiaCoverageFixture("California Privacy Notice. You have the right to access your personal information. You have the right to ask that we delete your personal information. You have the right to ask that we correct your personal information. We will not retaliate against you for exercising your rights.");
 f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";
 for(const surface of f.bundle.policySurfaceObservations)surface.documentLanguage="en";
 f.bundle.policySurfaceObservations.push({...f.bundle.policySurfaceObservations[0]!,observationId:'unfetched-supplement',url:CA_FIXTURE_URL+'california-more',surfaceType:'california_notice',traversalDepth:1,parentObservationId:'policy',status:'observed',documentFetchState:'not_attempted'});
 const {child,score}=assess(f);
 assert.ok(child.contractVersion === "certscore.california-privacy-review.v10");
 assert.equal(child.disclosureInspection,undefined);
 assert.ok(child.rightsAssessment?.topics.every(topic=>topic.status==='disclosed'));
 assert.equal(child.rightsAssessment?.sourceCoverage?.status,'partial');
 assert.equal(californiaPrivacyReviewSchema.safeParse(child).success,true);
 assert.equal(score.score,100);assert.deepEqual(score.deductions,[]);
 const forged=structuredClone(child);forged.rightsAssessment!.topics[1]!.status='not_observed';assert.equal(californiaPrivacyReviewSchema.safeParse(forged).success,false);
});

test("v10 retains explicit English rights passages without a language tag, without negative conclusions",()=>{
 const f=californiaCoverageFixture("California Privacy Notice. As a California resident, you have the right to know the personal information we collected. You have the right to request deletion of your personal information. You have the right to correct inaccurate personal information. You have the right not to be discriminated against for exercising these rights.");
 f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";
 for(const surface of f.bundle.policySurfaceObservations)surface.documentLanguage=undefined;
 const {child,score}=assess(f);assert.ok(child.contractVersion === "certscore.california-privacy-review.v10");
 assert.equal(child.disclosureInspection,undefined);
 assert.equal(child.rightsAssessment?.sourceCoverage?.policyVersion,"verified_positive_clauses.v2");
 assert.ok(child.rightsAssessment?.topics.every(topic=>topic.status==='disclosed'));
 assert.deepEqual(score.deductions,[]);assert.equal(californiaPrivacyReviewSchema.safeParse(child).success,true);
 for(const mutate of [
  (row:typeof f)=>{row.bundle.policySurfaceObservations.forEach(s=>{s.documentLanguage='fr';});},
  (row:typeof f)=>{row.bundle.policySurfaceObservations.forEach(s=>{s.translationApplied=true;});},
  (row:typeof f)=>{row.policyEvidence.texts.forEach(t=>{t.text+=' drift';});},
 ]) {const copy=structuredClone(f);mutate(copy);const result=assess(copy);assert.ok(!result.child || !('rightsAssessment' in result.child) || !result.child.rightsAssessment?.topics.some(t=>t.status==='disclosed'));assert.deepEqual(result.score.deductions,[]);}
});
