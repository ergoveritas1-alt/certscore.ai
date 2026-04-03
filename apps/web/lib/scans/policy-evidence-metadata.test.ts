import assert from "node:assert/strict";
import test from "node:test";

import {
  derivePolicyPageTypeFromEvidence,
  derivePolicyPrimarySourceFromEvidence
} from "./policy-evidence-metadata";

test("derivePolicyPageTypeFromEvidence prefers canonical and legacy policy page fields", () => {
  assert.equal(derivePolicyPageTypeFromEvidence({ page_type: "privacy_policy" }), "privacy_policy");
  assert.equal(derivePolicyPageTypeFromEvidence({ normalizedConcernPolicyPageType: "terms_of_service" }), "terms_of_service");
  assert.equal(derivePolicyPageTypeFromEvidence({ pageType: "non_policy" }), "non_policy");
});

test("derivePolicyPrimarySourceFromEvidence respects explicit booleans and source role fallbacks", () => {
  assert.equal(derivePolicyPrimarySourceFromEvidence({ is_primary_policy_enrichment: true }), true);
  assert.equal(derivePolicyPrimarySourceFromEvidence({ policySourceRole: "secondary_policy" }), false);
  assert.equal(derivePolicyPrimarySourceFromEvidence({ normalizedConcernPolicySourceRole: "primary_policy" }), true);
});
