"use server";

import { consentControlAssessmentSchema, type ConsentControlAssessment } from "@certscore/contracts";
import { query } from "@website-signal-risk-scanner/db";

const MAX_BATCH_SIZE = 500;

export type ConsentControlAssessmentWrite = {
  assessment: ConsentControlAssessment;
  scanId?: string;
};

function compatibilityState(assessment: ConsentControlAssessment, key: "accept" | "reject" | "options") {
  const state = assessment.controls[key].state;
  return state === "observed" ? true : state === "not_observed" ? false : null;
}

function normalizeWrite(input: ConsentControlAssessmentWrite) {
  const assessment = consentControlAssessmentSchema.parse(input.assessment);
  if (input.scanId && input.scanId !== assessment.scan.scanId) {
    throw new Error("scanId does not match the assessment scan identity.");
  }
  return {
    scanId: input.scanId ?? assessment.scan.scanId,
    assessment,
    accept: compatibilityState(assessment, "accept"),
    reject: compatibilityState(assessment, "reject"),
    options: compatibilityState(assessment, "options"),
    evidenceStatus:
      assessment.surface.status === "observed_actionable" ||
      assessment.surface.status === "observed_non_actionable"
        ? "observed"
        : assessment.surface.status === "not_observed"
          ? "not_observed"
          : "unknown",
  };
}

export async function upsertConsentControlAssessment(input: ConsentControlAssessmentWrite) {
  const row = normalizeWrite(input);
  const result = await query<{ scan_id: string }>(
    `
      update public.scan_snapshots
      set
        consent_control_assessment = $2::jsonb,
        consent_assessment_version = $3,
        consent_assessment_status = $4,
        consent_assessment_computed_at = $5::timestamptz,
        consent_assessment_source_hash = $6,
        consent_accept_observed = $7,
        consent_reject_observed = $8,
        consent_options_observed = $9,
        consent_evidence_status = $10,
        consent_coverage_status = $11,
        consent_surface_status = $12
      where scan_id = $1
        and (
          consent_assessment_computed_at is null
          or consent_assessment_computed_at <= $5::timestamptz
          or consent_assessment_source_hash is distinct from $6
        )
      returning scan_id
    `,
    [
      row.scanId,
      JSON.stringify(row.assessment),
      row.assessment.artifactVersion,
      row.assessment.assessmentStatus,
      row.assessment.provenance.computedAt,
      row.assessment.provenance.sourceHash,
      row.accept,
      row.reject,
      row.options,
      row.evidenceStatus,
      row.assessment.coverage.status,
      row.assessment.surface.status,
    ],
  );
  return result.rows[0]?.scan_id ?? null;
}

export async function upsertConsentControlAssessments(inputs: ConsentControlAssessmentWrite[]) {
  if (inputs.length > MAX_BATCH_SIZE) throw new Error(`Consent assessment batches cannot exceed ${MAX_BATCH_SIZE} rows.`);
  const results: string[] = [];
  for (const input of inputs) {
    const scanId = await upsertConsentControlAssessment(input);
    if (scanId) results.push(scanId);
  }
  return { attempted: inputs.length, persisted: results.length, scanIds: results };
}
