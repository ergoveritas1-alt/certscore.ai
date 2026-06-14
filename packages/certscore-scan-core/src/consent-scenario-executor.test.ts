import assert from "node:assert/strict";
import test from "node:test";
import type { ConsentActionAttempt, ConsentFlowScenario } from "@certscore/contracts";
import { executeConsentScenarioPlan } from "./scanners/consent-scenario-executor.js";
import type { ConsentScenarioPlanItem } from "./scanners/consent-scenario-planner.js";

test("scenario executor returns stable scenario order under parallel completion", async () => {
  const plannedScenarios: ConsentScenarioPlanItem[] = [
    { scenario: "baseline_pre_consent", reasonCodes: ["baseline_required"] },
    { scenario: "accept_all_flow", actionType: "accept_all", reasonCodes: ["accept"] },
    { scenario: "gpc_enabled", reasonCodes: ["gpc"] },
    { scenario: "reject_all_flow", actionType: "reject_all", reasonCodes: ["reject"] },
  ];

  const result = await executeConsentScenarioPlan({
    plannedScenarios,
    skippedScenarios: [],
    concurrency: 3,
    deadlineAtMs: Date.now() + 30_000,
    async runScenario(item) {
      const delays: Partial<Record<ConsentFlowScenario, number>> = {
        accept_all_flow: 5,
        gpc_enabled: 1,
        reject_all_flow: 2,
      };
      await new Promise((resolve) => setTimeout(resolve, delays[item.scenario] ?? 0));
      return {
        scenario: item.scenario,
        actionAttempts: item.actionType ? [successfulAttempt(item.actionType)] : [],
      };
    },
  });

  assert.deepEqual(result.captures.map((capture) => capture.scenario), [
    "baseline_pre_consent",
    "gpc_enabled",
    "reject_all_flow",
    "accept_all_flow",
  ]);
  assert.deepEqual(result.entries.map((entry) => entry.scenario), [
    "baseline_pre_consent",
    "gpc_enabled",
    "reject_all_flow",
    "accept_all_flow",
  ]);
  assert.equal(result.entries.find((entry) => entry.scenario === "reject_all_flow")?.comparisonEligible, true);
  assert.equal(result.entries.find((entry) => entry.scenario === "accept_all_flow")?.comparisonEligible, true);
});

test("scenario executor starts targeted privacy opt-out before exploratory consent actions", async () => {
  const plannedScenarios: ConsentScenarioPlanItem[] = [
    { scenario: "baseline_pre_consent", reasonCodes: ["baseline_required"] },
    { scenario: "accept_all_flow", actionType: "accept_all", reasonCodes: ["accept"] },
    { scenario: "reject_all_flow", actionType: "reject_all", reasonCodes: ["reject"] },
    {
      scenario: "privacy_opt_out_flow",
      actionType: "do_not_sell_share",
      targetUrl: "https://example.com/privacy?choice=1",
      reasonCodes: ["privacy_control_url_observed"],
    },
    { scenario: "gpc_enabled", reasonCodes: ["gpc"] },
  ];
  const starts: ConsentFlowScenario[] = [];

  const result = await executeConsentScenarioPlan({
    plannedScenarios,
    skippedScenarios: [],
    concurrency: 1,
    deadlineAtMs: Date.now() + 30_000,
    async runScenario(item) {
      starts.push(item.scenario);
      return {
        scenario: item.scenario,
        actionAttempts: item.actionType ? [successfulAttempt(item.actionType, item.scenario)] : [],
      };
    },
  });

  assert.deepEqual(starts, [
    "baseline_pre_consent",
    "gpc_enabled",
    "privacy_opt_out_flow",
    "reject_all_flow",
    "accept_all_flow",
  ]);
  assert.deepEqual(result.entries.map((entry) => entry.scenario), [
    "baseline_pre_consent",
    "gpc_enabled",
    "reject_all_flow",
    "accept_all_flow",
    "privacy_opt_out_flow",
  ]);
});

test("scenario executor skips action lanes when remaining global budget is too small", async () => {
  const plannedScenarios: ConsentScenarioPlanItem[] = [
    { scenario: "baseline_pre_consent", reasonCodes: ["baseline_required"] },
    { scenario: "reject_all_flow", actionType: "reject_all", reasonCodes: ["reject"] },
  ];
  const starts: ConsentFlowScenario[] = [];

  const result = await executeConsentScenarioPlan({
    plannedScenarios,
    skippedScenarios: [],
    concurrency: 1,
    deadlineAtMs: Date.now() + 1_000,
    async runScenario(item) {
      starts.push(item.scenario);
      return {
        scenario: item.scenario,
        actionAttempts: item.actionType ? [successfulAttempt(item.actionType, item.scenario)] : [],
      };
    },
  });

  assert.deepEqual(starts, ["baseline_pre_consent"]);
  const rejectEntry = result.entries.find((entry) => entry.scenario === "reject_all_flow");
  assert.equal(rejectEntry?.status, "skipped");
  assert.equal(rejectEntry?.failureReason, "budget_exhausted");
  assert.equal(rejectEntry?.deadlineHit, true);
});

function successfulAttempt(
  actionType: ConsentActionAttempt["actionType"],
  scenario: ConsentFlowScenario = actionType === "accept_all" ? "accept_all_flow" : "reject_all_flow",
): ConsentActionAttempt {
  return {
    attemptId: `attempt_${actionType}`,
    sourceScanner: "consent_flow_runtime",
    scenario,
    actionType,
    attempted: true,
    succeeded: true,
    evidenceRefs: [],
    confidence: 0.9,
    actionProof: {
      candidateObserved: true,
      candidateLabelText: actionType,
      candidateNormalizedActionType: actionType,
      candidateConfidence: 0.9,
      attemptedStatus: "attempted_succeeded",
      postActionBannerAbsent: true,
      proofAvailable: true,
    },
  };
}
