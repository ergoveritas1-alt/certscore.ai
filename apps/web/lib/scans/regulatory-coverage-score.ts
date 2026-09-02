type RegulatoryCoverageFramework = "california" | "gdpr_eprivacy";

type RegulatoryCoverageRow = {
  assessmentStatus: string;
  criticalEvidence?: {
    missingOrIncompleteSourceSignals?: unknown[];
    retainedEvidence?: unknown;
  };
  evidenceState: string;
  id: string;
  status: string;
  subchecks?: Array<{
    id: string;
    status: string;
  }>;
};

type RegulatoryCoverageRowConfig =
  | { weight: number }
  | { scoreEffect: "none" };

export type RegulatoryCoverageScore = {
  coverageConfidence: "high" | "medium" | "low" | "insufficient";
  coverageRatio: number;
  ratingLabel: string;
  score: number | null;
  scoreKind: "california_evidence" | "gdpr_eprivacy_evidence";
  scoreSource: string;
  scoreVersion: string;
  summary: string;
  toneClass: string;
};

export const REGULATORY_COVERAGE_SCORE_SOURCE = "wc01.regulatory-coverage-score";
export const CALIFORNIA_EVIDENCE_SCORE_VERSION = "california-evidence.legacy-v1";
export const GDPR_EPRIVACY_EVIDENCE_SCORE_VERSION = "gdpr-eprivacy-posture.v11";

type GdprEprivacyRiskFamily =
  | "consent_controls"
  | "cross_border"
  | "embedded_third_party"
  | "policy_transparency"
  | "post_refusal_enforcement"
  | "pre_consent_storage"
  | "pre_consent_tracking"
  | "sensitive_runtime"
  | "tracking_technology"
  | "transport_security";

type GdprEprivacyPosturePolicy = {
  confirmedContradictionDeduction?: number;
  family: GdprEprivacyRiskFamily;
  gapDeduction: number;
};

/**
 * GDPR/ePrivacy posture scores evidence-qualified outcomes rather than the
 * presence of particular banner controls. Eligible review signals use the
 * same deduction as confirmed gaps, while coverage limitations cannot affect
 * the score.
 *
 * The score continues to aggregate by concern family so repeated vendors,
 * requests, or checklist descriptions cannot deduct the same concern without
 * bound.
 */
const GDPR_EPRIVACY_POSTURE_POLICIES: Partial<Record<string, GdprEprivacyPosturePolicy>> = {
  accessibility_consent_controls: { family: "consent_controls", gapDeduction: 4 },
  automated_decision_making_profiling_disclosure: { family: "policy_transparency", gapDeduction: 0 },
  consent_choice_quality: { family: "consent_controls", gapDeduction: 6 },
  controller_contact_disclosure: { family: "policy_transparency", gapDeduction: 0 },
  cookie_notice_policy_availability: { family: "policy_transparency", gapDeduction: 0 },
  cross_border_endpoint_review: { family: "cross_border", gapDeduction: 6 },
  data_subject_rights_disclosure: { family: "policy_transparency", gapDeduction: 0 },
  device_identification_fingerprinting_signal_observed: { family: "tracking_technology", gapDeduction: 10 },
  dpo_contact_point_disclosure: { family: "policy_transparency", gapDeduction: 0 },
  embedded_content_pre_consent: { family: "embedded_third_party", gapDeduction: 5 },
  international_transfers_disclosure: { family: "policy_transparency", gapDeduction: 0 },
  legal_basis_disclosure_observed: { family: "policy_transparency", gapDeduction: 0 },
  post_reject_tracking_reduction: {
    confirmedContradictionDeduction: 15,
    family: "post_refusal_enforcement",
    gapDeduction: 12
  },
  pre_consent_cookies_storage: {
    family: "pre_consent_storage",
    gapDeduction: 12
  },
  pre_consent_third_party_tracking: { family: "pre_consent_tracking", gapDeduction: 12 },
  preference_withdrawal_control: { family: "consent_controls", gapDeduction: 7 },
  privacy_notice_availability: { family: "policy_transparency", gapDeduction: 12 },
  processing_purposes_disclosure: { family: "policy_transparency", gapDeduction: 0 },
  recipients_vendor_categories_disclosure: { family: "policy_transparency", gapDeduction: 0 },
  reject_all_path_availability: { family: "consent_controls", gapDeduction: 10 },
  retention_disclosure_observed: { family: "policy_transparency", gapDeduction: 0 },
  sensitive_surfaces_third_party_tracking: { family: "sensitive_runtime", gapDeduction: 12 },
  session_replay_fingerprinting_review: { family: "sensitive_runtime", gapDeduction: 12 },
  social_media_embed_pre_consent: { family: "embedded_third_party", gapDeduction: 5 },
  supervisory_authority_complaint_disclosure: { family: "policy_transparency", gapDeduction: 0 },
  third_party_iframe_pre_consent: { family: "embedded_third_party", gapDeduction: 5 },
  transport_security_form_transport: { family: "transport_security", gapDeduction: 10 },
  transport_security_http_redirect: { family: "transport_security", gapDeduction: 4 },
  transport_security_https_delivery: { family: "transport_security", gapDeduction: 12 },
  transport_security_mixed_content: { family: "transport_security", gapDeduction: 8 },
  transport_security_tls_certificate: { family: "transport_security", gapDeduction: 12 }
};

const GDPR_EPRIVACY_FAMILY_DEDUCTION_CAPS: Record<GdprEprivacyRiskFamily, number> = {
  consent_controls: 16,
  cross_border: 6,
  embedded_third_party: 10,
  policy_transparency: 12,
  post_refusal_enforcement: 15,
  pre_consent_storage: 30,
  pre_consent_tracking: 30,
  sensitive_runtime: 20,
  tracking_technology: 18,
  transport_security: 20
};

const CALIFORNIA_ROW_WEIGHTS: Record<string, RegulatoryCoverageRowConfig> = {
  cipa_sensitive_communication_interception: { weight: 7 },
  cipa_sensitive_interaction_recording: { weight: 9 },
  consumer_rights_request_methods: { weight: 8 },
  do_not_sell_share_availability: { weight: 11 },
  gpc_opt_out_signal_handling: { weight: 8 },
  limit_use_sensitive_pi: { weight: 7 },
  notice_at_collection: { weight: 7 },
  opt_out_friction_dark_patterns: { weight: 5 },
  post_opt_out_tracking_behavior: { weight: 7 },
  privacy_control_accessibility: { weight: 4 },
  privacy_notice_availability: { weight: 10 },
  sale_share_disclosure_alignment: { weight: 9 },
  sensitive_forms_third_party_tracking: { weight: 7 },
  targeted_advertising_signals: { weight: 7 }
};

const GDPR_EPRIVACY_ROW_WEIGHTS: Record<string, RegulatoryCoverageRowConfig> = {
  accessibility_consent_controls: { weight: 4 },
  accept_consent_control: { weight: 7 },
  advertising_retargeting_vendor_signal_observed: { weight: 5 },
  analytics_vendor_observed: { weight: 5 },
  automated_decision_making_profiling_disclosure: { weight: 5 },
  cmp_framework_signal_observed: { weight: 5 },
  consent_choice_quality: { weight: 10 },
  consent_surface_observed: { weight: 10 },
  controller_contact_disclosure: { weight: 5 },
  cookie_notice_policy_availability: { weight: 5 },
  cross_border_endpoint_review: { weight: 5 },
  data_subject_rights_disclosure: { weight: 5 },
  device_identification_fingerprinting_signal_observed: { weight: 5 },
  dpo_contact_point_disclosure: { weight: 5 },
  embedded_content_pre_consent: { weight: 5 },
  international_transfers_disclosure: { weight: 5 },
  legal_basis_disclosure_observed: { weight: 5 },
  options_settings_preferences_control: { weight: 7 },
  post_reject_tracking_reduction: { weight: 10 },
  pre_consent_cookies_storage: { weight: 12 },
  pre_consent_third_party_tracking: { weight: 14 },
  preference_withdrawal_control: { weight: 7 },
  privacy_notice_availability: { weight: 5 },
  processing_purposes_disclosure: { weight: 5 },
  public_collection_surfaces: { scoreEffect: "none" },
  recipients_vendor_categories_disclosure: { weight: 5 },
  reject_all_path_availability: { weight: 10 },
  retention_disclosure_observed: { weight: 5 },
  retargeting_behavioral_advertising_signal_observed: { weight: 5 },
  sensitive_surfaces_third_party_tracking: { weight: 8 },
  social_media_embed_pre_consent: { weight: 6 },
  session_replay_fingerprinting_review: { weight: 3 },
  supervisory_authority_complaint_disclosure: { weight: 5 },
  third_party_iframe_pre_consent: { weight: 5 },
  transport_security_form_transport: { weight: 5 },
  transport_security_http_redirect: { weight: 5 },
  transport_security_https_delivery: { weight: 5 },
  transport_security_mixed_content: { weight: 5 },
  transport_security_tls_certificate: { weight: 5 }
};

export function auditRegulatoryCoverageScoreConfig(input: {
  framework: RegulatoryCoverageFramework;
  rowIds: string[];
}) {
  const configs = getConfigs(input.framework);
  const rowIds = [...new Set(input.rowIds)];
  const configuredIds = Object.keys(configs);
  return {
    missingConfigIds: rowIds.filter((id) => !configs[id]).sort(),
    staleConfigIds: configuredIds.filter((id) => !rowIds.includes(id)).sort()
  };
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getTone(score: number | null) {
  if (score === null) {
    return {
      ratingLabel: "Not scored",
      ringColor: "#94a3b8",
      toneClass: "border-slate-300 bg-slate-100 text-slate-700"
    };
  }
  if (score >= 72) {
    return {
      ratingLabel: "Strong",
      ringColor: "#0d9488",
      toneClass: "border-emerald-200 bg-emerald-50 text-emerald-800"
    };
  }
  if (score >= 50) {
    return {
      ratingLabel: "Watch",
      ringColor: "#d97706",
      toneClass: "border-amber-200 bg-amber-50 text-amber-800"
    };
  }
  return {
    ratingLabel: "Needs work",
    ringColor: "#dc2626",
    toneClass: "border-rose-200 bg-rose-50 text-rose-800"
  };
}

export function getGdprEprivacyPostureTone(score: number | null) {
  if (score === null) {
    return getTone(null);
  }
  if (score >= 85) {
    return {
      ratingLabel: "Watch",
      ringColor: "#0d9488",
      toneClass: "border-teal-200 bg-teal-50 text-teal-800"
    };
  }
  if (score >= 65) {
    return {
      ratingLabel: "Review",
      ringColor: "#eab308",
      toneClass: "border-yellow-200 bg-yellow-50 text-yellow-800"
    };
  }
  if (score >= 40) {
    return {
      ratingLabel: "Needs work",
      ringColor: "#d97706",
      toneClass: "border-amber-200 bg-amber-50 text-amber-800"
    };
  }
  return {
    ratingLabel: "High-priority remediation",
    ringColor: "#dc2626",
    toneClass: "border-red-300 bg-red-100 text-red-900"
  };
}

function getCoverageConfidence(coverageRatio: number) {
  if (coverageRatio >= 0.9) {
    return "high" as const;
  }
  if (coverageRatio >= 0.7) {
    return "medium" as const;
  }
  return "low" as const;
}

function getRetainedEvidence(row: RegulatoryCoverageRow) {
  const retainedEvidence = row.criticalEvidence?.retainedEvidence;
  return retainedEvidence && typeof retainedEvidence === "object" && !Array.isArray(retainedEvidence)
    ? retainedEvidence as Record<string, unknown>
    : {};
}

function hasConfirmedPostRefusalContradiction(row: RegulatoryCoverageRow) {
  if (row.id !== "post_reject_tracking_reduction") return false;
  const retained = getRetainedEvidence(row);
  return (
    (retained.rejectInteractionConfirmed === true || retained.refusalExercised === true) &&
    (retained.refusalSignalContradictsAction === true || retained.refusal_signal_contradicts_action === true)
  );
}

function isConfirmedGdprEprivacyGap(row: RegulatoryCoverageRow) {
  return row.assessmentStatus === "gap_observed" || hasConfirmedPostRefusalContradiction(row);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function getDiminishingDeduction(input: {
  count: number;
  first: number;
  second: number;
  subsequentCombined: number;
}) {
  if (input.count <= 0) return 0;
  if (input.count === 1) return input.first;
  if (input.count === 2) return input.first + input.second;
  return input.first + input.second + input.subsequentCombined;
}

function getPerIdentityDiminishingDeduction(input: {
  count: number;
  first: number;
  second: number;
  subsequentEach: number;
}) {
  if (input.count <= 0) return 0;
  if (input.count === 1) return input.first;
  return input.first + input.second + Math.max(0, input.count - 2) * input.subsequentEach;
}

function getUniqueRecordCount(input: {
  fallbackKeys?: string[];
  records: unknown;
  uniqueKeys: string[];
}) {
  if (!Array.isArray(input.records)) return 0;
  const identities = new Set<string>();
  for (const entry of input.records) {
    const record = asRecord(entry);
    if (!record) continue;
    const preferred = input.uniqueKeys
      .map((key) => String(record[key] ?? "").trim().toLowerCase())
      .filter(Boolean);
    const fallback = (input.fallbackKeys ?? [])
      .map((key) => String(record[key] ?? "").trim().toLowerCase())
      .filter(Boolean);
    const identity = preferred.length > 0 ? preferred.join("|") : fallback.join("|");
    if (identity) identities.add(identity);
  }
  return identities.size;
}

function getPreConsentStorageIdentityCount(retained: Record<string, unknown>) {
  const exactIdentityCount = getUniqueRecordCount({
    fallbackKeys: ["name", "domain"],
    records: retained.eligiblePreconsentCookieStorageRows,
    uniqueKeys: ["storageType", "name", "domain", "path", "partitionKey"]
  });
  if (exactIdentityCount > 0) return exactIdentityCount;

  const assessment = asRecord(retained.preConsentStorageAssessment);
  return asNonNegativeInteger(assessment?.classifiedNonEssentialCount) ??
    asNonNegativeInteger(retained.cookiesBeforeConsentCount) ??
    0;
}

function getPreConsentTrackerGroupCount(retained: Record<string, unknown>) {
  const groupCount = getUniqueRecordCount({
    fallbackKeys: ["purpose", "party"],
    records: retained.preconsentThirdPartyTrackerGroups,
    uniqueKeys: ["vendor"]
  });
  if (groupCount > 0) return groupCount;

  const vendors = [
    retained.selectedPreconsentThirdPartyTrackingVendors,
    retained.preconsentThirdPartyTrackingVendors
  ].flatMap((value) => Array.isArray(value) ? value : []);
  return new Set(
    vendors.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
  ).size;
}

function getSessionReplayVendorCount(retained: Record<string, unknown>) {
  const evidence = asRecord(retained.sessionReplayEvidence);
  const vendors = Array.isArray(evidence?.vendors) ? evidence.vendors : [];
  return new Set(
    vendors.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
  ).size;
}

function getFingerprintingHostCount(retained: Record<string, unknown>) {
  const evidence = asRecord(retained.browserDeviceEntropyEvidence);
  const hosts = Array.isArray(evidence?.hosts) ? evidence.hosts : [];
  return new Set(
    hosts.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
  ).size;
}

function getGdprEprivacyRowDeduction(row: RegulatoryCoverageRow) {
  if (isExcludedFromDenominator(row) || isCoverageLimited(row)) return 0;
  const policy = GDPR_EPRIVACY_POSTURE_POLICIES[row.id];
  if (!policy) return 0;

  const retained = getRetainedEvidence(row);
  if (retained.scoreEffect === "none" && !hasConfirmedPostRefusalContradiction(row)) return 0;
  if (
    row.id === "pre_consent_cookies_storage" &&
    (row.assessmentStatus === "gap_observed" || row.assessmentStatus === "review_signal")
  ) {
    const missingSignals = row.criticalEvidence?.missingOrIncompleteSourceSignals;
    if (
      row.assessmentStatus === "review_signal" &&
      Array.isArray(missingSignals) &&
      missingSignals.length > 0
    ) {
      return 0;
    }
    return getPerIdentityDiminishingDeduction({
      count: Math.max(1, getPreConsentStorageIdentityCount(retained)),
      first: 6,
      second: 4,
      subsequentEach: 1
    });
  }
  if (
    row.id === "pre_consent_third_party_tracking" &&
    (row.assessmentStatus === "gap_observed" || row.assessmentStatus === "review_signal")
  ) {
    const count = Math.max(
      row.assessmentStatus === "gap_observed" ? 1 : 0,
      getPreConsentTrackerGroupCount(retained)
    );
    if (count <= 0) return 0;
    return getPerIdentityDiminishingDeduction({ count, first: 6, second: 4, subsequentEach: 1 });
  }
  if (row.id === "session_replay_fingerprinting_review") {
    if (row.assessmentStatus === "gap_observed" || row.assessmentStatus === "review_signal") {
      const sensitiveSurfaceGap = row.subchecks?.some((subcheck) =>
        subcheck.id === "session_replay_sensitive_surface" && subcheck.status === "Gap observed"
      ) === true;
      if (sensitiveSurfaceGap) return 20;
      const vendorCount = getSessionReplayVendorCount(retained);
      if (row.assessmentStatus === "review_signal" && vendorCount <= 0) return 0;
      return getDiminishingDeduction({
        count: Math.max(1, vendorCount),
        first: 12,
        second: 6,
        subsequentCombined: 2
      });
    }
    return 0;
  }
  if (row.id === "device_identification_fingerprinting_signal_observed") {
    if (retained.promotionEligible === false) return 0;
    if (row.assessmentStatus === "gap_observed" || row.assessmentStatus === "review_signal") {
      return getDiminishingDeduction({
        count: Math.max(1, getFingerprintingHostCount(retained)),
        first: 10,
        second: 6,
        subsequentCombined: 2
      });
    }
    return 0;
  }
  if (row.id === "post_reject_tracking_reduction") {
    if (hasConfirmedPostRefusalContradiction(row)) {
      return policy.confirmedContradictionDeduction ?? policy.gapDeduction;
    }
    if (retained.scoreEffect === "none") return 0;
    if (row.assessmentStatus === "gap_observed") return policy.gapDeduction;
    return 0;
  }

  if (row.assessmentStatus === "gap_observed") {
    return policy.gapDeduction;
  }
  if (row.assessmentStatus !== "review_signal") {
    return 0;
  }

  const missingSignals = row.criticalEvidence?.missingOrIncompleteSourceSignals;
  return Array.isArray(missingSignals) && missingSignals.length > 0
    ? 0
    : policy.gapDeduction;
}

function deriveGdprEprivacyPostureScore(rows: RegulatoryCoverageRow[]): RegulatoryCoverageScore {
  let possibleCoverageWeight = 0;
  let coveredWeight = 0;
  const familyDeductions = new Map<GdprEprivacyRiskFamily, number>();
  const confirmedPrivacyNoticeGap = rows.some((row) => (
    row.id === "privacy_notice_availability" &&
    isConfirmedGdprEprivacyGap(row) &&
    getGdprEprivacyRowDeduction(row) > 0
  ));

  for (const row of rows) {
    const config = GDPR_EPRIVACY_ROW_WEIGHTS[row.id];
    if (!config || "scoreEffect" in config || isExcludedFromDenominator(row)) {
      continue;
    }
    possibleCoverageWeight += config.weight;
    if (!isCoverageLimited(row)) {
      coveredWeight += config.weight;
    }

    const deduction = getGdprEprivacyRowDeduction(row);
    if (deduction <= 0) continue;
    const policy = GDPR_EPRIVACY_POSTURE_POLICIES[row.id];
    if (!policy) continue;
    if (
      confirmedPrivacyNoticeGap &&
      policy.family === "policy_transparency" &&
      row.id !== "privacy_notice_availability"
    ) {
      continue;
    }
    familyDeductions.set(
      policy.family,
      Math.min(
        GDPR_EPRIVACY_FAMILY_DEDUCTION_CAPS[policy.family],
        (familyDeductions.get(policy.family) ?? 0) + deduction
      )
    );
  }

  const coverageRatio = possibleCoverageWeight > 0
    ? coveredWeight / possibleCoverageWeight
    : 0;
  const scoreMetadata = getScoreMetadata("gdpr_eprivacy");
  if (possibleCoverageWeight <= 0 || (coveredWeight <= 0 && familyDeductions.size === 0)) {
    return {
      coverageConfidence: "insufficient",
      coverageRatio,
      score: null,
      summary: "GDPR/ePrivacy posture could not be assessed from the retained evidence.",
      ...scoreMetadata,
      ...getGdprEprivacyPostureTone(null)
    };
  }

  const totalDeduction = [...familyDeductions.values()].reduce((total, value) => total + value, 0);
  const score = clampScore(100 - totalDeduction);

  const tone = getGdprEprivacyPostureTone(score);
  return {
    coverageConfidence: getCoverageConfidence(coverageRatio),
    coverageRatio,
    score,
    summary: "GDPR/ePrivacy posture summarizes the applicable findings supported by retained evidence.",
    ...scoreMetadata,
    ...tone
  };
}

function includesString(value: unknown, pattern: RegExp): boolean {
  if (typeof value === "string") {
    return pattern.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => includesString(entry, pattern));
  }
  if (value && typeof value === "object") {
    return Object.values(value).some((entry) => includesString(entry, pattern));
  }
  return false;
}

function hasCoherenceMismatch(row: RegulatoryCoverageRow) {
  const retained = getRetainedEvidence(row);
  return (
    retained.runtimeVendorRequestUrlCoherence === "mismatch" ||
    retained.gpcRuntimeVendorRequestUrlCoherence === "mismatch" ||
    retained.disclosureAlignmentBasis === "vendor_request_url_mismatch" ||
    retained.saleShareApplicabilityBasis === "vendor_request_url_mismatch" ||
    includesString(retained.evidenceCoherence, /\b(?:fail|mismatch)\b/i)
  );
}

function hasWeakNegativeCoverage(row: RegulatoryCoverageRow) {
  const retained = getRetainedEvidence(row);
  return (
    retained.sufficientForNegativeCipaReview === false ||
    retained.sensitivePiNegativeReviewSufficient === false ||
    retained.collectionContextNegativeReviewSufficient === false ||
    retained.collectionContextObserved === false ||
    retained.directEvidenceObserved === true ||
    retained.rawCipaThirdPartyReceiptObserved === true
  );
}

function isExcludedFromDenominator(row: RegulatoryCoverageRow) {
  const retained = getRetainedEvidence(row);
  const confirmedPostRefusalContradiction =
    row.id === "post_reject_tracking_reduction" &&
    (retained.rejectInteractionConfirmed === true || retained.refusalExercised === true) &&
    (retained.refusalSignalContradictsAction === true || retained.refusal_signal_contradicts_action === true);
  const policyEvidenceAssessment = retained.policyEvidenceAssessment &&
    typeof retained.policyEvidenceAssessment === "object" &&
    !Array.isArray(retained.policyEvidenceAssessment)
      ? retained.policyEvidenceAssessment as Record<string, unknown>
      : null;
  return (
    (retained.scoreEffect === "none" && !confirmedPostRefusalContradiction) ||
    policyEvidenceAssessment?.scoreEffect === "none" ||
    row.assessmentStatus === "not_applicable" ||
    row.status === "not_applicable" ||
    row.status === "Out of scope"
  );
}

function isCoverageLimited(row: RegulatoryCoverageRow) {
  return (
    row.evidenceState === "not_testable" ||
    row.assessmentStatus === "needs_evidence" ||
    row.assessmentStatus === "coverage_limitation" ||
    row.status === "Not testable" ||
    row.status === "Insufficient evidence"
  );
}

function getCheckedFactor(row: RegulatoryCoverageRow) {
  const missingSignals = row.criticalEvidence?.missingOrIncompleteSourceSignals;
  if (Array.isArray(missingSignals) && missingSignals.length > 0) {
    return 0.5;
  }
  if (hasCoherenceMismatch(row)) {
    return row.evidenceState === "not_observed" ? 0.62 : 0.55;
  }
  if (hasWeakNegativeCoverage(row)) {
    return row.evidenceState === "not_observed" ? 0.58 : 0.5;
  }
  return row.evidenceState === "not_observed" ? 0.9 : 1;
}

function getRowFactor(row: RegulatoryCoverageRow) {
  if (isExcludedFromDenominator(row)) {
    return null;
  }
  if (
    row.id === "options_settings_preferences_control" &&
    (
      (row.criticalEvidence?.retainedEvidence as Record<string, unknown> | undefined)?.balancedAcceptDeclineWithoutFirstLayerSettings === true ||
      [
        "balanced_accept_decline_no_first_layer_settings",
        "inline_link_action_cluster",
        "inline_link_first_layer_body",
        "inline_link",
        "persistent_link"
      ].includes(
        String(
          (row.criticalEvidence?.retainedEvidence as Record<string, unknown> | undefined)
            ?.optionsControlProminence ?? ""
        )
      )
    )
  ) {
    return 1;
  }
  if (
    row.id === "pre_consent_cookies_storage" &&
    (row.criticalEvidence?.retainedEvidence as Record<string, unknown> | undefined)
      ?.preConsentStorageAssessmentStatus === "classified_zero"
  ) {
    return 1;
  }
  if (
    row.id === "device_identification_fingerprinting_signal_observed" &&
    row.assessmentStatus === "checked" &&
    row.evidenceState === "not_observed" &&
    (row.criticalEvidence?.retainedEvidence as Record<string, unknown> | undefined)
      ?.promotionEligible === false
  ) {
    return 1;
  }
  if (
    row.id === "pre_consent_cookies_storage" &&
    row.assessmentStatus === "review_signal" &&
    ["partially_classified", "snapshot_presence_only"].includes(
      String(
        (row.criticalEvidence?.retainedEvidence as Record<string, unknown> | undefined)
          ?.preConsentStorageAssessmentStatus ?? ""
      )
    )
  ) {
    return 1;
  }
  if (row.assessmentStatus === "gap_observed") {
    return 0;
  }
  if (row.assessmentStatus === "review_signal") {
    return row.evidenceState === "observed" ? 0.45 : 0.35;
  }
  if (isCoverageLimited(row)) {
    return 0.15;
  }
  if (row.assessmentStatus === "checked") {
    return getCheckedFactor(row);
  }
  return 0.35;
}

function getConfigs(framework: RegulatoryCoverageFramework) {
  return framework === "california" ? CALIFORNIA_ROW_WEIGHTS : GDPR_EPRIVACY_ROW_WEIGHTS;
}

function getFrameworkLabel(framework: RegulatoryCoverageFramework) {
  return framework === "california" ? "California" : "GDPR/ePrivacy";
}

function getScoreMetadata(framework: RegulatoryCoverageFramework) {
  return framework === "california"
    ? {
        scoreKind: "california_evidence" as const,
        scoreSource: REGULATORY_COVERAGE_SCORE_SOURCE,
        scoreVersion: CALIFORNIA_EVIDENCE_SCORE_VERSION
      }
    : {
        scoreKind: "gdpr_eprivacy_evidence" as const,
        scoreSource: REGULATORY_COVERAGE_SCORE_SOURCE,
        scoreVersion: GDPR_EPRIVACY_EVIDENCE_SCORE_VERSION
      };
}

export function deriveRegulatoryCoverageScore(input: {
  framework: RegulatoryCoverageFramework;
  rows: RegulatoryCoverageRow[];
}): RegulatoryCoverageScore {
  const configs = getConfigs(input.framework);
  const scoreMetadata = getScoreMetadata(input.framework);
  const missingConfigIds = [...new Set(input.rows.map((row) => row.id).filter((id) => !configs[id]))].sort();
  if (missingConfigIds.length > 0) {
    const tone = getTone(null);
    return {
      coverageConfidence: "insufficient",
      coverageRatio: 0,
      score: null,
      summary: `${getFrameworkLabel(input.framework)} posture could not be assessed for this retained scan.`,
      ...scoreMetadata,
      ...tone
    };
  }
  if (input.framework === "gdpr_eprivacy") {
    return deriveGdprEprivacyPostureScore(input.rows);
  }
  let earned = 0;
  let possible = 0;
  let coveredWeight = 0;

  for (const row of input.rows) {
    const config = configs[row.id];
    if (config && "scoreEffect" in config && config.scoreEffect === "none") {
      continue;
    }
    const factor = getRowFactor(row);
    if (factor === null) {
      continue;
    }
    const weight = config && "weight" in config ? config.weight : undefined;
    if (weight === undefined) {
      continue;
    }
    possible += weight;
    earned += weight * factor;
    if (!isCoverageLimited(row)) {
      coveredWeight += weight;
    }
  }

  if (possible <= 0) {
    const tone = getTone(null);
    return {
      coverageConfidence: "insufficient",
      coverageRatio: 0,
      score: null,
      summary: `${getFrameworkLabel(input.framework)} posture could not be assessed from the retained evidence.`,
      ...scoreMetadata,
      ...tone
    };
  }

  const coverageRatio = coveredWeight / possible;
  const coverageCap = 55 + (coverageRatio * 45);
  const rawScore = (earned / possible) * 100;
  const score = clampScore(Math.min(rawScore, coverageCap));
  const tone = getTone(score);
  const summary = `${getFrameworkLabel(input.framework)} posture summarizes the applicable findings supported by retained evidence.`;

  return {
    coverageConfidence: getCoverageConfidence(coverageRatio),
    coverageRatio,
    score,
    summary,
    ...scoreMetadata,
    ...tone
  };
}
