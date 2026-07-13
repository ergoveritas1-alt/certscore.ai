import {
  BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
  BROWSER_SCAN_SOURCE_ID,
  BROWSER_SCAN_SOURCE_TYPE,
  type BrowserScanObservedSignalPackageInput
} from "./schema";

function uniqueStrings(values: Array<string | null | undefined>, limit = 250) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))]
    .slice(0, limit);
}

function signalNumber(signals: BrowserScanObservedSignalPackageInput["observedSignals"], key: string) {
  const signal = signals.find((candidate) => candidate.key === key && candidate.valueType === "number");
  return typeof signal?.value === "number" && Number.isFinite(signal.value) ? signal.value : 0;
}

function signalBoolean(signals: BrowserScanObservedSignalPackageInput["observedSignals"], key: string) {
  const signal = signals.find((candidate) => candidate.key === key && candidate.valueType === "boolean");
  return signal?.value === true;
}

function signalOptionalBoolean(signals: BrowserScanObservedSignalPackageInput["observedSignals"], key: string) {
  const signal = signals.find((candidate) => candidate.key === key && candidate.valueType === "boolean");
  return typeof signal?.value === "boolean" ? signal.value : null;
}

function signalStringArray(signals: BrowserScanObservedSignalPackageInput["observedSignals"], key: string) {
  const signal = signals.find((candidate) => candidate.key === key && candidate.valueType === "string_array");
  return Array.isArray(signal?.value) ? uniqueStrings(signal.value.filter((value): value is string => typeof value === "string")) : [];
}

function signalObservedAtMs(signals: BrowserScanObservedSignalPackageInput["observedSignals"], key: string) {
  const signal = signals.find((candidate) => candidate.key === key);
  return typeof signal?.observedAtMs === "number" && Number.isFinite(signal.observedAtMs)
    ? Math.max(0, Math.round(signal.observedAtMs))
    : null;
}

function countCategoryMatches(categories: string[], pattern: RegExp) {
  return categories.filter((category) => pattern.test(category)).length;
}

function deriveBrowserScanScore(input: {
  acceptAllPresent: boolean;
  cookieBannerPresent: boolean;
  cookieCountTotal: number;
  fingerprintTier: number;
  preconsentTrackingDetected: boolean;
  rejectAllPresent: boolean;
  thirdPartyRequestCount: number;
  trackerVendorCount: number;
}) {
  if (
    input.thirdPartyRequestCount === 0 &&
    input.trackerVendorCount === 0 &&
    input.cookieCountTotal === 0 &&
    input.fingerprintTier === 0 &&
    !input.preconsentTrackingDetected
  ) {
    return 100;
  }

  const penalty =
    (input.preconsentTrackingDetected ? 24 : 0) +
    Math.min(22, input.trackerVendorCount * 6) +
    Math.min(12, Math.ceil(input.thirdPartyRequestCount / 8)) +
    Math.min(10, input.cookieCountTotal * 2) +
    Math.min(18, input.fingerprintTier * 6) +
    (input.cookieBannerPresent && input.acceptAllPresent && !input.rejectAllPresent ? 8 : 0);

  return Math.max(0, Math.min(100, 100 - penalty));
}

export function deriveBrowserScanCanonicalMaterializationFromObservedSignals(
  signals: BrowserScanObservedSignalPackageInput["observedSignals"],
  evidenceInventory?: BrowserScanObservedSignalPackageInput["evidenceInventory"]
) {
  const cookieInventory = evidenceInventory?.cookies ?? [];
  const thirdPartyRequestInventory = evidenceInventory?.thirdPartyRequests ?? [];
  const thirdPartyRequestCount = signalNumber(signals, "privacy.third_party_request_count");
  const thirdPartyRequestDomains = signalStringArray(signals, "privacy.third_party_request_domains");
  const thirdPartyScriptDomainCount = signalNumber(signals, "privacy.third_party_script_domain_count");
  const thirdPartyScriptDomains = signalStringArray(signals, "privacy.third_party_script_domains");
  const trackerVendorCount = signalNumber(signals, "privacy.tracker_vendor_count");
  const trackerVendors = signalStringArray(signals, "privacy.tracker_vendors");
  const trackerCategories = signalStringArray(signals, "privacy.preconsent_tracker_categories");
  const preconsentTrackerVendors = signalStringArray(signals, "privacy.preconsent_tracker_vendors");
  const preconsentTrackerEvidenceUrls = signalStringArray(signals, "privacy.preconsent_tracker_evidence_urls");
  const preconsentViolationCount = signalNumber(signals, "privacy.preconsent_violation_count");
  const cookieCountTotal = signalNumber(signals, "privacy.cookie_count_total");
  const sessionReplayVendors = signalStringArray(signals, "privacy.session_replay_runtime_vendors");
  const fingerprintTier = signalNumber(signals, "privacy.fingerprinting_tier");
  const fingerprintCategories = signalStringArray(signals, "privacy.fingerprinting_attribute_categories");
  const cookieBannerPresent = signalBoolean(signals, "privacy.cookie_banner_present");
  const acceptAllPresent = signalBoolean(signals, "privacy.accept_all_present");
  const rejectAllPresent = signalBoolean(signals, "privacy.reject_all_present");
  const granularPreferencesPresent = signalBoolean(signals, "privacy.granular_preferences_present");
  const firstLayerConsentLabels = signalStringArray(signals, "privacy.first_layer_consent_labels");
  const doNotSellLinkPresent = signalBoolean(signals, "privacy.do_not_sell_link_present");
  const preconsentTrackingDetected = signalBoolean(signals, "privacy.preconsent_tracking_detected");
  const privacyPolicyPresent = signalBoolean(signals, "disclosure.privacy_policy_present");
  const cookiePolicyPresent = signalBoolean(signals, "disclosure.cookie_policy_present");
  const termsOfServicePresent = signalBoolean(signals, "disclosure.terms_of_service_present");
  const accessibilityStatementPresent = signalBoolean(signals, "disclosure.accessibility_statement_present");
  const privacyPolicyUrls = signalStringArray(signals, "disclosure.privacy_policy_urls");
  const cookiePolicyUrls = signalStringArray(signals, "disclosure.cookie_policy_urls");
  const termsUrls = signalStringArray(signals, "disclosure.terms_urls");
  const accessibilityStatementUrls = signalStringArray(signals, "disclosure.accessibility_statement_urls");
  const gdprTransparencyTopics = signalStringArray(signals, "disclosure.gdpr_transparency_topics");
  const httpsEnforced = signalBoolean(signals, "security.https_enforced");
  const mixedContentDetected = signalBoolean(signals, "security.mixed_content_detected");
  const insecureFormActionCount = signalNumber(signals, "security.insecure_form_action_count");
  const tlsProbeAttempted = signalOptionalBoolean(signals, "security.tls_probe_attempted");
  const validTlsCertificate = signalOptionalBoolean(signals, "security.valid_tls_certificate");
  const httpProbeAttempted = signalOptionalBoolean(signals, "security.http_probe_attempted");
  const httpRedirectsToHttps = signalOptionalBoolean(signals, "security.http_redirects_to_https");
  const preconsentIframeUrls = signalStringArray(signals, "privacy.preconsent_iframe_urls");
  const firstThirdPartyRequestMs = signalObservedAtMs(signals, "privacy.preconsent_tracking_detected");
  const firstRequestMs = signalObservedAtMs(signals, "privacy.third_party_request_count");
  const firstCookieSeenMs = signalObservedAtMs(signals, "privacy.cookie_count_total");
  const consentBannerDetectedMs = signalObservedAtMs(signals, "privacy.cookie_banner_present");
  const score = deriveBrowserScanScore({
    acceptAllPresent,
    cookieBannerPresent,
    cookieCountTotal,
    fingerprintTier,
    preconsentTrackingDetected,
    rejectAllPresent,
    thirdPartyRequestCount,
    trackerVendorCount
  });
  const browserCoverageSufficient = privacyPolicyPresent && httpsEnforced;
  const vendorCategoryCounts = {
    advertising: countCategoryMatches(trackerCategories, /advertising|ads/i),
    analytics: countCategoryMatches(trackerCategories, /analytics|measurement/i),
    session_replay: Math.max(sessionReplayVendors.length, countCategoryMatches(trackerCategories, /session_replay|behavioral/i)),
    tag_manager: countCategoryMatches(trackerCategories, /tag_manager/i)
  };
  const requestToVendorObservations = thirdPartyRequestInventory.length > 0
    ? thirdPartyRequestInventory.map((row) => ({
        category: row.purpose ?? "unresolved_host",
        confidence: row.confidence,
        firstSeenMs: row.firstObservedAtMs,
        hostname: row.hostname,
        preConsent: row.preConsent,
        product: row.product,
        regulatoryRelevance: row.regulatoryRelevance,
        requestCount: row.requestCount,
        source: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
        vendor: row.vendor ?? "unresolved"
      }))
    : uniqueStrings([...trackerVendors, ...preconsentTrackerVendors], 50).map((vendor) => ({
        category: trackerCategories[0] ?? "tracker",
        preConsent: preconsentTrackerVendors.includes(vendor) || preconsentTrackingDetected,
        source: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
        vendor
      }));
  const cookieNames = uniqueStrings(cookieInventory.map((row) => row.cookieName), 250);
  const cookieDomains = cookieNames.map((cookieName) =>
    cookieInventory.find((row) => row.cookieName === cookieName)?.domain ?? ""
  );
  const thirdPartyCookieRows = cookieInventory.filter((row) => row.party === "third_party");
  const beforeConsentCookieRows = cookieInventory.filter((row) => row.beforeConsent);
  const beforeConsentThirdPartyCookieRows = thirdPartyCookieRows.filter((row) => row.beforeConsent);

  return {
    acceptAllPresent,
    cookieBannerPresent,
    cookieCountTotal,
    doNotSellLinkPresent,
    fingerprintCategories,
    fingerprintTier,
    granularPreferencesPresent,
    hybridRuntimeEvidencePatch: {
      browserExtensionObservedSignals: {
        populationSource: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
        signalCount: signals.length,
        sourceId: BROWSER_SCAN_SOURCE_ID,
        sourceType: BROWSER_SCAN_SOURCE_TYPE
      },
      browserExtensionRequestInventory: thirdPartyRequestInventory.map((row) => ({
        attributionStatus: row.attributionStatus,
        category: row.purpose ?? "unresolved_host",
        confidence: row.confidence,
        firstSeenMs: row.firstObservedAtMs,
        hostname: row.hostname,
        lastSeenMs: row.lastObservedAtMs,
        preConsent: row.preConsent,
        product: row.product,
        regulatoryRelevance: row.regulatoryRelevance,
        requestCount: row.requestCount,
        resourceTypes: row.resourceTypes,
        source: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
        vendor: row.vendor
      })),
      fingerprintSummary: {
        attributeCategories: fingerprintCategories.map((name) => ({ count: 1, firstSeenMs: null, name })),
        attributeCategoryCount: fingerprintCategories.length,
        confidence: fingerprintTier >= 2 ? "medium" : fingerprintTier === 1 ? "low" : "none",
        reasons: fingerprintCategories.map((category) => `BX01 observed ${category} browser/device API access.`),
        source: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
        tier: fingerprintTier
      },
      fingerprintingEvidenceSummary: {
        apiProbeRetained: true,
        artifactCount: fingerprintCategories.length,
        coverageRetained: true,
        fingerprintAttributeCategories: fingerprintCategories,
        fingerprintingObserved: fingerprintTier > 0,
        highEntropySignals: fingerprintCategories,
        source: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE
      },
      networkSummary: {
        preConsentRequestCount: preconsentViolationCount,
        preConsentThirdPartyRequestCount: preconsentViolationCount,
        requestTypeCounts: {
          script: thirdPartyScriptDomainCount
        },
        thirdPartyDomainCount: thirdPartyRequestDomains.length,
        thirdPartyRequestCount,
        totalRequestCount: thirdPartyRequestCount
      },
      embeddedContentSummary: {
        observations: preconsentIframeUrls.map((url) => ({ preConsent: true, type: "iframe", url })),
        preConsentCount: preconsentIframeUrls.length,
        source: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE
      },
      iframeSummary: {
        iframeEvents: preconsentIframeUrls.map((url) => ({ frameUrl: url, preConsent: true })),
        preConsentIframeCount: preconsentIframeUrls.length,
        source: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE
      },
      consentSummary: {
        acceptControlObserved: acceptAllPresent,
        bannerPresent: cookieBannerPresent,
        capturedBeforeInteraction: true,
        cookieNoticeObserved: cookieBannerPresent,
        manageControlObserved: granularPreferencesPresent,
        rejectControlObserved: rejectAllPresent,
        source: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE
      },
      firstLayerConsentChoices: {
        acceptControlObserved: acceptAllPresent,
        capturedBeforeInteraction: true,
        firstLayerCookieConsentBannerObserved: cookieBannerPresent,
        layerInspected: "first_layer",
        managePreferencesObserved: granularPreferencesPresent,
        preferenceControlObserved: granularPreferencesPresent,
        rejectControlObserved: rejectAllPresent,
        sameLayerRejectObserved: rejectAllPresent,
        visibleChoiceLabels: firstLayerConsentLabels
      },
      policySurfaceSummary: {
        accessibilityStatementPresent,
        accessibilityStatementUrls,
        cookiePolicyPresent,
        cookiePolicyUrls,
        privacyPolicyPresent,
        privacyPolicyUrls,
        gdprTransparencyTopics,
        source: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
        termsOfServicePresent,
        termsUrls
      },
      transportSecuritySummary: {
        evidenceRefs: ["browser_extension.page_evidence"],
        evidenceRetained: true,
        finalScheme: httpsEnforced ? "https" : "http",
        formTransportCount: insecureFormActionCount,
        httpProbeAttempted,
        httpRedirectsToHttps,
        insecureFormTransportObserved: insecureFormActionCount > 0,
        mixedContentObserved: mixedContentDetected,
        mixedContentObservedCount: mixedContentDetected ? 1 : 0,
        pageHttpsObserved: httpsEnforced,
        sampledPageUrls: [],
        tlsProbeAttempted,
        validTlsCertificate
      },
      requestToVendorObservations,
      requestObservations: thirdPartyRequestInventory.map((row) => ({
        category: row.purpose ?? "unresolved_host",
        confidence: row.confidence,
        domain: row.hostname,
        firstSeenMs: row.firstObservedAtMs,
        lastSeenMs: row.lastObservedAtMs,
        preConsent: row.preConsent,
        product: row.product,
        regulatoryRelevance: row.regulatoryRelevance,
        requestCount: row.requestCount,
        resourceTypes: row.resourceTypes,
        source: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
        thirdParty: true,
        vendor: row.vendor ?? "unresolved"
      })),
      cookieWriteObservations: cookieInventory.map((row) => ({
        beforeConsent: row.beforeConsent,
        category: row.purpose ?? "unknown",
        cookieName: row.cookieName,
        cookiePartyType: row.party,
        cookieSetMethod: row.sources.join(","),
        domain: row.domain,
        evidenceGrade: row.confidence !== null && row.confidence >= 0.9 ? "high" : row.confidence !== null && row.confidence >= 0.7 ? "medium" : "low",
        firstObservedAtMs: row.firstObservedAtMs,
        httpOnly: row.httpOnly,
        initiatorVendor: row.product ?? row.vendor,
        lastObservedAtMs: row.lastObservedAtMs,
        path: row.path,
        sameSite: row.sameSite,
        secure: row.secure,
        setAtMs: row.firstObservedAtMs,
        timingBasis: row.timingBasis,
        timingEvidence: row.beforeConsent ? "before_consent_cookie_write" : "unknown",
        valueCaptured: false
      })),
      storageSummary: {
        cookiesBeforeConsentCount: beforeConsentCookieRows.length,
        cookiesSeenCount: cookieInventory.length > 0 ? cookieInventory.length : cookieCountTotal,
        thirdPartyCookieBeforeConsentCount: beforeConsentThirdPartyCookieRows.length,
        thirdPartyCookieCount: thirdPartyCookieRows.length,
        valueCaptured: false
      },
      timelineMarkers: {
        consentBannerDetectedMs,
        firstCookieSeenMs,
        firstNonEssentialRequestMs: firstThirdPartyRequestMs,
        firstRequestMs,
        firstThirdPartyRequestMs
      },
      vendorSummary: {
        normalizedVendors: trackerVendors,
        preConsentVendorCount: preconsentTrackerVendors.length,
        preConsentVendors: preconsentTrackerVendors,
        rawThirdPartyDomains: thirdPartyRequestDomains,
        source: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
        vendorCategoryCounts
      }
    },
    preconsentTrackerEvidenceUrls,
    preconsentTrackerVendors,
    preconsentTrackingDetected,
    preconsentViolationCount,
    cookieDomains,
    cookieNames,
    privacyScore: score,
    privacyPolicyPresent,
    cookiePolicyPresent,
    termsOfServicePresent,
    accessibilityStatementPresent,
    browserCoverageSufficient,
    httpsEnforced,
    mixedContentDetected,
    rejectAllPresent,
    score,
    sessionReplayTrackerCount: sessionReplayVendors.length,
    tagManagerPresent: vendorCategoryCounts.tag_manager > 0,
    thirdPartyRequestCount,
    thirdPartyRequestDomains,
    thirdPartyScriptDomainCount: Math.max(thirdPartyScriptDomainCount, thirdPartyScriptDomains.length),
    trackerVendorCount,
    trackerVendors,
    vendorCategoryCounts
  };
}

export type BrowserScanStoredObservedSignalRow = {
  category: string;
  confidence?: number | null;
  evidence_refs?: string[] | null;
  observed_at?: string | null;
  population_source?: string | null;
  signal_key: string;
  signal_label: string;
  signal_value_json: boolean | number | string | string[];
  value_type: string;
};

export function deriveBrowserScanCanonicalMaterializationFromStoredSignalRows(
  rows: BrowserScanStoredObservedSignalRow[]
) {
  return deriveBrowserScanCanonicalMaterializationFromObservedSignals(
    rows
      .filter((row) => row.population_source === BROWSER_SCAN_SIGNAL_POPULATION_SOURCE)
      .flatMap((row) => {
        const valueType =
          row.value_type === "boolean" ||
          row.value_type === "number" ||
          row.value_type === "text" ||
          row.value_type === "string_array"
            ? row.value_type
            : null;
        if (!valueType) {
          return [];
        }

        return [
          {
            category:
              row.category === "accessibility" ||
              row.category === "privacy" ||
              row.category === "disclosure" ||
              row.category === "commerce" ||
              row.category === "financial" ||
              row.category === "entity" ||
              row.category === "context"
                ? row.category
                : "privacy",
            confidence: row.confidence ?? null,
            evidenceRefs: row.evidence_refs ?? [],
            key: row.signal_key,
            label: row.signal_label,
            observedAtMs: null,
            populationSource: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
            provenance: {
              sourceId: BROWSER_SCAN_SOURCE_ID,
              sourceType: BROWSER_SCAN_SOURCE_TYPE
            },
            value: row.signal_value_json,
            valueType
          }
        ];
      })
  );
}
