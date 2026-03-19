export type ScanValidationFindingSummary = {
  agreementScore: number | null;
  modelConfidence: number | null;
  rationale: string | null;
  ruleKey: string;
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

export function buildValidationFindingLookup(findings: ScanValidationFindingSummary[]) {
  const lookup = new Map<string, ScanValidationFindingSummary>();

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
  lookup: Map<string, ScanValidationFindingSummary>,
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
