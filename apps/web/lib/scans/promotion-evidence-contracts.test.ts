import assert from "node:assert/strict";
import test from "node:test";

import { getContradictionEvidenceBundle } from "./contradiction-evidence-contract";
import { POLICY_BEHAVIOR_CONFLICT_FIXTURES } from "./policy-behavior-conflict.fixtures";
import { evaluatePolicyBehaviorConflictContract } from "./promotion-evidence-contracts";
import { buildSanitizedNetworkEvidenceAuditRecord } from "./sanitized-network-evidence";

test("policy behavior conflict fixtures parse into the structured contradiction schema", () => {
  const bundle = getContradictionEvidenceBundle(POLICY_BEHAVIOR_CONFLICT_FIXTURES.positiveNecessaryOnlyPreconsent);

  assert.ok(bundle);
  assert.equal(bundle?.policyAnchor.claimType, "only_necessary_cookies_before_choice");
  assert.equal(bundle?.runtimeAnchor.observationType, "marketing_vendor_fired_pre_consent");
  assert.equal(bundle?.runtimeAnchor.phase, "pre_consent");
  assert.equal(
    bundle?.conflictBridge.conflictType,
    "declared_only_necessary_cookies_before_choice_but_non_essential_tracking_fired"
  );
  assert.equal(bundle?.evidenceSufficiency.promotionEligible, true);
});

test("contradiction evidence canonicalizes legacy snake_case fields before parsing", () => {
  const bundle = getContradictionEvidenceBundle({
    claim: "We only use necessary cookies before consent.",
    contradiction_basis: "Observed marketing tags before consent.",
    policy_snippet: "We only use necessary cookies before consent.",
    policy_source_url: "https://example.com/privacy",
    policy_summary_short: "We only use necessary cookies before consent.",
    runtime_evidence_artifacts: ["Marketing vendor fired before consent."],
    runtime_summary: "Marketing vendor fired before consent.",
    runtime_vendors: ["ExampleAds"],
    related_vendors: ["ExampleAds"],
    source_urls: ["https://example.com/privacy"],
    supporting_signals: ["policy_runtime_functional_misalignment_detected"],
    policy_anchor: {
      claim_type: "only_necessary_cookies_before_choice",
      source_url: "https://example.com/privacy",
      snippet: "We only use necessary cookies before consent.",
      normalized_claim: "We only use necessary cookies before consent.",
      extraction_status: "complete"
    },
    runtime_anchor: {
      observation_type: "marketing_vendor_fired_pre_consent",
      runtime_phase: "pre_consent",
      source_url: "https://example.com/privacy",
      runtime_vendors: ["ExampleAds"],
      request_urls: ["https://ads.example.com/pixel"],
      cookie_names: ["ad_id"],
      storage_artifacts: ["ad_storage"]
    },
    conflict_bridge: {
      conflict_type: "declared_only_necessary_cookies_before_choice_but_non_essential_tracking_fired",
      bridge_reasoning: "Observed runtime behavior conflicts with the policy claim.",
      supports_promotion: true
    },
    evidence_sufficiency: {
      policy_anchor_present: true,
      runtime_anchor_present: true,
      conflict_bridge_present: true,
      promotion_eligible: true,
      review_status: "complete"
    }
  });

  assert.ok(bundle);
  assert.equal(bundle?.policyAnchor.claimType, "only_necessary_cookies_before_choice");
  assert.equal(bundle?.runtimeAnchor.observationType, "marketing_vendor_fired_pre_consent");
  assert.equal(bundle?.policySourceUrl, "https://example.com/privacy");
  assert.deepEqual(bundle?.runtimeAnchor.requests, ["https://ads.example.com/pixel"]);
  assert.equal(bundle?.evidenceSufficiency.reviewStatus, "complete");
});

test("policy behavior conflict contract accepts contradiction-grade positive fixtures", () => {
  const cases = [
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.positiveGpcNotHonored,
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.positiveNecessaryOnlyPreconsent,
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.positiveTrackingAfterReject
  ];

  for (const fixture of cases) {
    const decision = evaluatePolicyBehaviorConflictContract(fixture);
    assert.deepEqual(decision, {
      allowedNarrativeTier: "strong",
      promotionEligibility: "eligible",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: []
    });
  }
});

test("policy behavior conflict contract blocks incomplete contradiction fixtures", () => {
  const cases = [
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativePolicyNotFetched,
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativeGenericPolicyOnly,
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativeRuntimeEmpty,
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativeNoMapping,
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativeGeneralCookiesNoContradiction,
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativeSchwabLike
  ];

  for (const fixture of cases) {
    const decision = evaluatePolicyBehaviorConflictContract(fixture);
    assert.equal(decision?.promotionEligibility, "internal_only");
    assert.equal(decision?.externalSurfacingEligibility, "audit_only");
    assert.ok(decision?.negativeEvidenceFlags.includes("insufficient_evidence_for_policy_behavior_conflict"));
  }
});

test("schwab regression fixture is downgraded instead of promoted", () => {
  const decision = evaluatePolicyBehaviorConflictContract(POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativeSchwabLike);

  assert.equal(decision?.promotionEligibility, "internal_only");
  assert.ok(decision?.negativeEvidenceFlags.includes("possible_policy_runtime_mismatch"));
  assert.ok(decision?.negativeEvidenceFlags.includes("insufficient_evidence_for_policy_behavior_conflict"));
});

test("policy behavior conflict remains blocked when only a hashed artifact shell is retained", () => {
  const fixture = {
    ...POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativeRuntimeEmpty,
    sanitizedNetworkEvidence: buildSanitizedNetworkEvidenceAuditRecord({
      entries: [],
      summary: {
        gpc: {
          requestCount: 0
        }
      }
    })
  };

  const decision = evaluatePolicyBehaviorConflictContract(fixture);

  assert.equal(decision?.promotionEligibility, "internal_only");
  assert.ok(decision?.negativeEvidenceFlags.includes("runtime_tracking_review_incomplete"));
});
