import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {deriveConsentControlAssessment,saleSharingOptOutEvidenceSchema,californiaPrivacyReviewFindingIds,CALIFORNIA_OPT_OUT_ACTIVITY_ID} from "@certscore/contracts";
import {projectCaliforniaPrivacyReview} from "./california-privacy-review-projection";
import {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL} from "./california-review-coverage.fixture";
import {buildUnifiedFindingDisplayPackets} from "../../lib/scans/unified-findings";

// Diagnostic checkpoints must neither create activity nor change its treatment.
test("new opt-out diagnostics survive verified persistence and preserve canonical finding policy",()=>{
  for(const activity of [false,true]){
    const f=californiaCoverageFixture();
    f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";
    f.bundle.policySurfaceObservations.forEach(row=>{row.documentLanguage="en";});
    const observation=saleSharingOptOutEvidenceSchema.parse({contractVersion:"certscore.sale-sharing-opt-out-evidence.v1",policyVersion:"bounded_sale_sharing_opt_out.v1",scanId:f.bundle.scanId,parentDispatchSha256:"a".repeat(64),targetUrl:CA_FIXTURE_URL,documentToken:"doc",startedAt:f.bundle.startedAt,completedAt:new Date(Date.parse(f.bundle.startedAt)+2000).toISOString(),confirmedAt:new Date(Date.parse(f.bundle.startedAt)+1000).toISOString(),status:"complete",recipeVersion:"onetrust.explicit_sale_share.v2",provider:"OneTrust",actionCount:2,submitted:true,registration:"confirmed",before:{sectionId:8,sale:2,sharing:2},after:{sectionId:8,sale:1,sharing:1},observationWindowMs:500,captureComplete:true,truncated:false,requests:activity?[{hostname:"ads.example.test",vendor:"Fixture Ads",purpose:"advertising",httpStatus:204,msAfterConfirmation:300}]:[],limitations:[],executionDiagnostics:{version:"sale_sharing_execution_diagnostics.v1",milestones:[{stage:"usable_document",elapsedMs:100},{stage:"recipe_selected",elapsedMs:200},{stage:"control_actionable",elapsedMs:300},{stage:"submitted",elapsedMs:900},{stage:"confirmed",elapsedMs:1000},{stage:"observation_completed",elapsedMs:1800}],decisionReads:[{phase:"before",status:"observed",elapsedMs:10},{phase:"after",status:"observed",elapsedMs:10},{phase:"terminal",status:"observed",elapsedMs:10}]}});
    observation.executionDiagnostics!.navigation={version:"sale_sharing_navigation.v1",responseStatus:200,targetState:"exact",readiness:"parsed_recipe",blockedNavigation:"none",failure:"none"};
    const bytes=Buffer.from(JSON.stringify(observation));
    f.bundle.saleSharingOptOut={evidence:observation,sha256:createHash("sha256").update(bytes).digest("hex"),sizeBytes:bytes.length,verificationStatus:"verified"};
    const child=projectCaliforniaPrivacyReview(JSON.parse(JSON.stringify(f.bundle)),CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
    assert.deepEqual(child.optOutObservation?.evidence.executionDiagnostics,observation.executionDiagnostics);
    assert.equal(californiaPrivacyReviewFindingIds(child).includes(CALIFORNIA_OPT_OUT_ACTIVITY_ID),activity);
    const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
    const findings=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:JSON.parse(JSON.stringify(parent))}});
    const finding=findings.find(f=>f.unifiedFindingId===CALIFORNIA_OPT_OUT_ACTIVITY_ID);
    assert.equal(Boolean(finding),activity);assert.equal(finding?.scoreEffects?.length??0,0);
    f.bundle.saleSharingOptOut.evidence.executionDiagnostics!.milestones[0]!.elapsedMs++;
    const tampered=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
    assert.equal(tampered.optOutObservation,undefined);
  }
});
