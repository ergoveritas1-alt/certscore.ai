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

function signalStringArray(signals: BrowserScanObservedSignalPackageInput["observedSignals"], key: string) {
  const signal = signals.find((candidate) => candidate.key === key && candidate.valueType === "string_array");
  return Array.isArray(signal?.value) ? uniqueStrings(signal.value.filter((value): value is string => typeof value === "string")) : [];
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
  signals: BrowserScanObservedSignalPackageInput["observedSignals"]
) {
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
  const doNotSellLinkPresent = signalBoolean(signals, "privacy.do_not_sell_link_present");
  const preconsentTrackingDetected = signalBoolean(signals, "privacy.preconsent_tracking_detected");
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
  const vendorCategoryCounts = {
    advertising: countCategoryMatches(trackerCategories, /advertising|ads/i),
    analytics: countCategoryMatches(trackerCategories, /analytics|measurement/i),
    session_replay: Math.max(sessionReplayVendors.length, countCategoryMatches(trackerCategories, /session_replay|behavioral/i)),
    tag_manager: countCategoryMatches(trackerCategories, /tag_manager/i)
  };
  const requestToVendorObservations = uniqueStrings([...trackerVendors, ...preconsentTrackerVendors], 50).map((vendor) => ({
    category: trackerCategories[0] ?? "tracker",
    preConsent: preconsentTrackerVendors.includes(vendor) || preconsentTrackingDetected,
    source: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
    vendor
  }));

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
      fingerprintSummary: {
        attributeCategories: fingerprintCategories.map((name) => ({ count: 1, firstSeenMs: null, name })),
        attributeCategoryCount: fingerprintCategories.length,
        confidence: fingerprintTier >= 2 ? "medium" : fingerprintTier === 1 ? "low" : "none",
        reasons: fingerprintCategories.map((category) => `BX01 observed ${category} browser/device API access.`),
        source: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
        tier: fingerprintTier
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
      requestToVendorObservations,
      storageSummary: {
        cookiesBeforeConsentCount: cookieBannerPresent ? cookieCountTotal : 0,
        cookiesSeenCount: cookieCountTotal,
        thirdPartyCookieBeforeConsentCount: 0,
        thirdPartyCookieCount: 0,
        valueCaptured: false
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
    privacyScore: score,
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
