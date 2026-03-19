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
  "context.session_replay_without_disclosure_detected": ["privacy.session_replay_without_disclosure_detected"],
  "disclosure.disclosure_language_missing_detected": ["disclosure.disclosure_language_missing_detected"],
  "disclosure.privacy_policy_limited": ["disclosure.privacy_policy_limited"],
  "privacy.consent_reject_persisted_tracker_vendors": ["privacy.trackers_persist_after_reject_detected"],
  "privacy.preconsent_tracking_detected": ["privacy.trackers_before_consent_detected"],
  "privacy.preconsent_violation_count": ["privacy.trackers_before_consent_detected"],
  "privacy.reject_control_missing_detected": ["privacy.reject_control_missing_detected"],
  "privacy.trackers_before_consent_detected": ["privacy.trackers_before_consent_detected"]
};

const TITLE_TO_VALIDATION_RULE_KEYS: Record<string, string[]> = {
  "automated accessibility issues detected": ["accessibility.wcag_errors_detected"],
  "disclosure language missing": ["disclosure.disclosure_language_missing_detected"],
  "low-confidence extraction": ["scan_report_review.low_confidence_critical_fields"],
  "low-confidence extraction privacy policy": ["scan_report_review.low_confidence_critical_fields"],
  "low-confidence extraction terms of service": ["scan_report_review.low_confidence_critical_fields"],
  "low-confidence policy extraction": ["scan_report_review.low_confidence_critical_fields"],
  "possible undisclosed session replay": ["privacy.session_replay_without_disclosure_detected"],
  "pre-consent tracking incidents detected": ["privacy.trackers_before_consent_detected"],
  "privacy policy coverage limited": ["disclosure.privacy_policy_limited"],
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
