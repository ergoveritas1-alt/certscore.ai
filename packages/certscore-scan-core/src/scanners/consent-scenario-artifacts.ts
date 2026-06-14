import type {
  ArtifactRef,
  ConsentFlowScenario,
  ConsentScenarioExecutionArtifact,
  ConsentScenarioPlanArtifact,
  ConsentScenarioPlanningMode,
  ConsentScenarioPolicyPlanningStatus,
} from "@certscore/contracts";
import {
  consentScenarioExecutionArtifactSchema,
  consentScenarioPlanArtifactSchema,
} from "@certscore/contracts";
import type { ArtifactWriter } from "../artifact-writer.js";
import type { ConsentScenarioExecutionEntry } from "./consent-scenario-executor.js";
import type { ConsentScenarioPlan } from "./consent-scenario-planner.js";

const SOURCE_SCANNER = "consent_flow_runtime";

export async function writeConsentScenarioPlanArtifact(input: {
  artifactWriter: ArtifactWriter;
  mode: ConsentScenarioPlanningMode;
  sourceUrl: string;
  normalizedUrl: string;
  plan: ConsentScenarioPlan;
  scenarioConcurrency?: number;
  policyPlanningDeadlineMs?: number;
  consentFlowDeadlineMs?: number;
}): Promise<ArtifactRef> {
  const artifact = consentScenarioPlanArtifactSchema.parse({
    artifactVersion: "consent_scenario_plan.v1",
    sourceScanner: SOURCE_SCANNER,
    planningMode: input.mode,
    generatedAt: new Date().toISOString(),
    sourceUrl: input.sourceUrl,
    normalizedUrl: input.normalizedUrl,
    policyPlanningStatus: input.plan.policyPlanningStatus,
    deadlines: {
      policyPlanningDeadlineMs: input.policyPlanningDeadlineMs,
      consentFlowDeadlineMs: input.consentFlowDeadlineMs,
      scenarioConcurrency: input.scenarioConcurrency,
    },
    plannedScenarios: input.plan.plannedScenarios,
    skippedScenarios: input.plan.skippedScenarios,
    plannerInputs: input.plan.plannerInputs,
    notes: input.plan.notes,
  } satisfies ConsentScenarioPlanArtifact);
  const path = await input.artifactWriter.writeJsonArtifact("consent_scenario_plan.json", artifact);
  return internalJsonArtifactRef("consent_scenario_plan", path, "Consent scenario plan");
}

export async function writeConsentScenarioExecutionArtifact(input: {
  artifactWriter: ArtifactWriter;
  mode: ConsentScenarioPlanningMode;
  sourceUrl: string;
  normalizedUrl: string;
  policyPlanningStatus: ConsentScenarioPolicyPlanningStatus;
  executionEntries: ConsentScenarioExecutionEntry[];
  notes?: string[];
}): Promise<ArtifactRef> {
  const healthSummary = {
    completed: input.executionEntries.filter((entry) => entry.status === "completed").length,
    failed: input.executionEntries.filter((entry) => entry.status === "failed").length,
    skipped: input.executionEntries.filter((entry) => entry.status === "skipped").length,
    comparisonEligible: input.executionEntries.filter((entry) => entry.comparisonEligible).length,
    deadlineHit: input.executionEntries.some((entry) => entry.deadlineHit),
    policyLate: input.policyPlanningStatus === "policy_surface_not_ready_for_planning",
  };
  const artifact = consentScenarioExecutionArtifactSchema.parse({
    artifactVersion: "consent_scenario_execution.v1",
    sourceScanner: SOURCE_SCANNER,
    planningMode: input.mode,
    generatedAt: new Date().toISOString(),
    sourceUrl: input.sourceUrl,
    normalizedUrl: input.normalizedUrl,
    policyPlanningStatus: input.policyPlanningStatus,
    healthSummary,
    scenarios: input.executionEntries.map((entry) => ({
      ...entry,
      phaseTimings: entry.phaseTimings ?? [],
    })),
    notes: input.notes ?? [],
  } satisfies ConsentScenarioExecutionArtifact);
  const path = await input.artifactWriter.writeJsonArtifact("consent_scenario_execution.json", artifact);
  return internalJsonArtifactRef("consent_scenario_execution", path, "Consent scenario execution");
}

export function internalJsonArtifactRef(
  artifactId: string,
  path: string,
  label: string,
): ArtifactRef {
  return {
    artifactId,
    artifactType: "json",
    path,
    createdAt: new Date().toISOString(),
    sourceScanner: SOURCE_SCANNER,
    sensitivity: "internal_only",
    redactionStatus: "internal_only",
    relatedEventIds: [],
    label,
  };
}

export function scenarioCoverageAreas(scenario: ConsentFlowScenario): string[] {
  switch (scenario) {
    case "baseline_pre_consent":
      return [
        "cookies_storage_before_consent",
        "third_party_tracking_before_consent",
        "runtime_vendor_disclosure_context",
      ];
    case "gpc_enabled":
      return ["gpc_context"];
    case "reject_all_flow":
      return ["cmp_first_layer_accept_reject", "post_reject_tracking", "gdpr_eprivacy_tracking_after_refusal"];
    case "accept_all_flow":
      return ["cmp_first_layer_accept_reject", "post_accept_behavior"];
    case "privacy_opt_out_flow":
      return ["privacy_opt_out", "ccpa_cpra_do_not_sell_share_behavior"];
    case "form_collection_probe":
      return ["form_collection_probe", "notice_at_collection"];
    case "accessibility_probe":
      return ["accessibility_probe", "consent_privacy_control_accessibility"];
    default:
      return [];
  }
}
