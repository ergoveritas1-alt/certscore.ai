import assert from "node:assert/strict";
import test from "node:test";
import { buildConsentScenarioPlan } from "./scanners/consent-scenario-planner.js";

test("planner schedules CMP accept/reject paths from baseline controls", () => {
  const plan = buildConsentScenarioPlan({
    baseline: {
      bannerLikelyPresent: true,
      textExcerpt: "We use cookies.",
      actionCandidates: [
        { actionType: "accept_all", confidence: 0.91, shouldClick: true, labelText: "Accept All" },
        { actionType: "reject_all", confidence: 0.91, shouldClick: true, labelText: "Reject All" },
      ],
    },
    captureReplay: false,
    policyPlanningStatus: "policy_surface_unavailable",
  });

  assert.deepEqual(plan.plannedScenarios.map((item) => item.scenario), [
    "baseline_pre_consent",
    "gpc_enabled",
    "reject_all_flow",
    "accept_all_flow",
  ]);
  assert.ok(plan.skippedScenarios.some((item) =>
    item.scenario === "privacy_opt_out_flow" && item.skipReason === "privacy_control_not_observed"
  ));
  assert.ok(plan.skippedScenarios.some((item) =>
    item.scenario === "form_collection_probe" && item.skipReason === "profile_not_enabled"
  ));
});

test("planner skips CMP paths when no banner or consent controls are observed", () => {
  const plan = buildConsentScenarioPlan({
    baseline: {
      bannerLikelyPresent: false,
      textExcerpt: "Plain page",
      actionCandidates: [],
    },
    captureReplay: false,
    policyPlanningStatus: "policy_surface_not_ready_for_planning",
  });

  assert.deepEqual(plan.plannedScenarios.map((item) => item.scenario), [
    "baseline_pre_consent",
    "gpc_enabled",
  ]);
  assert.ok(plan.skippedScenarios.some((item) =>
    item.scenario === "reject_all_flow" && item.skipReason === "cmp_or_banner_not_observed"
  ));
  assert.ok(plan.notes.some((note) => /not ready/i.test(note)));
});

test("planner schedules bounded CMP-only action probes from runtime CMP evidence", () => {
  const plan = buildConsentScenarioPlan({
    baseline: {
      bannerLikelyPresent: false,
      cmpEvidenceObserved: true,
      textExcerpt: "Plain page",
      actionCandidates: [],
    },
    captureReplay: false,
    policyPlanningStatus: "policy_surface_unavailable",
  });

  assert.ok(plan.plannedScenarios.some((item) =>
    item.scenario === "reject_all_flow" &&
    item.actionType === "reject_all" &&
    item.reasonCodes.includes("cmp_runtime_evidence_observed") &&
    item.reasonCodes.includes("reject_or_preference_path_probe")
  ));
  assert.ok(plan.plannedScenarios.some((item) =>
    item.scenario === "accept_all_flow" &&
    item.actionType === "accept_all" &&
    item.reasonCodes.includes("cmp_runtime_evidence_observed") &&
    item.reasonCodes.includes("accept_or_preference_path_probe")
  ));
  assert.equal(plan.plannerInputs.baselineCmpEvidenceObserved, true);
});

test("planner schedules CMP probes when runtime evidence has a visible preference path", () => {
  const plan = buildConsentScenarioPlan({
    baseline: {
      bannerLikelyPresent: false,
      cmpEvidenceObserved: true,
      textExcerpt: "Plain page",
      actionCandidates: [
        {
          actionType: "manage_preferences",
          confidence: 0.84,
          shouldClick: true,
          labelText: "Cookie settings",
        },
      ],
    },
    captureReplay: false,
    policyPlanningStatus: "policy_surface_unavailable",
  });

  assert.ok(plan.plannedScenarios.some((item) =>
    item.scenario === "reject_all_flow" &&
    item.actionType === "reject_all" &&
    item.reasonCodes.includes("cmp_runtime_evidence_observed") &&
    item.reasonCodes.includes("reject_or_preference_path_observed")
  ));
  assert.ok(plan.plannedScenarios.some((item) =>
    item.scenario === "accept_all_flow" &&
    item.actionType === "accept_all" &&
    item.reasonCodes.includes("cmp_runtime_evidence_observed") &&
    item.reasonCodes.includes("accept_or_preference_path_observed")
  ));
});

test("planner schedules privacy opt-out and replay probes when eligible", () => {
  const plan = buildConsentScenarioPlan({
    baseline: {
      bannerLikelyPresent: false,
      textExcerpt: "Your Privacy Choices and Do Not Sell or Share My Personal Information",
      actionCandidates: [],
    },
    captureReplay: true,
    privacyControlUrls: ["https://example.test/privacy"],
    policyPlanningStatus: "policy_surface_ready_for_planning",
    policyPrivacyControlUrlCount: 1,
  });

  assert.ok(plan.plannedScenarios.some((item) =>
    item.scenario === "privacy_opt_out_flow" &&
    item.actionType === "do_not_sell_share" &&
    item.targetUrl === "https://example.test/privacy"
  ));
  assert.ok(plan.plannedScenarios.some((item) => item.scenario === "form_collection_probe"));
  assert.ok(plan.plannedScenarios.some((item) => item.scenario === "accessibility_probe"));
});

test("planner skips privacy opt-out when only weak privacy text is observed", () => {
  const plan = buildConsentScenarioPlan({
    baseline: {
      bannerLikelyPresent: false,
      textExcerpt: "Footer links include Your Privacy Choices and Do Not Sell or Share My Personal Information.",
      actionCandidates: [],
    },
    captureReplay: false,
    policyPlanningStatus: "policy_surface_unavailable",
  });

  assert.ok(plan.skippedScenarios.some((item) =>
    item.scenario === "privacy_opt_out_flow" &&
    item.skipReason === "privacy_control_not_observed" &&
    item.reasonCodes.includes("baseline_privacy_choice_text_observed") &&
    item.reasonCodes.includes("privacy_control_candidate_not_observed")
  ));
  assert.equal(plan.plannedScenarios.some((item) => item.scenario === "privacy_opt_out_flow"), false);
});

test("planner schedules privacy opt-out from a concrete baseline control", () => {
  const plan = buildConsentScenarioPlan({
    baseline: {
      bannerLikelyPresent: false,
      textExcerpt: "Privacy choices are available.",
      actionCandidates: [
        {
          actionType: "do_not_sell_share",
          confidence: 0.88,
          shouldClick: true,
          labelText: "Your Privacy Choices",
        },
      ],
    },
    captureReplay: false,
    policyPlanningStatus: "policy_surface_unavailable",
  });

  assert.ok(plan.plannedScenarios.some((item) =>
    item.scenario === "privacy_opt_out_flow" &&
    item.actionType === "do_not_sell_share" &&
    item.reasonCodes.includes("baseline_privacy_choice_control_observed")
  ));
});

test("planner respects capture replay auxiliary probe selection", () => {
  const plan = buildConsentScenarioPlan({
    baseline: {
      bannerLikelyPresent: false,
      textExcerpt: "Plain page",
      actionCandidates: [],
    },
    captureReplay: true,
    captureReplayAuxiliaryProbes: "form",
    policyPlanningStatus: "policy_surface_unavailable",
  });

  assert.ok(plan.plannedScenarios.some((item) => item.scenario === "form_collection_probe"));
  assert.ok(plan.skippedScenarios.some((item) =>
    item.scenario === "accessibility_probe" &&
    item.reasonCodes.includes("accessibility_probe_not_enabled_for_capture_replay")
  ));
});

test("planner converts deadline exhaustion into explicit skipped paths", () => {
  const plan = buildConsentScenarioPlan({
    baseline: {
      bannerLikelyPresent: true,
      textExcerpt: "We use cookies.",
      actionCandidates: [
        { actionType: "accept_all", confidence: 0.91, shouldClick: true, labelText: "Accept All" },
      ],
    },
    deadlineHit: true,
  });

  assert.equal(plan.plannedScenarios.length, 1);
  assert.equal(plan.skippedScenarios.every((item) => item.skipReason === "deadline_hit"), true);
});
