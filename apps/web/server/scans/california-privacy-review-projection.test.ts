import assert from "node:assert/strict";
import test from "node:test";
import { californiaPrivacyReviewFindingIds, classifyCaliforniaRightsMethod, consentControlAssessmentSchema, deriveConsentControlAssessment, CALIFORNIA_CHOICE_ABSENCE_ID, CALIFORNIA_CHOICE_DESTINATION_ID, CALIFORNIA_NOTICE_DESTINATION_ID, CALIFORNIA_RIGHTS_DESTINATION_ID, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { projectCaliforniaPrivacyReview } from "./california-privacy-review-projection";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { projectCaliforniaRegulatoryPriorities } from "../../lib/scans/california-regulatory-priorities";
import { deriveCaliforniaRegulatoryScore, CALIFORNIA_REGULATORY_SCORE_VERSION } from "../../lib/scans/california-regulatory-score";

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
  assert.equal(score.policyVersion,CALIFORNIA_REGULATORY_SCORE_VERSION);
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
