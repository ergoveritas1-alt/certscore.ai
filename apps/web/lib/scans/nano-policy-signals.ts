import { POLICY_POSITIVE_SIGNAL_SPECS } from "./policy-positive-signal-contract";
import { derivePositivePolicySignalMap } from "../../server/scans/policy-enrichment-normalization";

export type PersistedNanoSignalRow = {
  confidence: number | null;
  evidence_refs: string[];
  key: string;
  label: string;
  population_status: "present" | "missing" | "conflicting" | "insufficient";
  provenance_detail: string;
  report_signal_source: "policy_enrichment_signal";
  value: boolean | number | string | string[];
};

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getPageType(row: Record<string, unknown>) {
  return getString(row.page_type) ?? getString(row.pageType);
}

function getPageUrl(row: Record<string, unknown>) {
  return getString(row.page_url) ?? getString(row.pageUrl);
}

function getPolicySemanticConfidence(row: Record<string, unknown>) {
  const value = getNumber(row.policy_semantic_confidence) ?? getNumber(row.policySemanticConfidence);
  return typeof value === "number" ? Math.max(0, Math.min(1, value)) : null;
}

function getPolicyAmbiguityScore(row: Record<string, unknown>) {
  return getNumber(row.policy_ambiguity_score) ?? getNumber(row.policyAmbiguityScore);
}

function getPolicyChildrenReference(row: Record<string, unknown>) {
  return getString(row.policy_children_reference) ?? getString(row.policyChildrenReference);
}

function getPolicyActionableFlags(row: Record<string, unknown>) {
  return getStringArray(row.policy_actionable_flags ?? row.policyActionableFlags);
}

function getPolicyRightsSignals(row: Record<string, unknown>) {
  return getStringArray(row.policy_rights_signals ?? row.policyRightsSignals);
}

function getPrimaryPolicyRow(rows: Array<Record<string, unknown>>) {
  return rows.find((row) => getPageType(row) === "privacy_policy") ?? rows[0] ?? null;
}

function getRowsForPageType(rows: Array<Record<string, unknown>>, pageType: string) {
  return rows.filter((row) => getPageType(row) === pageType);
}

function buildPolicyRowEvidenceRefs(rows: Array<Record<string, unknown>>) {
  return uniqueStrings(rows.map(getPageUrl));
}

function buildPolicyRowConfidence(rows: Array<Record<string, unknown>>) {
  const values = rows.map(getPolicySemanticConfidence).filter((value): value is number => typeof value === "number");
  return values.length > 0 ? Math.max(...values) : null;
}

export function buildNanoPolicySignalRows(input: {
  policyEnrichments: Array<Record<string, unknown>>;
}) {
  const primaryPolicyRow = getPrimaryPolicyRow(input.policyEnrichments);
  if (!primaryPolicyRow) {
    return [] as PersistedNanoSignalRow[];
  }

  const positiveSignalMap = derivePositivePolicySignalMap({
    policyEnrichment: input.policyEnrichments,
    primaryPolicyEnrichment: primaryPolicyRow
  });
  const rows: PersistedNanoSignalRow[] = [];

  for (const spec of POLICY_POSITIVE_SIGNAL_SPECS) {
    if (positiveSignalMap.get(spec.canonicalSignalKey) !== true) {
      continue;
    }

    const sourceRows = getRowsForPageType(input.policyEnrichments, spec.pageType);
    rows.push({
      confidence: buildPolicyRowConfidence(sourceRows),
      evidence_refs: buildPolicyRowEvidenceRefs(sourceRows),
      key: spec.canonicalSignalKey,
      label: spec.label,
      population_status: "present",
      provenance_detail: `policy_enrichment.${spec.pageType}`,
      report_signal_source: "policy_enrichment_signal",
      value: true
    });
  }

  const primaryPolicyConfidence = getPolicySemanticConfidence(primaryPolicyRow);
  const primaryPolicyFlags = getPolicyActionableFlags(primaryPolicyRow);
  if (
    (typeof primaryPolicyConfidence === "number" && primaryPolicyConfidence < 0.6) ||
    primaryPolicyFlags.includes("low_confidence") ||
    primaryPolicyFlags.includes("llm_provider_error")
  ) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: buildPolicyRowEvidenceRefs([primaryPolicyRow]),
      key: "policySemanticConfidence",
      label: "Policy semantic confidence",
      population_status: "present",
      provenance_detail: "policy_enrichment.privacy_policy",
      report_signal_source: "policy_enrichment_signal",
      value: primaryPolicyConfidence ?? 0
    });
  }

  const primaryPolicyAmbiguityScore = getPolicyAmbiguityScore(primaryPolicyRow);
  if (typeof primaryPolicyAmbiguityScore === "number" && primaryPolicyAmbiguityScore >= 50) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: buildPolicyRowEvidenceRefs([primaryPolicyRow]),
      key: "policyAmbiguityScore",
      label: "Policy ambiguity score",
      population_status: "present",
      provenance_detail: "policy_enrichment.privacy_policy",
      report_signal_source: "policy_enrichment_signal",
      value: primaryPolicyAmbiguityScore
    });
  }

  const policyRightsSignals = getPolicyRightsSignals(primaryPolicyRow);
  if (policyRightsSignals.length > 0) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: buildPolicyRowEvidenceRefs([primaryPolicyRow]),
      key: "policyRightsSignals",
      label: "Policy rights signals",
      population_status: "present",
      provenance_detail: "policy_enrichment.privacy_policy",
      report_signal_source: "policy_enrichment_signal",
      value: policyRightsSignals
    });
  }

  const policyChildrenReference = getPolicyChildrenReference(primaryPolicyRow);
  if (policyChildrenReference && !["none", "unknown"].includes(policyChildrenReference.toLowerCase())) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: buildPolicyRowEvidenceRefs([primaryPolicyRow]),
      key: "policyChildrenReference",
      label: "Policy children reference",
      population_status: "present",
      provenance_detail: "policy_enrichment.privacy_policy",
      report_signal_source: "policy_enrichment_signal",
      value: policyChildrenReference
    });
  }

  return rows.sort((left, right) => left.key.localeCompare(right.key));
}
