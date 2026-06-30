import assert from "node:assert/strict";
import test from "node:test";
import type {
  CookieEvent,
  NetworkEvent,
  NormalizedVendorObservation,
  ScriptEvent,
} from "@certscore/contracts";
import { buildObservedJourneys, classifyCookieEvents } from "./journey-builder.js";
import { querySignalsFromUrl } from "./scanners/pre-consent-runtime-scanner.js";

const sourceScanner = "pre_consent_runtime";
const scenario = "fresh_pre_consent";

test("builds third-party analytics and collection endpoint journeys", () => {
  const request = networkRequest({
    eventId: "net_ga_collect",
    requestId: "req_ga_collect",
    requestUrl: "https://www.google-analytics.com/g/collect?v=2&tid=G-TEST",
    hostname: "www.google-analytics.com",
    registrableDomain: "google-analytics.com",
    collectionEndpointObserved: true,
    endpointCategory: "analytics_collection",
  });
  const vendor = vendorObservation({
    observationId: "vendor_ga",
    vendor: "Google",
    product: "Google Analytics",
    purpose: "analytics",
    matchedEvidenceIds: [request.eventId],
    matchedHostnames: ["www.google-analytics.com"],
    matchedUrls: [request.requestUrl],
  });

  const journeys = buildObservedJourneys(emptyInput({
    networkEvents: [request],
    normalizedVendorObservations: [vendor],
  }));

  assert.equal(
    journeys.some((journey) =>
      journey.journeyType === "tracker" &&
      journey.observedBehaviors.includes("collection_endpoint_observed"),
    ),
    true,
  );
  assert.equal(
    journeys.some((journey) =>
      journey.journeyType === "endpoint" &&
      journey.relatedEndpoints.includes(request.requestUrl) &&
      journey.endpointGeographyStatus === "not_evaluated",
    ),
    true,
  );
  assert.equal(
    journeys.some((journey) =>
      journey.journeyType === "tracker" &&
      journey.endpointGeographyStatus === "not_evaluated",
    ),
    true,
  );
});

test("propagates bounded endpoint geography region into endpoint journeys", () => {
  const request = networkRequest({
    eventId: "net_region_collect",
    requestId: "req_region_collect",
    requestUrl: "https://collector.us-east-1.amazonaws.com/collect",
    hostname: "collector.us-east-1.amazonaws.com",
    registrableDomain: "amazonaws.com",
    collectionEndpointObserved: true,
    endpointCategory: "analytics_collection",
    endpointGeographyStatus: "region_observed",
    endpointGeographyRegion: "us-east-1",
    endpointGeographyProvider: "AWS",
    endpointGeographyLocationLabel: "AWS US East (N. Virginia)",
    endpointGeographyJurisdiction: "US",
    endpointGeographyPrecision: "provider_region",
    endpointGeographyBasis: ["host_only_endpoint_geography", "aws_region_hostname", "provider_region_catalog"],
  });

  const journeys = buildObservedJourneys(emptyInput({
    networkEvents: [request],
  }));
  const endpointJourney = journeys.find((journey) => journey.journeyType === "endpoint");

  assert.equal(endpointJourney?.endpointGeographyStatus, "region_observed");
  assert.equal(endpointJourney?.endpointGeographyRegion, "us-east-1");
  assert.equal(endpointJourney?.endpointGeographyProvider, "AWS");
  assert.equal(endpointJourney?.endpointGeographyLocationLabel, "AWS US East (N. Virginia)");
  assert.equal(endpointJourney?.endpointGeographyJurisdiction, "US");
  assert.equal(endpointJourney?.endpointGeographyPrecision, "provider_region");
  assert.deepEqual(endpointJourney?.endpointGeographyBasis, [
    "host_only_endpoint_geography",
    "aws_region_hostname",
    "provider_region_catalog",
  ]);
});

test("builds pre-consent cookie journey from safe Set-Cookie metadata", () => {
  const cookie = cookieEvent({
    eventId: "cookie_ide",
    cookieName: "IDE",
    hostname: "googleads.g.doubleclick.net",
    registrableDomain: "doubleclick.net",
  });
  const vendor = vendorObservation({
    observationId: "vendor_doubleclick",
    vendor: "Google",
    product: "Google Ads / DoubleClick",
    purpose: "advertising",
    matchedEvidenceIds: [cookie.eventId],
    matchedHostnames: ["googleads.g.doubleclick.net"],
    matchedCookieNames: ["IDE"],
  });

  const journeys = buildObservedJourneys(emptyInput({
    cookieEvents: [cookie],
    normalizedVendorObservations: [vendor],
  }));

  const cookieJourney = journeys.find((journey) => journey.journeyType === "cookie");
  assert.equal(cookieJourney?.firstObservedConsentState, "pre_consent");
  assert.equal(cookieJourney?.observedBehaviors.includes("cookie_set"), true);
  assert.equal(cookieJourney?.relatedCookies.includes("IDE"), true);
});

test("builds cookie-sent journey without retaining raw cookie values", () => {
  const request = networkRequest({
    eventId: "net_doubleclick",
    requestId: "req_doubleclick",
    requestUrl: "https://googleads.g.doubleclick.net/pagead/id",
    hostname: "googleads.g.doubleclick.net",
    registrableDomain: "doubleclick.net",
    cookieHeaderPresent: true,
    cookieNamesSent: ["IDE"],
  });
  const vendor = vendorObservation({
    observationId: "vendor_doubleclick",
    vendor: "Google",
    product: "Google Ads / DoubleClick",
    purpose: "advertising",
    matchedEvidenceIds: [request.eventId],
    matchedHostnames: ["googleads.g.doubleclick.net"],
    matchedCookieNames: ["IDE"],
  });

  const journeys = buildObservedJourneys(emptyInput({
    networkEvents: [request],
    normalizedVendorObservations: [vendor],
  }));

  const cookieSentJourney = journeys.find((journey) =>
    journey.observedBehaviors.includes("cookie_sent"),
  );
  assert.deepEqual(cookieSentJourney?.relatedCookies, ["IDE"]);
  assert.equal(JSON.stringify(cookieSentJourney).includes("secret-cookie-value"), false);
});

test("distinguishes session replay library-only from collection observed", () => {
  const library = scriptEvent({
    eventId: "script_fullstory",
    scriptUrl: "https://rs.fullstory.com/s/fs.js",
    hostname: "rs.fullstory.com",
    registrableDomain: "fullstory.com",
  });
  const collection = networkRequest({
    eventId: "net_fullstory_rec",
    requestId: "req_fullstory_rec",
    requestUrl: "https://rs.fullstory.com/rec/page",
    hostname: "rs.fullstory.com",
    registrableDomain: "fullstory.com",
    collectionEndpointObserved: true,
    endpointCategory: "session_replay_collection",
  });
  const vendor = vendorObservation({
    observationId: "vendor_fullstory",
    vendor: "FullStory",
    product: "FullStory",
    purpose: "session_replay",
    matchedEvidenceIds: [library.eventId, collection.eventId],
    matchedHostnames: ["rs.fullstory.com"],
    matchedUrls: [library.scriptUrl ?? "", collection.requestUrl],
  });

  const libraryOnly = buildObservedJourneys(emptyInput({
    scriptEvents: [library],
    normalizedVendorObservations: [vendor],
  }));
  const withCollection = buildObservedJourneys(emptyInput({
    networkEvents: [collection],
    scriptEvents: [library],
    normalizedVendorObservations: [vendor],
  }));

  assert.equal(
    libraryOnly.some((journey) => journey.observedBehaviors.includes("library_loaded_only")),
    true,
  );
  assert.equal(
    withCollection.some((journey) =>
      journey.observedBehaviors.includes("session_replay_collection_observed"),
    ),
    true,
  );
});

test("builds session replay journey from vendor-resolved browser snapshot cookie", () => {
  const cookie = cookieEvent({
    eventId: "cookie_hotjar_snapshot",
    cookieName: "_hjHasCachedUserAttributes",
    hostname: "www.example.com",
    registrableDomain: "example.com",
    firstParty: true,
    thirdParty: false,
  });
  const vendor = vendorObservation({
    observationId: "vendor_hotjar",
    vendor: "Hotjar",
    product: "Hotjar",
    purpose: "session_replay",
    matchedEvidenceIds: [cookie.eventId],
    matchedHostnames: [".example.com"],
    matchedCookieNames: ["_hjHasCachedUserAttributes"],
  });

  const journeys = buildObservedJourneys(emptyInput({
    cookieEvents: classifyCookieEvents([cookie], [vendor]),
    normalizedVendorObservations: [vendor],
  }));
  const sessionReplayJourney = journeys.find((journey) =>
    journey.purpose === "session_replay" &&
    journey.relatedCookies.includes("_hjHasCachedUserAttributes"),
  );

  assert.equal(sessionReplayJourney?.vendor, "Hotjar");
  assert.equal(sessionReplayJourney?.firstObservedConsentState, "pre_consent");
  assert.equal(sessionReplayJourney?.observedBehaviors.includes("cookie_set"), true);
});

test("builds consent management platform journey", () => {
  const script = scriptEvent({
    eventId: "script_onetrust",
    scriptUrl: "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js",
    hostname: "cdn.cookielaw.org",
    registrableDomain: "cookielaw.org",
  });
  const vendor = vendorObservation({
    observationId: "vendor_onetrust",
    vendor: "OneTrust",
    product: "OneTrust CMP",
    purpose: "consent_management",
    matchedEvidenceIds: [script.eventId],
    matchedHostnames: ["cdn.cookielaw.org"],
    matchedUrls: [script.scriptUrl ?? ""],
  });

  const journeys = buildObservedJourneys(emptyInput({
    scriptEvents: [script],
    normalizedVendorObservations: [vendor],
  }));

  assert.equal(
    journeys.some((journey) =>
      journey.observedBehaviors.includes("consent_management_observed"),
    ),
    true,
  );
});

test("builds Consentmanager CMP journey without tracker classification", () => {
  const script = scriptEvent({
    eventId: "script_consentmanager",
    scriptUrl: "https://cdn.consentmanager.net/delivery/cmp.php?id=abc123",
    hostname: "cdn.consentmanager.net",
    registrableDomain: "consentmanager.net",
  });
  const vendor = vendorObservation({
    observationId: "vendor_consentmanager",
    vendor: "Consentmanager",
    product: "Consentmanager CMP",
    purpose: "consent_management",
    matchedEvidenceIds: [script.eventId],
    matchedHostnames: ["cdn.consentmanager.net"],
    matchedUrls: [script.scriptUrl ?? ""],
  });

  const journeys = buildObservedJourneys(emptyInput({
    scriptEvents: [script],
    normalizedVendorObservations: [vendor],
  }));

  assert.equal(journeys.some((journey) => journey.journeyType === "tracker"), false);
  assert.equal(
    journeys.some((journey) =>
      journey.displayName === "Consentmanager CMP" &&
      journey.journeyType === "product" &&
      journey.observedBehaviors.includes("consent_management_observed"),
    ),
    true,
  );
});

test("generic CDN request does not become tracker journey", () => {
  const request = networkRequest({
    eventId: "net_cdn",
    requestId: "req_cdn",
    requestUrl: "https://static.examplecdn.com/app.css",
    hostname: "static.examplecdn.com",
    registrableDomain: "examplecdn.com",
    resourceType: "stylesheet",
  });

  const journeys = buildObservedJourneys(emptyInput({ networkEvents: [request] }));

  assert.equal(journeys.some((journey) => journey.journeyType === "tracker"), false);
  assert.equal(journeys.some((journey) => journey.journeyType === "endpoint"), false);
});

test("content media infrastructure vendors do not become tracker journeys by default", () => {
  const datoRequest = networkRequest({
    eventId: "net_datocms_asset",
    requestId: "req_datocms_asset",
    requestUrl: "https://www.datocms-assets.com/12345/fixture-image.jpg?auto=format",
    hostname: "www.datocms-assets.com",
    registrableDomain: "datocms-assets.com",
    resourceType: "image",
  });
  const muxRequest = networkRequest({
    eventId: "net_mux_image",
    requestId: "req_mux_image",
    requestUrl: "https://image.mux.com/abc123/thumbnail.jpg?time=1",
    hostname: "image.mux.com",
    registrableDomain: "mux.com",
    resourceType: "image",
  });
  const datoVendor = vendorObservation({
    observationId: "vendor_datocms_assets",
    vendor: "DatoCMS",
    product: "DatoCMS Assets",
    purpose: "infrastructure",
    matchedEvidenceIds: [datoRequest.eventId],
    matchedHostnames: ["www.datocms-assets.com"],
    matchedUrls: [datoRequest.requestUrl],
  });
  const muxVendor = vendorObservation({
    observationId: "vendor_mux_image",
    vendor: "Mux",
    product: "Mux Image",
    purpose: "infrastructure",
    matchedEvidenceIds: [muxRequest.eventId],
    matchedHostnames: ["image.mux.com"],
    matchedUrls: [muxRequest.requestUrl],
  });

  const journeys = buildObservedJourneys(emptyInput({
    networkEvents: [datoRequest, muxRequest],
    normalizedVendorObservations: [datoVendor, muxVendor],
  }));

  assert.equal(journeys.some((journey) => journey.journeyType === "tracker"), false);
  assert.equal(journeys.some((journey) => journey.journeyType === "endpoint"), false);
});

test("GTM container id is tag container evidence, not identifier evidence", () => {
  const signals = querySignalsFromUrl("https://www.googletagmanager.com/gtm.js?id=GTM-ABC123");

  assert.deepEqual(signals.queryParamNames, ["id"]);
  assert.deepEqual(signals.tagContainerParamNames, ["id"]);
  assert.deepEqual(signals.identifierParamNames, []);
  assert.deepEqual(signals.advertisingClickIdParamNames, []);
});

test("Google tag id is tag container evidence, not identifier evidence", () => {
  const signals = querySignalsFromUrl("https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ&cx=c");

  assert.deepEqual(signals.queryParamNames, ["id", "cx"]);
  assert.deepEqual(signals.tagContainerParamNames, ["id"]);
  assert.deepEqual(signals.identifierParamNames, []);
  assert.deepEqual(signals.advertisingClickIdParamNames, []);
});

test("Google Ads and Floodlight tag ids are tag container evidence, not identifier evidence", () => {
  const signals = querySignalsFromUrl("https://www.googletagmanager.com/gtag/js?id=DC-8168974&send_to=AW-12345");

  assert.deepEqual(signals.queryParamNames, ["id", "send_to"]);
  assert.deepEqual(signals.tagContainerParamNames, ["id", "send_to"]);
  assert.deepEqual(signals.identifierParamNames, []);
  assert.deepEqual(signals.advertisingClickIdParamNames, []);
});

test("advertising click IDs remain recognized", () => {
  const signals = querySignalsFromUrl("https://example.com/?gclid=redacted&fbclid=redacted&msclkid=redacted&ttclid=redacted&li_fat_id=redacted");

  assert.deepEqual(signals.advertisingClickIdParamNames.sort(), [
    "fbclid",
    "gclid",
    "li_fat_id",
    "msclkid",
    "ttclid",
  ]);
});

test("tag manager journey does not become tracker journey by itself", () => {
  const request = networkRequest({
    eventId: "net_gtm",
    requestId: "req_gtm",
    requestUrl: "https://www.googletagmanager.com/gtm.js?id=GTM-ABC123",
    hostname: "www.googletagmanager.com",
    registrableDomain: "googletagmanager.com",
    resourceType: "script",
    tagContainerParamNames: ["id"],
  });
  const vendor = vendorObservation({
    observationId: "vendor_gtm",
    vendor: "Google",
    product: "Google Tag Manager",
    purpose: "tag_management",
    matchedEvidenceIds: [request.eventId],
    matchedHostnames: ["www.googletagmanager.com"],
    matchedUrls: [request.requestUrl],
  });

  const journeys = buildObservedJourneys(emptyInput({
    networkEvents: [request],
    normalizedVendorObservations: [vendor],
  }));

  assert.equal(
    journeys.some((journey) => journey.observedBehaviors.includes("tag_manager_observed")),
    true,
  );
  assert.equal(journeys.some((journey) => journey.journeyType === "tracker"), false);
  assert.equal(
    journeys.some((journey) => journey.observedBehaviors.includes("identifier_parameter_observed")),
    false,
  );
});

test("resolved tvpixel endpoint creates advertising tracker journey", () => {
  const request = networkRequest({
    eventId: "net_tvpixel",
    requestId: "req_tvpixel",
    requestUrl: "https://p.tvpixel.com/com.snowplowanalytics.snowplow/tp2",
    hostname: "p.tvpixel.com",
    registrableDomain: "tvpixel.com",
    collectionEndpointObserved: true,
    endpointCategory: "runtime_collection",
  });
  const vendor = vendorObservation({
    observationId: "vendor_tvpixel",
    entity: "LiveRamp Holdings, Inc.",
    vendor: "LiveRamp",
    product: "Data Plus Math / LiveRamp",
    purpose: "advertising",
    matchedEvidenceIds: [request.eventId],
    matchedHostnames: ["p.tvpixel.com"],
    matchedUrls: [request.requestUrl],
  });

  const journeys = buildObservedJourneys(emptyInput({
    networkEvents: [request],
    normalizedVendorObservations: [vendor],
  }));
  const endpoint = journeys.find((journey) =>
    journey.journeyType === "endpoint" &&
    journey.relatedEndpoints.includes(request.requestUrl),
  );

  assert.equal(endpoint?.vendor, "LiveRamp");
  assert.equal(endpoint?.product, "Data Plus Math / LiveRamp");
  assert.equal(endpoint?.purpose, "advertising");
  assert.equal(endpoint?.attributionStatus, "resolved");
  assert.equal(endpoint?.observedBehaviors.includes("collection_endpoint_observed"), true);
  assert.equal(journeys.some((journey) => journey.journeyType === "tracker"), true);
});

test("unresolved collection-like endpoint creates endpoint journey only", () => {
  const request = networkRequest({
    eventId: "net_unknown_pixel",
    requestId: "req_unknown_pixel",
    requestUrl: "https://unknown.example.net/event?ctx=redacted",
    hostname: "unknown.example.net",
    registrableDomain: "example.net",
    collectionEndpointObserved: true,
    endpointCategory: "runtime_collection",
  });

  const journeys = buildObservedJourneys(emptyInput({ networkEvents: [request] }));
  const endpoint = journeys.find((journey) => journey.journeyType === "endpoint");

  assert.equal(endpoint?.vendor, undefined);
  assert.equal(endpoint?.purpose, undefined);
  assert.equal(endpoint?.attributionStatus, "unresolved_meaningful");
  assert.equal(endpoint?.attributionReason?.includes("without_confident_vendor_mapping"), true);
  assert.equal(endpoint?.confidence < 0.7, true);
  assert.equal(endpoint?.observedBehaviors.includes("collection_endpoint_observed"), true);
  assert.equal(journeys.some((journey) => journey.journeyType === "tracker"), false);
});

test("site-owned video ad infrastructure creates conservative endpoint journey only", () => {
  const request = networkRequest({
    eventId: "net_nbcu_video_ads",
    requestId: "req_nbcu_video_ads",
    requestUrl: "https://video-ads-module.ad-tech.nbcuni.com/collect?module=video",
    hostname: "video-ads-module.ad-tech.nbcuni.com",
    registrableDomain: "nbcuni.com",
    collectionEndpointObserved: true,
    endpointCategory: "runtime_collection",
    attributionStatus: "site_owned_infrastructure",
    attributionReason: "nbcuniversal_video_ad_infrastructure_without_third_party_vendor_attribution",
    resolverBasis: ["site_owned_affiliate:nbcuniversal"],
  });

  const journeys = buildObservedJourneys(emptyInput({ networkEvents: [request] }));
  const endpoint = journeys.find((journey) => journey.journeyType === "endpoint");

  assert.equal(endpoint?.vendor, undefined);
  assert.equal(endpoint?.purpose, undefined);
  assert.equal(endpoint?.attributionStatus, "site_owned_infrastructure");
  assert.equal(endpoint?.observedBehaviors.includes("collection_endpoint_observed"), true);
  assert.equal(journeys.some((journey) => journey.journeyType === "tracker"), false);
});

test("Google consent/tag support endpoint does not create tracker journey", () => {
  const request = networkRequest({
    eventId: "net_google_ccm",
    requestId: "req_google_ccm",
    requestUrl: "https://www.google.com/ccm/collect?gtm=redacted&gcd=redacted",
    hostname: "www.google.com",
    registrableDomain: "google.com",
    collectionEndpointObserved: true,
    endpointCategory: "google_consent_or_tag_support",
    endpointSubtype: "google_consent_or_tag_support",
    attributionStatus: "site_owned_infrastructure",
    attributionReason: "google_consent_or_tag_support",
    resolverBasis: ["google_endpoint_subtype:google_consent_or_tag_support"],
  });

  const journeys = buildObservedJourneys(emptyInput({ networkEvents: [request] }));
  const endpoint = journeys.find((journey) => journey.journeyType === "endpoint");

  assert.equal(endpoint?.endpointSubtype, "google_consent_or_tag_support");
  assert.equal(endpoint?.vendor, undefined);
  assert.equal(journeys.some((journey) => journey.journeyType === "tracker"), false);
});

test("Google-owned unresolved endpoint remains conservative unresolved review signal input", () => {
  const request = networkRequest({
    eventId: "net_google_unknown_collect",
    requestId: "req_google_unknown_collect",
    requestUrl: "https://www.google.com/collect?unknown=redacted",
    hostname: "www.google.com",
    registrableDomain: "google.com",
    collectionEndpointObserved: true,
    endpointCategory: "runtime_collection",
    endpointSubtype: "google_owned_unresolved_meaningful",
    attributionStatus: "unresolved_meaningful",
    attributionReason: "google_owned_collection_like_endpoint_without_product_attribution",
    resolverBasis: ["google_endpoint_subtype:google_owned_unresolved_meaningful"],
  });

  const journeys = buildObservedJourneys(emptyInput({ networkEvents: [request] }));
  const endpoint = journeys.find((journey) => journey.journeyType === "endpoint");

  assert.equal(endpoint?.endpointSubtype, "google_owned_unresolved_meaningful");
  assert.equal(endpoint?.attributionStatus, "unresolved_meaningful");
  assert.equal(endpoint?.vendor, undefined);
  assert.equal(journeys.some((journey) => journey.journeyType === "tracker"), false);
});

test("Google static asset infrastructure remains contextual even when retained as endpoint evidence", () => {
  const request = networkRequest({
    eventId: "net_google_static_asset",
    requestId: "req_google_static_asset",
    requestUrl: "https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON",
    hostname: "t0.gstatic.com",
    registrableDomain: "gstatic.com",
    resourceType: "image",
    collectionEndpointObserved: true,
    endpointCategory: "runtime_collection",
    endpointSubtype: "google_owned_infrastructure",
    attributionStatus: "site_owned_infrastructure",
    attributionReason: "google_owned_infrastructure",
    resolverBasis: ["google_endpoint_subtype:google_owned_infrastructure"],
  });
  const vendor = vendorObservation({
    observationId: "vendor_google_static_assets",
    vendor: "Google",
    product: "Google Static Assets",
    purpose: "infrastructure",
    matchedEvidenceIds: [request.eventId],
    matchedHostnames: ["t0.gstatic.com"],
    matchedUrls: [request.requestUrl],
  });

  const journeys = buildObservedJourneys(emptyInput({
    networkEvents: [request],
    normalizedVendorObservations: [vendor],
  }));
  const endpoint = journeys.find((journey) => journey.journeyType === "endpoint");

  assert.equal(endpoint?.vendor, "Google");
  assert.equal(endpoint?.product, "Google Static Assets");
  assert.equal(endpoint?.purpose, "infrastructure");
  assert.equal(endpoint?.endpointSubtype, "google_owned_infrastructure");
  assert.equal(journeys.some((journey) => journey.journeyType === "tracker"), false);
});

test("Google Ads measurement endpoint can create resolved advertising tracker journey", () => {
  const request = networkRequest({
    eventId: "net_google_ads_conversion",
    requestId: "req_google_ads_conversion",
    requestUrl: "https://www.google.com/pagead/1p-conversion/12345",
    hostname: "www.google.com",
    registrableDomain: "google.com",
    collectionEndpointObserved: true,
    endpointCategory: "advertising_collection",
    endpointSubtype: "google_ads_or_measurement",
    attributionStatus: "unresolved_meaningful",
    attributionReason: "google_ads_or_measurement",
    resolverBasis: ["google_endpoint_subtype:google_ads_or_measurement"],
  });
  const vendor = vendorObservation({
    observationId: "vendor_google_ads",
    vendor: "Google",
    product: "Google Ads / DoubleClick",
    purpose: "advertising",
    matchedEvidenceIds: [request.eventId],
    matchedHostnames: ["www.google.com"],
    matchedUrls: [request.requestUrl],
  });

  const journeys = buildObservedJourneys(emptyInput({
    networkEvents: [request],
    normalizedVendorObservations: [vendor],
  }));
  const endpoint = journeys.find((journey) =>
    journey.journeyType === "endpoint" &&
    journey.relatedEndpoints.includes(request.requestUrl),
  );

  assert.equal(endpoint?.endpointSubtype, "google_ads_or_measurement");
  assert.equal(endpoint?.attributionStatus, "resolved");
  assert.equal(endpoint?.purpose, "advertising");
  assert.equal(endpoint?.observedBehaviors.includes("collection_endpoint_observed"), true);
  assert.equal(journeys.some((journey) => journey.journeyType === "tracker"), true);
});

test("Google reCAPTCHA endpoint is security support, not tracker journey", () => {
  const request = networkRequest({
    eventId: "net_google_recaptcha",
    requestId: "req_google_recaptcha",
    requestUrl: "https://www.google.com/recaptcha/api2/reload?k=redacted",
    hostname: "www.google.com",
    registrableDomain: "google.com",
    resourceType: "script",
    endpointSubtype: "google_recaptcha_or_security",
    attributionStatus: "site_owned_infrastructure",
    attributionReason: "google_recaptcha_or_security",
    resolverBasis: ["google_endpoint_subtype:google_recaptcha_or_security"],
  });

  const journeys = buildObservedJourneys(emptyInput({ networkEvents: [request] }));
  const endpoint = journeys.find((journey) => journey.journeyType === "endpoint");

  assert.equal(endpoint?.endpointSubtype, "google_recaptcha_or_security");
  assert.equal(journeys.some((journey) => journey.journeyType === "tracker"), false);
});

test("classifies first-party GA, Optanon, and Akamai cookies with nuanced purposes", () => {
  const ga = cookieEvent({
    eventId: "cookie_ga",
    cookieName: "_ga",
    hostname: "example.com",
    registrableDomain: "example.com",
    firstParty: true,
    thirdParty: false,
  });
  const optanon = cookieEvent({
    eventId: "cookie_optanon",
    cookieName: "OptanonConsent",
    hostname: "example.com",
    registrableDomain: "example.com",
    firstParty: true,
    thirdParty: false,
  });
  const akamai = cookieEvent({
    eventId: "cookie_akamai",
    cookieName: "akamai_generated_location",
    hostname: "example.com",
    registrableDomain: "example.com",
    firstParty: true,
    thirdParty: false,
  });
  const vendors = [
    vendorObservation({
      observationId: "vendor_ga",
      vendor: "Google",
      product: "Google Analytics",
      purpose: "analytics",
      matchedEvidenceIds: [ga.eventId],
      matchedHostnames: ["example.com"],
      matchedCookieNames: ["_ga"],
    }),
    vendorObservation({
      observationId: "vendor_optanon",
      vendor: "OneTrust",
      product: "OneTrust CMP",
      purpose: "consent_management",
      matchedEvidenceIds: [optanon.eventId],
      matchedHostnames: ["example.com"],
      matchedCookieNames: ["OptanonConsent"],
    }),
    vendorObservation({
      observationId: "vendor_akamai",
      vendor: "Akamai",
      product: "Akamai Bot Manager / Edge",
      purpose: "security",
      matchedEvidenceIds: [akamai.eventId],
      matchedHostnames: ["example.com"],
      matchedCookieNames: ["akamai_generated_location"],
    }),
  ];

  const classified = classifyCookieEvents([ga, optanon, akamai], vendors);

  assert.equal(classified.find((event) => event.cookieName === "_ga")?.cookieParty, "first_party");
  assert.equal(classified.find((event) => event.cookieName === "_ga")?.vendorAssociated, true);
  assert.equal(classified.find((event) => event.cookieName === "OptanonConsent")?.cookiePurpose, "consent_management");
  assert.equal(classified.find((event) => event.cookieName === "akamai_generated_location")?.cookiePurpose, "security");

  const journeys = buildObservedJourneys(emptyInput({
    cookieEvents: classified,
    normalizedVendorObservations: vendors,
  }));
  assert.equal(journeys.some((journey) => journey.journeyType === "tracker"), false);
});

test("plain Sentry ingest request remains performance monitoring context, not tracker journey", () => {
  const event = networkRequest({
    eventId: "net_sentry",
    requestId: "req_sentry",
    requestUrl: "https://o514642.ingest.us.sentry.io/api/514642/envelope/",
    hostname: "o514642.ingest.us.sentry.io",
    registrableDomain: "sentry.io",
    collectionEndpointObserved: true,
    endpointCategory: "telemetry",
    attributionStatus: "resolved",
    attributionReason: "resolved_to_sentry_performance_monitoring",
    resolverBasis: ["sentry_monitoring_endpoint"],
  });
  const sentry = vendorObservation({
    observationId: "vendor_sentry",
    vendor: "Sentry",
    product: "Sentry",
    purpose: "performance_monitoring",
    matchedEvidenceIds: [event.eventId],
    matchedHostnames: ["o514642.ingest.us.sentry.io"],
    matchedUrls: [event.requestUrl],
  });

  const journeys = buildObservedJourneys(emptyInput({
    networkEvents: [event],
    normalizedVendorObservations: [sentry],
  }));

  assert.equal(journeys.some((journey) => journey.journeyType === "tracker"), false);
  assert.equal(
    journeys.some((journey) =>
      journey.purpose === "performance_monitoring" &&
      journey.observedBehaviors.includes("collection_endpoint_observed")
    ),
    true,
  );
});

function emptyInput(
  overrides: Partial<Parameters<typeof buildObservedJourneys>[0]> = {},
): Parameters<typeof buildObservedJourneys>[0] {
  return {
    networkEvents: [],
    networkResponseEvents: [],
    cookieEvents: [],
    cookieSnapshots: [],
    storageSnapshots: [],
    scriptEvents: [],
    iframeEvents: [],
    normalizedVendorObservations: [],
    ...overrides,
  };
}

function networkRequest(input: {
  eventId: string;
  requestId: string;
  requestUrl: string;
  hostname: string;
  registrableDomain: string;
  resourceType?: string;
  collectionEndpointObserved?: boolean;
  endpointCategory?: string;
  cookieHeaderPresent?: boolean;
  cookieNamesSent?: string[];
  tagContainerParamNames?: string[];
  endpointSubtype?: NetworkEvent["endpointSubtype"];
  attributionStatus?: NetworkEvent["attributionStatus"];
  attributionReason?: string;
  resolverBasis?: string[];
  endpointGeographyStatus?: NetworkEvent["endpointGeographyStatus"];
  endpointGeographyRegion?: NetworkEvent["endpointGeographyRegion"];
  endpointGeographyProvider?: NetworkEvent["endpointGeographyProvider"];
  endpointGeographyLocationLabel?: NetworkEvent["endpointGeographyLocationLabel"];
  endpointGeographyJurisdiction?: NetworkEvent["endpointGeographyJurisdiction"];
  endpointGeographyPrecision?: NetworkEvent["endpointGeographyPrecision"];
  endpointGeographyBasis?: NetworkEvent["endpointGeographyBasis"];
}): NetworkEvent {
  return {
    eventId: input.eventId,
    eventType: "network_request",
    requestId: input.requestId,
    timestampMs: 100,
    sourceScanner,
    scenario,
    consentStateAtTime: "pre_consent",
    pagePhase: "initial_navigation",
    url: input.requestUrl,
    hostname: input.hostname,
    registrableDomain: input.registrableDomain,
    firstParty: false,
    thirdParty: true,
    evidenceRefs: [],
    confidence: 0.95,
    directVsInferred: "direct",
    method: "GET",
    resourceType: input.resourceType ?? "fetch",
    requestUrl: input.requestUrl,
    normalizedUrl: input.requestUrl,
    requestHostname: input.hostname,
    path: new URL(input.requestUrl).pathname,
    queryParamNames: [...new URL(input.requestUrl).searchParams.keys()],
    identifierParamNames: [],
    advertisingClickIdParamNames: [],
    tagContainerParamNames: input.tagContainerParamNames ?? [],
    hasIdentifierLikeParameters: false,
    hasAdvertisingClickIdParameters: false,
    hasTagContainerParameters: (input.tagContainerParamNames ?? []).length > 0,
    isMainFrame: false,
    isSubFrame: false,
    isThirdParty: true,
    redirectChainRequestIds: [],
    requestHeaders: {
      cookieHeaderPresent: input.cookieHeaderPresent ?? false,
      cookieNames: input.cookieNamesSent ?? [],
      authorizationHeaderPresent: false,
    },
    cookieHeaderPresent: input.cookieHeaderPresent ?? false,
    cookieNamesSent: input.cookieNamesSent ?? [],
    authorizationHeaderPresent: false,
    collectionEndpointObserved: input.collectionEndpointObserved ?? false,
    endpointCategory: input.endpointCategory,
    endpointSubtype: input.endpointSubtype,
    attributionStatus: input.attributionStatus ?? (input.collectionEndpointObserved ? "unresolved_meaningful" : "ignored_noise"),
    attributionReason: input.attributionReason ?? (input.collectionEndpointObserved ? "collection_like_endpoint_without_confident_vendor_mapping" : "request_without_collection_or_vendor_signal"),
    resolverBasis: input.resolverBasis ?? [],
    endpointGeographyStatus: input.endpointGeographyStatus ?? (input.collectionEndpointObserved ? "not_evaluated" : undefined),
    endpointGeographyRegion: input.endpointGeographyRegion,
    endpointGeographyProvider: input.endpointGeographyProvider,
    endpointGeographyLocationLabel: input.endpointGeographyLocationLabel,
    endpointGeographyJurisdiction: input.endpointGeographyJurisdiction,
    endpointGeographyPrecision: input.endpointGeographyPrecision,
    endpointGeographyBasis: input.endpointGeographyBasis,
    relatedEvidenceRefs: [],
    requestPayloadSignals: {
      bodyPresent: false,
      bodyFieldNames: [],
    },
  };
}

function cookieEvent(input: {
  eventId: string;
  cookieName: string;
  hostname: string;
  registrableDomain: string;
  firstParty?: boolean;
  thirdParty?: boolean;
}): CookieEvent {
  return {
    eventId: input.eventId,
    eventType: "cookie",
    timestampMs: 120,
    sourceScanner,
    scenario,
    consentStateAtTime: "pre_consent",
    pagePhase: "initial_navigation",
    url: `https://${input.hostname}/set-cookie`,
    hostname: input.hostname,
    registrableDomain: input.registrableDomain,
    firstParty: input.firstParty ?? false,
    thirdParty: input.thirdParty ?? true,
    evidenceRefs: [],
    confidence: 0.95,
    directVsInferred: "direct",
    cookieName: input.cookieName,
    cookieDomain: input.hostname,
    cookiePath: "/",
    cookieParty: input.thirdParty === false ? "first_party" : "third_party",
    vendorAssociated: false,
    cookiePurpose: "unknown",
    cookieClassificationBasis: [],
    operation: "set_cookie_header",
    valueRedacted: true,
  };
}

function scriptEvent(input: {
  eventId: string;
  scriptUrl: string;
  hostname: string;
  registrableDomain: string;
}): ScriptEvent {
  return {
    eventId: input.eventId,
    eventType: "script",
    timestampMs: 90,
    sourceScanner,
    scenario,
    consentStateAtTime: "pre_consent",
    pagePhase: "dom_content_loaded",
    url: input.scriptUrl,
    hostname: input.hostname,
    registrableDomain: input.registrableDomain,
    firstParty: false,
    thirdParty: true,
    evidenceRefs: [],
    confidence: 0.9,
    directVsInferred: "direct",
    scriptUrl: input.scriptUrl,
    inline: false,
  };
}

function vendorObservation(input: {
  observationId: string;
  vendor: string;
  product: string;
  purpose: NormalizedVendorObservation["purpose"];
  matchedEvidenceIds: string[];
  matchedHostnames: string[];
  matchedUrls?: string[];
  matchedCookieNames?: string[];
}): NormalizedVendorObservation {
  return {
    observationId: input.observationId,
    entity: input.vendor === "FullStory" ? "FullStory, Inc." : input.vendor,
    vendor: input.vendor,
    product: input.product,
    purpose: input.purpose,
    confidence: 0.95,
    basis: ["fixture"],
    regulatoryRelevance: ["consent"],
    matchedEvidenceIds: input.matchedEvidenceIds,
    matchedHostnames: input.matchedHostnames,
    matchedUrls: input.matchedUrls ?? [],
    matchedCookieNames: input.matchedCookieNames ?? [],
  };
}
