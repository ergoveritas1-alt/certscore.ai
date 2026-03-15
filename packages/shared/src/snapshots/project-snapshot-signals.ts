import { getPrimaryCategoryLabel, mapSignalKeyToTaxonomy } from "../taxonomy/signal-taxonomy";
import type { ScanSnapshot, ScanTrackerVendor, SnapshotSignalItem } from "../types/snapshots";

export function projectSnapshotSignals(snapshot: ScanSnapshot, trackerVendors: ScanTrackerVendor[]): SnapshotSignalItem[] {
  const vendors = [...new Set(trackerVendors.map((vendor) => vendor.vendorName))].sort();
  const activeSignals: SnapshotSignalItem[] = [];

  const toTaxonomySignal = (input: Omit<SnapshotSignalItem, "primaryCategory" | "primaryCategoryLabel" | "subcategory" | "regulatoryTags">) => {
    const taxonomy = mapSignalKeyToTaxonomy({
      category: input.category,
      key: input.key,
      label: input.label
    });

    return {
      ...input,
      primaryCategory: taxonomy.primaryCategory,
      primaryCategoryLabel: getPrimaryCategoryLabel(taxonomy.primaryCategory),
      subcategory: taxonomy.subcategory ?? null,
      regulatoryTags: taxonomy.regulatoryTags ?? []
    } satisfies SnapshotSignalItem;
  };

  const pushBoolean = (
    category: SnapshotSignalItem["category"],
    key: string,
    label: string,
    value: boolean
  ) => {
    if (value) {
      activeSignals.push(toTaxonomySignal({ category, key, label, value }));
    }
  };

  const pushNumber = (
    category: SnapshotSignalItem["category"],
    key: string,
    label: string,
    value: number
  ) => {
    if (value > 0) {
      activeSignals.push(toTaxonomySignal({ category, key, label, value }));
    }
  };

  pushBoolean("privacy", "privacy.privacy_policy_present", "Privacy policy detected", snapshot.privacyPolicyPresent);
  pushBoolean("privacy", "privacy.cookie_banner_present", "Cookie banner present", snapshot.cookieBannerPresent);
  if (snapshot.cmpVendorName) {
    activeSignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.cmp_vendor_detected",
        label: "CMP vendor detected",
        value: snapshot.cmpVendorName
      })
    );
  }
  if (snapshot.consentInteractionModel && snapshot.consentInteractionModel !== "none") {
    activeSignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.consent_interaction_model",
        label: "Consent interaction model",
        value: snapshot.consentInteractionModel
      })
    );
  }
  pushBoolean("privacy", "privacy.reject_all_present", "Reject-all control present", snapshot.rejectAllPresent);
  pushBoolean("privacy", "privacy.dsar_request_mechanism_present", "DSAR request mechanism present", snapshot.dsarRequestMechanismPresent);
  pushBoolean("privacy", "privacy.privacy_request_form_present", "Privacy request form present", snapshot.privacyRequestFormPresent === true);
  pushBoolean("privacy", "privacy.data_access_request_present", "Access request flow present", snapshot.dataAccessRequestPresent === true);
  pushBoolean("privacy", "privacy.data_deletion_request_present", "Deletion request flow present", snapshot.dataDeletionRequestPresent === true);
  pushBoolean("privacy", "privacy.do_not_sell_link_present", "Do-not-sell link present", snapshot.doNotSellLinkPresent);
  pushBoolean("privacy", "privacy.preconsent_tracking_detected", "Pre-consent tracking detected", snapshot.preconsentTrackingDetected);
  pushBoolean(
    "privacy",
    "privacy.dark_pattern_reject_button_missing",
    "Reject button missing on consent surface",
    snapshot.darkPatternRejectButtonMissing
  );
  pushBoolean(
    "privacy",
    "privacy.dark_pattern_accept_button_prominence",
    "Accept button more prominent than reject",
    snapshot.darkPatternAcceptButtonProminence
  );
  pushBoolean("privacy", "privacy.dark_pattern_forced_consent_wall", "Forced consent wall detected", snapshot.darkPatternForcedConsentWall);
  pushBoolean("privacy", "privacy.dark_pattern_accept_only_banner", "Accept-only banner detected", snapshot.darkPatternAcceptOnlyBanner);
  pushBoolean(
    "privacy",
    "privacy.dark_pattern_dismiss_without_reject",
    "Dismiss-without-reject pattern detected",
    snapshot.darkPatternDismissWithoutReject
  );
  pushBoolean("privacy", "privacy.dark_pattern_countdown_timer_present", "Countdown timer language detected", snapshot.darkPatternCountdownTimerPresent);
  pushBoolean("privacy", "privacy.dark_pattern_fake_scarcity_language", "Scarcity language detected", snapshot.darkPatternFakeScarcityLanguage);
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
    activeSignals.push(toTaxonomySignal({
      category: "privacy",
      key: "privacy.tracker_vendors",
      label: "Tracker vendors",
      value: vendors
    }));
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
    "Accessibility risk score",
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
  pushBoolean("commerce", "commerce.form_collects_ssn", "SSN collection detected", snapshot.formCollectsSsn);
  pushBoolean(
    "commerce",
    "commerce.form_collects_government_id",
    "Government ID collection detected",
    snapshot.formCollectsGovernmentId
  );
  pushBoolean(
    "commerce",
    "commerce.form_collects_health_information",
    "Health information collection detected",
    snapshot.formCollectsHealthInformation
  );
  pushBoolean(
    "commerce",
    "commerce.form_collects_financial_information",
    "Financial information collection detected",
    snapshot.formCollectsFinancialInformation
  );
  pushBoolean("commerce", "commerce.form_collects_birthdate", "Birthdate collection detected", snapshot.formCollectsBirthdate);
  pushBoolean("commerce", "commerce.form_collects_geolocation", "Geolocation collection detected", snapshot.formCollectsGeolocation);
  pushBoolean("commerce", "commerce.auto_renew_disclosure_present", "Auto-renew disclosure detected", snapshot.autoRenewDisclosurePresent);
  pushBoolean(
    "commerce",
    "commerce.subscription_cancellation_policy_present",
    "Subscription cancellation policy detected",
    snapshot.subscriptionCancellationPolicyPresent
  );
  pushBoolean("commerce", "commerce.ad_network_google_ads", "Google Ads detected", snapshot.adNetworkGoogleAds);
  pushBoolean("commerce", "commerce.ad_network_meta_ads", "Meta Ads detected", snapshot.adNetworkMetaAds);
  pushBoolean("commerce", "commerce.retargeting_pixel_detected", "Retargeting pixel detected", snapshot.retargetingPixelDetected);
  pushBoolean("commerce", "commerce.session_replay_tool_detected", "Session replay tool detected", snapshot.sessionReplayToolDetected);
  pushBoolean("commerce", "commerce.ai_chatbot_present", "AI chatbot detected", snapshot.aiChatbotPresent === true);
  pushBoolean(
    "commerce",
    "commerce.ai_assistant_widget_detected",
    "AI assistant widget detected",
    snapshot.aiAssistantWidgetDetected === true
  );
  pushBoolean(
    "commerce",
    "commerce.ai_disclosure_text_present",
    "AI disclosure text detected",
    snapshot.aiDisclosureTextPresent === true
  );
  pushBoolean(
    "commerce",
    "commerce.ai_terms_or_policy_ai_reference",
    "AI policy or terms reference detected",
    snapshot.aiTermsOrPolicyAiReference === true
  );
  pushBoolean(
    "commerce",
    "commerce.ai_help_center_ai_reference",
    "AI help-center reference detected",
    snapshot.aiHelpCenterAiReference === true
  );
  pushBoolean(
    "commerce",
    "commerce.ai_search_or_answer_experience_detected",
    "AI search or answer experience detected",
    snapshot.aiSearchOrAnswerExperienceDetected === true
  );
  pushBoolean(
    "commerce",
    "commerce.ai_hiring_automation_signal_detected",
    "AI hiring automation disclosure detected",
    snapshot.aiHiringAutomationSignalDetected === true
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
  pushBoolean(
    "security",
    "security.vulnerability_disclosure_page_present",
    "Vulnerability disclosure page detected",
    snapshot.vulnerabilityDisclosurePagePresent
  );
  pushBoolean("security", "security.trust_center_present", "Trust center detected", snapshot.trustCenterPresent);
  pushBoolean("security", "security.incident_status_page_present", "Incident status page detected", snapshot.incidentStatusPagePresent);
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
  pushBoolean("context", "context.access_blocked_by_robots", "Robots policy blocked homepage crawl", !snapshot.robotsAllowed);
  pushBoolean(
    "context",
    "context.access_http_forbidden",
    "Homepage returned forbidden",
    snapshot.homepageFetchStatus === "forbidden" || snapshot.homepageFetchHttpStatus === 403
  );
  pushBoolean("context", "context.access_bot_challenge_detected", "Bot challenge detected", snapshot.captchaFlag === true);
  pushBoolean("context", "context.access_auth_wall_detected", "Authentication wall detected", snapshot.authWallDetected === true);
  pushBoolean("context", "context.access_partial_scan", "Scan coverage limited", snapshot.partialScan === true);
  pushNumber(
    "context",
    "context.digital_maturity_score",
    "Digital maturity score",
    snapshot.digitalMaturityScore ?? 0
  );
  pushNumber("context", "context.legal_coverage_score", "Legal coverage score", snapshot.legalCoverageScore ?? 0);

  return activeSignals;
}
