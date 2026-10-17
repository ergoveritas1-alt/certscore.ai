import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCaliforniaCapture } from "./audit-california-capture-cohort";

test("California capture audit separates frame candidates, unresolved top-level candidates, and opt-out limits", () => {
  const result = summarizeCaliforniaCapture([
    {scanId:"one",hostname:"example.com",createdAt:"2026-10-16T00:00:00Z",scanStatus:"completed",reportStatus:"ready",optOutConfigured:true,
      california:{choiceSurface:"unknown",inspection:{contractVersion:"certscore.privacy-choice-inspection.v3",coverage:"limited",
        namedChoiceCandidateCount:3,namedFrameChoiceCandidateCount:1,frameCount:2,inspectedSameOriginFrameCount:1,
        uninspectedFrameCount:1,inaccessibleFrameCount:1,frameInspectionWorkMs:2,frameProofWorkMs:1},controlCount:0,optOutEffectiveness:"not_assessed",
        optOutStatus:"unsupported",optOutLimitations:["no_unique_registered_recipe"]},
      workpaper:{candidateCount:1}},
    {scanId:"two",hostname:"example.org",createdAt:"2026-10-16T00:01:00Z",scanStatus:"completed",reportStatus:"ready",optOutConfigured:true,
      california:null,workpaper:null},
  ]);
  assert.equal(result.scans,2);
  assert.equal(result.assessments,1);
  assert.equal(result.scansWithUninspectedFrames,1);
  assert.equal(result.scansWithCandidatesNeedingTrace,1);
  assert.equal(result.frameWorkP95Ms,3);
  assert.equal(result.details[0]?.topLevelCandidateNeedsTrace,1);
  assert.equal(result.optOutStatuses.unsupported,1);
  assert.equal(result.optOutLimitationCounts.no_unique_registered_recipe,1);
  assert.equal(result.configuredWithoutVerifiedOptOutEvidence,1);
  assert.equal(result.inspectionCoverage.missing,1);
});
