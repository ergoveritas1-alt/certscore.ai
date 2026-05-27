import type {
  CertScoreFinding,
  CertScoreFindingConfidence,
  CertScoreFindingDirectness,
  CertScoreFindingSeverity
} from "./finding-registry";

const SEVERITY_WEIGHT: Record<CertScoreFindingSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

const CONFIDENCE_WEIGHT: Record<CertScoreFindingConfidence, number> = {
  strong: 3,
  good: 2,
  moderate: 1
};

const DIRECTNESS_WEIGHT: Record<CertScoreFindingDirectness, number> = {
  direct: 3,
  mixed: 2,
  inferred: 1
};

export const EXECUTIVE_SUMMARY_TOP_FINDING_IDS = [
  "pre_consent_tracking_detected",
  "keyboard_navigation_accessibility_issue",
  "semantic_labeling_accessibility_issue",
  "text_alternative_accessibility_issue",
  "visual_contrast_accessibility_issue",
  "focus_management_issue",
  "cross_domain_identifier_sharing_observed",
  "cpra_cba_opt_out_missing",
  "reject_tracking_persists_after_reject",
  "session_recording_services_detected",
  "third_party_cookie_pre_consent",
  "long_lived_cookie_retention_review",
  "cookie_disclosure_gap",
  "sensitive_data_collection_with_third_party_tracking_present",
  "session_replay_present_with_sensitive_surfaces_observed",
  "possible_session_replay_on_sensitive_input_surface",
  "rtb_cookie_sync_observed",
  "policy_behavior_contradiction_detected",
  "consent_preference_reopen_control_not_observed",
  "consent_dark_patterns_detected",
  "reject_option_missing_or_hidden",
  "asymmetric_consent_ui",
  "forced_consent_interaction",
  "probable_fingerprinting"
] as const;

const EXECUTIVE_SUMMARY_TOP_FINDING_ID_SET = new Set<string>([
  ...EXECUTIVE_SUMMARY_TOP_FINDING_IDS
]);

const COOKIE_RETENTION_STRONGER_FINDING_IDS = new Set([
  "pre_consent_tracking_detected",
  "third_party_cookie_pre_consent",
  "tracking_cookies_set_before_consent",
  "reject_tracking_persists_after_reject"
]);

const VENDOR_DISCLOSURE_STRONGER_FINDING_IDS = new Set([
  "pre_consent_tracking_detected",
  "third_party_tracking_before_consent",
  "third_party_cookie_pre_consent",
  "tracking_cookies_set_before_consent",
  "analytics_cookies_before_consent",
  "non_essential_tracking_continued_after_reject",
  "reject_tracking_persists_after_reject",
  "rtb_cookie_sync_observed",
  "cross_domain_identifier_sharing_observed",
  "session_replay_undisclosed"
]);

export function isExecutiveSummaryTopFindingId(findingId: string) {
  return EXECUTIVE_SUMMARY_TOP_FINDING_ID_SET.has(findingId);
}

export function getFindingSurfaceScore(finding: CertScoreFinding) {
  return (
    SEVERITY_WEIGHT[finding.severity] * 100 +
    CONFIDENCE_WEIGHT[finding.confidence] * 20 +
    DIRECTNESS_WEIGHT[finding.directVsInferred] * 8 +
    finding.defaultSurfacePriority
  );
}

export function rankFindings(findings: CertScoreFinding[]) {
  return [...findings].sort((left, right) => getFindingSurfaceScore(right) - getFindingSurfaceScore(left));
}

function collectCookieEvidenceKeys(value: unknown): Set<string> {
  const keys = new Set<string>();
  const visit = (entry: unknown) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    if (Array.isArray(entry)) {
      for (const item of entry) {
        visit(item);
      }
      return;
    }
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === "string"
      ? record.name
      : typeof record.cookieName === "string"
        ? record.cookieName
        : typeof record.cookie_name === "string"
          ? record.cookie_name
          : null;
    const domain = typeof record.domain === "string"
      ? record.domain
      : typeof record.cookieDomain === "string"
        ? record.cookieDomain
        : typeof record.cookie_domain === "string"
          ? record.cookie_domain
          : null;
    if (name) {
      keys.add(`${name.trim().toLowerCase()}|${String(domain ?? "").trim().toLowerCase()}`);
    }
    for (const nested of Object.values(record)) {
      if (nested && typeof nested === "object") {
        visit(nested);
      }
    }
  };
  visit(value);
  return keys;
}

function isCookieRetentionDuplicatedByStrongerFinding(finding: CertScoreFinding, selectedOrRanked: CertScoreFinding[]) {
  if (finding.id !== "long_lived_cookie_retention_review") {
    return false;
  }
  const retentionKeys = collectCookieEvidenceKeys(finding.evidenceDetails?.cookieEvidence);
  if (retentionKeys.size === 0) {
    return false;
  }
  const strongerKeys = new Set<string>();
  for (const candidate of selectedOrRanked) {
    if (!COOKIE_RETENTION_STRONGER_FINDING_IDS.has(candidate.id)) {
      continue;
    }
    for (const key of collectCookieEvidenceKeys(candidate.evidenceDetails)) {
      strongerKeys.add(key);
    }
  }
  return strongerKeys.size > 0 && [...retentionKeys].every((key) => strongerKeys.has(key));
}

function collectVendorDisclosureKeys(value: unknown): Set<string> {
  const keys = new Set<string>();
  const add = (entry: unknown) => {
    if (typeof entry === "string" && entry.trim()) {
      const normalized = entry.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
      keys.add(normalized);
      try {
        keys.add(new URL(entry).hostname.toLowerCase().replace(/^www\./, ""));
      } catch {
        // Plain vendor names and domains are expected here.
      }
    }
  };
  const visit = (entry: unknown) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    if (Array.isArray(entry)) {
      for (const item of entry) {
        visit(item);
      }
      return;
    }
    const record = entry as Record<string, unknown>;
    for (const key of [
      "name",
      "vendor",
      "domain",
      "host",
      "hostname",
      "url",
      "requestUrl",
      "request_url",
      "destinationDomain",
      "destination_domain"
    ]) {
      add(record[key]);
    }
    for (const key of [
      "unmatchedVendors",
      "unmatchedDomains",
      "unmatchedRuntimeVendors",
      "unmatchedRuntimeDomains",
      "observedRuntimeDomains",
      "runtimeVendors",
      "runtimeRequestUrls"
    ]) {
      const values = record[key];
      if (Array.isArray(values)) {
        for (const value of values) {
          add(value);
        }
      }
    }
    for (const nested of Object.values(record)) {
      if (nested && typeof nested === "object") {
        visit(nested);
      }
    }
  };
  visit(value);
  return keys;
}

function isRuntimeVendorDisclosureDuplicatedByStrongerFinding(finding: CertScoreFinding, selectedOrRanked: CertScoreFinding[]) {
  if (finding.id !== "cookie_disclosure_gap" && finding.id !== "policy_behavior_contradiction_detected") {
    return false;
  }
  const subtype = (finding.evidenceDetails as Record<string, unknown> | undefined)?.runtimeVendorDisclosure;
  if (!subtype) {
    return false;
  }
  const disclosureKeys = collectVendorDisclosureKeys(subtype);
  if (disclosureKeys.size === 0) {
    return false;
  }
  for (const candidate of selectedOrRanked) {
    if (!VENDOR_DISCLOSURE_STRONGER_FINDING_IDS.has(candidate.id)) {
      continue;
    }
    const strongerKeys = collectVendorDisclosureKeys(candidate.evidenceDetails);
    if ([...disclosureKeys].some((key) => strongerKeys.has(key))) {
      return true;
    }
  }
  return false;
}

export function selectTopFindings(findings: CertScoreFinding[], limit = 5) {
  const ranked = rankFindings(findings).filter((finding) => EXECUTIVE_SUMMARY_TOP_FINDING_ID_SET.has(finding.id));
  const sectionCounts = new Map<string, number>();
  const selected: CertScoreFinding[] = [];
  const suppressedIds = new Set<string>();

  if (ranked.some((finding) => finding.id === "pre_consent_tracking_detected")) {
    suppressedIds.add("third_party_tracking_pre_consent");
    suppressedIds.add("third_party_cookie_pre_consent");
  }
  if (ranked.some((finding) => finding.id === "probable_fingerprinting")) {
    suppressedIds.add("fingerprinting_related_signals_observed");
  }

  const forcedIds = new Set<string>();
  if (ranked.some((finding) => finding.id === "pre_consent_tracking_detected")) {
    forcedIds.add("pre_consent_tracking_detected");
  }
  if (ranked.some((finding) => finding.id === "probable_fingerprinting")) {
    forcedIds.add("probable_fingerprinting");
  }
  if (ranked.some((finding) => finding.id === "session_recording_services_detected")) {
    forcedIds.add("session_recording_services_detected");
  }
  if (ranked.some((finding) => finding.id === "cross_domain_identifier_sharing_observed")) {
    forcedIds.add("cross_domain_identifier_sharing_observed");
  }
  if (ranked.some((finding) => finding.id === "cpra_cba_opt_out_missing")) {
    forcedIds.add("cpra_cba_opt_out_missing");
  }
  if (
    ranked.some(
      (finding) =>
        finding.id === "reject_tracking_persists_after_reject" &&
        (finding.severity === "critical" || finding.severity === "high")
    )
  ) {
    forcedIds.add("reject_tracking_persists_after_reject");
  }

  for (const finding of ranked) {
    if (suppressedIds.has(finding.id)) {
      continue;
    }
    if (isCookieRetentionDuplicatedByStrongerFinding(finding, ranked)) {
      continue;
    }
    if (isRuntimeVendorDisclosureDuplicatedByStrongerFinding(finding, ranked)) {
      continue;
    }
    if (!forcedIds.has(finding.id)) {
      continue;
    }
    const count = sectionCounts.get(finding.section) ?? 0;
    sectionCounts.set(finding.section, count + 1);
    selected.push(finding);
    if (selected.length >= limit) {
      return selected;
    }
  }

  for (const finding of ranked) {
    if (suppressedIds.has(finding.id)) {
      continue;
    }
    if (isCookieRetentionDuplicatedByStrongerFinding(finding, ranked)) {
      continue;
    }
    if (isRuntimeVendorDisclosureDuplicatedByStrongerFinding(finding, ranked)) {
      continue;
    }
    if (selected.some((entry) => entry.id === finding.id)) {
      continue;
    }
    const count = sectionCounts.get(finding.section) ?? 0;
    if (count >= 2) {
      continue;
    }
    sectionCounts.set(finding.section, count + 1);
    selected.push(finding);
    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}
