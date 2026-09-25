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
  const baseline = deriveCanonicalOverallScoreForReport({ scanRecord: { runtimeArtifacts: null },
    checklistRows: checkedChecklist,
    unifiedFindings: [],
  });
  const withGpcGap = deriveCanonicalOverallScoreForReport({ scanRecord: { runtimeArtifacts: null },
    checklistRows: checkedChecklist,
    unifiedFindings: [gpcFinding(15), gpcFinding(15)],
  });

  assert.equal(baseline, 100);
  assert.equal(withGpcGap, 85);
});

test("canonical overall score rejects malformed or differently valued GPC score effects", () => {
  assert.equal(deriveCanonicalOverallScoreForReport({ scanRecord: { runtimeArtifacts: null },
    checklistRows: checkedChecklist,
    unifiedFindings: [gpcFinding(5)],
  }), 100);
});

test("critical coverage withholding also withholds the canonical score", () => {
  assert.equal(deriveCanonicalOverallScoreForReport({
    scanRecord: { runtimeArtifacts: { scoreConfidence: "withheld_incomplete_critical_coverage" } },
    checklistRows: checkedChecklist,
    unifiedFindings: []
  }), null);
});

import { siteIntegrityProjectionFixture } from "../../../../packages/certscore-contracts/src/site-integrity.fixture";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";

function integrityFindings(count: number, page?: string) {
  const base = siteIntegrityProjectionFixture;
  const observation = { ...base.observation, links: Array.from({length: count}, (_, index) => ({ evidenceRef: `site_integrity:link:${index}`, destinationDomain: "external.example", concealment: "offscreen_position" })) };
  const projection = page ? { ...base, contractVersion: "certscore.site-integrity-projection.v2", pageId: page, attemptId: "10000000-0000-4000-8000-000000000001", configurationHash: "c".repeat(64), evidenceRef: `full-site:${page}:10000000-0000-4000-8000-000000000001:evidence.json#siteIntegrityObservation`, observation: {...observation, contractVersion: "certscore.site-integrity-observation.v2", scope: "additional_page_main_document"} } : {...base, observation};
  return buildUnifiedFindingDisplayPackets({runtimeArtifacts: {siteIntegrity: projection}, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map()});
}
const scoreIntegrity = (unifiedFindings: UnifiedFindingDisplayPacket[]) => deriveCanonicalOverallScoreForReport({scanRecord: {runtimeArtifacts: null}, checklistRows: checkedChecklist, unifiedFindings});

test("verified hidden links use 17 then 5 with a 40-point site cap", () => {
  for (const [count, expected] of [[0,100],[1,83],[2,78],[3,73],[5,63],[6,60],[7,60],[12,60]]) assert.equal(scoreIntegrity(integrityFindings(count!)), expected);
});
test("transfer-framework review retains the canonical consent, embed, and hidden-link deductions", () => {
  const checklistRows = [
    ...checkedChecklist,
    ...["reject_all_path_availability", "embedded_content_pre_consent", "social_media_embed_pre_consent", "third_party_iframe_pre_consent"].map(id => ({
      id, assessmentStatus: "gap_observed", evidenceState: "observed", status: "Gap observed",
    })),
    { id: "outdated_transfer_framework_reference", assessmentStatus: "review_signal", evidenceState: "observed", status: "Review signal" },
  ] as GdprEprivacyCoverageChecklistItem[];
  assert.equal(deriveCanonicalOverallScoreForReport({ scanRecord: { runtimeArtifacts: null }, checklistRows, unifiedFindings: integrityFindings(8) }), 33);
});
test("site-wide link identities union across pages and duplicate projections do not multiply deductions", () => {
  const home = integrityFindings(1);
  const page = integrityFindings(2, "20000000-0000-4000-8000-000000000001");
  assert.equal(scoreIntegrity([...home, ...home]), 83);
  assert.equal(scoreIntegrity([...home, ...page, ...page]), 73);
  assert.equal(scoreIntegrity([...integrityFindings(6), ...page]), 60);
  assert.equal(scoreIntegrity([...integrityFindings(12),gpcFinding(15)]),45);
});
test("missing, stale, and malformed integrity score effects fail closed", () => {
  const finding = integrityFindings(1)[0]!;
  assert.equal(scoreIntegrity([{...finding, scoreEffects: []}]),100);
  for (const change of [{policyVersion: "certscore.site-integrity-policy.v2"}, {deductionPoints: 40}, {observedActivity: ["guessed"]}, {evidenceRefs: []}]) {
    assert.equal(scoreIntegrity([{...finding, scoreEffects: finding.scoreEffects!.map(effect => ({...effect,...change}))}]),100);
  }
});
