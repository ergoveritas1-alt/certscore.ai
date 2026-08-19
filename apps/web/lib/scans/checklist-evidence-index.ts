import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";

export type ChecklistEvidenceIndex = Record<string, Record<string, unknown>>;

const POLICY_SUMMARY_REF_KEY = "policySurfaceSummaryRef";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Stores repeated policy evidence once while leaving row-specific evidence in
 * place. This is transport normalization only: no retained field is removed
 * from the canonical evidence index.
 */
export function indexChecklistPolicyEvidence(
  rows: GdprEprivacyCoverageChecklistItem[],
): { evidenceIndex: ChecklistEvidenceIndex; rows: GdprEprivacyCoverageChecklistItem[] } {
  const evidenceIndex: ChecklistEvidenceIndex = {};
  const refBySerializedSummary = new Map<string, string>();
  const compactRows = rows.map((row) => {
    const retainedEvidence = record(row.criticalEvidence.retainedEvidence) ?? {};
    const policySurfaceSummary = record(
      retainedEvidence.policySurfaceSummary ?? retainedEvidence.policy_surface_summary,
    );
    if (!policySurfaceSummary) return row;

    const serialized = JSON.stringify(policySurfaceSummary);
    let ref = refBySerializedSummary.get(serialized);
    if (!ref) {
      ref = `policy_surface_summary_${refBySerializedSummary.size + 1}`;
      refBySerializedSummary.set(serialized, ref);
      evidenceIndex[ref] = policySurfaceSummary;
    }
    const {
      policySurfaceSummary: _camelSummary,
      policy_surface_summary: _snakeSummary,
      ...rowSpecificRetainedEvidence
    } = retainedEvidence;
    return {
      ...row,
      criticalEvidence: {
        ...row.criticalEvidence,
        retainedEvidence: {
          ...rowSpecificRetainedEvidence,
          [POLICY_SUMMARY_REF_KEY]: ref,
        },
      },
    };
  });
  return { evidenceIndex, rows: compactRows };
}

export function hydrateChecklistPolicyEvidence(
  rows: GdprEprivacyCoverageChecklistItem[],
  evidenceIndex: ChecklistEvidenceIndex | null | undefined,
) {
  if (!evidenceIndex || Object.keys(evidenceIndex).length === 0) return rows;
  return rows.map((row) => {
    const retainedEvidence = record(row.criticalEvidence.retainedEvidence) ?? {};
    const ref = typeof retainedEvidence[POLICY_SUMMARY_REF_KEY] === "string"
      ? retainedEvidence[POLICY_SUMMARY_REF_KEY]
      : null;
    const policySurfaceSummary = ref ? record(evidenceIndex[ref]) : null;
    if (!policySurfaceSummary) return row;
    const { [POLICY_SUMMARY_REF_KEY]: _ref, ...rowSpecificRetainedEvidence } = retainedEvidence;
    return {
      ...row,
      criticalEvidence: {
        ...row.criticalEvidence,
        retainedEvidence: {
          ...rowSpecificRetainedEvidence,
          policySurfaceSummary,
        },
      },
    };
  });
}
