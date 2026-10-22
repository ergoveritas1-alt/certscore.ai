import assert from "node:assert/strict";
import test from "node:test";
import { deriveConsentControlAssessment } from "@certscore/contracts";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { californiaCoverageFixture, CA_FIXTURE_SOURCE, CA_FIXTURE_URL } from "../scans/california-review-coverage.fixture";
import { projectCaliforniaPrivacyReview } from "../scans/california-privacy-review-projection";
import { SCAN_REPORT_PROJECTION_VERSION } from "../scans/scan-report-projection-contract";
import { projectAdminCaliforniaScore } from "./admin-scan-posture-score";

function snapshot() {
  const f=californiaCoverageFixture("California Privacy Notice. Categories of personal information include identifiers. We use personal information to provide requested services. We retain personal information for six months.");
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";
  f.bundle.policySurfaceObservations.forEach(row=>{row.documentLanguage="en";});
  const assessment=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
  const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});
  parent.californiaPrivacyReview=assessment;
  const findings=buildUnifiedFindingDisplayPackets({runtimeArtifacts:{consentControlAssessment:parent},reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
  return {report_projection_status:"ready",report_projection_version:SCAN_REPORT_PROJECTION_VERSION,report_projection_computed_at:f.bundle.completedAt,
    admin_canonical_score_input:{scanId:f.bundle.scanId,projectionScanId:f.bundle.scanId,assessment,unifiedFindings:findings,checklistRows:[]}};
}

test("Admin Scans reads the published typed assessment and unified findings through canonical California scoring",()=>{
  const input=snapshot();
  const score=projectAdminCaliforniaScore("california-local-fixture",JSON.parse(JSON.stringify(input)),false);
  assert.equal(score.score,88);
  assert.equal(score.policyVersion,"california-regulatory-posture.v11-wcag");
});

test("no-go, missing, unready, cross-scan and malformed inputs do not borrow a California score",()=>{
  const input=snapshot();const unavailable={score:null,policyVersion:null};
  assert.deepEqual(projectAdminCaliforniaScore("california-local-fixture",input,true),unavailable);
  assert.deepEqual(projectAdminCaliforniaScore("other",input,false),unavailable);
  assert.deepEqual(projectAdminCaliforniaScore("california-local-fixture",null,false),unavailable);
  for(const patch of [{report_projection_status:"pending"},{report_projection_version:"unsupported"},
    {admin_canonical_score_input:null},{admin_canonical_score_input:{...input.admin_canonical_score_input,projectionScanId:"other"}},
    {admin_canonical_score_input:{...input.admin_canonical_score_input,assessment:{}}},
    {admin_canonical_score_input:{...input.admin_canonical_score_input,unifiedFindings:[null]}}])
    assert.deepEqual(projectAdminCaliforniaScore("california-local-fixture",{...input,...patch},false),unavailable);
});
