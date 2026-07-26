import assert from "node:assert/strict";
import test from "node:test";
import {
  routeValidationFinding,
  shouldEscalateValidationVerdict
} from "./model-routing";

test("routine taxonomy validation stays on extraction model", () => {
  const route = routeValidationFinding({
    category: "accessibility",
    ruleKey: "accessibility.alt_text",
    severity: "medium",
    title: "Image alternative text signal"
  });
  assert.equal(route.primaryRole, "extraction");
  assert.equal(route.escalationEligible, false);
});

test("policy, session replay, and conflicting evidence route to Mini review", () => {
  const route = routeValidationFinding({
    category: "privacy",
    evidence: {
      reasonCodes: ["runtime_policy_mismatch"],
      supportingSignals: ["session_replay_observed"]
    },
    ruleKey: "privacy.session_replay",
    severity: "high",
    title: "Session replay policy/runtime contradiction"
  });
  assert.equal(route.primaryRole, "review");
  assert.equal(route.escalationEligible, true);
  assert.ok(route.reasonCodes.includes("conflicting_or_ambiguous_evidence"));
  assert.ok(route.reasonCodes.includes("sensitive_or_high_impact_signal"));
});

test("strong-model escalation remains selective", () => {
  const route = routeValidationFinding({
    category: "privacy",
    ruleKey: "privacy.international_transfer_conflict",
    severity: "high"
  });
  assert.equal(shouldEscalateValidationVerdict({
    confidence: 0.58,
    route,
    verdict: "inconclusive"
  }), true);
  assert.equal(shouldEscalateValidationVerdict({
    confidence: 0.91,
    route,
    verdict: "supported"
  }), false);
});
