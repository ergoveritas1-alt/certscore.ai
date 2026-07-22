"use server";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import type { CanonicalShadowScoreComparisonArtifact } from "../../lib/scans/canonical-shadow-score-artifact";
import type { StoredCanonicalShadowComparisonMetric } from "../../lib/scans/canonical-shadow-score-monitor";

const MAX_ARRAY_ITEMS = 32;
const MAX_MONITOR_ROWS = 5_000;

type InsertedRow = { id: string };

type StoredRow = {
  candidate_coverage_ratio: string | number;
  candidate_score: number | null;
  comparison_group_key: string | null;
  comparison_target_key: string | null;
  contradiction_types: string[];
  generated_at: string;
  input_projection_fingerprint: string | null;
  legacy_coverage_ratio: string | number;
  legacy_score: number | null;
  model_version: string;
  report_usable_evidence_ratio: string | number;
  scan_id: string;
  scan_source: string | null;
  scanner_region: string | null;
  score_delta: number | null;
  withholding_reasons: string[];
};

function boundedText(value: string, label: string, maxLength: number) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new Error(`${label} must contain between 1 and ${maxLength} characters.`);
  }
  return trimmed;
}

function boundedOptionalText(value: string | null, label: string, maxLength: number) {
  return value === null ? null : boundedText(value, label, maxLength);
}

function boundedArray(values: string[], label: string) {
  if (values.length > MAX_ARRAY_ITEMS) throw new Error(`${label} cannot exceed ${MAX_ARRAY_ITEMS} values.`);
  return [...new Set(values.map((value) => boundedText(value, label, 160)))].sort();
}

function canonicalSha256Fingerprint(value: string, label: string) {
  const bounded = boundedText(value, label, 160).toLowerCase();
  if (!/^(?:sha256:)?[a-f0-9]{64}$/.test(bounded)) {
    throw new Error(`${label} must be a SHA-256 digest.`);
  }
  return bounded.startsWith("sha256:") ? bounded : `sha256:${bounded}`;
}

export async function persistCanonicalShadowScoreComparison(
  artifact: CanonicalShadowScoreComparisonArtifact
) {
  const comparisonGroupKey = boundedOptionalText(
    artifact.context.comparisonGroupKey,
    "comparisonGroupKey",
    160
  );
  const comparisonTargetKey = boundedOptionalText(
    artifact.context.comparisonTargetKey,
    "comparisonTargetKey",
    160
  );
  if (comparisonGroupKey && !/^(?:sha256:)?[a-f0-9]{64}$/i.test(comparisonGroupKey)) {
    throw new Error("comparisonGroupKey must be a SHA-256 digest, never a domain name.");
  }
  if (comparisonTargetKey && !/^(?:sha256:)?[a-f0-9]{64}$/i.test(comparisonTargetKey)) {
    throw new Error("comparisonTargetKey must be a SHA-256 digest, never a URL.");
  }
  const contradictionTypes = boundedArray([
    ...artifact.candidate.contradictions,
    ...artifact.comparison.contradictions
  ], "contradictionType");
  const withholdingReasons = boundedArray(artifact.candidate.withheldReasons, "withholdingReason");
  const inputProjectionFingerprint = canonicalSha256Fingerprint(
    artifact.inputProjectionFingerprint,
    "inputProjectionFingerprint"
  );
  const inserted = await queryOne<InsertedRow>(
    `insert into public.scan_score_shadow_comparisons (
       scan_id,
       schema_version,
       model_version,
       legacy_score_version,
       candidate_status,
       candidate_score,
       legacy_score,
       score_delta,
       candidate_coverage_ratio,
       legacy_coverage_ratio,
       report_usable_evidence_ratio,
       contradiction_types,
       withholding_reasons,
       scanner_region,
       comparison_group_key,
       comparison_target_key,
       scan_source,
       input_projection_fingerprint,
       generated_at
     ) values (
       $1::uuid, $2, $3, $4, $5, $6::integer, $7::integer, $8::integer,
       $9::numeric, $10::numeric, $11::numeric, $12::text[], $13::text[],
       $14, $15, $16, $17, $18, $19::timestamptz
     )
     on conflict (scan_id, model_version) do nothing
     returning id`,
    [
      boundedText(artifact.scanId, "scanId", 80),
      boundedText(artifact.schemaVersion, "schemaVersion", 80),
      boundedText(artifact.candidate.modelVersion, "modelVersion", 120),
      boundedText(artifact.legacy.scoreVersion, "legacyScoreVersion", 120),
      artifact.candidate.postureScore === null ? "withheld" : "scored",
      artifact.candidate.postureScore,
      artifact.legacy.score,
      artifact.comparison.delta,
      artifact.candidate.coverageRatio,
      artifact.legacy.coverageRatio,
      artifact.comparison.coverage.reportUsableEvidenceRatio,
      contradictionTypes,
      withholdingReasons,
      boundedOptionalText(artifact.context.region, "scannerRegion", 80),
      comparisonGroupKey,
      comparisonTargetKey,
      boundedOptionalText(artifact.context.scanSource, "scanSource", 80),
      inputProjectionFingerprint,
      boundedText(artifact.generatedAt, "generatedAt", 80)
    ]
  );
  return { inserted: inserted !== null };
}

export async function loadCanonicalShadowScoreMonitoringMetrics(input: {
  modelVersion: string;
  windowHours?: number;
}) {
  const windowHours = input.windowHours ?? 168;
  if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > 24 * 90) {
    throw new Error("windowHours must be a whole number between 1 and 2160.");
  }
  const result = await query<StoredRow>(
    `select scan_id::text,
            model_version,
            candidate_score,
            legacy_score,
            score_delta,
            candidate_coverage_ratio,
            legacy_coverage_ratio,
            report_usable_evidence_ratio,
            contradiction_types,
            withholding_reasons,
            scanner_region,
            scan_source,
            comparison_group_key,
            comparison_target_key,
            input_projection_fingerprint,
            generated_at::text
       from public.scan_score_shadow_comparisons
      where model_version = $1
        and generated_at >= timezone('utc', now()) - ($2::integer * interval '1 hour')
      order by generated_at desc
      limit ${MAX_MONITOR_ROWS}`,
    [boundedText(input.modelVersion, "modelVersion", 120), windowHours],
    { readOnly: true }
  );
  return result.rows.map((row): StoredCanonicalShadowComparisonMetric => ({
    candidateCoverageRatio: Number(row.candidate_coverage_ratio),
    candidateScore: row.candidate_score,
    comparisonGroupKey: row.comparison_group_key,
    comparisonTargetKey: row.comparison_target_key,
    contradictionTypes: row.contradiction_types,
    generatedAt: row.generated_at,
    inputProjectionFingerprint: row.input_projection_fingerprint,
    legacyCoverageRatio: Number(row.legacy_coverage_ratio),
    legacyScore: row.legacy_score,
    modelVersion: row.model_version,
    region: row.scanner_region,
    reportUsableEvidenceRatio: Number(row.report_usable_evidence_ratio),
    scanId: row.scan_id,
    scanSource: row.scan_source,
    scoreDelta: row.score_delta,
    withholdingReasons: row.withholding_reasons
  }));
}
