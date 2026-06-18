import assert from "node:assert/strict";
import test from "node:test";
import type {
  CanonicalEvidenceBundle,
  CookieEvent,
  NetworkEvent,
  NetworkResponseEvent,
  NormalizedVendorObservation,
  ObservedBehavior,
  ObservedJourney,
  ScriptEvent,
} from "@certscore/contracts";
import { minimalBundle } from "../../certscore-review-engine/src/fixtures.js";
import { formatInspectionReportText, inspectBundle } from "./inspector.js";

const sourceScanner = "pre_consent_runtime";
const scenario = "fresh_pre_consent";

test("summarizes endpoint attribution and Google endpoint subtypes", async () => {
  const report = await inspectBundle(calibrationBundle());

  assert.deepEqual(report.endpointAttribution.countByAttributionStatus, {
    ignored_noise: 1,
    resolved: 2,
    site_owned_infrastructure: 2,
    unresolved_meaningful: 1,
  });
  assert.deepEqual(report.endpointAttribution.countByEndpointSubtype, {
    google_ads_or_measurement: 1,
    google_analytics_collection: 1,
    google_consent_or_tag_support: 1,
    google_owned_infrastructure: 0,
    google_owned_unresolved_meaningful: 0,
    google_recaptcha_or_security: 0,
  });
  assert.deepEqual(report.googleEndpointSubtypeSummary, report.endpointAttribution.countByEndpointSubtype);
  assert.deepEqual(
    report.endpointAttribution.unresolvedMeaningfulEndpoints.map((endpoint) => endpoint.hostname),
    ["unknown.example.net"],
  );
  assert.deepEqual(
    report.endpointAttribution.siteOwnedInfrastructureEndpoints.map((endpoint) => endpoint.hostname).sort(),
    ["video-ads-module.ad-tech.nbcuni.com", "www.google.com"],
  );
  assert.equal(
    report.endpointAttribution.unresolvedMeaningfulEndpoints[0]?.path,
    "/collect;[redacted]",
  );
});

test("summarizes vendor resolution and journey classification", async () => {
  const report = await inspectBundle(calibrationBundle());

  assert.deepEqual(report.vendorResolution.purposeCounts, {
    advertising: 1,
    analytics: 1,
    consent_management: 1,
  });
  assert.deepEqual(report.vendorResolution.confidenceDistribution, {
    high: 3,
    low: 0,
    medium: 0,
  });
  assert.deepEqual(report.journeySummary.countByJourneyType, {
    cookie: 2,
    endpoint: 3,
    product: 1,
    tracker: 2,
  });
  assert.equal(report.journeySummary.nonTrackerJourneyCount, 6);
  assert.deepEqual(
    report.journeySummary.unresolvedEndpointJourneys.map((journey) => journey.journeyId),
    ["journey_endpoint_unknown"],
  );
  assert.deepEqual(
    report.journeySummary.trackerEligibleJourneys.map((journey) => journey.displayName),
    ["Google Ads / DoubleClick", "Google Analytics"],
  );
  assert.deepEqual(
    report.journeySummary.libraryOnlyJourneys.map((journey) => journey.displayName),
    ["OneTrust CMP"],
  );
  assert.deepEqual(
    report.journeySummary.cmpSecurityPerformanceJourneys.map((journey) => journey.displayName),
    ["OneTrust CMP"],
  );
});

test("summarizes cookie classification", async () => {
  const report = await inspectBundle(calibrationBundle());

  assert.deepEqual(report.cookieClassification.firstPartyCookies, [
    "OptanonConsent",
    "_ga",
    "akamai_generated_location",
    "mystery_cookie",
  ]);
  assert.deepEqual(report.cookieClassification.thirdPartyCookies, ["IDE"]);
  assert.deepEqual(report.cookieClassification.firstPartyVendorAssociatedCookies, [
    "OptanonConsent",
    "_ga",
  ]);
  assert.deepEqual(report.cookieClassification.cmpCookies, ["OptanonConsent"]);
  assert.deepEqual(report.cookieClassification.securityInfrastructureCookies, [
    "akamai_generated_location",
  ]);
  assert.deepEqual(report.cookieClassification.unknownCookies, ["mystery_cookie"]);
  assert.deepEqual(report.cookieClassification.cookiesLinkedToJourneys, ["IDE", "_ga"]);
});

test("summarizes scanner traceability without review-engine findings", async () => {
  const report = await inspectBundle(calibrationBundle());

  assert.equal(report.vendorResolution.resolvedVendors.length, 3);
  assert.equal(report.traceabilitySummary.vendorObservationsWithEvidenceRefs, 0);
  assert.equal(report.traceabilitySummary.vendorObservationsMissingEvidenceRefs, 3);
  assert.equal(report.traceabilitySummary.journeysWithRawEventRefs > 0, true);
  assert.equal(report.journeySummary.unresolvedEndpointJourneys.length, 1);
  assert.equal(report.journeySummary.unresolvedEndpointJourneys[0]?.journeyId, "journey_endpoint_unknown");
});

test("formats text sections and deterministic JSON-compatible output", async () => {
  const bundle = calibrationBundle();
  const report = await inspectBundle(bundle);
  const reportAgain = await inspectBundle(bundle);
  const text = formatInspectionReportText(report);

  assert.equal(text.includes("Endpoint attribution"), true);
  assert.equal(text.includes("Vendor/product resolution"), true);
  assert.equal(text.includes("Journey summary"), true);
  assert.equal(text.includes("Cookie classification"), true);
  assert.equal(text.includes("Google endpoint subtype summary"), true);
  assert.equal(text.includes("Traceability"), true);
  assert.equal(text.includes("Evidence excerpts"), false);
  assert.equal(text.includes("Finding candidates"), false);
  assert.equal(text.includes("secret-token"), false);
  assert.equal(JSON.stringify(report), JSON.stringify(reportAgain));
});

function calibrationBundle(): CanonicalEvidenceBundle {
  const networkEvents = [
    networkEvent({
      eventId: "net_ga",
      requestId: "req_ga",
      requestUrl: "https://www.google-analytics.com/g/collect?v=2&tid=G-TEST",
      hostname: "www.google-analytics.com",
      registrableDomain: "google-analytics.com",
      path: "/g/collect",
      queryParamNames: ["tid", "v"],
      collectionEndpointObserved: true,
      endpointCategory: "analytics_collection",
      endpointSubtype: "google_analytics_collection",
      attributionStatus: "resolved",
      attributionReason: "resolved_to_google_analytics",
      resolverBasis: ["ga_endpoint_or_cookie"],
    }),
    networkEvent({
      eventId: "net_google_consent",
      requestId: "req_google_consent",
      requestUrl: "https://www.google.com/ccm/collect?gtm=GTM-TEST&gcd=redacted",
      hostname: "www.google.com",
      registrableDomain: "google.com",
      path: "/ccm/collect",
      queryParamNames: ["gcd", "gtm", "tag_exp"],
      collectionEndpointObserved: true,
      endpointCategory: "tag_support",
      endpointSubtype: "google_consent_or_tag_support",
      attributionStatus: "site_owned_infrastructure",
      attributionReason: "google_consent_or_tag_support_endpoint",
      resolverBasis: ["google_consent_or_tag_support"],
    }),
    networkEvent({
      eventId: "net_ads",
      requestId: "req_ads",
      requestUrl: "https://www.google.com/pagead/1p-conversion/123;ecid=secret-token",
      hostname: "www.google.com",
      registrableDomain: "google.com",
      path: "/pagead/1p-conversion/123;ecid=secret-token",
      queryParamNames: ["random"],
      collectionEndpointObserved: true,
      endpointCategory: "advertising_collection",
      endpointSubtype: "google_ads_or_measurement",
      attributionStatus: "resolved",
      attributionReason: "resolved_to_google_ads",
      resolverBasis: ["google_ads_pagead_endpoint"],
    }),
    networkEvent({
      eventId: "net_unknown",
      requestId: "req_unknown",
      requestUrl: "https://unknown.example.net/collect;token=secret-token",
      hostname: "unknown.example.net",
      registrableDomain: "example.net",
      path: "/collect;token=secret-token",
      queryParamNames: ["event"],
      collectionEndpointObserved: true,
      endpointCategory: "collection_like",
      attributionStatus: "unresolved_meaningful",
      attributionReason: "collection_like_endpoint_without_confident_vendor_mapping",
      resolverBasis: ["endpoint_category:collection_like"],
    }),
    networkEvent({
      eventId: "net_site_owned",
      requestId: "req_site_owned",
      requestUrl: "https://video-ads-module.ad-tech.nbcuni.com/v1/freewheel-params",
      hostname: "video-ads-module.ad-tech.nbcuni.com",
      registrableDomain: "nbcuni.com",
      path: "/v1/freewheel-params",
      queryParamNames: [],
      collectionEndpointObserved: true,
      endpointCategory: "site_owned_ad_module",
      attributionStatus: "site_owned_infrastructure",
      attributionReason: "site_owned_video_ad_module",
      resolverBasis: ["site_owned_infrastructure:nbcuni_video_ad_module"],
    }),
    networkEvent({
      eventId: "net_noise",
      requestId: "req_noise",
      requestUrl: "https://static.examplecdn.com/app.css",
      hostname: "static.examplecdn.com",
      registrableDomain: "examplecdn.com",
      path: "/app.css",
      queryParamNames: [],
      collectionEndpointObserved: false,
      endpointCategory: "static_asset",
      attributionStatus: "ignored_noise",
      attributionReason: "static_asset",
      resolverBasis: ["ignored_noise:static_asset"],
      resourceType: "stylesheet",
    }),
  ];
  const script = scriptEvent();
  const cookieEvents = [
    cookieEvent({
      eventId: "cookie_ga",
      cookieName: "_ga",
      hostname: "example.com",
      registrableDomain: "example.com",
      firstParty: true,
      thirdParty: false,
      cookieParty: "first_party",
      vendorAssociated: true,
      associatedVendorRef: "vendor_google_analytics",
      cookiePurpose: "analytics",
      cookieClassificationBasis: ["first_party", "vendor:Google", "purpose:analytics"],
    }),
    cookieEvent({
      eventId: "cookie_optanon",
      cookieName: "OptanonConsent",
      hostname: "example.com",
      registrableDomain: "example.com",
      firstParty: true,
      thirdParty: false,
      cookieParty: "first_party",
      vendorAssociated: true,
      associatedVendorRef: "vendor_onetrust",
      cookiePurpose: "consent_management",
      cookieClassificationBasis: ["first_party", "vendor:OneTrust", "purpose:consent_management"],
    }),
    cookieEvent({
      eventId: "cookie_akamai",
      cookieName: "akamai_generated_location",
      hostname: "example.com",
      registrableDomain: "example.com",
      firstParty: true,
      thirdParty: false,
      cookieParty: "first_party",
      vendorAssociated: false,
      cookiePurpose: "security",
      cookieClassificationBasis: ["first_party", "name:security"],
    }),
    cookieEvent({
      eventId: "cookie_ide",
      cookieName: "IDE",
      hostname: "googleads.g.doubleclick.net",
      registrableDomain: "doubleclick.net",
      firstParty: false,
      thirdParty: true,
      cookieParty: "third_party",
      vendorAssociated: true,
      associatedVendorRef: "vendor_google_ads",
      cookiePurpose: "advertising",
      cookieClassificationBasis: ["third_party", "vendor:Google", "purpose:advertising"],
    }),
    cookieEvent({
      eventId: "cookie_mystery",
      cookieName: "mystery_cookie",
      hostname: "example.com",
      registrableDomain: "example.com",
      firstParty: true,
      thirdParty: false,
      cookieParty: "first_party",
      vendorAssociated: false,
      cookiePurpose: "unknown",
      cookieClassificationBasis: ["first_party", "name:unknown"],
    }),
  ];
  const vendors = [
    vendor({
      observationId: "vendor_google_analytics",
      entity: "Google LLC",
      vendor: "Google",
      product: "Google Analytics",
      purpose: "analytics",
      confidence: 0.96,
      basis: ["ga_endpoint_or_cookie"],
      regulatoryRelevance: ["analytics", "consent"],
      matchedEvidenceIds: ["net_ga", "cookie_ga"],
      matchedHostnames: ["www.google-analytics.com"],
      matchedUrls: ["https://www.google-analytics.com/g/collect?v=2&tid=G-TEST"],
      matchedCookieNames: ["_ga"],
    }),
    vendor({
      observationId: "vendor_google_ads",
      entity: "Google LLC",
      vendor: "Google",
      product: "Google Ads / DoubleClick",
      purpose: "advertising",
      confidence: 0.94,
      basis: ["google_ads_pagead_endpoint", "cookie_name_match"],
      regulatoryRelevance: ["advertising", "consent"],
      matchedEvidenceIds: ["net_ads", "cookie_ide"],
      matchedHostnames: ["www.google.com", "googleads.g.doubleclick.net"],
      matchedUrls: ["https://www.google.com/pagead/1p-conversion/123;ecid=secret-token"],
      matchedCookieNames: ["IDE"],
    }),
    vendor({
      observationId: "vendor_onetrust",
      entity: "OneTrust, LLC",
      vendor: "OneTrust",
      product: "OneTrust CMP",
      purpose: "consent_management",
      confidence: 0.95,
      basis: ["onetrust_cmp_script_or_cookie"],
      regulatoryRelevance: ["consent"],
      matchedEvidenceIds: ["script_onetrust", "cookie_optanon"],
      matchedHostnames: ["cdn.cookielaw.org"],
      matchedUrls: ["https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"],
      matchedCookieNames: ["OptanonConsent"],
    }),
  ];
  const observedJourneys = [
    journey({
      journeyId: "journey_tracker_ga",
      journeyType: "tracker",
      key: "tracker:google_analytics",
      displayName: "Google Analytics",
      entity: "Google LLC",
      vendor: "Google",
      product: "Google Analytics",
      purpose: "analytics",
      event: networkEvents[0],
      relatedEndpoints: [networkEvents[0]?.requestUrl ?? ""],
      relatedVendors: ["Google"],
      observedBehaviors: ["third_party_request_observed", "collection_endpoint_observed"],
      endpointSubtype: "google_analytics_collection",
      attributionStatus: "resolved",
      confidence: 0.96,
    }),
    journey({
      journeyId: "journey_endpoint_google_consent",
      journeyType: "endpoint",
      key: "endpoint:google_consent",
      displayName: "www.google.com",
      event: networkEvents[1],
      relatedEndpoints: [networkEvents[1]?.requestUrl ?? ""],
      observedBehaviors: ["collection_endpoint_observed"],
      endpointSubtype: "google_consent_or_tag_support",
      attributionStatus: "site_owned_infrastructure",
      confidence: 0.52,
      directVsInferred: "inferred",
    }),
    journey({
      journeyId: "journey_tracker_ads",
      journeyType: "tracker",
      key: "tracker:google_ads",
      displayName: "Google Ads / DoubleClick",
      entity: "Google LLC",
      vendor: "Google",
      product: "Google Ads / DoubleClick",
      purpose: "advertising",
      event: networkEvents[2],
      relatedEndpoints: [networkEvents[2]?.requestUrl ?? ""],
      relatedVendors: ["Google"],
      observedBehaviors: ["third_party_request_observed", "collection_endpoint_observed"],
      endpointSubtype: "google_ads_or_measurement",
      attributionStatus: "resolved",
      confidence: 0.94,
    }),
    journey({
      journeyId: "journey_endpoint_unknown",
      journeyType: "endpoint",
      key: "endpoint:unknown",
      displayName: "unknown.example.net",
      event: networkEvents[3],
      relatedEndpoints: [networkEvents[3]?.requestUrl ?? ""],
      observedBehaviors: ["collection_endpoint_observed"],
      attributionStatus: "unresolved_meaningful",
      confidence: 0.58,
      directVsInferred: "inferred",
    }),
    journey({
      journeyId: "journey_endpoint_site_owned",
      journeyType: "endpoint",
      key: "endpoint:nbcuni_video_module",
      displayName: "video-ads-module.ad-tech.nbcuni.com",
      event: networkEvents[4],
      relatedEndpoints: [networkEvents[4]?.requestUrl ?? ""],
      observedBehaviors: ["collection_endpoint_observed"],
      attributionStatus: "site_owned_infrastructure",
      confidence: 0.52,
      directVsInferred: "inferred",
    }),
    journey({
      journeyId: "journey_cmp_onetrust",
      journeyType: "product",
      key: "cmp:onetrust",
      displayName: "OneTrust CMP",
      entity: "OneTrust, LLC",
      vendor: "OneTrust",
      product: "OneTrust CMP",
      purpose: "consent_management",
      event: script,
      relatedScripts: [script.scriptUrl ?? ""],
      relatedVendors: ["OneTrust"],
      observedBehaviors: ["script_loaded", "library_loaded_only", "consent_management_observed"],
      confidence: 0.95,
    }),
    journey({
      journeyId: "journey_cookie_ga",
      journeyType: "cookie",
      key: "cookie:_ga",
      displayName: "_ga",
      entity: "Google LLC",
      vendor: "Google",
      product: "Google Analytics",
      purpose: "analytics",
      event: cookieEvents[0],
      relatedCookies: ["_ga"],
      relatedVendors: ["Google"],
      observedBehaviors: ["cookie_set"],
      confidence: 0.9,
    }),
    journey({
      journeyId: "journey_cookie_ide",
      journeyType: "cookie",
      key: "cookie:ide",
      displayName: "IDE",
      entity: "Google LLC",
      vendor: "Google",
      product: "Google Ads / DoubleClick",
      purpose: "advertising",
      event: cookieEvents[3],
      relatedCookies: ["IDE"],
      relatedVendors: ["Google"],
      observedBehaviors: ["cookie_set"],
      confidence: 0.9,
    }),
  ];

  return minimalBundle({
    scanId: "scan_calibration_fixture",
    url: "https://example.com",
    networkEvents,
    networkResponseEvents: networkEvents.map((event) =>
      responseEvent({
        eventId: `resp_${event.eventId}`,
        requestId: event.requestId,
        responseUrl: event.requestUrl,
        hostname: event.hostname,
        registrableDomain: event.registrableDomain,
        contentType: event.resourceType === "stylesheet" ? "text/css" : "application/javascript",
      }),
    ),
    cookieEvents,
    scriptEvents: [script],
    runtimeTimeline: [...networkEvents, ...cookieEvents, script],
    normalizedVendorObservations: vendors,
    observedJourneys,
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: true,
      thirdPartyCookiesPreConsentObserved: true,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: summarizeJourneys(observedJourneys),
      notes: [],
    },
  });
}

function networkEvent(overrides: Partial<NetworkEvent>): NetworkEvent {
  return {
    eventId: "net",
    eventType: "network_request",
    requestId: "req",
    timestampMs: 100,
    sourceScanner,
    scenario,
    consentStateAtTime: "pre_consent",
    pagePhase: "initial_navigation",
    url: overrides.requestUrl,
    hostname: "example.com",
    registrableDomain: "example.com",
    firstParty: false,
    thirdParty: true,
    evidenceRefs: [],
    confidence: 0.9,
    directVsInferred: "direct",
    method: "GET",
    resourceType: "fetch",
    requestUrl: "https://example.com/event",
    normalizedUrl: "https://example.com/event",
    requestHostname: "example.com",
    path: "/event",
    queryParamNames: [],
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
    collectionEndpointObserved: false,
    relatedEvidenceRefs: [],
    requestPayloadSignals: {
      bodyPresent: false,
      bodyFieldNames: [],
    },
    ...overrides,
  };
}

function responseEvent(overrides: Partial<NetworkResponseEvent>): NetworkResponseEvent {
  return {
    eventId: "resp",
    eventType: "network_response",
    timestampMs: 110,
    sourceScanner,
    scenario,
    consentStateAtTime: "pre_consent",
    pagePhase: "initial_navigation",
    url: overrides.responseUrl,
    hostname: "example.com",
    registrableDomain: "example.com",
    firstParty: false,
    thirdParty: true,
    evidenceRefs: [],
    confidence: 0.9,
    directVsInferred: "direct",
    responseUrl: "https://example.com/event",
    setCookieHeaders: [],
    setCookieMetadata: [],
    cookieNamesSet: [],
    cacheHeaders: {},
    accessControlHeaders: {},
    ...overrides,
  };
}

function cookieEvent(overrides: Partial<CookieEvent>): CookieEvent {
  return {
    eventId: "cookie",
    eventType: "cookie",
    timestampMs: 120,
    sourceScanner,
    scenario,
    consentStateAtTime: "pre_consent",
    pagePhase: "initial_navigation",
    url: "https://example.com",
    hostname: "example.com",
    registrableDomain: "example.com",
    firstParty: true,
    thirdParty: false,
    evidenceRefs: [],
    confidence: 0.9,
    directVsInferred: "direct",
    cookieName: "cookie",
    cookieDomain: "example.com",
    cookiePath: "/",
    secure: true,
    httpOnly: false,
    cookieParty: "first_party",
    vendorAssociated: false,
    cookiePurpose: "unknown",
    cookieClassificationBasis: [],
    operation: "set_cookie_header",
    valueRedacted: true,
    ...overrides,
  };
}

function scriptEvent(): ScriptEvent {
  return {
    eventId: "script_onetrust",
    eventType: "script",
    timestampMs: 130,
    sourceScanner,
    scenario,
    consentStateAtTime: "pre_consent",
    pagePhase: "dom_content_loaded",
    url: "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js",
    hostname: "cdn.cookielaw.org",
    registrableDomain: "cookielaw.org",
    firstParty: false,
    thirdParty: true,
    evidenceRefs: [],
    confidence: 0.95,
    directVsInferred: "direct",
    scriptUrl: "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js",
    inline: false,
  };
}

function vendor(overrides: NormalizedVendorObservation): NormalizedVendorObservation {
  return overrides;
}

function journey(
  input: Partial<ObservedJourney> & {
    journeyId: string;
    journeyType: ObservedJourney["journeyType"];
    key: string;
    displayName: string;
    event: NetworkEvent | CookieEvent | ScriptEvent;
    observedBehaviors: ObservedBehavior[];
  },
): ObservedJourney {
  const behavior = input.observedBehaviors[0];
  return {
    journeyId: input.journeyId,
    journeyType: input.journeyType,
    key: input.key,
    displayName: input.displayName,
    entity: input.entity,
    vendor: input.vendor,
    product: input.product,
    purpose: input.purpose,
    sourceScanner,
    scenariosObserved: [scenario],
    firstObservedAtMs: input.event.timestampMs,
    lastObservedAtMs: input.event.timestampMs,
    firstObservedConsentState: "pre_consent",
    consentStatesObserved: ["pre_consent"],
    firstPartyOrThirdParty: input.event.thirdParty ? "third_party" : "first_party",
    entryPoint: "requestUrl" in input.event
      ? input.event.requestUrl
      : "scriptUrl" in input.event
        ? input.event.scriptUrl
        : input.event.url,
    relatedCookies: input.relatedCookies ?? [],
    relatedScripts: input.relatedScripts ?? [],
    relatedEndpoints: input.relatedEndpoints ?? [],
    relatedVendors: input.relatedVendors ?? [],
    observedBehaviors: input.observedBehaviors,
    endpointSubtype: input.endpointSubtype,
    attributionStatus: input.attributionStatus,
    attributionReason: input.attributionReason,
    resolverBasis: input.resolverBasis,
    relatedEvidenceRefs: input.relatedEvidenceRefs,
    eventRefs: [
      {
        eventId: input.event.eventId,
        eventType: input.event.eventType,
        timestampMs: input.event.timestampMs,
        url: "requestUrl" in input.event
          ? input.event.requestUrl
          : "scriptUrl" in input.event
            ? input.event.scriptUrl
            : input.event.url,
        behavior,
      },
    ],
    confidence: input.confidence ?? 0.9,
    directVsInferred: input.directVsInferred ?? "direct",
    evidenceRefs: [
      {
        refId: `ref_${input.event.eventId}`,
        eventId: input.event.eventId,
        eventType: input.event.eventType,
        url: "requestUrl" in input.event
          ? input.event.requestUrl
          : "scriptUrl" in input.event
            ? input.event.scriptUrl
            : input.event.url,
      },
    ],
  };
}

function summarizeJourneys(journeys: ObservedJourney[]): NonNullable<CanonicalEvidenceBundle["derivedRuntimeSignals"]["journeySummary"]> {
  return {
    journeyCount: journeys.length,
    vendorJourneyCount: countJourneys(journeys, "vendor"),
    productJourneyCount: countJourneys(journeys, "product"),
    trackerJourneyCount: countJourneys(journeys, "tracker"),
    cookieJourneyCount: countJourneys(journeys, "cookie"),
    scriptJourneyCount: countJourneys(journeys, "script"),
    endpointJourneyCount: countJourneys(journeys, "endpoint"),
    activeCollectionJourneyCount: journeys.filter((item) =>
      item.observedBehaviors.some((behavior) =>
        [
          "collection_endpoint_observed",
          "identifier_parameter_observed",
          "advertising_click_id_observed",
          "cookie_sent",
          "session_replay_collection_observed",
        ].includes(behavior),
      ),
    ).length,
    consentManagementJourneyCount: journeys.filter((item) =>
      item.observedBehaviors.includes("consent_management_observed"),
    ).length,
    notes: [],
  };
}

function countJourneys(
  journeys: ObservedJourney[],
  journeyType: ObservedJourney["journeyType"],
): number {
  return journeys.filter((journeyItem) => journeyItem.journeyType === journeyType).length;
}
