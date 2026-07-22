import type { CanonicalShadowScoreResult } from "./canonical-shadow-score";
import type { CanonicalShadowScoreProjectionComponents } from "./canonical-shadow-score-projection-fingerprint";

export const CANONICAL_SHADOW_SCORE_COMPARISON_SCHEMA_VERSION = "canonical-shadow-score-comparison.v6";

type LegacyScoreReference = {
  coverageConfidence: string;
  coverageRatio: number;
  reportInScopeRowCount: number;
  reportUsableEvidenceRatio: number;
  reportUsableRowCount: number;
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

function boundedRatio(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1.`);
  }
  return value;
}

function boundedRowCount(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > 256) {
    throw new Error(`${label} must be an integer between 0 and 256.`);
  }
  return value;
}

export function buildCanonicalShadowScoreComparisonArtifact(input: {
  acceptedComparisonDifferences?: string[];
  candidate: CanonicalShadowScoreResult;
  context?: {
    comparisonGroupKey?: string | null;
    comparisonTargetKey?: string | null;
    region?: string | null;
    scanSource?: string | null;
  };
  generatedAt: string;
  inputProjectionFingerprint: string;
  inputProjectionComponents: CanonicalShadowScoreProjectionComponents;
  legacy: LegacyScoreReference;
  scanId: string;
}) {
  const candidateScore = input.candidate.postureScore;
  const legacyScore = input.legacy.score;
  const legacyCoverageRatio = boundedRatio(input.legacy.coverageRatio, "legacy coverage ratio");
  const reportUsableEvidenceRatio = boundedRatio(
    input.legacy.reportUsableEvidenceRatio,
    "report usable evidence ratio"
  );
  const reportInScopeRowCount = boundedRowCount(
    input.legacy.reportInScopeRowCount,
    "report in-scope row count"
  );
  const reportUsableRowCount = boundedRowCount(
    input.legacy.reportUsableRowCount,
    "report usable row count"
  );
  if (reportUsableRowCount > reportInScopeRowCount) {
    throw new Error("Report usable row count cannot exceed the in-scope row count.");
  }
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
  const legacyCoverageDelta = legacyCoverageRatio - reportUsableEvidenceRatio;
  const comparisonDifferences = [
    ...(Math.abs(legacyCoverageDelta) > 0.000_001
      ? ["legacy_score_coverage_diverges_from_report_usable_evidence"]
      : [])
  ];
  const acceptedDifferenceSet = new Set(input.acceptedComparisonDifferences ?? []);
  const acceptedDifferences = comparisonDifferences.filter((difference) => acceptedDifferenceSet.has(difference));
  const comparisonContradictions = comparisonDifferences.filter((difference) => !acceptedDifferenceSet.has(difference));

  return {
    candidate: input.candidate,
    comparison: {
      absoluteDelta: delta === null ? null : Math.abs(delta),
      acceptedDifferences,
      contradictions: comparisonContradictions,
      coverage: {
        absoluteDelta: Math.abs(legacyCoverageDelta),
        legacyScoreInputCoverageRatio: legacyCoverageRatio,
        reportInScopeRowCount,
        reportUsableEvidenceRatio,
        reportUsableRowCount,
        status: comparisonDifferences.length === 0
          ? "aligned"
          : comparisonContradictions.length === 0
            ? "diverged_accepted"
            : "diverged_unresolved"
      },
      delta,
      status: comparisonStatus
    },
    context: {
      comparisonGroupKey: input.context?.comparisonGroupKey
        ? boundedText(input.context.comparisonGroupKey, 160)
        : null,
      comparisonTargetKey: input.context?.comparisonTargetKey
        ? boundedText(input.context.comparisonTargetKey, 160)
        : null,
      region: input.context?.region ? boundedText(input.context.region, 80) : null,
      scanSource: input.context?.scanSource ? boundedText(input.context.scanSource, 80) : null
    },
    generatedAt: boundedText(input.generatedAt, 80),
    inputProjectionFingerprint: boundedText(input.inputProjectionFingerprint, 160),
    inputProjectionComponents: {
      coverageProjectionFingerprint: boundedText(
        input.inputProjectionComponents.coverageProjectionFingerprint,
        160
      ),
      coverageRowCount: boundedRowCount(
        input.inputProjectionComponents.coverageRowCount,
        "coverage projection row count"
      ),
      findingProjectionFingerprint: boundedText(
        input.inputProjectionComponents.findingProjectionFingerprint,
        160
      ),
      findingCount: boundedRowCount(
        input.inputProjectionComponents.findingCount,
        "finding projection count"
      )
    },
    legacy: {
      coverageConfidence: boundedText(input.legacy.coverageConfidence, 40),
      coverageRatio: legacyCoverageRatio,
      score: legacyScore,
      scoreKind: boundedText(input.legacy.scoreKind, 80),
      scoreSource: boundedText(input.legacy.scoreSource, 160),
      scoreVersion: boundedText(input.legacy.scoreVersion, 120)
    },
    scanId: boundedText(input.scanId, 80),
    schemaVersion: CANONICAL_SHADOW_SCORE_COMPARISON_SCHEMA_VERSION,
    cutoverEligible: input.candidate.cutoverEligible && comparisonContradictions.length === 0
  };
}

export type CanonicalShadowScoreComparisonArtifact = ReturnType<
  typeof buildCanonicalShadowScoreComparisonArtifact
>;
