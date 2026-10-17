import { apiV2PostureScoresSchema, type ApiV2PostureScores } from "@certscore/api-contracts";
import {
  CALIFORNIA_REGULATORY_SCORE_VERSION,
  type CaliforniaRegulatoryScore,
} from "../scans/california-regulatory-score";

/** Labels the existing EU-weighted score and the independently derived California score. */
export function buildApiV2PostureScores(input: {
  score: number | null;
  scoreExplanation?: { score: number; policyVersion: string } | null;
  californiaScore?: CaliforniaRegulatoryScore | null;
}): ApiV2PostureScores {
  const california = input.californiaScore;
  return apiV2PostureScoresSchema.parse({
    contractVersion: "certscore.posture-scores.v1",
    gdprEprivacy: {
      posture: "gdpr_eprivacy",
      score: input.score,
      policyVersion: input.score !== null && input.scoreExplanation?.score === input.score
        ? input.scoreExplanation.policyVersion : null,
      coverage: input.score === null ? "unavailable" : "scored",
      scope: "starting_page",
    },
    ccpaCpra: {
      posture: "ccpa_cpra",
      score: california?.score ?? null,
      policyVersion: california?.policyVersion ?? CALIFORNIA_REGULATORY_SCORE_VERSION,
      coverage: california?.coverage ?? "unavailable",
      scope: "starting_page",
    },
  });
}
