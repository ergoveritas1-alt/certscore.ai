import assert from "node:assert/strict";
import test from "node:test";
import { californiaPrivacyReviewSchema, consentControlAssessmentSchema, deriveConsentControlAssessment, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { californiaCoverageFixture, CA_FIXTURE_SOURCE, CA_FIXTURE_URL } from "./california-review-coverage.fixture";
import { projectCaliforniaObservedScoreBasis } from "./california-observed-score-basis";
import { projectCaliforniaPrivacyReview } from "./california-privacy-review-projection";
import { deriveCaliforniaRegulatoryScore } from "../../lib/scans/california-regulatory-score";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { buildApiV2PostureScores } from "../../lib/api-v2/posture-scores";

function fixture() {
  const f=californiaCoverageFixture();
  f.bundle.policySurfaceInspection={californiaReviewPolicy:"california-privacy-review.v10"} as CanonicalEvidenceBundle["policySurfaceInspection"];
  f.bundle.policySurfaceObservations=[];
  f.bundle.runtimeMetadataSnapshots=[{artifactId:"runtime-dom",path:"/retained/runtime-dom.txt",url:CA_FIXTURE_URL,capturedAtMs:500,
    documentIdentity:{source:"cdp_loader_id",token:"runtime-loader"},textExcerpt:"Usable starting page",pagePhase:"network_idle",consentStateAtTime:"pre_consent"}];
  f.bundle.scanLaneRuns=[{laneId:"runtime_evidence",executionOutcome:"success",accessOutcome:"representative_page",challengeDetected:false}] as CanonicalEvidenceBundle["scanLaneRuns"];
  f.policyEvidence.projection.documents=[];f.policyEvidence.texts=[];
  return f;
}

test("every usable report has a California score independently of policy, choices, region or eligible findings",()=>{
  for(const region of ["california","eu_de","eu_ie"] as const) {
    const f=fixture();f.bundle.region=region;
    const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
    assert.ok(child?.contractVersion==="certscore.california-privacy-review.v10");
    assert.equal(child.observedScoreBasis?.policyVersion,"usable_starting_page_score.v1");
    assert.equal(child.reviewCoverage.scoreReady,false);
    assert.equal(child.reviewCoverage.captureCoverage.policyTextComplete,false);
    assert.equal(child.choiceSurface,"unknown");
    const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});
    parent.californiaPrivacyReview=child;
    const persisted=consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
    const findings=buildUnifiedFindingDisplayPackets({runtimeArtifacts:{consentControlAssessment:persisted},reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
    const score=deriveCaliforniaRegulatoryScore({assessment:persisted.californiaPrivacyReview,checklistRows:[],unifiedFindings:findings});
    assert.equal(score.policyVersion,"california-regulatory-posture.v12-observed");
    assert.equal(score.score,100);assert.equal(score.coverage,"limited");assert.deepEqual(score.deductions,[]);
    assert.equal(findings.length,0,"Score availability cannot manufacture findings or passes");
    assert.equal(buildApiV2PostureScores({score:93,californiaScore:score}).ccpaCpra.score,100);
    const historical=structuredClone(child);delete historical.observedScoreBasis;
    assert.equal(deriveCaliforniaRegulatoryScore({assessment:historical,checklistRows:[],unifiedFindings:[]}).score,null);
    assert.equal(deriveCaliforniaRegulatoryScore({assessment:historical,checklistRows:[],unifiedFindings:[]}).policyVersion,"california-regulatory-posture.v11-wcag");
    for(const patch of [{scanId:"different"},{documentUrl:"https://other.test/"},{sourceHash:"b".repeat(64)}])
      assert.equal(californiaPrivacyReviewSchema.safeParse({...child,observedScoreBasis:{...child.observedScoreBasis,...patch}}).success,false);
  }
});

test("score availability requires the original usable runtime visit; failed, blocked, stale and missing proof stay neutral",()=>{
 const f=fixture();
 assert.ok(projectCaliforniaObservedScoreBasis(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL));
 const changes:Array<(b:CanonicalEvidenceBundle)=>void>=[
   b=>{b.runtimeMetadataSnapshots=[];},
   b=>{b.runtimeMetadataSnapshots![0]!.documentIdentity=undefined;},
   b=>{b.runtimeMetadataSnapshots![0]!.url="https://different.test/";},
   b=>{b.scanLaneRuns![0]!.executionOutcome="failed";},
   b=>{b.scanLaneRuns![0]!.accessOutcome="bot_challenge";},
   b=>{b.scanLaneRuns![0]!.challengeDetected=true;},
   b=>{b.scanLaneRuns=[];},
   b=>{b.runtimeCoverage!.coverageStatus="limited_none";},
   b=>{b.scanNoGoAssessment={decision:"no_go"} as CanonicalEvidenceBundle["scanNoGoAssessment"];},
   b=>{b.scan_no_go_assessment={decision:"no_go"} as CanonicalEvidenceBundle["scanNoGoAssessment"];},
 ];
 for(const change of changes){const b=structuredClone(f.bundle);change(b);assert.equal(projectCaliforniaObservedScoreBasis(b,CA_FIXTURE_SOURCE,CA_FIXTURE_URL),undefined);}
 assert.equal(projectCaliforniaObservedScoreBasis(f.bundle,{...CA_FIXTURE_SOURCE,verificationStatus:"unverified"},CA_FIXTURE_URL),undefined);
 assert.equal(projectCaliforniaObservedScoreBasis(f.bundle,{...CA_FIXTURE_SOURCE,sha256:"invalid"},CA_FIXTURE_URL),undefined);
});
