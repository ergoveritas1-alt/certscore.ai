import type {
  ArtifactRef,
  ConsentActionAttempt,
  ConsentActionRecipeResearchArtifact,
  ConsentActionType,
  ConsentFlowScenario,
  ConsentScenarioPlanningMode,
} from "@certscore/contracts";
import { consentActionRecipeResearchArtifactSchema } from "@certscore/contracts";
import type { ArtifactWriter } from "../artifact-writer.js";
import { internalJsonArtifactRef } from "./consent-scenario-artifacts.js";
import type { ConsentScenarioExecutionEntry } from "./consent-scenario-executor.js";

export interface ConsentRecipeResearchCandidate {
  candidateId: string;
  labelText: string;
  normalizedLabel: string;
  href?: string;
  domLocation?: string;
  frameKind?: "main_frame" | "sub_frame";
  frameUrl?: string;
  reasonCodes: string[];
  suggestedScenario?: ConsentFlowScenario;
  confidence: number;
}

export interface ConsentRecipeResearchCapture {
  scenario: ConsentFlowScenario;
  recipeResearchCandidates: ConsentRecipeResearchCandidate[];
  actionAttempts: ConsentActionAttempt[];
}

export async function writeConsentActionRecipeResearchArtifact(input: {
  artifactWriter: ArtifactWriter;
  mode: ConsentScenarioPlanningMode;
  sourceUrl: string;
  normalizedUrl: string;
  captures: ConsentRecipeResearchCapture[];
  executionEntries: ConsentScenarioExecutionEntry[];
}): Promise<ArtifactRef> {
  const baseline = input.captures.find((capture) => capture.scenario === "baseline_pre_consent");
  const retainedCandidates = (baseline?.recipeResearchCandidates ?? [])
    .sort((left, right) => right.confidence - left.confidence || left.candidateId.localeCompare(right.candidateId))
    .slice(0, 40);
  const hypotheses = buildHypotheses(retainedCandidates);
  const outcomes = input.executionEntries
    .filter((entry) => entry.scenario !== "baseline_pre_consent")
    .map((entry) => {
      const capture = input.captures.find((item) => item.scenario === entry.scenario);
      const attempt = entry.actionType
        ? capture?.actionAttempts.find((item) => item.actionType === entry.actionType)
        : undefined;
      return {
        scenario: entry.scenario,
        status: entry.status,
        actionType: entry.actionType,
        attempted: attempt?.attempted,
        succeeded: attempt?.succeeded,
        actionProofStatus: entry.actionProofStatus,
        actionPath: attempt?.actionProof?.actionPath,
        frameUrl: normalizeResearchUrl(attempt?.actionProof?.frameContext?.frameUrl),
        candidateLabelText: bounded(attempt?.actionProof?.candidateLabelText, 180),
        comparisonEligible: entry.comparisonEligible,
      };
    });
  const artifact = consentActionRecipeResearchArtifactSchema.parse({
    artifactVersion: "consent_action_recipe_research.v1",
    sourceScanner: "consent_flow_runtime",
    generatedAt: new Date().toISOString(),
    sourceUrl: input.sourceUrl,
    normalizedUrl: input.normalizedUrl,
    planningMode: input.mode,
    baseline: {
      scenario: "baseline_pre_consent",
      candidateCount: baseline?.recipeResearchCandidates.length ?? 0,
      retainedCandidateCount: retainedCandidates.length,
      candidates: retainedCandidates,
    },
    hypotheses,
    outcomes,
    hindsightMatches: hypotheses.map((hypothesis) => ({
      hypothesisId: hypothesis.hypothesisId,
      scenario: hypothesis.scenario,
      matched: hypothesisMatchesOutcome(hypothesis, outcomes),
      reasonCodes: hypothesisMatchReasons(hypothesis, outcomes),
    })),
    notes: [
      "Internal research artifact only. It evaluates whether compact baseline route candidates could support future Nano recipe assistance.",
    ],
  } satisfies ConsentActionRecipeResearchArtifact);
  const path = await input.artifactWriter.writeJsonArtifact("consent_action_recipe_research.json", artifact);
  return internalJsonArtifactRef("consent_action_recipe_research", path, "Consent action recipe research");
}

export function normalizeResearchCandidate(input: {
  candidateId: string;
  labelText: string;
  href?: string;
  domLocation?: string;
  frameKind?: "main_frame" | "sub_frame";
  frameUrl?: string;
}): ConsentRecipeResearchCandidate | undefined {
  const labelText = bounded(input.labelText.replace(/\s+/g, " ").trim(), 180) ?? "";
  if (labelText.length === 0) {
    return undefined;
  }
  const normalizedLabel = labelText.toLowerCase();
  const reasonCodes = recipeReasonCodes(normalizedLabel, input.href);
  if (reasonCodes.length === 0) {
    return undefined;
  }
  const suggestedScenario = suggestedScenarioForReasonCodes(reasonCodes);
  return {
    candidateId: input.candidateId,
    labelText,
    normalizedLabel,
    href: normalizeResearchUrl(input.href),
    domLocation: bounded(input.domLocation, 160),
    frameKind: input.frameKind,
    frameUrl: normalizeResearchUrl(input.frameUrl),
    reasonCodes,
    suggestedScenario,
    confidence: confidenceForReasonCodes(reasonCodes),
  };
}

function buildHypotheses(
  candidates: ConsentRecipeResearchCandidate[],
): ConsentActionRecipeResearchArtifact["hypotheses"] {
  const byScenario = new Map<ConsentFlowScenario, ConsentRecipeResearchCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.suggestedScenario) {
      continue;
    }
    byScenario.set(candidate.suggestedScenario, [
      ...(byScenario.get(candidate.suggestedScenario) ?? []),
      candidate,
    ]);
  }
  return [...byScenario.entries()].map(([scenario, scenarioCandidates]) => {
    const sorted = scenarioCandidates.sort((left, right) =>
      right.confidence - left.confidence || left.candidateId.localeCompare(right.candidateId)
    );
    const best = sorted[0];
    const actionType = actionTypeForScenario(scenario);
    return {
      hypothesisId: `baseline_recipe_${scenario}`,
      scenario,
      actionType,
      directNavigationUrl: best?.href,
      candidateIds: sorted.slice(0, 5).map((candidate) => candidate.candidateId),
      reasonCodes: [...new Set(sorted.flatMap((candidate) => candidate.reasonCodes))].sort(),
      confidence: Math.max(...sorted.map((candidate) => candidate.confidence)),
    };
  }).sort((left, right) => right.confidence - left.confidence || left.scenario.localeCompare(right.scenario));
}

function recipeReasonCodes(normalizedLabel: string, href: string | undefined): string[] {
  const value = `${normalizedLabel} ${href ?? ""}`.toLowerCase();
  const reasons: string[] = [];
  if (/privacy choices|your privacy choices|privacy\/your-privacy-choices|do not sell|do not share|opt[- ]out|targeted advertising/.test(value)) {
    reasons.push("privacy_choice_route_candidate");
  }
  if (/cookie settings|cookie preferences|manage preferences|privacy settings|consent preferences|preferences/.test(value)) {
    reasons.push("preference_center_route_candidate");
  }
  if (/reject|decline|deny|refuse|essential only|necessary only|opt[- ]out/.test(value)) {
    reasons.push("reject_action_candidate");
  }
  if (/accept all|accept cookies|allow all|agree to all|^accept$|^agree$/.test(value)) {
    reasons.push("accept_action_candidate");
  }
  return [...new Set(reasons)];
}

function suggestedScenarioForReasonCodes(reasonCodes: string[]): ConsentFlowScenario | undefined {
  if (reasonCodes.includes("privacy_choice_route_candidate")) {
    return "privacy_opt_out_flow";
  }
  if (reasonCodes.includes("reject_action_candidate") || reasonCodes.includes("preference_center_route_candidate")) {
    return "reject_all_flow";
  }
  if (reasonCodes.includes("accept_action_candidate")) {
    return "accept_all_flow";
  }
  return undefined;
}

function confidenceForReasonCodes(reasonCodes: string[]): number {
  if (reasonCodes.includes("privacy_choice_route_candidate")) {
    return 0.88;
  }
  if (reasonCodes.includes("reject_action_candidate")) {
    return 0.82;
  }
  if (reasonCodes.includes("preference_center_route_candidate")) {
    return 0.78;
  }
  if (reasonCodes.includes("accept_action_candidate")) {
    return 0.76;
  }
  return 0.5;
}

function actionTypeForScenario(scenario: ConsentFlowScenario): ConsentActionType | undefined {
  switch (scenario) {
    case "privacy_opt_out_flow":
      return "do_not_sell_share";
    case "reject_all_flow":
      return "reject_all";
    case "accept_all_flow":
      return "accept_all";
    default:
      return undefined;
  }
}

function hypothesisMatchesOutcome(
  hypothesis: ConsentActionRecipeResearchArtifact["hypotheses"][number],
  outcomes: ConsentActionRecipeResearchArtifact["outcomes"],
): boolean {
  const outcome = outcomes.find((item) => item.scenario === hypothesis.scenario);
  if (!outcome) {
    return false;
  }
  if (hypothesis.directNavigationUrl && outcome.frameUrl) {
    return sameOriginAndPath(hypothesis.directNavigationUrl, outcome.frameUrl);
  }
  return outcome.attempted === true || outcome.comparisonEligible === true;
}

function hypothesisMatchReasons(
  hypothesis: ConsentActionRecipeResearchArtifact["hypotheses"][number],
  outcomes: ConsentActionRecipeResearchArtifact["outcomes"],
): string[] {
  const outcome = outcomes.find((item) => item.scenario === hypothesis.scenario);
  if (!outcome) {
    return ["scenario_not_run"];
  }
  const reasons: string[] = [];
  if (hypothesis.directNavigationUrl && outcome.frameUrl && sameOriginAndPath(hypothesis.directNavigationUrl, outcome.frameUrl)) {
    reasons.push("direct_navigation_url_matched_action_frame");
  }
  if (outcome.attempted) {
    reasons.push("action_attempted");
  }
  if (outcome.succeeded) {
    reasons.push("action_succeeded");
  }
  if (outcome.comparisonEligible) {
    reasons.push("comparison_eligible");
  }
  return reasons.length > 0 ? reasons : ["no_hindsight_match"];
}

function sameOriginAndPath(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    return leftUrl.origin === rightUrl.origin && leftUrl.pathname === rightUrl.pathname;
  } catch {
    return left === right;
  }
}

function normalizeResearchUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = new URL(value);
    parsed.search = "";
    parsed.hash = "";
    return bounded(parsed.toString(), 500);
  } catch {
    return bounded(value, 500);
  }
}

function bounded(value: string | undefined, maxLength: number): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}
