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

  pushBoolean("disclosure", "disclosure.privacy_policy_present", "Privacy policy fetched", snapshot.privacyPolicyPresent);
  pushBoolean(
    "privacy",
    "privacy.children_privacy_context_without_supporting_disclosure",
    "Child-directed context without supporting privacy disclosure",
    (snapshot.childrenAudienceLikely === true ||
      snapshot.kidDirectedContentDetected === true) &&
      snapshot.privacyPolicyPresent === false &&
      snapshot.privacyContactChannelType === "none"
  );
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
  pushBoolean(
    "privacy",
    "privacy.consent_mechanism_absent",
    "Consent mechanism absent",
    snapshot.consentMechanismType === "none"
  );
  pushBoolean(
    "privacy",
    "privacy.consent_surface_missing",
    "Consent surface missing",
    snapshot.consentMechanismType === "none" &&
      snapshot.cookieBannerPresent !== true &&
      !snapshot.cmpVendorName &&
      (!snapshot.consentInteractionModel || snapshot.consentInteractionModel === "none")
  );
  pushBoolean("privacy", "privacy.reject_all_present", "Reject-all control present", snapshot.rejectAllPresent);
  pushBoolean("privacy", "privacy.dsar_request_mechanism_present", "DSAR request mechanism present", snapshot.dsarRequestMechanismPresent);
  pushBoolean("privacy", "privacy.privacy_request_form_present", "Privacy request form present", snapshot.privacyRequestFormPresent === true);
  pushBoolean("privacy", "privacy.data_access_request_present", "Access request flow present", snapshot.dataAccessRequestPresent === true);
  pushBoolean("privacy", "privacy.data_deletion_request_present", "Deletion request flow present", snapshot.dataDeletionRequestPresent === true);
  pushBoolean("privacy", "privacy.do_not_sell_link_present", "Do-not-sell link present", snapshot.doNotSellLinkPresent);
  pushBoolean(
    "commerce",
    "commerce.affiliate_disclosure_present",
    "Affiliate disclosure present",
    snapshot.affiliateDisclosurePresent === true
  );
  pushBoolean(
    "privacy",
    "privacy.sale_sharing_controls_missing",
    "Sale/sharing controls missing",
    snapshot.doNotSellLinkPresent === false && snapshot.retargetingPixelDetected === true
  );
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
  pushBoolean(
    "privacy",
    "privacy.privacy_contact_channel_missing",
    "Privacy contact path missing",
    snapshot.privacyContactChannelType === "none"
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
    "Terms page fetched",
    snapshot.termsOfServicePresent
  );
  pushBoolean("disclosure", "disclosure.cookie_policy_present", "Cookie policy fetched", snapshot.cookiePolicyPresent);
  pushBoolean(
    "disclosure",
    "disclosure.accessibility_statement_present",
    "Accessibility statement fetched",
    snapshot.accessibilityStatementPresent
  );
  pushBoolean("disclosure", "disclosure.contact_page_present", "Contact page fetched", snapshot.contactPagePresent);
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

  pushBoolean(
    "disclosure",
    "financial.performance_claim_text_present",
    "Financial performance claim text present",
    snapshot.performanceClaimPresent
  );
  pushNumber(
    "disclosure",
    "financial.performance_claim_count",
    "Financial performance claim count",
    snapshot.performanceClaimCount ?? 0
  );
  pushBoolean(
    "disclosure",
    "financial.return_or_yield_percentage_present",
    "Return or yield percentage present",
    snapshot.returnOrYieldPercentagePresent
  );
  pushBoolean(
    "disclosure",
    "financial.investment_outperformance_language_present",
    "Investment outperformance language present",
    snapshot.investmentOutperformanceLanguagePresent
  );
  pushBoolean(
    "disclosure",
    "financial.guaranteed_return_language_present",
    "Guaranteed return language present",
    snapshot.guaranteedReturnLanguagePresent
  );
  pushBoolean(
    "disclosure",
    "financial.low_risk_high_return_language_present",
    "Low-risk high-return language present",
    snapshot.lowRiskHighReturnLanguagePresent
  );
  pushBoolean(
    "disclosure",
    "financial.hypothetical_or_backtest_language_present",
    "Hypothetical or backtest language present",
    snapshot.hypotheticalOrBacktestLanguagePresent
  );
  pushBoolean(
    "disclosure",
    "financial.testimonial_or_review_block_near_financial_claim_present",
    "Testimonial or review block near financial claim present",
    snapshot.testimonialOrReviewBlockNearFinancialClaimPresent
  );
  pushBoolean(
    "disclosure",
    "financial.risk_disclosure_text_present",
    "Financial risk disclosure text present",
    snapshot.riskDisclosureTextPresent
  );
  pushBoolean(
    "disclosure",
    "financial.claim_cta_block_present",
    "Financial claim CTA block present",
    snapshot.claimCtaBlockPresent
  );
  pushNumber(
    "disclosure",
    "financial.financial_claim_with_cta_count",
    "Financial claim CTA count",
    snapshot.financialClaimWithCtaCount ?? 0
  );
  pushBoolean(
    "disclosure",
    "entity.about_page_present",
    "About page present",
    snapshot.aboutPagePresent
  );
  pushBoolean(
    "disclosure",
    "entity.team_or_leadership_page_present",
    "Team or leadership page present",
    snapshot.teamOrLeadershipPagePresent
  );
  pushBoolean(
    "disclosure",
    "entity.jurisdiction_or_operating_entity_text_present",
    "Jurisdiction or operating entity text present",
    snapshot.jurisdictionOrOperatingEntityTextPresent
  );
  pushBoolean(
    "disclosure",
    "entity.regulatory_or_license_claim_text_present",
    "Regulatory or license claim text present",
    snapshot.registrationClaimPresent
  );
  pushBoolean(
    "disclosure",
    "entity.registration_identifier_text_present",
    "Registration identifier text present",
    snapshot.registrationIdentifierPresent
  );
  pushBoolean(
    "disclosure",
    "entity.multiple_entity_names_detected_on_site",
    "Multiple entity names detected on site",
    snapshot.multipleEntityNamesDetected
  );
  pushNumber(
    "disclosure",
    "entity.entity_transparency_surface_score",
    "Entity transparency surface score",
    snapshot.entityTransparencySurfaceScore ?? 0
  );
  pushBoolean(
    "disclosure",
    "commercial.pricing_page_present",
    "Pricing page present",
    snapshot.pricingPagePresent
  );
  pushBoolean(
    "disclosure",
    "commercial.fee_related_text_present",
    "Fee-related text present",
    snapshot.feeRelatedTextPresent
  );
  pushBoolean(
    "disclosure",
    "commercial.fee_schedule_table_present",
    "Fee schedule table present",
    snapshot.feeSchedulePresent
  );
  pushBoolean(
    "disclosure",
    "commercial.withdrawal_redemption_terms_text_present",
    "Withdrawal or redemption terms present",
    snapshot.withdrawalTermsPresent
  );
  pushBoolean(
    "disclosure",
    "commercial.cancellation_terms_text_present",
    "Cancellation terms present",
    snapshot.cancellationTermsPresent
  );
  pushBoolean(
    "disclosure",
    "commercial.account_closure_terms_text_present",
    "Account closure terms present",
    snapshot.accountClosureTermsPresent
  );
  pushBoolean(
    "disclosure",
    "commercial.promo_price_or_free_claim_present",
    "Promo price or free claim present",
    snapshot.promoPriceOrFreeClaimPresent
  );
  pushBoolean(
    "disclosure",
    "commercial.variable_fee_language_present_without_explanation",
    "Variable fee language without explanation",
    snapshot.variableFeeLanguageWithoutExplanation
  );
  pushNumber(
    "disclosure",
    "commercial.material_fee_terms_min_link_depth",
    "Material fee terms minimum link depth",
    snapshot.materialFeeTermsMinLinkDepth ?? 0
  );
  pushBoolean(
    "disclosure",
    "financial.leverage_language_present",
    "Leverage language present",
    snapshot.leverageLanguagePresent
  );
  pushBoolean(
    "disclosure",
    "financial.margin_trading_language_present",
    "Margin trading language present",
    snapshot.marginTradingLanguagePresent
  );
  pushBoolean(
    "disclosure",
    "financial.options_or_futures_language_present",
    "Options or futures language present",
    snapshot.optionsOrFuturesLanguagePresent
  );
  pushBoolean(
    "disclosure",
    "financial.perpetuals_or_derivatives_language_present",
    "Perpetuals or derivatives language present",
    snapshot.perpetualsOrDerivativesLanguagePresent
  );
  pushBoolean(
    "disclosure",
    "financial.staking_apy_language_present",
    "Staking APY language present",
    snapshot.stakingApyLanguagePresent
  );
  pushBoolean(
    "disclosure",
    "financial.copy_trading_language_present",
    "Copy trading language present",
    snapshot.copyTradingLanguagePresent
  );
  pushBoolean(
    "disclosure",
    "financial.ai_trading_or_automated_trading_language_present",
    "AI trading or automated trading language present",
    snapshot.aiTradingLanguagePresent
  );
  pushBoolean(
    "disclosure",
    "financial.loss_risk_disclosure_text_present",
    "Loss-risk disclosure text present",
    snapshot.lossRiskDisclosureTextPresent
  );
  pushBoolean(
    "disclosure",
    "financial.high_risk_product_explainer_page_present",
    "High-risk product explainer page present",
    snapshot.highRiskProductExplainerPagePresent
  );
  pushNumber(
    "disclosure",
    "financial.high_risk_product_signal_count",
    "High-risk product signal count",
    snapshot.highRiskProductSignalCount ?? 0
  );

  pushNumber("accessibility", "accessibility.wcag_error_count_total", "WCAG errors", snapshot.wcagErrorCountTotal);
  pushNumber(
    "accessibility",
    "accessibility.wcag_contrast_failures_count",
    "Contrast failures",
    snapshot.wcagContrastFailuresCount
  );
  pushNumber("accessibility", "accessibility.wcag_missing_alt_count", "Missing alt text", snapshot.wcagMissingAltCount);
  pushNumber(
    "accessibility",
    "accessibility.wcag_form_label_error_count",
    "Form label issues",
    snapshot.wcagFormLabelErrorCount
  );
  pushNumber("accessibility", "accessibility.wcag_aria_error_count", "ARIA issues", snapshot.wcagAriaErrorCount);
  pushNumber(
    "accessibility",
    "accessibility.wcag_link_name_error_count",
    "Link name issues",
    snapshot.wcagLinkNameErrorCount
  );
  pushNumber(
    "accessibility",
    "accessibility.wcag_keyboard_navigation_issue_count",
    "Keyboard navigation issues",
    snapshot.wcagKeyboardNavigationIssueCount
  );
  pushNumber(
    "accessibility",
    "accessibility.wcag_focus_indicator_issue_count",
    "Focus indicator issues",
    snapshot.wcagFocusIndicatorIssueCount
  );
  pushNumber(
    "accessibility",
    "accessibility.wcag_landmark_issue_count",
    "Landmark issues",
    snapshot.wcagLandmarkIssueCount
  );
  pushBoolean(
    "accessibility",
    "accessibility.accessibility_widget_present",
    "Accessibility widget detected",
    snapshot.accessibilityWidgetPresent
  );
  pushBoolean(
    "accessibility",
    "accessibility.vpat_or_accessibility_conformance_doc_present",
    "VPAT or accessibility conformance document detected",
    snapshot.vpatOrAccessibilityConformanceDocPresent
  );
  pushBoolean(
    "accessibility",
    "accessibility.accessibility_contact_method_present",
    "Accessibility contact method detected",
    snapshot.accessibilityContactMethodPresent
  );
  pushBoolean(
    "accessibility",
    "accessibility.accessibility_support_path_missing",
    "Accessibility support path missing",
    snapshot.accessibilityContactMethodPresent === false
  );
  if (snapshot.wcagLevelClaimed && snapshot.wcagLevelClaimed !== "unknown") {
    activeSignals.push(
      toTaxonomySignal({
        category: "accessibility",
        key: "accessibility.wcag_level_claimed",
        label: "WCAG conformance level claimed",
        value: snapshot.wcagLevelClaimed
      })
    );
  }
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
  pushBoolean("commerce", "commerce.discount_claim_present", "Discount claim detected", snapshot.discountClaimPresent);
  pushBoolean(
    "commerce",
    "commerce.original_price_comparison_present",
    "Original price comparison detected",
    snapshot.originalPriceComparisonPresent
  );
  pushBoolean(
    "commerce",
    "commerce.limited_time_offer_language_present",
    "Limited-time offer language detected",
    snapshot.limitedTimeOfferLanguagePresent
  );
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
  pushNumber(
    "commerce",
    "commerce.refund_policy_window_days",
    "Refund policy window days",
    snapshot.refundPolicyWindowDays ?? 0
  );
  pushBoolean(
    "commerce",
    "commerce.refund_policy_conditions_present",
    "Refund policy conditions detected",
    snapshot.refundPolicyConditionsPresent
  );
  pushBoolean(
    "commerce",
    "commerce.refund_request_method_present",
    "Refund request method detected",
    snapshot.refundRequestMethodPresent
  );
  pushBoolean(
    "commerce",
    "commerce.store_credit_only_policy_present",
    "Store-credit-only policy detected",
    snapshot.storeCreditOnlyPolicyPresent
  );
  pushBoolean("commerce", "commerce.exchange_policy_present", "Exchange policy detected", snapshot.exchangePolicyPresent);
  pushBoolean(
    "commerce",
    "commerce.renewal_notice_period_present",
    "Renewal notice period detected",
    snapshot.renewalNoticePeriodPresent
  );
  pushBoolean(
    "commerce",
    "commerce.termination_for_cause_clause_present",
    "Termination-for-cause clause detected",
    snapshot.terminationForCauseClausePresent
  );
  pushBoolean(
    "commerce",
    "commerce.account_deletion_terms_present",
    "Account deletion terms detected",
    snapshot.accountDeletionTermsPresent
  );
  pushBoolean(
    "commerce",
    "commerce.service_suspension_or_termination_terms_present",
    "Service suspension or termination terms detected",
    snapshot.serviceSuspensionOrTerminationTermsPresent
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
    "context.policy_terms_conflict_detected",
    "Policy/terms conflict detected",
    snapshot.policyTermsConflictDetected === true
  );
  pushBoolean(
    "context",
    "context.privacy_cookie_policy_conflict_detected",
    "Privacy/cookie policy conflict detected",
    snapshot.privacyCookiePolicyConflictDetected === true
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
