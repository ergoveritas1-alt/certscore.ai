import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLoadTestEgressBudgetAllowsEnqueue,
  DEFAULT_LOAD_TEST_EGRESS_BUDGET_POLICY,
  evaluateLoadTestEgressBudget,
  type LoadTestEgressBudgetEvidence
} from "./load-test-egress-budget";

const baseEvidence: LoadTestEgressBudgetEvidence = {
  currentNonTerminalCount: 4,
  currentScannerQueueCount: 6,
  recentCompletedCount: 25,
  recentStartedCount: 10
};

test("egress budget passes under limits", () => {
  const check = evaluateLoadTestEgressBudget({
    batchId: "prod-manifest-1-25-load-test-20260522-1300",
    checkedAt: "2026-05-22T13:00:00.000Z",
    evidence: baseEvidence
  });

  assert.equal(check.decision, "pass");
  assert.equal(check.egress_id, "aws-default");
  assert.equal(check.policy.maxConcurrentNonTerminal, 25);
  assert.equal(check.policy.maxStartedPerHour, 50);
});

test("egress budget blocks when manualPause=true", () => {
  const check = evaluateLoadTestEgressBudget({
    batchId: "prod-manifest-1-25-load-test-20260522-1300",
    evidence: baseEvidence,
    policy: { manualPause: true }
  });

  assert.equal(check.decision, "block");
  assert.match(check.reasons.join(" "), /Manual pause/);
});

test("egress budget delays while cooldownUntil is in the future", () => {
  const check = evaluateLoadTestEgressBudget({
    batchId: "prod-manifest-1-25-load-test-20260522-1300",
    checkedAt: "2026-05-22T13:00:00.000Z",
    evidence: baseEvidence,
    policy: { cooldownUntil: "2026-05-22T13:30:00.000Z" }
  });

  assert.equal(check.decision, "delay");
  assert.equal(check.recommendedResumeAt, "2026-05-22T13:30:00.000Z");
});

test("egress budget delays when maxStartedPerHour is exceeded", () => {
  const check = evaluateLoadTestEgressBudget({
    batchId: "prod-manifest-1-25-load-test-20260522-1300",
    checkedAt: "2026-05-22T13:00:00.000Z",
    evidence: { ...baseEvidence, recentStartedCount: DEFAULT_LOAD_TEST_EGRESS_BUDGET_POLICY.maxStartedPerHour }
  });

  assert.equal(check.decision, "delay");
  assert.match(check.reasons.join(" "), /maxStartedPerHour=50/);
});

test("egress budget delays when maxConcurrentNonTerminal is exceeded", () => {
  const check = evaluateLoadTestEgressBudget({
    batchId: "prod-manifest-1-25-load-test-20260522-1300",
    checkedAt: "2026-05-22T13:00:00.000Z",
    evidence: { ...baseEvidence, currentNonTerminalCount: DEFAULT_LOAD_TEST_EGRESS_BUDGET_POLICY.maxConcurrentNonTerminal }
  });

  assert.equal(check.decision, "delay");
  assert.match(check.reasons.join(" "), /maxConcurrentNonTerminal=25/);
});

test("egress budget blocks when safety-critical count evidence is unavailable", () => {
  const check = evaluateLoadTestEgressBudget({
    batchId: "prod-manifest-1-25-load-test-20260522-1300",
    evidence: { ...baseEvidence, currentNonTerminalCount: null }
  });

  assert.equal(check.decision, "block");
  assert.match(check.reasons.join(" "), /non-terminal per-egress count is unavailable/);
});

test("egress budget warns when quality-context completed evidence is thin", () => {
  const check = evaluateLoadTestEgressBudget({
    batchId: "prod-manifest-1-25-load-test-20260522-1300",
    evidence: { ...baseEvidence, recentCompletedCount: 10 }
  });

  assert.equal(check.decision, "warn");
  assert.match(check.reasons.join(" "), /minCompletedWindowForQualityContext=25/);
});

test("runner assertion refuses to proceed on block", () => {
  assert.throws(
    () =>
      assertLoadTestEgressBudgetAllowsEnqueue({
        decision: "block",
        reasons: ["Manual pause is active for egress_id=aws-default."],
        recommendedResumeAt: null
      }),
    /Egress budget check block/
  );
});
