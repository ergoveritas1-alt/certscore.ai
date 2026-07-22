import type { CanonicalShadowScoreResult } from "./canonical-shadow-score";

export const CANONICAL_SHADOW_SCORE_COMPARISON_SCHEMA_VERSION = "canonical-shadow-score-comparison.v2";

type LegacyScoreReference = {
  score: number | null;
  scoreKind: string;
  scoreSource: string;
  scoreVersion: string;
};

function boundedText(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new Error(`Comparison artifact text must contain between 1 and ${maxLength} characters.`);
  }
  return trimmed;
}

export function buildCanonicalShadowScoreComparisonArtifact(input: {
  candidate: CanonicalShadowScoreResult;
  context?: {
    comparisonGroupKey?: string | null;
    region?: string | null;
    scanSource?: string | null;
  };
  generatedAt: string;
  inputProjectionFingerprint: string;
  legacy: LegacyScoreReference;
  scanId: string;
}) {
  const candidateScore = input.candidate.postureScore;
  const legacyScore = input.legacy.score;
  const delta = candidateScore === null || legacyScore === null ? null : candidateScore - legacyScore;
  const comparisonStatus = candidateScore === null
    ? "candidate_withheld"
    : legacyScore === null
      ? "legacy_unavailable"
      : delta === 0
        ? "unchanged"
        : delta !== null && delta > 0
          ? "candidate_higher"
          : "candidate_lower";

  return {
    candidate: input.candidate,
    comparison: {
      absoluteDelta: delta === null ? null : Math.abs(delta),
      delta,
      status: comparisonStatus
    },
    context: {
      comparisonGroupKey: input.context?.comparisonGroupKey
        ? boundedText(input.context.comparisonGroupKey, 160)
        : null,
      region: input.context?.region ? boundedText(input.context.region, 80) : null,
      scanSource: input.context?.scanSource ? boundedText(input.context.scanSource, 80) : null
    },
    generatedAt: boundedText(input.generatedAt, 80),
    inputProjectionFingerprint: boundedText(input.inputProjectionFingerprint, 160),
    legacy: {
      score: legacyScore,
      scoreKind: boundedText(input.legacy.scoreKind, 80),
      scoreSource: boundedText(input.legacy.scoreSource, 160),
      scoreVersion: boundedText(input.legacy.scoreVersion, 120)
    },
    scanId: boundedText(input.scanId, 80),
    schemaVersion: CANONICAL_SHADOW_SCORE_COMPARISON_SCHEMA_VERSION
  };
}

export type CanonicalShadowScoreComparisonArtifact = ReturnType<
  typeof buildCanonicalShadowScoreComparisonArtifact
>;
