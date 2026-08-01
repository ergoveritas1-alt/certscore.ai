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
};

type RegulatoryCoverageRowConfig = {
  weight: number;
};

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
export const GDPR_EPRIVACY_EVIDENCE_SCORE_VERSION = "gdpr-eprivacy-evidence.legacy-v1";

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
      toneClass: "border-slate-300 bg-slate-100 text-slate-700"
    };
  }
  if (score >= 72) {
    return {
      ratingLabel: "Strong",
      toneClass: "border-emerald-200 bg-emerald-50 text-emerald-800"
    };
  }
  if (score >= 50) {
    return {
      ratingLabel: "Watch",
      toneClass: "border-amber-200 bg-amber-50 text-amber-800"
    };
  }
  return {
    ratingLabel: "Needs work",
    toneClass: "border-rose-200 bg-rose-50 text-rose-800"
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
  const policyEvidenceAssessment = retained.policyEvidenceAssessment &&
    typeof retained.policyEvidenceAssessment === "object" &&
    !Array.isArray(retained.policyEvidenceAssessment)
      ? retained.policyEvidenceAssessment as Record<string, unknown>
      : null;
  return (
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
      summary: `${getFrameworkLabel(input.framework)} score was withheld because scoring configuration is missing for: ${missingConfigIds.join(", ")}.`,
      ...scoreMetadata,
      ...tone
    };
  }
  let earned = 0;
  let possible = 0;
  let coveredWeight = 0;

  for (const row of input.rows) {
    const factor = getRowFactor(row);
    if (factor === null) {
      continue;
    }
    const weight = configs[row.id]?.weight;
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
      summary: `${getFrameworkLabel(input.framework)} score was withheld because no applicable checklist rows were testable.`,
      ...scoreMetadata,
      ...tone
    };
  }

  const coverageRatio = coveredWeight / possible;
  const coverageCap = 55 + (coverageRatio * 45);
  const rawScore = (earned / possible) * 100;
  const score = clampScore(Math.min(rawScore, coverageCap));
  const tone = getTone(score);
  const summary = `${getFrameworkLabel(input.framework)} score is weighted from evidence-gated checklist rows. Weak negative checks, coverage limits, and vendor/request mismatches receive partial credit.`;

  return {
    coverageConfidence: getCoverageConfidence(coverageRatio),
    coverageRatio,
    score,
    summary,
    ...scoreMetadata,
    ...tone
  };
}
