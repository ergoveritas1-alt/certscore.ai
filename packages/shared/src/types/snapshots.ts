export type CrawlSource = "manual" | "scheduled" | "preview" | "rescan";
export type CrawlTier = "quick" | "standard" | "deep";
export type ScanExecutionTier =
  | "tier0_passive"
  | "tier1_front_door"
  | "tier2_browser_surface"
  | "tier3_runtime_observation"
  | "tier4a_surface_inspection"
  | "tier4b_bounded_interaction"
  | "tier4c_comparative_interaction"
  | "tier5_full_scan";
export type ScanStopTierKind = "hard_stop" | "soft_stop" | "max_depth_reached" | "completed";
export type BrowserStateQuality = "fresh_isolated" | "reused_context" | "not_applicable_http_only" | "unknown";
export type AccessPostureClass = "tolerant" | "degraded_but_useful" | "early_loss" | "robots_limited" | "unknown";
export type RecoverableFindingClass =
  | "access_surface"
  | "privacy_surface"
  | "cmp_presence"
  | "initial_tracking"
  | "initial_storage"
  | "implicit_consent_state"
  | "privacy_choice_surface"
  | "preferences_ui_exposure"
  | "consent_effectiveness"
  | "policy_runtime_contradiction";
export type HeadlessMode = "headless" | "headed" | "unknown";
export type FetchStatus =
  | "ok"
  | "redirected"
  | "blocked"
  | "timeout"
  | "not_found"
  | "forbidden"
  | "error"
  | "skipped";
export type RenderModeUsed = "http_only" | "browser_only" | "http_then_browser";
export type ScanConfidence = "low" | "medium" | "high";
export type ConsentMechanismType = "none" | "banner" | "modal" | "inline" | "cmp";
export type ConsentInteractionModel =
  | "none"
  | "accept_only"
  | "accept_reject"
  | "accept_preferences"
  | "accept_reject_preferences"
  | "preferences_only"
  | "dismiss_only"
  | "other";
export type AgeVerificationMechanismType = "none" | "checkbox" | "date_of_birth" | "self_attestation" | "hard_gate";
export type PrivacyContactChannelType = "email" | "form" | "portal" | "none";
export type ThirdPartyDisclosureSpecificity = "none" | "generic" | "named_vendors";
export type ConsentBannerLayoutType = "modal" | "bottom_bar" | "top_bar" | "sidebar" | "full_screen" | "inline" | "unknown";
export type ConsentBannerPosition = "top" | "bottom" | "modal" | "sidebar" | "inline" | "other" | "unknown";
export type DefaultTrackingState = "tracking_disabled" | "tracking_enabled" | "unknown";
export type WcagLevelClaimed = "A" | "AA" | "AAA" | "unknown";
export type ComplianceMaturityTier = "basic" | "structured" | "mature" | "enterprise";
export type TrafficTierEstimate = "low" | "medium" | "high" | "very_high" | "unknown";
export type PolicyDsarMechanism = "present" | "partial" | "absent" | "unknown";
export type PolicyDoNotSell = "present_link" | "present_text" | "absent" | "unknown";
export type PolicyChildrenReference = "under_13" | "under_16" | "none" | "unknown";
export type PolicyRetentionDisclosure = "none" | "vague" | "specific";
export type VendorCategory =
  | "analytics"
  | "advertising"
  | "social"
  | "session_replay"
  | "tag_manager"
  | "cmp"
  | "accessibility_widget"
  | "payment"
  | "chat_support"
  | "marketing"
  | "fingerprinting"
  | "hosting"
  | "other";
export type DetectionSource = "html" | "headers" | "request" | "dom" | "text" | "url_guess" | "script_signature";
export type PartyType = "first_party" | "third_party" | "unknown";
export type CollectionEndpointType =
  | "direct_third_party"
  | "first_party_subdomain"
  | "first_party_collection_proxy"
  | "unknown";
export type PageType =
  | "homepage"
  | "privacy_policy"
  | "terms_of_service"
  | "cookie_policy"
  | "accessibility_statement"
  | "refund_policy"
  | "shipping_policy"
  | "subscription_terms"
  | "affiliate_disclosure"
  | "advertising_disclosure"
  | "contact"
  | "product"
  | "pricing"
  | "signup"
  | "login"
  | "checkout"
  | "blog"
  | "about"
  | "support"
  | "other";
export type ChangeEventSeverity = "info" | "low" | "medium" | "high";
export type ChangeEventGroup =
  | "added"
  | "removed"
  | "changed"
  | "policy"
  | "consent"
  | "tracker"
  | "forms"
  | "accessibility"
  | "security"
  | "enrichment"
  | "score";
export type ComplianceChangeEventType =
  | "field_added"
  | "field_removed"
  | "field_changed"
  | "privacy_policy_added"
  | "privacy_policy_removed"
  | "privacy_policy_hash_changed"
  | "cookie_banner_added"
  | "cookie_banner_removed"
  | "cmp_vendor_changed"
  | "reject_all_added"
  | "tracker_vendor_added"
  | "tracker_vendor_removed"
  | "session_replay_tracker_added"
  | "wcag_missing_alt_count_increased"
  | "wcag_missing_alt_count_decreased"
  | "accessibility_widget_added"
  | "age_gate_added"
  | "do_not_sell_link_added"
  | "dsar_mechanism_added"
  | "subprocessor_list_added"
  | "security_txt_added"
  | "request_domain_set_changed"
  | "script_domain_set_changed"
  | "security_header_posture_changed"
  | "request_domain_set_resolved"
  | "script_domain_set_resolved"
  | "security_header_posture_resolved";

export type ScanSnapshot = {
  scanId: string;
  scannerSchemaVersion: number;
  detectionEngineVersion: string;
  organizationId: string | null;
  domainId: string;
  domain: string;
  pagesRequested: number;
  pagesScanned: number;
  totalSignals: number;
  accessibilitySignalCount: number;
  privacySignalCount: number;
  disclosureSignalCount: number;
  highSeverityCount: number;
  mediumSeverityCount: number;
  lowSeverityCount: number;
  trackerVendorCount: number;
  registeredDomain: string | null;
  scanTimestamp: string;
  crawlSource: CrawlSource;
  crawlTier: CrawlTier;
  robotsAllowed: boolean;
  robotsFetchStatus: FetchStatus;
  robotsFetchHttpStatus: number | null;
  robotsTxtHash: string | null;
  robotsCrawlDelayMs: number | null;
  robotsRulesLoaded: boolean | null;
  robotsGroupCount: number | null;
  robotsDirectiveCount: number | null;
  robotsHasAllowRules: boolean | null;
  robotsHasDisallowRules: boolean | null;
  robotsTxtFetchedAt: string | null;
  robotsTxtUrl: string | null;
  authWallDetected: boolean;
  homepageFetchStatus: FetchStatus;
  homepageFetchHttpStatus: number | null;
  finalUrl: string | null;
  finalUrlScheme: "http" | "https" | null;
  redirectCount: number;
  renderModeUsed: RenderModeUsed;
  scanConfidence: ScanConfidence;
  partialScan: boolean;
  timeoutFlag: boolean;
  blockedFlag: boolean;
  captchaFlag: boolean;
  scanOutcome?: string | null;
  stopReasonCode?: string | null;
  stopReasonLabel?: string | null;
  stopReasonDetail?: string | null;
  stopReasonHttpStatus?: number | null;
  retryRecommended?: boolean | null;
  cooldownHours?: number | null;
  egressId?: string | null;
  egressType?: string | null;
  publicIpHash?: string | null;
  asn?: number | null;
  region?: string | null;
  userAgentFamily?: string | null;
  browserEngine?: string | null;
  headlessMode?: HeadlessMode | null;
  playwrightVersion?: string | null;
  chromiumVersion?: string | null;
  initialRequestMode?: string | null;
  homepageAttemptCount?: number | null;
  passiveVerificationAttemptCount?: number | null;
  staticFetchConcurrency?: number | null;
  domainRiskProfile?: string | null;
  homepageHttpStatus?: number | null;
  robotsHttpStatus?: number | null;
  serverHeader?: string | null;
  cfRayPresent?: boolean | null;
  akamaiMarkerPresent?: boolean | null;
  captchaMarkerPresent?: boolean | null;
  interstitialMarkerPresent?: boolean | null;
  normalizedBodyTitle?: string | null;
  normalizedBodyHash?: string | null;
  setCookieNames?: string[] | null;
  blockVendorGuess?: string | null;
  blockPageClassification?: string | null;
  challengeSuspected?: boolean | null;
  authWallSuspected?: boolean | null;
  rateLimitSuspected?: boolean | null;
  geoBlockSuspected?: boolean | null;
  fingerprintBlockSuspected?: boolean | null;
  passiveVerificationAttempted?: boolean | null;
  verifiedPublicSurfacesCount?: number | null;
  maxRequestedTier?: ScanExecutionTier | null;
  highestAttemptedTier?: ScanExecutionTier | null;
  highestSuccessfulTier?: ScanExecutionTier | null;
  stopTier?: ScanExecutionTier | null;
  stopTierKind?: ScanStopTierKind | null;
  tierTrace?: Record<string, unknown>[] | null;
  browserStateQuality?: BrowserStateQuality | null;
  accessPostureClass?: AccessPostureClass | null;
  recoverableFindingClasses?: RecoverableFindingClass[] | null;
  recommendedNextTier?: ScanExecutionTier | null;
  cooldownRecommended?: boolean | null;
  cooldownUntil?: string | null;
  coverageLevel?: string | null;
  reportFindingCount?: number | null;
  siteLanguagePrimary: string | null;
  countryInferred: string | null;
  regionStateInferred: string | null;
  jurisdictionGuess: string | null;
  euExposureLikely: boolean;
  californiaExposureLikely: boolean;
  childrenAudienceLikely: boolean;
  kidDirectedContentDetected: boolean | null;
  healthcareSiteLikely: boolean;
  financialServicesSiteLikely: boolean;
  ecommerceSiteLikely: boolean;
  saasSiteLikely: boolean;
  educationSiteLikely: boolean;
  multilingualSite: boolean;
  mobileAppLinksDetected: boolean | null;
  privacyPolicyPresent: boolean;
  termsOfServicePresent: boolean;
  cookiePolicyPresent: boolean;
  accessibilityStatementPresent: boolean;
  refundPolicyPresent: boolean;
  shippingPolicyPresent: boolean;
  subscriptionTermsPresent: boolean;
  affiliateDisclosurePresent: boolean;
  advertisingDisclosurePresent: boolean;
  contactPagePresent: boolean;
  privacyContactMethodPresent: boolean;
  doNotSellLinkPresent: boolean;
  dsarRequestMechanismPresent: boolean;
  subprocessorListPresent: boolean;
  legalEntityNameDetected: boolean;
  physicalBusinessAddressPresent: boolean;
  emailContactPublicPresent: boolean;
  phoneNumberPublicPresent: boolean;
  privacyEmailSpecificPresent: boolean;
  dpoReferencePresent: boolean;
  dpoEmailDetected: boolean | null;
  entityJurisdictionDetected: string | null;
  supervisoryAuthorityReferencePresent: boolean | null;
  privacyPolicyHash: string | null;
  termsPolicyHash: string | null;
  cookiePolicyHash: string | null;
  legalPagesPresenceHash: string | null;
  privacyPolicyLastUpdatedFound: string | null;
  privacyPolicyLastUpdatedDate: string | null;
  privacyPolicyWordCount: number | null;
  privacyPolicyComplexityScore: number | null;
  privacyLanguageReadabilityScore: number | null;
  policyChangeFrequencyScore: number | null;
  policyUpdateLagDays: number | null;
  mentionsGdpr: boolean;
  mentionsCcpaOrCpra: boolean;
  mentionsCoppa: boolean;
  mentionsUnder13: boolean;
  mentionsUnder16: boolean;
  mentionsSensitiveData: boolean;
  mentionsBiometricData: boolean;
  mentionsHealthData: boolean;
  mentionsFinancialData: boolean;
  mentionsLocationData: boolean;
  mentionsDataRetention: boolean;
  dataRetentionSpecificPeriodDetected: boolean | null;
  mentionsDataSaleOrSharing: boolean;
  mentionsCrossBorderTransfer: boolean;
  crossBorderTransferMechanismDetected: boolean | null;
  mentionsSubprocessorsOrVendors: boolean;
  mentionsAutomatedDecisioning: boolean;
  mentionsAiUsage: boolean;
  doubleOptInReferencePresent: boolean | null;
  thirdPartyDisclosureSpecificity: ThirdPartyDisclosureSpecificity | null;
  cookieBannerPresent: boolean;
  consentMechanismType: ConsentMechanismType;
  cmpVendorName: string | null;
  cmpVendorConfidence: number | null;
  consentInteractionModel: ConsentInteractionModel | null;
  consentAcceptButtonCount: number | null;
  consentRejectButtonCount: number | null;
  consentPreferencesButtonCount: number | null;
  rejectAllPresent: boolean;
  acceptAllPresent: boolean;
  granularPreferencesPresent: boolean;
  preconsentTrackingDetected: boolean;
  cookiePolicyLinkedFromBanner: boolean;
  consentModeDetected: boolean;
  darkPatternAcceptEmphasis: boolean;
  darkPatternRejectHidden: boolean;
  darkPatternRejectButtonMissing: boolean;
  darkPatternAcceptButtonProminence: boolean;
  precheckedConsentBoxes: boolean;
  darkPatternForcedConsentWall: boolean;
  darkPatternAcceptOnlyBanner: boolean;
  darkPatternDismissWithoutReject: boolean;
  darkPatternCountdownTimerPresent: boolean;
  darkPatternFakeScarcityLanguage: boolean;
  consentSignatureHash: string | null;
  consentPersistenceMechanismDetected: boolean | null;
  consentBannerLayoutType: ConsentBannerLayoutType | null;
  consentBannerPosition: ConsentBannerPosition | null;
  defaultTrackingState: DefaultTrackingState | null;
  cookieCategoryCount: number | null;
  consentMaturityScore: number | null;
  trackerCountTotal: number;
  analyticsTrackerCount: number;
  advertisingTrackerCount: number;
  socialTrackerCount: number;
  sessionReplayTrackerCount: number;
  tagManagerPresent: boolean;
  firstPartyAnalyticsOnly: boolean;
  adtechStackComplexityScore: number;
  fingerprintingOrIdentityVendorDetected: boolean;
  trackerVendorSetHash: string | null;
  trackerCategorySetHash: string | null;
  trackerVendorConcentrationScore: number | null;
  trackerDiversityScore: number | null;
  thirdPartyScriptDomainCount: number | null;
  thirdPartyScriptRiskScore: number | null;
  thirdPartyDataFlowRiskScore: number | null;
  trackerRegulatoryRiskScore: number | null;
  trackerAdoptionChangeDetected: boolean | null;
  cookieCountTotal: number | null;
  thirdPartyCookieCount: number | null;
  firstPartyCookieSetBeforeConsent: boolean | null;
  thirdPartyCookieSetBeforeConsent: boolean | null;
  trackingBeforeConsentDetected: boolean | null;
  formCountTotal: number;
  contactFormPresent: boolean;
  newsletterSignupPresent: boolean;
  accountSignupPresent: boolean;
  loginPagePresent: boolean;
  passwordResetPresent: boolean;
  checkoutOrPaymentFormPresent: boolean;
  fileUploadFieldPresent: boolean;
  emailInputPresent: boolean;
  phoneInputPresent: boolean;
  addressInputPresent: boolean;
  paymentCardInputPresent: boolean;
  dateOfBirthInputPresent: boolean;
  formCollectsSsn: boolean;
  formCollectsGovernmentId: boolean;
  formCollectsHealthInformation: boolean;
  formCollectsFinancialInformation: boolean;
  formCollectsBirthdate: boolean;
  formCollectsGeolocation: boolean;
  ageGatePresent: boolean;
  ageVerificationMechanismType: AgeVerificationMechanismType;
  parentalConsentReferencePresent: boolean;
  sensitiveDataFormHintsPresent: boolean;
  formsSignatureHash: string | null;
  piiCollectionRiskScore: number;
  formDataSensitivityScore: number | null;
  dataMinimizationScore: number | null;
  highSensitivityDataCollectionDetected: boolean | null;
  privacyRequestFormPresent: boolean | null;
  dataAccessRequestPresent: boolean | null;
  dataDeletionRequestPresent: boolean | null;
  privacyContactChannelType: PrivacyContactChannelType | null;
  consentWithdrawalMechanismPresent: boolean | null;
  userRightsFrictionScore: number | null;
  wcagErrorCountTotal: number;
  wcagWarningCountTotal: number;
  wcagContrastFailuresCount: number;
  wcagMissingAltCount: number;
  wcagFormLabelErrorCount: number;
  wcagAriaErrorCount: number;
  wcagHeadingStructureErrorCount: number;
  wcagLinkNameErrorCount: number;
  wcagKeyboardNavigationIssueCount: number;
  wcagFocusIndicatorIssueCount: number;
  wcagLandmarkIssueCount: number;
  accessibilityWidgetPresent: boolean;
  accessibilityWidgetVendor: string | null;
  vpatOrAccessibilityConformanceDocPresent: boolean;
  accessibilityContactMethodPresent: boolean;
  accessibilitySignatureHash: string | null;
  accessibilityScoreAutomated: number;
  wcagLevelClaimed: WcagLevelClaimed | null;
  accessibilityRemediationLikely: boolean | null;
  accessibilityClaimAccuracyScore: number | null;
  accessibilityClaimMismatchDetected: boolean | null;
  accessibilityLitigationRiskScore: number | null;
  adaDemandLetterProbability: number | null;
  subscriptionOfferDetected: boolean;
  autoRenewDisclosurePresent: boolean;
  autoRenewalDisclosurePresent: boolean;
  subscriptionCancellationPolicyPresent: boolean;
  cancellationPolicyPresent: boolean;
  unsubscribeMechanismPresent: boolean;
  freeTrialDetected: boolean;
  discountClaimPresent: boolean;
  originalPriceComparisonPresent: boolean;
  limitedTimeOfferLanguagePresent: boolean;
  refundOrReturnWindowDetected: boolean;
  refundPolicyWindowDays: number | null;
  refundPolicyConditionsPresent: boolean;
  refundRequestMethodPresent: boolean;
  storeCreditOnlyPolicyPresent: boolean;
  exchangePolicyPresent: boolean;
  shippingTermsDetected: boolean;
  renewalNoticePeriodPresent: boolean;
  terminationForCauseClausePresent: boolean;
  accountDeletionTermsPresent: boolean;
  serviceSuspensionOrTerminationTermsPresent: boolean;
  disputeResolutionOrArbitrationPresent: boolean;
  testimonialOrReviewDisclosurePresent: boolean;
  adNetworkGoogleAds: boolean;
  adNetworkMetaAds: boolean;
  retargetingPixelDetected: boolean;
  sessionReplayToolDetected: boolean;
  aiChatbotPresent: boolean | null;
  aiChatbotVendor: string | null;
  aiAssistantWidgetDetected: boolean | null;
  aiDisclosureTextPresent: boolean | null;
  aiTermsOrPolicyAiReference: boolean | null;
  aiHelpCenterAiReference: boolean | null;
  aiSearchOrAnswerExperienceDetected: boolean | null;
  aiHiringAutomationSignalDetected: boolean | null;
  securityTxtPresent: boolean;
  vulnerabilityDisclosurePagePresent: boolean;
  trustCenterPresent: boolean;
  incidentStatusPagePresent: boolean;
  responsibleDisclosurePresent: boolean;
  bugBountyProgramPresent: boolean;
  hstsEnabled: boolean;
  httpsEnforced: boolean;
  mixedContentDetected: boolean;
  lawEnforcementRequestPolicyPresent: boolean;
  transparencyReportPresent: boolean;
  transparencyScore: number;
  cspHeaderPresent: boolean | null;
  xFrameOptionsPresent: boolean | null;
  referrerPolicyPresent: boolean | null;
  permissionsPolicyPresent: boolean | null;
  cspReportEndpointPresent: boolean | null;
  securityHeadersScore: number | null;
  tlsVersionMinSupported: string | null;
  certificateAuthority: string | null;
  certificateValidDaysRemaining: number | null;
  certificateAutoRenewLikely: boolean | null;
  dnssecEnabled: boolean | null;
  spfRecordPresent: boolean | null;
  dmarcRecordPresent: boolean | null;
  dkimRecordDetected: boolean | null;
  cmsPlatform: string | null;
  ecommercePlatform: string | null;
  frontendFramework: string | null;
  hostingOrCdnProvider: string | null;
  cdnProvider: string | null;
  edgeSecurityProvider: string | null;
  tagManagerVendor: string | null;
  paymentProcessorHints: string[];
  chatSupportVendor: string | null;
  serviceWorkerDetected: boolean | null;
  publicApiEndpointDetected: boolean | null;
  siteSizeHint: string | null;
  homepageStructuredHash: string | null;
  digitalMaturityScore: number | null;
  domainRegistrationYear: number | null;
  domainAgeYears: number | null;
  domainPrivacyProtectionEnabled: boolean | null;
  trafficTierEstimate: TrafficTierEstimate | null;
  requestDomainSetChanged: boolean | null;
  scriptDomainSetChanged: boolean | null;
  securityHeaderPostureChanged: boolean | null;
  infrastructureChangeDetected: boolean | null;
  policyBehaviorConflictDetected: boolean | null;
  policyTermsConflictDetected: boolean | null;
  privacyCookiePolicyConflictDetected: boolean | null;
  sessionReplayWithoutDisclosureDetected: boolean | null;
  accessibilityClaimVsRealityGapDetected: boolean | null;
  complianceTrendScore: number | null;
  performanceClaimPresent: boolean;
  performanceClaimCount: number;
  returnOrYieldPercentagePresent: boolean;
  investmentOutperformanceLanguagePresent: boolean;
  guaranteedReturnLanguagePresent: boolean;
  lowRiskHighReturnLanguagePresent: boolean;
  hypotheticalOrBacktestLanguagePresent: boolean;
  testimonialOrReviewBlockNearFinancialClaimPresent: boolean;
  riskDisclosureTextPresent: boolean;
  claimCtaBlockPresent: boolean;
  financialClaimWithCtaCount: number;
  aboutPagePresent: boolean;
  teamOrLeadershipPagePresent: boolean;
  jurisdictionOrOperatingEntityTextPresent: boolean;
  registrationClaimPresent: boolean;
  registrationIdentifierPresent: boolean;
  multipleEntityNamesDetected: boolean;
  entityTransparencySurfaceScore: number | null;
  pricingPagePresent: boolean;
  feeRelatedTextPresent: boolean;
  feeSchedulePresent: boolean;
  withdrawalTermsPresent: boolean;
  cancellationTermsPresent: boolean;
  accountClosureTermsPresent: boolean;
  promoPriceOrFreeClaimPresent: boolean;
  variableFeeLanguageWithoutExplanation: boolean;
  materialFeeTermsMinLinkDepth: number | null;
  leverageLanguagePresent: boolean;
  marginTradingLanguagePresent: boolean;
  optionsOrFuturesLanguagePresent: boolean;
  perpetualsOrDerivativesLanguagePresent: boolean;
  stakingApyLanguagePresent: boolean;
  copyTradingLanguagePresent: boolean;
  aiTradingLanguagePresent: boolean;
  lossRiskDisclosureTextPresent: boolean;
  highRiskProductExplainerPagePresent: boolean;
  highRiskProductSignalCount: number;
  policyEnrichmentId: string | null;
  certscoreOverall: number;
  privacyScore: number;
  consentScore: number;
  trackerRiskScore: number;
  accessibilityScore: number;
  dataCollectionRiskScore: number;
  consumerProtectionScore: number;
  childrenPrivacyRiskScore: number;
  legalCoverageScore: number | null;
  complianceMaturityTier: ComplianceMaturityTier | null;
  regulatoryExposureScore: number;
};

export type ScanTrackerVendor = {
  scanId: string;
  vendorName: string;
  vendorCategory: VendorCategory;
  detectionSource: DetectionSource;
  confidence: number;
  firstPartyOrThirdParty: PartyType;
  collectionEndpointType: CollectionEndpointType;
  beforeConsent: boolean | null;
  scriptHost: string | null;
  matchedSignatureId: string | null;
};

export type ScanAccessibilityRuleCount = {
  scanId: string;
  ruleCode: string;
  ruleGroup: string;
  severity: ChangeEventSeverity;
  instanceCount: number;
};

export type ScanAccessibilityRuleExample = {
  scanId: string;
  pageUrl: string;
  ruleCode: string;
  ruleGroup: string;
  severity: ChangeEventSeverity;
  impact: string | null;
  help: string;
  helpUrl: string;
  description: string;
  nodeCount: number;
  representativeNodes?: Array<Record<string, unknown>>;
  representativeSelectors: string[];
};

export type ScanPage = {
  scanId: string;
  pageType: PageType;
  pageUrl: string;
  fetchStatus: FetchStatus;
  fetchedVia: "http" | "browser";
  normalizedContentHash: string | null;
  titleHash: string | null;
  pageLanguage: string | null;
};

export type ObservedPageRole =
  | "core"
  | "promotional"
  | "pricing"
  | "product"
  | "legal"
  | "contact"
  | "about"
  | "support"
  | "other";

export type ObservedPageEvidence = {
  evidenceId: string;
  scanId: string;
  pageUrl: string;
  pageType: PageType;
  pageRole: ObservedPageRole;
  crawlDepth: number | null;
  sourceKind: "dom_text" | "page_metadata" | "link_target" | "absence_scope";
  matchedText: string | null;
  selector: string | null;
  domPath: string | null;
  containerSelector: string | null;
  containerDomPath: string | null;
  siblingIndex: number | null;
  tokenStart: number | null;
  tokenEnd: number | null;
  screenshotRef?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ScanSignalHit = {
  id: string;
  scanId: string;
  signalKey: string;
  detectorName: string;
  detectorType: "text_pattern" | "dom_classifier" | "page_classifier" | "absence_scope";
  detectorVersion: string;
  pageUrl: string;
  pageType: PageType;
  pageRole: ObservedPageRole;
  evidenceRefs: string[];
  payload: Record<string, unknown>;
};

export type ReviewRuleEvidence = {
  ruleKey: string;
  ruleVersion: string;
  inputSignalKeys: string[];
  evidenceRefs: string[];
  localSearch: {
    tokenRadius: number;
    domSiblingRadius: number;
    evaluatedPageUrls: string[];
    evaluatedContainers: string[];
    matchedDisclosureEvidenceRefs: string[];
    maxAcceptableLinkDepth?: number;
    explainerSurfaceMaxCrawlDepth?: number;
  };
};

export type KeyPageDiscoverySource =
  | "footer_link"
  | "header_link"
  | "body_link"
  | "legal_hub"
  | "rendered_link"
  | "sitemap"
  | "guessed_slug"
  | "second_hop_legal_hub"
  | "same_brand_subdomain";

export type KeyPageDiscoveryHostRelation = "same_host" | "same_brand_subdomain" | "related_party";

export type KeyPageSurfaceState =
  | "linked_and_verified"
  | "linked_but_fetch_blocked"
  | "linked_but_extraction_limited"
  | "linked_unverified"
  | "guessed_only"
  | "not_detected";

export type KeyPageExtractionOutcome = "not_attempted" | "sufficient" | "limited";

export type KeyPageFetchQuality = "verified_content" | "thin_content" | "blocked_interstitial" | "unreachable";

export type KeyPageDiscoveryCandidate = {
  pageType: Extract<
    PageType,
    "privacy_policy" | "terms_of_service" | "cookie_policy" | "accessibility_statement" | "contact" | "about" | "pricing" | "product"
  >;
  candidateUrl: string;
  discoveredFrom: KeyPageDiscoverySource;
  hostRelation: KeyPageDiscoveryHostRelation;
  sourceUrl: string | null;
  anchorText: string | null;
  localeHints: string[];
  candidateScore: number;
  pageTypeConfidence: number;
  fetchAttempted: boolean;
  fetchOutcome: FetchStatus | null;
  fetchQuality?: KeyPageFetchQuality | null;
};

export type KeyPageDiscoveryPageSummary = {
  pageType: Extract<
    PageType,
    "privacy_policy" | "terms_of_service" | "cookie_policy" | "accessibility_statement" | "contact" | "about" | "pricing" | "product"
  >;
  surfaceDetected: boolean;
  surfaceState: KeyPageSurfaceState;
  guessedOnly: boolean;
  bestCandidateUrl: string | null;
  bestCandidateAnchorText: string | null;
  bestCandidateSourceUrl: string | null;
  bestCandidateHostRelation: KeyPageDiscoveryHostRelation | null;
  bestFetchOutcome: FetchStatus | null;
  fetchQuality?: KeyPageFetchQuality | null;
  successfulUrl: string | null;
  successfulPageTitle: string | null;
  successfulHostRelation: KeyPageDiscoveryHostRelation | null;
  extractionOutcome: KeyPageExtractionOutcome;
  attemptedUrls: string[];
  attemptCount: number;
  bestDiscoverySource: KeyPageDiscoverySource | null;
  stopReason:
    | "covered"
    | "all_attempts_failed"
    | "budget_exhausted"
    | "guessed_only"
    | "no_surface"
    | "not_needed"
    | "repeated_failures";
};

export type FinancialValidationEvidence = {
  pageEvidence: Array<{
    evidenceId: string;
    matchedText: string | null;
    metadata: Record<string, unknown> | null;
    pageRole: string;
    pageType: string;
    pageUrl: string;
  }>;
  signalHits: Array<{
    evidenceRefs: string[];
    id: string;
    pageRole: string;
    pageType: string;
    pageUrl: string;
    payload: Record<string, unknown>;
    signalKey: string;
  }>;
};

export type KeyPageDiscoverySummary = {
  localeHints: string[];
  sitemapUrls: string[];
  sitemapFilesFetched: string[];
  sitemapIndexUrlsFetched: string[];
  budgets: {
    maxSitemapFiles: number;
    maxSitemapIndexChildren: number;
    maxCandidates: number;
    maxAdditionalFetchAttempts: number;
    maxFetchAttemptsPerType: number;
    maxSecondHopLegalHubFetchesPerMissingType: number;
    maxSameBrandSubdomainHosts: number;
    maxSameBrandCandidatesPerType: number;
  };
  candidates: KeyPageDiscoveryCandidate[];
  financialValidationEvidence?: FinancialValidationEvidence | null;
  pageSummaries: KeyPageDiscoveryPageSummary[];
  sameBrandSubdomainHostsInspected: string[];
};

export type ConsentInteractionEvidenceStep = {
  action: "accept" | "reject" | "preferences" | "save" | "toggle";
  actionType?:
    | "accept_all"
    | "reject_all"
    | "essential_only"
    | "opt_out"
    | "manage_then_reject"
    | "manage_preferences"
    | "save_preferences"
    | "toggle_off"
    | "unknown";
  bannerVendor?: string | null;
  clickedAtMs?: number | null;
  clickedLabel?: string | null;
  cmpDetected?: string | null;
  pageUrlAtClick?: string | null;
  resultingUrlIfChanged?: string | null;
  selectorHint: string | null;
  selector?: string | null;
  stepIndex: number;
  success?: boolean | null;
  text: string;
  urlAfterClick: string | null;
  visibleText?: string | null;
};

export type CookieAttributeSummary = {
  totalCookiesAnalyzed: number;
  missingSecureCount: number;
  missingHttpOnlyCount: number;
  weakSameSiteCount: number;
  thirdPartyWeakAttributeCount: number;
  missingSecureCookieNames: string[];
  missingHttpOnlyCookieNames: string[];
  weakSameSiteCookieNames: string[];
  thirdPartyWeakAttributeCookieNames: string[];
};

export type GpcVerification = {
  status: "honored" | "ignored" | "inconclusive";
  baselineTrackerCount: number | null;
  baselineThirdPartyCookieCount: number | null;
  gpcTrackerCount: number | null;
  gpcThirdPartyCookieCount: number | null;
  trackerCountDelta: number | null;
  thirdPartyCookieCountDelta: number | null;
  gpcSignalSent?: boolean | null;
  gpcRecognitionObserved?: boolean | null;
  policyMentions?: string[];
  evidenceUrls: string[];
};

export type CpraCbaOptOutUiResult =
  | "full_cpra_compliant"
  | "partial_no_icon"
  | "generic_do_not_sell"
  | "absent";

export type CpraPolicyCbaLanguage = "full_cba_language" | "legacy_do_not_sell" | "absent";

export type CpraCbaOptOutEvidence = {
  pageUrl: string;
  advertisingSharingVendors: string[];
  directAdvertisingSharingVendors?: string[];
  analyticsTagManagementVendors?: string[];
  choiceControlsInspected: boolean;
  choiceControlSearchScope: "homepage_footer_privacy_surfaces";
  optOutUiResult: CpraCbaOptOutUiResult;
  optOutControlFound: boolean;
  optOutLinkText: string | null;
  optOutLinkHref: string | null;
  cpraIconDetected: boolean;
  gpcCbaHonored: boolean;
  privacyChoiceSearchUrls?: string[];
  gpcOptOutDiscoveryAttemptUrls?: string[];
  policyCbaLanguage: CpraPolicyCbaLanguage;
  policyUiCongruent: boolean;
  findingSeverity: "critical" | "high" | "medium";
  suppressorApplied: string | null;
  scanOriginGeo: string | null;
  limitation: "homepage_only";
};

export type CaliforniaCipaSignalType =
  | "session_replay"
  | "behavioral_analytics"
  | "chat_widget"
  | "search_interaction"
  | "form_interaction"
  | "pixel_on_sensitive_surface"
  | "third_party_interaction_endpoint";

export type CaliforniaCipaConsentTiming = "pre_consent" | "post_consent" | "post_reject" | "unknown";
export type CaliforniaCipaEvidenceConfidence = "low" | "medium" | "high";

export type CaliforniaCipaSensitiveTrackingEvidence = {
  cipaSensitive: boolean;
  cipaSignalTypes: CaliforniaCipaSignalType[];
  cipaConsentTiming: CaliforniaCipaConsentTiming;
  cipaThirdPartyReceiptObserved: boolean;
  cipaSensitiveSurfaceObserved: boolean;
  cipaDisclosureObserved: boolean;
  cipaEvidenceConfidence: CaliforniaCipaEvidenceConfidence;
  directEvidenceObserved: boolean;
  legalConclusion: false;
  collectionEndpointObserved?: boolean | null;
  eventCaptureIndicators?: string[];
  maskingOrExclusionObserved?: boolean | null;
  pageUrls?: string[];
  requestUrls?: string[];
  statusBasis?: string;
  vendors?: string[];
};

export type CaliforniaPrivacyEvidence = {
  privacyNoticeObserved: boolean | null;
  privacyNoticeUrls: string[];
  privacyNoticeSourceUrls?: string[];
  verifiedPrivacyNoticeUrls?: string[];
  privacyNoticeCandidateUrls?: string[];
  privacyNoticeAttemptedUrls?: string[];
  privacyNoticeDiscoveryEvidence?: {
    attempted: boolean;
    attemptedPrivacyNoticeUrls: string[];
    attemptedUrls: string[];
    blockedUrls: string[];
    failedUrls: string[];
    homepageCandidateCount: number;
    homepageFetchStatus: string | null;
    legalHubCandidateCount: number;
    legalHubFetchStatus: string | null;
    legalHubTargetCount: number;
    legalHubUrl: string | null;
    privacyTargetAttempted: boolean;
    privacyTargetVerified: boolean;
    source: "passive_public_surface_verification";
    usedUrlscanBackfill: boolean;
    verifiedPrivacyNoticeUrls: string[];
    verifiedSurfaceTargets: string[];
  };
  californiaNoticeCueObserved?: boolean | null;
  californiaNoticeCueText?: string | null;
  footerNoticeCueObserved?: boolean | null;
  footerNoticeCueText?: string | null;
  collectionContextObserved: boolean | null;
  collectionNoticeCueObserved: boolean | null;
  collectionContextUrls: string[];
  collectionContextTypes?: string[];
  collectionEvidenceSources?: string[];
  collectionNoticeEvidenceKind?:
    | "generic_search_only"
    | "footer_notice_link_only"
    | "policy_notice_text_only"
    | "collection_form_without_notice"
    | "collection_form_with_notice"
    | "verified_notice_at_point_of_collection"
    | "no_collection_context"
    | "unknown";
  collectionFieldContexts?: Array<{
    pageUrl: string;
    fieldType: string | null;
    fieldName: string | null;
    fieldLabel: string | null;
    source: "form_field" | "sensitive_field" | "pre_submit_capture";
  }>;
  collectionNoticeCueText?: string | null;
  saleShareRuntimeSignalsObserved: boolean | null;
  targetedAdvertisingSignalsObserved: boolean | null;
  advertisingSharingVendors: string[];
  directAdvertisingSharingVendors?: string[];
  analyticsTagManagementVendors?: string[];
  directSaleShareOrTargetedAdvertisingRequestUrls?: string[];
  directSaleShareOrTargetedAdvertisingCookieNames?: string[];
  directSaleShareOrTargetedAdvertisingVendors?: string[];
  analyticsOrMeasurementRequestUrls?: string[];
  analyticsOrMeasurementCookieNames?: string[];
  analyticsOrMeasurementVendors?: string[];
  utilityOrInfrastructureRequestUrls?: string[];
  saleShareRequestUrls?: string[];
  saleShareCookieNames?: string[];
  policySaleShareAdmissionObserved?: boolean | null;
  policySaleShareAdmissionSnippet?: string | null;
  policySaleShareAdmissionConfidence?: "high" | "moderate" | "low" | null;
  doNotSellSharePathObserved: boolean | null;
  doNotSellSharePathUrl: string | null;
  doNotSellSharePathLabel: string | null;
  doNotSellShareUrls?: string[];
  doNotSellShareLabels?: string[];
  privacyChoiceUrls?: string[];
  privacyChoiceLabels?: string[];
  privacyChoicePathEvidence?: {
    attempted: boolean;
    observed: boolean;
    searchScope:
      | "homepage_footer_privacy_surfaces"
      | "discovered_links"
      | "consent_lifecycle_controls"
      | "policy_links";
    candidateCount: number;
    candidateUrls: string[];
    candidateLabels: string[];
    selectedUrl: string | null;
    selectedLabel: string | null;
    selectionBasis?:
      | "cpra_ui"
      | "do_not_sell_share_link"
      | "privacy_choice_link"
      | "consent_lifecycle"
      | "homepage_self_unconfirmed"
      | "none";
    sourceSignals: string[];
    interactionAttempted: boolean;
    interactionConfirmed: boolean | null;
    interactionOutcome: string | null;
    limitation: "discovery_only" | "interaction_attempted" | "not_tested";
  };
  privacyChoiceInteractionEvidence?: {
    attempted: boolean;
    pathObserved: boolean;
    selectedUrl: string | null;
    selectedLabel: string | null;
    source: "cpra_ui" | "discovered_link" | "consent_lifecycle" | "none";
    clickAttempted: boolean;
    clickConfirmed: boolean | null;
    clickDepth: number | null;
    outcome:
      | "opened_preference_center"
      | "navigated_to_policy_or_notice"
      | "no_ui_change"
      | "click_failed"
      | "ambiguous"
      | "no_observed_path"
      | "not_attempted";
    pageUrl: string | null;
    finalUrl: string | null;
    visibleTextSnippets: string[];
    preferenceCenterProbeUrl?: string | null;
    preferenceCenterProbeFinalUrl?: string | null;
    preferenceCenterProbeAttempts?: number | null;
    preferenceCenterProbeErrorCategory?:
      | "evaluate_failed"
      | "page_unavailable"
      | "read_timeout"
      | "unknown"
      | null;
    preferenceCenterProbeReason?:
      | "preference_text_observed"
      | "category_controls_observed"
      | "opt_out_action_observed"
      | "save_control_observed"
      | "no_matching_controls_or_text"
      | "probe_error"
      | null;
    preferenceCenterVisibleTextSnippets?: string[];
    preferenceCenterObserved?: boolean | null;
    preferenceCenterCategoryLabels?: string[];
    preferenceCenterToggleCount?: number | null;
    saleShareToggleObserved?: boolean | null;
    targetedAdvertisingToggleObserved?: boolean | null;
    preferenceActionCandidateCount?: number | null;
    preferenceActionCandidateLabels?: string[];
    preferenceSaveCandidateCount?: number | null;
    preferenceSaveCandidateLabels?: string[];
    preferenceToggleCandidateCount?: number | null;
    preferenceToggleCandidateLabels?: string[];
    preferenceSaveControlObserved?: boolean | null;
    preferenceSaveLabel?: string | null;
    preferenceSaveAttempted?: boolean | null;
    preferenceSaveConfirmed?: boolean | null;
    preferenceActionLabel?: string | null;
    preferenceActionAttempted?: boolean | null;
    preferenceActionConfirmed?: boolean | null;
    preferenceActionLimitation?:
      | "no_preference_center_observed"
      | "no_clear_opt_out_action"
      | "ambiguous_preference_controls"
      | "save_control_not_observed"
      | "save_action_failed"
      | "action_attempted"
      | "not_attempted";
    beforeTrackerCount: number | null;
    afterTrackerCount: number | null;
    beforeThirdPartyCookieCount: number | null;
    afterThirdPartyCookieCount: number | null;
    persistedTrackerVendors: string[];
    newTrackerVendors: string[];
    removedTrackerVendors: string[];
    evidenceUrls: string[];
    evidenceRefs: string[];
    limitation:
      | "validation_harness_only"
      | "runtime_timeout"
      | "no_observed_path"
      | "click_only_no_post_window"
      | "not_attempted";
  };
  gpcTestRan: boolean;
  gpcSignalSent: boolean | null;
  gpcRecognitionObserved: boolean | null;
  gpcTrackingReductionObserved: boolean | null;
  sensitivePiContextObserved: boolean | null;
  sensitivePiCategories: string[];
  sensitivePiContextUrls?: string[];
  sensitiveThirdPartyTrackingObserved?: boolean | null;
  sensitiveThirdPartyTrackingVendors?: string[];
  sensitiveThirdPartyTrackingRequestUrls?: string[];
  cipaInteractionRecordingEvidence?: CaliforniaCipaSensitiveTrackingEvidence | null;
  cipaCommunicationInterceptionEvidence?: CaliforniaCipaSensitiveTrackingEvidence | null;
  limitUseSensitivePiPathObserved: boolean | null;
  limitUseSensitivePiPathUrl: string | null;
  limitUseSensitivePiPathLabel?: string | null;
  optOutInteractionConfirmed: boolean | null;
  optOutSavedOrApplied?: boolean | null;
  optOutFrictionSignals?: string[];
  optOutInteractionSteps?: ConsentInteractionEvidenceStep[];
  postOptOutTrackingReductionObserved: boolean | null;
  postOptOutTrackingPersisted: boolean | null;
  postOptOutPersistedVendors?: string[];
  postOptOutPersistedDirectAdvertisingVendors?: string[];
  postOptOutRequestUrls?: string[];
  postOptOutDirectAdvertisingRequestUrls?: string[];
  postOptOutDirectAdvertisingPersisted?: boolean | null;
  consumerRightsRequestMethodObserved?: boolean | null;
  consumerRightsRequestMethodUrls?: string[];
  consumerRightsRequestMethodSourceUrls?: string[];
  consumerRightsRequestMethodTypes?: string[];
  consumerRightsRequestMethodSnippets?: string[];
  consumerRightsRequestMethodConfidence?: "high" | "moderate" | "low" | null;
  rightsLanguageObserved?: boolean | null;
  policyRuntimeDisclosureSnippets?: string[];
  unmatchedRuntimeDisclosureVendors?: string[];
  affectedControlLabels?: string[];
  affectedControlRoles?: string[];
  affectedControlTypes?: string[];
  affectedSelectors?: string[];
  affectedUrls?: string[];
  buttonNameIssueCount?: number;
  consentControlsObserved?: string[];
  controlAccessibilityIssueCount?: number;
  controlScopeConfidence?: "high" | "moderate" | "low" | null;
  examplesAreGeneralPageOnly?: boolean;
  linkNameIssueCount?: number;
  privacyControlAccessibilityIssueObserved: boolean | null;
  privacyControlAccessibilitySignals: string[];
  privacyControlObserved?: boolean | null;
  privacyControlsObserved?: string[];
  policyRuntimeDisclosureAlignment: "aligned" | "gap_observed" | "review" | "not_testable";
  policyRuntimeDisclosureAlignmentBasis?:
    | "aligned_category_level"
    | "vendor_specific_unmatched"
    | "insufficient_policy_evidence"
    | "potential_gap_no_category_disclosure"
    | "contradiction_gap"
    | "no_relevant_runtime_signal"
    | "unknown";
  evidenceRefs: string[];
};

export type ConsentTimelineEvidence = {
  navigationStartMs: 0;
  firstCmpVisibleMs: number | null;
  cmpReadyMs: number | null;
  firstNonEssentialRequestMs: number | null;
  firstCookieSetMs: number | null;
  firstTrackingCookieSetMs: number | null;
  firstUserActionMs: number | null;
  firstConsentActionMs: number | null;
  firstRejectActionMs: number | null;
  firstAcceptActionMs: number | null;
  timelineConfidence: "high" | "medium" | "low";
  evidenceRefs?: string[];
};

export type RequestPurposeClassificationConfidence = Array<{
  requestUrl: string;
  hostname: string;
  vendor: string | null;
  category?: string | null;
  purpose: string;
  essentiality: "essential" | "non_essential" | "unknown";
  confidence: number;
  reason: string;
  classificationBasis?: string;
  matchedSignatureId?: string | null;
  vendorAttributionBasis?: string | null;
  firstObservedMs: number | null;
  runtimePhase?: "pre_consent" | "post_consent" | "unknown";
  timestampMs?: number | null;
  timingStatus?: "pre_consent" | "post_consent" | "unknown";
  tsMs?: number | null;
  evidenceRefs?: string[];
  evidenceSource?: "observed_request";
  pageUrl?: string | null;
}>;

export type RejectPathDepthAndAvailabilityEvidence = {
  rejectAvailableOnFirstLayer: boolean;
  rejectClickDepth: number | null;
  preferencesRequiredBeforeReject: boolean;
  scrollRequired: boolean;
  rejectInteractionSucceeded: boolean | null;
  acceptClickDepth: number | null;
  choiceAsymmetry: "none" | "minor" | "material" | "unknown";
  evidenceRefs?: string[];
};

export type BotBlockChallengeEvidence = {
  blocked: boolean;
  challengeType: string;
  vendor: string;
  httpStatus: number | null;
  markerMatches: string[];
  confidence: number;
  coverageImpact: "none" | "minor" | "material" | "severe";
  evidenceRefs?: string[];
};

export type ScanNoGoAssessment = {
  status: "available";
  version: "scan-no-go-assessment-v1";
  decision: "no_go" | "continue_with_diagnostics" | "go";
  scanNoGoConfidence: number;
  visualScreenshotNoGoConfidence: number | null;
  reasonCodes: string[];
  corroboratorCodes: string[];
  contradictorCodes: string[];
  supportingSignals: {
    challengeSignalsDetected: boolean;
    consentOrTrackerEvidenceObserved: boolean;
    documentStatusBlocked: boolean;
    domContentLow: boolean;
    expectedOriginReached: boolean;
    firstPartyIdentityObserved: boolean;
    lowRuntimeActivity: boolean;
    retainedVisualArtifactAvailable: boolean;
    visualHardNoGoPageState: boolean;
    visualNoGo: boolean;
    visualPageState: string | null;
  };
  evidenceRefs: string[];
};

export type ScanRuntimeArtifact = {
  scanId: string;
  thirdPartyRequestDomains: string[];
  thirdPartyRequestCount: number;
  initialCookieNames: string[];
  initialCookieDomains: string[];
  initialCookieCount: number;
  scriptSrcDomains: string[];
  scriptTagCount: number;
  responseHeaders: Record<string, string>;
  domStructureHash: string | null;
  domNodeCount: number | null;
  consentAuditCompleted: boolean | null;
  consentRejectInteractionSucceeded: boolean | null;
  consentAcceptInteractionSucceeded: boolean | null;
  consentRejectReducedTracking: boolean | null;
  consentRejectReducedThirdPartyCookies: boolean | null;
  consentBaselineCookieCount: number | null;
  consentBaselineThirdPartyCookieCount: number | null;
  consentPreconsentViolationCount: number | null;
  consentBaselineTrackerEvidenceUrls: string[];
  consentBaselineTrackerVendorNames: string[];
  consentRejectPersistedTrackerVendorNames: string[];
  consentRejectNewTrackerVendorNames: string[];
  consentRejectClickCount: number | null;
  consentAcceptClickCount: number | null;
  consentOptInClicks: number | null;
  consentOptOutClicks: number | null;
  consentBlockerType: "auth_wall" | "external_redirect" | "extra_click_path" | null;
  consentBlockerUrl: string | null;
  consentBlockerPageTitle: string | null;
  consentBlockerTextSnippet: string | null;
  consentEvidencePassCount: number | null;
  consentFrictionDelta: number | null;
  consentRedirectOrAuthRequired: boolean | null;
  consentOptInEvidenceLog: ConsentInteractionEvidenceStep[];
  consentOptOutEvidenceLog: ConsentInteractionEvidenceStep[];
  consentTimeline?: ConsentTimelineEvidence | null;
  requestPurposeClassificationConfidence?: RequestPurposeClassificationConfidence;
  rejectPathDepthAndAvailability?: RejectPathDepthAndAvailabilityEvidence | null;
  botBlockChallengeEvidence?: BotBlockChallengeEvidence | null;
  consentPostRejectCookieCount: number | null;
  consentPostRejectThirdPartyCookieCount: number | null;
  consentPostRejectTrackerEvidenceUrls: string[];
  consentPostRejectTrackerVendorNames: string[];
  consentAcceptNewTrackerVendorNames: string[];
  consentPostAcceptCookieCount: number | null;
  consentPostAcceptThirdPartyCookieCount: number | null;
  consentPostAcceptTrackerEvidenceUrls: string[];
  consentPostAcceptTrackerVendorNames: string[];
  sensitiveFieldEvidence?: SensitiveFieldEvidence[];
  sensitivePayloadViolations: SensitivePayloadViolation[];
  coverageLimitationEvidence?: CoverageLimitationEvidence | null;
  keyPageDiscoverySummary: KeyPageDiscoverySummary | null;
  cookieAttributeSummary?: CookieAttributeSummary | null;
  cpraCbaOptOutEvidence?: CpraCbaOptOutEvidence | null;
  californiaPrivacyEvidence?: CaliforniaPrivacyEvidence | null;
  scanNoGoAssessment?: ScanNoGoAssessment | null;
  gpcVerification?: GpcVerification | null;
  buildPhaseSummaries?: Array<{
    attempts: number;
    completedAt: string;
    durationMs: number;
    error: string | null;
    outcome: "success" | "degraded" | "failed";
    phase:
      | "robots_homepage_setup"
      | "page_discovery_fetch"
      | "browser_runtime_capture"
      | "early_exit_visual_evidence_capture"
      | "policy_enrichment"
      | "runtime_artifact_assembly"
      | "network_snapshot_assembly";
    startedAt: string;
  }>;
};

export type CoverageLimitationEvidence = {
  coverageFlags: string[];
  coverageLevel: string | null;
  explanation: string | null;
  finalUrl: string | null;
  homepageHttpStatus: number | null;
  initialDocumentStatus: string | null;
  finalDocumentStatus: string | null;
  originLikelyReached: boolean | null;
  pageAccessBlocked: boolean;
  requestedPageCount: number | null;
  scannedPageCount: number | null;
  runtimeSignalsRetained: {
    cookieCount: number | null;
    preconsentEvidenceUrlCount: number;
    requestDomainSamples: string[];
    scriptTagCount: number;
    thirdPartyRequestCount: number;
    trackerVendorSamples: string[];
  };
  challengeLikeSignalsDetected: boolean | null;
  timedOut: boolean | null;
};

export type SensitiveFieldEvidence = {
  autocomplete: string | null;
  confidence: "strong" | "medium" | "weak";
  dataType:
    | "email"
    | "phone"
    | "password"
    | "payment_card"
    | "ssn"
    | "government_id"
    | "health_information"
    | "financial_information"
    | "geolocation";
  fieldType: string | null;
  formAction: string | null;
  inputId: string | null;
  inputName: string | null;
  labelText: string | null;
  matchSnippet: string;
  nearbyText: string | null;
  pageUrl: string | null;
  placeholder: string | null;
  signalKey: string;
};

export type SensitivePayloadViolation = {
  detectedType:
    | "email_detected"
    | "phone_detected"
    | "postal_code_detected"
    | "precise_geolocation_detected"
    | "date_of_birth_detected"
    | "password_field_detected"
    | "payment_card_field_detected"
    | "ssn_detected"
    | "insurance_member_id_detected"
    | "health_condition_detected"
    | "full_name_detected"
    | "precise_address_detected";
  evidenceSource?:
    | "request_payload"
    | "sensitive_field_session_replay_correlation"
    | "sensitive_field_third_party_tracking_correlation";
  evidenceStrength: "confirmed" | "suspected" | "form_field_signal";
  matchSnippet: string;
  pageUrl?: string | null;
  requestMethod: string;
  requestUrl: string;
  sourceField: string | null;
  sourceLocation: "request_body" | "url_query" | "form_field";
  sourcePattern: "generic_pattern" | "keyed_field" | "sensitive_field_evidence";
  timestamp: string;
  vendorHost: string | null;
  vendorName?: string | null;
};

export type PolicyMention = {
  confidence: number;
  topic: string;
};

export type PolicyRetentionPeriod = {
  category: string;
  confidence: number;
  periodText: string;
  snippetHash: string | null;
};

export type PolicyTransferMechanism = {
  confidence: number;
  mechanism: string;
  snippetHash: string | null;
};

export type PolicyCookieDisclosure = {
  confidence: number;
  cookieName: string | null;
  duration: string | null;
  provider: string | null;
  purpose: string | null;
  snippetHash: string | null;
};

export type PolicyEnrichment = {
  id: string;
  scanId: string;
  pageType: string | null;
  pageUrl: string;
  normalizedPolicyHash: string;
  policySummaryShort: string | null;
  policyEffectiveDate: string | null;
  policyGoverningLaw: string | null;
  policyArbitrationPresent: boolean | null;
  policyNoticeContactPresent: boolean | null;
  policyTerminationOrSuspensionPresent: boolean | null;
  policyCancellationOrRefundPresent: boolean | null;
  privacyContactChannelType: PrivacyContactChannelType | null;
  policyRetentionDisclosure: PolicyRetentionDisclosure | null;
  policyClaimNoSale: boolean | null;
  policyClaimNoTracking: boolean | null;
  policyClaimPrivacyProtective: boolean | null;
  policyMentions: PolicyMention[];
  policyDataCategories: string[];
  policyCookieDisclosures?: PolicyCookieDisclosure[];
  policyRetentionPeriods: PolicyRetentionPeriod[];
  policyDsarMechanism: PolicyDsarMechanism;
  policyDsarConfidence: number | null;
  policyDoNotSell: PolicyDoNotSell;
  policyDoNotSellConfidence: number | null;
  policySubprocessorsListed: boolean | null;
  policyTransferMechanisms: PolicyTransferMechanism[];
  policyChildrenReference: PolicyChildrenReference;
  policyAmbiguityScore: number | null;
  policyBehaviorConflictCandidate: boolean | null;
  policyActionableFlags: string[];
  policyEvidenceSnippets: Record<string, string | string[] | null>;
  policyFieldCoverage: Record<string, { confidence: number | null; found: boolean; snippetHash: string | null }>;
  policyCoverageRatio: number | null;
  policySnippetCount: number | null;
  policyStructurallyWeak: boolean | null;
  policySemanticConfidence: number | null;
  policyAiModel: string | null;
  policyAiModelVersion: string | null;
  policyAiPromptVersion: string | null;
  policyAiRunAt: string | null;
  archiveSource: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type PolicyEvidence = {
  evidenceHash: string;
  snippet: string;
  sourcePageUrl: string | null;
  snippetLocation: string | null;
  createdAt?: string;
};

export type PolicyReviewQueueStatus = "pending" | "in_review" | "resolved" | "dismissed";
export type PolicyReviewVerdict = "confirmed" | "dismissed" | "needs_followup" | "needs_legal_review" | "unknown";

export type PolicyReviewQueueItem = {
  id: string;
  policyEnrichmentId: string;
  scanId: string;
  reason: string;
  createdAt?: string;
  assignedTo: string | null;
  reviewStatus: PolicyReviewQueueStatus;
  reviewerNotes: string | null;
  reviewedAt: string | null;
  reviewVerdict: PolicyReviewVerdict | null;
};

export type ComplianceChangeEvent = {
  eventId?: string;
  organizationId?: string;
  domainId?: string;
  domain: string;
  scanIdCurrent: string;
  scanIdPrevious: string | null;
  eventTimestamp: string;
  eventType: ComplianceChangeEventType;
  fieldName: string | null;
  oldValueText: string | null;
  newValueText: string | null;
  severity: ChangeEventSeverity;
  confidence: number;
  eventGroup: ChangeEventGroup;
};

export type SnapshotSignalItem = {
  category: "accessibility" | "privacy" | "disclosure" | "security" | "commerce" | "context";
  key: string;
  label: string;
  primaryCategory: import("../taxonomy/signal-taxonomy").PrimaryScanCategoryId;
  primaryCategoryLabel: string;
  subcategory: string | null;
  regulatoryTags: import("../taxonomy/signal-taxonomy").RegulatoryTag[];
  value: boolean | number | string | string[];
};
