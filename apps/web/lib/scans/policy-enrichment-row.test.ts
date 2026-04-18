import assert from "node:assert/strict";
import test from "node:test";
import { getPolicyActionableFlags, getPolicyRightsSignals } from "./policy-enrichment-row";

test("getPolicyRightsSignals filters mixed raw arrays down to strings", () => {
  const result = getPolicyRightsSignals({
    policy_rights_signals: ["access_request", { bad: true }, 4, "", "delete_request", null]
  });

  assert.deepEqual(result, ["access_request", "delete_request"]);
});

test("getPolicyRightsSignals falls back to snippet arrays and filters non-string entries", () => {
  const result = getPolicyRightsSignals({}, {
    policy_rights_signals: ["opt_out_request", false, "appeal_request", { nope: true }]
  });

  assert.deepEqual(result, ["opt_out_request", "appeal_request"]);
});

test("getPolicyActionableFlags filters mixed raw arrays down to strings", () => {
  const result = getPolicyActionableFlags({
    policy_actionable_flags: ["low_confidence", { bad: true }, false, "llm_provider_error", ""]
  });

  assert.deepEqual(result, ["low_confidence", "llm_provider_error"]);
});
