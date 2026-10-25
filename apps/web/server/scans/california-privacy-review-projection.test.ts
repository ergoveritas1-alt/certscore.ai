import assert from "node:assert/strict";
import test from "node:test";
import { californiaPrivacyReviewFindingIds, classifyCaliforniaRightsMethod, consentControlAssessmentSchema, deriveConsentControlAssessment, CALIFORNIA_CHOICE_ABSENCE_ID, CALIFORNIA_CHOICE_DESTINATION_ID, CALIFORNIA_NOTICE_DESTINATION_ID, CALIFORNIA_RIGHTS_DESTINATION_ID, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { projectCaliforniaPrivacyReview } from "./california-privacy-review-projection";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { projectCaliforniaRegulatoryPriorities } from "../../lib/scans/california-regulatory-priorities";
import { deriveCaliforniaRegulatoryScore, CALIFORNIA_REGULATORY_SCORE_VERSION } from "../../lib/scans/california-regulatory-score";
import { projectCaliforniaChoicePresence } from "../../lib/scans/california-choice-presence";

const url = "https://example.test/";
const source = { verificationStatus: "verified", sha256: "a".repeat(64) };
const inspection = {
  contractVersion: "certscore.privacy-choice-inspection.v1", documentUrl: url, capturedAt: "2026-10-16T12:00:01.000Z", sourceHash: "b".repeat(64),
  scope: "rendered_named_links_and_buttons", coverage: "complete", namedChoiceCandidateCount: 0, unnamedControlCount: 0,
  candidateEnumerationTruncated: false, uninspectedFrameCount: 0, uninspectedShadowRootCount: 0,
  supportedDocumentLanguage: true, representativeDocument: true, documentStable: true,
};
function bundle(overrides: Record<string, unknown> = {}) {
  return { scanId: "scan-fixture", startedAt: "2026-10-16T12:00:00.000Z", completedAt: "2026-10-16T12:00:02.000Z", policySurfaceObservations: [],
    domSnapshots: [{ url, documentIdentity: { source: "cdp_loader_id", token: "doc-1" } }],
    policySurfaceInspection: { privacyChoiceInspection: inspection }, ...overrides } as unknown as CanonicalEvidenceBundle;
}
const surface = { observationId: "dns", surfaceType: "do_not_sell_or_share", url: `${url}choices`, finalUrl: `${url}choices`,
  linkText: "Do Not Sell or Share My Personal Information", linkObservationState: "observed", linkSourcePageUrl: url,
  linkVisibility: "visible", accessibleNameSource: "text", classifierProvenance: "privacy_surface_classifier.v1",
  directlyLinkedFromScannedPage: true, discoveryMethod: "footer_link", documentFetchState: "failed", status: "failed", fetchFailureReason: "http_error", httpStatus: 404 };

test("California absence requires dedicated complete inspection, never an empty workpaper", () => {
  assert.deepEqual(californiaPrivacyReviewFindingIds(projectCaliforniaPrivacyReview(bundle(), source, url)), [CALIFORNIA_CHOICE_ABSENCE_ID]);
  const v2 = projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:{privacyChoiceInspection:{...inspection,
    contractVersion:"certscore.privacy-choice-inspection.v2",hiddenUnnamedControlCount:2}}}),source,url)!;
  assert.equal(v2.inspection?.contractVersion,"certscore.privacy-choice-inspection.v2");
  assert.deepEqual(californiaPrivacyReviewFindingIds(v2),[CALIFORNIA_CHOICE_ABSENCE_ID]);
  const malformedV2 = projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:{privacyChoiceInspection:{...inspection,
    contractVersion:"certscore.privacy-choice-inspection.v2"}}}),source,url)!;
  assert.equal(malformedV2.choiceSurface,"unknown");
  const v3 = { ...inspection, contractVersion:"certscore.privacy-choice-inspection.v3", hiddenUnnamedControlCount:0,
    frameCount:1,inspectedSameOriginFrameCount:1,uninspectedFrameCount:0,hiddenUninspectedFrameCount:0,
    inaccessibleFrameCount:0,unreadyFrameCount:0,unprojectableFrameCount:0,frameBudgetLimitedCount:0,
    namedFrameChoiceCandidateCount:0,frameInspectionWorkMs:1,frameProofWorkMs:1 };
  const completeFrame = projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:{privacyChoiceInspection:v3}}),source,url)!;
  assert.equal(completeFrame.choiceSurface,"not_observed_in_inspected_scope");
  assert.deepEqual(californiaPrivacyReviewFindingIds(completeFrame),[CALIFORNIA_CHOICE_ABSENCE_ID]);
  const incompleteFrame = projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:{privacyChoiceInspection:{...v3,
    coverage:"limited",inspectedSameOriginFrameCount:0,uninspectedFrameCount:1,unprojectableFrameCount:1,
    namedChoiceCandidateCount:1,namedFrameChoiceCandidateCount:1}}}),source,url)!;
  assert.equal(incompleteFrame.choiceSurface,"unknown");
  assert.deepEqual(californiaPrivacyReviewFindingIds(incompleteFrame),[]);
  const malformedV3 = projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:{privacyChoiceInspection:{...v3,
    inspectedSameOriginFrameCount:0}}}),source,url)!;
  assert.equal(malformedV3.choiceSurface,"unknown");
  const old = projectCaliforniaPrivacyReview(bundle({policySurfaceInspection: undefined}), source, url)!;
  assert.equal(old.choiceSurface, "unknown");
  for (const patch of [{coverage:"limited"},{uninspectedFrameCount:1},{candidateEnumerationTruncated:true},{documentStable:false},{unnamedControlCount:1},{supportedDocumentLanguage:false},{namedChoiceCandidateCount:1},{documentUrl:`${url}other`},{capturedAt:"2026-10-16T11:59:00.000Z"}]) {
    const result=projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:{privacyChoiceInspection:{...inspection,...patch}}}),source,url)!;
    assert.equal(result.choiceSurface,"unknown",JSON.stringify(patch));
    assert.deepEqual(californiaPrivacyReviewFindingIds(result),[]);
  }
  assert.equal(projectCaliforniaPrivacyReview(bundle(),{...source,verificationStatus:"unverified"},url),null);
  assert.equal(projectCaliforniaPrivacyReview(bundle({startedAt:undefined}),source,url),null);
});
test("only exact retained 404/410 destinations qualify; redirects, blocking and timeout stay neutral", () => {
  for (const code of [404,410]) {
    const result=projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:{privacyChoiceInspection:{...inspection,namedChoiceCandidateCount:1}},policySurfaceObservations:[{...surface,httpStatus:code}]}),source,url)!;
    assert.equal(result.choiceSurface,"observed");
    assert.deepEqual(californiaPrivacyReviewFindingIds(result),[CALIFORNIA_CHOICE_DESTINATION_ID]);
  }
  for (const patch of [{httpStatus:403},{httpStatus:500},{fetchFailureReason:"timeout"},{finalUrl:`${url}error`},{linkSourcePageUrl:`${url}other`}]) {
    assert.deepEqual(californiaPrivacyReviewFindingIds(projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:{privacyChoiceInspection:{...inspection,namedChoiceCandidateCount:1}},policySurfaceObservations:[{...surface,...patch}]}),source,url)),[]);
  }
});
test("only verified exact named California notice and rights-information destination errors project", () => {
  const base = {...surface, observationId:"notice", surfaceType:"notice_at_collection", url:`${url}notice`, finalUrl:`${url}notice`, linkText:"Notice at Collection"};
  const rights = {...base, observationId:"rights", surfaceType:"california_notice", linkText:"State Privacy Rights"};
  const result=projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:undefined,policySurfaceObservations:[base, rights]}),source,url)!;
  assert.deepEqual(californiaPrivacyReviewFindingIds(result),[CALIFORNIA_NOTICE_DESTINATION_ID,CALIFORNIA_RIGHTS_DESTINATION_ID]);
  const parent=deriveConsentControlAssessment({scan:{scanId:"scan-fixture",finalUrl:url}});parent.californiaPrivacyReview=result;
  const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent}});
  assert.deepEqual(new Set(projectCaliforniaRegulatoryPriorities(packets).map(row=>row.id)),new Set([CALIFORNIA_NOTICE_DESTINATION_ID,CALIFORNIA_RIGHTS_DESTINATION_ID]));
  for (const patch of [{httpStatus:403},{fetchFailureReason:"timeout"},{finalUrl:`${url}redirect`},{linkSourcePageUrl:`${url}other`},{linkVisibility:"hidden"},{accessibleNameSource:"none"},{linkText:"Privacy"},{discoveryMethod:"guessed_common_path"},{directlyLinkedFromScannedPage:false}]) {
    const limited=projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:undefined,policySurfaceObservations:[{...base,...patch}]}),source,url)!;
    assert.deepEqual(californiaPrivacyReviewFindingIds(limited),[],JSON.stringify(patch));
  }
});
test("California request-route labels are exact positive evidence, never a negative finding", () => {
  assert.equal(classifyCaliforniaRightsMethod("Submit a Privacy Request"),true);
  assert.equal(classifyCaliforniaRightsMethod("Request to Delete My Personal Information"),true);
  assert.equal(classifyCaliforniaRightsMethod("Privacy"),false);
  const result=projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:{privacyChoiceInspection:{...inspection,rightsMethods:[{label:"Submit a Privacy Request",destinationUrl:`${url}request`,accessibleNameSource:"text"}]}}}),source,url)!;
  assert.equal(result.inspection?.rightsMethods?.length,1);
  assert.deepEqual(californiaPrivacyReviewFindingIds(result),[CALIFORNIA_CHOICE_ABSENCE_ID]);
});
test("canonical persisted consent child -> concern policy -> unified -> California score", () => {
  const child=projectCaliforniaPrivacyReview(bundle(),source,url)!;
  const parent=deriveConsentControlAssessment({scan:{scanId:"scan-fixture",finalUrl:url}});
  parent.californiaPrivacyReview=child;
  assert.ok(consentControlAssessmentSchema.safeParse(parent).success);
  const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent}});
  assert.deepEqual(projectCaliforniaRegulatoryPriorities(packets).map(row=>row.id),[CALIFORNIA_CHOICE_ABSENCE_ID]);
  const score = deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:packets});
  assert.equal(score.score,94);
  assert.equal(score.policyVersion,"california-regulatory-posture.v1");
  assert.equal(score.coverage,"bounded");
  assert.equal(packets.find(row=>row.unifiedFindingId===CALIFORNIA_CHOICE_ABSENCE_ID)?.scoreEffects?.[0]?.appliesTo,"california_posture");
  assert.ok(packets.every(row=>!(row.scoreEffects??[]).some(effect=>effect.appliesTo==="certscore_overall")));
  for (const patch of [{scan:{...parent.scan,scanId:"other"}},{artifactVersion:"2.1"},{scan:{...parent.scan,noGo:true}}]) {
    assert.equal(consentControlAssessmentSchema.safeParse({...parent,...patch}).success,false);
    const failed=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:{...parent,...patch}}});
    assert.deepEqual(projectCaliforniaRegulatoryPriorities(failed),[]);
  }
  const shortcut=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{californiaPrivacyReview:child}});
  assert.deepEqual(projectCaliforniaRegulatoryPriorities(shortcut),[]);
});
test("California score fails closed on missing coverage and binds deductions to the verified assessment", () => {
  const limited = projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:undefined}),source,url)!;
  assert.equal(deriveCaliforniaRegulatoryScore({assessment:limited,checklistRows:[],unifiedFindings:[]}).score,null);
  assert.equal(deriveCaliforniaRegulatoryScore({assessment:null,checklistRows:[],unifiedFindings:[]}).score,null);
  const unresolved = projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:{privacyChoiceInspection:{...inspection,namedChoiceCandidateCount:1}}}),source,url)!;
  assert.equal(deriveCaliforniaRegulatoryScore({assessment:unresolved,checklistRows:[],unifiedFindings:[]}).score,null);
  const observedChoice = projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:{privacyChoiceInspection:{...inspection,namedChoiceCandidateCount:1}},
    policySurfaceObservations:[{...surface,status:"completed",documentFetchState:"fetched",fetchFailureReason:null,httpStatus:200}]}),source,url)!;
  assert.equal(observedChoice.choiceSurface,"observed");
  assert.equal(deriveCaliforniaRegulatoryScore({assessment:observedChoice,checklistRows:[],unifiedFindings:[]}).score,100);
  const complete = projectCaliforniaPrivacyReview(bundle(),source,url)!;
  assert.equal(deriveCaliforniaRegulatoryScore({assessment:complete,checklistRows:[],unifiedFindings:[]}).score,null);
  const parent=deriveConsentControlAssessment({scan:{scanId:"scan-fixture",finalUrl:url}});parent.californiaPrivacyReview=complete;
  const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent}});
  assert.equal(deriveCaliforniaRegulatoryScore({assessment:{...complete,sourceHash:"c".repeat(64)},checklistRows:[],unifiedFindings:packets}).score,null);
  assert.equal(deriveCaliforniaRegulatoryScore({assessment:complete,checklistRows:[],unifiedFindings:packets}).score,94);
  const sharedNotice = {id:"privacy_notice_availability",assessmentStatus:"gap_observed",evidenceState:"not_observed"} as any;
  assert.equal(deriveCaliforniaRegulatoryScore({assessment:complete,checklistRows:[sharedNotice],unifiedFindings:packets}).score,84);
  assert.equal(deriveCaliforniaRegulatoryScore({assessment:complete,checklistRows:[{...sharedNotice,assessmentStatus:"needs_evidence"}],unifiedFindings:packets}).score,94);
});

import { createHash } from "node:crypto";
import { saleSharingOptOutEvidenceSchema, CALIFORNIA_OPT_OUT_ACTIVITY_ID } from "@certscore/contracts";
function optOutEvidence() {
  return saleSharingOptOutEvidenceSchema.parse({contractVersion:"certscore.sale-sharing-opt-out-evidence.v1",policyVersion:"bounded_sale_sharing_opt_out.v1",scanId:"scan-fixture",parentDispatchSha256:"a".repeat(64),targetUrl:url,documentToken:"action-doc",
    startedAt:"2026-10-16T12:00:00.000Z",completedAt:"2026-10-16T12:00:01.500Z",status:"complete",recipeVersion:"onetrust.explicit_sale_share.v1",provider:"OneTrust",actionCount:2,submitted:true,registration:"confirmed",confirmedAt:"2026-10-16T12:00:00.500Z",before:{sectionId:8,sale:2,sharing:2},after:{sectionId:8,sale:1,sharing:1},observationWindowMs:500,captureComplete:true,truncated:false,requests:[{hostname:"ads.example.test",vendor:"Fixture Ads",purpose:"advertising",httpStatus:204,msAfterConfirmation:300}],limitations:[]});
}
function verifiedOptOut(evidence:ReturnType<typeof optOutEvidence>) {
  const bytes=Buffer.from(JSON.stringify(evidence));return {evidence,sha256:createHash("sha256").update(bytes).digest("hex"),sizeBytes:bytes.byteLength,verificationStatus:"verified"};
}
test("redirected opt-out retains original scan identity through canonical projection without new score rules",()=>{
  const original="https://example.com/",final="https://www.example.com/";
  const observation=saleSharingOptOutEvidenceSchema.parse({...optOutEvidence(),contractVersion:"certscore.sale-sharing-opt-out-evidence.v2",policyVersion:"bounded_sale_sharing_opt_out.v2-apex-www",targetUrl:original,
    redirectAuthorization:{version:"sale_sharing_apex_www.v1",alternateTargetUrl:final},actionTargetUrl:final,tlsValidated:true,
    redirectProof:{version:"sale_sharing_redirect_proof.v1",fromUrl:original,toUrl:final,status:301,sourceRequestId:"first",targetRequestId:"second",tlsValidated:true}});
  const base=bundle({url:original,normalizedUrl:original,policySurfaceInspection:undefined,domSnapshots:[{url:original,documentIdentity:{source:"cdp_loader_id",token:"doc-1"}},{url:final,documentIdentity:{source:"cdp_loader_id",token:"doc-final"}}]});
  for(const documentUrl of [original,final]){
    const projected=projectCaliforniaPrivacyReview({...base,saleSharingOptOut:verifiedOptOut(observation)} as CanonicalEvidenceBundle,source,documentUrl)!;
    assert.equal(projected.optOutEffectiveness,"bounded_observation");assert.equal(projected.optOutObservation?.evidence.targetUrl,original);assert.equal(projected.optOutObservation?.evidence.actionTargetUrl,final);
    const parent=deriveConsentControlAssessment({scan:{scanId:"scan-fixture",finalUrl:documentUrl}});parent.californiaPrivacyReview=projected;
    const findings=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent}});
    assert.ok(findings.some(row=>row.unifiedFindingId===CALIFORNIA_OPT_OUT_ACTIVITY_ID));
    assert.equal(deriveCaliforniaRegulatoryScore({assessment:projected,checklistRows:[],unifiedFindings:findings}).score,82,"existing policy weights unchanged");
    const json=JSON.parse(JSON.stringify(parent));assert.ok(consentControlAssessmentSchema.safeParse(json).success);
  }
  const invalid=[verifiedOptOut({...observation,redirectProof:null}),verifiedOptOut({...observation,tlsValidated:false}),verifiedOptOut({...observation,scanId:"another"}),{...verifiedOptOut(observation),sha256:"0".repeat(64)}];
  for(const packet of invalid){const result=projectCaliforniaPrivacyReview({...base,saleSharingOptOut:packet} as CanonicalEvidenceBundle,source,original)!;assert.equal(result.optOutObservation,undefined);assert.deepEqual(californiaPrivacyReviewFindingIds(result),[]);}
  const otherScan=projectCaliforniaPrivacyReview({...base,normalizedUrl:final,saleSharingOptOut:verifiedOptOut(observation)} as CanonicalEvidenceBundle,source,final)!;
  assert.equal(otherScan.optOutObservation,undefined,"final URL cannot substitute for original dispatch identity");
});
test("verified opt-out bytes project only through the persisted assessment; tampering cannot create activity findings",()=>{
  const observation=optOutEvidence();const evidence=verifiedOptOut(observation);
  const input=bundle({policySurfaceInspection:undefined,saleSharingOptOut:evidence});
  const projection=projectCaliforniaPrivacyReview(input,source,url)!;
  assert.equal(projection.optOutEffectiveness,"bounded_observation");
  const parent=deriveConsentControlAssessment({scan:{scanId:"scan-fixture",finalUrl:url}});parent.californiaPrivacyReview=projection;
  const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent}});
  assert.deepEqual(projectCaliforniaRegulatoryPriorities(packets).map(row=>row.id),[CALIFORNIA_OPT_OUT_ACTIVITY_ID]);
  const score = deriveCaliforniaRegulatoryScore({assessment:projection,checklistRows:[],unifiedFindings:packets});
  assert.equal(score.score,82);
  assert.equal(score.coverage,"limited");
  assert.ok(packets.every(row=>!(row.scoreEffects??[]).some(effect=>effect.appliesTo==="certscore_overall")));
  for(const bad of [{...evidence,sha256:"0".repeat(64)},{...evidence,sizeBytes:1},{...evidence,verificationStatus:"unverified"},verifiedOptOut({...observation,scanId:"other"}),verifiedOptOut({...observation,targetUrl:`${url}different`})]) {
    const limited=projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:undefined,saleSharingOptOut:bad}),source,url)!;
    assert.equal(limited.optOutEffectiveness,"not_assessed");assert.deepEqual(californiaPrivacyReviewFindingIds(limited),[]);
  }
  for(const patch of [{registration:"unconfirmed"},{before:{sectionId:8,sale:1,sharing:1}},{completedAt:observation.confirmedAt},{truncated:true},{documentToken:null}]) assert.equal(saleSharingOptOutEvidenceSchema.safeParse({...observation,...patch}).success,false);
  const noActivity=projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:undefined,saleSharingOptOut:verifiedOptOut({...observation,requests:[]})}),source,url)!;
  assert.equal(noActivity.optOutEffectiveness,"bounded_observation");assert.deepEqual(californiaPrivacyReviewFindingIds(noActivity),[]);
});

test("new CA vendor-only opt-out activity remains reportable review with no score effect",async()=>{
  const {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL}=await import("./california-review-coverage.fixture");
  for(const version of ["v9","v10"] as const){
    const f=californiaCoverageFixture();
    f.bundle.policySurfaceInspection!.californiaReviewPolicy=`california-privacy-review.${version}`;
    f.bundle.policySurfaceObservations.forEach(row=>{row.documentLanguage="en";});
    const e=optOutEvidence();e.scanId=f.bundle.scanId;e.targetUrl=CA_FIXTURE_URL;
    e.startedAt=e.startedAt.replace("10-16","10-17");e.completedAt=e.completedAt.replace("10-16","10-17");e.confirmedAt=e.confirmedAt!.replace("10-16","10-17");
    f.bundle.saleSharingOptOut=verifiedOptOut(e) as never;
    const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
    const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
    const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent}});
    const finding=packets.find(row=>row.unifiedFindingId === CALIFORNIA_OPT_OUT_ACTIVITY_ID)!;
    assert.equal(finding.presentationDecision.status,"surface");
    assert.equal(finding.scoreEffects?.length ?? 0,version === "v9"?1:0);
    const score=deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:packets});
    assert.equal(score.score,version === "v9"?82:100);
  }
});

test('verified linked-page opt-out control is positive retained evidence without a tested execution or inferred homepage absence',()=>{
 const packet={contractVersion:'certscore.cmp-preferences-evidence.v1',policyVersion:'bounded_cmp_preferences.v1',scanId:'scan-fixture',parentDispatchSha256:'a'.repeat(64),targetUrl:url,finalUrl:url+'settings',documentToken:'linked',
  startedAt:'2026-10-16T11:59:59.700Z',completedAt:'2026-10-16T12:00:01.500Z',status:'completed',
  support:{state:'partial',provider:null,recipeVersion:'bounded_cmp_preferences.v1',reason:'read_only_linked_privacy_preferences'},action:{count:0,intent:'options',label:null,opened:false},
  linkedPreferenceNavigation:{policyVersion:'read_only_linked_preferences.v1',sourceUrl:url,sourceDocumentToken:'parent',label:'Privacy Settings',destinationUrl:url+'settings',documentToken:'linked'},
  controls:[{label:'Do Not Sell or Share My Personal Information (Opt Out)',kind:'unclassified',enabled:true,checked:false}],controlInventoryComplete:false,privacyLinks:[],declarations:[],declarationInventoryComplete:false,limitations:[],
  checkpoints:{version:'cmp_partial_capture.v1',documentToken:'linked',privacyLinks:false,declarations:false,controls:true,controlsSurface:'preferences'},inspectionDiagnostic:{revision:'cmp_preferences.v17',budgetMs:6510,phase:'preference_inventory'}};
 const result=projectCaliforniaPrivacyReview(bundle({cmpPreferencesEvidence:packet}),source,url)!;
 assert.equal(result.choiceSurface,'observed');assert.equal(result.controls[0]?.kind,'do_not_sell_or_share');assert.match(result.controls[0]!.evidenceRef,/CmpPreferencesEvidencePacket/);
 assert.equal(result.optOutEffectiveness,'not_assessed');assert.equal(result.scoreEffect,'none');assert.deepEqual(californiaPrivacyReviewFindingIds(result),[]);
 for(const change of [{startedAt:'2026-10-16T11:59:54.000Z'},{scanId:'wrong'},{targetUrl:'https://other.test/'},{linkedPreferenceNavigation:{...packet.linkedPreferenceNavigation,destinationUrl:'https://external.test/settings'}}]){
  const limited=projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:undefined,cmpPreferencesEvidence:{...packet,...change}}),source,url)!;
  assert.equal(limited.choiceSurface,'unknown');assert.equal(limited.controls.length,0);
 }
});


import {exactRouteEvidenceFixture,exactRouteSources} from "../../../../packages/certscore-contracts/src/sale-sharing-exact-route.fixture";
test("all ten exact routes retain original identity, complete ancestry and canonical scoring through persistence",()=>{
  for(const original of exactRouteSources){
    const old=optOutEvidence(),observation=saleSharingOptOutEvidenceSchema.parse({...old,...exactRouteEvidenceFixture(original),scanId:old.scanId,startedAt:old.startedAt,confirmedAt:old.confirmedAt,completedAt:old.completedAt,requests:old.requests});
    const final=observation.actionTargetUrl!;
    const base=bundle({url:original,normalizedUrl:original,policySurfaceInspection:undefined,domSnapshots:[{url:original,documentIdentity:{source:"cdp_loader_id",token:"doc-1"}},{url:final,documentIdentity:{source:"cdp_loader_id",token:"doc-final"}}]});
    for(const documentUrl of [original,final]){
      const projected=projectCaliforniaPrivacyReview({...base,saleSharingOptOut:verifiedOptOut(observation)} as CanonicalEvidenceBundle,source,documentUrl)!;
      assert.equal(projected.optOutEffectiveness,"bounded_observation");assert.equal(projected.optOutObservation?.evidence.targetUrl,original);assert.equal(projected.optOutObservation?.evidence.actionTargetUrl,final);
      const parent=deriveConsentControlAssessment({scan:{scanId:"scan-fixture",finalUrl:documentUrl}});parent.californiaPrivacyReview=projected;
      const persisted=consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
      const findings=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:persisted}});
      assert.ok(findings.some(row=>row.unifiedFindingId===CALIFORNIA_OPT_OUT_ACTIVITY_ID));
      assert.equal(deriveCaliforniaRegulatoryScore({assessment:projected,checklistRows:[],unifiedFindings:findings}).score,82);
    }
    for(const packet of [verifiedOptOut({...observation,exactRouteProof:null}),verifiedOptOut({...observation,tlsValidated:false}),verifiedOptOut({...observation,scanId:"other"}),{...verifiedOptOut(observation),sha256:"0".repeat(64)}]){
      const projected=projectCaliforniaPrivacyReview({...base,saleSharingOptOut:packet} as CanonicalEvidenceBundle,source,original)!;
      assert.equal(projected.optOutObservation,undefined);assert.deepEqual(californiaPrivacyReviewFindingIds(projected),[]);
    }
    const wrongOriginal=projectCaliforniaPrivacyReview({...base,normalizedUrl:final,saleSharingOptOut:verifiedOptOut(observation)} as CanonicalEvidenceBundle,source,final)!;
    assert.equal(wrongOriginal.optOutObservation,undefined);
  }
});

test("presence-only link survives persistence, concern policy and unified reporting without effectiveness or score effects", () => {
  const input=bundle({policySurfaceInspection:undefined,policySurfaceObservations:[{...surface,documentFetchState:"not_attempted",status:"discovered",httpStatus:undefined,fetchFailureReason:undefined}]});
  const child=projectCaliforniaPrivacyReview(input,source,url)!;
  assert.equal(child.choicePresence?.version,"privacy_choice_presence.v2");
  assert.equal(child.optOutEffectiveness,"not_assessed");
  const parent=deriveConsentControlAssessment({scan:{scanId:input.scanId,finalUrl:url}});
  parent.californiaPrivacyReview=child;
  const persisted=consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
  const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:persisted}});
  const finding=packets.find(row=>row.unifiedFindingId==="targeted_advertising_choices_present");
  assert.ok(finding); assert.equal(finding.title,"Sale/sharing opt-out link observed");
  assert.doesNotMatch(finding.summary,/effectiveness/i);
  assert.equal(finding.details?.family,"california_privacy_review");
  assert.deepEqual(finding.scoreEffects??[],[]);
  assert.equal(finding.presentationDecision.status,"audit_only");
  assert.equal(finding.surfacingDecision.reportLane,"confidence_and_coverage");
  assert.equal(finding.surfacingDecision.reportable,true);
});

test("presence-only claims reject ambiguous, hidden, unbound, secondary and no-go link evidence", () => {
  for (const patch of [{linkSourcePageUrl:undefined},{linkSourcePageUrl:`${url}?other=1`},{linkVisibility:"hidden"},
    {accessibleNameSource:"none"},{discoveryMethod:"guessed_common_path"},{parentObservationId:"secondary"},
    {directlyLinkedFromScannedPage:false},{clickable:false},{linkText:"Cookie Settings",surfaceType:"cookie_settings"}]) {
    const child=projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:undefined,policySurfaceObservations:[{...surface,...patch}]}),source,url)!;
    const parent=deriveConsentControlAssessment({scan:{scanId:"scan-fixture",finalUrl:url}});parent.californiaPrivacyReview=child;
    const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent}});
    assert.ok(!packets.some(row=>row.unifiedFindingId==="targeted_advertising_choices_present"),JSON.stringify(patch));
  }
  assert.equal(projectCaliforniaPrivacyReview(bundle({policySurfaceObservations:[surface],scanNoGoAssessment:{decision:"no_go"}}),source,url)?.choicePresence,undefined);
  assert.equal(projectCaliforniaPrivacyReview(bundle({policySurfaceObservations:[surface]}),{...source,verificationStatus:"unverified"},url),null);
  const child=projectCaliforniaPrivacyReview(bundle({policySurfaceObservations:[surface]}),source,url)!;
  const parent=deriveConsentControlAssessment({scan:{scanId:"scan-fixture",finalUrl:url}});parent.californiaPrivacyReview=child;
  child.choicePresence!.links[0]!.sourceDocumentUrl=`${url}?mismatch=1`;
  assert.equal(consentControlAssessmentSchema.safeParse(parent).success,false);
});

test("presence metadata is bounded and optional; historical controls alone cannot become a new positive claim", () => {
  const input=bundle({policySurfaceInspection:undefined,policySurfaceObservations:[surface]});
  const child=projectCaliforniaPrivacyReview(input,source,url)!;
  const parent=deriveConsentControlAssessment({scan:{scanId:input.scanId,finalUrl:url}});parent.californiaPrivacyReview=child;
  delete child.choicePresence;
  const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent}});
  assert.ok(!packets.some(row=>row.unifiedFindingId==="targeted_advertising_choices_present"));
  // A long but valid page identity cannot make optional presence metadata discard
  // the rest of the canonical California assessment.
  const longUrl=url+"?q="+"a".repeat(700);
  const large=projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:undefined,policySurfaceObservations:Array.from({length:12},(_,i)=>({
    ...surface,observationId:`dns-${i}`,url:`${url}choices/${i}`,linkSourcePageUrl:longUrl,
  }))}),source,longUrl)!;
  assert.ok(large);assert.equal(large.controls.length,12);
  assert.ok(large.choicePresence!.links.length<12);
  assert.ok(Buffer.byteLength(JSON.stringify(large.choicePresence))<=8192);
});

test("canonical presence copy survives merging with a legacy positive source and retains a broken-destination finding", () => {
  const child=projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:undefined,policySurfaceObservations:[surface]}),source,url)!;
  const parent=deriveConsentControlAssessment({scan:{scanId:"scan-fixture",finalUrl:url}});parent.californiaPrivacyReview=child;
  const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[{sourceType:"signal",signalSource:"snapshot_signal",
    signalKey:"privacy.do_not_sell_link_present",title:"Targeted advertising choices present",description:"Legacy choice path",severity:"low",
    observedValue:"Legacy choice path",fallbackEvidence:{pageUrl:url,signalValue:true}}],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent}});
  const presence=packets.find(row=>row.unifiedFindingId==="targeted_advertising_choices_present")!;
  assert.equal(presence.title,"Sale/sharing opt-out link observed");
  assert.doesNotMatch(presence.summary,/effectiveness/i);
  assert.equal(presence.surfacingDecision.reportLane,"confidence_and_coverage");
  assert.deepEqual(presence.scoreEffects??[],[]);
  assert.ok(packets.some(row=>row.unifiedFindingId===CALIFORNIA_CHOICE_DESTINATION_ID));
});


test("California snapshot uses canonical observed, complete not-observed, or unknown evidence", async () => {
  const {projectCaliforniaChoicePresence} = await import("../../lib/scans/california-choice-presence");
  const packetsFor = (input: CanonicalEvidenceBundle) => {
    const parent = deriveConsentControlAssessment({scan:{scanId:input.scanId,finalUrl:url}});
    parent.californiaPrivacyReview = projectCaliforniaPrivacyReview(input,source,url)!;
    return buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent}});
  };
  const positive = packetsFor(bundle({policySurfaceInspection:undefined,policySurfaceObservations:[{
    ...surface,documentFetchState:"not_attempted",status:"discovered",httpStatus:undefined,fetchFailureReason:undefined,
  }]}));
  const observed = projectCaliforniaChoicePresence(positive,"scan-fixture",url);
  assert.equal(observed?.title,"Sale/sharing opt-out link observed");
  assert.equal(observed?.state,"observed");
  assert.deepEqual(observed?.labels,[surface.linkText]);
  const negative = packetsFor(bundle());
  assert.equal(projectCaliforniaChoicePresence(negative,"scan-fixture",url)?.title,"Sale/sharing opt-out link not observed");
  assert.equal(projectCaliforniaChoicePresence(negative,"scan-fixture",url)?.state,"not_observed");
  // Existing absence findings remain separately reportable; the snapshot creates no score effect.
  assert.equal(negative.find(row=>row.unifiedFindingId===CALIFORNIA_CHOICE_ABSENCE_ID)?.presentationDecision.status,"surface");
  for (const input of [bundle({policySurfaceInspection:undefined}),bundle({policySurfaceInspection:{privacyChoiceInspection:{...inspection,coverage:"limited"}}}),bundle({policySurfaceInspection:undefined,policySurfaceObservations:[{...surface,surfaceType:"privacy_choices",linkText:"Your Privacy Choices",documentFetchState:"not_attempted",status:"discovered",httpStatus:undefined,fetchFailureReason:undefined}]})]) {
    assert.equal(projectCaliforniaChoicePresence(packetsFor(input),"scan-fixture",url),null);
  }
  for (const packets of [positive,negative]) {
    assert.equal(projectCaliforniaChoicePresence(packets,"wrong-scan",url),null);
    assert.equal(projectCaliforniaChoicePresence(packets,"scan-fixture",url+"other"),null);
    const suppressed=structuredClone(packets);
    suppressed.forEach(row=>{row.surfacingDecision.reportable=false;});
    assert.equal(projectCaliforniaChoicePresence(suppressed,"scan-fixture",url),null);
    const unbound=structuredClone(packets);
    unbound.forEach(row=>{row.sourceRefs=[];});
    assert.equal(projectCaliforniaChoicePresence(unbound,"scan-fixture",url),null);
  }
  // An observed link with a broken destination still belongs in the snapshot.
  const broken = packetsFor(bundle({policySurfaceInspection:undefined,policySurfaceObservations:[surface]}));
  assert.equal(projectCaliforniaChoicePresence(broken,"scan-fixture",url)?.state,"observed");
  assert.ok(broken.some(row=>row.unifiedFindingId===CALIFORNIA_CHOICE_DESTINATION_ID && row.surfacingDecision.reportable));
});

for (const withIdentity of [false, true]) test(`bounded choice diagnostics persist without changing absence, presence, findings or score (identity=${withIdentity})`, () => {
  const v5 = { ...inspection, contractVersion: "certscore.privacy-choice-inspection.v5",
    hiddenUnnamedControlCount: 0, frameCount: 1, inspectedSameOriginFrameCount: 0, hiddenUninspectedFrameCount: 1,
    inaccessibleFrameCount: 0, unreadyFrameCount: 0, unprojectableFrameCount: 0, frameBudgetLimitedCount: 0,
    namedFrameChoiceCandidateCount: 0, frameInspectionWorkMs: 0, frameProofWorkMs: 0,
    coverage: "limited", uninspectedFrameCount: 1, unnamedControlCount: 1,
    homepageAccessPolicy: "representative_homepage.v1", readinessPolicy: "document_bound_dom_inventory.v1",
    documentReadyState: "complete", limitationKeys: ["unnamed_controls", "frame_inventory_incomplete"] };
  const diagnostics = {version: "privacy_choice_diagnostics.v1", inspectionSourceHash: inspection.sourceHash,
    firstDocumentHash: "c".repeat(64), secondDocumentHash: "c".repeat(64), identityBasis: "document_and_structural_locator_only",
    status: "captured", limitations: [], unnamedControls: [],
    frames: withIdentity ? [{first: {locatorHash: "d".repeat(64), frameDocumentHash: "e".repeat(64), reason: "display_none", depth: 0, locatorLimited: false},
      second: {locatorHash: "d".repeat(64), frameDocumentHash: "e".repeat(64), reason: "display_none", depth: 0, locatorLimited: false}}] : [],
    ...(withIdentity ? {checkpointIdentity: {version: "privacy_frame_checkpoint_identity.v1", scope: "sampled_frame_checkpoint_identity_only",
      identityBasis: "dom_reference_equality", status: "matched", parentDocument: "same",
      frames: [{slot: 0, node: "same", document: "same"}], limitations: []}} : {})};
  const project = (proof: typeof v5) => projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:{privacyChoiceInspection:proof}}),source,url)!;
  const baseline = project(v5), diagnostic = project({...v5, diagnostics} as typeof v5);
  assert.equal(diagnostic.inspection?.coverage, "limited");
  assert.deepEqual(californiaPrivacyReviewFindingIds(diagnostic), californiaPrivacyReviewFindingIds(baseline));
  assert.deepEqual(californiaPrivacyReviewFindingIds(diagnostic), []);
  const parent = deriveConsentControlAssessment({scan:{scanId:"scan-fixture", finalUrl:url}});
  parent.californiaPrivacyReview = diagnostic;
  const persisted = consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
  const retained = persisted.californiaPrivacyReview?.inspection;
  assert.equal(retained?.contractVersion, "certscore.privacy-choice-inspection.v5");
  if (retained?.contractVersion !== "certscore.privacy-choice-inspection.v5") assert.fail("Expected v5");
  assert.deepEqual(retained.diagnostics, diagnostics);
  const packets = buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:persisted}});
  assert.deepEqual(projectCaliforniaRegulatoryPriorities(packets), []);
  assert.deepEqual(deriveCaliforniaRegulatoryScore({assessment:diagnostic,checklistRows:[],unifiedFindings:packets}), deriveCaliforniaRegulatoryScore({assessment:baseline,checklistRows:[],unifiedFindings:packets}));
});

for (const label of ["Your Privacy Choices", "Your privacy choices", "Your Privacy Choices ↗"]) {
  test(`alternative choice presence: ${label} survives canonical projection without a score effect`, () => {
    const input=bundle({policySurfaceInspection:undefined,policySurfaceObservations:[{...surface,
      linkText:label,surfaceType:"your_privacy_choices",documentFetchState:"not_attempted",status:"discovered",
      httpStatus:undefined,fetchFailureReason:undefined}]});
    const review=projectCaliforniaPrivacyReview(input,source,url)!;
    const parent=deriveConsentControlAssessment({scan:{scanId:input.scanId,finalUrl:url}});
    parent.californiaPrivacyReview=review;
    const project=(assessment:unknown)=>buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],
      validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:consentControlAssessmentSchema.parse(assessment)}});
    const packets=project(JSON.parse(JSON.stringify(parent)));
    const presence=packets.find(row=>row.unifiedFindingId==="targeted_advertising_choices_present")!;
    assert.ok(presence); assert.equal(presence.title,"Privacy choices link observed");
    assert.deepEqual(presence.scoreEffects??[],[]);
    assert.equal(projectCaliforniaChoicePresence(packets,input.scanId,url)?.state,"observed");
    assert.equal(projectCaliforniaChoicePresence(packets,input.scanId,url)?.title,"Privacy choices link observed");
    assert.equal(review.optOutEffectiveness,"not_assessed");
    assert.deepEqual(deriveCaliforniaRegulatoryScore({assessment:review,checklistRows:[],unifiedFindings:packets}).deductions,[]);
    // Historical v1 explicitly excluded alternative labels. Parsing/replaying
    // that packet must not upgrade it to v2 or invent a presence finding.
    parent.californiaPrivacyReview!.choicePresence!.version="privacy_choice_presence.v1";
    assert.equal(project(parent).some(row=>row.unifiedFindingId==="targeted_advertising_choices_present"),false);
  });
}

test("positive choice provenance preserves query and fragment; sanitized historical sources remain unbound", () => {
  const exactUrl=url+"?redirect=%2F#home";
  const project=(sourceUrl:string)=>{
    const review=projectCaliforniaPrivacyReview(bundle({policySurfaceInspection:undefined,policySurfaceObservations:[{
      ...surface,linkSourcePageUrl:sourceUrl,documentFetchState:"not_attempted",status:"discovered",httpStatus:undefined,
      fetchFailureReason:undefined,
    }]}),source,exactUrl)!;
    const parent=deriveConsentControlAssessment({scan:{scanId:"scan-fixture",finalUrl:exactUrl}});parent.californiaPrivacyReview=review;
    const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),
      runtimeArtifacts:{consentControlAssessment:consentControlAssessmentSchema.parse(parent)}});
    return projectCaliforniaChoicePresence(packets,"scan-fixture",exactUrl);
  };
  assert.equal(project(exactUrl)?.state,"observed");
  assert.equal(project(url),null);
  assert.equal(project(url+"?redirect=%2Fother#home"),null);
});
