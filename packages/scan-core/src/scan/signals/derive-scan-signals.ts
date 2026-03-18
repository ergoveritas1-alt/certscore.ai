import type { DerivedFindingRecord } from "../types/finding";
import type { PolicyContentCheckResult } from "../page-audit/check-policy-content";
import type { PolicyType } from "../page-audit/policy-keywords";

type PolicyDetectionState = {
  policies: Record<
    PolicyType,
    {
      found: boolean;
    }
  >;
};

export type DerivedSignalInsert = {
  category: "accessibility" | "privacy" | "disclosure";
  domain_id: string;
  organization_id: string;
  scan_id: string;
  signal_key: string;
  signal_label: string;
  signal_value_json: boolean | number | string | string[];
  value_type: "boolean" | "number" | "text" | "string_array";
};

export type DerivedSnapshotInsert = {
  accessibility_signal_count: number;
  cookie_banner_present: boolean;
  cookie_policy_present: boolean;
  disclosure_signal_count: number;
  domain_id: string;
  high_severity_count: number;
  low_severity_count: number;
  medium_severity_count: number;
  organization_id: string;
  pages_requested: number;
  pages_scanned: number;
  privacy_policy_present: boolean;
  privacy_signal_count: number;
  refund_policy_present: boolean;
  scan_id: string;
  terms_present: boolean;
  total_signals: number;
  tracker_vendor_count: number;
};

type Input = {
  accessibilityFindings: DerivedFindingRecord[];
  disclosureFindings: DerivedFindingRecord[];
  domainId: string;
  organizationId: string;
  pagesRequested: number;
  pagesScanned: number;
  policyChecks: Map<PolicyType, { result: PolicyContentCheckResult; scanPageId: string | null }>;
  policyDetection: PolicyDetectionState;
  privacyFindings: DerivedFindingRecord[];
  scanId: string;
  trackerVendorNames: string[];
  cookieBannerPresent: boolean;
};

function countMatching(findings: DerivedFindingRecord[], predicate: (finding: DerivedFindingRecord) => boolean) {
  return findings.filter(predicate).length;
}

function vendorSignalKey(name: string) {
  return `privacy.tracker_vendor_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

function isLimitedPolicyContent(result: PolicyContentCheckResult) {
  return result.matchedConcepts.length < 2;
}

export function deriveScanSignals(input: Input) {
  const signals: DerivedSignalInsert[] = [];
  const pushSignal = (signal: Omit<DerivedSignalInsert, "domain_id" | "organization_id" | "scan_id">) => {
    signals.push({
      ...signal,
      scan_id: input.scanId,
      organization_id: input.organizationId,
      domain_id: input.domainId
    });
  };

  const altTextMissingCount = countMatching(
    input.accessibilityFindings,
    (finding) => finding.rule_key === "accessibility.axe.image-alt"
  );
  const contrastFailureCount = countMatching(
    input.accessibilityFindings,
    (finding) => finding.rule_key === "accessibility.axe.color-contrast"
  );
  const ariaMissingCount = countMatching(
    input.accessibilityFindings,
    (finding) => finding.rule_key.startsWith("accessibility.axe.aria")
  );
  const trackerBeforeConsentDetected = input.privacyFindings.some(
    (finding) => finding.rule_key === "privacy.cookie.trackers_observed_before_consent"
  );
  const rejectControlMissingDetected = input.privacyFindings.some(
    (finding) => finding.rule_key === "privacy.cookie.reject_control_missing"
  );
  const privacyPolicyPresent = input.policyDetection.policies.privacy.found;
  const termsPresent = input.policyDetection.policies.terms.found;
  const cookiePolicyPresent = input.policyDetection.policies.cookie.found;
  const refundPolicyPresent = input.policyDetection.policies.refund.found;
  const privacyPolicyLimited = (() => {
    const policy = input.policyChecks.get("privacy");
    return policy ? isLimitedPolicyContent(policy.result) : false;
  })();
  const affiliateLanguagePresent = input.disclosureFindings.some(
    (finding) => finding.rule_key === "legal.ftc.affiliate_signal_detected"
  );
  const disclosureLanguageMissingDetected = input.disclosureFindings.some(
    (finding) => finding.rule_key === "legal.ftc.disclosure_not_observed_on_promotional_content"
  );

  pushSignal({
    category: "accessibility",
    signal_key: "accessibility.total_issues_count",
    signal_label: "Accessibility issues",
    signal_value_json: input.accessibilityFindings.length,
    value_type: "number"
  });
  pushSignal({
    category: "accessibility",
    signal_key: "accessibility.alt_text_missing_count",
    signal_label: "Missing alt text",
    signal_value_json: altTextMissingCount,
    value_type: "number"
  });
  pushSignal({
    category: "accessibility",
    signal_key: "accessibility.contrast_failures_count",
    signal_label: "Contrast failures",
    signal_value_json: contrastFailureCount,
    value_type: "number"
  });
  pushSignal({
    category: "accessibility",
    signal_key: "accessibility.aria_missing_count",
    signal_label: "ARIA issues",
    signal_value_json: ariaMissingCount,
    value_type: "number"
  });

  pushSignal({
    category: "privacy",
    signal_key: "privacy.total_issues_count",
    signal_label: "Privacy issues",
    signal_value_json: input.privacyFindings.length,
    value_type: "number"
  });
  pushSignal({
    category: "privacy",
    signal_key: "privacy.cookie_banner_present",
    signal_label: "Cookie banner present",
    signal_value_json: input.cookieBannerPresent,
    value_type: "boolean"
  });
  pushSignal({
    category: "privacy",
    signal_key: "privacy.reject_control_missing_detected",
    signal_label: "Reject control missing",
    signal_value_json: rejectControlMissingDetected,
    value_type: "boolean"
  });
  pushSignal({
    category: "privacy",
    signal_key: "privacy.trackers_before_consent_detected",
    signal_label: "Trackers before consent",
    signal_value_json: trackerBeforeConsentDetected,
    value_type: "boolean"
  });
  pushSignal({
    category: "privacy",
    signal_key: "privacy.tracker_vendor_count",
    signal_label: "Tracker vendors",
    signal_value_json: input.trackerVendorNames.length,
    value_type: "number"
  });

  for (const vendorName of input.trackerVendorNames) {
    pushSignal({
      category: "privacy",
      signal_key: vendorSignalKey(vendorName),
      signal_label: vendorName,
      signal_value_json: true,
      value_type: "boolean"
    });
  }

  pushSignal({
    category: "disclosure",
    signal_key: "disclosure.total_issues_count",
    signal_label: "Disclosure issues",
    signal_value_json: input.disclosureFindings.length,
    value_type: "number"
  });
  pushSignal({
    category: "disclosure",
    signal_key: "disclosure.privacy_policy_present",
    signal_label: "Privacy policy detected",
    signal_value_json: privacyPolicyPresent,
    value_type: "boolean"
  });
  pushSignal({
    category: "disclosure",
    signal_key: "disclosure.privacy_policy_limited",
    signal_label: "Privacy policy coverage limited",
    signal_value_json: privacyPolicyLimited,
    value_type: "boolean"
  });
  pushSignal({
    category: "disclosure",
    signal_key: "disclosure.terms_of_service_present",
    signal_label: "Terms detected",
    signal_value_json: termsPresent,
    value_type: "boolean"
  });
  pushSignal({
    category: "disclosure",
    signal_key: "disclosure.cookie_policy_present",
    signal_label: "Cookie policy detected",
    signal_value_json: cookiePolicyPresent,
    value_type: "boolean"
  });
  pushSignal({
    category: "disclosure",
    signal_key: "disclosure.refund_policy_present",
    signal_label: "Refund policy detected",
    signal_value_json: refundPolicyPresent,
    value_type: "boolean"
  });
  pushSignal({
    category: "disclosure",
    signal_key: "disclosure.affiliate_language_present",
    signal_label: "Affiliate language observed",
    signal_value_json: affiliateLanguagePresent,
    value_type: "boolean"
  });
  pushSignal({
    category: "disclosure",
    signal_key: "disclosure.disclosure_language_missing_detected",
    signal_label: "Disclosure language missing",
    signal_value_json: disclosureLanguageMissingDetected,
    value_type: "boolean"
  });

  const highSeverityCount = [
    ...input.accessibilityFindings,
    ...input.privacyFindings,
    ...input.disclosureFindings
  ].filter((finding) => finding.severity === "high").length;
  const mediumSeverityCount = [
    ...input.accessibilityFindings,
    ...input.privacyFindings,
    ...input.disclosureFindings
  ].filter((finding) => finding.severity === "medium").length;
  const lowSeverityCount = [
    ...input.accessibilityFindings,
    ...input.privacyFindings,
    ...input.disclosureFindings
  ].filter((finding) => finding.severity === "low").length;
  const totalSignals = signals.filter((signal) => {
    if (typeof signal.signal_value_json === "boolean") {
      return signal.signal_value_json;
    }

    if (typeof signal.signal_value_json === "number") {
      return signal.signal_value_json > 0;
    }

    if (typeof signal.signal_value_json === "string") {
      return signal.signal_value_json.length > 0;
    }

    return signal.signal_value_json.length > 0;
  }).length;

  return {
    signals,
    snapshot: {
      scan_id: input.scanId,
      organization_id: input.organizationId,
      domain_id: input.domainId,
      pages_requested: input.pagesRequested,
      pages_scanned: input.pagesScanned,
      total_signals: totalSignals,
      accessibility_signal_count: signals.filter((signal) => signal.category === "accessibility").length,
      privacy_signal_count: signals.filter((signal) => signal.category === "privacy").length,
      disclosure_signal_count: signals.filter((signal) => signal.category === "disclosure").length,
      high_severity_count: highSeverityCount,
      medium_severity_count: mediumSeverityCount,
      low_severity_count: lowSeverityCount,
      tracker_vendor_count: input.trackerVendorNames.length,
      cookie_banner_present: input.cookieBannerPresent,
      privacy_policy_present: privacyPolicyPresent,
      terms_present: termsPresent,
      cookie_policy_present: cookiePolicyPresent,
      refund_policy_present: refundPolicyPresent
    } satisfies DerivedSnapshotInsert
  };
}
