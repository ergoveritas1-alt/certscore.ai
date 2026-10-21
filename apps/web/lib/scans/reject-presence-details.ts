import { AFTER_REJECT_SCORING_POLICY, readAfterRejectScoringAssessment } from "./after-reject-scoring-contract";

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Factual presentation of the persisted assessment only; no raw evidence inference. */
export function projectRejectPresenceDetails(value: unknown) {
  const root = record(value);
  const retained = record(root?.retainedEvidence) ?? record(record(root?.criticalEvidence)?.retainedEvidence);
  const assessment = readAfterRejectScoringAssessment(retained?.afterRejectScoringAssessment);
  if (assessment?.policyVersion !== AFTER_REJECT_SCORING_POLICY || !assessment.entityEvidence?.observations.length) return [];
  return assessment.entityEvidence.observations.map(row => ({
    entity: row.entity ?? null, vendor: row.vendor ?? null, kind: row.kind, name: row.name,
    hostname: row.hostname ?? null, purpose: row.purpose, msAfterClick: row.msAfterClick, evidenceRef: row.evidenceRef,
  }));
}

/** Remove scoring diagnostics from customer evidence, preserving typed source data. */
export function factualCustomerEvidence(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(factualCustomerEvidence);
  const object = record(value);
  if (!object) return value;
  const rejectAssessment=typeof object.policyVersion==="string" && object.policyVersion.startsWith("after_reject_");
  return Object.fromEntries(Object.entries(object).filter(([key]) =>
    !(rejectAssessment && key==="tier") && !["deductionPoints", "policyDeductionPoints", "scoreEffect", "scoreEffects", "totalPolicyDeductionPoints"].includes(key))
    .map(([key, item]) => [key, factualCustomerEvidence(item)]));
}
