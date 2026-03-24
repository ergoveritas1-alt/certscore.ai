import assert from "node:assert/strict";
import test from "node:test";

import { shouldSurfaceSupplementalPolicyReviewFinding } from "./supplemental-policy-review-gates";

test("replay disclosure review queue items stay internal-only", () => {
  assert.equal(
    shouldSurfaceSupplementalPolicyReviewFinding({
      evidence: {
        runtimeEvidenceArtifacts: ["vendor:Hotjar|signature:hotjar|host:static.hotjar.com"]
      },
      reason: "session_replay_without_disclosure_detected",
      ruleKey: "policy_review.session_replay_without_disclosure_detected.privacy_policy"
    }),
    false
  );
});

test("supplemental DSAR review items remain hidden when policy extraction is weak", () => {
  assert.equal(
    shouldSurfaceSupplementalPolicyReviewFinding({
      evidence: {
        policyDsarMechanism: "absent",
        policyExtractionStatus: "parser_incomplete",
        policyRightsSignals: [],
        policySemanticConfidence: 0.8
      },
      reason: "missing_dsar_high_exposure",
      ruleKey: "policy_review.missing_dsar_high_exposure.privacy_policy"
    }),
    false
  );
});

test("supplemental DSAR review items can surface with fetched high-confidence evidence", () => {
  assert.equal(
    shouldSurfaceSupplementalPolicyReviewFinding({
      evidence: {
        policyDsarMechanism: "absent",
        policyExtractionStatus: "fetched",
        policyRightsSignals: [],
        policySemanticConfidence: 0.8
      },
      reason: "missing_dsar_high_exposure",
      ruleKey: "policy_review.missing_dsar_high_exposure.privacy_policy"
    }),
    true
  );
});
