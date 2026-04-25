import { POLICY_POSITIVE_SIGNAL_SPECS } from "./policy-positive-signal-contract";
import { derivePositivePolicySignalMap } from "../../server/scans/policy-enrichment-normalization";
import {
  getFirstPolicyRowByPageTypes,
  getPolicyActionableFlags,
  getPolicyAmbiguityScore,
  getPolicyChildrenReference,
  getPolicyCookieDisclosures,
  getPolicyCoverageRatio,
  getPolicyDsarMechanism,
  getPolicyDoNotSell,
  getPolicyMentions,
  getPolicyPageType,
  getPolicyPageUrl,
  getPolicyRowEvidenceRefs,
  getPolicyRowsForPageType,
  getPolicyRightsSignals,
  getPolicySemanticConfidence,
  getPolicySnippetCount,
  getPolicyStructurallyWeak,
  getPolicySummaryText,
  getPrimaryPolicyEnrichmentRow,
  getPrivacyContactChannelType
} from "./policy-enrichment-row";
import {
  buildCookieDisclosureGapEvidence,
  buildRuntimeCookieInventory
} from "./runtime-cookie-evidence";

export type PersistedNanoSignalRow = {
  confidence: number | null;
  evidence_refs: string[];
  key: string;
  label: string;
  population_status: "present" | "missing" | "conflicting" | "insufficient";
  provenance_detail: string;
  report_signal_source: "document_semantic_signal";
  value: boolean | number | string | string[];
};

export const MANAGED_NANO_POLICY_SIGNAL_KEYS = new Set([
  ...POLICY_POSITIVE_SIGNAL_SPECS.map((spec) => spec.canonicalSignalKey),
  "policyActionableFlags",
  "policySemanticConfidence",
  "policyAmbiguityScore",
  "policyDsarMechanism",
  "policyDoNotSell",
  "privacyContactChannelType",
  "privacy.privacy_contact_path_present",
  "policyRightsSignals",
  "policyChildrenReference",
  "policyBehaviorConflictCandidate",
  "disclosure.policy_runtime_disclosure_likely_obstructed",
  "disclosure.cookie_policy_structurally_obstructed",
  "cookieRuntimeNames",
  "cookieDisclosedNames",
  "cookieDisclosedProviders",
  "cookieUnmatchedNames",
  "cookieUnmatchedVendors",
  "cookieUnmatchedCategories",
  "cookieUnmatchedCount",
  "cookieUnmatchedThirdPartyCount",
  "disclosure.policy_runtime_missing_technical_disclosure_detected",
  "privacy.cookie_runtime_disclosure_gap_detected",
  "privacy.policy_runtime_functional_misalignment_detected"
]);

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasSparsePolicyExtraction(input: {
  confidence: number | null;
  coverageRatio?: number | null;
  flags: string[];
  mentions: unknown[];
  snippetCount?: number | null;
  structurallyWeak?: boolean | null;
  summaryShort: string | null;
}) {
  if (input.structurallyWeak === true) {
    return true;
  }
  if (input.confidence !== null && input.confidence < 0.6) {
    return true;
  }
  if (input.coverageRatio !== null && input.coverageRatio !== undefined && input.coverageRatio < 0.5) {
    return true;
  }
  if (input.flags.includes("llm_provider_error") || input.flags.includes("low_confidence")) {
    return true;
  }
  if (input.snippetCount !== null && input.snippetCount !== undefined && input.snippetCount === 0) {
    return true;
  }
  if (input.mentions.length === 0) {
    return true;
  }
  return typeof input.summaryShort !== "string" || input.summaryShort.trim().length === 0;
}

function buildPolicyRowConfidence(rows: Array<Record<string, unknown>>) {
  const values = rows.map(getPolicySemanticConfidence).filter((value): value is number => typeof value === "number");
  return values.length > 0 ? Math.max(...values) : null;
}

export function buildNanoPolicySignalRows(input: {
  policyEnrichments: Array<Record<string, unknown>>;
  policyReviewQueue?: Array<Record<string, unknown>>;
  runtimeArtifacts?: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
}) {
  const primaryPolicyRow = getPrimaryPolicyEnrichmentRow(input.policyEnrichments);
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

    const sourceRows = getPolicyRowsForPageType(input.policyEnrichments, spec.pageType);
    rows.push({
      confidence: buildPolicyRowConfidence(sourceRows),
      evidence_refs: getPolicyRowEvidenceRefs(sourceRows),
      key: spec.canonicalSignalKey,
      label: spec.label,
      population_status: "present",
      provenance_detail: `policy_enrichment.${spec.pageType}`,
      report_signal_source: "document_semantic_signal",
      value: true
    });
  }

  const primaryPolicyConfidence = getPolicySemanticConfidence(primaryPolicyRow);
  const primaryPolicyFlags = getPolicyActionableFlags(primaryPolicyRow);
  const primaryPolicyDsarMechanism = getPolicyDsarMechanism(primaryPolicyRow);
  const primaryPolicyDoNotSell = getPolicyDoNotSell(primaryPolicyRow);
  const primaryPrivacyContactChannelType = getPrivacyContactChannelType(primaryPolicyRow);

  if (primaryPolicyFlags.length > 0) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: getPolicyRowEvidenceRefs([primaryPolicyRow]),
      key: "policyActionableFlags",
      label: "Policy actionable flags",
      population_status: "present",
      provenance_detail: "policy_enrichment.privacy_policy",
      report_signal_source: "document_semantic_signal",
      value: primaryPolicyFlags
    });
  }

  if (
    (typeof primaryPolicyConfidence === "number" && primaryPolicyConfidence < 0.6) ||
    primaryPolicyFlags.includes("low_confidence") ||
    primaryPolicyFlags.includes("llm_provider_error")
  ) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: getPolicyRowEvidenceRefs([primaryPolicyRow]),
      key: "policySemanticConfidence",
      label: "Policy semantic confidence",
      population_status: "present",
      provenance_detail: "policy_enrichment.privacy_policy",
      report_signal_source: "document_semantic_signal",
      value: primaryPolicyConfidence ?? 0
    });
  }

  const primaryPolicyAmbiguityScore = getPolicyAmbiguityScore(primaryPolicyRow);
  if (typeof primaryPolicyAmbiguityScore === "number" && primaryPolicyAmbiguityScore >= 50) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: getPolicyRowEvidenceRefs([primaryPolicyRow]),
      key: "policyAmbiguityScore",
      label: "Policy ambiguity score",
      population_status: "present",
      provenance_detail: "policy_enrichment.privacy_policy",
      report_signal_source: "document_semantic_signal",
      value: primaryPolicyAmbiguityScore
    });
  }

  if (primaryPolicyDsarMechanism) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: getPolicyRowEvidenceRefs([primaryPolicyRow]),
      key: "policyDsarMechanism",
      label: "Policy DSAR mechanism",
      population_status: "present",
      provenance_detail: "policy_enrichment.privacy_policy",
      report_signal_source: "document_semantic_signal",
      value: primaryPolicyDsarMechanism
    });
  }

  if (primaryPrivacyContactChannelType) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: getPolicyRowEvidenceRefs([primaryPolicyRow]),
      key: "privacyContactChannelType",
      label: "Privacy contact channel type",
      population_status: "present",
      provenance_detail: "policy_enrichment.privacy_policy",
      report_signal_source: "document_semantic_signal",
      value: primaryPrivacyContactChannelType
    });
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: getPolicyRowEvidenceRefs([primaryPolicyRow]),
      key: "privacy.privacy_contact_path_present",
      label: "Privacy contact path present",
      population_status: "present",
      provenance_detail: "policy_enrichment.privacy_policy",
      report_signal_source: "document_semantic_signal",
      value: true
    });
  }

  if (primaryPolicyDoNotSell) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: getPolicyRowEvidenceRefs([primaryPolicyRow]),
      key: "policyDoNotSell",
      label: "Policy do-not-sell posture",
      population_status: "present",
      provenance_detail: "policy_enrichment.privacy_policy",
      report_signal_source: "document_semantic_signal",
      value: primaryPolicyDoNotSell
    });
  }

  const policyRightsSignals = getPolicyRightsSignals(primaryPolicyRow);
  if (policyRightsSignals.length > 0) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: getPolicyRowEvidenceRefs([primaryPolicyRow]),
      key: "policyRightsSignals",
      label: "Policy rights signals",
      population_status: "present",
      provenance_detail: "policy_enrichment.privacy_policy",
      report_signal_source: "document_semantic_signal",
      value: policyRightsSignals
    });
  }

  const policyChildrenReference = getPolicyChildrenReference(primaryPolicyRow);
  if (policyChildrenReference && !["none", "unknown"].includes(policyChildrenReference.toLowerCase())) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: getPolicyRowEvidenceRefs([primaryPolicyRow]),
      key: "policyChildrenReference",
      label: "Policy children reference",
      population_status: "present",
      provenance_detail: "policy_enrichment.privacy_policy",
      report_signal_source: "document_semantic_signal",
      value: policyChildrenReference
    });
  }

  const policyReviewReasons = new Set(
    (input.policyReviewQueue ?? [])
      .map((row) => getString(row.reason))
      .filter((value): value is string => typeof value === "string")
  );
  if (policyReviewReasons.has("policy_behavior_conflict_candidate")) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: getPolicyRowEvidenceRefs(input.policyEnrichments),
      key: "policyBehaviorConflictCandidate",
      label: "Policy behavior conflict candidate",
      population_status: "present",
      provenance_detail: "policy_review_queue.policy_behavior_conflict_candidate",
      report_signal_source: "document_semantic_signal",
      value: true
    });
  }

  const cookiePolicyRow = getFirstPolicyRowByPageTypes(input.policyEnrichments, ["cookie_policy"]);
  const runtimeCookieInventory = buildRuntimeCookieInventory({ runtimeArtifacts: input.runtimeArtifacts });
  if (cookiePolicyRow && runtimeCookieInventory.cookieNames.length > 0) {
    const cookieDisclosures = getPolicyCookieDisclosures(cookiePolicyRow);
    const cookieFlags = getPolicyActionableFlags(cookiePolicyRow);
    const cookieConfidence = getPolicySemanticConfidence(cookiePolicyRow);
    const cookieGapEvidence = buildCookieDisclosureGapEvidence({
      cookiePolicyUrl: getPolicyPageUrl(cookiePolicyRow),
      disclosures: cookieDisclosures,
      inventory: runtimeCookieInventory
    });
    const cookieStructurallyWeak =
      cookieDisclosures.length === 0 ||
      (cookieConfidence !== null && cookieConfidence < 0.6) ||
      cookieFlags.includes("low_confidence") ||
      cookieFlags.includes("llm_provider_error");

    if (cookieStructurallyWeak) {
      rows.push({
        confidence: cookieConfidence,
        evidence_refs: getPolicyRowEvidenceRefs([cookiePolicyRow]),
        key: "disclosure.cookie_policy_structurally_obstructed",
        label: "Cookie policy structurally obstructed",
        population_status: "present",
        provenance_detail: "policy_enrichment.cookie_policy",
        report_signal_source: "document_semantic_signal",
        value: true
      });
    } else {
      if (cookieGapEvidence.unmatched_cookie_count > 0) {
        rows.push({
          confidence: cookieConfidence,
          evidence_refs: getPolicyRowEvidenceRefs([cookiePolicyRow]),
          key: "cookieRuntimeNames",
          label: "Runtime cookie names",
          population_status: "present",
          provenance_detail: "runtime.cookie_inventory",
          report_signal_source: "document_semantic_signal",
          value: cookieGapEvidence.runtime_cookie_names
        });
        rows.push({
          confidence: cookieConfidence,
          evidence_refs: getPolicyRowEvidenceRefs([cookiePolicyRow]),
          key: "cookieDisclosedNames",
          label: "Disclosed cookie names",
          population_status: "present",
          provenance_detail: "policy_enrichment.cookie_policy",
          report_signal_source: "document_semantic_signal",
          value: cookieGapEvidence.disclosed_cookie_names
        });
        rows.push({
          confidence: cookieConfidence,
          evidence_refs: getPolicyRowEvidenceRefs([cookiePolicyRow]),
          key: "cookieDisclosedProviders",
          label: "Disclosed cookie providers",
          population_status: "present",
          provenance_detail: "policy_enrichment.cookie_policy",
          report_signal_source: "document_semantic_signal",
          value: cookieGapEvidence.disclosed_cookie_providers
        });
        rows.push({
          confidence: cookieConfidence,
          evidence_refs: getPolicyRowEvidenceRefs([cookiePolicyRow]),
          key: "cookieUnmatchedNames",
          label: "Unmatched runtime cookie names",
          population_status: "present",
          provenance_detail: "runtime_policy.cookie_comparison",
          report_signal_source: "document_semantic_signal",
          value: cookieGapEvidence.unmatched_cookie_names
        });
        rows.push({
          confidence: cookieConfidence,
          evidence_refs: getPolicyRowEvidenceRefs([cookiePolicyRow]),
          key: "cookieUnmatchedCount",
          label: "Unmatched runtime cookie count",
          population_status: "present",
          provenance_detail: "runtime_policy.cookie_comparison",
          report_signal_source: "document_semantic_signal",
          value: cookieGapEvidence.unmatched_cookie_count
        });
        rows.push({
          confidence: cookieConfidence,
          evidence_refs: getPolicyRowEvidenceRefs([cookiePolicyRow]),
          key: "cookieUnmatchedThirdPartyCount",
          label: "Unmatched third-party cookie count",
          population_status: "present",
          provenance_detail: "runtime_policy.cookie_comparison",
          report_signal_source: "document_semantic_signal",
          value: cookieGapEvidence.unmatched_third_party_cookie_count
        });
        if (cookieGapEvidence.unmatched_cookie_vendors.length > 0) {
          rows.push({
            confidence: cookieConfidence,
            evidence_refs: getPolicyRowEvidenceRefs([cookiePolicyRow]),
            key: "cookieUnmatchedVendors",
            label: "Unmatched runtime cookie vendors",
            population_status: "present",
            provenance_detail: "runtime_policy.cookie_comparison",
            report_signal_source: "document_semantic_signal",
            value: cookieGapEvidence.unmatched_cookie_vendors
          });
        }
        if (cookieGapEvidence.unmatched_cookie_categories.length > 0) {
          rows.push({
            confidence: cookieConfidence,
            evidence_refs: getPolicyRowEvidenceRefs([cookiePolicyRow]),
            key: "cookieUnmatchedCategories",
            label: "Unmatched runtime cookie categories",
            population_status: "present",
            provenance_detail: "runtime_policy.cookie_comparison",
            report_signal_source: "document_semantic_signal",
            value: cookieGapEvidence.unmatched_cookie_categories
          });
        }
        rows.push({
          confidence: cookieConfidence,
          evidence_refs: getPolicyRowEvidenceRefs([cookiePolicyRow]),
          key: "privacy.cookie_runtime_disclosure_gap_detected",
          label: "Cookie runtime disclosure gap detected",
          population_status: "present",
          provenance_detail: "policy_enrichment.cookie_policy",
          report_signal_source: "document_semantic_signal",
          value: true
        });
      }
    }
  }

  const rightsFrictionScore =
    getNumber(input.snapshot?.user_rights_friction_score) ?? getNumber(input.snapshot?.userRightsFrictionScore);
  const retargetingPixelDetected =
    input.snapshot?.retargeting_pixel_detected === true || input.snapshot?.retargetingPixelDetected === true;
  const sessionReplayWithoutDisclosureDetected =
    input.snapshot?.session_replay_without_disclosure_detected === true ||
    input.snapshot?.session_replay_detected_without_disclosure === true ||
    input.snapshot?.sessionReplayWithoutDisclosureDetected === true;
  const lowConfidenceRows = input.policyEnrichments.filter((row) => getPolicyActionableFlags(row).includes("low_confidence"));

  for (const row of lowConfidenceRows) {
    const confidence = getPolicySemanticConfidence(row);
    const evidenceRefs = getPolicyRowEvidenceRefs([row]);
    const flags = getPolicyActionableFlags(row);
    const mentions = getPolicyMentions(row);
    const coverageRatio = getPolicyCoverageRatio(row);
    const snippetCount = getPolicySnippetCount(row);
    const structurallyWeak = getPolicyStructurallyWeak(row);
    const summaryShort = getPolicySummaryText(row);

    if (typeof rightsFrictionScore === "number" && rightsFrictionScore >= 100) {
      rows.push({
        confidence,
        evidence_refs: evidenceRefs,
        key: "privacy.policy_runtime_functional_misalignment_detected",
        label: "Policy/runtime functional misalignment detected",
        population_status: "present",
        provenance_detail: "policy_enrichment.low_confidence_runtime_synthesis",
        report_signal_source: "document_semantic_signal",
        value: true
      });
    }

    if (retargetingPixelDetected || sessionReplayWithoutDisclosureDetected) {
      rows.push({
        confidence,
        evidence_refs: evidenceRefs,
        key: "disclosure.policy_runtime_missing_technical_disclosure_detected",
        label: "Policy/runtime missing technical disclosure detected",
        population_status: "present",
        provenance_detail: "policy_enrichment.low_confidence_runtime_synthesis",
        report_signal_source: "document_semantic_signal",
        value: true
      });
    }

    if (
      hasSparsePolicyExtraction({
        confidence,
        coverageRatio,
        flags,
        mentions,
        snippetCount,
        structurallyWeak,
        summaryShort
      })
    ) {
      rows.push({
        confidence,
        evidence_refs: evidenceRefs,
        key: "disclosure.policy_runtime_disclosure_likely_obstructed",
        label: "Policy/runtime disclosure likely obstructed",
        population_status: "present",
        provenance_detail: "policy_enrichment.low_confidence_runtime_synthesis",
        report_signal_source: "document_semantic_signal",
        value: true
      });
    }
  }

  return rows
    .filter((row, index, allRows) => allRows.findIndex((candidate) => candidate.key === row.key) === index)
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function mergeManagedNanoPolicySignalRows(input: {
  existingRows: Array<Record<string, unknown>>;
  nextRows: PersistedNanoSignalRow[];
}) {
  const preservedRows = input.existingRows.filter((row) => {
    const key = getString(row.key);
    return !key || !MANAGED_NANO_POLICY_SIGNAL_KEYS.has(key);
  });

  return [...preservedRows, ...input.nextRows];
}
