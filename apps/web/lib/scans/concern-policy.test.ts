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
  overrides: Partial<
    Pick<
      NormalizedConcern,
      "canonicalConcernKey" | "originKey" | "originType" | "policyIsPrimarySource" | "policyPageType" | "suggestedUnifiedFindingId" | "title"
    >
  >
) {
  return {
    canonicalConcernKey: "test",
    originKey: "test",
    originType: "snapshot_signal",
    policyIsPrimarySource: null,
    policyPageType: null,
    suggestedUnifiedFindingId: undefined,
    title: "Test concern",
    ...overrides
  } satisfies Pick<
    NormalizedConcern,
    "canonicalConcernKey" | "originKey" | "originType" | "policyIsPrimarySource" | "policyPageType" | "suggestedUnifiedFindingId" | "title"
  >;
}

test("deriveConcernPolicy handles the main concern families consistently", () => {
  const cases = [
    {
      name: "low-confidence policy extraction on a non-policy page is blocked",
      concern: makeConcern({
        originKey: "policySemanticConfidence",
        originType: "policy_enrichment",
        policyPageType: "non_policy",
        suggestedUnifiedFindingId: "low_confidence_policy_extraction",
        title: "Low-confidence policy extraction"
      }),
      evidenceStrengthFlags: ["policy_text", "page_attributed"] as const,
      rawEvidence: {
        pageType: "non_policy",
        policySemanticConfidence: 0.5
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "low-confidence policy extraction on a non-primary policy row is blocked",
      concern: makeConcern({
        originKey: "policySemanticConfidence",
        originType: "policy_enrichment",
        policyIsPrimarySource: false,
        policyPageType: "privacy_policy",
        suggestedUnifiedFindingId: "low_confidence_policy_extraction",
        title: "Low-confidence policy extraction"
      }),
      evidenceStrengthFlags: ["policy_text", "page_attributed"] as const,
      rawEvidence: {
        isPrimaryPolicy: false,
        pageType: "privacy_policy",
        policySemanticConfidence: 0.5
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: []
      }
    },
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
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: ["no_direct_runtime_replay_artifact_observed"]
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
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: ["no_direct_runtime_replay_artifact_observed"]
      }
    },
    {
      name: "retargeting without retained runtime artifacts stays surfaceable but weakly worded",
      concern: makeConcern({
        originKey: "scan_snapshot.commerce.retargeting_pixel_detected",
        suggestedUnifiedFindingId: "retargeting_pixel_observed",
        title: "Retargeting pixel detected"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        snapshotField: "retargeting_pixel_detected",
        value: true
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: ["no_direct_runtime_retargeting_artifact_observed"]
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
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: ["policy_target_retrievable"]
      }
    },
    {
      name: "consent surface missing without concrete absence evidence stays audit-only",
      concern: makeConcern({
        originKey: "privacy.consent_surface_missing",
        suggestedUnifiedFindingId: "consent_surface_missing",
        title: "Consent surface missing"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        keyPageAttemptCount: 3,
        keyPageDiscoverySource: "footer_link"
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: []
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
        allowedNarrativeTier: "weak",
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "rights friction with thin preference-center evidence stays blocked when rights path exists",
      concern: makeConcern({
        originKey: "privacy.user_rights_friction_score",
        suggestedUnifiedFindingId: "rights_fulfillment_friction",
        title: "Rights fulfillment friction"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        consentOptOutClicks: 2,
        consentRedirectOrAuthRequired: true,
        consentBlockerTextSnippet:
          "Allow Sale, Sharing for Cross-Context Behavioral Advertising, or Targeted Advertising Save Settings",
        consentEvidencePassCount: 1,
        policyRightsSignals: ["access", "delete", "privacy_controls"]
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "weak cookie posture without concrete secure or samesite examples stays audit-only",
      concern: makeConcern({
        originKey: "privacy.weak_cookie_security_attributes_detected",
        suggestedUnifiedFindingId: "weak_cookie_security_attributes",
        title: "Weak cookie security attributes"
      }),
      evidenceStrengthFlags: ["direct_runtime"] as const,
      rawEvidence: {
        cookieAttributeSummary: {
          missingHttpOnlyCount: 4,
          missingHttpOnlyCookieNames: ["_ga", "_ga_test"]
        }
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: []
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
        allowedNarrativeTier: "strong",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
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
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: []
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

test("deriveConcernPolicy weakens contradiction concerns when one side of the mismatch is missing", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "context.policy_behavior_conflict_detected",
      suggestedUnifiedFindingId: "policy_behavior_conflict",
      title: "Policy/behavior conflict detected"
    }),
    evidenceStrengthFlags: ["fallback_only"],
    rawEvidence: {
      signalValue: true
    }
  });

  assert.deepEqual(policy, {
    allowedNarrativeTier: "weak",
    promotionEligibility: "internal_only",
    externalSurfacingEligibility: "audit_only",
    negativeEvidenceFlags: [
      "missing_behavior_side_evidence",
      "missing_policy_side_evidence",
      "missing_contradiction_mapping"
    ]
  });
});
