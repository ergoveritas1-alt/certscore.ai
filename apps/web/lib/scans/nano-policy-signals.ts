import { POLICY_POSITIVE_SIGNAL_SPECS } from "./policy-positive-signal-contract";
import { derivePositivePolicySignalMap } from "../../server/scans/policy-enrichment-normalization";
import {
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
  getPolicyRightsSignals,
  getPolicySemanticConfidence,
  getPolicySnippetCount,
  getPolicyStructurallyWeak,
  getPolicySummaryText,
  getPrivacyContactChannelType
} from "./policy-enrichment-row";

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

export const MANAGED_NANO_POLICY_SIGNAL_KEYS = new Set([
  ...POLICY_POSITIVE_SIGNAL_SPECS.map((spec) => spec.canonicalSignalKey),
  "policyActionableFlags",
  "policySemanticConfidence",
  "policyAmbiguityScore",
  "policyDsarMechanism",
  "policyDoNotSell",
  "privacyContactChannelType",
  "policyRightsSignals",
  "policyChildrenReference",
  "policyBehaviorConflictCandidate",
  "disclosure.policy_runtime_disclosure_likely_obstructed",
  "disclosure.cookie_policy_structurally_obstructed",
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

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getHybridRuntimeEvidence(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return runtimeArtifacts && typeof runtimeArtifacts === "object"
    ? (((runtimeArtifacts.hybrid_runtime_evidence ?? runtimeArtifacts.hybridRuntimeEvidence) as Record<string, unknown> | null) ?? null)
    : null;
}

function normalizeCookieName(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.trim().toLowerCase();
}

function normalizeCookieTokenList(values: string[]) {
  return [...new Set(values.map((value) => normalizeCookieName(value)).filter((value): value is string => Boolean(value)))];
}

function getRuntimeCookieNames(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  const cookieWriteObservations = Array.isArray(hybrid?.cookieWriteObservations)
    ? hybrid.cookieWriteObservations.filter(
        (value): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
      )
    : [];
  const hybridCookieNames = cookieWriteObservations
    .map((row) => getString(row.cookieName) ?? getString(row.cookie_name))
    .filter((value): value is string => typeof value === "string");

  if (hybridCookieNames.length > 0) {
    return normalizeCookieTokenList(hybridCookieNames);
  }

  const persistedCookieNames = Array.isArray(runtimeArtifacts?.initial_cookie_names)
    ? (runtimeArtifacts.initial_cookie_names as unknown[]).filter((value): value is string => typeof value === "string")
    : Array.isArray(runtimeArtifacts?.initialCookieNames)
      ? (runtimeArtifacts.initialCookieNames as unknown[]).filter((value): value is string => typeof value === "string")
      : [];

  return normalizeCookieTokenList(persistedCookieNames);
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

function inferCookieProvider(cookieName: string) {
  const normalized = normalizeCookieName(cookieName);
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("_ga") || normalized.startsWith("_gid")) {
    return { category: "analytics", provider: "Google" };
  }
  if (normalized.startsWith("_fbp")) {
    return { category: "advertising", provider: "Meta" };
  }
  if (normalized.startsWith("_ttp")) {
    return { category: "advertising", provider: "TikTok" };
  }

  return null;
}

function matchRuntimeCookie(input: { cookieName: string; disclosures: Array<Record<string, unknown>> }) {
  const runtimeName = normalizeCookieName(input.cookieName);
  if (!runtimeName) {
    return null;
  }

  for (const disclosure of input.disclosures) {
    const disclosedName = normalizeCookieName(getString(disclosure.cookie_name) ?? getString(disclosure.cookieName));
    if (disclosedName && (runtimeName === disclosedName || runtimeName.startsWith(disclosedName) || disclosedName.startsWith(runtimeName))) {
      return true;
    }
  }

  const inferred = inferCookieProvider(runtimeName);
  if (!inferred) {
    return false;
  }

  return input.disclosures.some((disclosure) => {
    const provider = (getString(disclosure.provider) ?? "").toLowerCase();
    const purpose = (getString(disclosure.purpose) ?? "").toLowerCase();
    return provider.includes(inferred.provider.toLowerCase()) || purpose.includes(inferred.category);
  });
}

function getPrimaryPolicyRow(rows: Array<Record<string, unknown>>) {
  return rows.find((row) => getPolicyPageType(row) === "privacy_policy") ?? rows[0] ?? null;
}

function getRowsForPageType(rows: Array<Record<string, unknown>>, pageType: string) {
  return rows.filter((row) => getPolicyPageType(row) === pageType);
}

function buildPolicyRowEvidenceRefs(rows: Array<Record<string, unknown>>) {
  return uniqueStrings(rows.map(getPolicyPageUrl));
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
  const primaryPolicyDsarMechanism = getPolicyDsarMechanism(primaryPolicyRow);
  const primaryPolicyDoNotSell = getPolicyDoNotSell(primaryPolicyRow);
  const primaryPrivacyContactChannelType = getPrivacyContactChannelType(primaryPolicyRow);

  if (primaryPolicyFlags.length > 0) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: buildPolicyRowEvidenceRefs([primaryPolicyRow]),
      key: "policyActionableFlags",
      label: "Policy actionable flags",
      population_status: "present",
      provenance_detail: "policy_enrichment.privacy_policy",
      report_signal_source: "policy_enrichment_signal",
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

  if (primaryPolicyDsarMechanism) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: buildPolicyRowEvidenceRefs([primaryPolicyRow]),
      key: "policyDsarMechanism",
      label: "Policy DSAR mechanism",
      population_status: "present",
      provenance_detail: "policy_enrichment.privacy_policy",
      report_signal_source: "policy_enrichment_signal",
      value: primaryPolicyDsarMechanism
    });
  }

  if (primaryPrivacyContactChannelType) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: buildPolicyRowEvidenceRefs([primaryPolicyRow]),
      key: "privacyContactChannelType",
      label: "Privacy contact channel type",
      population_status: "present",
      provenance_detail: "policy_enrichment.privacy_policy",
      report_signal_source: "policy_enrichment_signal",
      value: primaryPrivacyContactChannelType
    });
  }

  if (primaryPolicyDoNotSell) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: buildPolicyRowEvidenceRefs([primaryPolicyRow]),
      key: "policyDoNotSell",
      label: "Policy do-not-sell posture",
      population_status: "present",
      provenance_detail: "policy_enrichment.privacy_policy",
      report_signal_source: "policy_enrichment_signal",
      value: primaryPolicyDoNotSell
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

  const policyReviewReasons = new Set(
    (input.policyReviewQueue ?? [])
      .map((row) => getString(row.reason))
      .filter((value): value is string => typeof value === "string")
  );
  if (policyReviewReasons.has("policy_behavior_conflict_candidate")) {
    rows.push({
      confidence: primaryPolicyConfidence,
      evidence_refs: buildPolicyRowEvidenceRefs(input.policyEnrichments),
      key: "policyBehaviorConflictCandidate",
      label: "Policy behavior conflict candidate",
      population_status: "present",
      provenance_detail: "policy_review_queue.policy_behavior_conflict_candidate",
      report_signal_source: "policy_enrichment_signal",
      value: true
    });
  }

  const cookiePolicyRow = input.policyEnrichments.find((row) => getPolicyPageType(row) === "cookie_policy") ?? null;
  const runtimeCookieNames = getRuntimeCookieNames(input.runtimeArtifacts);
  if (cookiePolicyRow && runtimeCookieNames.length > 0) {
    const cookieDisclosures = getPolicyCookieDisclosures(cookiePolicyRow).filter(
      (value): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
    );
    const cookieFlags = getPolicyActionableFlags(cookiePolicyRow);
    const cookieConfidence = getPolicySemanticConfidence(cookiePolicyRow);
    const cookieStructurallyWeak =
      cookieDisclosures.length === 0 ||
      (cookieConfidence !== null && cookieConfidence < 0.6) ||
      cookieFlags.includes("low_confidence") ||
      cookieFlags.includes("llm_provider_error");

    if (cookieStructurallyWeak) {
      rows.push({
        confidence: cookieConfidence,
        evidence_refs: buildPolicyRowEvidenceRefs([cookiePolicyRow]),
        key: "disclosure.cookie_policy_structurally_obstructed",
        label: "Cookie policy structurally obstructed",
        population_status: "present",
        provenance_detail: "policy_enrichment.cookie_policy",
        report_signal_source: "policy_enrichment_signal",
        value: true
      });
    } else {
      const unmatchedCookieNames = runtimeCookieNames.filter((cookieName) => !matchRuntimeCookie({ cookieName, disclosures: cookieDisclosures }));
      if (unmatchedCookieNames.length > 0) {
        rows.push({
          confidence: cookieConfidence,
          evidence_refs: buildPolicyRowEvidenceRefs([cookiePolicyRow]),
          key: "privacy.cookie_runtime_disclosure_gap_detected",
          label: "Cookie runtime disclosure gap detected",
          population_status: "present",
          provenance_detail: "policy_enrichment.cookie_policy",
          report_signal_source: "policy_enrichment_signal",
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
    const evidenceRefs = buildPolicyRowEvidenceRefs([row]);
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
        report_signal_source: "policy_enrichment_signal",
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
        report_signal_source: "policy_enrichment_signal",
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
        report_signal_source: "policy_enrichment_signal",
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
