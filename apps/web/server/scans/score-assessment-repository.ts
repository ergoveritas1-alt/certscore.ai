"use server";

import { query, queryOne } from "@website-signal-risk-scanner/db";

export type VersionedScoreAssessmentInput = {
  coverageConfidence: "high" | "medium" | "low" | "insufficient";
  coverageRatio: number;
  inputFindingIds: string[];
  inputProjectionFingerprint?: string | null;
  scanId: string;
  scoreKind: "california_evidence" | "gdpr_eprivacy_evidence";
  scoreSource: string;
  scoreValue: number | null;
  scoreVersion: string;
  scoredAt: string;
  withholdingReason?: string | null;
};

type VersionedScoreAssessmentRow = {
  created_at: string;
  id: string;
};

export type StoredVersionedScoreAssessment = {
  coverageConfidence: VersionedScoreAssessmentInput["coverageConfidence"];
  coverageRatio: number;
  scanId: string;
  scoreKind: VersionedScoreAssessmentInput["scoreKind"];
  scoreSource: string;
  scoreStatus: "scored" | "withheld";
  scoreValue: number | null;
  scoreVersion: string;
  scoredAt: string;
  withholdingReason: string | null;
};

type StoredVersionedScoreAssessmentRow = {
  coverage_confidence: StoredVersionedScoreAssessment["coverageConfidence"];
  coverage_ratio: string | number;
  scan_id: string;
  score_kind: StoredVersionedScoreAssessment["scoreKind"];
  score_source: string;
  score_status: StoredVersionedScoreAssessment["scoreStatus"];
  score_value: number | null;
  score_version: string;
  scored_at: string;
  withholding_reason: string | null;
};

const MAX_INPUT_FINDING_IDS = 256;
const MAX_SCAN_IDS = 2_000;

function assertBoundedText(value: string, label: string, maxLength: number) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new Error(`${label} must contain between 1 and ${maxLength} characters.`);
  }
  return trimmed;
}

function normalizeScoreAssessment(input: VersionedScoreAssessmentInput) {
  if (!["high", "medium", "low", "insufficient"].includes(input.coverageConfidence)) {
    throw new Error("coverageConfidence is not supported.");
  }
  if (!Number.isFinite(input.coverageRatio) || input.coverageRatio < 0 || input.coverageRatio > 1) {
    throw new Error("coverageRatio must be between 0 and 1.");
  }
  if (input.scoreValue !== null && (!Number.isInteger(input.scoreValue) || input.scoreValue < 0 || input.scoreValue > 100)) {
    throw new Error("scoreValue must be a whole number between 0 and 100, or null when withheld.");
  }
  if (input.inputFindingIds.length > MAX_INPUT_FINDING_IDS) {
    throw new Error(`inputFindingIds cannot contain more than ${MAX_INPUT_FINDING_IDS} entries.`);
  }

  const withholdingReason = input.scoreValue === null
    ? assertBoundedText(input.withholdingReason ?? "", "withholdingReason", 500)
    : null;
  if (input.scoreValue !== null && input.withholdingReason) {
    throw new Error("withholdingReason must be omitted when a score is available.");
  }

  return {
    coverageConfidence: input.coverageConfidence,
    coverageRatio: input.coverageRatio,
    inputFindingIds: [...new Set(input.inputFindingIds.map((id) => assertBoundedText(id, "inputFindingId", 200)))].sort(),
    inputProjectionFingerprint: input.inputProjectionFingerprint
      ? assertBoundedText(input.inputProjectionFingerprint, "inputProjectionFingerprint", 160)
      : null,
    scanId: assertBoundedText(input.scanId, "scanId", 80),
    scoreKind: input.scoreKind,
    scoreSource: assertBoundedText(input.scoreSource, "scoreSource", 160),
    scoreStatus: input.scoreValue === null ? "withheld" as const : "scored" as const,
    scoreValue: input.scoreValue,
    scoreVersion: assertBoundedText(input.scoreVersion, "scoreVersion", 120),
    scoredAt: assertBoundedText(input.scoredAt, "scoredAt", 80),
    withholdingReason
  };
}

export async function persistVersionedScoreAssessment(input: VersionedScoreAssessmentInput) {
  const assessment = normalizeScoreAssessment(input);
  const inserted = await queryOne<VersionedScoreAssessmentRow>(
    `insert into public.scan_score_assessments (
       scan_id,
       score_kind,
       score_version,
       score_source,
       score_status,
       score_value,
       coverage_ratio,
       coverage_confidence,
       withholding_reason,
       input_finding_ids,
       input_projection_fingerprint,
       scored_at
     ) values (
       $1::uuid,
       $2,
       $3,
       $4,
       $5,
       $6::integer,
       $7::numeric,
       $8,
       $9,
       $10::text[],
       $11,
       $12::timestamptz
     )
     on conflict (scan_id, score_kind, score_version) do nothing
     returning id, created_at`,
    [
      assessment.scanId,
      assessment.scoreKind,
      assessment.scoreVersion,
      assessment.scoreSource,
      assessment.scoreStatus,
      assessment.scoreValue,
      assessment.coverageRatio,
      assessment.coverageConfidence,
      assessment.withholdingReason,
      assessment.inputFindingIds,
      assessment.inputProjectionFingerprint,
      assessment.scoredAt
    ]
  );

  return {
    createdAt: inserted?.created_at ?? null,
    id: inserted?.id ?? null,
    inserted: inserted !== null
  };
}

export async function loadLatestVersionedScoreAssessments(input: {
  scanIds: string[];
  scoreKind: VersionedScoreAssessmentInput["scoreKind"];
}) {
  const scanIds = [...new Set(input.scanIds)].slice(0, MAX_SCAN_IDS);
  if (scanIds.length === 0) return new Map<string, StoredVersionedScoreAssessment>();
  const result = await query<StoredVersionedScoreAssessmentRow>(
    `select distinct on (scan_id)
            scan_id::text,
            score_kind,
            score_version,
            score_source,
            score_status,
            score_value,
            coverage_ratio,
            coverage_confidence,
            withholding_reason,
            scored_at::text
       from public.scan_score_assessments
      where scan_id = any($1::uuid[])
        and score_kind = $2
      order by scan_id, scored_at desc, created_at desc`,
    [scanIds, input.scoreKind],
    { readOnly: true }
  );
  return new Map(result.rows.map((row) => [row.scan_id, {
    coverageConfidence: row.coverage_confidence,
    coverageRatio: Number(row.coverage_ratio),
    scanId: row.scan_id,
    scoreKind: row.score_kind,
    scoreSource: row.score_source,
    scoreStatus: row.score_status,
    scoreValue: row.score_value,
    scoreVersion: row.score_version,
    scoredAt: row.scored_at,
    withholdingReason: row.withholding_reason
  }]));
}
