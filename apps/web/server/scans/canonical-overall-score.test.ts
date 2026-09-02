import assert from "node:assert/strict";
import test from "node:test";
import type { UnifiedFindingDisplayPacket } from "../../lib/scans/unified-findings";
import type { GdprEprivacyCoverageChecklistItem } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import {
  CALIFORNIA_GPC_NO_SUPPRESSION_POLICY_KEY,
  CALIFORNIA_GPC_RESPONSE_POLICY_VERSION,
} from "../../lib/scans/california-gpc-response-policy";
import { deriveCanonicalOverallScoreForReport } from "./canonical-overall-score";

const checkedChecklist = [{
  assessmentStatus: "checked",
  criticalEvidence: { retainedEvidence: { consentSurfaceObserved: true } },
  evidenceState: "observed",
  id: "consent_surface_observed",
  status: "Observed",
}] as unknown as GdprEprivacyCoverageChecklistItem[];

function gpcFinding(deductionPoints: number): UnifiedFindingDisplayPacket {
  return {
    unifiedFindingId: "gpc_response",
    scoreEffects: [{
      appliesTo: "certscore_overall",
      deductionPoints,
      evidenceRefs: ["s3://evidence/baseline.json", "s3://evidence/gpc.json"],
      framework: "california",
      observedActivity: ["Example Ads|pixel|advertising"],
      policyKey: CALIFORNIA_GPC_NO_SUPPRESSION_POLICY_KEY,
      policyVersion: CALIFORNIA_GPC_RESPONSE_POLICY_VERSION,
      reasonCode: "comparable_gpc_no_qualifying_suppression",
    }],
  } as unknown as UnifiedFindingDisplayPacket;
}

test("canonical overall score applies the qualified California GPC deduction exactly once", () => {
  const baseline = deriveCanonicalOverallScoreForReport({
    checklistRows: checkedChecklist,
    unifiedFindings: [],
  });
  const withGpcGap = deriveCanonicalOverallScoreForReport({
    checklistRows: checkedChecklist,
    unifiedFindings: [gpcFinding(15), gpcFinding(15)],
  });

  assert.equal(baseline, 100);
  assert.equal(withGpcGap, 85);
});

test("canonical overall score rejects malformed or differently valued GPC score effects", () => {
  assert.equal(deriveCanonicalOverallScoreForReport({
    checklistRows: checkedChecklist,
    unifiedFindings: [gpcFinding(5)],
  }), 100);
});
