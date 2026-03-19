import { createAdminClient } from "@website-signal-risk-scanner/db";
import {
  SCAN_EVENT_TYPES,
  VALIDATION_DEFAULT_INTERVAL_MINUTES,
  VALIDATION_DEFAULT_RUN_MODE,
  type FindingCategory,
  type FindingSeverity,
  type ValidationPipelineState,
  type ValidationRunMode,
  type ValidationRunStatus,
  type ValidationVerdict
} from "@website-signal-risk-scanner/shared";
import { extractHostname, normalizeUrl } from "@website-signal-risk-scanner/shared";
import { getWorkerEnv } from "../env";
import { getCooldownDaysForRank, getNextDueAt, getRankBand, isValidValidationInterval, VALIDATION_FINDING_LIMIT, VALIDATION_SETTINGS_KEY } from "./constants";

type ValidationSettingsRow = {
  automatic_interval_minutes: number;
  last_scheduled_at: string | null;
  last_tranco_sync_at: string | null;
  next_due_at: string | null;
  operator_note: string | null;
  pipeline_enabled: boolean;
  run_mode: ValidationRunMode;
  singleton_key: string;
  updated_at: string;
  updated_by_user_id: string | null;
};

type ValidationTargetRow = {
  active: boolean;
  backoff_until: string | null;
  cooldown_until: string | null;
  deny_reason: string | null;
  denylisted: boolean;
  hostname: string;
  id: string;
  last_completed_at: string | null;
  last_error: string | null;
  last_run_at: string | null;
  last_status: string | null;
  normalized_url: string;
  rank_band: string | null;
  tranco_rank: number | null;
};

type ValidationRunRow = {
  average_agreement_score: number | null;
  completed_at: string | null;
  created_at: string;
  domain_id: string | null;
  error_message: string | null;
  finding_count: number;
  hostname: string;
  id: string;
  normalized_url: string;
  rank_band: string | null;
  reviewed_finding_count: number;
  scan_id: string | null;
  started_at: string | null;
  status: ValidationRunStatus;
  tranco_rank: number | null;
  trigger_mode: ValidationRunMode;
  validation_target_id: string | null;
};

export type ValidationRunRecord = {
  averageAgreementScore: number | null;
  completedAt: string | null;
  createdAt: string;
  domainId: string | null;
  errorMessage: string | null;
  findingCount: number;
  hostname: string;
  id: string;
  normalizedUrl: string;
  rankBand: string | null;
  reviewedFindingCount: number;
  scanId: string | null;
  startedAt: string | null;
  status: ValidationRunStatus;
  targetId: string | null;
  trancoRank: number | null;
  triggerMode: ValidationRunMode;
};

type ScanSignalRow = {
  category: "accessibility" | "context" | "disclosure" | "privacy";
  signal_key: string;
  signal_label: string;
  signal_value_json: boolean | number | string | string[] | null;
  value_type: "boolean" | "number" | "text" | "string_array";
};

type ScanSnapshotRow = {
  cmp_vendor_name: string | null;
  consent_withdrawal_mechanism_present: boolean | null;
  cookie_banner_present: boolean;
  dark_pattern_reject_button_missing: boolean;
  legal_coverage_score: number | null;
  preconsent_tracking_detected: boolean;
  privacy_policy_present: boolean;
  privacy_policy_word_count: number | null;
  reject_all_present: boolean;
  third_party_cookie_set_before_consent: boolean | null;
  tracking_before_consent_detected: boolean | null;
};

type ScanRuntimeArtifactsRow = {
  consent_post_reject_tracker_evidence_urls: string[] | null;
  consent_post_reject_tracker_vendor_names: string[] | null;
  consent_reject_persisted_tracker_vendor_names: string[] | null;
  consent_reject_reduced_tracking: boolean | null;
  consent_withdrawal_mechanism_present?: boolean | null;
  initial_cookie_count?: number | null;
  script_src_domains?: string[] | null;
  third_party_request_domains?: string[] | null;
};

type ValidationSnapshotFallbackRow = {
  cookie_banner_present: boolean;
  dark_pattern_reject_button_missing: boolean;
  legal_coverage_score: number | null;
  preconsent_tracking_detected: boolean;
  privacy_policy_present: boolean;
  privacy_policy_word_count: number | null;
  reject_all_present: boolean;
  third_party_cookie_set_before_consent: boolean | null;
  tracking_before_consent_detected: boolean | null;
};

export type ValidationRunFindingInsert = {
  category: FindingCategory;
  description: string;
  evidence_json: Record<string, unknown>;
  finding_id: string | null;
  page_url: string | null;
  rank: number;
  rule_key: string;
  severity: FindingSeverity;
  subtype: string | null;
  title: string;
};

export type ValidationRunFindingRow = ValidationRunFindingInsert & {
  id: string;
  validation_run_id: string;
};

type ValidationRunFindingDbRow = Omit<ValidationRunFindingInsert, "rank"> & {
  finding_rank: number;
  id: string;
  validation_run_id: string;
};

export type ValidationVerdictInsert = {
  agreement_score: 0 | 50 | 100;
  confidence: number;
  evidence_json: Record<string, unknown>;
  model: string;
  prompt_version: string;
  rationale: string;
  system_confidence_band: "very_high" | "high" | "moderate" | "low" | "very_low";
  system_confidence_explanation: string;
  system_confidence_score: number;
  validation_run_finding_id: string;
  verdict: ValidationVerdict;
};

export type ValidationEvidencePacket = {
  claim: string;
  confidenceBasis: string[];
  missingEvidence: string[];
  pageUrls: string[];
  policyEvidence: string[];
  reviewPolicy: {
    claimType: "behavior_without_disclosure" | "tracking_before_consent" | "tracking_after_reject" | "automated_accessibility";
    contraryEvidenceTypes: string[];
    detectorStrength: "strong" | "medium" | "weak";
    gapTolerance: "high" | "low" | "medium";
    requiredSupportTypes: string[];
    rubric: {
      inconclusiveIf: string[];
      notSupportedIf: string[];
      supportedIf: string[];
    };
  };
  runtimeEvidence: string[];
  supportingSignals: Array<{
    category: ScanSignalRow["category"];
    key: string;
    label: string;
    value: ScanSignalRow["signal_value_json"];
  }>;
};

type ValidationEvidenceBuildContext = {
  runtimeArtifacts: ScanRuntimeArtifactsRow | null;
  scanSignalsByKey: Map<string, ScanSignalRow>;
  snapshot: ScanSnapshotRow | null;
};

type ValidationFindingDefinition = {
  buildEvidence?: (row: ScanSignalRow, context: ValidationEvidenceBuildContext) => ValidationEvidencePacket;
  category: FindingCategory;
  description: string;
  ruleKey: string;
  severity: FindingSeverity;
  subtype: string | null;
  title: string;
};

const VALIDATION_SIGNAL_FINDING_DEFINITIONS: Record<
  string,
  ValidationFindingDefinition
> = {
  "privacy.reject_control_missing_detected": {
    buildEvidence: (row) => buildDefaultEvidencePacket(row, "A consent experience was detected without a clear reject-all control."),
    category: "privacy",
    description: "A consent experience was detected without a clear reject-all control.",
    ruleKey: "privacy.reject_control_missing_detected",
    severity: "high",
    subtype: "consent_controls",
    title: "Reject-all control missing"
  },
  "privacy.trackers_before_consent_detected": {
    buildEvidence: buildPreconsentTrackingEvidence,
    category: "privacy",
    description: "Tracking activity appears to occur before the visitor can make a consent choice.",
    ruleKey: "privacy.trackers_before_consent_detected",
    severity: "high",
    subtype: "preconsent_tracking",
    title: "Trackers observed before consent"
  },
  "privacy.preconsent_tracking_detected": {
    buildEvidence: buildPreconsentTrackingEvidence,
    category: "privacy",
    description: "Tracking activity appears to occur before the visitor can make a consent choice.",
    ruleKey: "privacy.trackers_before_consent_detected",
    severity: "high",
    subtype: "preconsent_tracking",
    title: "Trackers observed before consent"
  },
  "privacy.preconsent_violation_count": {
    buildEvidence: buildPreconsentTrackingEvidence,
    category: "privacy",
    description: "Pre-consent tracker requests were observed before the visitor could make a consent choice.",
    ruleKey: "privacy.trackers_before_consent_detected",
    severity: "high",
    subtype: "preconsent_tracking",
    title: "Trackers observed before consent"
  },
  "privacy.consent_reject_persisted_tracker_vendors": {
    buildEvidence: buildRejectPersistenceEvidence,
    category: "privacy",
    description: "Trackers continued to persist after a reject-style consent interaction.",
    ruleKey: "privacy.trackers_persist_after_reject_detected",
    severity: "high",
    subtype: "consent_enforcement",
    title: "Trackers persisted after reject"
  },
  "disclosure.privacy_policy_limited": {
    buildEvidence: (row) => buildDefaultEvidencePacket(row, "A privacy policy was detected, but its coverage appeared limited or incomplete."),
    category: "legal",
    description: "A privacy policy was detected, but its coverage appeared limited or incomplete.",
    ruleKey: "disclosure.privacy_policy_limited",
    severity: "medium",
    subtype: "policy_coverage",
    title: "Privacy policy coverage limited"
  },
  "disclosure.disclosure_language_missing_detected": {
    buildEvidence: (row) => buildDefaultEvidencePacket(row, "Promotional or affiliate disclosure language appears to be missing."),
    category: "legal",
    description: "Promotional or affiliate disclosure language appears to be missing.",
    ruleKey: "disclosure.disclosure_language_missing_detected",
    severity: "high",
    subtype: "disclosure_language",
    title: "Disclosure language missing"
  },
  "context.session_replay_without_disclosure_detected": {
    buildEvidence: buildSessionReplayEvidence,
    category: "privacy",
    description: "Session replay behavior appears present without a corresponding disclosure on the site.",
    ruleKey: "privacy.session_replay_without_disclosure_detected",
    severity: "high",
    subtype: "session_replay_disclosure",
    title: "Session replay without disclosure"
  },
  "accessibility.wcag_error_count_total": {
    buildEvidence: buildAccessibilityEvidence,
    category: "accessibility",
    description: "Automated accessibility testing surfaced WCAG rule violations on this site.",
    ruleKey: "accessibility.wcag_errors_detected",
    severity: "medium",
    subtype: "automated_accessibility",
    title: "Automated accessibility issues detected"
  }
};

function isGenericValidationConcernSignal(row: ScanSignalRow) {
  const key = row.signal_key;
  const value = row.signal_value_json;

  if (!isActiveSignalValue(value, row.value_type)) {
    return false;
  }

  const negativePatterns = [
    /dark_pattern/,
    /preconsent/,
    /conflict/,
    /mismatch/,
    /session_replay/,
    /high_sensitivity_data_collection_detected/,
    /limited_time_offer_language_present/,
    /discount_claim_present/,
    /original_price_comparison_present/,
    /store_credit_only/,
    /termination_for_cause/,
    /service_suspension_or_termination/
  ];

  if (negativePatterns.some((pattern) => pattern.test(key))) {
    return true;
  }

  if (typeof value === "number") {
    return /risk_score|ambiguity_score|friction_score/i.test(key) && value > 0;
  }

  return false;
}

function getGenericValidationFindingSeverity(row: ScanSignalRow): FindingSeverity {
  if (/preconsent|session_replay|conflict|mismatch/i.test(row.signal_key)) {
    return "high";
  }

  if (typeof row.signal_value_json === "number" && /risk_score|ambiguity_score|friction_score/i.test(row.signal_key)) {
    return row.signal_value_json >= 70 ? "high" : "medium";
  }

  if (/store_credit_only|termination_for_cause|service_suspension_or_termination|high_sensitivity_data_collection_detected/i.test(row.signal_key)) {
    return "medium";
  }

  return "medium";
}

function mapScanSignalCategoryToFindingCategory(row: ScanSignalRow): FindingCategory {
  if (row.category === "disclosure") {
    return "legal";
  }

  if (row.category === "context") {
    return "privacy";
  }

  return row.category;
}

function buildGenericValidationFinding(row: ScanSignalRow): ValidationFindingDefinition {
  return {
    buildEvidence: () =>
      buildDefaultEvidencePacket(
        row,
        `${row.signal_label} was elevated during the scan and merits reviewer attention.`
      ),
    category: mapScanSignalCategoryToFindingCategory(row),
    description: `${row.signal_label} was elevated during the scan and merits reviewer attention.`,
    ruleKey: `scan_signal.${row.signal_key}`,
    severity: getGenericValidationFindingSeverity(row),
    subtype: "scan_signal_review",
    title: row.signal_label
  } satisfies ValidationFindingDefinition;
}

function buildDefaultEvidencePacket(row: ScanSignalRow, claim: string): ValidationEvidencePacket {
  return {
    claim,
    confidenceBasis: ["Automated detector fired for this signal."],
    missingEvidence: ["No rule-specific evidence builder has been configured yet."],
    pageUrls: [],
    policyEvidence: [],
    reviewPolicy: {
      claimType: "behavior_without_disclosure",
      contraryEvidenceTypes: ["contrary_runtime_evidence", "contrary_policy_disclosure"],
      detectorStrength: "medium",
      gapTolerance: "medium",
      requiredSupportTypes: ["detector_signal"],
      rubric: {
        inconclusiveIf: [
          "The detector is weak or ambiguous.",
          "Important coverage gaps make the claim uncertain."
        ],
        notSupportedIf: [
          "There is clear contrary evidence that the claim is false."
        ],
        supportedIf: [
          "The detector fired and supporting evidence exists with no meaningful contrary evidence."
        ]
      }
    },
    runtimeEvidence: [],
    supportingSignals: [
      {
        category: row.category,
        key: row.signal_key,
        label: row.signal_label,
        value: row.signal_value_json
      }
    ]
  };
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean))];
}

function buildSessionReplayEvidence(row: ScanSignalRow, context: ValidationEvidenceBuildContext): ValidationEvidencePacket {
  const trackerSignals = [
    context.scanSignalsByKey.get("privacy.tracker_vendors"),
    context.scanSignalsByKey.get("commerce.session_replay_tool_detected")
  ].filter(Boolean) as ScanSignalRow[];
  const vendors = Array.isArray(context.scanSignalsByKey.get("privacy.tracker_vendors")?.signal_value_json)
    ? (context.scanSignalsByKey.get("privacy.tracker_vendors")?.signal_value_json as string[])
    : [];
  const likelyReplayVendors = vendors.filter((vendor) => /fullstory|session/i.test(vendor));
  const requestDomains = context.runtimeArtifacts?.third_party_request_domains ?? [];
  const scriptDomains = context.runtimeArtifacts?.script_src_domains ?? [];

  return {
    claim: "Session replay behavior appears present without a corresponding disclosure on the site.",
    confidenceBasis: [
      "A context-level detector flagged session replay without disclosure.",
      likelyReplayVendors.length > 0 ? `Likely replay vendors detected: ${likelyReplayVendors.join(", ")}.` : "Replay vendor names were not isolated with high confidence."
    ],
    missingEvidence: [
      "Direct disclosure excerpt or explicit no-disclosure policy excerpt.",
      "Page-level evidence URL showing the replay script on a specific page."
    ],
    pageUrls: [],
    policyEvidence: [],
    reviewPolicy: {
      claimType: "behavior_without_disclosure",
      contraryEvidenceTypes: ["explicit_session_replay_disclosure", "evidence_detector_is_misfiring"],
      detectorStrength: "strong",
      gapTolerance: "medium",
      requiredSupportTypes: ["derived_mismatch_detector", "vendor_evidence"],
      rubric: {
        inconclusiveIf: [
          "Replay vendor evidence is weak or ambiguous.",
          "Disclosure search coverage is materially incomplete.",
          "The detector fired but the supporting evidence is internally inconsistent."
        ],
        notSupportedIf: [
          "There is explicit disclosure covering session replay behavior.",
          "There is convincing evidence that the detected vendor is not a session replay tool."
        ],
        supportedIf: [
          "A positive mismatch detector is present.",
          "Replay vendor evidence exists.",
          "There is no meaningful contrary disclosure evidence."
        ]
      }
    },
    runtimeEvidence: uniqueStrings([
      ...requestDomains.filter((domain) => /fullstory|replay/i.test(domain)),
      ...scriptDomains.filter((domain) => /fullstory|replay/i.test(domain))
    ]),
    supportingSignals: [
      {
        category: row.category,
        key: row.signal_key,
        label: row.signal_label,
        value: row.signal_value_json
      },
      ...trackerSignals.map((signal) => ({
        category: signal.category,
        key: signal.signal_key,
        label: signal.signal_label,
        value: signal.signal_value_json
      }))
    ]
  };
}

function buildPreconsentTrackingEvidence(row: ScanSignalRow, context: ValidationEvidenceBuildContext): ValidationEvidencePacket {
  const relatedSignals = [
    context.scanSignalsByKey.get("privacy.preconsent_tracking_detected"),
    context.scanSignalsByKey.get("privacy.preconsent_violation_count"),
    context.scanSignalsByKey.get("privacy.preconsent_tracker_vendors"),
    context.scanSignalsByKey.get("privacy.preconsent_tracker_evidence_urls"),
    context.scanSignalsByKey.get("privacy.third_party_cookie_count")
  ].filter(Boolean) as ScanSignalRow[];

  const evidenceUrls = Array.isArray(context.scanSignalsByKey.get("privacy.preconsent_tracker_evidence_urls")?.signal_value_json)
    ? (context.scanSignalsByKey.get("privacy.preconsent_tracker_evidence_urls")?.signal_value_json as string[])
    : [];
  const trackerVendors = Array.isArray(context.scanSignalsByKey.get("privacy.preconsent_tracker_vendors")?.signal_value_json)
    ? (context.scanSignalsByKey.get("privacy.preconsent_tracker_vendors")?.signal_value_json as string[])
    : [];
  const violationCount = context.scanSignalsByKey.get("privacy.preconsent_violation_count")?.signal_value_json;

  return {
    claim: "Tracking activity appears to occur before the visitor can make a consent choice.",
    confidenceBasis: [
      "A pre-consent tracking detector fired during the scan.",
      typeof violationCount === "number"
        ? `Pre-consent tracker violation count: ${String(violationCount)}.`
        : "A specific violation count was not available."
      ,
      evidenceUrls.length > 0
        ? `Concrete pre-consent request evidence was captured (${Math.min(evidenceUrls.length, 5)} URLs retained).`
        : "Concrete request URLs were not retained in this packet.",
      trackerVendors.length > 0 ? `Known tracker vendors observed before consent: ${trackerVendors.join(", ")}.` : "Specific pre-consent tracker vendors were not isolated."
    ],
    missingEvidence: evidenceUrls.length > 0 ? [] : ["Concrete request URLs or cookie evidence captured before consent."],
    pageUrls: [],
    policyEvidence: [],
    reviewPolicy: {
      claimType: "tracking_before_consent",
      contraryEvidenceTypes: ["consent_already_granted", "evidence_captured_after_choice"],
      detectorStrength: "strong",
      gapTolerance: "medium",
      requiredSupportTypes: ["detector_signal", "request_or_cookie_evidence", "tracker_vendor_evidence"],
      rubric: {
        inconclusiveIf: [
          "The timing of tracking relative to consent is unclear.",
          "The detector fired but no concrete request, cookie, or vendor evidence supports it.",
          "Coverage gaps make the detector result uncertain."
        ],
        notSupportedIf: [
          "The evidence shows tracking only after a valid consent choice.",
          "The observed network activity is not reasonably tracking-related."
        ],
        supportedIf: [
          "A pre-consent detector fired.",
          "Concrete request, cookie, or vendor evidence supports the detector.",
          "There is no meaningful contrary timing evidence."
        ]
      }
    },
    runtimeEvidence: evidenceUrls.slice(0, 5),
    supportingSignals: relatedSignals.map((signal) => ({
      category: signal.category,
      key: signal.signal_key,
      label: signal.signal_label,
      value: signal.signal_value_json
    }))
  };
}

function buildRejectPersistenceEvidence(row: ScanSignalRow, context: ValidationEvidenceBuildContext): ValidationEvidencePacket {
  const persistedVendors =
    (Array.isArray(context.runtimeArtifacts?.consent_reject_persisted_tracker_vendor_names)
      ? context.runtimeArtifacts?.consent_reject_persisted_tracker_vendor_names
      : null) ??
    (Array.isArray(row.signal_value_json) ? row.signal_value_json : []);
  const postRejectEvidenceUrls = Array.isArray(context.runtimeArtifacts?.consent_post_reject_tracker_evidence_urls)
    ? context.runtimeArtifacts.consent_post_reject_tracker_evidence_urls
    : [];
  const reducedTracking = context.runtimeArtifacts?.consent_reject_reduced_tracking;
  const rejectWorked =
    reducedTracking !== null ||
    postRejectEvidenceUrls.length > 0 ||
    persistedVendors.length > 0;

  return {
    claim: "Trackers continued to persist after a reject-style consent interaction.",
    confidenceBasis: [
      rejectWorked
        ? "The consent audit successfully completed a reject-style interaction."
        : "The consent audit attempted a reject-style interaction, but completion certainty was limited.",
      reducedTracking === true
        ? "Tracking decreased after reject, but some vendors or requests still persisted."
        : "Reject interaction did not fully suppress observed tracker activity.",
      postRejectEvidenceUrls.length > 0
        ? `Concrete post-reject request evidence was captured (${Math.min(postRejectEvidenceUrls.length, 5)} URLs retained).`
        : "Concrete post-reject request URLs were not retained in this packet.",
      persistedVendors.length > 0
        ? `Tracker vendors persisted after reject: ${persistedVendors.join(", ")}.`
        : "Specific post-reject tracker vendors were not isolated."
    ],
    missingEvidence: [
      ...(postRejectEvidenceUrls.length > 0 ? [] : ["Concrete request URLs captured after the reject interaction."]),
      ...(rejectWorked ? [] : ["A clearly confirmed reject interaction completion state."])
    ],
    pageUrls: [],
    policyEvidence: [],
    reviewPolicy: {
      claimType: "tracking_after_reject",
      contraryEvidenceTypes: ["reject_fully_suppressed_tracking", "reject_step_failed", "retained_request_is_strictly_necessary"],
      detectorStrength: "strong",
      gapTolerance: "medium",
      requiredSupportTypes: ["consent_audit_signal", "post_reject_vendor_or_request_evidence"],
      rubric: {
        inconclusiveIf: [
          "The reject interaction did not complete reliably.",
          "Evidence after reject is incomplete or ambiguous.",
          "The retained post-reject request is concrete but its purpose is unclear."
        ],
        notSupportedIf: [
          "The evidence shows tracking was fully suppressed after reject.",
          "The retained request is reasonably essential rather than tracking-related."
        ],
        supportedIf: [
          "The reject interaction completed.",
          "Concrete post-reject vendor or request evidence exists.",
          "There is no meaningful contrary suppression evidence."
        ]
      }
    },
    runtimeEvidence: postRejectEvidenceUrls.slice(0, 5),
    supportingSignals: [
      {
        category: row.category,
        key: row.signal_key,
        label: row.signal_label,
        value: row.signal_value_json
      },
      {
        category: "privacy",
        key: "privacy.persisted_tracker_vendors_after_reject",
        label: "Persisted tracker vendors after reject",
        value: persistedVendors
      },
      {
        category: "privacy",
        key: "privacy.reject_interaction_completed",
        label: "Reject interaction completed",
        value: rejectWorked
      }
    ]
  };
}

function buildAccessibilityEvidence(row: ScanSignalRow, context: ValidationEvidenceBuildContext): ValidationEvidencePacket {
  const relatedSignals = [
    context.scanSignalsByKey.get("accessibility.wcag_error_count_total"),
    context.scanSignalsByKey.get("accessibility.wcag_aria_error_count"),
    context.scanSignalsByKey.get("accessibility.wcag_focus_indicator_issue_count")
  ].filter(Boolean) as ScanSignalRow[];

  return {
    claim: "Automated accessibility testing surfaced WCAG rule violations on this site.",
    confidenceBasis: [
      typeof row.signal_value_json === "number" ? `Automated WCAG error count: ${row.signal_value_json}.` : "Automated accessibility rule violations were recorded."
    ],
    missingEvidence: ["Rule-level example rows or affected page URLs for the highest-priority violations."],
    pageUrls: [],
    policyEvidence: [],
    reviewPolicy: {
      claimType: "automated_accessibility",
      contraryEvidenceTypes: ["rule_output_invalidated", "scan_coverage_too_thin"],
      detectorStrength: "strong",
      gapTolerance: "high",
      requiredSupportTypes: ["automated_rule_counts"],
      rubric: {
        inconclusiveIf: [
          "The automated findings are too sparse or coverage is materially incomplete."
        ],
        notSupportedIf: [
          "There is convincing evidence that the automated rule output is invalid or unrelated."
        ],
        supportedIf: [
          "Automated rule violations were recorded.",
          "There is no meaningful contrary evidence undermining those results."
        ]
      }
    },
    runtimeEvidence: [],
    supportingSignals: relatedSignals.map((signal) => ({
      category: signal.category,
      key: signal.signal_key,
      label: signal.signal_label,
      value: signal.signal_value_json
    }))
  };
}

function isActiveSignalValue(value: ScanSignalRow["signal_value_json"], valueType: ScanSignalRow["value_type"]) {
  if (valueType === "boolean") {
    return value === true;
  }

  if (valueType === "number") {
    return typeof value === "number" && value > 0;
  }

  if (valueType === "text") {
    return typeof value === "string" && value.trim().length > 0;
  }

  return Array.isArray(value) && value.length > 0;
}

function buildSnapshotFallbackFindings(snapshot: ValidationSnapshotFallbackRow): Omit<ValidationRunFindingInsert, "rank">[] {
  const findings: Omit<ValidationRunFindingInsert, "rank">[] = [];

  if (
    snapshot.preconsent_tracking_detected ||
    snapshot.tracking_before_consent_detected === true ||
    snapshot.third_party_cookie_set_before_consent === true
  ) {
    findings.push({
      category: "privacy",
      description: "Tracking activity appears to occur before the visitor can make a consent choice.",
      evidence_json: {
        claim: "Tracking activity appears to occur before the visitor can make a consent choice.",
        confidenceBasis: ["Snapshot fallback detected pre-consent tracking indicators."],
        missingEvidence: ["Request-level evidence URLs were not available in snapshot fallback mode."],
        pageUrls: [],
        policyEvidence: [],
        runtimeEvidence: [],
        supportingSignals: [
          {
            category: "privacy",
            key: "privacy.preconsent_tracking_detected",
            label: "Pre-consent tracking detected",
            value: snapshot.preconsent_tracking_detected
          },
          {
            category: "privacy",
            key: "privacy.third_party_cookie_set_before_consent",
            label: "Third-party cookies before consent",
            value: snapshot.third_party_cookie_set_before_consent
          },
          {
            category: "privacy",
            key: "privacy.tracking_before_consent_detected",
            label: "Tracking before consent detected",
            value: snapshot.tracking_before_consent_detected
          }
        ]
      },
      finding_id: null,
      page_url: null,
      rule_key: "privacy.trackers_before_consent_detected",
      severity: "high",
      subtype: "preconsent_tracking",
      title: "Trackers observed before consent"
    });
  }

  if (
    snapshot.cookie_banner_present &&
    (!snapshot.reject_all_present || snapshot.dark_pattern_reject_button_missing)
  ) {
    findings.push({
      category: "privacy",
      description: "A consent experience was detected without a clear reject-all control.",
      evidence_json: {
        claim: "A consent experience was detected without a clear reject-all control.",
        confidenceBasis: ["Snapshot fallback indicates a consent surface without a clear reject control."],
        missingEvidence: ["Banner HTML or page-level consent UI evidence was not available in snapshot fallback mode."],
        pageUrls: [],
        policyEvidence: [],
        runtimeEvidence: [],
        supportingSignals: [
          {
            category: "privacy",
            key: "privacy.cookie_banner_present",
            label: "Cookie banner present",
            value: snapshot.cookie_banner_present
          },
          {
            category: "privacy",
            key: "privacy.reject_all_present",
            label: "Reject all present",
            value: snapshot.reject_all_present
          },
          {
            category: "privacy",
            key: "privacy.dark_pattern_reject_button_missing",
            label: "Reject button missing",
            value: snapshot.dark_pattern_reject_button_missing
          }
        ]
      },
      finding_id: null,
      page_url: null,
      rule_key: "privacy.reject_control_missing_detected",
      severity: "high",
      subtype: "consent_controls",
      title: "Reject-all control missing"
    });
  }

  if (
    snapshot.privacy_policy_present &&
    (
      (((snapshot.privacy_policy_word_count ?? 0) > 0) && ((snapshot.privacy_policy_word_count ?? 0) < 250)) ||
      (((snapshot.legal_coverage_score ?? 100) > 0) && ((snapshot.legal_coverage_score ?? 100) < 70))
    )
  ) {
    findings.push({
      category: "legal",
      description: "A privacy policy was detected, but its coverage appeared limited or incomplete.",
      evidence_json: {
        claim: "A privacy policy was detected, but its coverage appeared limited or incomplete.",
        confidenceBasis: ["Snapshot fallback indicates weak privacy-policy coverage signals."],
        missingEvidence: ["Policy excerpts or structured coverage diagnostics were not available in snapshot fallback mode."],
        pageUrls: [],
        policyEvidence: [],
        runtimeEvidence: [],
        supportingSignals: [
          {
            category: "disclosure",
            key: "disclosure.privacy_policy_present",
            label: "Privacy policy present",
            value: snapshot.privacy_policy_present
          },
          {
            category: "context",
            key: "context.legal_coverage_score",
            label: "Legal coverage score",
            value: snapshot.legal_coverage_score
          },
          {
            category: "disclosure",
            key: "disclosure.privacy_policy_word_count",
            label: "Privacy policy word count",
            value: snapshot.privacy_policy_word_count
          }
        ]
      },
      finding_id: null,
      page_url: null,
      rule_key: "disclosure.privacy_policy_limited",
      severity: "medium",
      subtype: "policy_coverage",
      title: "Privacy policy coverage limited"
    });
  }

  return findings;
}

function addDays(now: Date, days: number) {
  return new Date(now.getTime() + days * 24 * 60 * 60_000);
}

export async function insertValidationAuditEvent(input: {
  actorUserId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
  reason?: string | null;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("validation_audit_events").insert({
    actor_user_id: input.actorUserId ?? null,
    event_type: input.eventType,
    metadata_json: input.metadata ?? null,
    reason: input.reason ?? null
  });

  if (error) {
    throw new Error(`Failed to insert validation audit event: ${error.message}`);
  }
}

export async function ensureValidationSettings() {
  const supabase = createAdminClient();
  const env = getWorkerEnv();
  const { data, error } = await supabase
    .from("validation_settings")
    .upsert(
      {
        singleton_key: VALIDATION_SETTINGS_KEY,
        run_mode: env.VALIDATION_DEFAULT_RUN_MODE ?? VALIDATION_DEFAULT_RUN_MODE,
        automatic_interval_minutes: env.VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES ?? VALIDATION_DEFAULT_INTERVAL_MINUTES
      },
      { onConflict: "singleton_key" }
    )
    .select(
      "singleton_key, pipeline_enabled, run_mode, automatic_interval_minutes, updated_at, updated_by_user_id, operator_note, next_due_at, last_scheduled_at, last_tranco_sync_at"
    )
    .single();

  if (error || !data) {
    throw new Error(`Failed to load validation settings: ${error?.message ?? "Unknown error"}`);
  }

  const row = data as ValidationSettingsRow;
  if (!isValidValidationInterval(row.automatic_interval_minutes)) {
    const { error: updateError } = await supabase
      .from("validation_settings")
      .update({ automatic_interval_minutes: VALIDATION_DEFAULT_INTERVAL_MINUTES })
      .eq("singleton_key", VALIDATION_SETTINGS_KEY);

    if (updateError) {
      throw new Error(`Failed to normalize validation interval: ${updateError.message}`);
    }

    return {
      automaticIntervalMinutes: VALIDATION_DEFAULT_INTERVAL_MINUTES,
      lastScheduledAt: row.last_scheduled_at,
      lastTrancoSyncAt: row.last_tranco_sync_at,
      nextDueAt: row.next_due_at,
      operatorNote: row.operator_note,
      pipelineEnabled: row.pipeline_enabled,
      runMode: row.run_mode,
      updatedAt: row.updated_at,
      updatedByUserId: row.updated_by_user_id
    };
  }

  return {
    automaticIntervalMinutes: row.automatic_interval_minutes,
    lastScheduledAt: row.last_scheduled_at,
    lastTrancoSyncAt: row.last_tranco_sync_at,
    nextDueAt: row.next_due_at,
    operatorNote: row.operator_note,
    pipelineEnabled: row.pipeline_enabled,
    runMode: row.run_mode,
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id
  };
}

export async function getValidationPipelineState(): Promise<ValidationPipelineState> {
  const env = getWorkerEnv();

  if (!env.VALIDATION_PIPELINE_ENABLED) {
    return "paused_by_env";
  }

  const settings = await ensureValidationSettings();
  return settings.pipelineEnabled ? "running" : "paused_by_admin";
}

export async function setValidationScheduleState(input: {
  lastScheduledAt?: Date | null;
  lastTrancoSyncAt?: Date | null;
  nextDueAt?: Date | null;
}) {
  const supabase = createAdminClient();
  const patch: Record<string, string | null> = {};

  if (input.lastScheduledAt !== undefined) {
    patch.last_scheduled_at = input.lastScheduledAt ? input.lastScheduledAt.toISOString() : null;
  }

  if (input.lastTrancoSyncAt !== undefined) {
    patch.last_tranco_sync_at = input.lastTrancoSyncAt ? input.lastTrancoSyncAt.toISOString() : null;
  }

  if (input.nextDueAt !== undefined) {
    patch.next_due_at = input.nextDueAt ? input.nextDueAt.toISOString() : null;
  }

  if (Object.keys(patch).length === 0) {
    return;
  }

  const { error } = await supabase.from("validation_settings").update(patch).eq("singleton_key", VALIDATION_SETTINGS_KEY);
  if (error) {
    throw new Error(`Failed to update validation scheduler state: ${error.message}`);
  }
}

export async function getActiveValidationRunCount() {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("validation_runs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "collecting", "ranking", "validating"]);

  if (error) {
    throw new Error(`Failed to count active validation runs: ${error.message}`);
  }

  return count ?? 0;
}

export async function getValidationRunById(validationRunId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("validation_runs")
    .select(
      "id, validation_target_id, domain_id, scan_id, hostname, normalized_url, tranco_rank, rank_band, trigger_mode, status, error_message, finding_count, reviewed_finding_count, average_agreement_score, created_at, started_at, completed_at"
    )
    .eq("id", validationRunId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load validation run ${validationRunId}: ${error.message}`);
  }

  const row = (data as ValidationRunRow | null) ?? null;
  if (!row) {
    return null;
  }

  return {
    averageAgreementScore: row.average_agreement_score,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    domainId: row.domain_id,
    errorMessage: row.error_message,
    findingCount: row.finding_count,
    hostname: row.hostname,
    id: row.id,
    normalizedUrl: row.normalized_url,
    rankBand: row.rank_band,
    reviewedFindingCount: row.reviewed_finding_count,
    scanId: row.scan_id,
    startedAt: row.started_at,
    status: row.status,
    targetId: row.validation_target_id,
    trancoRank: row.tranco_rank,
    triggerMode: row.trigger_mode
  } satisfies ValidationRunRecord;
}

export async function updateValidationRun(
  validationRunId: string,
  patch: Partial<{
    average_agreement_score: number | null;
    completed_at: string | null;
    domain_id: string | null;
    error_message: string | null;
    finding_count: number;
    reviewed_finding_count: number;
    scan_id: string | null;
    started_at: string | null;
    status: ValidationRunStatus;
  }>
) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("validation_runs").update(patch).eq("id", validationRunId);
  if (error) {
    throw new Error(`Failed to update validation run ${validationRunId}: ${error.message}`);
  }
}

export async function updateValidationTargetAfterRun(input: {
  errorMessage?: string | null;
  hostname: string;
  lastStatus: ValidationRunStatus | "skipped";
  trancoRank: number | null;
}) {
  const supabase = createAdminClient();
  const { data: target, error: loadError } = await supabase
    .from("validation_targets")
    .select("id, consecutive_failures")
    .eq("hostname", input.hostname)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load validation target ${input.hostname}: ${loadError.message}`);
  }

  if (!target) {
    return;
  }

  const now = new Date();
  const consecutiveFailures =
    input.lastStatus === "completed" ? 0 : Number((target as { consecutive_failures?: number }).consecutive_failures ?? 0) + 1;
  const patch: Record<string, string | number | null> = {
    consecutive_failures: consecutiveFailures,
    last_completed_at: now.toISOString(),
    last_error: input.errorMessage ?? null,
    last_status: input.lastStatus
  };

  if (input.lastStatus === "completed") {
    patch.cooldown_until = addDays(now, getCooldownDaysForRank(input.trancoRank)).toISOString();
    patch.backoff_until = null;
  } else if (input.errorMessage && /(captcha|blocked|403|429|forbidden)/i.test(input.errorMessage)) {
    patch.backoff_until = addDays(now, 90).toISOString();
  } else if (input.lastStatus === "failed") {
    patch.backoff_until = addDays(now, Math.min(1 << Math.max(0, consecutiveFailures - 1), 14)).toISOString();
  }

  const { error } = await supabase.from("validation_targets").update(patch).eq("id", (target as { id: string }).id);
  if (error) {
    throw new Error(`Failed to update validation target ${input.hostname}: ${error.message}`);
  }
}

export async function createValidationRun(input: {
  hostname: string;
  normalizedUrl: string;
  targetId?: string | null;
  trancoRank?: number | null;
  triggerMode: ValidationRunMode;
  triggeredByUserId?: string | null;
}) {
  const supabase = createAdminClient();
  const rankBand = getRankBand(input.trancoRank ?? null);
  const { data, error } = await supabase
    .from("validation_runs")
    .insert({
      hostname: input.hostname,
      normalized_url: input.normalizedUrl,
      rank_band: rankBand,
      status: "queued",
      tranco_rank: input.trancoRank ?? null,
      trigger_mode: input.triggerMode,
      triggered_by_user_id: input.triggeredByUserId ?? null,
      validation_target_id: input.targetId ?? null
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create validation run for ${input.hostname}: ${error?.message ?? "Unknown error"}`);
  }

  return (data as { id: string }).id;
}

export async function getEligibleTargetForAutomaticRun(now = new Date()) {
  const supabase = createAdminClient();
  const activeTargetIds = new Set<string>();
  const { data: activeRuns, error: activeRunsError } = await supabase
    .from("validation_runs")
    .select("validation_target_id")
    .in("status", ["queued", "collecting", "ranking", "validating"]);

  if (activeRunsError) {
    throw new Error(`Failed to load active validation runs: ${activeRunsError.message}`);
  }

  for (const row of (activeRuns ?? []) as Array<{ validation_target_id: string | null }>) {
    if (row.validation_target_id) {
      activeTargetIds.add(row.validation_target_id);
    }
  }

  const bands = Object.entries({
    "1k-5k": 20,
    "5k-20k": 30,
    "20k-50k": 30,
    "50k-100k": 20
  });
  const random = Math.random() * 100;
  let cumulative = 0;
  let selectedBand = "5k-20k";
  for (const [band, weight] of bands) {
    cumulative += weight;
    if (random <= cumulative) {
      selectedBand = band;
      break;
    }
  }

  const candidateBands = [selectedBand, ...bands.map(([band]) => band).filter((band) => band !== selectedBand)];
  for (const band of candidateBands) {
    const { data, error } = await supabase
      .from("validation_targets")
      .select("id, hostname, normalized_url, active, denylisted, deny_reason, cooldown_until, backoff_until, tranco_rank, rank_band, last_run_at, last_completed_at, last_status, last_error")
      .eq("active", true)
      .eq("denylisted", false)
      .eq("rank_band", band)
      .order("tranco_rank", { ascending: true })
      .limit(500);

    if (error) {
      throw new Error(`Failed to load validation targets for band ${band}: ${error.message}`);
    }

    const eligible = ((data ?? []) as ValidationTargetRow[]).filter((target) => {
      if (activeTargetIds.has(target.id)) {
        return false;
      }

      const cooldownUntil = target.cooldown_until ? new Date(target.cooldown_until).getTime() : 0;
      const backoffUntil = target.backoff_until ? new Date(target.backoff_until).getTime() : 0;
      return cooldownUntil <= now.getTime() && backoffUntil <= now.getTime();
    });

    if (eligible.length === 0) {
      continue;
    }

    const selected = eligible[Math.floor(Math.random() * eligible.length)] ?? null;
    if (selected) {
      return {
        hostname: selected.hostname,
        id: selected.id,
        normalizedUrl: selected.normalized_url,
        rankBand: selected.rank_band,
        trancoRank: selected.tranco_rank
      };
    }
  }

  return null;
}

export async function upsertValidationTargets(rows: Array<{ hostname: string; normalizedUrl: string; trancoRank: number; source: string }>) {
  if (rows.length === 0) {
    return 0;
  }

  const supabase = createAdminClient();
  let inserted = 0;
  const batchSize = 500;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize).map((row) => ({
      active: true,
      hostname: row.hostname,
      normalized_url: row.normalizedUrl,
      rank_band: getRankBand(row.trancoRank),
      source: row.source,
      tranco_rank: row.trancoRank
    }));

    const { error } = await supabase.from("validation_targets").upsert(batch, { onConflict: "hostname" });
    if (error) {
      throw new Error(`Failed to upsert validation targets: ${error.message}`);
    }
    inserted += batch.length;
  }

  return inserted;
}

export async function markValidationTargetRunQueued(hostname: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("validation_targets")
    .update({ last_run_at: new Date().toISOString(), last_status: "queued", last_error: null })
    .eq("hostname", hostname);

  if (error) {
    throw new Error(`Failed to mark validation target ${hostname} as queued: ${error.message}`);
  }
}

export async function ensureAnonymousValidationDomain(hostname: string, normalizedUrl: string) {
  const supabase = createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("domains")
    .select("id, hostname, normalized_url")
    .is("organization_id", null)
    .eq("normalized_url", normalizedUrl)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load validation domain ${normalizedUrl}: ${existingError.message}`);
  }

  if (existing) {
    return existing as { id: string; hostname: string; normalized_url: string };
  }

  const { data, error } = await supabase
    .from("domains")
    .insert({
      hostname,
      normalized_url: normalizedUrl
    })
    .select("id, hostname, normalized_url")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create validation domain ${hostname}: ${error?.message ?? "Unknown error"}`);
  }

  return data as { id: string; hostname: string; normalized_url: string };
}

export async function createValidationScan(input: {
  domainId: string;
  hostname: string;
  normalizedUrl: string;
  pagesRequested?: number;
}) {
  const supabase = createAdminClient();
  const pagesRequested = Math.max(3, input.pagesRequested ?? 8);
  const scanConfig = {
    hostname: input.hostname,
    maxPages: pagesRequested,
    normalizedUrl: input.normalizedUrl,
    processor: "agentic-validation-v1",
    profile: "agentic-validation-v1",
    source: "validation-manual"
  };

  const { data, error } = await supabase
    .from("scans")
    .insert({
      domain_id: input.domainId,
      pages_requested: pagesRequested,
      pages_scanned: 0,
      scan_config_json: scanConfig,
      scan_type: "full",
      status: "queued"
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create validation scan for ${input.hostname}: ${error?.message ?? "Unknown error"}`);
  }

  const scanId = (data as { id: string }).id;
  const { error: domainError } = await supabase.from("domains").update({ latest_scan_id: scanId }).eq("id", input.domainId);
  if (domainError) {
    throw new Error(`Failed to set validation domain latest scan: ${domainError.message}`);
  }

  return scanId;
}

export async function insertValidationScanEvent(input: {
  domainId?: string | null;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
  scanId?: string | null;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("scan_events").insert({
    domain_id: input.domainId ?? null,
    event_type: input.eventType,
    message: input.message,
    metadata_json: input.metadata ?? null,
    organization_id: null,
    scan_id: input.scanId ?? null
  });

  if (error) {
    throw new Error(`Failed to insert validation scan event: ${error.message}`);
  }
}

export async function loadRankableFindings(scanId: string) {
  const supabase = createAdminClient();
  const [{ data: signalRows, error }, { data: snapshot, error: snapshotError }, { data: runtimeArtifacts, error: runtimeArtifactsError }] =
    await Promise.all([
      supabase
        .from("scan_signals")
        .select("category, signal_key, signal_label, signal_value_json, value_type")
        .eq("scan_id", scanId)
        .in("category", ["accessibility", "context", "disclosure", "privacy"]),
      supabase
        .from("scan_snapshots")
        .select(
          "cmp_vendor_name, consent_withdrawal_mechanism_present, cookie_banner_present, dark_pattern_reject_button_missing, legal_coverage_score, preconsent_tracking_detected, privacy_policy_present, privacy_policy_word_count, reject_all_present, third_party_cookie_set_before_consent, tracking_before_consent_detected"
        )
        .eq("scan_id", scanId)
        .maybeSingle(),
      supabase
        .from("scan_runtime_artifacts")
        .select(
          "consent_post_reject_tracker_evidence_urls, consent_post_reject_tracker_vendor_names, consent_reject_persisted_tracker_vendor_names, consent_reject_reduced_tracking, third_party_request_domains, script_src_domains"
        )
        .eq("scan_id", scanId)
        .maybeSingle()
    ]);

  if (error) {
    throw new Error(`Failed to load validation findings for scan ${scanId}: ${error.message}`);
  }

  if (snapshotError) {
    throw new Error(`Failed to load validation snapshot context for scan ${scanId}: ${snapshotError.message}`);
  }

  if (runtimeArtifactsError) {
    throw new Error(`Failed to load validation runtime context for scan ${scanId}: ${runtimeArtifactsError.message}`);
  }

  const rows = (signalRows ?? []) as ScanSignalRow[];
  const context: ValidationEvidenceBuildContext = {
    runtimeArtifacts: (runtimeArtifacts as ScanRuntimeArtifactsRow | null) ?? null,
    scanSignalsByKey: new Map(rows.map((row) => [row.signal_key, row])),
    snapshot: (snapshot as ScanSnapshotRow | null) ?? null
  };

  if (rows.length === 0) {
    const { data: snapshot, error: snapshotError } = await supabase
      .from("scan_snapshots")
      .select(
        "cookie_banner_present, reject_all_present, dark_pattern_reject_button_missing, preconsent_tracking_detected, tracking_before_consent_detected, third_party_cookie_set_before_consent, privacy_policy_present, privacy_policy_word_count, legal_coverage_score"
      )
      .eq("scan_id", scanId)
      .maybeSingle();

    if (snapshotError) {
      throw new Error(`Failed to load validation snapshot fallback for scan ${scanId}: ${snapshotError.message}`);
    }

    if (snapshot) {
      return buildSnapshotFallbackFindings(snapshot as ValidationSnapshotFallbackRow);
    }

    return [];
  }

  const findings: Omit<ValidationRunFindingInsert, "rank">[] = [];

  for (const row of rows) {
    if (!isActiveSignalValue(row.signal_value_json, row.value_type)) {
      continue;
    }

    const definition =
      VALIDATION_SIGNAL_FINDING_DEFINITIONS[row.signal_key as keyof typeof VALIDATION_SIGNAL_FINDING_DEFINITIONS] ??
      (isGenericValidationConcernSignal(row) ? buildGenericValidationFinding(row) : null);

    if (!definition) {
      continue;
    }

    findings.push({
      category: definition.category,
      description: definition.description,
      evidence_json: definition.buildEvidence ? definition.buildEvidence(row, context) : buildDefaultEvidencePacket(row, definition.description),
      finding_id: null,
      page_url: null,
      rule_key: definition.ruleKey,
      severity: definition.severity,
      subtype: definition.subtype,
      title: definition.title
    });
  }

  return findings.filter((finding, index, allFindings) => {
    return allFindings.findIndex((candidate) => candidate.rule_key === finding.rule_key) === index;
  });
}

export async function replaceValidationRunFindings(validationRunId: string, findings: ValidationRunFindingInsert[]) {
  const supabase = createAdminClient();
  const { error: deleteError } = await supabase.from("validation_run_findings").delete().eq("validation_run_id", validationRunId);
  if (deleteError) {
    throw new Error(`Failed to clear validation run findings: ${deleteError.message}`);
  }

  if (findings.length === 0) {
    return [] as ValidationRunFindingRow[];
  }

  const { data, error } = await supabase
    .from("validation_run_findings")
    .insert(findings.map(({ rank, ...finding }) => ({ ...finding, finding_rank: rank, rank, validation_run_id: validationRunId })))
    .select("id, validation_run_id, category, subtype, rule_key, title, description, severity, page_url, evidence_json, finding_rank");

  if (error) {
    throw new Error(`Failed to insert validation run findings: ${error.message}`);
  }

  return ((data ?? []) as ValidationRunFindingDbRow[]).map((row) => ({
    ...row,
    rank: row.finding_rank
  }));
}

export async function listValidationRunFindings(validationRunId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("validation_run_findings")
    .select("id, validation_run_id, category, subtype, rule_key, title, description, severity, page_url, evidence_json, finding_rank")
    .eq("validation_run_id", validationRunId)
    .order("finding_rank", { ascending: true })
    .limit(VALIDATION_FINDING_LIMIT);

  if (error) {
    throw new Error(`Failed to load validation run findings for ${validationRunId}: ${error.message}`);
  }

  return ((data ?? []) as ValidationRunFindingDbRow[]).map((row) => ({
    ...row,
    rank: row.finding_rank
  }));
}

export async function replaceValidationVerdict(input: ValidationVerdictInsert) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("validation_verdicts")
    .upsert({ ...input }, { onConflict: "validation_run_finding_id" });

  if (error) {
    throw new Error(`Failed to upsert validation verdict: ${error.message}`);
  }
}

export async function summarizeValidationRun(validationRunId: string) {
  const supabase = createAdminClient();
  const { data: runFindings, error: findingsError } = await supabase
    .from("validation_run_findings")
    .select("id")
    .eq("validation_run_id", validationRunId);

  if (findingsError) {
    throw new Error(`Failed to load validation run findings for summary ${validationRunId}: ${findingsError.message}`);
  }

  const findingIds = ((runFindings ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (findingIds.length === 0) {
    await updateValidationRun(validationRunId, {
      average_agreement_score: null,
      completed_at: new Date().toISOString(),
      reviewed_finding_count: 0,
      status: "completed"
    });
    return;
  }

  const { data, error } = await supabase
    .from("validation_verdicts")
    .select("agreement_score")
    .in("validation_run_finding_id", findingIds);

  if (error) {
    throw new Error(`Failed to summarize validation run ${validationRunId}: ${error.message}`);
  }

  const verdicts = (data ?? []) as Array<{ agreement_score: number }>;
  const averageAgreementScore =
    verdicts.length > 0 ? Math.round(verdicts.reduce((sum, verdict) => sum + Number(verdict.agreement_score ?? 0), 0) / verdicts.length) : null;

  await updateValidationRun(validationRunId, {
    average_agreement_score: averageAgreementScore,
    completed_at: new Date().toISOString(),
    reviewed_finding_count: verdicts.length,
    status: "completed"
  });
}

export function normalizeValidationTargetUrl(input: string) {
  const normalizedUrl = normalizeUrl(input);
  return {
    hostname: extractHostname(normalizedUrl),
    normalizedUrl
  };
}

export function buildNextDueAt(intervalMinutes: number, from = new Date()) {
  return getNextDueAt({ from, intervalMinutes });
}
