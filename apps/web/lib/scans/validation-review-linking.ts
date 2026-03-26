export type ScanValidationFinding = {
  category: string | null;
  description: string | null;
  evidence: Record<string, unknown> | null;
  findingFamily: string | null;
  findingScope: string | null;
  findingSource: string | null;
  findingSubject: string | null;
  id: string;
  agreementScore: number | null;
  modelConfidence: number | null;
  model: string | null;
  pageUrl: string | null;
  promptVersion: string | null;
  rationale: string | null;
  ruleKey: string;
  severity: string | null;
  subtype: string | null;
  systemConfidenceBand: "very_high" | "high" | "moderate" | "low" | "very_low" | null;
  systemConfidenceExplanation: string | null;
  systemConfidenceScore: number | null;
  title: string;
  verdict: "supported" | "inconclusive" | "not_supported" | null;
};

const SIGNAL_TO_VALIDATION_RULE_KEYS: Record<string, string[]> = {
  "accessibility.wcag_error_count_total": ["accessibility.wcag_errors_detected"],
  "accessibility.litigation_risk_score": ["scan_snapshot.accessibility.accessibility_risk_score"],
  "context.session_replay_without_disclosure_detected": ["privacy.session_replay_without_disclosure_detected"],
  "disclosure.disclosure_language_missing_detected": ["disclosure.disclosure_language_missing_detected"],
  "disclosure.policy_runtime_disclosure_likely_obstructed": ["scan_signal.disclosure.policy_runtime_disclosure_likely_obstructed"],
  "disclosure.privacy_policy_limited": ["disclosure.privacy_policy_limited"],
  "privacy.policy_runtime_functional_misalignment_detected": ["scan_signal.privacy.policy_runtime_functional_misalignment_detected"],
  "privacy.consent_reject_persisted_tracker_vendors": ["privacy.trackers_persist_after_reject_detected"],
  "privacy.preconsent_tracking_detected": ["privacy.trackers_before_consent_detected"],
  "privacy.preconsent_violation_count": ["privacy.trackers_before_consent_detected"],
  "privacy.reject_control_missing_detected": ["privacy.reject_control_missing_detected"],
  "privacy.trackers_before_consent_detected": ["privacy.trackers_before_consent_detected"],
  "privacy.user_rights_friction_score": ["scan_signal.privacy.user_rights_friction_score"]
};

const TITLE_TO_VALIDATION_RULE_KEYS: Record<string, string[]> = {
  "automated accessibility issues detected": ["accessibility.wcag_errors_detected"],
  "accessibility risk score": ["scan_snapshot.accessibility.accessibility_risk_score"],
  "critical user-rights fulfillment friction": ["scan_signal.privacy.user_rights_friction_score"],
  "disclosure likely obstructed": ["scan_signal.disclosure.policy_runtime_disclosure_likely_obstructed"],
  "disclosure language missing": ["disclosure.disclosure_language_missing_detected"],
  "functional misalignment": ["scan_signal.privacy.policy_runtime_functional_misalignment_detected"],
  "high-confidence functional misalignment": ["scan_signal.privacy.policy_runtime_functional_misalignment_detected"],
  "low-confidence extraction": ["section_review.low_confidence_critical_fields", "scan_report_review.low_confidence_critical_fields"],
  "low-confidence extraction cookie policy": [
    "policy_review.low_confidence_critical_fields.cookie_policy",
    "section_review.low_confidence_critical_fields",
    "scan_report_review.low_confidence_critical_fields"
  ],
  "low-confidence extraction privacy policy": [
    "policy_review.low_confidence_critical_fields.privacy_policy",
    "section_review.low_confidence_critical_fields",
    "scan_report_review.low_confidence_critical_fields"
  ],
  "low-confidence extraction terms of service": [
    "policy_review.low_confidence_critical_fields.terms_of_service",
    "section_review.low_confidence_critical_fields",
    "scan_report_review.low_confidence_critical_fields"
  ],
  "low-confidence extraction tos": [
    "policy_review.low_confidence_critical_fields.terms_of_service",
    "section_review.low_confidence_critical_fields",
    "scan_report_review.low_confidence_critical_fields"
  ],
  "low-confidence policy extraction": ["section_review.low_confidence_critical_fields", "scan_report_review.low_confidence_critical_fields"],
  "possible undisclosed session replay": ["privacy.session_replay_without_disclosure_detected"],
  "possible pre-consent tracking signals on first load": ["privacy.trackers_before_consent_detected"],
  "pre-consent tracking incidents detected": ["privacy.trackers_before_consent_detected"],
  "privacy policy coverage limited": ["disclosure.privacy_policy_limited"],
  "browser-level privacy signal effect not evident": ["privacy.gpc_signal_not_honored"],
  "reject path appears less direct than accept path": ["privacy.reject_control_missing_detected"],
  "reject path may not fully suppress non-essential activity": ["privacy.trackers_persist_after_reject_detected"],
  "reject-all control missing": ["privacy.reject_control_missing_detected"],
  "session replay without disclosure": ["privacy.session_replay_without_disclosure_detected"],
  "trackers observed before consent": ["privacy.trackers_before_consent_detected"],
  "trackers persisted after reject": ["privacy.trackers_persist_after_reject_detected"]
};

function normalizeFindingTitle(title: string) {
  return title.trim().toLowerCase();
}

export function getValidationMatchKeysForSignal(signalKey: string) {
  return SIGNAL_TO_VALIDATION_RULE_KEYS[signalKey] ?? [];
}

export function getValidationMatchKeysForTitle(title: string) {
  return TITLE_TO_VALIDATION_RULE_KEYS[normalizeFindingTitle(title)] ?? [];
}

export function getValidationMatchKeysForReviewReason(reason: string) {
  switch (reason.trim().toLowerCase()) {
    case "policy_behavior_conflict_candidate":
      return ["scan_report_review.policy_behavior_conflict_candidate"];
    case "session_replay_without_disclosure_detected":
      return [
        "scan_report_review.session_replay_without_disclosure_detected",
        "privacy.session_replay_without_disclosure_detected"
      ];
    case "missing_dsar_high_exposure":
      return ["scan_report_review.missing_dsar_high_exposure"];
    case "low_confidence_critical_fields":
      return [
        "policy_review.low_confidence_critical_fields.cookie_policy",
        "policy_review.low_confidence_critical_fields.privacy_policy",
        "policy_review.low_confidence_critical_fields.terms_of_service",
        "section_review.low_confidence_critical_fields",
        "scan_report_review.low_confidence_critical_fields"
      ];
    default:
      return [];
  }
}

export function buildValidationFindingLookup(findings: ScanValidationFinding[]) {
  const lookup = new Map<string, ScanValidationFinding>();

  for (const finding of findings) {
    const existing = lookup.get(finding.ruleKey);

    if (!existing) {
      lookup.set(finding.ruleKey, finding);
      continue;
    }

    const existingScore = existing.systemConfidenceScore ?? existing.modelConfidence ?? -1;
    const nextScore = finding.systemConfidenceScore ?? finding.modelConfidence ?? -1;

    if (nextScore > existingScore) {
      lookup.set(finding.ruleKey, finding);
    }
  }

  return lookup;
}

export function findValidationFindingForKeys(
  lookup: Map<string, ScanValidationFinding>,
  ruleKeys: string[]
) {
  for (const ruleKey of ruleKeys) {
    const finding = lookup.get(ruleKey);
    if (finding) {
      return finding;
    }
  }

  return null;
}
