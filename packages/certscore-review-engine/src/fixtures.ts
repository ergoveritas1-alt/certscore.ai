import {
  type CanonicalEvidenceBundle,
  type CookieEvent,
  type NetworkEvent,
  type ObservedJourney,
  type ScriptEvent,
  SCHEMA_VERSION,
} from "@certscore/contracts";

const baseStartedAt = "2026-01-01T00:00:00.000Z";
const sourceScanner = "pre_consent_runtime";
const scenario = "fresh_pre_consent";

export function minimalBundle(
  overrides: Partial<CanonicalEvidenceBundle> = {},
): CanonicalEvidenceBundle {
  return {
    scanId: "scan_fixture",
    url: "https://example.com",
    normalizedUrl: "https://example.com/",
    startedAt: baseStartedAt,
    completedAt: "2026-01-01T00:00:02.000Z",
    region: "local",
    scanProfile: {
      profileId: "quick",
      label: "Quick pre-consent runtime scan",
      targetDurationMs: 12_000,
      internalBudgetMs: 15_000,
      enabledModules: ["preConsentRuntimeScanner"],
    },
    modulesRun: [
      {
        moduleName: "preConsentRuntimeScanner",
        status: "completed",
        startedAt: baseStartedAt,
        completedAt: "2026-01-01T00:00:02.000Z",
        durationMs: 2_000,
        evidenceRefs: [],
        errors: [],
      },
    ],
    runtimeTimeline: [],
    networkEvents: [],
    networkResponseEvents: [],
    cookieEvents: [],
    cookieSnapshots: [],
    storageSnapshots: [],
    scriptEvents: [],
    iframeEvents: [],
    consentUiObservations: [
      {
        observationId: "consent_none",
        observedAtMs: 1_000,
        likelyPresent: false,
        basis: ["no_banner_keywords_detected"],
        visibleChoiceLabels: [],
        acceptControlObserved: false,
        rejectControlObserved: false,
        managePreferencesControlObserved: false,
        controls: [],
        evidenceRefs: [],
        confidence: 0.55,
      },
    ],
    consentInteractionEvents: [],
    consentFlowObservations: [],
    consentActionCandidates: [],
    consentActionAttempts: [],
    consentFlowComparisons: [],
    collectionSurfaceObservations: [],
    policySurfaceObservations: [],
    transportSecurityObservations: [],
    cmpRuntimeObservations: [],
    screenshots: [],
    domSnapshots: [],
    normalizedVendorObservations: [],
    observedJourneys: [],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: false,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: {
        journeyCount: 0,
        vendorJourneyCount: 0,
        productJourneyCount: 0,
        trackerJourneyCount: 0,
        cookieJourneyCount: 0,
        scriptJourneyCount: 0,
        endpointJourneyCount: 0,
        activeCollectionJourneyCount: 0,
        consentManagementJourneyCount: 0,
        notes: [],
      },
      notes: [],
    },
    artifactRefs: [],
    scannerVersion: "fixture",
    schemaVersion: SCHEMA_VERSION,
    ...overrides,
  };
}

export const analyticsRequestEvent: NetworkEvent = {
  eventId: "net_ga_collect",
  eventType: "network_request",
  requestId: "req_ga_collect",
  timestampMs: 800,
  sourceScanner,
  scenario,
  consentStateAtTime: "pre_consent",
  pagePhase: "initial_navigation",
  url: "https://www.google-analytics.com/g/collect?v=2&tid=G-TEST",
  hostname: "www.google-analytics.com",
  registrableDomain: "google-analytics.com",
  firstParty: false,
  thirdParty: true,
  evidenceRefs: [],
  confidence: 0.96,
  directVsInferred: "direct",
  method: "GET",
  resourceType: "fetch",
  requestUrl: "https://www.google-analytics.com/g/collect?v=2&tid=G-TEST",
  normalizedUrl: "https://www.google-analytics.com/g/collect?v=2&tid=G-TEST",
  requestHostname: "www.google-analytics.com",
  path: "/g/collect",
  queryParamNames: ["v", "tid"],
  identifierParamNames: [],
  advertisingClickIdParamNames: [],
  tagContainerParamNames: [],
  hasIdentifierLikeParameters: false,
  hasAdvertisingClickIdParameters: false,
  hasTagContainerParameters: false,
  isMainFrame: false,
  isSubFrame: false,
  isThirdParty: true,
  redirectChainRequestIds: [],
  requestHeaders: {
    cookieHeaderPresent: false,
    cookieNames: [],
    authorizationHeaderPresent: false,
  },
  cookieHeaderPresent: false,
  cookieNamesSent: [],
  authorizationHeaderPresent: false,
  collectionEndpointObserved: true,
  endpointCategory: "analytics_collection",
  attributionStatus: "unresolved_meaningful",
  attributionReason: "collection_like_endpoint_without_confident_vendor_mapping",
  resolverBasis: ["endpoint_category:analytics_collection"],
  relatedEvidenceRefs: [],
  requestPayloadSignals: {
    bodyPresent: false,
    bodyFieldNames: [],
  },
};

export const preConsentCookieEvent: CookieEvent = {
  eventId: "cookie_ide",
  eventType: "cookie",
  timestampMs: 900,
  sourceScanner,
  scenario,
  consentStateAtTime: "pre_consent",
  pagePhase: "initial_navigation",
  url: "https://googleads.g.doubleclick.net/pagead/id",
  hostname: "googleads.g.doubleclick.net",
  registrableDomain: "doubleclick.net",
  firstParty: false,
  thirdParty: true,
  evidenceRefs: [],
  confidence: 0.95,
  directVsInferred: "direct",
  cookieName: "IDE",
  cookieDomain: ".doubleclick.net",
  cookiePath: "/",
  sameSite: "None",
  secure: true,
  httpOnly: true,
  sourceRequestId: "req_doubleclick_cookie",
  sourceResponseEventId: "resp_doubleclick_cookie",
  cookieParty: "third_party",
  vendorAssociated: true,
  associatedVendorRef: "vendor_doubleclick_cookie",
  cookiePurpose: "advertising",
  cookieClassificationBasis: ["third_party", "vendor:Google", "purpose:advertising"],
  operation: "set_cookie_header",
  valueRedacted: true,
};

export const fullStoryLibraryEvent: ScriptEvent = {
  eventId: "script_fullstory",
  eventType: "script",
  timestampMs: 700,
  sourceScanner,
  scenario,
  consentStateAtTime: "pre_consent",
  pagePhase: "dom_content_loaded",
  url: "https://rs.fullstory.com/s/fs.js",
  hostname: "rs.fullstory.com",
  registrableDomain: "fullstory.com",
  firstParty: false,
  thirdParty: true,
  evidenceRefs: [],
  confidence: 0.92,
  directVsInferred: "direct",
  scriptUrl: "https://rs.fullstory.com/s/fs.js",
  inline: false,
};

export function emptyMinimalSiteBundle(): CanonicalEvidenceBundle {
  return minimalBundle();
}

export function thirdPartyAnalyticsRequestBundle(): CanonicalEvidenceBundle {
  const vendor = googleAnalyticsVendor();
  const journey = analyticsCollectionJourney();
  return minimalBundle({
    networkEvents: [analyticsRequestEvent],
    runtimeTimeline: [analyticsRequestEvent],
    normalizedVendorObservations: [vendor],
    observedJourneys: [journey],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: true,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: journeySummary([journey]),
      notes: [],
    },
  });
}

export function preConsentCookieBundle(): CanonicalEvidenceBundle {
  const vendor = doubleClickVendor();
  const journey = preConsentCookieJourney();
  return minimalBundle({
    cookieEvents: [preConsentCookieEvent],
    normalizedVendorObservations: [vendor],
    observedJourneys: [journey],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: true,
      thirdPartyCookiesPreConsentObserved: true,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: journeySummary([journey]),
      notes: [],
    },
  });
}

export function consentBannerTextBundle(): CanonicalEvidenceBundle {
  return minimalBundle({
    consentUiObservations: [
      {
        observationId: "consent_banner",
        observedAtMs: 500,
        likelyPresent: true,
        basis: ["keyword_cookie", "button_accept_detected"],
        textExcerpt: "We use cookies. Accept Reject",
        layerInspected: "first_layer",
        visibleChoiceLabels: ["Accept", "Reject"],
        acceptControlObserved: true,
        rejectControlObserved: true,
        managePreferencesControlObserved: false,
        controls: [
          {
            label: "Accept",
            actionType: "accept_all",
            visible: true,
          },
          {
            label: "Reject",
            actionType: "reject_all",
            visible: true,
          },
        ],
        evidenceRefs: [{ refId: "dom_ref", artifactId: "dom_1" }],
        confidence: 0.75,
      },
    ],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: false,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: true,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      notes: [],
    },
  });
}

export function sessionReplayLibraryOnlyBundle(): CanonicalEvidenceBundle {
  const vendor = fullStoryVendor();
  const journey = sessionReplayLibraryJourney();
  return minimalBundle({
    scriptEvents: [fullStoryLibraryEvent],
    runtimeTimeline: [fullStoryLibraryEvent],
    normalizedVendorObservations: [vendor],
    observedJourneys: [journey],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: true,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: true,
      journeySummary: journeySummary([journey]),
      notes: [],
    },
  });
}

export function googleAnalyticsVendor(): CanonicalEvidenceBundle["normalizedVendorObservations"][number] {
  return {
    observationId: "vendor_google_analytics",
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Analytics",
    purpose: "analytics",
    confidence: 0.96,
    basis: ["ga_endpoint_or_cookie", "request", "hostname_match", "url_pattern_match"],
    regulatoryRelevance: ["consent", "analytics"],
    matchedEvidenceIds: [analyticsRequestEvent.eventId],
    matchedEvidenceRefs: [evidenceRefForEvent(analyticsRequestEvent, analyticsRequestEvent.requestUrl)],
    matchSources: [matchSourceForEvent(analyticsRequestEvent, "network_request", "url_pattern", analyticsRequestEvent.requestUrl, 0.96)],
    matchedHostnames: ["www.google-analytics.com"],
    matchedUrls: [analyticsRequestEvent.requestUrl],
    matchedCookieNames: [],
  };
}

export function doubleClickVendor(): CanonicalEvidenceBundle["normalizedVendorObservations"][number] {
  return {
    observationId: "vendor_doubleclick_cookie",
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Ads / DoubleClick",
    purpose: "advertising",
    confidence: 0.96,
    basis: ["doubleclick_ad_endpoint_or_cookie", "cookie", "cookie_name_match"],
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    matchedEvidenceIds: [preConsentCookieEvent.eventId],
    matchedEvidenceRefs: [evidenceRefForEvent(preConsentCookieEvent, "IDE")],
    matchSources: [matchSourceForEvent(preConsentCookieEvent, "set_cookie", "cookie_name", "IDE", 0.96)],
    matchedHostnames: ["googleads.g.doubleclick.net"],
    matchedUrls: [],
    matchedCookieNames: ["IDE"],
  };
}

export function fullStoryVendor(): CanonicalEvidenceBundle["normalizedVendorObservations"][number] {
  return {
    observationId: "vendor_fullstory_library",
    entity: "FullStory, Inc.",
    vendor: "FullStory",
    product: "FullStory",
    purpose: "session_replay",
    confidence: 0.95,
    basis: ["fullstory_script_endpoint_or_cookie", "script", "hostname_match", "url_pattern_match"],
    regulatoryRelevance: ["consent", "behavioral_analytics", "session_replay"],
    matchedEvidenceIds: [fullStoryLibraryEvent.eventId],
    matchedEvidenceRefs: [evidenceRefForEvent(fullStoryLibraryEvent, fullStoryLibraryEvent.scriptUrl)],
    matchSources: [matchSourceForEvent(fullStoryLibraryEvent, "script_url", "url_pattern", fullStoryLibraryEvent.scriptUrl ?? "", 0.95)],
    matchedHostnames: ["rs.fullstory.com"],
    matchedUrls: [fullStoryLibraryEvent.scriptUrl ?? ""],
    matchedCookieNames: [],
  };
}

export function analyticsCollectionJourney(): ObservedJourney {
  return {
    journeyId: "journey_ga_collection",
    journeyType: "tracker",
    key: "tracker:google_analytics",
    displayName: "Google Analytics",
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Analytics",
    purpose: "analytics",
    sourceScanner,
    scenariosObserved: [scenario],
    firstObservedAtMs: analyticsRequestEvent.timestampMs,
    lastObservedAtMs: analyticsRequestEvent.timestampMs,
    firstObservedConsentState: "pre_consent",
    consentStatesObserved: ["pre_consent"],
    firstPartyOrThirdParty: "third_party",
    entryPoint: analyticsRequestEvent.requestUrl,
    entryPointSourceEventId: analyticsRequestEvent.eventId,
    relatedCookies: [],
    relatedScripts: [],
    relatedEndpoints: [analyticsRequestEvent.requestUrl],
    relatedVendors: ["Google"],
    relatedVendorObservationIds: ["vendor_google_analytics"],
    observedBehaviors: ["third_party_request_observed", "collection_endpoint_observed"],
    endpointGeographyStatus: "not_evaluated",
    eventRefs: [
      {
        eventId: analyticsRequestEvent.eventId,
        eventType: analyticsRequestEvent.eventType,
        timestampMs: analyticsRequestEvent.timestampMs,
        url: analyticsRequestEvent.requestUrl,
        behavior: "collection_endpoint_observed",
      },
    ],
    phaseDeltas: [],
    confidence: 0.96,
    directVsInferred: "direct",
    evidenceRefs: [
      {
        refId: `ref_${analyticsRequestEvent.eventId}`,
        eventId: analyticsRequestEvent.eventId,
        eventType: analyticsRequestEvent.eventType,
        url: analyticsRequestEvent.requestUrl,
      },
    ],
  };
}

export function preConsentCookieJourney(): ObservedJourney {
  return {
    journeyId: "journey_ide_cookie",
    journeyType: "cookie",
    key: "cookie:ide",
    displayName: "IDE",
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Ads / DoubleClick",
    purpose: "advertising",
    sourceScanner,
    scenariosObserved: [scenario],
    firstObservedAtMs: preConsentCookieEvent.timestampMs,
    lastObservedAtMs: preConsentCookieEvent.timestampMs,
    firstObservedConsentState: "pre_consent",
    consentStatesObserved: ["pre_consent"],
    firstPartyOrThirdParty: "third_party",
    entryPoint: preConsentCookieEvent.url,
    entryPointSourceEventId: preConsentCookieEvent.eventId,
    relatedCookies: ["IDE"],
    relatedScripts: [],
    relatedEndpoints: [preConsentCookieEvent.url ?? ""],
    relatedVendors: ["Google"],
    relatedVendorObservationIds: ["vendor_doubleclick_cookie"],
    observedBehaviors: ["cookie_set"],
    eventRefs: [
      {
        eventId: preConsentCookieEvent.eventId,
        eventType: preConsentCookieEvent.eventType,
        timestampMs: preConsentCookieEvent.timestampMs,
        url: preConsentCookieEvent.url,
        label: "IDE",
        behavior: "cookie_set",
      },
    ],
    phaseDeltas: [],
    confidence: 0.95,
    directVsInferred: "direct",
    evidenceRefs: [
      {
        refId: `ref_${preConsentCookieEvent.eventId}`,
        eventId: preConsentCookieEvent.eventId,
        eventType: preConsentCookieEvent.eventType,
        label: "IDE",
        url: preConsentCookieEvent.url,
      },
    ],
  };
}

export function sessionReplayLibraryJourney(): ObservedJourney {
  return {
    journeyId: "journey_fullstory_library",
    journeyType: "script",
    key: "script:fullstory",
    displayName: "FullStory",
    entity: "FullStory, Inc.",
    vendor: "FullStory",
    product: "FullStory",
    purpose: "session_replay",
    sourceScanner,
    scenariosObserved: [scenario],
    firstObservedAtMs: fullStoryLibraryEvent.timestampMs,
    lastObservedAtMs: fullStoryLibraryEvent.timestampMs,
    firstObservedConsentState: "pre_consent",
    consentStatesObserved: ["pre_consent"],
    firstPartyOrThirdParty: "third_party",
    entryPoint: fullStoryLibraryEvent.scriptUrl,
    entryPointSourceEventId: fullStoryLibraryEvent.eventId,
    relatedCookies: [],
    relatedScripts: [fullStoryLibraryEvent.scriptUrl ?? ""],
    relatedEndpoints: [],
    relatedVendors: ["FullStory"],
    relatedVendorObservationIds: ["vendor_fullstory_library"],
    observedBehaviors: ["script_loaded", "library_loaded_only", "session_replay_library_observed"],
    eventRefs: [
      {
        eventId: fullStoryLibraryEvent.eventId,
        eventType: fullStoryLibraryEvent.eventType,
        timestampMs: fullStoryLibraryEvent.timestampMs,
        url: fullStoryLibraryEvent.scriptUrl,
        behavior: "script_loaded",
      },
    ],
    phaseDeltas: [],
    confidence: 0.95,
    directVsInferred: "inferred",
    evidenceRefs: [
      {
        refId: `ref_${fullStoryLibraryEvent.eventId}`,
        eventId: fullStoryLibraryEvent.eventId,
        eventType: fullStoryLibraryEvent.eventType,
        url: fullStoryLibraryEvent.scriptUrl,
      },
    ],
  };
}

function evidenceRefForEvent(
  event: CanonicalEvidenceBundle["networkEvents"][number] | CanonicalEvidenceBundle["cookieEvents"][number] | CanonicalEvidenceBundle["scriptEvents"][number],
  label: string | undefined,
): CanonicalEvidenceBundle["normalizedVendorObservations"][number]["matchedEvidenceRefs"][number] {
  return {
    refId: `ref_${event.eventId}`,
    eventId: event.eventId,
    eventType: event.eventType,
    label,
    url: "requestUrl" in event ? event.requestUrl : "scriptUrl" in event ? event.scriptUrl : event.url,
  };
}

function matchSourceForEvent(
  event: CanonicalEvidenceBundle["networkEvents"][number] | CanonicalEvidenceBundle["cookieEvents"][number] | CanonicalEvidenceBundle["scriptEvents"][number],
  source: CanonicalEvidenceBundle["normalizedVendorObservations"][number]["matchSources"][number]["source"],
  matchedField: string,
  matchedValueRedacted: string,
  confidence: number,
): CanonicalEvidenceBundle["normalizedVendorObservations"][number]["matchSources"][number] {
  return {
    source,
    sourceEventId: event.eventId,
    sourceEventType: event.eventType,
    sourceScanner: event.sourceScanner,
    scenario: event.scenario,
    consentStateAtTime: event.consentStateAtTime,
    matchedField,
    matchedValueRedacted,
    resolverBasis: [],
    confidence,
  };
}

function journeySummary(journeys: ObservedJourney[]): NonNullable<CanonicalEvidenceBundle["derivedRuntimeSignals"]["journeySummary"]> {
  return {
    journeyCount: journeys.length,
    vendorJourneyCount: journeys.filter((journey) => journey.journeyType === "vendor").length,
    productJourneyCount: journeys.filter((journey) => journey.journeyType === "product").length,
    trackerJourneyCount: journeys.filter((journey) => journey.journeyType === "tracker").length,
    cookieJourneyCount: journeys.filter((journey) => journey.journeyType === "cookie").length,
    scriptJourneyCount: journeys.filter((journey) => journey.journeyType === "script").length,
    endpointJourneyCount: journeys.filter((journey) => journey.journeyType === "endpoint").length,
    activeCollectionJourneyCount: journeys.filter((journey) =>
      journey.observedBehaviors.some((behavior) =>
        [
          "collection_endpoint_observed",
          "identifier_parameter_observed",
          "advertising_click_id_observed",
          "cookie_sent",
          "session_replay_collection_observed",
        ].includes(behavior),
      ),
    ).length,
    consentManagementJourneyCount: journeys.filter((journey) =>
      journey.observedBehaviors.includes("consent_management_observed"),
    ).length,
    notes: [],
  };
}
