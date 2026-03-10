import type { ScanSnapshot, ScanTrackerVendor, SnapshotSignalItem } from "../types/snapshots";

export function projectSnapshotSignals(snapshot: ScanSnapshot, trackerVendors: ScanTrackerVendor[]): SnapshotSignalItem[] {
  const vendors = [...new Set(trackerVendors.map((vendor) => vendor.vendorName))].sort();
  const activeSignals: SnapshotSignalItem[] = [];

  const pushBoolean = (
    category: SnapshotSignalItem["category"],
    key: string,
    label: string,
    value: boolean
  ) => {
    if (value) {
      activeSignals.push({ category, key, label, value });
    }
  };

  const pushNumber = (
    category: SnapshotSignalItem["category"],
    key: string,
    label: string,
    value: number
  ) => {
    if (value > 0) {
      activeSignals.push({ category, key, label, value });
    }
  };

  pushBoolean("privacy", "privacy.privacy_policy_present", "Privacy policy detected", snapshot.privacyPolicyPresent);
  pushBoolean("privacy", "privacy.cookie_banner_present", "Cookie banner present", snapshot.cookieBannerPresent);
  pushBoolean("privacy", "privacy.reject_all_present", "Reject-all control present", snapshot.rejectAllPresent);
  pushBoolean("privacy", "privacy.dsar_request_mechanism_present", "DSAR request mechanism present", snapshot.dsarRequestMechanismPresent);
  pushBoolean("privacy", "privacy.privacy_request_form_present", "Privacy request form present", snapshot.privacyRequestFormPresent === true);
  pushBoolean("privacy", "privacy.data_access_request_present", "Access request flow present", snapshot.dataAccessRequestPresent === true);
  pushBoolean("privacy", "privacy.data_deletion_request_present", "Deletion request flow present", snapshot.dataDeletionRequestPresent === true);
  pushBoolean("privacy", "privacy.do_not_sell_link_present", "Do-not-sell link present", snapshot.doNotSellLinkPresent);
  pushBoolean("privacy", "privacy.preconsent_tracking_detected", "Pre-consent tracking detected", snapshot.preconsentTrackingDetected);
  pushBoolean(
    "privacy",
    "privacy.consent_withdrawal_mechanism_present",
    "Consent withdrawal mechanism present",
    snapshot.consentWithdrawalMechanismPresent === true
  );
  pushBoolean("privacy", "privacy.subprocessor_list_present", "Subprocessor list present", snapshot.subprocessorListPresent);
  pushNumber("privacy", "privacy.tracker_count_total", "Tracker vendors detected", snapshot.trackerCountTotal);
  pushNumber(
    "privacy",
    "privacy.user_rights_friction_score",
    "User-rights friction score",
    snapshot.userRightsFrictionScore ?? 0
  );
  pushNumber("privacy", "privacy.cookie_count_total", "Cookies observed", snapshot.cookieCountTotal ?? 0);
  pushNumber("privacy", "privacy.third_party_cookie_count", "Third-party cookies", snapshot.thirdPartyCookieCount ?? 0);

  if (vendors.length > 0) {
    activeSignals.push({
      category: "privacy",
      key: "privacy.tracker_vendors",
      label: "Tracker vendors",
      value: vendors
    });
  }

  pushBoolean(
    "disclosure",
    "disclosure.terms_of_service_present",
    "Terms of service detected",
    snapshot.termsOfServicePresent
  );
  pushBoolean("disclosure", "disclosure.cookie_policy_present", "Cookie policy detected", snapshot.cookiePolicyPresent);
  pushBoolean(
    "disclosure",
    "disclosure.accessibility_statement_present",
    "Accessibility statement detected",
    snapshot.accessibilityStatementPresent
  );
  pushBoolean("disclosure", "disclosure.contact_page_present", "Contact page detected", snapshot.contactPagePresent);
  pushBoolean("disclosure", "disclosure.refund_policy_present", "Refund policy detected", snapshot.refundPolicyPresent);
  pushBoolean(
    "disclosure",
    "disclosure.supervisory_authority_reference_present",
    "Supervisory authority reference present",
    snapshot.supervisoryAuthorityReferencePresent === true
  );
  pushBoolean(
    "disclosure",
    "disclosure.mobile_app_links_detected",
    "Mobile app links detected",
    snapshot.mobileAppLinksDetected === true
  );
  pushNumber(
    "disclosure",
    "disclosure.privacy_policy_word_count",
    "Privacy policy word count",
    snapshot.privacyPolicyWordCount ?? 0
  );

  pushNumber("accessibility", "accessibility.wcag_error_count_total", "WCAG errors", snapshot.wcagErrorCountTotal);
  pushNumber(
    "accessibility",
    "accessibility.wcag_contrast_failures_count",
    "Contrast failures",
    snapshot.wcagContrastFailuresCount
  );
  pushNumber("accessibility", "accessibility.wcag_missing_alt_count", "Missing alt text", snapshot.wcagMissingAltCount);
  pushBoolean(
    "accessibility",
    "accessibility.accessibility_widget_present",
    "Accessibility widget detected",
    snapshot.accessibilityWidgetPresent
  );
  pushBoolean(
    "accessibility",
    "accessibility.accessibility_claim_mismatch_detected",
    "Accessibility claim mismatch detected",
    snapshot.accessibilityClaimMismatchDetected === true
  );
  pushNumber(
    "accessibility",
    "accessibility.accessibility_litigation_risk_score",
    "Accessibility litigation risk score",
    snapshot.accessibilityLitigationRiskScore ?? 0
  );

  pushNumber("commerce", "commerce.form_count_total", "Forms detected", snapshot.formCountTotal);
  pushBoolean("commerce", "commerce.checkout_or_payment_form_present", "Checkout flow detected", snapshot.checkoutOrPaymentFormPresent);
  pushBoolean("commerce", "commerce.free_trial_detected", "Free trial detected", snapshot.freeTrialDetected);
  pushBoolean(
    "commerce",
    "commerce.high_sensitivity_data_collection_detected",
    "High-sensitivity data collection detected",
    snapshot.highSensitivityDataCollectionDetected === true
  );
  pushNumber(
    "commerce",
    "commerce.form_data_sensitivity_score",
    "Form data sensitivity score",
    snapshot.formDataSensitivityScore ?? 0
  );
  pushBoolean(
    "security",
    "security.security_txt_present",
    "security.txt detected",
    snapshot.securityTxtPresent
  );
  pushBoolean("security", "security.hsts_enabled", "HSTS enabled", snapshot.hstsEnabled);
  pushBoolean("security", "security.https_enforced", "HTTPS enforced", snapshot.httpsEnforced);
  pushBoolean("security", "security.mixed_content_detected", "Mixed content detected", snapshot.mixedContentDetected);
  pushBoolean("security", "security.csp_header_present", "CSP header present", snapshot.cspHeaderPresent === true);
  pushBoolean(
    "security",
    "security.permissions_policy_present",
    "Permissions-Policy present",
    snapshot.permissionsPolicyPresent === true
  );
  pushBoolean("security", "security.dnssec_enabled", "DNSSEC enabled", snapshot.dnssecEnabled === true);
  pushBoolean("security", "security.dmarc_record_present", "DMARC record present", snapshot.dmarcRecordPresent === true);
  pushNumber(
    "security",
    "security.security_headers_score",
    "Security headers score",
    snapshot.securityHeadersScore ?? 0
  );

  pushBoolean("context", "context.ecommerce_site_likely", "Ecommerce site likely", snapshot.ecommerceSiteLikely);
  pushBoolean("context", "context.saas_site_likely", "SaaS site likely", snapshot.saasSiteLikely);
  pushBoolean("context", "context.children_audience_likely", "Children audience likely", snapshot.childrenAudienceLikely);
  pushBoolean(
    "context",
    "context.kid_directed_content_detected",
    "Kid-directed content detected",
    snapshot.kidDirectedContentDetected === true
  );
  pushBoolean(
    "context",
    "context.policy_behavior_conflict_detected",
    "Policy/behavior conflict detected",
    snapshot.policyBehaviorConflictDetected === true
  );
  pushBoolean(
    "context",
    "context.session_replay_without_disclosure_detected",
    "Session replay without disclosure detected",
    snapshot.sessionReplayWithoutDisclosureDetected === true
  );
  pushNumber(
    "context",
    "context.digital_maturity_score",
    "Digital maturity score",
    snapshot.digitalMaturityScore ?? 0
  );
  pushNumber("context", "context.legal_coverage_score", "Legal coverage score", snapshot.legalCoverageScore ?? 0);

  return activeSignals;
}
