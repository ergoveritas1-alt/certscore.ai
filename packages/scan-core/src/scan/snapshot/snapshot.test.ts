import assert from "node:assert/strict";
import test from "node:test";
import { buildAgencyMappings, buildRegulatoryRiskAssessment, projectSnapshotSignals, type ScanSnapshot } from "@website-signal-risk-scanner/shared";
import { classifyScanAccess } from "../access-classification";
import {
  assessPolicyPageContentQuality,
  deriveAdvertisingClassification,
  deriveAiInfrastructureSignals,
  buildAccessibilitySummary,
  buildPageMetadata,
  consentSignatureHash,
  deriveFormSignals,
  deriveExpandedCommercialSignals,
  deriveGovernanceSignals,
  derivePolicySignals,
  detectCmpVendorFromPage,
  detectTrackerVendorsFromStaticPage,
  discoverCandidatePages,
  policyPresenceHash
} from "./extractors";
import { derivePolicyTermsConflictDetected, inferConsentDarkPatternFlags } from "./build-snapshot-bundle";
import { classifyConsentButtonRole } from "./consent-ui";
import { diffSnapshots } from "./diff-snapshots";
import {
  deriveInfrastructureChangeSignals,
  derivePolicyBehaviorConflictDetected,
  deriveSecurityHeadersScore,
  deriveTrackingBeforeConsentDetected
} from "./score-snapshot";
import {
  getCachedDnsSignals,
  getCachedDomainRegistration,
  getCachedTlsMetadata,
  getCoverageTargetTypes,
  hasCoverageForTargetTypes,
  prioritizeUncoveredTargets
} from "./scan-optimization";
import { shouldContinueRuntimeWait } from "./browser-stability";
import type { StaticPageResult } from "./types";

function makePage(overrides: Partial<StaticPageResult> = {}): StaticPageResult {
  return {
    pageUrl: "https://example.com/",
    pageType: "homepage",
    fetchStatus: "ok",
    finalUrl: "https://example.com/",
    headers: {},
    html: "",
    language: "en",
    links: [],
    redirected: false,
    scripts: [],
    statusCode: 200,
    textContent: "",
    title: null,
    forms: [],
    ...overrides
  };
}

function makeSnapshot(overrides: Partial<ScanSnapshot> = {}): ScanSnapshot {
  return {
    scanId: "scan-current",
    scannerSchemaVersion: 1,
    detectionEngineVersion: "heuristic-v1",
    organizationId: "org-1",
    domainId: "domain-1",
    policyEnrichmentId: null,
    domain: "example.com",
    pagesRequested: 5,
    pagesScanned: 5,
    totalSignals: 6,
    accessibilitySignalCount: 2,
    privacySignalCount: 2,
    disclosureSignalCount: 2,
    highSeverityCount: 1,
    mediumSeverityCount: 2,
    lowSeverityCount: 1,
    trackerVendorCount: 1,
    registeredDomain: "example.com",
    scanTimestamp: "2026-03-08T00:00:00.000Z",
    crawlSource: "manual",
    crawlTier: "standard",
    robotsAllowed: true,
    robotsFetchStatus: "ok",
    robotsFetchHttpStatus: 200,
    robotsTxtHash: "robots-hash-a",
    robotsCrawlDelayMs: 2000,
    robotsRulesLoaded: true,
    robotsGroupCount: 1,
    robotsDirectiveCount: 1,
    robotsHasAllowRules: true,
    robotsHasDisallowRules: false,
    robotsTxtFetchedAt: "2026-03-08T00:00:00.000Z",
    robotsTxtUrl: "https://example.com/robots.txt",
    authWallDetected: false,
    homepageFetchStatus: "ok",
    homepageFetchHttpStatus: 200,
    finalUrl: "https://example.com/",
    finalUrlScheme: "https",
    redirectCount: 0,
    renderModeUsed: "http_then_browser",
    scanConfidence: "high",
    partialScan: false,
    timeoutFlag: false,
    blockedFlag: false,
    captchaFlag: false,
    siteLanguagePrimary: "en",
    countryInferred: "US",
    regionStateInferred: null,
    jurisdictionGuess: "us",
    euExposureLikely: false,
    californiaExposureLikely: false,
    childrenAudienceLikely: false,
    kidDirectedContentDetected: false,
    healthcareSiteLikely: false,
    financialServicesSiteLikely: false,
    ecommerceSiteLikely: false,
    saasSiteLikely: true,
    educationSiteLikely: false,
    multilingualSite: false,
    mobileAppLinksDetected: false,
    privacyPolicyPresent: true,
    termsOfServicePresent: true,
    cookiePolicyPresent: true,
    accessibilityStatementPresent: false,
    refundPolicyPresent: false,
    shippingPolicyPresent: false,
    subscriptionTermsPresent: false,
    affiliateDisclosurePresent: false,
    advertisingDisclosurePresent: false,
    contactPagePresent: true,
    privacyContactMethodPresent: true,
    doNotSellLinkPresent: false,
    dsarRequestMechanismPresent: false,
    subprocessorListPresent: false,
    legalEntityNameDetected: false,
    physicalBusinessAddressPresent: false,
    emailContactPublicPresent: true,
    phoneNumberPublicPresent: false,
    privacyEmailSpecificPresent: true,
    dpoReferencePresent: false,
    dpoEmailDetected: false,
    entityJurisdictionDetected: null,
    supervisoryAuthorityReferencePresent: false,
    privacyPolicyHash: "hash-a",
    termsPolicyHash: "hash-b",
    cookiePolicyHash: "hash-c",
    legalPagesPresenceHash: "hash-d",
    privacyPolicyLastUpdatedFound: null,
    privacyPolicyLastUpdatedDate: null,
    privacyPolicyWordCount: 1200,
    privacyPolicyComplexityScore: 44,
    privacyLanguageReadabilityScore: 56,
    policyChangeFrequencyScore: null,
    policyUpdateLagDays: null,
    mentionsGdpr: true,
    mentionsCcpaOrCpra: false,
    mentionsCoppa: false,
    mentionsUnder13: false,
    mentionsUnder16: false,
    mentionsSensitiveData: false,
    mentionsBiometricData: false,
    mentionsHealthData: false,
    mentionsFinancialData: false,
    mentionsLocationData: false,
    mentionsDataRetention: true,
    dataRetentionSpecificPeriodDetected: false,
    mentionsDataSaleOrSharing: false,
    mentionsCrossBorderTransfer: false,
    crossBorderTransferMechanismDetected: false,
    mentionsSubprocessorsOrVendors: false,
    mentionsAutomatedDecisioning: false,
    mentionsAiUsage: false,
    doubleOptInReferencePresent: false,
    thirdPartyDisclosureSpecificity: "generic",
    cookieBannerPresent: true,
    consentMechanismType: "cmp",
    cmpVendorName: "OneTrust",
    cmpVendorConfidence: 0.95,
    consentInteractionModel: "accept_preferences",
    consentAcceptButtonCount: 1,
    consentRejectButtonCount: 0,
    consentPreferencesButtonCount: 1,
    rejectAllPresent: false,
    acceptAllPresent: true,
    granularPreferencesPresent: true,
    preconsentTrackingDetected: false,
    cookiePolicyLinkedFromBanner: true,
    consentModeDetected: false,
    darkPatternAcceptEmphasis: false,
    darkPatternRejectHidden: false,
    darkPatternRejectButtonMissing: false,
    darkPatternAcceptButtonProminence: false,
    precheckedConsentBoxes: false,
    darkPatternForcedConsentWall: false,
    darkPatternAcceptOnlyBanner: false,
    darkPatternDismissWithoutReject: false,
    darkPatternCountdownTimerPresent: false,
    darkPatternFakeScarcityLanguage: false,
    consentSignatureHash: "consent-a",
    consentPersistenceMechanismDetected: true,
    consentBannerLayoutType: "modal",
    consentBannerPosition: "modal",
    defaultTrackingState: "tracking_disabled",
    cookieCategoryCount: 3,
    consentMaturityScore: 70,
    trackerCountTotal: 1,
    analyticsTrackerCount: 1,
    advertisingTrackerCount: 0,
    socialTrackerCount: 0,
    sessionReplayTrackerCount: 0,
    tagManagerPresent: false,
    firstPartyAnalyticsOnly: true,
    adtechStackComplexityScore: 8,
    fingerprintingOrIdentityVendorDetected: false,
    trackerVendorSetHash: "tracker-a",
    trackerCategorySetHash: "tracker-cat-a",
    trackerVendorConcentrationScore: 100,
    trackerDiversityScore: 20,
    thirdPartyScriptDomainCount: 1,
    thirdPartyScriptRiskScore: 10,
    thirdPartyDataFlowRiskScore: 6,
    trackerRegulatoryRiskScore: 20,
    trackerAdoptionChangeDetected: null,
    cookieCountTotal: 1,
    thirdPartyCookieCount: 0,
    firstPartyCookieSetBeforeConsent: false,
    thirdPartyCookieSetBeforeConsent: false,
    trackingBeforeConsentDetected: false,
    formCountTotal: 1,
    contactFormPresent: true,
    newsletterSignupPresent: false,
    accountSignupPresent: false,
    loginPagePresent: false,
    passwordResetPresent: false,
    checkoutOrPaymentFormPresent: false,
    fileUploadFieldPresent: false,
    emailInputPresent: true,
    phoneInputPresent: false,
    addressInputPresent: false,
    paymentCardInputPresent: false,
    dateOfBirthInputPresent: false,
    formCollectsSsn: false,
    formCollectsGovernmentId: false,
    formCollectsHealthInformation: false,
    formCollectsFinancialInformation: false,
    formCollectsBirthdate: false,
    formCollectsGeolocation: false,
    ageGatePresent: false,
    ageVerificationMechanismType: "none",
    parentalConsentReferencePresent: false,
    sensitiveDataFormHintsPresent: false,
    formsSignatureHash: "forms-a",
    piiCollectionRiskScore: 12,
    formDataSensitivityScore: 8,
    dataMinimizationScore: 84,
    highSensitivityDataCollectionDetected: false,
    privacyRequestFormPresent: false,
    dataAccessRequestPresent: false,
    dataDeletionRequestPresent: false,
    privacyContactChannelType: "email",
    consentWithdrawalMechanismPresent: true,
    userRightsFrictionScore: 10,
    wcagErrorCountTotal: 3,
    wcagWarningCountTotal: 0,
    wcagContrastFailuresCount: 1,
    wcagMissingAltCount: 2,
    wcagFormLabelErrorCount: 0,
    wcagAriaErrorCount: 0,
    wcagHeadingStructureErrorCount: 0,
    wcagLinkNameErrorCount: 0,
    wcagKeyboardNavigationIssueCount: 0,
    wcagFocusIndicatorIssueCount: 0,
    wcagLandmarkIssueCount: 0,
    accessibilityWidgetPresent: false,
    accessibilityWidgetVendor: null,
    vpatOrAccessibilityConformanceDocPresent: false,
    accessibilityContactMethodPresent: true,
    accessibilitySignatureHash: "a11y-a",
    accessibilityScoreAutomated: 91,
    wcagLevelClaimed: "unknown",
    accessibilityRemediationLikely: false,
    accessibilityClaimAccuracyScore: 91,
    accessibilityClaimMismatchDetected: false,
    accessibilityLitigationRiskScore: 18,
    adaDemandLetterProbability: 18,
    subscriptionOfferDetected: false,
    autoRenewDisclosurePresent: false,
    autoRenewalDisclosurePresent: false,
    subscriptionCancellationPolicyPresent: false,
    cancellationPolicyPresent: false,
    unsubscribeMechanismPresent: false,
    freeTrialDetected: false,
    discountClaimPresent: false,
    originalPriceComparisonPresent: false,
    limitedTimeOfferLanguagePresent: false,
    refundOrReturnWindowDetected: false,
    refundPolicyWindowDays: null,
    refundPolicyConditionsPresent: false,
    refundRequestMethodPresent: false,
    storeCreditOnlyPolicyPresent: false,
    exchangePolicyPresent: false,
    shippingTermsDetected: false,
    renewalNoticePeriodPresent: false,
    terminationForCauseClausePresent: false,
    accountDeletionTermsPresent: false,
    serviceSuspensionOrTerminationTermsPresent: false,
    disputeResolutionOrArbitrationPresent: false,
    testimonialOrReviewDisclosurePresent: false,
    adNetworkGoogleAds: false,
    adNetworkMetaAds: false,
    retargetingPixelDetected: false,
    sessionReplayToolDetected: false,
    aiChatbotPresent: false,
    aiChatbotVendor: null,
    aiAssistantWidgetDetected: false,
    aiDisclosureTextPresent: false,
    aiTermsOrPolicyAiReference: false,
    aiHelpCenterAiReference: false,
    aiSearchOrAnswerExperienceDetected: false,
    aiHiringAutomationSignalDetected: false,
    securityTxtPresent: false,
    vulnerabilityDisclosurePagePresent: false,
    trustCenterPresent: false,
    incidentStatusPagePresent: false,
    responsibleDisclosurePresent: false,
    bugBountyProgramPresent: false,
    hstsEnabled: true,
    httpsEnforced: true,
    mixedContentDetected: false,
    lawEnforcementRequestPolicyPresent: false,
    transparencyReportPresent: false,
    transparencyScore: 25,
    cspHeaderPresent: true,
    xFrameOptionsPresent: true,
    referrerPolicyPresent: true,
    permissionsPolicyPresent: false,
    cspReportEndpointPresent: false,
    securityHeadersScore: 60,
    tlsVersionMinSupported: "TLSv1.3",
    certificateAuthority: "Let's Encrypt",
    certificateValidDaysRemaining: 42,
    certificateAutoRenewLikely: true,
    dnssecEnabled: false,
    spfRecordPresent: true,
    dmarcRecordPresent: true,
    dkimRecordDetected: false,
    cmsPlatform: "WordPress",
    ecommercePlatform: null,
    frontendFramework: "Next.js",
    hostingOrCdnProvider: "Cloudflare",
    cdnProvider: "Cloudflare",
    edgeSecurityProvider: "Cloudflare",
    tagManagerVendor: null,
    paymentProcessorHints: [],
    chatSupportVendor: null,
    serviceWorkerDetected: true,
    publicApiEndpointDetected: true,
    siteSizeHint: "medium",
    homepageStructuredHash: "home-a",
    digitalMaturityScore: 68,
    domainRegistrationYear: 2016,
    domainAgeYears: 10,
    domainPrivacyProtectionEnabled: false,
    trafficTierEstimate: "medium",
    requestDomainSetChanged: null,
    scriptDomainSetChanged: null,
    securityHeaderPostureChanged: null,
    infrastructureChangeDetected: null,
    policyBehaviorConflictDetected: false,
    policyTermsConflictDetected: false,
    privacyCookiePolicyConflictDetected: false,
    sessionReplayWithoutDisclosureDetected: false,
    accessibilityClaimVsRealityGapDetected: false,
    complianceTrendScore: null,
    certscoreOverall: 80,
    privacyScore: 82,
    consentScore: 78,
    trackerRiskScore: 12,
    accessibilityScore: 91,
    dataCollectionRiskScore: 18,
    consumerProtectionScore: 80,
    childrenPrivacyRiskScore: 0,
    legalCoverageScore: 56,
    complianceMaturityTier: "mature",
    regulatoryExposureScore: 22,
    ...overrides
  };
}

test("discoverCandidatePages prioritizes legal and contact routes", () => {
  const candidates = discoverCandidatePages("https://example.com/", [
    { href: "https://example.com/privacy-policy", text: "Privacy" },
    { href: "https://example.com/contact", text: "Contact" },
    { href: "https://example.com/pricing", text: "Pricing" }
  ]);

  assert.ok(candidates.some((page) => page.pageType === "privacy_policy"));
  assert.ok(candidates.some((page) => page.pageType === "contact"));
  assert.ok(candidates.some((page) => page.pageType === "terms_of_service"));
});

test("discoverCandidatePages keeps linked external legal pages", () => {
  const candidates = discoverCandidatePages("https://www.howtogeek.com/", [
    { href: "https://www.valnetinc.com/en/privacy-policy", text: "Privacy" },
    { href: "https://www.valnetinc.com/en/terms-of-use", text: "Terms" },
    { href: "https://cdn.example.com/support", text: "Support" }
  ]);

  assert.ok(candidates.some((page) => page.url === "https://www.valnetinc.com/en/privacy-policy" && page.pageType === "privacy_policy"));
  assert.ok(candidates.some((page) => page.url === "https://www.valnetinc.com/en/terms-of-use" && page.pageType === "terms_of_service"));
  assert.ok(!candidates.some((page) => page.url === "https://cdn.example.com/support"));
});

test("derivePolicySignals extracts policy flags from normalized text", () => {
  const signals = derivePolicySignals([
    makePage({
      pageType: "privacy_policy",
      textContent:
        "Last updated January 1, 2026. We comply with GDPR. You may request access or delete your data. Contact privacy@example.com. We retain personal data for analytics vendors."
    }),
    makePage({
      pageType: "terms_of_service",
      textContent: "Dispute resolution and arbitration apply."
    })
  ]);

  assert.equal(signals.mentionsGdpr, true);
  assert.equal(signals.dsarRequestMechanismPresent, true);
  assert.equal(signals.privacyEmailSpecificPresent, true);
  assert.ok(signals.privacyPolicyHash);
});

test("derivePolicyTermsConflictDetected flags no-tracking claims contradicted by other policy text", () => {
  const conflictDetected = derivePolicyTermsConflictDetected({
    policyEnrichments: [
      {
        pageType: "privacy_policy",
        policyClaimNoTracking: true
      }
    ],
    policyPages: [
      makePage({
        pageType: "privacy_policy",
        textContent: "We do not track users across websites."
      }),
      makePage({
        pageType: "cookie_policy",
        textContent: "We use cookies, analytics, advertising pixels, and session replay tools."
      })
    ]
  });

  assert.equal(conflictDetected, true);
});

test("derivePolicySignals sanitizes noisy policy update dates", () => {
  const signals = derivePolicySignals([
    makePage({
      pageType: "privacy_policy",
      textContent:
        "Effective date: January 1, 2026 To download and/or print this policy, use your browser controls."
    })
  ]);

  assert.equal(signals.privacyPolicyLastUpdatedFound, "2026-01-01");
  assert.equal(signals.privacyPolicyLastUpdatedDate, "2026-01-01");
});

test("assessPolicyPageContentQuality flags thin shell-like legal pages for rendered fallback", () => {
  const quality = assessPolicyPageContentQuality(
    makePage({
      pageType: "privacy_policy",
      html: '<html><body><div id="__next"></div><script type="module" src="/app.js"></script></body></html>',
      textContent: "Loading..."
    })
  );

  assert.equal(quality.eligibleForRenderedFallback, true);
  assert.equal(quality.insufficientContent, true);
  assert.equal(quality.shellMarkerDetected, true);
});

test("assessPolicyPageContentQuality does not flag substantive legal pages", () => {
  const quality = assessPolicyPageContentQuality(
    makePage({
      pageType: "privacy_policy",
      html: "<html><body>Privacy policy body</body></html>",
      textContent: `${"We collect, use, retain, and disclose personal information as described in this privacy policy. ".repeat(20)}`
    })
  );

  assert.equal(quality.insufficientContent, false);
  assert.ok(quality.wordCount >= 120);
});

test("projectSnapshotSignals surfaces explicit access limitation signals", () => {
  const signals = projectSnapshotSignals(
    makeSnapshot({
      robotsAllowed: false,
      homepageFetchStatus: "forbidden",
      homepageFetchHttpStatus: 403,
      captchaFlag: true,
      authWallDetected: true,
      partialScan: true
    }),
    []
  );

  const keys = new Set(signals.map((signal) => signal.key));

  assert.ok(keys.has("context.access_blocked_by_robots"));
  assert.ok(keys.has("context.access_http_forbidden"));
  assert.ok(keys.has("context.access_bot_challenge_detected"));
  assert.ok(keys.has("context.access_auth_wall_detected"));
  assert.ok(keys.has("context.access_partial_scan"));
});

test("projectSnapshotSignals surfaces accessibility gap fillers and new consumer transparency signals", () => {
  const signals = projectSnapshotSignals(
    makeSnapshot({
      wcagFormLabelErrorCount: 3,
      wcagAriaErrorCount: 2,
      wcagLinkNameErrorCount: 1,
      wcagKeyboardNavigationIssueCount: 4,
      wcagFocusIndicatorIssueCount: 2,
      wcagLandmarkIssueCount: 1,
      vpatOrAccessibilityConformanceDocPresent: true,
      accessibilityContactMethodPresent: true,
      wcagLevelClaimed: "AA",
      discountClaimPresent: true,
      originalPriceComparisonPresent: true,
      limitedTimeOfferLanguagePresent: true,
      refundPolicyWindowDays: 30,
      refundPolicyConditionsPresent: true,
      refundRequestMethodPresent: true,
      storeCreditOnlyPolicyPresent: true,
      exchangePolicyPresent: true,
      renewalNoticePeriodPresent: true,
      terminationForCauseClausePresent: true,
      accountDeletionTermsPresent: true,
      serviceSuspensionOrTerminationTermsPresent: true,
      policyTermsConflictDetected: true,
      privacyCookiePolicyConflictDetected: true
    }),
    []
  );

  const keys = new Set(signals.map((signal) => signal.key));

  assert.ok(keys.has("accessibility.wcag_form_label_error_count"));
  assert.ok(keys.has("accessibility.wcag_aria_error_count"));
  assert.ok(keys.has("accessibility.wcag_link_name_error_count"));
  assert.ok(keys.has("accessibility.wcag_keyboard_navigation_issue_count"));
  assert.ok(keys.has("accessibility.wcag_focus_indicator_issue_count"));
  assert.ok(keys.has("accessibility.wcag_landmark_issue_count"));
  assert.ok(keys.has("accessibility.vpat_or_accessibility_conformance_doc_present"));
  assert.ok(keys.has("accessibility.accessibility_contact_method_present"));
  assert.ok(keys.has("accessibility.wcag_level_claimed"));
  assert.ok(keys.has("commerce.discount_claim_present"));
  assert.ok(keys.has("commerce.original_price_comparison_present"));
  assert.ok(keys.has("commerce.limited_time_offer_language_present"));
  assert.ok(keys.has("commerce.refund_policy_window_days"));
  assert.ok(keys.has("commerce.refund_policy_conditions_present"));
  assert.ok(keys.has("commerce.refund_request_method_present"));
  assert.ok(keys.has("commerce.store_credit_only_policy_present"));
  assert.ok(keys.has("commerce.exchange_policy_present"));
  assert.ok(keys.has("commerce.renewal_notice_period_present"));
  assert.ok(keys.has("commerce.termination_for_cause_clause_present"));
  assert.ok(keys.has("commerce.account_deletion_terms_present"));
  assert.ok(keys.has("commerce.service_suspension_or_termination_terms_present"));
  assert.ok(keys.has("context.policy_terms_conflict_detected"));
  assert.ok(keys.has("context.privacy_cookie_policy_conflict_detected"));
});

test("classifyScanAccess reports blocked legal coverage without treating it as policy weakness", () => {
  const classification = classifyScanAccess({
    snapshot: makeSnapshot({
      homepageFetchStatus: "forbidden",
      homepageFetchHttpStatus: 403,
      captchaFlag: true,
      partialScan: true
    }),
    runtimeArtifacts: {
      scanId: "scan-current",
      thirdPartyRequestDomains: [],
      thirdPartyRequestCount: 0,
      initialCookieNames: [],
      initialCookieDomains: [],
      initialCookieCount: 0,
      scriptSrcDomains: [],
      scriptTagCount: 0,
      responseHeaders: {
        "cf-mitigated": "challenge",
        server: "cloudflare"
      },
      domStructureHash: null,
      domNodeCount: null,
      consentAuditCompleted: null,
      consentRejectInteractionSucceeded: null,
      consentAcceptInteractionSucceeded: null,
      consentRejectReducedTracking: null,
      consentRejectReducedThirdPartyCookies: null,
      consentBaselineCookieCount: null,
      consentBaselineThirdPartyCookieCount: null,
      consentPreconsentViolationCount: null,
      consentBaselineTrackerEvidenceUrls: [],
      consentBaselineTrackerVendorNames: [],
      consentRejectPersistedTrackerVendorNames: [],
      consentRejectNewTrackerVendorNames: [],
      consentRejectClickCount: null,
      consentAcceptClickCount: null,
      consentPostRejectCookieCount: null,
      consentPostRejectThirdPartyCookieCount: null,
      consentPostRejectTrackerEvidenceUrls: [],
      consentPostRejectTrackerVendorNames: [],
      consentAcceptNewTrackerVendorNames: [],
      consentPostAcceptCookieCount: null,
      consentPostAcceptThirdPartyCookieCount: null,
      consentPostAcceptTrackerEvidenceUrls: [],
      consentPostAcceptTrackerVendorNames: []
    },
    pages: [
      {
        scanId: "scan-current",
        pageType: "privacy_policy",
        pageUrl: "https://example.com/privacy",
        fetchStatus: "forbidden",
        fetchedVia: "http",
        normalizedContentHash: null,
        titleHash: null,
        pageLanguage: "en"
      }
    ]
  });

  assert.ok(classification);
  assert.deepEqual(classification?.codes, [
    "access.http_forbidden",
    "access.bot_challenge_detected",
    "access.legal_pages_limited",
    "access.partial_scan"
  ]);
  const challengeHeaders = classification?.metadata.challengeHeaders as { cfMitigated?: string | null } | undefined;
  assert.equal(challengeHeaders?.cfMitigated, "challenge");
});

test("deriveTrackingBeforeConsentDetected respects browser-session evidence", () => {
  assert.equal(
    deriveTrackingBeforeConsentDetected({
      browserSessionUsable: true,
      firstPartyCookieSetBeforeConsent: false,
      thirdPartyCookieSetBeforeConsent: true,
      trackerCount: 0
    }),
    true
  );
  assert.equal(
    deriveTrackingBeforeConsentDetected({
      browserSessionUsable: false,
      firstPartyCookieSetBeforeConsent: true,
      thirdPartyCookieSetBeforeConsent: true,
      trackerCount: 2
    }),
    null
  );
});

test("detectTrackerVendorsFromStaticPage leaves consent timing unknown", () => {
  const trackers = detectTrackerVendorsFromStaticPage({
    pageHostname: "example.com",
    pageText: "Google Analytics is configured",
    scanId: "scan-1",
    scripts: [
      {
        src: "https://www.googletagmanager.com/gtag/js?id=GA-123",
        host: "www.googletagmanager.com",
        contentSample: null
      }
    ]
  });

  assert.ok(trackers.length > 0);
  assert.equal(trackers[0]?.beforeConsent, null);
});

test("derivePolicyBehaviorConflictDetected flags observable policy/runtime mismatch", () => {
  assert.equal(
    derivePolicyBehaviorConflictDetected({
      advertisingTrackerCount: 2,
      californiaExposureLikely: true,
      doNotSellLinkPresent: false,
      mentionsDataSaleOrSharing: true,
      preconsentTrackingDetected: true,
      privacyPolicyPresent: true,
      sessionReplayTrackerCount: 0
    }),
    true
  );
  assert.equal(
    derivePolicyBehaviorConflictDetected({
      advertisingTrackerCount: 0,
      californiaExposureLikely: false,
      doNotSellLinkPresent: false,
      mentionsDataSaleOrSharing: false,
      preconsentTrackingDetected: false,
      privacyPolicyPresent: true,
      sessionReplayTrackerCount: 0
    }),
    false
  );
});

test("deriveSecurityHeadersScore uses additive header presence scoring", () => {
  assert.equal(
    deriveSecurityHeadersScore({
      cspHeaderPresent: true,
      xFrameOptionsPresent: true,
      referrerPolicyPresent: false,
      permissionsPolicyPresent: true,
      hstsEnabled: true
    }),
    80
  );
});

test("deriveInfrastructureChangeSignals splits aggregate infra churn into sub-signals", () => {
  const signals = deriveInfrastructureChangeSignals({
    currentRequestDomains: ["a.example", "b.example"],
    currentScriptDomains: ["scripts.example"],
    currentResponseHeaders: {
      server: "edge-a",
      "content-security-policy": "default-src 'self'"
    },
    previousRequestDomains: ["a.example"],
    previousScriptDomains: ["legacy-scripts.example"],
    previousResponseHeaders: {
      server: "edge-b"
    }
  });

  assert.equal(signals.requestDomainSetChanged, true);
  assert.equal(signals.scriptDomainSetChanged, true);
  assert.equal(signals.securityHeaderPostureChanged, true);
  assert.equal(signals.infrastructureChangeDetected, true);
});

test("enrichment cache helpers reuse only fresh prior snapshot data", () => {
  const freshSnapshot = makeSnapshot({
    scanTimestamp: "2026-03-09T07:00:00.000Z"
  });
  const staleSnapshot = makeSnapshot({
    scanTimestamp: "2026-03-06T00:00:00.000Z"
  });
  const now = Date.parse("2026-03-09T12:00:00.000Z");

  assert.deepEqual(getCachedDnsSignals(freshSnapshot, now), {
    dnssecEnabled: false,
    spfRecordPresent: true,
    dmarcRecordPresent: true,
    dkimRecordDetected: false
  });
  assert.equal(getCachedDnsSignals(staleSnapshot, now), null);
  assert.deepEqual(getCachedTlsMetadata(freshSnapshot, now), {
    tlsVersionMinSupported: "TLSv1.3",
    certificateAuthority: "Let's Encrypt",
    certificateValidDaysRemaining: 42,
    certificateAutoRenewLikely: true
  });
  assert.deepEqual(getCachedDomainRegistration(freshSnapshot, now), {
    domainRegistrationYear: 2016,
    domainPrivacyProtectionEnabled: false
  });
});

test("agency mapping ranks GDPR relevance highest for consent-heavy privacy signals", () => {
  const mappings = buildAgencyMappings({
    trackingBeforeConsentDetected: true,
    thirdPartyCookieSetBeforeConsent: true,
    cookieBannerPresent: true,
    rejectAllPresent: false,
    granularPreferencesPresent: false,
    mentionsGdpr: true
  });

  assert.equal(mappings[0]?.agencyKey, "gdpr_edpb");
  assert.equal(mappings[0]?.relevanceLevel, "high");
});

test("agency mapping ranks CPPA highly for California rights and opt-out gaps", () => {
  const mappings = buildAgencyMappings({
    californiaExposureLikely: true,
    doNotSellLinkPresent: false,
    dataDeletionRequestPresent: false,
    dataAccessRequestPresent: false,
    privacyRequestFormPresent: false,
    dsarRequestMechanismPresent: false,
    advertisingTrackerCount: 3,
    mentionsDataSaleOrSharing: true
  });

  assert.equal(mappings[0]?.agencyKey, "cppa");
  assert.equal(mappings[0]?.relevanceLevel, "high");
});

test("agency mapping ranks FTC highest for disclosure and consumer-protection conflicts", () => {
  const mappings = buildAgencyMappings({
    policyBehaviorConflictDetected: true,
    sessionReplayWithoutDisclosureDetected: true,
    advertisingTrackerCount: 4,
    affiliateDisclosurePresent: false,
    advertisingDisclosurePresent: false,
    consumerProtectionScore: 75
  });

  assert.equal(mappings[0]?.agencyKey, "ftc");
  assert.equal(mappings[0]?.relevanceLevel, "high");
});

test("agency mapping ranks DOJ highest for accessibility-heavy public-facing sites", () => {
  const mappings = buildAgencyMappings({
    wcagErrorCountTotal: 34,
    wcagMissingAltCount: 12,
    wcagFormLabelErrorCount: 5,
    wcagKeyboardNavigationIssueCount: 4,
    accessibilityClaimMismatchDetected: true,
    accessibilityLitigationRiskScore: 62,
    adaDemandLetterProbability: 58,
    ecommerceSiteLikely: true
  });

  assert.equal(mappings[0]?.agencyKey, "doj_ada");
  assert.equal(mappings[0]?.relevanceLevel, "high");
});

test("agency mapping returns a sensible mixed-agency ranking", () => {
  const mappings = buildAgencyMappings({
    trackingBeforeConsentDetected: true,
    rejectAllPresent: false,
    cookieBannerPresent: true,
    californiaExposureLikely: true,
    doNotSellLinkPresent: false,
    policyBehaviorConflictDetected: true,
    sessionReplayWithoutDisclosureDetected: true,
    wcagErrorCountTotal: 28,
    wcagMissingAltCount: 8,
    accessibilityClaimMismatchDetected: true,
    accessibilityLitigationRiskScore: 50
  });

  assert.ok(mappings.length >= 3);
  assert.ok(mappings.some((mapping) => mapping.agencyKey === "gdpr_edpb"));
  assert.ok(mappings.some((mapping) => mapping.agencyKey === "ftc"));
  assert.ok(mappings.some((mapping) => mapping.agencyKey === "doj_ada"));
});

test("regulatory risk ranks consent high for GDPR-like consent failures", () => {
  const risk = buildRegulatoryRiskAssessment({
    source: {
      trackingBeforeConsentDetected: true,
      thirdPartyCookieSetBeforeConsent: true,
      cookieBannerPresent: true,
      rejectAllPresent: false,
      granularPreferencesPresent: false
    }
  });

  assert.ok(risk.consentEnforcementRiskScore >= 60);
  assert.equal(risk.riskLevel, "moderate");
});

test("regulatory risk ranks privacy high for CPPA-style rights gaps", () => {
  const risk = buildRegulatoryRiskAssessment({
    source: {
      californiaExposureLikely: true,
      doNotSellLinkPresent: false,
      dsarRequestMechanismPresent: false,
      dataDeletionRequestPresent: false,
      dataAccessRequestPresent: false,
      privacyContactChannelType: "none"
    }
  });

  assert.ok(risk.privacyEnforcementRiskScore >= 50);
});

test("agency mapping ranks FTC highest when policy behavior conflict is present", () => {
  const risk = buildRegulatoryRiskAssessment({
    source: {
      policyBehaviorConflictDetected: true,
      sessionReplayWithoutDisclosureDetected: true,
      consumerProtectionScore: 80,
      advertisingTrackerCount: 3
    }
  });
  const mappings = buildAgencyMappings(
    {
      policyBehaviorConflictDetected: true,
      sessionReplayWithoutDisclosureDetected: true,
      consumerProtectionScore: 80,
      advertisingTrackerCount: 3
    },
    risk
  );

  assert.equal(mappings[0]?.agencyKey, "ftc");
});

test("agency mapping ranks DOJ highest for accessibility-heavy scan", () => {
  const risk = buildRegulatoryRiskAssessment({
    source: {
      wcagErrorCountTotal: 34,
      wcagMissingAltCount: 12,
      wcagFormLabelErrorCount: 5,
      accessibilityClaimMismatchDetected: true,
      accessibilityLitigationRiskScore: 78,
      ecommerceSiteLikely: true
    }
  });
  const mappings = buildAgencyMappings(
    {
      wcagErrorCountTotal: 34,
      wcagMissingAltCount: 12,
      wcagFormLabelErrorCount: 5,
      accessibilityClaimMismatchDetected: true,
      accessibilityLitigationRiskScore: 78,
      ecommerceSiteLikely: true
    },
    risk
  );

  assert.equal(mappings[0]?.agencyKey, "doj_ada");
});

test("specific retention and mature consent controls reduce regulatory risk", () => {
  const risk = buildRegulatoryRiskAssessment({
    source: {
      cookieBannerPresent: true,
      rejectAllPresent: true,
      granularPreferencesPresent: true,
      trackingBeforeConsentDetected: false,
      retentionDisclosureQuality: "specific",
      dsarRequestMechanismPresent: true,
      dataAccessRequestPresent: true,
      dataDeletionRequestPresent: true,
      privacyContactChannelType: "form",
      policyClaimPrivacyProtective: true
    }
  });

  assert.ok(risk.overallScore < 34);
  assert.equal(risk.riskLevel, "low");
});

test("coverage-aware target prioritization skips already-covered legal types", () => {
  const candidates = [
    { pageType: "privacy_policy" as const, priority: 100, url: "https://example.com/privacy" },
    { pageType: "terms_of_service" as const, priority: 99, url: "https://example.com/terms" },
    { pageType: "contact" as const, priority: 98, url: "https://example.com/contact" },
    { pageType: "cookie_policy" as const, priority: 97, url: "https://example.com/cookies" }
  ];
  const fetchedPages = [
    makePage({ pageType: "privacy_policy", pageUrl: "https://example.com/privacy", finalUrl: "https://example.com/privacy" }),
    makePage({ pageType: "terms_of_service", pageUrl: "https://example.com/terms", finalUrl: "https://example.com/terms" })
  ];

  const prioritized = prioritizeUncoveredTargets({
    candidates,
    fetchedPages
  });
  const targetTypes = getCoverageTargetTypes(candidates, 4);

  assert.deepEqual(prioritized.slice(0, 2).map((candidate) => candidate.pageType), ["contact", "cookie_policy"]);
  assert.equal(hasCoverageForTargetTypes(fetchedPages, targetTypes), false);
  assert.equal(
    hasCoverageForTargetTypes(
      [
        ...fetchedPages,
        makePage({ pageType: "contact", pageUrl: "https://example.com/contact", finalUrl: "https://example.com/contact" }),
        makePage({ pageType: "cookie_policy", pageUrl: "https://example.com/cookies", finalUrl: "https://example.com/cookies" })
      ],
      targetTypes
    ),
    true
  );
});

test("runtime stability wait exits early only after minimum wait and quiet window", () => {
  assert.equal(
    shouldContinueRuntimeWait({
      bannerDetected: true,
      elapsedMs: 200,
      inflightRequests: 0,
      lastActivityElapsedMs: 200,
      maxWaitMs: 1400,
      minWaitMs: 500,
      quietWindowMs: 700
    }),
    true
  );
  assert.equal(
    shouldContinueRuntimeWait({
      bannerDetected: true,
      elapsedMs: 650,
      inflightRequests: 0,
      lastActivityElapsedMs: 650,
      maxWaitMs: 1400,
      minWaitMs: 500,
      quietWindowMs: 700
    }),
    false
  );
  assert.equal(
    shouldContinueRuntimeWait({
      bannerDetected: false,
      elapsedMs: 650,
      inflightRequests: 1,
      lastActivityElapsedMs: 50,
      maxWaitMs: 1400,
      minWaitMs: 500,
      quietWindowMs: 700
    }),
    true
  );
  assert.equal(
    shouldContinueRuntimeWait({
      bannerDetected: false,
      elapsedMs: 800,
      inflightRequests: 0,
      lastActivityElapsedMs: 750,
      maxWaitMs: 1400,
      minWaitMs: 500,
      quietWindowMs: 700
    }),
    false
  );
});

test("deriveFormSignals classifies PII-heavy forms", () => {
  const formSignals = deriveFormSignals([
    makePage({
      pageType: "signup",
      textContent: "Create account and enter your birth date.",
      forms: [
        {
          action: "/signup",
          hasPasswordField: true,
          textSample: "Create account",
          inputs: [
            { type: "email", name: "email", autocomplete: "email", ariaLabel: null, id: null, labelText: "Email", placeholder: null },
            { type: "password", name: "password", autocomplete: "new-password", ariaLabel: null, id: null, labelText: "Password", placeholder: null },
            { type: "text", name: "dob", autocomplete: "bday", ariaLabel: null, id: null, labelText: "Date of birth", placeholder: null }
          ]
        }
      ]
    })
  ]);

  assert.equal(formSignals.accountSignupPresent, true);
  assert.equal(formSignals.emailInputPresent, true);
  assert.equal(formSignals.dateOfBirthInputPresent, true);
  assert.equal(formSignals.formCollectsBirthdate, true);
  assert.equal(formSignals.ageVerificationMechanismType, "date_of_birth");
});

test("inferConsentDarkPatternFlags captures consent dark-pattern heuristics", () => {
  const flags = inferConsentDarkPatternFlags({
    visibleBanner: true,
    bodyText: "limited time offer ends in 00:45",
    bodyOverflowHidden: true,
    bannerHeightRatio: 0.8,
    isFixedBanner: true,
    layoutType: "modal",
    acceptButtons: [{ text: "accept all", prominenceScore: 12000 }],
    rejectButtons: [{ text: "reject", prominenceScore: 2000 }],
    preferencesButtons: [],
    dismissButtons: [{ text: "close", prominenceScore: 1000 }]
  });

  assert.equal(flags.darkPatternAcceptButtonProminence, true);
  assert.equal(flags.darkPatternForcedConsentWall, true);
  assert.equal(flags.darkPatternDismissWithoutReject, false);
  assert.equal(flags.darkPatternCountdownTimerPresent, true);
  assert.equal(flags.darkPatternFakeScarcityLanguage, true);
});

test("classifyConsentButtonRole recognizes broader CMP button labels", () => {
  assert.equal(classifyConsentButtonRole("Accept all"), "accept");
  assert.equal(classifyConsentButtonRole("Only necessary"), "reject");
  assert.equal(classifyConsentButtonRole("Learn more"), "preferences");
  assert.equal(classifyConsentButtonRole("Privacy choices"), "preferences");
  assert.equal(classifyConsentButtonRole("Continue without accepting"), "reject");
  assert.equal(classifyConsentButtonRole("Close"), "dismiss");
});

test("deriveFormSignals detects sensitive-data collection categories", () => {
  const formSignals = deriveFormSignals([
    makePage({
      pageType: "checkout",
      textContent: "Provide your bank account, routing number, passport number, and current location coordinates.",
      forms: [
        {
          action: "/apply",
          hasPasswordField: false,
          textSample: "Insurance intake form",
          inputs: [
            { type: "text", name: "ssn", autocomplete: null, ariaLabel: null, id: "ssn", labelText: "SSN", placeholder: null },
            { type: "text", name: "passport_number", autocomplete: null, ariaLabel: null, id: null, labelText: "Passport Number", placeholder: null },
            { type: "text", name: "medical_history", autocomplete: null, ariaLabel: null, id: null, labelText: "Medical history", placeholder: null },
            { type: "text", name: "bank_account", autocomplete: null, ariaLabel: null, id: null, labelText: "Bank account", placeholder: null },
            { type: "text", name: "latitude", autocomplete: null, ariaLabel: null, id: null, labelText: "Latitude", placeholder: null }
          ]
        }
      ]
    })
  ]);

  assert.equal(formSignals.formCollectsSsn, true);
  assert.equal(formSignals.formCollectsGovernmentId, true);
  assert.equal(formSignals.formCollectsHealthInformation, true);
  assert.equal(formSignals.formCollectsFinancialInformation, true);
  assert.equal(formSignals.formCollectsGeolocation, true);
  assert.equal(formSignals.highSensitivityDataCollectionDetected, true);
});

test("deriveExpandedCommercialSignals detects subscription and refund language", () => {
  const commercialSignals = deriveExpandedCommercialSignals([
    makePage({
      pageType: "homepage",
      title: "Spring sale",
      textContent: "Save 20% today only. Was $49, now $29 while supplies last."
    }),
    makePage({
      pageType: "subscription_terms",
      title: "Membership terms",
      textContent:
        "Your subscription renews automatically after the free trial. See our cancellation policy. We will notify you 30 days before renewal. We may suspend or terminate your access for cause or violation of these terms. You may delete your account from settings."
    }),
    makePage({
      pageType: "refund_policy",
      title: "Returns and refunds",
      textContent:
        "Refunds are available within 30 days if items are unused and in original packaging. To request a refund, contact support or email us. Some items are exchange only or store credit only."
    })
  ]);

  assert.equal(commercialSignals.subscriptionTermsPresent, true);
  assert.equal(commercialSignals.autoRenewDisclosurePresent, true);
  assert.equal(commercialSignals.subscriptionCancellationPolicyPresent, true);
  assert.equal(commercialSignals.freeTrialDetected, true);
  assert.equal(commercialSignals.refundPolicyPresent, true);
  assert.equal(commercialSignals.discountClaimPresent, true);
  assert.equal(commercialSignals.originalPriceComparisonPresent, true);
  assert.equal(commercialSignals.limitedTimeOfferLanguagePresent, true);
  assert.equal(commercialSignals.refundPolicyWindowDays, 30);
  assert.equal(commercialSignals.refundPolicyConditionsPresent, true);
  assert.equal(commercialSignals.refundRequestMethodPresent, true);
  assert.equal(commercialSignals.storeCreditOnlyPolicyPresent, true);
  assert.equal(commercialSignals.exchangePolicyPresent, true);
  assert.equal(commercialSignals.renewalNoticePeriodPresent, true);
  assert.equal(commercialSignals.terminationForCauseClausePresent, true);
  assert.equal(commercialSignals.accountDeletionTermsPresent, true);
  assert.equal(commercialSignals.serviceSuspensionOrTerminationTermsPresent, true);
});

test("detectTrackerVendorsFromStaticPage maps real vendor names", () => {
  const trackers = detectTrackerVendorsFromStaticPage({
    scanId: "scan-1",
    pageHostname: "example.com",
    pageText: "window.dataLayer = window.dataLayer || [];",
    scripts: [
      {
        src: "https://www.googletagmanager.com/gtm.js?id=GTM-TEST",
        host: "www.googletagmanager.com",
        contentSample: null
      },
      {
        src: "https://www.google-analytics.com/g/collect?v=2",
        host: "www.google-analytics.com",
        contentSample: null
      }
    ]
  });

  assert.deepEqual(
    trackers.map((tracker) => tracker.vendorName).sort(),
    ["Google Analytics", "Google Tag Manager"]
  );
});

test("detectTrackerVendorsFromStaticPage detects expanded analytics, CDP, and replay vendors", () => {
  const trackers = detectTrackerVendorsFromStaticPage({
    scanId: "scan-1",
    pageHostname: "example.com",
    pageText: "analytics.load('SEGMENT'); posthog.init('phc'); FS.identify('user-1'); s_gi('suite');",
    scripts: [
      {
        src: "https://cdn.segment.com/analytics.js/v1/test/analytics.min.js",
        host: "cdn.segment.com",
        contentSample: null
      },
      {
        src: "https://cdn.fsd2.com/fs.js",
        host: "cdn.fsd2.com",
        contentSample: null
      },
      {
        src: "https://www.googletagmanager.com/gtm.js?id=GTM-TEST",
        host: "www.googletagmanager.com",
        contentSample: null
      },
      {
        src: "https://example.sc.omtrdc.net/b/ss/example/1/JS-2.0.0/s1234567890",
        host: "example.sc.omtrdc.net",
        contentSample: null
      }
    ]
  });

  assert.deepEqual(
    trackers.map((tracker) => tracker.vendorName).sort(),
    ["Adobe Analytics", "FullStory", "Google Tag Manager", "PostHog", "Segment"]
  );
});

test("deriveAdvertisingClassification maps ad and replay vendors", () => {
  const signals = deriveAdvertisingClassification([
    {
      scanId: "scan-1",
      vendorName: "Google Ads",
      vendorCategory: "advertising",
      detectionSource: "request",
      confidence: 0.9,
      firstPartyOrThirdParty: "third_party",
      collectionEndpointType: "direct_third_party",
      beforeConsent: true,
      scriptHost: "doubleclick.net",
      matchedSignatureId: "google_ads"
    },
    {
      scanId: "scan-1",
      vendorName: "FullStory",
      vendorCategory: "session_replay",
      detectionSource: "script_signature",
      confidence: 0.95,
      firstPartyOrThirdParty: "third_party",
      collectionEndpointType: "direct_third_party",
      beforeConsent: null,
      scriptHost: "fullstory.com",
      matchedSignatureId: "fullstory"
    }
  ]);

  assert.equal(signals.adNetworkGoogleAds, true);
  assert.equal(signals.adNetworkMetaAds, false);
  assert.equal(signals.retargetingPixelDetected, true);
  assert.equal(signals.sessionReplayToolDetected, true);
});

test("deriveAiInfrastructureSignals uses explicit vendor hits and AI phrasing", () => {
  const signals = deriveAiInfrastructureSignals({
    chatSupportVendor: "Intercom",
    pages: [makePage({ textContent: "Ask AI to summarize your account. Chat with AI for help." })]
  });

  assert.equal(signals.aiChatbotPresent, true);
  assert.equal(signals.aiChatbotVendor, "Intercom");
  assert.equal(signals.aiAssistantWidgetDetected, true);
  assert.equal(signals.aiSearchOrAnswerExperienceDetected, false);
});

test("deriveAiInfrastructureSignals detects disclosure and policy/help references", () => {
  const signals = deriveAiInfrastructureSignals({
    chatSupportVendor: null,
    pages: [
      makePage({ textContent: "Powered by AI. Responses may be generated by AI." }),
      makePage({
        pageType: "privacy_policy",
        title: "Privacy Policy",
        textContent: "We use artificial intelligence and machine learning features, including automated processing."
      }),
      makePage({
        pageType: "support",
        title: "Help Center",
        textContent: "How to use our AI assistant in the help center."
      })
    ]
  });

  assert.equal(signals.aiDisclosureTextPresent, true);
  assert.equal(signals.aiTermsOrPolicyAiReference, true);
  assert.equal(signals.aiHelpCenterAiReference, true);
});

test("deriveAiInfrastructureSignals detects explicit AI search and hiring automation", () => {
  const signals = deriveAiInfrastructureSignals({
    chatSupportVendor: null,
    pages: [
      makePage({
        textContent:
          "Ask a question to get instant AI answers. Careers notice: we use automated screening and candidate ranking during hiring."
      })
    ]
  });

  assert.equal(signals.aiSearchOrAnswerExperienceDetected, true);
  assert.equal(signals.aiHiringAutomationSignalDetected, true);
});

test("deriveAiInfrastructureSignals avoids flagging generic search and help copy", () => {
  const signals = deriveAiInfrastructureSignals({
    chatSupportVendor: null,
    pages: [makePage({ textContent: "Search our help center to find answers fast." })]
  });

  assert.equal(signals.aiChatbotPresent, false);
  assert.equal(signals.aiAssistantWidgetDetected, false);
  assert.equal(signals.aiSearchOrAnswerExperienceDetected, false);
});

test("deriveGovernanceSignals detects disclosure, trust, and status links", () => {
  const governanceSignals = deriveGovernanceSignals([
    makePage({
      links: [
        { href: "https://example.com/security", text: "Security" },
        { href: "https://trust.example.com", text: "Trust Center" },
        { href: "https://status.example.com", text: "Status" }
      ]
    })
  ]);

  assert.equal(governanceSignals.vulnerabilityDisclosurePagePresent, true);
  assert.equal(governanceSignals.trustCenterPresent, true);
  assert.equal(governanceSignals.incidentStatusPagePresent, true);
});

test("hash helpers are stable for presence and consent signatures", () => {
  const presenceA = policyPresenceHash(makeSnapshot());
  const presenceB = policyPresenceHash(makeSnapshot());
  const consentA = consentSignatureHash({
    acceptAllPresent: true,
    consentAcceptButtonCount: 1,
    consentInteractionModel: "accept_preferences",
    consentPreferencesButtonCount: 1,
    consentRejectButtonCount: 0,
    cmpVendorName: "OneTrust",
    cookieBannerPresent: true,
    cookiePolicyLinkedFromBanner: true,
    granularPreferencesPresent: true,
    rejectAllPresent: false
  });
  const consentB = consentSignatureHash({
    acceptAllPresent: true,
    consentAcceptButtonCount: 1,
    consentInteractionModel: "accept_preferences",
    consentPreferencesButtonCount: 1,
    consentRejectButtonCount: 0,
    cmpVendorName: "OneTrust",
    cookieBannerPresent: true,
    cookiePolicyLinkedFromBanner: true,
    granularPreferencesPresent: true,
    rejectAllPresent: false
  });

  assert.equal(presenceA, presenceB);
  assert.equal(consentA, consentB);
});

test("consent signature changes when interaction model changes", () => {
  const acceptOnly = consentSignatureHash({
    acceptAllPresent: true,
    consentAcceptButtonCount: 1,
    consentInteractionModel: "accept_only",
    consentPreferencesButtonCount: 0,
    consentRejectButtonCount: 0,
    cmpVendorName: "Iubenda",
    cookieBannerPresent: true,
    cookiePolicyLinkedFromBanner: true,
    granularPreferencesPresent: false,
    rejectAllPresent: false
  });
  const acceptRejectPreferences = consentSignatureHash({
    acceptAllPresent: true,
    consentAcceptButtonCount: 1,
    consentInteractionModel: "accept_reject_preferences",
    consentPreferencesButtonCount: 1,
    consentRejectButtonCount: 1,
    cmpVendorName: "Iubenda",
    cookieBannerPresent: true,
    cookiePolicyLinkedFromBanner: true,
    granularPreferencesPresent: true,
    rejectAllPresent: true
  });

  assert.notEqual(acceptOnly, acceptRejectPreferences);
});

test("detectCmpVendorFromPage detects Iubenda consent signatures", () => {
  const vendor = detectCmpVendorFromPage(
    makePage({
      html: '<div id="iubenda-cs-banner"></div><script>var _iub = _iub || []; var iubenda_cs_configuration = {}</script>',
      scripts: [
        {
          src: "https://cdn.iubenda.com/cs/iubenda_cs.js",
          host: "cdn.iubenda.com",
          contentSample: null
        }
      ]
    })
  );

  assert.equal(vendor?.name, "Iubenda");
});

test("buildAccessibilitySummary aggregates normalized rule families", () => {
  const summary = buildAccessibilitySummary([
    { scanId: "scan-1", ruleCode: "image-alt", ruleGroup: "alt", severity: "medium", instanceCount: 2 },
    { scanId: "scan-1", ruleCode: "color-contrast", ruleGroup: "contrast", severity: "medium", instanceCount: 1 }
  ]);

  assert.equal(summary.wcagErrorCountTotal, 3);
  assert.equal(summary.wcagMissingAltCount, 2);
  assert.equal(summary.wcagContrastFailuresCount, 1);
  assert.ok(summary.accessibilitySignatureHash);
});

test("diffSnapshots emits semantic and generic change events", () => {
  const previousSnapshot = makeSnapshot({
    scanId: "scan-prev",
    privacyPolicyHash: "hash-a",
    cookieBannerPresent: false,
    rejectAllPresent: false,
    wcagMissingAltCount: 4
  });
  const currentSnapshot = makeSnapshot({
    cookieBannerPresent: true,
    rejectAllPresent: true,
    privacyPolicyHash: "hash-b",
    doNotSellLinkPresent: true,
    wcagMissingAltCount: 2,
    requestDomainSetChanged: true,
    scriptDomainSetChanged: true,
    securityHeaderPostureChanged: true,
    infrastructureChangeDetected: true
  });

  const result = diffSnapshots({
    domain: "example.com",
    eventTimestamp: "2026-03-08T00:00:00.000Z",
    currentSnapshot,
    currentTrackers: [
      {
        scanId: "scan-current",
        vendorName: "Hotjar",
        vendorCategory: "session_replay",
        detectionSource: "request",
        confidence: 0.95,
        firstPartyOrThirdParty: "third_party",
        collectionEndpointType: "direct_third_party",
        beforeConsent: true,
        scriptHost: "static.hotjar.com",
        matchedSignatureId: "hotjar"
      }
    ],
    previousScanId: "scan-prev",
    previousSnapshot,
    previousTrackers: []
  });

  assert.equal(result.summary.isBaseline, false);
  assert.ok(result.events.some((event) => event.eventType === "privacy_policy_hash_changed"));
  assert.ok(result.events.some((event) => event.eventType === "cookie_banner_added"));
  assert.ok(result.events.some((event) => event.eventType === "reject_all_added"));
  assert.ok(result.events.some((event) => event.eventType === "session_replay_tracker_added"));
  assert.ok(result.events.some((event) => event.eventType === "do_not_sell_link_added"));
  assert.ok(result.events.some((event) => event.eventType === "wcag_missing_alt_count_decreased"));
  assert.ok(result.events.some((event) => event.eventType === "request_domain_set_changed"));
  assert.ok(result.events.some((event) => event.eventType === "script_domain_set_changed"));
  assert.ok(result.events.some((event) => event.eventType === "security_header_posture_changed"));
  assert.ok(!result.events.some((event) => event.fieldName === "infrastructureChangeDetected"));
  assert.ok(!result.events.some((event) => event.eventType === "field_added" && event.fieldName === "requestDomainSetChanged"));
  assert.ok(!result.events.some((event) => event.eventType === "field_added" && event.fieldName === "scriptDomainSetChanged"));
  assert.ok(!result.events.some((event) => event.eventType === "field_added" && event.fieldName === "securityHeaderPostureChanged"));
});

test("diffSnapshots emits resolved infrastructure events when churn settles", () => {
  const previousSnapshot = makeSnapshot({
    scanId: "scan-prev",
    requestDomainSetChanged: true,
    scriptDomainSetChanged: true,
    securityHeaderPostureChanged: true,
    infrastructureChangeDetected: true
  });
  const currentSnapshot = makeSnapshot({
    requestDomainSetChanged: false,
    scriptDomainSetChanged: false,
    securityHeaderPostureChanged: false,
    infrastructureChangeDetected: false
  });

  const result = diffSnapshots({
    domain: "example.com",
    eventTimestamp: "2026-03-08T00:00:00.000Z",
    currentSnapshot,
    currentTrackers: [],
    previousScanId: "scan-prev",
    previousSnapshot,
    previousTrackers: []
  });

  assert.ok(result.events.some((event) => event.eventType === "request_domain_set_resolved"));
  assert.ok(result.events.some((event) => event.eventType === "script_domain_set_resolved"));
  assert.ok(result.events.some((event) => event.eventType === "security_header_posture_resolved"));
  assert.ok(!result.events.some((event) => event.fieldName === "infrastructureChangeDetected"));
  assert.ok(!result.events.some((event) => event.eventType === "field_removed" && event.fieldName === "requestDomainSetChanged"));
  assert.ok(!result.events.some((event) => event.eventType === "field_removed" && event.fieldName === "scriptDomainSetChanged"));
  assert.ok(!result.events.some((event) => event.eventType === "field_removed" && event.fieldName === "securityHeaderPostureChanged"));
});

test("buildPageMetadata persists hashes without raw page content", () => {
  const metadata = buildPageMetadata(
    "scan-1",
    makePage({
      textContent: "A public contact page with no raw HTML persisted.",
      title: "Contact Us",
      pageType: "contact"
    })
  );

  assert.equal("normalizedContentHash" in metadata, true);
  assert.equal("titleHash" in metadata, true);
  assert.equal("html" in (metadata as unknown as Record<string, unknown>), false);
  assert.equal("textContent" in (metadata as unknown as Record<string, unknown>), false);
});
