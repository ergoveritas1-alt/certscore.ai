import assert from "node:assert/strict";
import test from "node:test";

import {
  concernRequiresDirectRuntime,
  concernRequiresPageAttribution,
  deriveConcernPolicy,
  isDomainLevelChildrenDisclosureFinding,
  isDomainLevelSensitiveContextFinding,
  packetNeedsPageAttribution
} from "./concern-policy";
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

test("deriveConcernPolicy handles the main concern families consistently", () => {
  const cases = [
    {
      name: "replay without direct runtime stays internal",
      concern: makeConcern({
        originKey: "privacy.session_replay_runtime_detected",
        suggestedUnifiedFindingId: "session_replay_undisclosed",
        title: "Possible replay/disclosure mismatch"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        runtimeEvidenceArtifacts: []
      },
      expected: {
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only"
      }
    },
    {
      name: "replay with vendor-only hints still stays internal",
      concern: makeConcern({
        originKey: "privacy.session_replay_runtime_detected",
        suggestedUnifiedFindingId: "session_replay_undisclosed",
        title: "Possible replay/disclosure mismatch"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        sessionReplayRuntimeVendors: ["Hotjar"]
      },
      expected: {
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only"
      }
    },
    {
      name: "dsar with fetched high-confidence evidence stays eligible",
      concern: makeConcern({
        originKey: "section_review.missing_dsar_high_exposure",
        suggestedUnifiedFindingId: "missing_dsar_high_exposure",
        title: "Possible missing privacy-rights path"
      }),
      evidenceStrengthFlags: ["policy_text", "page_attributed"] as const,
      rawEvidence: {
        policyDsarMechanism: "absent",
        policyExtractionStatus: "fetched",
        policyRightsSignals: [],
        policySemanticConfidence: 0.8
      },
      expected: {
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible"
      }
    },
    {
      name: "rights friction without a real barrier is blocked",
      concern: makeConcern({
        originKey: "privacy.user_rights_friction_score",
        suggestedUnifiedFindingId: "functional_misalignment",
        title: "Functional misalignment"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        consentEvidencePassCount: 1
      },
      expected: {
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress"
      }
    },
    {
      name: "high-sensitivity concern with request evidence stays eligible",
      concern: makeConcern({
        originKey: "commerce.high_sensitivity_data_collection_detected",
        suggestedUnifiedFindingId: "high_sensitivity_data_collection",
        title: "High-sensitivity data collection detected"
      }),
      evidenceStrengthFlags: ["concrete_payload", "page_attributed"] as const,
      rawEvidence: {
        sensitivePayloadViolations: [
          {
            evidenceStrength: "suspected",
            requestUrl: "https://tracker.example.com/collect"
          }
        ]
      },
      expected: {
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible"
      }
    },
    {
      name: "unattributed accessibility concerns become audit-only",
      concern: makeConcern({
        originType: "validation_rule",
        originKey: "scan_snapshot.accessibility.accessibility_risk_score",
        suggestedUnifiedFindingId: "accessibility_risk_score",
        title: "Accessibility risk score"
      }),
      evidenceStrengthFlags: ["structured_validation"] as const,
      rawEvidence: {
        value: -4
      },
      expected: {
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only"
      }
    }
  ];

  for (const testCase of cases) {
    const policy = deriveConcernPolicy({
      concern: testCase.concern,
      evidenceStrengthFlags: [...testCase.evidenceStrengthFlags],
      rawEvidence: testCase.rawEvidence
    });

    assert.deepEqual(policy, testCase.expected, testCase.name);
  }
});

test("concern policy helper primitives stay aligned with packet usage", () => {
  assert.equal(
    concernRequiresDirectRuntime(
      makeConcern({
        suggestedUnifiedFindingId: "session_replay_undisclosed",
        title: "Possible replay/disclosure mismatch"
      })
    ),
    true
  );
  assert.equal(
    concernRequiresPageAttribution(
      makeConcern({
        suggestedUnifiedFindingId: "accessibility_risk_score"
      })
    ),
    true
  );
  assert.equal(isDomainLevelSensitiveContextFinding("minors_or_age_gated_collection_context"), true);
  assert.equal(
    isDomainLevelChildrenDisclosureFinding("children_privacy_context_without_supporting_disclosure"),
    true
  );
  assert.equal(
    packetNeedsPageAttribution({
      family: "contradiction",
      unifiedFindingId: "policy_behavior_conflict"
    }),
    true
  );
  assert.equal(
    packetNeedsPageAttribution({
      family: "consent_tracking",
      unifiedFindingId: "consent_surface_missing"
    }),
    false
  );
});
