import assert from "node:assert/strict";
import test from "node:test";

import { deriveConcernPolicy } from "./concern-policy";
import type { NormalizedConcern } from "./normalized-concerns";

function makeConcern(
  overrides: Partial<Pick<NormalizedConcern, "canonicalConcernKey" | "originKey" | "originType" | "suggestedUnifiedFindingId" | "title">>
) {
  return {
    canonicalConcernKey: "test",
    originKey: "test",
    originType: "snapshot_signal",
    suggestedUnifiedFindingId: undefined,
    title: "Test concern",
    ...overrides
  } satisfies Pick<NormalizedConcern, "canonicalConcernKey" | "originKey" | "originType" | "suggestedUnifiedFindingId" | "title">;
}

test("replay concerns without direct runtime stay internal", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "privacy.session_replay_runtime_detected",
      suggestedUnifiedFindingId: "session_replay_undisclosed",
      title: "Possible replay/disclosure mismatch"
    }),
    evidenceStrengthFlags: ["fallback_only"],
    rawEvidence: {
      runtimeEvidenceArtifacts: []
    }
  });

  assert.equal(policy.promotionEligibility, "internal_only");
  assert.equal(policy.externalSurfacingEligibility, "audit_only");
});

test("dsar concerns with fetched high-confidence evidence stay eligible", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "section_review.missing_dsar_high_exposure",
      suggestedUnifiedFindingId: "missing_dsar_high_exposure",
      title: "Possible missing privacy-rights path"
    }),
    evidenceStrengthFlags: ["policy_text", "page_attributed"],
    rawEvidence: {
      policyDsarMechanism: "absent",
      policyExtractionStatus: "fetched",
      policyRightsSignals: [],
      policySemanticConfidence: 0.8
    }
  });

  assert.equal(policy.promotionEligibility, "eligible");
  assert.equal(policy.externalSurfacingEligibility, "eligible");
});

test("unattributed accessibility concerns become audit-only at the concern stage", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originType: "validation_rule",
      originKey: "scan_snapshot.accessibility.accessibility_risk_score",
      suggestedUnifiedFindingId: "accessibility_risk_score",
      title: "Accessibility risk score"
    }),
    evidenceStrengthFlags: ["structured_validation"],
    rawEvidence: {
      value: -4
    }
  });

  assert.equal(policy.promotionEligibility, "internal_only");
  assert.equal(policy.externalSurfacingEligibility, "audit_only");
});
