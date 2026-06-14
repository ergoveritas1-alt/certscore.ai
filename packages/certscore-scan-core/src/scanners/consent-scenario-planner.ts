import type {
  ConsentActionType,
  ConsentFlowScenario,
  ConsentScenarioPolicyPlanningStatus,
  ConsentScenarioSkipReason,
} from "@certscore/contracts";

export const consentScenarioOrder: ConsentFlowScenario[] = [
  "baseline_pre_consent",
  "gpc_enabled",
  "reject_all_flow",
  "accept_all_flow",
  "privacy_opt_out_flow",
  "form_collection_probe",
  "accessibility_probe",
];

export interface ConsentScenarioPlanItem {
  scenario: ConsentFlowScenario;
  actionType?: ConsentActionType;
  targetUrl?: string;
  reasonCodes: string[];
}

export interface ConsentScenarioSkippedItem extends ConsentScenarioPlanItem {
  skipReason: ConsentScenarioSkipReason;
}

export interface ConsentScenarioPlan {
  plannedScenarios: ConsentScenarioPlanItem[];
  skippedScenarios: ConsentScenarioSkippedItem[];
  policyPlanningStatus: ConsentScenarioPolicyPlanningStatus;
  plannerInputs: {
    baselineScenario: ConsentFlowScenario;
    captureReplay: boolean;
    seededPrivacyControlUrlCount: number;
    policyPrivacyControlUrlCount: number;
    baselineActionCandidateCount: number;
    baselineLikelyBannerPresent: boolean;
  };
  notes: string[];
}

export type ConsentReplayAuxiliaryProbeMode = "all" | "none" | "form" | "accessibility";

export interface BaselinePlanningSummary {
  actionCandidates: Array<{
    actionType: ConsentActionType;
    confidence: number;
    shouldClick: boolean;
    labelText?: string;
    normalizedLabel?: string;
    contextTextExcerpt?: string;
  }>;
  bannerLikelyPresent: boolean;
  textExcerpt?: string;
}

export interface BuildConsentScenarioPlanInput {
  baseline: BaselinePlanningSummary;
  captureReplay?: boolean;
  captureReplayAuxiliaryProbes?: ConsentReplayAuxiliaryProbeMode;
  privacyControlUrls?: string[];
  policyPrivacyControlUrlCount?: number;
  policyPlanningStatus?: ConsentScenarioPolicyPlanningStatus;
  deadlineHit?: boolean;
}

export function buildConsentScenarioPlan(input: BuildConsentScenarioPlanInput): ConsentScenarioPlan {
  const captureReplay = input.captureReplay === true;
  const auxiliaryProbes = captureReplay
    ? input.captureReplayAuxiliaryProbes ?? "all"
    : "none";
  const formProbeEnabled = auxiliaryProbes === "all" || auxiliaryProbes === "form";
  const accessibilityProbeEnabled = auxiliaryProbes === "all" || auxiliaryProbes === "accessibility";
  const policyPlanningStatus = input.policyPlanningStatus ?? "policy_surface_unavailable";
  const seededPrivacyControlUrlCount = input.privacyControlUrls?.length ?? 0;
  const policyPrivacyControlUrlCount = input.policyPrivacyControlUrlCount ?? 0;
  const plannedScenarios: ConsentScenarioPlanItem[] = [{
    scenario: "baseline_pre_consent",
    reasonCodes: ["baseline_required"],
  }];
  const skippedScenarios: ConsentScenarioSkippedItem[] = [];

  const consentSurfaceTextObserved = hasConsentSurfaceText(input.baseline);
  const hasCmpOrBanner = input.baseline.bannerLikelyPresent || consentSurfaceTextObserved || hasAnyAction(input.baseline, [
    "accept_all",
    "reject_all",
    "manage_preferences",
    "save_preferences",
  ]);
  const hasRejectPath = input.baseline.bannerLikelyPresent || consentSurfaceTextObserved || hasAnyAction(input.baseline, [
    "reject_all",
    "manage_preferences",
    "save_preferences",
  ]);
  const hasAcceptPath = input.baseline.bannerLikelyPresent || consentSurfaceTextObserved || hasAnyAction(input.baseline, [
    "accept_all",
    "manage_preferences",
  ]);
  const privacyTargetUrl = input.privacyControlUrls?.[0];
  const hasPrivacyControl = Boolean(privacyTargetUrl) || hasPrivacyText(input.baseline);

  if (input.deadlineHit) {
    for (const scenario of consentScenarioOrder.filter((scenario) => scenario !== "baseline_pre_consent")) {
      skippedScenarios.push({
        scenario,
        skipReason: "deadline_hit",
        reasonCodes: ["planner_deadline_hit"],
      });
    }
    return planResult();
  }

  plannedScenarios.push({
    scenario: "gpc_enabled",
    reasonCodes: ["gpc_context_high_value"],
  });

  if (hasRejectPath && hasCmpOrBanner) {
    plannedScenarios.push({
      scenario: "reject_all_flow",
      actionType: "reject_all",
      reasonCodes: input.baseline.bannerLikelyPresent
        ? ["cmp_or_banner_observed", "reject_or_preference_path_observed"]
        : consentSurfaceTextObserved
          ? ["consent_surface_text_observed", "reject_or_preference_path_probe"]
        : ["reject_or_preference_path_observed"],
    });
  } else {
    skippedScenarios.push({
      scenario: "reject_all_flow",
      actionType: "reject_all",
      skipReason: hasCmpOrBanner ? "action_candidate_not_observed" : "cmp_or_banner_not_observed",
      reasonCodes: hasCmpOrBanner ? ["reject_candidate_not_observed"] : ["cmp_or_banner_not_observed"],
    });
  }

  if (hasAcceptPath && hasCmpOrBanner) {
    plannedScenarios.push({
      scenario: "accept_all_flow",
      actionType: "accept_all",
      reasonCodes: input.baseline.bannerLikelyPresent
        ? ["cmp_or_banner_observed", "accept_or_preference_path_observed"]
        : consentSurfaceTextObserved
          ? ["consent_surface_text_observed", "accept_or_preference_path_probe"]
        : ["accept_or_preference_path_observed"],
    });
  } else {
    skippedScenarios.push({
      scenario: "accept_all_flow",
      actionType: "accept_all",
      skipReason: hasCmpOrBanner ? "action_candidate_not_observed" : "cmp_or_banner_not_observed",
      reasonCodes: hasCmpOrBanner ? ["accept_candidate_not_observed"] : ["cmp_or_banner_not_observed"],
    });
  }

  if (hasPrivacyControl) {
    plannedScenarios.push({
      scenario: "privacy_opt_out_flow",
      actionType: "do_not_sell_share",
      targetUrl: privacyTargetUrl,
      reasonCodes: privacyTargetUrl
        ? ["privacy_control_url_observed"]
        : ["baseline_privacy_choice_text_observed"],
    });
  } else {
    skippedScenarios.push({
      scenario: "privacy_opt_out_flow",
      actionType: "do_not_sell_share",
      skipReason: "privacy_control_not_observed",
      reasonCodes: ["privacy_control_not_observed"],
    });
  }

  if (formProbeEnabled) {
    plannedScenarios.push({
      scenario: "form_collection_probe",
      reasonCodes: ["capture_replay_form_probe_enabled"],
    });
  } else {
    skippedScenarios.push({
      scenario: "form_collection_probe",
      skipReason: "profile_not_enabled",
      reasonCodes: [captureReplay ? "form_probe_not_enabled_for_capture_replay" : "form_probe_not_enabled_for_normal_consent"],
    });
  }

  if (accessibilityProbeEnabled) {
    plannedScenarios.push({
      scenario: "accessibility_probe",
      reasonCodes: ["capture_replay_accessibility_probe_enabled"],
    });
  } else {
    skippedScenarios.push({
      scenario: "accessibility_probe",
      skipReason: "profile_not_enabled",
      reasonCodes: [captureReplay ? "accessibility_probe_not_enabled_for_capture_replay" : "accessibility_probe_not_enabled_for_normal_consent"],
    });
  }

  return planResult();

  function planResult(): ConsentScenarioPlan {
    return {
      plannedScenarios: plannedScenarios.sort(comparePlanItems),
      skippedScenarios: skippedScenarios.sort(comparePlanItems),
      policyPlanningStatus,
      plannerInputs: {
        baselineScenario: "baseline_pre_consent",
        captureReplay,
        seededPrivacyControlUrlCount,
        policyPrivacyControlUrlCount,
        baselineActionCandidateCount: input.baseline.actionCandidates.length,
        baselineLikelyBannerPresent: input.baseline.bannerLikelyPresent,
      },
      notes: policyPlanningStatus === "policy_surface_not_ready_for_planning"
        ? ["Policy surface results were not ready before the consent planner deadline."]
        : [],
    };
  }
}

export function comparePlanItems(
  left: { scenario: ConsentFlowScenario },
  right: { scenario: ConsentFlowScenario },
): number {
  return scenarioOrderIndex(left.scenario) - scenarioOrderIndex(right.scenario);
}

export function scenarioOrderIndex(scenario: ConsentFlowScenario): number {
  const index = consentScenarioOrder.indexOf(scenario);
  return index === -1 ? consentScenarioOrder.length : index;
}

function hasAnyAction(
  baseline: BaselinePlanningSummary,
  actionTypes: ConsentActionType[],
): boolean {
  return baseline.actionCandidates.some((candidate) =>
    actionTypes.includes(candidate.actionType) &&
    (candidate.shouldClick || candidate.confidence >= 0.78)
  );
}

function hasPrivacyText(baseline: BaselinePlanningSummary): boolean {
  const value = [
    baseline.textExcerpt,
    ...baseline.actionCandidates.flatMap((candidate) => [
      candidate.labelText,
      candidate.normalizedLabel,
      candidate.contextTextExcerpt,
    ]),
  ].filter(Boolean).join(" ").toLowerCase();
  return /do not sell|do not share|your privacy choices|privacy choices|opt[- ]out|targeted advertising/.test(value);
}

function hasConsentSurfaceText(baseline: BaselinePlanningSummary): boolean {
  const value = [
    baseline.textExcerpt,
    ...baseline.actionCandidates.flatMap((candidate) => [
      candidate.labelText,
      candidate.normalizedLabel,
      candidate.contextTextExcerpt,
    ]),
  ].filter(Boolean).join(" ").toLowerCase();
  return /cookie|consent|privacy preference|privacy choices|your privacy choices|manage preferences|tracking preferences|do not sell|do not share/.test(value);
}
