import assert from "node:assert/strict";
import test from "node:test";
import { reviewEvidenceBundle } from "./index.js";
import {
  analyticsRequestEvent,
  doubleClickVendor,
  minimalBundle,
  preConsentCookieEvent,
  preConsentCookieBundle,
  sessionReplayLibraryOnlyBundle,
  thirdPartyAnalyticsRequestBundle,
} from "./fixtures.js";

test("pre-consent tracking is eligible from collection endpoint journey evidence", async () => {
  const result = await reviewEvidenceBundle(thirdPartyAnalyticsRequestBundle());

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "pre_consent_tracking_detected",
  );
  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.matchedCriteria.includes("collection_endpoint_observed"), true);
  assert.equal(
    finding?.matchedCriteria.filter((criterion) => criterion === "collection_endpoint_observed").length,
    1,
  );
  assert.equal(finding?.directVsInferred, "direct");
  assert.equal(finding?.sourceEvidenceRefs[0]?.eventId, "net_ga_collect");
  assert.equal(finding?.sourceEvidenceRefs[0]?.url, undefined);
  assert.equal(finding?.sourceEvidenceRefs[0]?.label, "www.google-analytics.com");
  assert.deepEqual(result.regulatoryReview?.areas.map((area) => area.id), ["california-privacy", "gdpr-eprivacy"]);
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const trackingRow = gdpr?.rows.find((row) => row.id === "pre_consent_third_party_tracking");
  assert.equal(trackingRow?.status, "gap_observed");
  assert.equal(trackingRow?.sourceFindingKeys.includes("pre_consent_tracking_detected"), true);
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const targetedAdvertisingRow = california?.rows.find((row) => row.id === "targeted_advertising_signals");
  const targetedAdvertisingSignal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "targeted_advertising_runtime_signal",
  );
  assert.equal(targetedAdvertisingSignal?.eligibility.status, "not_eligible");
  assert.equal(targetedAdvertisingRow?.status, "not_observed");
  const endpointTransferSignal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "endpoint_transfer_review_signal",
  );
  assert.equal(endpointTransferSignal?.eligibility.status, "eligible");
  assert.equal(endpointTransferSignal?.matchedCriteria.includes("collection_endpoint_observed"), true);
  assert.equal(endpointTransferSignal?.matchedCriteria.includes("endpoint_geography_not_evaluated"), true);
  assert.equal(
    endpointTransferSignal?.missingCorroborators.includes("Endpoint geography was explicitly not evaluated for retained endpoint evidence."),
    true,
  );
  assert.equal(endpointTransferSignal?.sourceEvidenceRefs[0]?.label, "endpoint:www.google-analytics.com");
  const crossBorderRow = gdpr?.rows.find((row) => row.id === "cross_border_endpoint_review");
  assert.equal(crossBorderRow?.status, "review_signal");
  assert.equal(crossBorderRow?.sourceFindingKeys.includes("endpoint_transfer_review_signal"), true);
  assert.match(crossBorderRow?.missingOrIncompleteSourceSignals.join(" ") ?? "", /explicitly not evaluated/i);
  assert.equal(gdpr?.rows.some((row) => row.id === "consent_choice_quality"), false);
  assert.equal(gdpr?.rows.some((row) => row.id === "runtime_vendor_disclosure_alignment"), false);
  assert.equal(gdpr?.rows.some((row) => row.id === "sensitive_surfaces_third_party_tracking"), false);
  assert.equal(california?.rows.some((row) => row.id === "sale_share_disclosure_alignment"), false);
  assert.equal(california?.rows.some((row) => row.id === "limit_use_sensitive_pi"), false);
  assert.equal(california?.rows.some((row) => row.id === "opt_out_friction_dark_patterns"), false);
  assert.equal(california?.rows.some((row) => row.id === "sensitive_forms_third_party_tracking"), false);
  assert.equal(california?.rows.some((row) => row.id === "cipa_sensitive_interaction_recording"), false);
  assert.equal(california?.rows.some((row) => row.id === "cipa_sensitive_communication_interception"), false);
  assert.equal(california?.rows.some((row) => row.id === "consumer_rights_request_methods"), false);
});

test("pre-consent tracking ignores post-accept-only tracking journeys", async () => {
  const base = thirdPartyAnalyticsRequestBundle();
  const postAcceptJourney = {
    ...base.observedJourneys[0]!,
    firstObservedConsentState: "post_accept" as const,
    consentStatesObserved: ["post_accept"] as const,
  };
  const result = await reviewEvidenceBundle({
    ...base,
    observedJourneys: [postAcceptJourney],
    derivedRuntimeSignals: {
      ...base.derivedRuntimeSignals,
      preConsentTrackingObserved: false,
    },
  });

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "pre_consent_tracking_detected",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const trackingRow = gdpr?.rows.find((row) => row.id === "pre_consent_third_party_tracking");

  assert.equal(finding?.eligibility.status, "not_eligible");
  assert.equal(trackingRow?.status, "not_observed");
});

test("cross-border endpoint review accepts bounded region-observed endpoint evidence", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      observedJourneys: [
        {
          journeyId: "journey_endpoint_region",
          journeyType: "endpoint",
          key: "endpoint:https://collector.us-east-1.amazonaws.com/collect",
          displayName: "collector.us-east-1.amazonaws.com",
          sourceScanner: "pre_consent_runtime",
          scenariosObserved: ["fresh_pre_consent"],
          firstObservedAtMs: 100,
          lastObservedAtMs: 100,
          firstObservedConsentState: "pre_consent",
          consentStatesObserved: ["pre_consent"],
          firstPartyOrThirdParty: "third_party",
          entryPoint: "https://collector.us-east-1.amazonaws.com/collect",
          relatedCookies: [],
          relatedScripts: [],
          relatedEndpoints: ["https://collector.us-east-1.amazonaws.com/collect"],
          relatedVendors: [],
          relatedVendorObservationIds: [],
          observedBehaviors: ["third_party_request_observed", "collection_endpoint_observed"],
          endpointGeographyStatus: "region_observed",
          endpointGeographyRegion: "us-east-1",
          endpointGeographyProvider: "AWS",
          endpointGeographyLocationLabel: "AWS US East (N. Virginia)",
          endpointGeographyJurisdiction: "US",
          endpointGeographyPrecision: "provider_region",
          endpointGeographyBasis: ["host_only_endpoint_geography", "aws_region_hostname", "provider_region_catalog"],
          eventRefs: [
            {
              eventId: "net_region",
              eventType: "network_request",
              timestampMs: 100,
              url: "https://collector.us-east-1.amazonaws.com/collect",
              behavior: "collection_endpoint_observed",
              thirdParty: true,
              endpointGeographyStatus: "region_observed",
              endpointGeographyRegion: "us-east-1",
              endpointGeographyProvider: "AWS",
              endpointGeographyLocationLabel: "AWS US East (N. Virginia)",
              endpointGeographyJurisdiction: "US",
              endpointGeographyPrecision: "provider_region",
              endpointGeographyBasis: ["host_only_endpoint_geography", "aws_region_hostname", "provider_region_catalog"],
            },
          ],
          phaseDeltas: [],
          confidence: 0.86,
          directVsInferred: "direct",
          evidenceRefs: [{ refId: "ref_net_region", eventId: "net_region", eventType: "network_request" }],
        },
      ],
    }),
  );

  const signal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "endpoint_transfer_review_signal",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const crossBorderRow = gdpr?.rows.find((row) => row.id === "cross_border_endpoint_review");

  assert.equal(signal?.eligibility.status, "eligible");
  assert.equal(signal?.matchedCriteria.includes("endpoint_geography_region_observed"), true);
  assert.equal(signal?.matchedCriteria.includes("endpoint_geography_region_location_observed"), true);
  assert.deepEqual(signal?.missingCorroborators, []);
  assert.equal(signal?.sourceEvidenceRefs.some((ref) => ref.label === "endpoint:collector.us-east-1.amazonaws.com"), true);
  assert.equal(signal?.sourceEvidenceRefs.some((ref) => ref.label === "endpoint location:AWS US East (N. Virginia) (US)"), true);
  assert.equal(crossBorderRow?.status, "review_signal");
  assert.equal(crossBorderRow?.evidenceCapability, "currently_supported");
  assert.equal(crossBorderRow?.evidenceRefs.includes("endpoint location:AWS US East (N. Virginia) (US)"), true);
  assert.deepEqual(crossBorderRow?.missingOrIncompleteSourceSignals, []);
});

test("cross-border endpoint review keeps region-only endpoint evidence incomplete", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      observedJourneys: [
        {
          journeyId: "journey_endpoint_region_only",
          journeyType: "endpoint",
          key: "endpoint:https://collector.us-east-1.amazonaws.com/collect",
          displayName: "collector.us-east-1.amazonaws.com",
          sourceScanner: "pre_consent_runtime",
          scenariosObserved: ["fresh_pre_consent"],
          firstObservedAtMs: 100,
          lastObservedAtMs: 100,
          firstObservedConsentState: "pre_consent",
          consentStatesObserved: ["pre_consent"],
          firstPartyOrThirdParty: "third_party",
          entryPoint: "https://collector.us-east-1.amazonaws.com/collect",
          relatedCookies: [],
          relatedScripts: [],
          relatedEndpoints: ["https://collector.us-east-1.amazonaws.com/collect"],
          relatedVendors: [],
          relatedVendorObservationIds: [],
          observedBehaviors: ["third_party_request_observed", "collection_endpoint_observed"],
          endpointGeographyStatus: "region_observed",
          endpointGeographyRegion: "us-east-1",
          endpointGeographyProvider: "AWS",
          endpointGeographyPrecision: "provider_region",
          endpointGeographyBasis: ["host_only_endpoint_geography", "aws_region_hostname"],
          eventRefs: [
            {
              eventId: "net_region_only",
              eventType: "network_request",
              timestampMs: 100,
              url: "https://collector.us-east-1.amazonaws.com/collect",
              behavior: "collection_endpoint_observed",
              thirdParty: true,
              endpointGeographyStatus: "region_observed",
              endpointGeographyRegion: "us-east-1",
              endpointGeographyProvider: "AWS",
              endpointGeographyPrecision: "provider_region",
              endpointGeographyBasis: ["host_only_endpoint_geography", "aws_region_hostname"],
            },
          ],
          phaseDeltas: [],
          confidence: 0.86,
          directVsInferred: "direct",
          evidenceRefs: [{ refId: "ref_net_region_only", eventId: "net_region_only", eventType: "network_request" }],
        },
      ],
    }),
  );

  const signal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "endpoint_transfer_review_signal",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const crossBorderRow = gdpr?.rows.find((row) => row.id === "cross_border_endpoint_review");

  assert.equal(signal?.eligibility.status, "eligible");
  assert.equal(signal?.matchedCriteria.includes("endpoint_geography_region_observed"), true);
  assert.equal(signal?.matchedCriteria.includes("endpoint_geography_region_location_observed"), false);
  assert.deepEqual(signal?.missingCorroborators, ["endpoint_geography_location_not_retained"]);
  assert.equal(signal?.confidence, 0.72);
  assert.equal(crossBorderRow?.status, "review_signal");
  assert.deepEqual(crossBorderRow?.missingOrIncompleteSourceSignals, ["endpoint_geography_location_not_retained"]);
});

test("cross-border endpoint review accepts endpoint enrichment overlay evidence", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      observedJourneys: [
        {
          journeyId: "journey_endpoint_overlay",
          journeyType: "endpoint",
          key: "endpoint:https://metrics.example.com/collect",
          displayName: "metrics.example.com",
          sourceScanner: "pre_consent_runtime",
          scenariosObserved: ["fresh_pre_consent"],
          firstObservedAtMs: 100,
          lastObservedAtMs: 100,
          firstObservedConsentState: "pre_consent",
          consentStatesObserved: ["pre_consent"],
          firstPartyOrThirdParty: "third_party",
          entryPoint: "https://metrics.example.com/collect",
          relatedCookies: [],
          relatedScripts: [],
          relatedEndpoints: ["https://metrics.example.com/collect"],
          relatedVendors: [],
          relatedVendorObservationIds: [],
          observedBehaviors: ["third_party_request_observed", "collection_endpoint_observed"],
          endpointGeographyStatus: "unknown",
          endpointGeographyBasis: ["host_only_endpoint_geography", "no_explicit_region_in_hostname"],
          eventRefs: [
            {
              eventId: "net_overlay",
              eventType: "network_request",
              timestampMs: 100,
              url: "https://metrics.example.com/collect",
              behavior: "collection_endpoint_observed",
              thirdParty: true,
              endpointGeographyStatus: "unknown",
              endpointGeographyBasis: ["host_only_endpoint_geography", "no_explicit_region_in_hostname"],
            },
          ],
          phaseDeltas: [],
          confidence: 0.86,
          directVsInferred: "direct",
          evidenceRefs: [{ refId: "ref_net_overlay", eventId: "net_overlay", eventType: "network_request" }],
        },
      ],
    }),
    {
      endpointEnrichmentOverlay: {
        overlayVersion: "certscore.endpoint_enrichment_overlay.1",
        generatedAt: "2026-06-12T10:06:00.000Z",
        sourceBundleScanId: "scan_fixture",
        sourceRegistryUpdatedAt: "2026-06-12T10:05:00.000Z",
        endpointOverlays: [
          {
            basis: ["host_only_endpoint_geography", "dns_cname_chain", "provider_region_catalog"],
            dnsCnameChain: ["abc.execute-api.us-east-1.amazonaws.com"],
            endpointGeographyJurisdiction: "US",
            endpointGeographyLocationLabel: "AWS US East (N. Virginia)",
            endpointGeographyPrecision: "provider_region",
            endpointGeographyProvider: "AWS",
            endpointGeographyRegion: "us-east-1",
            endpointGeographyStatus: "region_observed",
            hostname: "metrics.example.com",
            registryObservationCount: 3,
          },
        ],
      },
    },
  );

  const signal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "endpoint_transfer_review_signal",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const crossBorderRow = gdpr?.rows.find((row) => row.id === "cross_border_endpoint_review");

  assert.equal(signal?.eligibility.status, "eligible");
  assert.equal(signal?.matchedCriteria.includes("endpoint_geography_region_observed"), true);
  assert.equal(signal?.matchedCriteria.includes("endpoint_geography_region_location_observed"), true);
  assert.equal(signal?.matchedCriteria.includes("endpoint_geography_enrichment_overlay_applied"), true);
  assert.deepEqual(signal?.missingCorroborators, []);
  assert.equal(signal?.sourceEvidenceRefs.some((ref) => ref.label === "endpoint location:AWS US East (N. Virginia) (US)"), true);
  assert.equal(crossBorderRow?.status, "review_signal");
  assert.equal(crossBorderRow?.evidenceCapability, "currently_supported");
  assert.deepEqual(crossBorderRow?.missingOrIncompleteSourceSignals, []);
});

test("pre-consent third-party cookie is eligible from cookie journey evidence", async () => {
  const result = await reviewEvidenceBundle(preConsentCookieBundle());

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "third_party_cookie_pre_consent",
  );
  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.matchedCriteria.includes("pre_consent_cookie_journey"), true);
  assert.equal(finding?.directVsInferred, "direct");
  const targetedAdvertisingSignal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "targeted_advertising_runtime_signal",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const targetedAdvertisingRow = california?.rows.find((row) => row.id === "targeted_advertising_signals");
  assert.equal(targetedAdvertisingSignal?.eligibility.status, "eligible");
  assert.equal(targetedAdvertisingSignal?.matchedCriteria.includes("advertising_purpose_journey"), true);
  assert.equal(targetedAdvertisingSignal?.matchedCriteria.includes("advertising_purpose_vendor_resolved"), true);
  assert.equal(targetedAdvertisingSignal?.sourceEvidenceRefs.some((ref) => ref.label === "IDE"), true);
  assert.equal(targetedAdvertisingSignal?.sourceEvidenceRefs.some((ref) => ref.url), false);
  assert.equal(targetedAdvertisingRow?.status, "review_signal");
  assert.deepEqual(targetedAdvertisingRow?.sourceFindingKeys, ["targeted_advertising_runtime_signal"]);
});

test("pre-consent tag-management cookies count as non-essential cookie storage", async () => {
  const tagManagerCookie = {
    ...preConsentCookieEvent,
    eventId: "cookie_gtm",
    url: "https://www.googletagmanager.com/gtm.js",
    hostname: "www.googletagmanager.com",
    registrableDomain: "googletagmanager.com",
    cookieName: "_gtm_preview",
    cookieDomain: ".googletagmanager.com",
    associatedVendorRef: "vendor_gtm_cookie",
    cookiePurpose: "tag_management" as const,
    cookieClassificationBasis: ["third_party", "vendor:Google", "purpose:tag_management"],
  };
  const result = await reviewEvidenceBundle(
    minimalBundle({
      cookieEvents: [tagManagerCookie],
      derivedRuntimeSignals: {
        thirdPartyVendorsObserved: true,
        preConsentTrackingObserved: true,
        thirdPartyCookiesPreConsentObserved: true,
        consentBannerLikelyPresent: false,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        notes: [],
      },
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "third_party_cookie_pre_consent",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((candidate) => candidate.id === "pre_consent_cookies_storage");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.matchedCriteria.includes("non_essential_cookie_purpose_classified"), true);
  assert.equal(row?.status, "gap_observed");
});

test("security consent and unknown cookies before consent do not support cookie storage row", async () => {
  const securityCookie = {
    ...preConsentCookieEvent,
    eventId: "cookie_cf_bm",
    url: "https://www.example-cdn.com/challenge",
    hostname: "www.example-cdn.com",
    registrableDomain: "example-cdn.com",
    cookieName: "__cf_bm",
    cookieDomain: ".example-cdn.com",
    cookieParty: "third_party" as const,
    thirdParty: true,
    vendorAssociated: false,
    associatedVendorRef: undefined,
    cookiePurpose: "security" as const,
    cookieClassificationBasis: ["third_party", "name:security"],
  };
  const consentCookie = {
    ...preConsentCookieEvent,
    eventId: "cookie_optanon",
    url: "https://example.com/",
    hostname: "example.com",
    registrableDomain: "example.com",
    cookieName: "OptanonConsent",
    cookieDomain: ".example.com",
    cookieParty: "first_party" as const,
    firstParty: true,
    thirdParty: false,
    vendorAssociated: true,
    associatedVendorRef: "vendor_onetrust",
    cookiePurpose: "consent_management" as const,
    cookieClassificationBasis: ["first_party", "vendor:OneTrust", "purpose:consent_management"],
  };
  const unknownCookie = {
    ...preConsentCookieEvent,
    eventId: "cookie_datadome",
    url: "https://example.com/",
    hostname: "example.com",
    registrableDomain: "example.com",
    cookieName: "datadome",
    cookieDomain: ".example.com",
    cookieParty: "first_party" as const,
    firstParty: true,
    thirdParty: false,
    vendorAssociated: true,
    associatedVendorRef: "vendor_unknown_cookie",
    cookiePurpose: "unknown" as const,
    cookieClassificationBasis: ["first_party", "name:unknown"],
  };

  const result = await reviewEvidenceBundle(
    minimalBundle({
      cookieEvents: [securityCookie, consentCookie, unknownCookie],
      derivedRuntimeSignals: {
        thirdPartyVendorsObserved: false,
        preConsentTrackingObserved: false,
        thirdPartyCookiesPreConsentObserved: false,
        consentBannerLikelyPresent: false,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        notes: [],
      },
    }),
  );

  const thirdPartyFinding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "third_party_cookie_pre_consent",
  );
  const vendorAssociatedFinding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "vendor_associated_cookie_pre_consent",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((candidate) => candidate.id === "pre_consent_cookies_storage");

  assert.equal(thirdPartyFinding?.eligibility.status, "not_eligible");
  assert.equal(vendorAssociatedFinding?.eligibility.status, "not_eligible");
  assert.equal(row?.status, "not_observed");
});

test("pre-consent classified browser storage can support cookie storage row without cookies", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      storageSnapshots: [
        {
          artifactId: "storage_snapshot_pre_consent",
          capturedAtMs: 900,
          consentStateAtTime: "pre_consent",
          url: "https://example.com/",
          localStorage: {
            "_gcl_ls": "[redacted]",
          },
          sessionStorage: {},
          localStorageKeys: ["_gcl_ls"],
          sessionStorageKeys: [],
          valuesRedacted: true,
          evidenceRefs: [],
        },
      ],
      normalizedVendorObservations: [
        {
          observationId: "vendor_google_ads_storage",
          entity: "Google LLC",
          vendor: "Google",
          product: "Google Ads / DoubleClick",
          purpose: "advertising",
          confidence: 0.96,
          basis: ["doubleclick_ad_endpoint_or_cookie", "cmp_runtime", "storage_key_match"],
          regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
          matchedEvidenceIds: ["storage_google_ads"],
          matchedEvidenceRefs: [
            {
              refId: "ref_storage_google_ads",
              eventId: "storage_google_ads",
              eventType: "storage_snapshot",
              label: "_gcl_ls",
            },
          ],
          matchSources: [
            {
              source: "storage_key",
              sourceEventId: "storage_google_ads",
              sourceEventType: "storage_snapshot",
              sourceScanner: "pre_consent_runtime",
              scenario: "fresh_pre_consent",
              consentStateAtTime: "pre_consent",
              matchedField: "storage_key",
              matchedValueRedacted: "_gcl_ls",
              resolverBasis: ["doubleclick_ad_endpoint_or_cookie", "cmp_runtime", "storage_key_match"],
              confidence: 0.96,
            },
          ],
          matchedHostnames: [],
          matchedUrls: [],
          matchedCookieNames: [],
        },
      ],
      derivedRuntimeSignals: {
        thirdPartyVendorsObserved: true,
        preConsentTrackingObserved: true,
        thirdPartyCookiesPreConsentObserved: false,
        consentBannerLikelyPresent: false,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        notes: [],
      },
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "non_essential_storage_pre_consent",
  );
  const cookieFinding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "third_party_cookie_pre_consent",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((candidate) => candidate.id === "pre_consent_cookies_storage");

  assert.equal(cookieFinding?.eligibility.status, "not_eligible");
  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.confidence >= 0.84, true);
  assert.equal(finding?.sourceEvidenceRefs[0]?.eventType, "storage_snapshot");
  assert.equal(finding?.sourceEvidenceRefs[0]?.label, "_gcl_ls");
  assert.equal(row?.status, "gap_observed");
  assert.equal(row?.sourceFindingKeys.includes("non_essential_storage_pre_consent"), true);
});

test("consent banner observed/not observed emits evidence-scoped result", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      consentUiObservations: [
        {
          observationId: "consent_banner",
          observedAtMs: 500,
          likelyPresent: true,
          basis: ["keyword_cookie", "button_accept_detected"],
          textExcerpt: "We use cookies. Accept Reject",
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
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "consent_banner_observed_or_not_observed",
  );
  assert.equal(finding?.eligibility.status, "eligible");
  assert.deepEqual(finding?.matchedCriteria, [
    "consent_ui_likely_present",
    "consent_surface_quality:actionable_banner",
    "actionable_consent_control_observed",
  ]);
  assert.equal(finding?.confidence >= 0.82, true);
  assert.equal(finding?.directVsInferred, "direct");
  assert.equal(finding?.title.includes("violation"), false);
});

test("consent surface stays lower confidence when only keyword evidence is retained", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      consentUiObservations: [
        {
          observationId: "consent_keyword_only",
          observedAtMs: 500,
          likelyPresent: true,
          basis: ["keyword:cookie", "keyword:privacy preferences"],
          textExcerpt: "Cookie privacy preferences",
          evidenceRefs: [{ refId: "dom_ref_keyword", artifactId: "dom_keyword" }],
          confidence: 0.72,
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
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "consent_banner_observed_or_not_observed",
  );

  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.confidence, 0.62);
  assert.equal(finding?.matchedCriteria.includes("consent_surface_quality:notice_only"), true);
  assert.deepEqual(finding?.missingCorroborators, ["actionable_consent_control_evidence"]);
  assert.deepEqual(finding?.demotionReasons, ["notice_only_consent_surface_without_actionable_control"]);
});

test("consent surface reaches high confidence from retained actionable candidates", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      consentUiObservations: [
        {
          observationId: "consent_candidate_surface",
          observedAtMs: 500,
          likelyPresent: true,
          basis: ["consent_flow_action_candidates"],
          textExcerpt: "We use cookies. Accept all Reject all",
          evidenceRefs: [{ refId: "dom_ref_surface", artifactId: "dom_surface" }],
          confidence: 0.76,
        },
      ],
      consentActionCandidates: [
        {
          actionId: "accept_candidate",
          actionType: "accept_all",
          labelText: "Accept all",
          normalizedLabel: "accept all",
          visible: true,
          enabled: true,
          confidence: 0.9,
          detectionMethod: "nano_assisted_ui_classification",
          shouldClick: true,
          evidenceRefs: [
            {
              refId: "ref_accept_candidate",
              artifactId: "dom_surface",
              eventType: "dom_snapshot",
              label: "Accept all",
              excerpt: "Accept all",
            },
          ],
          screenshotArtifactRefs: [],
          assistMetadata: [],
        },
        {
          actionId: "unknown_candidate",
          actionType: "unknown",
          labelText: "Skip to content",
          normalizedLabel: "skip to content",
          visible: true,
          enabled: true,
          confidence: 0.95,
          detectionMethod: "deterministic_text",
          shouldClick: false,
          evidenceRefs: [],
          screenshotArtifactRefs: [],
          assistMetadata: [],
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
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "consent_banner_observed_or_not_observed",
  );

  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.confidence, 0.9);
  assert.deepEqual(finding?.matchedCriteria, [
    "consent_ui_likely_present",
    "consent_surface_quality:actionable_banner",
    "actionable_consent_control_observed",
    "consent_action_candidate_retained",
  ]);
  assert.deepEqual(finding?.missingCorroborators, []);
  assert.equal(finding?.sourceEvidenceRefs.some((ref) => ref.label === "Accept all"), true);
});

test("consent surface does not treat basis-only action detection as high confidence", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      consentUiObservations: [
        {
          observationId: "consent_basis_only",
          observedAtMs: 500,
          likelyPresent: true,
          basis: ["button_accept_detected"],
          confidence: 0.9,
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
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "consent_banner_observed_or_not_observed",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((reviewRow) => reviewRow.id === "consent_surface_observed");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.confidence, 0.55);
  assert.equal(finding?.matchedCriteria.includes("consent_surface_quality:keyword_only"), true);
  assert.equal(finding?.matchedCriteria.includes("actionable_consent_control_observed"), false);
  assert.deepEqual(finding?.missingCorroborators, [
    "bounded_visible_consent_surface_text",
    "actionable_consent_control_evidence",
  ]);
  assert.equal(row?.status, "checked");
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("bounded_visible_consent_surface_text"), true);
});

test("consent surface projects clean absence as not observed", async () => {
  const result = await reviewEvidenceBundle(minimalBundle());

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "consent_banner_observed_or_not_observed",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((reviewRow) => reviewRow.id === "consent_surface_observed");

  assert.equal(finding?.eligibility.status, "not_eligible");
  assert.equal(finding?.matchedCriteria.includes("consent_surface_quality:not_observed"), true);
  assert.equal(finding?.confidence, 0.55);
  assert.equal(row?.status, "not_observed");
});

test("consent surface stays medium confidence for preference control only", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      consentUiObservations: [
        {
          observationId: "consent_preference_only",
          observedAtMs: 500,
          likelyPresent: true,
          basis: ["consent_flow_action_candidates"],
          textExcerpt: "Cookie settings",
          evidenceRefs: [{ refId: "dom_ref_preference_only", artifactId: "dom_preference_only" }],
          confidence: 0.76,
        },
      ],
      consentActionCandidates: [
        {
          ...consentActionCandidate("manage_preferences", "Cookie settings"),
          actionId: "manage_candidate",
          confidence: 0.92,
          evidenceRefs: [{
            refId: "ref_manage_candidate",
            artifactId: "dom_preference_only",
            eventType: "dom_snapshot",
            label: "Cookie settings",
            excerpt: "Cookie settings",
          }],
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
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "consent_banner_observed_or_not_observed",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((reviewRow) => reviewRow.id === "consent_surface_observed");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.confidence, 0.68);
  assert.equal(finding?.matchedCriteria.includes("consent_surface_quality:preference_control_only"), true);
  assert.equal(finding?.missingCorroborators.includes("initial_consent_banner_accept_or_reject_control"), true);
  assert.equal(
    finding?.demotionReasons.includes("preference_control_observed_without_initial_banner_controls"),
    true,
  );
  assert.equal(row?.status, "checked");
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("initial_consent_banner_accept_or_reject_control"), true);
});

test("post-choice consent controls use retained preference-center runtime proof", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      scanProfile: {
        profileId: "consent",
        label: "Consent flow scan",
        targetDurationMs: 30_000,
        internalBudgetMs: 35_000,
        enabledModules: ["preConsentRuntimeScanner", "consentFlowRuntimeScanner"],
      },
      modulesRun: [
        {
          moduleName: "preConsentRuntimeScanner",
          status: "completed",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:02.000Z",
          durationMs: 2_000,
          evidenceRefs: [],
          errors: [],
        },
        {
          moduleName: "consentFlowRuntimeScanner",
          status: "completed",
          startedAt: "2026-01-01T00:00:02.000Z",
          completedAt: "2026-01-01T00:00:08.000Z",
          durationMs: 6_000,
          evidenceRefs: [],
          errors: [],
        },
      ],
      consentActionAttempts: [
        {
          attemptId: "consent_attempt_reject_preference_center",
          actionType: "reject_all",
          attempted: true,
          succeeded: true,
          viaPreferenceCenter: true,
          preferenceCenterTraversal: {
            traversalId: "preference_center_reject",
            opened: true,
            openSucceeded: true,
            secondLayerObserved: true,
            secondLayerControlCount: 3,
            rejectAllControlObserved: true,
            saveChoicesControlObserved: true,
            acceptAllControlObserved: true,
            categoryTogglesObserved: 2,
            attemptedDisableCategoryToggles: false,
            disabledCategoryToggles: 0,
            attemptedRejectViaPreferenceCenter: true,
            attemptedSaveChoices: true,
            succeeded: true,
            confidence: 0.91,
            evidenceRefs: [
              {
                refId: "ref_preference_center_dom",
                artifactId: "dom_preference_center",
                eventType: "dom_snapshot",
                label: "Cookie preference center opened",
              },
            ],
            screenshotArtifactRefs: [],
            domArtifactRefs: [],
          },
          actionProof: {
            proofVersion: "consent_action_proof.v1",
            candidateObserved: true,
            candidateLabelText: "Cookie Settings",
            candidateNormalizedActionType: "manage_preferences",
            attemptedStatus: "attempted_succeeded",
            evidenceRefs: [
              {
                refId: "ref_after_preference_center",
                artifactId: "dom_after_preference_center",
                eventType: "dom_snapshot",
                label: "Preference center saved",
              },
            ],
          },
          timestampMs: 4_000,
          scenario: "reject_all_flow",
          evidenceRefs: [
            {
              refId: "ref_reject_attempt",
              artifactId: "dom_reject_attempt",
              eventType: "dom_snapshot",
              label: "Reject via preference center",
            },
          ],
        },
      ],
    }),
  );

  const finding = result.findingCandidates.find((candidate) => candidate.findingKey === "post_choice_consent_control_observed");
  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.matchedCriteria.includes("preference_center_action_succeeded"), true);
  assert.equal((finding?.sourceEvidenceRefs.length ?? 0) >= 2, true);

  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((entry) => entry.id === "preference_withdrawal_control");
  assert.equal(row?.status, "checked");
  assert.equal(row?.evidenceCapability, "currently_supported");
  assert.equal(row?.sourceFindingKeys.includes("post_choice_consent_control_observed"), true);
  assert.equal((row?.evidenceRefs.length ?? 0) >= 2, true);
});

test("post-choice consent controls can use retained reopen-preferences proof", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      modulesRun: [
        {
          moduleName: "consentFlowRuntimeScanner",
          status: "completed",
          startedAt: "2026-01-01T00:00:02.000Z",
          completedAt: "2026-01-01T00:00:08.000Z",
          durationMs: 6_000,
          evidenceRefs: [],
          errors: [],
        },
      ],
      consentActionAttempts: [
        {
          attemptId: "consent_attempt_reopen_preferences",
          actionType: "reopen_preferences",
          attempted: true,
          succeeded: true,
          viaPreferenceCenter: true,
          preferenceCenterTraversal: {
            traversalId: "post_choice_preference_center",
            opened: true,
            openSucceeded: true,
            secondLayerObserved: true,
            secondLayerControlCount: 2,
            rejectAllControlObserved: false,
            saveChoicesControlObserved: true,
            acceptAllControlObserved: false,
            categoryTogglesObserved: 0,
            attemptedDisableCategoryToggles: false,
            disabledCategoryToggles: 0,
            attemptedRejectViaPreferenceCenter: false,
            attemptedSaveChoices: false,
            succeeded: true,
            confidence: 0.82,
            evidenceRefs: [
              {
                refId: "ref_post_choice_preference_center",
                artifactId: "dom_post_choice_preference_center",
                eventType: "dom_snapshot",
                label: "Post-choice cookie preference center opened",
              },
            ],
            screenshotArtifactRefs: [],
            domArtifactRefs: [],
          },
          actionProof: {
            proofVersion: "consent_action_proof.v1",
            candidateObserved: true,
            candidateLabelText: "Cookie Settings",
            candidateNormalizedActionType: "manage_preferences",
            attemptedStatus: "attempted_succeeded",
            evidenceRefs: [
              {
                refId: "ref_reopen_control",
                artifactId: "dom_after_initial_choice",
                eventType: "dom_snapshot",
                label: "Cookie Settings post-choice control",
              },
            ],
          },
          timestampMs: 5_000,
          scenario: "reject_all_flow",
          evidenceRefs: [
            {
              refId: "ref_reopen_attempt",
              artifactId: "dom_reopen_attempt",
              eventType: "dom_snapshot",
              label: "Post-choice reopen attempt",
            },
          ],
        },
      ],
    }),
  );

  const finding = result.findingCandidates.find((candidate) => candidate.findingKey === "post_choice_consent_control_observed");
  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.matchedCriteria.includes("preference_center_action_succeeded"), true);
  assert.equal(finding?.confidence, 0.82);

  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((entry) => entry.id === "preference_withdrawal_control");
  assert.equal(row?.status, "checked");
  assert.equal(row?.sourceFindingKeys.includes("post_choice_consent_control_observed"), true);
});

test("session replay library-only observation is demoted and inferred", async () => {
  const result = await reviewEvidenceBundle(sessionReplayLibraryOnlyBundle());

  const finding = result.findingCandidates.find(
    (candidate) =>
      candidate.findingKey === "session_replay_or_behavioral_analytics_observed",
  );
  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.matchedCriteria.includes("library_loaded_only"), true);
  assert.deepEqual(finding?.demotionReasons, [
    "library_loaded_only_without_collection_endpoint",
  ]);
  assert.equal(finding?.missingCorroborators.includes("session_replay_collection_evidence"), true);
  assert.equal(finding?.confidence, 0.62);
  assert.equal(finding?.directVsInferred, "inferred");
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((entry) => entry.id === "session_replay_fingerprinting_review");
  assert.equal(row?.status, "review_signal");
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("session_replay_collection_evidence"), true);
});

test("session replay collection evidence stays high confidence and clean", async () => {
  const collectionJourney = {
    ...sessionReplayLibraryOnlyBundle().observedJourneys[0]!,
    journeyId: "journey_fullstory_collection",
    journeyType: "endpoint" as const,
    key: "endpoint:https://rs.fullstory.com/rec/page",
    displayName: "rs.fullstory.com",
    relatedEndpoints: ["https://rs.fullstory.com/rec/page"],
    observedBehaviors: ["third_party_request_observed", "session_replay_collection_observed"] as const,
    confidence: 0.95,
    directVsInferred: "direct" as const,
  };
  const bundle = sessionReplayLibraryOnlyBundle();
  const result = await reviewEvidenceBundle({
    ...bundle,
    observedJourneys: [collectionJourney],
  });

  const finding = result.findingCandidates.find(
    (candidate) =>
      candidate.findingKey === "session_replay_or_behavioral_analytics_observed",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((entry) => entry.id === "session_replay_fingerprinting_review");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.matchedCriteria.includes("collection_endpoint_observed"), true);
  assert.equal(finding?.matchedCriteria.includes("library_loaded_only"), false);
  assert.deepEqual(finding?.missingCorroborators, []);
  assert.deepEqual(finding?.demotionReasons, []);
  assert.equal(finding?.confidence, 0.95);
  assert.equal(row?.status, "review_signal");
  assert.deepEqual(row?.missingOrIncompleteSourceSignals, []);
});

test("session replay vendor without collection evidence stays medium confidence", async () => {
  const genericReplayJourney = {
    ...sessionReplayLibraryOnlyBundle().observedJourneys[0]!,
    observedBehaviors: ["third_party_request_observed"] as const,
    confidence: 0.95,
    directVsInferred: "direct" as const,
  };
  const bundle = sessionReplayLibraryOnlyBundle();
  const result = await reviewEvidenceBundle({
    ...bundle,
    observedJourneys: [genericReplayJourney],
  });

  const finding = result.findingCandidates.find(
    (candidate) =>
      candidate.findingKey === "session_replay_or_behavioral_analytics_observed",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((entry) => entry.id === "session_replay_fingerprinting_review");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.matchedCriteria.includes("session_replay_vendor_observation"), true);
  assert.equal(finding?.matchedCriteria.includes("collection_endpoint_observed"), false);
  assert.equal(finding?.matchedCriteria.includes("session_replay_vendor_without_collection_endpoint"), true);
  assert.equal(finding?.confidence, 0.68);
  assert.equal(finding?.directVsInferred, "inferred");
  assert.deepEqual(finding?.demotionReasons, ["session_replay_vendor_observed_without_collection_endpoint"]);
  assert.equal(finding?.missingCorroborators.includes("session_replay_collection_evidence"), true);
  assert.equal(row?.status, "review_signal");
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("session_replay_collection_evidence"), true);
});

test("security performance and support endpoints do not support tracker findings by default", async () => {
  for (const purpose of ["security", "performance_monitoring", "customer_support"] as const) {
    const bundle = minimalBundle({
      normalizedVendorObservations: [nonTrackerSupportVendor(purpose)],
      observedJourneys: [nonTrackerSupportJourney(purpose)],
      derivedRuntimeSignals: {
        thirdPartyVendorsObserved: true,
        preConsentTrackingObserved: false,
        thirdPartyCookiesPreConsentObserved: false,
        consentBannerLikelyPresent: false,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        journeySummary: {
          journeyCount: 1,
          vendorJourneyCount: 1,
          productJourneyCount: 0,
          trackerJourneyCount: 0,
          cookieJourneyCount: 0,
          scriptJourneyCount: 0,
          endpointJourneyCount: 0,
          activeCollectionJourneyCount: 1,
          consentManagementJourneyCount: 0,
          notes: [],
        },
        notes: [],
      },
    });
    const result = await reviewEvidenceBundle(bundle);

    assert.equal(
      result.findingCandidates.find((candidate) => candidate.findingKey === "pre_consent_tracking_detected")?.eligibility.status,
      "not_eligible",
      purpose,
    );
    assert.equal(
      result.findingCandidates.find((candidate) => candidate.findingKey === "third_party_vendors_observed")?.eligibility.status,
      "not_eligible",
      purpose,
    );
    assert.equal(
      result.findingCandidates.find((candidate) => candidate.findingKey === "targeted_advertising_runtime_signal")?.eligibility.status,
      "not_eligible",
      purpose,
    );
  }
});

test("runtime findings defer when the pre-consent scanner did not run", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      modulesRun: [],
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "pre_consent_tracking_detected",
  );
  assert.equal(finding?.eligibility.status, "deferred");
  assert.equal(
    result.coverageLimitations.some(
      (limitation) => limitation.limitationKey === "pre_consent_runtime_not_run",
    ),
    true,
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  assert.equal(california?.rows.find((row) => row.id === "targeted_advertising_signals")?.status, "not_testable");
});

test("regulatory review projects policy surfaces conservatively", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      scanProfile: {
        profileId: "policy",
        label: "Policy scan",
        targetDurationMs: 12_000,
        internalBudgetMs: 15_000,
        enabledModules: ["policySurfaceScanner"],
      },
      modulesRun: [
        {
          moduleName: "policySurfaceScanner",
          status: "completed",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:02.000Z",
          durationMs: 2_000,
          evidenceRefs: [],
          errors: [],
        },
      ],
      policySurfaceObservations: [
        {
          observationId: "privacy_policy",
          surfaceType: "privacy_policy",
          url: "https://example.com/privacy",
          normalizedUrl: "https://example.com/privacy",
          status: "observed",
          observedTopics: ["cookies"],
          evidenceRefs: [{ refId: "policy_ref", artifactId: "policy_artifact", label: "Privacy policy link" }],
          confidence: 0.92,
        },
        {
          observationId: "do_not_sell_share",
          surfaceType: "do_not_sell_or_share",
          url: "https://example.com/do-not-sell",
          normalizedUrl: "https://example.com/do-not-sell",
          status: "fetched",
          observedTopics: ["do_not_sell_or_share", "sale_or_share"],
          textExcerpt: "Do Not Sell or Share My Personal Information.",
          evidenceRefs: [{
            refId: "dns_ref",
            artifactId: "dns_artifact",
            label: "Do Not Sell or Share link",
            excerpt: "Do Not Sell or Share My Personal Information.",
          }],
          confidence: 0.9,
          directVsInferred: "direct",
        },
      ],
    }),
  );

  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  assert.equal(california?.rows.find((row) => row.id === "privacy_notice_availability")?.status, "checked");
  const doNotSellFinding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "do_not_sell_or_share_link_observed",
  );
  assert.equal(doNotSellFinding?.eligibility.status, "eligible");
  assert.equal(doNotSellFinding?.matchedCriteria.includes("explicit_do_not_sell_share_surface_observed"), true);
  assert.equal((doNotSellFinding?.confidence ?? 0) >= 0.82, true);
  assert.deepEqual(doNotSellFinding?.missingCorroborators, []);
  const doNotSellShare = california?.rows.find((row) => row.id === "do_not_sell_share_availability");
  assert.equal(doNotSellShare?.status, "checked");
  assert.equal(doNotSellShare?.evidenceCapability, "currently_supported");
  assert.deepEqual(doNotSellShare?.sourceFindingKeys, ["do_not_sell_or_share_link_observed"]);
  assert.equal(doNotSellShare?.evidenceRefs.includes("Do Not Sell or Share link"), true);
  assert.equal(california?.rows.find((row) => row.id === "targeted_advertising_signals")?.status, "not_testable");
});

test("Do Not Sell or Share availability accepts contextual Your Privacy Choices surfaces", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "privacy_choices_sale_context",
          surfaceType: "your_privacy_choices",
          normalizedUrl: "https://example.com/privacy-choices",
          url: "https://example.com/privacy-choices",
          linkText: "Your Privacy Choices",
          title: "Your Privacy Choices",
          textExcerpt: "Your Privacy Choices. You may opt out of sale or sharing and targeted advertising.",
          observedTopics: ["sale_or_share", "targeted_advertising"],
          evidenceRefs: [{
            refId: "ref_privacy_choices_sale_context",
            artifactId: "artifact_privacy_choices_sale_context",
            eventType: "policy_surface",
            url: "https://example.com/privacy-choices",
            label: "Your Privacy Choices sale/share context",
            excerpt: "You may opt out of sale or sharing and targeted advertising.",
          }],
          confidence: 0.84,
        }),
      ],
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "do_not_sell_or_share_link_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((candidateRow) => candidateRow.id === "do_not_sell_share_availability");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.matchedCriteria.includes("privacy_choices_surface_with_sale_share_context_observed"), true);
  assert.equal((finding?.confidence ?? 0) >= 0.82, true);
  assert.deepEqual(finding?.missingCorroborators, []);
  assert.equal(row?.status, "checked");
  assert.deepEqual(row?.missingOrIncompleteSourceSignals, []);
  assert.equal(row?.evidenceRefs.includes("Your Privacy Choices sale/share context"), true);
});

test("Do Not Sell or Share availability combines privacy choices link with bounded sale/share policy context", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "privacy_choices_link_only",
          surfaceType: "your_privacy_choices",
          normalizedUrl: "https://example.com/privacy-choices",
          url: "https://example.com/privacy-choices",
          linkText: "Your Privacy Choices",
          title: "Your Privacy Choices",
          textExcerpt: "",
          evidenceRefs: [{
            refId: "ref_privacy_choices_link_only",
            artifactId: "artifact_privacy_choices_link_only",
            eventType: "policy_surface",
            url: "https://example.com/privacy-choices",
            label: "Your Privacy Choices link",
          }],
          confidence: 0.7,
        }),
        policyObservation({
          observationId: "privacy_notice_sale_share_context",
          surfaceType: "privacy_policy",
          normalizedUrl: "https://example.com/privacy",
          url: "https://example.com/privacy",
          linkText: "Privacy Notice",
          title: "Privacy Notice",
          textExcerpt: "You may opt out of sale or sharing and targeted advertising by clicking Your Privacy Choices or by using Global Privacy Control.",
          observedTopics: ["sale_or_share", "targeted_advertising", "global_privacy_control"],
          mentionedRights: ["do_not_sell_or_share"],
          evidenceRefs: [{
            refId: "ref_privacy_notice_sale_share_context",
            artifactId: "artifact_privacy_notice_sale_share_context",
            eventType: "policy_surface",
            url: "https://example.com/privacy",
            label: "Privacy notice sale/share context",
            excerpt: "You may opt out of sale or sharing and targeted advertising by clicking Your Privacy Choices or by using Global Privacy Control.",
          }],
          confidence: 0.88,
        }),
      ],
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "do_not_sell_or_share_link_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((candidateRow) => candidateRow.id === "do_not_sell_share_availability");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(
    finding?.matchedCriteria.includes("privacy_choices_surface_with_policy_sale_share_context_observed"),
    true,
  );
  assert.equal(finding?.matchedCriteria.includes("bounded_sale_share_policy_context_retained"), true);
  assert.deepEqual(finding?.missingCorroborators, []);
  assert.equal(finding?.demotionReasons.includes("privacy_choices_surface_without_sale_share_context"), false);
  assert.equal((finding?.confidence ?? 0) >= 0.82, true);
  assert.equal(row?.status, "checked");
  assert.deepEqual(row?.missingOrIncompleteSourceSignals, []);
  assert.equal(row?.evidenceRefs.includes("Your Privacy Choices link"), true);
  assert.equal(row?.evidenceRefs.includes("Privacy notice sale/share context"), true);
});

test("Do Not Sell or Share availability accepts bounded policy text when topic tagging missed it", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "privacy_policy_direct_dns_text",
          surfaceType: "privacy_policy",
          normalizedUrl: "https://example.com/privacy",
          url: "https://example.com/privacy",
          linkText: "Privacy Policy",
          title: "Privacy Policy",
          textExcerpt: "California residents may opt out of the sale or sharing of personal information by using the Do Not Sell or Share link.",
          observedTopics: ["california_privacy_rights"],
          mentionedRights: [],
          evidenceRefs: [{
            refId: "ref_privacy_policy_direct_dns_text",
            artifactId: "artifact_privacy_policy_direct_dns_text",
            eventType: "policy_surface",
            url: "https://example.com/privacy",
            label: "Privacy policy direct sale/share opt-out text",
            excerpt: "California residents may opt out of the sale or sharing of personal information by using the Do Not Sell or Share link.",
          }],
          confidence: 0.86,
        }),
      ],
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "do_not_sell_or_share_link_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((candidateRow) => candidateRow.id === "do_not_sell_share_availability");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.matchedCriteria.includes("explicit_do_not_sell_share_policy_text_observed"), true);
  assert.equal(finding?.matchedCriteria.includes("bounded_sale_share_policy_context_retained"), true);
  assert.deepEqual(finding?.missingCorroborators, []);
  assert.equal((finding?.confidence ?? 0) >= 0.82, true);
  assert.equal(row?.status, "checked");
  assert.deepEqual(row?.missingOrIncompleteSourceSignals, []);
  assert.equal(row?.evidenceRefs.includes("Privacy policy direct sale/share opt-out text"), true);
});

test("Do Not Sell or Share availability demotes ambiguous Your Privacy Choices surfaces", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "privacy_choices_ambiguous",
          surfaceType: "your_privacy_choices",
          normalizedUrl: "https://example.com/privacy-choices",
          url: "https://example.com/privacy-choices",
          linkText: "Your Privacy Choices",
          title: "Your Privacy Choices",
          textExcerpt: "Your Privacy Choices. Manage your privacy preferences.",
          evidenceRefs: [{
            refId: "ref_privacy_choices_ambiguous",
            artifactId: "artifact_privacy_choices_ambiguous",
            eventType: "policy_surface",
            url: "https://example.com/privacy-choices",
            excerpt: "Manage your privacy preferences.",
          }],
          confidence: 0.84,
        }),
      ],
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "do_not_sell_or_share_link_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((candidateRow) => candidateRow.id === "do_not_sell_share_availability");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.matchedCriteria.includes("privacy_choices_surface_observed_without_sale_share_context"), true);
  assert.equal(finding?.demotionReasons.includes("privacy_choices_surface_without_sale_share_context"), true);
  assert.deepEqual(finding?.missingCorroborators, ["sale_share_or_opt_out_context"]);
  assert.equal(finding?.confidence, 0.62);
  assert.equal(row?.status, "checked");
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("sale_share_or_opt_out_context"), true);
});

test("runtime coverage limitation distinguishes empty completed runtime from clean absence", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      runtimeCoverage: {
        coverageStatus: "limited_none",
        limitationKeys: ["silent_empty_runtime_completed"],
        fallbackModesUsed: [],
        observationCounts: {
          networkEvents: 0,
          thirdPartyRequests: 0,
          cookieEvents: 0,
          cookiesBeforeConsent: 0,
          normalizedVendors: 0,
          observedJourneys: 0,
        },
        silentEmpty: true,
        notes: [],
      },
    }),
  );

  assert.equal(
    result.coverageLimitations.some(
      (limitation) => limitation.limitationKey === "runtime_coverage_limited_none",
    ),
    true,
  );
  assert.equal(
    result.coverageLimitations.some(
      (limitation) => limitation.limitationKey === "silent_empty_runtime_completed",
    ),
    true,
  );
  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "pre_consent_tracking_detected",
  );
  assert.equal(finding?.eligibility.status, "deferred");
  assert.deepEqual(finding?.eligibility.reasons, ["runtime_coverage_limited_none"]);
  assert.equal(
    finding?.coverageLimitations.some(
      (limitation) => limitation.limitationKey === "silent_empty_runtime_completed",
    ),
    true,
  );
});

function nonTrackerSupportVendor(
  purpose: "security" | "performance_monitoring" | "customer_support",
): ReturnType<typeof minimalBundle>["normalizedVendorObservations"][number] {
  return {
    observationId: `vendor_${purpose}`,
    entity: "Support Vendor Inc.",
    vendor: "Support Vendor",
    product: `Support ${purpose}`,
    purpose,
    confidence: 0.92,
    basis: [`${purpose}_endpoint`],
    regulatoryRelevance: [purpose],
    matchedEvidenceIds: [`net_${purpose}`],
    matchedEvidenceRefs: [{ refId: `ref_net_${purpose}`, eventId: `net_${purpose}`, eventType: "network_request" }],
    matchSources: [{
      source: "network_request",
      sourceEventId: `net_${purpose}`,
      sourceEventType: "network_request",
      sourceScanner: "pre_consent_runtime",
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
      matchedField: "hostname",
      matchedValueRedacted: `${purpose}.example.test`,
      resolverBasis: [`${purpose}_endpoint`],
      confidence: 0.92,
    }],
    matchedHostnames: [`${purpose}.example.test`],
    matchedUrls: [`https://${purpose}.example.test/collect`],
    matchedCookieNames: [],
  };
}

function nonTrackerSupportJourney(
  purpose: "security" | "performance_monitoring" | "customer_support",
): ReturnType<typeof minimalBundle>["observedJourneys"][number] {
  return {
    journeyId: `journey_${purpose}`,
    journeyType: "vendor",
    key: `vendor:${purpose}`,
    displayName: `Support ${purpose}`,
    entity: "Support Vendor Inc.",
    vendor: "Support Vendor",
    product: `Support ${purpose}`,
    purpose,
    sourceScanner: "pre_consent_runtime",
    scenariosObserved: ["fresh_pre_consent"],
    firstObservedAtMs: 1,
    lastObservedAtMs: 1,
    firstObservedConsentState: "pre_consent",
    consentStatesObserved: ["pre_consent"],
    firstPartyOrThirdParty: "third_party",
    entryPoint: `https://${purpose}.example.test/collect`,
    entryPointSourceEventId: `net_${purpose}`,
    relatedCookies: [],
    relatedScripts: [],
    relatedEndpoints: [`https://${purpose}.example.test/collect`],
    relatedVendors: ["Support Vendor"],
    relatedVendorObservationIds: [`vendor_${purpose}`],
    observedBehaviors: ["third_party_request_observed", "collection_endpoint_observed"],
    eventRefs: [{
      eventId: `net_${purpose}`,
      eventType: "network_request",
      timestampMs: 1,
      url: `https://${purpose}.example.test/collect`,
      behavior: "collection_endpoint_observed",
    }],
    phaseDeltas: [],
    confidence: 0.92,
    directVsInferred: "direct",
    evidenceRefs: [{ refId: `ref_net_${purpose}`, eventId: `net_${purpose}`, eventType: "network_request" }],
  };
}

test("coverage limitations report consent-flow and policy-surface modules as out of scope", async () => {
  const result = await reviewEvidenceBundle(thirdPartyAnalyticsRequestBundle());

  assert.equal(
    result.coverageLimitations.some(
      (limitation) => limitation.limitationKey === "consent_flow_not_run",
    ),
    true,
  );
  assert.equal(
    result.coverageLimitations.some(
      (limitation) => limitation.limitationKey === "policy_surface_not_run",
    ),
    true,
  );
});

test("policy-surface candidates defer when the policy scanner did not run", async () => {
  const result = await reviewEvidenceBundle(minimalBundle());

  const privacy = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "privacy_notice_observed_or_not_observed",
  );
  const alignment = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "policy_runtime_vendor_alignment_review_signal",
  );

  assert.equal(privacy?.eligibility.status, "deferred");
  assert.equal(alignment?.eligibility.status, "deferred");
  assert.equal(
    result.coverageLimitations.some(
      (limitation) => limitation.limitationKey === "policy_surface_not_run",
    ),
    true,
  );
});

test("policy-surface evidence produces conservative observed review candidates", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_privacy",
          surfaceType: "privacy_policy",
          normalizedUrl: "https://example.com/privacy",
          textExcerpt: "Privacy Policy. We use cookies and Google Analytics.",
          observedTopics: ["analytics", "cookies"],
          mentionedVendors: ["Google Analytics"],
        }),
        policyObservation({
          observationId: "policy_choices",
          surfaceType: "your_privacy_choices",
          normalizedUrl: "https://example.com/privacy-choices",
          textExcerpt: "Your Privacy Choices. Global Privacy Control is honored.",
          observedTopics: ["global_privacy_control", "sale_or_share"],
        }),
        policyObservation({
          observationId: "policy_notice_at_collection",
          surfaceType: "notice_at_collection",
          normalizedUrl: "https://example.com/notice-at-collection",
          textExcerpt: "Notice at Collection. Sensitive personal information may be collected.",
          observedTopics: ["notice_at_collection", "sensitive_personal_information"],
        }),
        policyObservation({
          observationId: "policy_ai",
          surfaceType: "ai_disclosure",
          normalizedUrl: "https://example.com/ai",
          textExcerpt: "Artificial intelligence features may generate summaries.",
          observedTopics: ["ai_features"],
        }),
      ],
    }),
  );

  for (const findingKey of [
    "privacy_notice_observed_or_not_observed",
    "privacy_choices_link_observed",
    "gpc_disclosure_observed",
    "notice_at_collection_observed",
    "policy_vendor_mentions_observed",
    "ai_disclosure_observed_or_not_observed",
  ]) {
    const finding = result.findingCandidates.find((candidate) => candidate.findingKey === findingKey);
    assert.equal(finding?.eligibility.status, "eligible", findingKey);
    assert.ok((finding?.evidenceExcerptIds.length ?? 0) > 0, findingKey);
  }

  assert.equal(
    result.evidenceExcerpts.some((excerpt) =>
      excerpt.evidenceKind === "policy_surface_placeholder" &&
      excerpt.displayValueRedacted?.includes("Privacy Policy"),
    ),
    true,
  );
  assert.equal(
    JSON.stringify(result).includes("This would be a full policy dump"),
    false,
  );
});

test("privacy notice availability reaches strong confidence with fetched bounded notice evidence", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_privacy_notice",
          surfaceType: "privacy_policy",
          linkText: "Privacy Policy",
          normalizedUrl: "https://example.com/privacy",
          title: "Privacy Policy",
          textExcerpt: "Privacy Policy. We collect identifiers and describe consumer privacy rights.",
          observedTopics: ["california_privacy_rights", "cookies"],
          confidence: 0.86,
        }),
      ],
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "privacy_notice_observed_or_not_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((reviewRow) => reviewRow.id === "privacy_notice_availability");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.ok((finding?.confidence ?? 0) >= 0.82);
  assert.equal(finding?.matchedCriteria.includes("privacy_notice_bounded_excerpt_retained"), true);
  assert.equal(finding?.missingCorroborators.length, 0);
  assert.ok((finding?.sourceEvidenceRefs.length ?? 0) >= 4);
  assert.equal(row?.status, "checked");
  assert.equal(row?.missingOrIncompleteSourceSignals.length, 0);
  assert.ok((row?.evidenceRefs.length ?? 0) >= 4);
});

test("privacy notice availability stays medium confidence for link-only policy surfaces", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_privacy_link_only",
          surfaceType: "privacy_policy",
          linkText: "Privacy Policy",
          normalizedUrl: "https://example.com/privacy",
          title: "Privacy Policy",
          textExcerpt: undefined,
          boundedTextExcerptIds: [],
          observedTopics: [],
          evidenceRefs: [{
            refId: "ref_policy_privacy_link_only",
            eventType: "policy_surface",
            label: "Privacy Policy link",
            url: "https://example.com/privacy",
          }],
          confidence: 0.9,
        }),
      ],
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "privacy_notice_observed_or_not_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((reviewRow) => reviewRow.id === "privacy_notice_availability");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.confidence, 0.62);
  assert.equal(
    finding?.matchedCriteria.includes("privacy_notice_link_or_surface_observed_without_bounded_excerpt"),
    true,
  );
  assert.equal(finding?.missingCorroborators.includes("bounded_privacy_notice_excerpt"), true);
  assert.equal(
    finding?.demotionReasons.includes("privacy_notice_observed_without_bounded_excerpt"),
    true,
  );
  assert.equal(row?.status, "checked");
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("bounded_privacy_notice_excerpt"), true);
});

test("cookie notice availability reaches strong confidence with fetched bounded cookie policy evidence", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_cookie_notice",
          surfaceType: "cookie_policy",
          linkText: "Cookie Policy",
          normalizedUrl: "https://example.com/cookie-policy",
          title: "Cookie Policy",
          textExcerpt: "Cookie Policy. We use cookies for analytics and advertising.",
          observedTopics: ["cookies", "analytics", "advertising"],
          confidence: 0.86,
        }),
      ],
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "cookie_policy_observed_or_not_observed",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((reviewRow) => reviewRow.id === "cookie_notice_availability");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.ok((finding?.confidence ?? 0) >= 0.82);
  assert.equal(finding?.matchedCriteria.includes("cookie_policy_bounded_excerpt_retained"), true);
  assert.equal(finding?.missingCorroborators.length, 0);
  assert.ok((finding?.sourceEvidenceRefs.length ?? 0) >= 4);
  assert.equal(row?.status, "checked");
  assert.equal(row?.missingOrIncompleteSourceSignals.length, 0);
  assert.ok((row?.evidenceRefs.length ?? 0) >= 4);
});

test("cookie notice availability stays lower confidence for cookie settings only", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_cookie_settings_only",
          surfaceType: "cookie_settings",
          linkText: "Cookie Settings",
          normalizedUrl: "https://example.com/",
          title: "Cookie Settings",
          status: "observed",
          textExcerpt: undefined,
          boundedTextExcerptIds: [],
          observedTopics: ["cookie_settings"],
          evidenceRefs: [{
            refId: "ref_cookie_settings_only",
            eventType: "policy_surface",
            label: "Cookie Settings link",
            url: "https://example.com/",
          }],
          confidence: 0.9,
        }),
      ],
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "cookie_policy_observed_or_not_observed",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((reviewRow) => reviewRow.id === "cookie_notice_availability");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.confidence, 0.58);
  assert.equal(finding?.matchedCriteria.includes("cookie_settings_or_preferences_surface_observed"), true);
  assert.equal(finding?.missingCorroborators.includes("bounded_cookie_policy_or_cookie_notice"), true);
  assert.equal(
    finding?.demotionReasons.includes("cookie_control_observed_without_cookie_policy"),
    true,
  );
  assert.equal(row?.status, "checked");
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("bounded_cookie_policy_or_cookie_notice"), true);
});

test("cookie notice availability accepts bounded privacy policy reference to a cookie notice", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_privacy_cookie_notice_reference",
          surfaceType: "privacy_policy",
          linkText: "Privacy Policy",
          normalizedUrl: "https://example.com/privacy",
          title: "Privacy Policy",
          textExcerpt: "Privacy Policy. Our Cookies Notice explains how we use cookies for analytics, advertising, and consent preferences.",
          observedTopics: ["cookies", "analytics", "advertising"],
          confidence: 0.84,
        }),
      ],
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "cookie_policy_observed_or_not_observed",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((reviewRow) => reviewRow.id === "cookie_notice_availability");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.ok((finding?.confidence ?? 0) >= 0.82);
  assert.equal(finding?.matchedCriteria.includes("privacy_policy_cookie_notice_reference_observed"), true);
  assert.equal(finding?.matchedCriteria.includes("cookie_notice_reference_bounded_excerpt_retained"), true);
  assert.equal(finding?.missingCorroborators.length, 0);
  assert.equal(row?.status, "checked");
  assert.equal(row?.missingOrIncompleteSourceSignals.length, 0);
});

test("cookie notice availability accepts bounded cookie notice text when topic tagging missed it", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_cookie_notice_topic_missed",
          surfaceType: "privacy_policy",
          linkText: "Privacy Policy",
          normalizedUrl: "https://example.com/privacy",
          title: "Privacy Policy",
          textExcerpt: "Our Cookie Notice explains how cookies support analytics, advertising, consent preferences, and necessary storage.",
          observedTopics: ["analytics"],
          mentionedControls: ["Cookie Notice"],
          confidence: 0.84,
        }),
      ],
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "cookie_policy_observed_or_not_observed",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((reviewRow) => reviewRow.id === "cookie_notice_availability");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.matchedCriteria.includes("cookie_policy_surface_observed"), true);
  assert.equal(finding?.matchedCriteria.includes("cookie_policy_bounded_excerpt_retained"), true);
  assert.equal(finding?.missingCorroborators.length, 0);
  assert.equal(row?.status, "checked");
  assert.equal(row?.missingOrIncompleteSourceSignals.length, 0);
});

test("cookie notice availability demotes generic privacy policy cookie mentions", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_privacy_cookie_mention",
          surfaceType: "cookie_policy",
          linkText: "Privacy Policy",
          normalizedUrl: "https://example.com/privacy",
          title: "Privacy Policy",
          textExcerpt: "Privacy Policy. We use cookies and analytics technologies on our services.",
          observedTopics: ["cookies", "analytics"],
          confidence: 0.9,
        }),
      ],
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "cookie_policy_observed_or_not_observed",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((reviewRow) => reviewRow.id === "cookie_notice_availability");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.confidence, 0.62);
  assert.equal(finding?.matchedCriteria.includes("generic_policy_cookie_mention_observed"), true);
  assert.equal(finding?.matchedCriteria.includes("cookie_policy_bounded_excerpt_retained"), false);
  assert.equal(finding?.missingCorroborators.includes("cookie_specific_notice_surface"), true);
  assert.equal(
    finding?.demotionReasons.includes("generic_policy_cookie_mention_without_cookie_specific_notice"),
    true,
  );
  assert.equal(row?.status, "checked");
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("cookie_specific_notice_surface"), true);
});

test("notice at collection reaches strong confidence only for explicit notice surfaces", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_notice_at_collection",
          surfaceType: "notice_at_collection",
          linkText: "Notice at Collection",
          normalizedUrl: "https://example.com/privacy/notice-at-collection",
          title: "Notice at Collection",
          textExcerpt: "Notice at Collection. We collect identifiers and commercial information.",
          observedTopics: ["notice_at_collection", "california_privacy_rights"],
          confidence: 0.84,
        }),
      ],
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "notice_at_collection_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((reviewRow) => reviewRow.id === "notice_at_collection");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.ok((finding?.confidence ?? 0) >= 0.82);
  assert.equal(finding?.matchedCriteria.includes("notice_at_collection_surface_observed"), true);
  assert.equal(finding?.missingCorroborators.length, 0);
  assert.ok((finding?.sourceEvidenceRefs.length ?? 0) >= 3);
  assert.equal(row?.status, "checked");
  assert.equal(row?.missingOrIncompleteSourceSignals.length, 0);
  assert.ok((row?.evidenceRefs.length ?? 0) >= 3);
});

test("notice at collection accepts bounded collection-context text when topic tagging missed it", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_collection_context_notice",
          surfaceType: "privacy_policy",
          linkText: "Privacy Policy",
          normalizedUrl: "https://example.com/privacy",
          title: "Privacy Policy",
          textExcerpt: "Notice at Collection: before you submit this form, we describe the categories of personal information collected.",
          observedTopics: ["california_privacy_rights"],
          confidence: 0.84,
        }),
      ],
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "notice_at_collection_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((reviewRow) => reviewRow.id === "notice_at_collection");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.matchedCriteria.includes("notice_at_collection_text_or_link_observed"), true);
  assert.equal(finding?.matchedCriteria.includes("notice_at_collection_surface_observed"), true);
  assert.equal(finding?.missingCorroborators.length, 0);
  assert.equal((finding?.confidence ?? 0) >= 0.82, true);
  assert.equal(row?.status, "checked");
  assert.equal(row?.missingOrIncompleteSourceSignals.length, 0);
});

test("notice at collection stays medium confidence for generic privacy policy mentions", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_generic_notice_mention",
          surfaceType: "privacy_policy",
          linkText: "Privacy Policy",
          normalizedUrl: "https://example.com/privacy",
          title: "Privacy Policy",
          textExcerpt: "Privacy Policy. This policy includes our notice at collection for California residents.",
          observedTopics: ["notice_at_collection", "california_privacy_rights"],
          confidence: 0.92,
        }),
      ],
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "notice_at_collection_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((reviewRow) => reviewRow.id === "notice_at_collection");

  assert.equal(finding?.eligibility.status, "eligible");
  assert.equal(finding?.confidence, 0.62);
  assert.equal(finding?.matchedCriteria.includes("generic_policy_notice_at_collection_topic"), true);
  assert.equal(finding?.missingCorroborators.includes("contextual_notice_at_collection_surface"), true);
  assert.equal(
    finding?.demotionReasons.includes("generic_policy_text_only_without_contextual_notice_surface"),
    true,
  );
  assert.equal(row?.status, "checked");
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("contextual_notice_at_collection_surface"), true);
});

test("notice at collection keeps unrelated collection language out of scope", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_unrelated_collection",
          surfaceType: "privacy_policy",
          linkText: "Privacy Policy",
          normalizedUrl: "https://example.com/privacy",
          title: "Privacy Policy",
          textExcerpt: "Our collection of articles includes product reviews and editorial newsletters.",
          observedTopics: ["california_privacy_rights"],
          confidence: 0.84,
        }),
      ],
    }),
  );

  const finding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "notice_at_collection_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((reviewRow) => reviewRow.id === "notice_at_collection");

  assert.equal(finding?.eligibility.status, "not_eligible");
  assert.equal(finding?.matchedCriteria.includes("notice_at_collection_text_or_link_observed"), false);
  assert.equal(finding?.missingCorroborators.includes("policy_topic:notice_at_collection"), true);
  assert.equal(row?.status, "not_observed");
});

test("GPC row gains stronger evidence only when disclosure and runtime probe are retained", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      modulesRun: [
        policyModuleRun(),
        consentFlowModuleRun(),
      ],
      networkEvents: [{
        ...analyticsRequestEvent,
        eventId: "net_gpc_probe",
        requestId: "req_gpc_probe",
        sourceScanner: "consent_flow_runtime",
        scenario: "gpc_enabled",
        requestHeaders: {
          ...analyticsRequestEvent.requestHeaders,
          secGpc: "1",
          dnt: "1",
        },
      }],
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_gpc",
          surfaceType: "privacy_policy",
          normalizedUrl: "https://example.com/privacy",
          textExcerpt: "Global Privacy Control signals are honored as opt-out preference signals.",
          observedTopics: ["global_privacy_control", "sale_or_share"],
        }),
      ],
    }),
  );

  const signal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "gpc_runtime_probe_with_disclosure_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((reviewRow) => reviewRow.id === "gpc_opt_out_signal_handling");

  assert.equal(signal?.eligibility.status, "eligible");
  assert.equal(signal?.matchedCriteria.includes("gpc_policy_disclosure_observed"), true);
  assert.equal(signal?.matchedCriteria.includes("bounded_gpc_disclosure_retained"), true);
  assert.equal(signal?.matchedCriteria.includes("gpc_enabled_runtime_probe_retained"), true);
  assert.equal(signal?.matchedCriteria.includes("gpc_request_header_marker_retained"), true);
  assert.equal(signal?.demotionReasons.includes("review_signal_only_no_gpc_honored_conclusion"), true);
  assert.equal(signal?.missingCorroborators.includes("gpc_handling_recognition_proof"), true);
  assert.equal(signal?.confidence, 0.74);
  assert.equal(row?.status, "checked");
  assert.equal(row?.sourceFindingKeys.includes("gpc_runtime_probe_with_disclosure_observed"), true);
  assert.equal(row?.evidenceRefs.some((ref) => ref.includes("GPC probe request")), true);
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("gpc_handling_recognition_proof"), true);
});

test("GPC runtime companion reaches stronger confidence with explicit handling recognition proof", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      modulesRun: [
        policyModuleRun(),
        consentFlowModuleRun(),
      ],
      networkEvents: [{
        ...analyticsRequestEvent,
        eventId: "net_gpc_probe_recognized",
        requestId: "req_gpc_probe_recognized",
        sourceScanner: "consent_flow_runtime",
        scenario: "gpc_enabled",
        requestHeaders: {
          ...analyticsRequestEvent.requestHeaders,
          secGpc: "1",
          dnt: "1",
        },
      }],
      consentFlowObservations: [{
        observationId: "consent_flow_gpc_enabled",
        sourceScanner: "consent_flow_runtime",
        scenario: "gpc_enabled",
        consentStateAtTime: "pre_consent",
        bannerLikelyPresent: false,
        actionCandidates: [],
        actionAttempts: [],
        textExcerpt: "Global Privacy Control detected. Your opt-out preference signal has been applied.",
        evidenceRefs: [{
          refId: "ref_gpc_recognition_text",
          artifactId: "dom_gpc_enabled",
          eventType: "dom_snapshot",
          excerpt: "Global Privacy Control detected. Your opt-out preference signal has been applied.",
        }],
        artifactRefs: [],
        confidence: 0.9,
        directVsInferred: "direct",
      }],
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_gpc_recognized",
          surfaceType: "privacy_policy",
          normalizedUrl: "https://example.com/privacy",
          textExcerpt: "Global Privacy Control signals are honored as opt-out preference signals.",
          observedTopics: ["global_privacy_control", "sale_or_share"],
        }),
      ],
    }),
  );

  const signal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "gpc_runtime_probe_with_disclosure_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((reviewRow) => reviewRow.id === "gpc_opt_out_signal_handling");

  assert.equal(signal?.eligibility.status, "eligible");
  assert.equal(signal?.matchedCriteria.includes("gpc_handling_recognition_proof_retained"), true);
  assert.equal(signal?.missingCorroborators.includes("gpc_handling_recognition_proof"), false);
  assert.equal(signal?.demotionReasons.includes("review_signal_only_no_gpc_honored_conclusion"), false);
  assert.equal(signal?.confidence, 0.86);
  assert.equal(signal?.sourceEvidenceRefs.some((ref) => ref.refId === "ref_gpc_recognition_text"), true);
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("gpc_handling_recognition_proof"), false);
});

test("GPC runtime companion keeps recognized runtime probe reviewable without policy disclosure", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      modulesRun: [
        policyModuleRun(),
        consentFlowModuleRun(),
      ],
      networkEvents: [{
        ...analyticsRequestEvent,
        eventId: "net_gpc_probe_recognized_without_policy",
        requestId: "req_gpc_probe_recognized_without_policy",
        sourceScanner: "consent_flow_runtime",
        scenario: "gpc_enabled",
        requestHeaders: {
          ...analyticsRequestEvent.requestHeaders,
          secGpc: "1",
        },
      }],
      consentFlowObservations: [{
        observationId: "consent_flow_gpc_recognized_without_policy",
        sourceScanner: "consent_flow_runtime",
        scenario: "gpc_enabled",
        consentStateAtTime: "pre_consent",
        bannerLikelyPresent: false,
        actionCandidates: [],
        actionAttempts: [],
        textExcerpt: "GPC signal received and applied as an opt-out preference signal.",
        evidenceRefs: [{
          refId: "ref_gpc_recognition_without_policy_text",
          artifactId: "dom_gpc_recognized_without_policy",
          eventType: "dom_snapshot",
          excerpt: "GPC signal received and applied as an opt-out preference signal.",
        }],
        artifactRefs: [],
        confidence: 0.86,
        directVsInferred: "direct",
      }],
      policySurfaceObservations: [],
    }),
  );

  const disclosure = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "gpc_disclosure_observed",
  );
  const signal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "gpc_runtime_probe_with_disclosure_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((reviewRow) => reviewRow.id === "gpc_opt_out_signal_handling");

  assert.equal(disclosure?.eligibility.status, "not_eligible");
  assert.equal(signal?.eligibility.status, "eligible");
  assert.equal(signal?.matchedCriteria.includes("gpc_enabled_runtime_probe_retained"), true);
  assert.equal(signal?.matchedCriteria.includes("gpc_request_header_marker_retained"), true);
  assert.equal(signal?.matchedCriteria.includes("gpc_handling_recognition_proof_retained"), true);
  assert.equal(signal?.matchedCriteria.includes("gpc_policy_disclosure_observed"), false);
  assert.equal(signal?.missingCorroborators.includes("gpc_policy_disclosure"), true);
  assert.equal(signal?.confidence, 0.66);
  assert.equal(signal?.directVsInferred, "direct");
  assert.equal(row?.status, "checked");
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("gpc_policy_disclosure"), true);
});

test("GPC disclosure can be recognized from bounded retained text when topic tagging missed it", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      modulesRun: [
        policyModuleRun(),
        consentFlowModuleRun(),
      ],
      networkEvents: [{
        ...analyticsRequestEvent,
        eventId: "net_gpc_probe_bounded_text",
        requestId: "req_gpc_probe_bounded_text",
        sourceScanner: "consent_flow_runtime",
        scenario: "gpc_enabled",
        requestHeaders: {
          ...analyticsRequestEvent.requestHeaders,
          secGpc: "1",
          dnt: "1",
        },
      }],
      consentFlowObservations: [{
        observationId: "consent_flow_gpc_bounded_text",
        sourceScanner: "consent_flow_runtime",
        scenario: "gpc_enabled",
        consentStateAtTime: "pre_consent",
        bannerLikelyPresent: false,
        actionCandidates: [],
        actionAttempts: [],
        textExcerpt: "GPC signal received and applied as an opt-out preference signal.",
        evidenceRefs: [{
          refId: "ref_gpc_bounded_text_recognition",
          artifactId: "dom_gpc_bounded_text",
          eventType: "dom_snapshot",
          excerpt: "GPC signal received and applied as an opt-out preference signal.",
        }],
        artifactRefs: [],
        confidence: 0.9,
        directVsInferred: "direct",
      }],
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_gpc_topic_missed",
          surfaceType: "privacy_policy",
          normalizedUrl: "https://example.com/privacy",
          textExcerpt: "Our site honors Global Privacy Control as an opt-out preference signal for sale, share, and targeted advertising choices.",
          observedTopics: ["sale_or_share", "targeted_advertising"],
          mentionedControls: [],
        }),
      ],
    }),
  );

  const disclosure = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "gpc_disclosure_observed",
  );
  const signal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "gpc_runtime_probe_with_disclosure_observed",
  );

  assert.equal(disclosure?.eligibility.status, "eligible");
  assert.equal(disclosure?.matchedCriteria.includes("gpc_disclosure_text_or_control_observed"), true);
  assert.equal(disclosure?.matchedCriteria.includes("policy_topic_observed:global_privacy_control"), false);
  assert.equal(disclosure?.matchedCriteria.includes("bounded_gpc_disclosure_retained"), true);
  assert.equal(disclosure?.missingCorroborators.includes("policy_topic:global_privacy_control"), false);
  assert.equal(signal?.eligibility.status, "eligible");
  assert.equal(signal?.matchedCriteria.includes("gpc_policy_disclosure_observed"), true);
  assert.equal(signal?.matchedCriteria.includes("bounded_gpc_disclosure_retained"), true);
  assert.equal(signal?.matchedCriteria.includes("gpc_handling_recognition_proof_retained"), true);
  assert.equal(signal?.confidence, 0.86);
});

test("GPC disclosure accepts bounded opt-out preference signal wording without acronym", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      modulesRun: [
        policyModuleRun(),
        consentFlowModuleRun(),
      ],
      networkEvents: [{
        ...analyticsRequestEvent,
        eventId: "net_opt_out_preference_probe",
        requestId: "req_opt_out_preference_probe",
        sourceScanner: "consent_flow_runtime",
        scenario: "gpc_enabled",
        requestHeaders: {
          ...analyticsRequestEvent.requestHeaders,
          secGpc: "1",
          dnt: "1",
        },
      }],
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_opt_out_preference_signal",
          surfaceType: "california_notice",
          normalizedUrl: "https://example.com/state-privacy-policy",
          textExcerpt: "You may opt out by enabling an opt-out preference signal in your browser. The cookie banner will automatically read such signals and apply preferences for sale, share, and targeted advertising choices.",
          observedTopics: ["global_privacy_control", "california_privacy_rights", "targeted_advertising"],
          mentionedControls: ["global_privacy_control"],
        }),
      ],
    }),
  );

  const disclosure = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "gpc_disclosure_observed",
  );
  const signal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "gpc_runtime_probe_with_disclosure_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((reviewRow) => reviewRow.id === "gpc_opt_out_signal_handling");

  assert.equal(disclosure?.eligibility.status, "eligible");
  assert.equal(disclosure?.matchedCriteria.includes("bounded_gpc_disclosure_retained"), true);
  assert.equal(disclosure?.missingCorroborators.includes("policy_topic:global_privacy_control"), false);
  assert.equal(signal?.matchedCriteria.includes("gpc_policy_disclosure_observed"), true);
  assert.equal(row?.status, "checked");
});

test("GPC runtime companion accepts comparable baseline-vs-GPC suppression proof", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      modulesRun: [
        policyModuleRun(),
        consentFlowModuleRun(),
      ],
      networkEvents: [{
        ...analyticsRequestEvent,
        eventId: "net_gpc_probe_delta",
        requestId: "req_gpc_probe_delta",
        sourceScanner: "consent_flow_runtime",
        scenario: "gpc_enabled",
        requestHeaders: {
          ...analyticsRequestEvent.requestHeaders,
          secGpc: "1",
          dnt: "1",
        },
      }],
      consentFlowComparisons: [{
        comparisonId: "comparison_baseline_vs_gpc",
        comparedScenarios: "fresh_pre_consent_vs_gpc_enabled",
        vendorsPersistingAfterReject: [],
        vendorsSuppressedAfterReject: [],
        vendorsAppearingOnlyAfterAccept: [],
        vendorsPersistingAfterGpc: [],
        vendorsSuppressedAfterGpc: ["Google Ads / DoubleClick"],
        cookiesPersistingAfterReject: [],
        cookiesSetAfterAccept: [],
        cookiesPersistingAfterGpc: [],
        cookiesSuppressedAfterGpc: ["IDE"],
        collectionEndpointsPersistingAfterReject: [],
        collectionEndpointsSuppressedAfterReject: [],
        collectionEndpointsAppearingOnlyAfterAccept: [],
        collectionEndpointsPersistingAfterGpc: [],
        collectionEndpointsSuppressedAfterGpc: ["cm.g.doubleclick.net"],
        requestCountDeltaByVendor: { "Google Ads / DoubleClick": -2 },
        cookieCountDeltaByVendor: { IDE: -1 },
        journeyPhaseDeltas: [],
        comparableMeasurement: comparableMeasurement("fresh_pre_consent_vs_gpc_enabled"),
        confidence: 0.78,
        coverageLimitations: [],
        evidenceRefs: [{
          refId: "ref_gpc_delta",
          eventId: "net_gpc_probe_delta",
          eventType: "network_request",
          label: "GPC comparison suppression evidence",
        }],
      }],
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_gpc_delta",
          surfaceType: "privacy_policy",
          normalizedUrl: "https://example.com/privacy",
          textExcerpt: "Global Privacy Control signals are honored as opt-out preference signals.",
          observedTopics: ["global_privacy_control", "sale_or_share"],
        }),
      ],
    }),
  );

  const signal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "gpc_runtime_probe_with_disclosure_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((reviewRow) => reviewRow.id === "gpc_opt_out_signal_handling");

  assert.equal(signal?.matchedCriteria.includes("gpc_handling_recognition_proof_retained"), true);
  assert.equal(signal?.missingCorroborators.includes("gpc_handling_recognition_proof"), false);
  assert.equal(signal?.sourceEvidenceRefs.some((ref) => ref.refId === "ref_gpc_delta"), true);
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("gpc_handling_recognition_proof"), false);
});

test("GPC runtime companion signal stays conservative without a runtime probe", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_gpc",
          surfaceType: "privacy_policy",
          normalizedUrl: "https://example.com/privacy",
          textExcerpt: "Global Privacy Control signals are honored as opt-out preference signals.",
          observedTopics: ["global_privacy_control", "sale_or_share"],
        }),
      ],
    }),
  );

  const signal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "gpc_runtime_probe_with_disclosure_observed",
  );
  const disclosure = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "gpc_disclosure_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((reviewRow) => reviewRow.id === "gpc_opt_out_signal_handling");

  assert.equal(disclosure?.eligibility.status, "eligible");
  assert.equal(disclosure?.matchedCriteria.includes("bounded_gpc_disclosure_retained"), true);
  assert.equal(signal?.eligibility.status, "deferred");
  assert.equal(signal?.eligibility.reasons.includes("required_gpc_runtime_probe_module_not_run"), true);
  assert.equal(row?.status, "checked");
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("required_gpc_runtime_probe_module_not_run"), true);
});

test("GPC runtime companion requires bounded GPC disclosure text for stronger confidence", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      modulesRun: [
        policyModuleRun(),
        consentFlowModuleRun(),
      ],
      networkEvents: [{
        ...analyticsRequestEvent,
        eventId: "net_gpc_probe_unbounded",
        requestId: "req_gpc_probe_unbounded",
        sourceScanner: "consent_flow_runtime",
        scenario: "gpc_enabled",
        requestHeaders: {
          ...analyticsRequestEvent.requestHeaders,
          secGpc: "1",
          dnt: "1",
        },
      }],
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_gpc_unbounded",
          surfaceType: "privacy_policy",
          normalizedUrl: "https://example.com/privacy",
          status: "observed",
          textExcerpt: undefined,
          boundedTextExcerptIds: [],
          evidenceRefs: [],
          observedTopics: ["global_privacy_control"],
          confidence: 0.9,
        }),
      ],
    }),
  );

  const signal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "gpc_runtime_probe_with_disclosure_observed",
  );
  const disclosure = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "gpc_disclosure_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((reviewRow) => reviewRow.id === "gpc_opt_out_signal_handling");

  assert.equal(disclosure?.eligibility.status, "eligible");
  assert.equal(disclosure?.confidence, 0.62);
  assert.equal(disclosure?.missingCorroborators.includes("bounded_gpc_disclosure_excerpt"), true);
  assert.equal(signal?.eligibility.status, "eligible");
  assert.equal(signal?.matchedCriteria.includes("gpc_policy_disclosure_observed"), true);
  assert.equal(signal?.matchedCriteria.includes("bounded_gpc_disclosure_retained"), false);
  assert.equal(signal?.matchedCriteria.includes("gpc_enabled_runtime_probe_retained"), true);
  assert.equal(signal?.matchedCriteria.includes("gpc_request_header_marker_retained"), true);
  assert.equal(signal?.confidence, 0.68);
  assert.equal(signal?.missingCorroborators.includes("bounded_gpc_disclosure_excerpt"), true);
  assert.equal(row?.status, "checked");
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("bounded_gpc_disclosure_excerpt"), true);
});

test("GPC runtime companion requires retained GPC request header marker for strong confidence", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      modulesRun: [
        policyModuleRun(),
        consentFlowModuleRun(),
      ],
      networkEvents: [{
        ...analyticsRequestEvent,
        eventId: "net_gpc_probe_without_header",
        requestId: "req_gpc_probe_without_header",
        sourceScanner: "consent_flow_runtime",
        scenario: "gpc_enabled",
        requestHeaders: {
          cookieHeaderPresent: false,
          cookieNames: [],
          authorizationHeaderPresent: false,
        },
      }],
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_gpc_without_header",
          surfaceType: "privacy_policy",
          normalizedUrl: "https://example.com/privacy",
          textExcerpt: "Global Privacy Control signals are honored as opt-out preference signals.",
          observedTopics: ["global_privacy_control", "sale_or_share"],
        }),
      ],
    }),
  );

  const signal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "gpc_runtime_probe_with_disclosure_observed",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const row = california?.rows.find((reviewRow) => reviewRow.id === "gpc_opt_out_signal_handling");

  assert.equal(signal?.eligibility.status, "eligible");
  assert.equal(signal?.matchedCriteria.includes("gpc_enabled_runtime_probe_retained"), true);
  assert.equal(signal?.matchedCriteria.includes("gpc_request_header_marker_retained"), false);
  assert.equal(signal?.missingCorroborators.includes("gpc_request_header_marker"), true);
  assert.equal(signal?.confidence, 0.68);
  assert.equal(signal?.directVsInferred, "direct");
  assert.equal(row?.status, "checked");
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("gpc_request_header_marker"), true);
});

test("policy/runtime alignment remains a review signal only when both modules ran", async () => {
  const runtimeBundle = thirdPartyAnalyticsRequestBundle();
  const result = await reviewEvidenceBundle(
    policyBundle({
      modulesRun: [
        ...runtimeBundle.modulesRun,
        policyModuleRun(),
      ],
      networkEvents: runtimeBundle.networkEvents,
      normalizedVendorObservations: runtimeBundle.normalizedVendorObservations,
      observedJourneys: runtimeBundle.observedJourneys,
      derivedRuntimeSignals: runtimeBundle.derivedRuntimeSignals,
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_privacy",
          surfaceType: "privacy_policy",
          normalizedUrl: "https://example.com/privacy",
          textExcerpt: "Privacy Policy. We use Google Analytics for analytics.",
          observedTopics: ["analytics"],
          mentionedVendors: ["Google Analytics"],
        }),
      ],
    }),
  );

  const alignment = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "policy_runtime_vendor_alignment_review_signal",
  );

  assert.equal(alignment?.eligibility.status, "eligible");
  assert.deepEqual(alignment?.demotionReasons, ["review_signal_only_no_disclosure_gap_conclusion"]);
  assert.equal(alignment?.matchedCriteria.includes("runtime_vendor_mentioned_in_policy"), true);
  assert.equal(alignment?.matchedCriteria.includes("bounded_policy_vendor_excerpt_retained"), true);
  assert.equal(alignment?.matchedCriteria.includes("policy_runtime_vendor_alignment_evidence_retained"), true);
  assert.equal(alignment?.confidence, 0.82);
  assert.equal(alignment?.directVsInferred, "mixed");
  assert.equal(alignment?.title.toLowerCase().includes("gap"), false);

  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((reviewRow) => reviewRow.id === "policy_runtime_vendor_alignment_review");
  assert.equal(row?.status, "review_signal");
  assert.equal(row?.sourceFindingKeys.includes("policy_runtime_vendor_alignment_review_signal"), true);
  assert.equal(row?.missingOrIncompleteSourceSignals.length, 0);
});

test("policy/runtime alignment stays lower confidence for unrelated policy vendor mentions", async () => {
  const runtimeBundle = thirdPartyAnalyticsRequestBundle();
  const result = await reviewEvidenceBundle(
    policyBundle({
      modulesRun: [
        ...runtimeBundle.modulesRun,
        policyModuleRun(),
      ],
      networkEvents: runtimeBundle.networkEvents,
      normalizedVendorObservations: runtimeBundle.normalizedVendorObservations,
      observedJourneys: runtimeBundle.observedJourneys,
      derivedRuntimeSignals: runtimeBundle.derivedRuntimeSignals,
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_unrelated_vendor",
          surfaceType: "privacy_policy",
          normalizedUrl: "https://example.com/privacy",
          textExcerpt: "Privacy Policy. We use Example Ads for advertising.",
          observedTopics: ["advertising"],
          mentionedVendors: ["Example Ads"],
        }),
      ],
    }),
  );

  const alignment = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "policy_runtime_vendor_alignment_review_signal",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((reviewRow) => reviewRow.id === "policy_runtime_vendor_alignment_review");

  assert.equal(alignment?.eligibility.status, "eligible");
  assert.equal(alignment?.matchedCriteria.includes("runtime_vendor_mentioned_in_policy"), false);
  assert.equal(alignment?.matchedCriteria.includes("policy_vendor_mentions_present"), true);
  assert.equal(alignment?.matchedCriteria.includes("policy_runtime_vendor_alignment_evidence_retained"), false);
  assert.equal(alignment?.missingCorroborators.includes("runtime_policy_vendor_overlap"), true);
  assert.equal(alignment?.confidence, 0.58);
  assert.equal(row?.status, "review_signal");
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("runtime_policy_vendor_overlap"), true);
});

test("policy/runtime alignment requires bounded fetched policy text for strong overlap confidence", async () => {
  const runtimeBundle = thirdPartyAnalyticsRequestBundle();
  const result = await reviewEvidenceBundle(
    policyBundle({
      modulesRun: [
        ...runtimeBundle.modulesRun,
        policyModuleRun(),
      ],
      networkEvents: runtimeBundle.networkEvents,
      normalizedVendorObservations: runtimeBundle.normalizedVendorObservations,
      observedJourneys: runtimeBundle.observedJourneys,
      derivedRuntimeSignals: runtimeBundle.derivedRuntimeSignals,
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_link_only_vendor",
          surfaceType: "privacy_policy",
          normalizedUrl: "https://example.com/privacy",
          status: "observed",
          textExcerpt: undefined,
          boundedTextExcerptIds: [],
          evidenceRefs: [],
          observedTopics: ["analytics"],
          mentionedVendors: ["Google Analytics"],
        }),
      ],
    }),
  );

  const alignment = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "policy_runtime_vendor_alignment_review_signal",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((reviewRow) => reviewRow.id === "policy_runtime_vendor_alignment_review");

  assert.equal(alignment?.eligibility.status, "eligible");
  assert.equal(alignment?.matchedCriteria.includes("runtime_vendor_mentioned_in_policy"), true);
  assert.equal(alignment?.matchedCriteria.includes("policy_runtime_vendor_alignment_evidence_retained"), false);
  assert.equal(alignment?.missingCorroborators.includes("bounded_policy_vendor_excerpt"), true);
  assert.equal(alignment?.confidence, 0.68);
  assert.equal(row?.status, "review_signal");
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("bounded_policy_vendor_excerpt"), true);
});

test("AI disclosure candidate requires an AI surface or generated-content topic", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_privacy_ai_word",
          surfaceType: "privacy_policy",
          normalizedUrl: "https://example.com/privacy",
          textExcerpt: "Privacy Policy. The letters AI appear in unrelated text.",
          observedTopics: ["ai_features"],
        }),
      ],
    }),
  );

  const aiDisclosure = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "ai_disclosure_observed_or_not_observed",
  );

  assert.equal(aiDisclosure?.eligibility.status, "not_eligible");
  assert.equal(aiDisclosure?.missingCorroborators.includes("policy_topic:ai_features"), true);
});

test("policy/runtime alignment is not eligible when policy candidates all failed", async () => {
  const runtimeBundle = thirdPartyAnalyticsRequestBundle();
  const result = await reviewEvidenceBundle(
    policyBundle({
      modulesRun: [
        ...runtimeBundle.modulesRun,
        policyModuleRun(),
      ],
      networkEvents: runtimeBundle.networkEvents,
      normalizedVendorObservations: runtimeBundle.normalizedVendorObservations,
      observedJourneys: runtimeBundle.observedJourneys,
      derivedRuntimeSignals: runtimeBundle.derivedRuntimeSignals,
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_failed_guess",
          surfaceType: "privacy_policy",
          normalizedUrl: "https://example.com/privacy-policy",
          status: "failed",
          httpStatus: 404,
          textExcerpt: undefined,
          boundedTextExcerptIds: [],
          mentionedVendors: [],
          evidenceRefs: [],
        }),
      ],
    }),
  );

  const alignment = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "policy_runtime_vendor_alignment_review_signal",
  );

  assert.equal(alignment?.eligibility.status, "not_eligible");
  assert.equal(alignment?.missingCorroborators.includes("observed_policy_surface"), true);
  assert.equal(alignment?.matchedCriteria.includes("runtime_vendor_not_matched_to_policy_mention_review_signal"), true);
  assert.equal(alignment?.confidence, 0.2);
});

test("policy/runtime alignment stays lower confidence without policy vendor mentions", async () => {
  const runtimeBundle = thirdPartyAnalyticsRequestBundle();
  const result = await reviewEvidenceBundle(
    policyBundle({
      modulesRun: [
        ...runtimeBundle.modulesRun,
        policyModuleRun(),
      ],
      networkEvents: runtimeBundle.networkEvents,
      normalizedVendorObservations: runtimeBundle.normalizedVendorObservations,
      observedJourneys: runtimeBundle.observedJourneys,
      derivedRuntimeSignals: runtimeBundle.derivedRuntimeSignals,
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_privacy_no_vendor_mentions",
          surfaceType: "privacy_policy",
          normalizedUrl: "https://example.com/privacy",
          textExcerpt: "Privacy Policy. We use analytics and advertising partners.",
          observedTopics: ["analytics", "advertising"],
          mentionedVendors: [],
        }),
      ],
    }),
  );

  const alignment = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "policy_runtime_vendor_alignment_review_signal",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const row = gdpr?.rows.find((reviewRow) => reviewRow.id === "policy_runtime_vendor_alignment_review");

  assert.equal(alignment?.eligibility.status, "eligible");
  assert.equal(alignment?.confidence, 0.58);
  assert.equal(alignment?.matchedCriteria.includes("policy_runtime_vendor_alignment_evidence_retained"), false);
  assert.equal(alignment?.missingCorroborators.includes("policy_vendor_mentions"), true);
  assert.equal(row?.status, "review_signal");
  assert.equal(row?.missingOrIncompleteSourceSignals.includes("policy_vendor_mentions"), true);
});

test("policy/runtime alignment defers when runtime did not run", async () => {
  const result = await reviewEvidenceBundle(
    policyBundle({
      policySurfaceObservations: [
        policyObservation({
          observationId: "policy_privacy",
          surfaceType: "privacy_policy",
          normalizedUrl: "https://example.com/privacy",
          textExcerpt: "Privacy Policy. We mention Google Analytics.",
          observedTopics: ["analytics"],
          mentionedVendors: ["Google Analytics"],
        }),
      ],
    }),
  );

  const alignment = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "policy_runtime_vendor_alignment_review_signal",
  );

  assert.equal(alignment?.eligibility.status, "deferred");
  assert.equal(alignment?.missingCorroborators.includes("runtime_and_policy_surface_modules"), true);
});

test("consent-flow candidates defer when the consent-flow scanner did not run", async () => {
  const result = await reviewEvidenceBundle(minimalBundle());

  for (const findingKey of [
    "reject_control_observed_or_not_observed",
    "accept_control_observed_or_not_observed",
    "reject_action_succeeded_or_not_testable",
    "accept_action_succeeded_or_not_testable",
    "tracking_after_refusal_review_signal",
  ]) {
    const finding = result.findingCandidates.find((candidate) => candidate.findingKey === findingKey);
    assert.equal(finding?.eligibility.status, "deferred", findingKey);
    assert.equal(
      result.coverageLimitations.some((limitation) =>
        limitation.limitationKey === "consent_flow_not_run" &&
        limitation.affectedFindingKeys.includes(findingKey),
      ),
      true,
      findingKey,
    );
  }
});

test("consent-flow evidence produces conservative runtime-delta review candidates", async () => {
  const result = await reviewEvidenceBundle(consentFlowBundle());

  const expectedEligible = [
    "reject_control_observed_or_not_observed",
    "accept_control_observed_or_not_observed",
    "reject_action_succeeded_or_not_testable",
    "accept_action_succeeded_or_not_testable",
    "tracking_after_refusal_review_signal",
    "reject_did_not_reduce_tracking_review_signal",
    "cookies_persist_after_reject_review_signal",
    "vendors_appear_only_after_accept_review_signal",
    "accept_reject_runtime_delta_observed",
  ];

  for (const findingKey of expectedEligible) {
    const finding = result.findingCandidates.find((candidate) => candidate.findingKey === findingKey);
    assert.equal(finding?.eligibility.status, "eligible", findingKey);
    assert.equal(finding?.title.toLowerCase().includes("violation"), false, findingKey);
  }

  const trackingAfterRefusal = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "tracking_after_refusal_review_signal",
  );
  assert.deepEqual(trackingAfterRefusal?.demotionReasons, ["review_signal_only_no_gap_conclusion"]);
  assert.equal(trackingAfterRefusal?.matchedCriteria.includes("consent_flow_runtime_delta_detected"), true);
  assert.equal(trackingAfterRefusal?.matchedCriteria.includes("confident_successful_consent_action_comparison"), true);
  assert.equal(trackingAfterRefusal?.confidence, 0.82);
  const cookiesPersist = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "cookies_persist_after_reject_review_signal",
  );
  assert.equal(cookiesPersist?.confidence, 0.82);
  const acceptRejectDelta = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "accept_reject_runtime_delta_observed",
  );
  assert.equal(acceptRejectDelta?.confidence, 0.82);
  assert.equal(acceptRejectDelta?.matchedCriteria.includes("successful_accept_and_reject_actions"), true);
  assert.equal(acceptRejectDelta?.sourceEvidenceRefs.some((ref) => ref.refId === "ref_attempt_accept_all"), true);
  assert.equal(acceptRejectDelta?.sourceEvidenceRefs.some((ref) => ref.refId === "ref_attempt_reject_all"), true);
  const postOptOutAdBehavior = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "post_opt_out_targeted_advertising_behavior_signal",
  );
  assert.equal(postOptOutAdBehavior?.eligibility.status, "not_eligible");
  assert.equal(postOptOutAdBehavior?.missingCorroborators.includes("advertising_purpose_post_opt_out_comparison"), true);
  const rejectControl = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "reject_control_observed_or_not_observed",
  );
  const rejectAction = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "reject_action_succeeded_or_not_testable",
  );
  assert.equal(rejectControl?.matchedCriteria.includes("reject_path_context:direct_first_layer"), true);
  assert.equal(rejectControl?.missingCorroborators.length, 0);
  assert.equal(rejectAction?.matchedCriteria.includes("first_layer_reject_action_proof_retained"), true);
  assert.equal(rejectAction?.confidence, 0.82);

  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const postRejectRow = gdpr?.rows.find((row) => row.id === "post_reject_tracking_reduction");
  assert.equal(postRejectRow?.status, "review_signal");
  assert.equal(postRejectRow?.evidenceCapability, "currently_supported");
  assert.equal((postRejectRow?.evidenceRefs.length ?? 0) > 0, true);
  const acceptRejectParityRow = gdpr?.rows.find((row) => row.id === "accept_reject_parity");
  assert.equal(acceptRejectParityRow?.status, "review_signal");
  assert.equal(acceptRejectParityRow?.sourceFindingKeys.includes("accept_reject_runtime_delta_observed"), true);
  assert.equal((acceptRejectParityRow?.evidenceRefs.length ?? 0) > 0, true);
  const rejectRow = gdpr?.rows.find((row) => row.id === "reject_all_path_availability");
  assert.equal(rejectRow?.status, "checked");
  assert.equal(rejectRow?.missingOrIncompleteSourceSignals.length, 0);
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const ccpaPostOptOutRow = california?.rows.find((row) => row.id === "post_opt_out_tracking_behavior");
  assert.equal(ccpaPostOptOutRow?.status, "not_observed");
});

test("CCPA post-opt-out tracking behavior requires advertising-purpose comparison evidence", async () => {
  const result = await reviewEvidenceBundle(
    consentFlowBundle({
      normalizedVendorObservations: [doubleClickVendor()],
      consentActionAttempts: [
        consentActionAttempt("do_not_sell_share", {
          actionProof: {
            proofVersion: "consent_action_proof.v1",
            candidateObserved: true,
            candidateActionId: "candidate_do_not_sell_share",
            candidateLabelText: "Do Not Sell or Share",
            candidateNormalizedActionType: "do_not_sell_share",
            candidateSelectorSummary: "controlIndex:0",
            candidateConfidence: 0.9,
            actionPath: "privacy_opt_out_form",
            attemptedStatus: "attempted_succeeded",
            actionTimestampMs: 1_000,
            postClickSettleMs: 1_200,
            evidenceRefs: [{ refId: "ref_do_not_sell_share_proof", artifactId: "dom_do_not_sell_share", eventType: "dom_snapshot" }],
          },
          evidenceRefs: [{ refId: "ref_do_not_sell_share_attempt", artifactId: "dom_do_not_sell_share", eventType: "dom_snapshot" }],
          scenario: "privacy_opt_out_flow",
        }),
      ],
      consentFlowComparisons: [
        {
          comparisonId: "comparison_after_reject_ads",
          comparedScenarios: "fresh_pre_consent_vs_after_reject",
          vendorsPersistingAfterReject: ["Google Ads / DoubleClick"],
          vendorsSuppressedAfterReject: [],
          vendorsAppearingOnlyAfterAccept: [],
          cookiesPersistingAfterReject: ["IDE"],
          cookiesSetAfterAccept: [],
          collectionEndpointsPersistingAfterReject: ["googleads.g.doubleclick.net"],
          collectionEndpointsSuppressedAfterReject: [],
          collectionEndpointsAppearingOnlyAfterAccept: [],
          requestCountDeltaByVendor: { "Google Ads / DoubleClick": 0 },
          cookieCountDeltaByVendor: { IDE: 0 },
          journeyPhaseDeltas: [
            {
              journeyKey: "vendor:Google Ads / DoubleClick",
              displayName: "Google Ads / DoubleClick",
              vendor: "Google",
              product: "Google Ads / DoubleClick",
              observedPreConsent: true,
              observedAfterReject: true,
              persistedAfterReject: true,
              evidenceRefs: [{ refId: "ref_ads_reject", eventId: "cookie_ide", eventType: "cookie" }],
            },
          ],
          confidence: 0.78,
          coverageLimitations: [],
          comparableMeasurement: comparableMeasurement("fresh_pre_consent_vs_after_reject"),
          evidenceRefs: [{ refId: "ref_ads_reject", eventId: "cookie_ide", eventType: "cookie" }],
        },
      ],
    }),
  );

  const postOptOutAdBehavior = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "post_opt_out_targeted_advertising_behavior_signal",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const ccpaPostOptOutRow = california?.rows.find((row) => row.id === "post_opt_out_tracking_behavior");

  assert.equal(postOptOutAdBehavior?.eligibility.status, "eligible");
  assert.equal(postOptOutAdBehavior?.matchedCriteria.includes("advertising_purpose_post_opt_out_comparison"), true);
  assert.equal(postOptOutAdBehavior?.matchedCriteria.includes("advertising_signal_persisted_after_opt_out"), true);
  assert.equal(postOptOutAdBehavior?.matchedCriteria.includes("ccpa_opt_out_or_gpc_probe_proof_retained"), true);
  assert.equal(postOptOutAdBehavior?.confidence, 0.82);
  assert.equal(postOptOutAdBehavior?.sourceEvidenceRefs.some((ref) => ref.refId === "ref_do_not_sell_share_proof"), true);
  assert.deepEqual(postOptOutAdBehavior?.relatedVendors.map((vendor) => vendor.product), ["Google Ads / DoubleClick"]);
  assert.equal(ccpaPostOptOutRow?.status, "review_signal");
  assert.deepEqual(ccpaPostOptOutRow?.sourceFindingKeys, ["post_opt_out_targeted_advertising_behavior_signal"]);
  assert.equal(ccpaPostOptOutRow?.missingOrIncompleteSourceSignals.length, 0);
});

test("CCPA post-opt-out tracking behavior accepts successful privacy opt-out comparison proof", async () => {
  const result = await reviewEvidenceBundle(
    consentFlowBundle({
      normalizedVendorObservations: [doubleClickVendor()],
      consentActionAttempts: [
        consentActionAttempt("do_not_sell_share", {
          actionProof: {
            proofVersion: "consent_action_proof.v1",
            candidateObserved: true,
            candidateActionId: "candidate_do_not_sell_share",
            candidateLabelText: "Do Not Sell or Share",
            candidateNormalizedActionType: "do_not_sell_share",
            candidateSelectorSummary: "controlIndex:0",
            candidateConfidence: 0.9,
            actionPath: "privacy_opt_out_form",
            attemptedStatus: "attempted_succeeded",
            actionTimestampMs: 1_000,
            postClickSettleMs: 1_200,
            evidenceRefs: [{ refId: "ref_privacy_opt_out_proof", artifactId: "dom_privacy_opt_out", eventType: "dom_snapshot" }],
          },
          evidenceRefs: [{ refId: "ref_privacy_opt_out_attempt", artifactId: "dom_privacy_opt_out", eventType: "dom_snapshot" }],
          scenario: "privacy_opt_out_flow",
        }),
      ],
      consentFlowComparisons: [
        {
          comparisonId: "comparison_privacy_opt_out_ads",
          comparedScenarios: "fresh_pre_consent_vs_privacy_opt_out",
          vendorsPersistingAfterReject: [],
          vendorsSuppressedAfterReject: ["Google Ads / DoubleClick"],
          vendorsAppearingOnlyAfterAccept: [],
          cookiesPersistingAfterReject: [],
          cookiesSetAfterAccept: [],
          collectionEndpointsPersistingAfterReject: [],
          collectionEndpointsSuppressedAfterReject: ["googleads.g.doubleclick.net"],
          collectionEndpointsAppearingOnlyAfterAccept: [],
          requestCountDeltaByVendor: { "Google Ads / DoubleClick": -1 },
          cookieCountDeltaByVendor: {},
          journeyPhaseDeltas: [
            {
              journeyKey: "endpoint:https://googleads.g.doubleclick.net/pagead/viewthroughconversion/123",
              displayName: "googleads.g.doubleclick.net",
              endpointHostname: "googleads.g.doubleclick.net",
              observedPreConsent: true,
              observedAfterReject: false,
              suppressedAfterReject: true,
              evidenceRefs: [{ refId: "ref_ads_privacy_opt_out", eventId: "net_ads_privacy_opt_out", eventType: "network_request" }],
            },
          ],
          confidence: 0.78,
          coverageLimitations: [],
          comparableMeasurement: comparableMeasurement("fresh_pre_consent_vs_privacy_opt_out"),
          evidenceRefs: [{ refId: "ref_ads_privacy_opt_out", eventId: "net_ads_privacy_opt_out", eventType: "network_request" }],
        },
      ],
    }),
  );

  const postOptOutAdBehavior = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "post_opt_out_targeted_advertising_behavior_signal",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const ccpaPostOptOutRow = california?.rows.find((row) => row.id === "post_opt_out_tracking_behavior");

  assert.equal(postOptOutAdBehavior?.eligibility.status, "eligible");
  assert.equal(postOptOutAdBehavior?.matchedCriteria.includes("advertising_purpose_post_opt_out_comparison"), true);
  assert.equal(postOptOutAdBehavior?.matchedCriteria.includes("advertising_signal_suppressed_after_opt_out"), true);
  assert.equal(postOptOutAdBehavior?.matchedCriteria.includes("ccpa_opt_out_or_gpc_probe_proof_retained"), true);
  assert.equal(postOptOutAdBehavior?.confidence, 0.82);
  assert.equal(postOptOutAdBehavior?.sourceEvidenceRefs.some((ref) => ref.refId === "ref_privacy_opt_out_proof"), true);
  assert.equal(postOptOutAdBehavior?.sourceEvidenceRefs.some((ref) => ref.refId === "ref_ads_privacy_opt_out"), true);
  assert.equal(ccpaPostOptOutRow?.status, "review_signal");
  assert.equal(ccpaPostOptOutRow?.missingOrIncompleteSourceSignals.length, 0);
});

test("CCPA post-opt-out tracking behavior requires retained opt-out or GPC proof", async () => {
  const result = await reviewEvidenceBundle(
    consentFlowBundle({
      normalizedVendorObservations: [doubleClickVendor()],
      consentFlowComparisons: [
        {
          comparisonId: "comparison_after_reject_ads_without_ccpa_proof",
          comparedScenarios: "fresh_pre_consent_vs_after_reject",
          vendorsPersistingAfterReject: ["Google Ads / DoubleClick"],
          vendorsSuppressedAfterReject: [],
          vendorsAppearingOnlyAfterAccept: [],
          cookiesPersistingAfterReject: ["IDE"],
          cookiesSetAfterAccept: [],
          collectionEndpointsPersistingAfterReject: ["googleads.g.doubleclick.net"],
          collectionEndpointsSuppressedAfterReject: [],
          collectionEndpointsAppearingOnlyAfterAccept: [],
          requestCountDeltaByVendor: { "Google Ads / DoubleClick": 0 },
          cookieCountDeltaByVendor: { IDE: 0 },
          journeyPhaseDeltas: [
            {
              journeyKey: "vendor:Google Ads / DoubleClick",
              displayName: "Google Ads / DoubleClick",
              vendor: "Google",
              product: "Google Ads / DoubleClick",
              observedPreConsent: true,
              observedAfterReject: true,
              persistedAfterReject: true,
              evidenceRefs: [{ refId: "ref_ads_reject_without_ccpa_proof", eventId: "cookie_ide", eventType: "cookie" }],
            },
          ],
          confidence: 0.9,
          coverageLimitations: [],
          comparableMeasurement: comparableMeasurement("fresh_pre_consent_vs_after_reject"),
          evidenceRefs: [{ refId: "ref_ads_reject_without_ccpa_proof", eventId: "cookie_ide", eventType: "cookie" }],
        },
      ],
    }),
  );

  const postOptOutAdBehavior = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "post_opt_out_targeted_advertising_behavior_signal",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const ccpaPostOptOutRow = california?.rows.find((row) => row.id === "post_opt_out_tracking_behavior");

  assert.equal(postOptOutAdBehavior?.eligibility.status, "not_eligible");
  assert.equal(postOptOutAdBehavior?.matchedCriteria.includes("advertising_purpose_post_opt_out_comparison"), true);
  assert.equal(postOptOutAdBehavior?.matchedCriteria.includes("ccpa_opt_out_or_gpc_probe_proof_retained"), false);
  assert.equal(postOptOutAdBehavior?.missingCorroborators.includes("ccpa_opt_out_or_gpc_probe_proof"), true);
  assert.equal(postOptOutAdBehavior?.demotionReasons.includes("ccpa_opt_out_or_gpc_probe_proof_missing"), true);
  assert.deepEqual(postOptOutAdBehavior?.sourceEvidenceRefs, []);
  assert.equal(ccpaPostOptOutRow?.status, "not_testable");
  assert.deepEqual(ccpaPostOptOutRow?.evidenceRefs, ["Post-opt-out targeted advertising behavior signal"]);
});

test("CCPA post-opt-out tracking behavior keeps low-confidence GPC advertising deltas reviewable", async () => {
  const result = await reviewEvidenceBundle(
    consentFlowBundle({
      networkEvents: [{
        ...analyticsRequestEvent,
        eventId: "net_gpc_probe_low_conf_post_opt_out",
        requestId: "req_gpc_probe_low_conf_post_opt_out",
        sourceScanner: "consent_flow_runtime",
        scenario: "gpc_enabled",
        requestHeaders: {
          ...analyticsRequestEvent.requestHeaders,
          secGpc: "1",
        },
      }],
      normalizedVendorObservations: [doubleClickVendor()],
      consentFlowComparisons: [
        {
          comparisonId: "comparison_after_reject_ads_low_confidence",
          comparedScenarios: "fresh_pre_consent_vs_after_reject",
          vendorsPersistingAfterReject: ["Google Ads / DoubleClick"],
          vendorsSuppressedAfterReject: [],
          vendorsAppearingOnlyAfterAccept: [],
          cookiesPersistingAfterReject: ["IDE"],
          cookiesSetAfterAccept: [],
          collectionEndpointsPersistingAfterReject: ["googleads.g.doubleclick.net"],
          collectionEndpointsSuppressedAfterReject: [],
          collectionEndpointsAppearingOnlyAfterAccept: [],
          requestCountDeltaByVendor: { "Google Ads / DoubleClick": 0 },
          cookieCountDeltaByVendor: { IDE: 0 },
          journeyPhaseDeltas: [
            {
              journeyKey: "vendor:Google Ads / DoubleClick",
              displayName: "Google Ads / DoubleClick",
              vendor: "Google",
              product: "Google Ads / DoubleClick",
              observedPreConsent: true,
              observedAfterReject: true,
              persistedAfterReject: true,
              evidenceRefs: [{ refId: "ref_ads_reject_low_conf", eventId: "cookie_ide", eventType: "cookie" }],
            },
          ],
          confidence: 0.35,
          coverageLimitations: [],
          comparableMeasurement: comparableMeasurement("fresh_pre_consent_vs_after_reject"),
          evidenceRefs: [{ refId: "ref_ads_reject_low_conf", eventId: "cookie_ide", eventType: "cookie" }],
        },
      ],
    }),
  );

  const postOptOutAdBehavior = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "post_opt_out_targeted_advertising_behavior_signal",
  );
  const california = result.regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const ccpaPostOptOutRow = california?.rows.find((row) => row.id === "post_opt_out_tracking_behavior");

  assert.equal(postOptOutAdBehavior?.eligibility.status, "eligible");
  assert.equal(postOptOutAdBehavior?.matchedCriteria.includes("advertising_purpose_post_opt_out_comparison"), true);
  assert.equal(postOptOutAdBehavior?.matchedCriteria.includes("ccpa_opt_out_or_gpc_probe_proof_retained"), true);
  assert.equal(
    postOptOutAdBehavior?.missingCorroborators.includes("confident_successful_post_opt_out_advertising_comparison"),
    true,
  );
  assert.equal(postOptOutAdBehavior?.demotionReasons.includes("comparison_not_confidently_testable"), true);
  assert.equal(postOptOutAdBehavior?.confidence, 0.35);
  assert.equal(postOptOutAdBehavior?.directVsInferred, "inferred");
  assert.equal(
    postOptOutAdBehavior?.sourceEvidenceRefs.some((ref) => ref.refId === "ref_net_gpc_probe_low_conf_post_opt_out"),
    true,
  );
  assert.equal(
    postOptOutAdBehavior?.sourceEvidenceRefs.some((ref) => ref.refId === "ref_ads_reject_low_conf"),
    true,
  );
  assert.equal(ccpaPostOptOutRow?.status, "review_signal");
  assert.deepEqual(ccpaPostOptOutRow?.sourceFindingKeys, ["post_opt_out_targeted_advertising_behavior_signal"]);
});

test("reject path stays lower confidence without initial surface or action proof", async () => {
  const result = await reviewEvidenceBundle(
    consentFlowBundle({
      consentActionAttempts: [],
      consentFlowComparisons: [],
    }),
  );

  const rejectControl = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "reject_control_observed_or_not_observed",
  );
  const rejectAction = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "reject_action_succeeded_or_not_testable",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const rejectRow = gdpr?.rows.find((row) => row.id === "reject_all_path_availability");

  assert.equal(rejectControl?.eligibility.status, "eligible");
  assert.equal(rejectControl?.matchedCriteria.includes("reject_path_context:no_initial_surface_context"), true);
  assert.equal(rejectControl?.missingCorroborators.includes("initial_consent_surface_context"), true);
  assert.equal((rejectControl?.confidence ?? 1) <= 0.62, true);
  assert.equal(rejectAction?.eligibility.status, "not_eligible");
  assert.equal(rejectRow?.status, "checked");
  assert.equal(rejectRow?.missingOrIncompleteSourceSignals.includes("initial_consent_surface_context"), true);
});

test("reject path does not promote weak non-clickable reject control candidates", async () => {
  const result = await reviewEvidenceBundle(
    consentFlowBundle({
      consentActionCandidates: [
        {
          ...consentActionCandidate("reject_all", "Cookie Policy"),
          confidence: 0.35,
          shouldClick: false,
          evidenceRefs: [{
            refId: "ref_weak_cookie_policy_reject_candidate",
            artifactId: "dom_weak_cookie_policy",
            eventType: "dom_snapshot",
            label: "Cookie Policy",
            excerpt: "Cookie Policy",
          }],
        },
      ],
      consentActionAttempts: [],
      consentFlowComparisons: [],
    }),
  );

  const rejectControl = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "reject_control_observed_or_not_observed",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const rejectRow = gdpr?.rows.find((row) => row.id === "reject_all_path_availability");

  assert.equal(rejectControl?.eligibility.status, "not_eligible");
  assert.equal(rejectControl?.matchedCriteria.includes("low_confidence_reject_control_candidate_observed"), true);
  assert.equal(rejectControl?.missingCorroborators.includes("confident_consent_control:reject_all"), true);
  assert.equal(rejectControl?.demotionReasons.includes("reject_control_candidate_below_confidence_floor"), true);
  assert.equal(rejectControl?.confidence, 0.35);
  assert.equal(rejectRow?.status, "not_observed");
});

test("reject path accepts retained preference-center reject proof", async () => {
  const result = await reviewEvidenceBundle(
    consentFlowBundle({
      consentUiObservations: [
        {
          observationId: "consent_preference_only",
          observedAtMs: 500,
          likelyPresent: true,
          basis: ["consent_flow_action_candidates"],
          textExcerpt: "Manage preferences",
          evidenceRefs: [{ refId: "dom_ref_preference_only", artifactId: "dom_preference_only" }],
          confidence: 0.76,
        },
      ],
      consentActionCandidates: [
        consentActionCandidate("reject_all", "Reject Optional Cookies"),
        consentActionCandidate("manage_preferences", "Manage preferences"),
      ],
      consentActionAttempts: [
        consentActionAttempt("reject_all", {
          viaPreferenceCenter: true,
          preferenceCenterTraversal: {
            traversalId: "pref_traversal_reject",
            opened: true,
            openSucceeded: true,
            secondLayerObserved: true,
            secondLayerControlCount: 4,
            rejectAllControlObserved: true,
            saveChoicesControlObserved: true,
            acceptAllControlObserved: false,
            categoryTogglesObserved: 2,
            attemptedDisableCategoryToggles: true,
            disabledCategoryToggles: 2,
            attemptedRejectViaPreferenceCenter: true,
            attemptedSaveChoices: true,
            succeeded: true,
            confidence: 0.86,
            evidenceRefs: [{ refId: "ref_pref_reject", artifactId: "dom_pref_reject", eventType: "dom_snapshot" }],
            screenshotArtifactRefs: [],
            domArtifactRefs: [],
          },
          actionProof: {
            proofVersion: "consent_action_proof.v1",
            candidateObserved: true,
            candidateActionId: "candidate_reject_all",
            candidateLabelText: "Reject Optional Cookies",
            candidateSelectorSummary: "controlIndex:2",
            candidateConfidence: 0.86,
            actionPath: "preference_center_reject_all_save",
            attemptedStatus: "attempted_succeeded",
            actionTimestampMs: 1_000,
            postClickSettleMs: 1_200,
            evidenceRefs: [{ refId: "ref_pref_action", artifactId: "dom_pref_action", eventType: "dom_snapshot" }],
          },
        }),
      ],
      consentFlowComparisons: [],
    }),
  );

  const rejectControl = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "reject_control_observed_or_not_observed",
  );
  const rejectAction = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "reject_action_succeeded_or_not_testable",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const rejectRow = gdpr?.rows.find((row) => row.id === "reject_all_path_availability");

  assert.equal(rejectControl?.matchedCriteria.includes("reject_path_context:preference_center_proven"), true);
  assert.equal(rejectControl?.matchedCriteria.includes("preference_center_reject_path_proof_retained"), true);
  assert.equal(rejectControl?.missingCorroborators.length, 0);
  assert.equal(rejectAction?.matchedCriteria.includes("preference_center_reject_path_proof_retained"), true);
  assert.equal(rejectAction?.confidence, 0.82);
  assert.equal(rejectRow?.status, "checked");
  assert.equal(rejectRow?.missingOrIncompleteSourceSignals.length, 0);
});

test("Gatech-like delta-only post-reject persistence remains visible as review signal when reject is not testable", async () => {
  const result = await reviewEvidenceBundle(
    consentFlowBundle({
      consentActionAttempts: [
        consentActionAttempt("reject_all", {
          attempted: true,
          succeeded: false,
          failureReason: "banner_still_present_after_click",
        }),
        consentActionAttempt("accept_all", { scenario: "accept_all_flow" }),
      ],
      consentFlowComparisons: [
        {
          comparisonId: "comparison_gatech_delta_only",
          comparedScenarios: "fresh_pre_consent_vs_after_reject",
          vendorsPersistingAfterReject: [],
          vendorsSuppressedAfterReject: [],
          vendorsAppearingOnlyAfterAccept: [],
          cookiesPersistingAfterReject: [],
          cookiesSetAfterAccept: [],
          collectionEndpointsPersistingAfterReject: [],
          collectionEndpointsSuppressedAfterReject: [],
          collectionEndpointsAppearingOnlyAfterAccept: [],
          requestCountDeltaByVendor: {},
          cookieCountDeltaByVendor: {},
          journeyPhaseDeltas: [
            {
              journeyKey: "endpoint:www.google-analytics.com",
              displayName: "endpoint:www.google-analytics.com",
              observedPreConsent: true,
              observedAfterReject: true,
              persistedAfterReject: true,
              evidenceRefs: [],
            },
            {
              journeyKey: "endpoint:k.clarity.ms",
              displayName: "endpoint:k.clarity.ms",
              observedPreConsent: true,
              observedAfterReject: true,
              persistedAfterReject: true,
              evidenceRefs: [],
            },
            {
              journeyKey: "cookie:_ga",
              displayName: "cookie:_ga",
              observedPreConsent: true,
              observedAfterReject: true,
              persistedAfterReject: true,
              evidenceRefs: [],
            },
          ],
          confidence: 0.35,
          coverageLimitations: [{
            limitationKey: "reject_all_not_confidently_executed",
            description: "Consent action was not confidently executed, so post-action runtime deltas are not testable.",
            affectedFindingKeys: [],
            sourceModulesRequired: ["consentFlowRuntimeScanner"],
            sourceModulesPresent: ["consentFlowRuntimeScanner"],
          }],
          evidenceRefs: [{ refId: "ref_net_reject", eventId: "net_reject", eventType: "network_request" }],
        },
      ],
      normalizedVendorObservations: [
        {
          observationId: "vendor_google_analytics",
          entity: "Google LLC",
          vendor: "Google",
          product: "Google Analytics",
          purpose: "analytics",
          confidence: 0.92,
          basis: ["fixture"],
          regulatoryRelevance: ["consent", "analytics"],
          matchedEvidenceIds: [],
          matchedEvidenceRefs: [],
          matchSources: [],
          firstObservedAtMs: 500,
          lastObservedAtMs: 1_500,
          matchedHostnames: [],
          matchedUrls: [],
          matchedCookieNames: ["_ga"],
        },
        {
          observationId: "vendor_microsoft_clarity",
          entity: "Microsoft",
          vendor: "Microsoft",
          product: "Microsoft Clarity",
          purpose: "session_replay",
          confidence: 0.9,
          basis: ["fixture"],
          regulatoryRelevance: ["consent", "session_replay"],
          matchedEvidenceIds: [],
          matchedEvidenceRefs: [],
          matchSources: [],
          firstObservedAtMs: 700,
          lastObservedAtMs: 1_700,
          matchedHostnames: [],
          matchedUrls: [],
          matchedCookieNames: [],
        },
      ],
    }),
  );

  const trackingAfterRefusal = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "tracking_after_refusal_review_signal",
  );
  const rejectDidNotReduce = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "reject_did_not_reduce_tracking_review_signal",
  );
  const vendorsPersist = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "vendors_persist_after_reject_review_signal",
  );
  const cookiesPersist = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "cookies_persist_after_reject_review_signal",
  );

  for (const finding of [trackingAfterRefusal, rejectDidNotReduce, vendorsPersist, cookiesPersist]) {
    assert.equal(finding?.eligibility.status, "not_eligible", finding?.findingKey);
    assert.equal(finding?.matchedCriteria.includes("consent_flow_runtime_delta_detected"), true, finding?.findingKey);
    assert.equal(finding?.matchedCriteria.includes("post_reject_persisted_delta_count:3"), true, finding?.findingKey);
    assert.equal(finding?.matchedCriteria.includes("post_reject_persisted_endpoint_count:2"), true, finding?.findingKey);
    assert.equal(finding?.matchedCriteria.includes("post_reject_persisted_cookie_count:1"), true, finding?.findingKey);
    assert.equal(finding?.missingCorroborators.includes("confident_successful_consent_action_comparison"), true, finding?.findingKey);
    assert.deepEqual(
      finding?.sourceEvidenceRefs.map((ref) => ref.refId),
      ["ref_net_reject"],
      finding?.findingKey,
    );
  }
  assert.deepEqual(
    vendorsPersist?.relatedVendors.map((vendor) => vendor.product).sort(),
    ["Google Analytics", "Microsoft Clarity"],
  );
});

test("consent-flow failed action keeps refusal deltas not testable", async () => {
  const result = await reviewEvidenceBundle(
    consentFlowBundle({
      consentActionAttempts: [
        consentActionAttempt("reject_all", {
          attempted: true,
          succeeded: false,
          failureReason: "banner_still_present_after_click",
        }),
      ],
      consentFlowComparisons: [
        {
          comparisonId: "comparison_reject_not_testable",
          comparedScenarios: "fresh_pre_consent_vs_after_reject",
          vendorsPersistingAfterReject: [],
          vendorsSuppressedAfterReject: [],
          vendorsAppearingOnlyAfterAccept: [],
          cookiesPersistingAfterReject: [],
          cookiesSetAfterAccept: [],
          collectionEndpointsPersistingAfterReject: [],
          collectionEndpointsSuppressedAfterReject: [],
          collectionEndpointsAppearingOnlyAfterAccept: [],
          requestCountDeltaByVendor: {},
          cookieCountDeltaByVendor: {},
          journeyPhaseDeltas: [],
          confidence: 0.35,
          coverageLimitations: [],
          evidenceRefs: [],
        },
      ],
    }),
  );

  const rejectAction = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "reject_action_succeeded_or_not_testable",
  );
  const trackingAfterRefusal = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "tracking_after_refusal_review_signal",
  );

  assert.equal(rejectAction?.eligibility.status, "not_eligible");
  assert.deepEqual(rejectAction?.demotionReasons, ["action_not_testable_or_not_successful"]);
  assert.equal(trackingAfterRefusal?.eligibility.status, "not_eligible");
  assert.equal((trackingAfterRefusal?.confidence ?? 1) < 0.8, true);
});

test("consent-flow runtime deltas are not eligible when actions were not confidently executed", async () => {
  const result = await reviewEvidenceBundle(
    consentFlowBundle({
      consentActionAttempts: [
        consentActionAttempt("reject_all", {
          attempted: false,
          succeeded: false,
          failureReason: "candidate_confidence_too_low",
        }),
        consentActionAttempt("accept_all", {
          scenario: "accept_all_flow",
          attempted: false,
          succeeded: false,
          failureReason: "candidate_confidence_too_low",
        }),
      ],
      consentFlowComparisons: [
        {
          comparisonId: "comparison_unconfident_delta",
          comparedScenarios: "fresh_pre_consent_vs_after_accept",
          vendorsPersistingAfterReject: [],
          vendorsSuppressedAfterReject: [],
          vendorsAppearingOnlyAfterAccept: ["Google Analytics"],
          cookiesPersistingAfterReject: [],
          cookiesSetAfterAccept: ["_ga"],
          collectionEndpointsPersistingAfterReject: [],
          collectionEndpointsSuppressedAfterReject: [],
          collectionEndpointsAppearingOnlyAfterAccept: ["www.google-analytics.com"],
          requestCountDeltaByVendor: { "Google Analytics": 1 },
          cookieCountDeltaByVendor: { "_ga": 1 },
          journeyPhaseDeltas: [
            {
              journeyKey: "vendor:Google Analytics",
              displayName: "Google Analytics",
              observedPreConsent: false,
              observedAfterAccept: true,
              appearedOnlyAfterAccept: true,
              evidenceRefs: [{ refId: "ref_net_accept", eventId: "net_accept", eventType: "network_request" }],
            },
          ],
          confidence: 0.35,
          coverageLimitations: [{
            limitationKey: "accept_all_not_confidently_executed",
            description: "Consent action was not confidently executed, so post-action runtime deltas are not testable.",
            affectedFindingKeys: [],
          }],
          evidenceRefs: [{ refId: "ref_net_accept", eventId: "net_accept", eventType: "network_request" }],
        },
      ],
    }),
  );

  const runtimeDelta = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "accept_reject_runtime_delta_observed",
  );
  const acceptOnlyVendors = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "vendors_appear_only_after_accept_review_signal",
  );

  assert.equal(runtimeDelta?.eligibility.status, "not_eligible");
  assert.equal(runtimeDelta?.missingCorroborators.includes("consent_flow_comparable_delta"), true);
  assert.equal(acceptOnlyVendors?.eligibility.status, "not_eligible");
});

test("confident accept-only deltas do not satisfy accept/reject comparability", async () => {
  const result = await reviewEvidenceBundle(
    consentFlowBundle({
      consentActionAttempts: [
        consentActionAttempt("accept_all", {
          scenario: "accept_all_flow",
          attempted: true,
          succeeded: true,
        }),
        consentActionAttempt("reject_all", {
          attempted: false,
          succeeded: false,
          failureReason: "candidate_confidence_too_low",
        }),
      ],
      consentFlowComparisons: [
        {
          comparisonId: "comparison_accept_only_delta",
          comparedScenarios: "fresh_pre_consent_vs_after_accept",
          vendorsPersistingAfterReject: [],
          vendorsSuppressedAfterReject: [],
          vendorsAppearingOnlyAfterAccept: ["Google Analytics"],
          cookiesPersistingAfterReject: [],
          cookiesSetAfterAccept: ["_ga"],
          collectionEndpointsPersistingAfterReject: [],
          collectionEndpointsSuppressedAfterReject: [],
          collectionEndpointsAppearingOnlyAfterAccept: ["www.google-analytics.com"],
          requestCountDeltaByVendor: { "Google Analytics": 1 },
          cookieCountDeltaByVendor: { "_ga": 1 },
          journeyPhaseDeltas: [
            {
              journeyKey: "vendor:Google Analytics",
              displayName: "Google Analytics",
              observedPreConsent: false,
              observedAfterAccept: true,
              appearedOnlyAfterAccept: true,
              evidenceRefs: [{ refId: "ref_net_accept", eventId: "net_accept", eventType: "network_request" }],
            },
          ],
          confidence: 0.78,
          coverageLimitations: [],
          comparableMeasurement: comparableMeasurement("fresh_pre_consent_vs_after_accept"),
          evidenceRefs: [{ refId: "ref_net_accept", eventId: "net_accept", eventType: "network_request" }],
        },
        {
          comparisonId: "comparison_reject_not_testable",
          comparedScenarios: "after_reject_vs_after_accept",
          vendorsPersistingAfterReject: [],
          vendorsSuppressedAfterReject: [],
          vendorsAppearingOnlyAfterAccept: [],
          cookiesPersistingAfterReject: [],
          cookiesSetAfterAccept: [],
          collectionEndpointsPersistingAfterReject: [],
          collectionEndpointsSuppressedAfterReject: [],
          collectionEndpointsAppearingOnlyAfterAccept: [],
          requestCountDeltaByVendor: {},
          cookieCountDeltaByVendor: {},
          journeyPhaseDeltas: [],
          confidence: 0.35,
          coverageLimitations: [{
            limitationKey: "reject_all_not_confidently_executed",
            description: "Consent action was not confidently executed, so post-action runtime deltas are not testable.",
            affectedFindingKeys: [],
          }],
          evidenceRefs: [],
        },
      ],
    }),
  );

  const runtimeDelta = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "accept_reject_runtime_delta_observed",
  );
  const acceptOnlyVendors = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "vendors_appear_only_after_accept_review_signal",
  );

  assert.equal(acceptOnlyVendors?.eligibility.status, "eligible");
  assert.equal(runtimeDelta?.eligibility.status, "not_eligible");
  assert.equal(runtimeDelta?.missingCorroborators.includes("consent_flow_comparable_delta"), true);
});

test("accept/reject parity requires both successful retained action attempts", async () => {
  const result = await reviewEvidenceBundle(
    consentFlowBundle({
      consentActionAttempts: [
        consentActionAttempt("reject_all"),
        consentActionAttempt("accept_all", {
          scenario: "accept_all_flow",
          attempted: true,
          succeeded: false,
          failureReason: "banner_still_present_after_click",
          actionProof: {
            proofVersion: "consent_action_proof.v1",
            candidateObserved: true,
            candidateActionId: "candidate_accept_all",
            candidateLabelText: "Accept All",
            candidateSelectorSummary: "controlIndex:0",
            candidateConfidence: 0.9,
            attemptedStatus: "attempted_failed",
            failureReason: "banner_still_present_after_click",
            actionTimestampMs: 1_000,
            postClickSettleMs: 1_200,
            evidenceRefs: [{ refId: "ref_attempt_accept_all", artifactId: "dom_attempt_accept_all", eventType: "dom_snapshot" }],
          },
        }),
      ],
    }),
  );

  const runtimeDelta = result.findingCandidates.find((candidate) =>
    candidate.findingKey === "accept_reject_runtime_delta_observed",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const acceptRejectParityRow = gdpr?.rows.find((row) => row.id === "accept_reject_parity");

  assert.equal(runtimeDelta?.eligibility.status, "not_eligible");
  assert.equal(runtimeDelta?.missingCorroborators.includes("successful_accept_and_reject_actions"), true);
  assert.equal(runtimeDelta?.demotionReasons.includes("accept_reject_actions_not_both_successful"), true);
  assert.equal(acceptRejectParityRow?.status, "not_observed");
});

test("Google-owned unresolved collection endpoint is a review signal, not a named vendor finding", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      observedJourneys: [
        {
          journeyId: "journey_google_unknown_collect",
          journeyType: "endpoint",
          key: "endpoint:https://www.google.com/collect",
          displayName: "www.google.com",
          sourceScanner: "pre_consent_runtime",
          scenariosObserved: ["fresh_pre_consent"],
          firstObservedAtMs: 500,
          lastObservedAtMs: 500,
          firstObservedConsentState: "pre_consent",
          consentStatesObserved: ["pre_consent"],
          firstPartyOrThirdParty: "third_party",
          entryPoint: "https://www.google.com/collect",
          relatedCookies: [],
          relatedScripts: [],
          relatedEndpoints: ["https://www.google.com/collect"],
          relatedVendors: [],
          observedBehaviors: ["third_party_request_observed", "collection_endpoint_observed"],
          endpointSubtype: "google_owned_unresolved_meaningful",
          attributionStatus: "unresolved_meaningful",
          attributionReason: "google_owned_collection_like_endpoint_without_product_attribution",
          resolverBasis: ["google_endpoint_subtype:google_owned_unresolved_meaningful"],
          relatedEvidenceRefs: [],
          eventRefs: [
            {
              eventId: "net_google_unknown_collect",
              eventType: "network_request",
              timestampMs: 500,
              url: "https://www.google.com/collect",
              behavior: "collection_endpoint_observed",
              thirdParty: true,
            },
          ],
          confidence: 0.58,
          directVsInferred: "inferred",
          evidenceRefs: [
            {
              refId: "ref_net_google_unknown_collect",
              eventId: "net_google_unknown_collect",
              eventType: "network_request",
              url: "https://www.google.com/collect",
            },
          ],
        },
      ],
      derivedRuntimeSignals: {
        thirdPartyVendorsObserved: false,
        preConsentTrackingObserved: false,
        thirdPartyCookiesPreConsentObserved: false,
        consentBannerLikelyPresent: false,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        notes: [],
      },
    }),
  );

  const vendorFinding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "third_party_vendors_observed",
  );
  const trackerFinding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "pre_consent_tracking_detected",
  );
  const unresolvedSignal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "unresolved_collection_endpoint_review_signal",
  );

  assert.equal(vendorFinding?.eligibility.status, "not_eligible");
  assert.equal(trackerFinding?.eligibility.status, "not_eligible");
  assert.equal(unresolvedSignal?.eligibility.status, "eligible");
  assert.equal(unresolvedSignal?.directVsInferred, "inferred");
});

function policyBundle(
  overrides: Parameters<typeof minimalBundle>[0] = {},
): ReturnType<typeof minimalBundle> {
  return minimalBundle({
    scanProfile: {
      profileId: "policy",
      label: "Policy-surface scan",
      targetDurationMs: 12_000,
      internalBudgetMs: 15_000,
      enabledModules: ["policySurfaceScanner"],
    },
    modulesRun: [policyModuleRun()],
    ...overrides,
  });
}

function policyModuleRun(): ReturnType<typeof minimalBundle>["modulesRun"][number] {
  return {
    moduleName: "policySurfaceScanner",
    status: "completed",
    startedAt: "2026-01-01T00:00:00.500Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 500,
    evidenceRefs: [],
    errors: [],
  };
}

function policyObservation(
  overrides: Partial<ReturnType<typeof minimalBundle>["policySurfaceObservations"][number]>,
): ReturnType<typeof minimalBundle>["policySurfaceObservations"][number] {
  const normalizedUrl = overrides.normalizedUrl ?? "https://example.com/privacy";
  const artifactId = `artifact_${overrides.observationId ?? "policy"}`;
  return {
    observationId: "policy_observation",
    sourceScanner: "policy_surface",
    scenario: "policy_surface_review",
    consentStateAtTime: "not_applicable",
    surfaceType: "privacy_policy",
    url: normalizedUrl,
    normalizedUrl,
    linkText: "Privacy Policy",
    discoveryMethod: "footer_link",
    status: "fetched",
    httpStatus: 200,
    title: "Privacy Policy",
    textExcerpt: "Privacy Policy excerpt.",
    boundedTextExcerptIds: [artifactId],
    observedTopics: [],
    mentionedVendors: [],
    mentionedPurposes: [],
    mentionedRights: [],
    mentionedControls: [],
    evidenceRefs: [{
      refId: `ref_${artifactId}`,
      artifactId,
      eventType: "policy_surface",
      url: normalizedUrl,
      excerpt: overrides.textExcerpt ?? "Privacy Policy excerpt.",
    }],
    artifactRefs: [{
      artifactId,
      artifactType: "other",
      sensitivity: "redacted",
      redactionStatus: "redacted",
      relatedEventIds: [],
      label: "policy excerpt",
    }],
    assistMetadata: [],
    confidence: 0.82,
    directVsInferred: "direct",
    ...overrides,
  };
}

function consentFlowBundle(
  overrides: Parameters<typeof minimalBundle>[0] = {},
): ReturnType<typeof minimalBundle> {
  return minimalBundle({
    scanProfile: {
      profileId: "consent",
      label: "Consent-flow runtime scan",
      targetDurationMs: 12_000,
      internalBudgetMs: 15_000,
      enabledModules: ["preConsentRuntimeScanner", "consentFlowRuntimeScanner"],
    },
    modulesRun: [
      {
        moduleName: "preConsentRuntimeScanner",
        status: "completed",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z",
        durationMs: 1_000,
        evidenceRefs: [],
        errors: [],
      },
      consentFlowModuleRun(),
    ],
    consentActionCandidates: [
      consentActionCandidate("reject_all", "Reject All"),
      consentActionCandidate("accept_all", "Accept All"),
    ],
    consentActionAttempts: [
      consentActionAttempt("reject_all"),
      consentActionAttempt("accept_all", { scenario: "accept_all_flow" }),
    ],
    consentFlowComparisons: [
      {
        comparisonId: "comparison_after_reject",
        comparedScenarios: "fresh_pre_consent_vs_after_reject",
        vendorsPersistingAfterReject: [],
        vendorsSuppressedAfterReject: [],
        vendorsAppearingOnlyAfterAccept: [],
        cookiesPersistingAfterReject: ["_ga"],
        cookiesSetAfterAccept: [],
        collectionEndpointsPersistingAfterReject: ["www.google-analytics.com"],
        collectionEndpointsSuppressedAfterReject: [],
        collectionEndpointsAppearingOnlyAfterAccept: [],
        requestCountDeltaByVendor: {},
        cookieCountDeltaByVendor: { "_ga": 0 },
        journeyPhaseDeltas: [
          {
            journeyKey: "endpoint:www.google-analytics.com",
            displayName: "www.google-analytics.com",
            observedPreConsent: true,
            observedAfterReject: true,
            persistedAfterReject: true,
            evidenceRefs: [{ refId: "ref_net_reject", eventId: "net_reject", eventType: "network_request" }],
          },
        ],
        confidence: 0.78,
        coverageLimitations: [],
        comparableMeasurement: comparableMeasurement("fresh_pre_consent_vs_after_reject"),
        evidenceRefs: [{ refId: "ref_net_reject", eventId: "net_reject", eventType: "network_request" }],
      },
      {
        comparisonId: "comparison_after_accept",
        comparedScenarios: "fresh_pre_consent_vs_after_accept",
        vendorsPersistingAfterReject: [],
        vendorsSuppressedAfterReject: [],
        vendorsAppearingOnlyAfterAccept: ["Google Analytics"],
        cookiesPersistingAfterReject: [],
        cookiesSetAfterAccept: ["_ga"],
        collectionEndpointsPersistingAfterReject: [],
        collectionEndpointsSuppressedAfterReject: [],
        collectionEndpointsAppearingOnlyAfterAccept: ["www.google-analytics.com"],
        requestCountDeltaByVendor: { "Google Analytics": 1 },
        cookieCountDeltaByVendor: { "_ga": 1 },
        journeyPhaseDeltas: [
          {
            journeyKey: "vendor:Google Analytics",
            displayName: "Google Analytics",
            observedPreConsent: false,
            observedAfterAccept: true,
            appearedOnlyAfterAccept: true,
            evidenceRefs: [{ refId: "ref_net_accept", eventId: "net_accept", eventType: "network_request" }],
          },
        ],
        confidence: 0.78,
        coverageLimitations: [],
        comparableMeasurement: comparableMeasurement("fresh_pre_consent_vs_after_accept"),
        evidenceRefs: [{ refId: "ref_net_accept", eventId: "net_accept", eventType: "network_request" }],
      },
      {
        comparisonId: "comparison_after_reject_vs_after_accept",
        comparedScenarios: "after_reject_vs_after_accept",
        vendorsPersistingAfterReject: [],
        vendorsSuppressedAfterReject: [],
        vendorsAppearingOnlyAfterAccept: ["Google Analytics"],
        cookiesPersistingAfterReject: [],
        cookiesSetAfterAccept: ["_ga"],
        collectionEndpointsPersistingAfterReject: [],
        collectionEndpointsSuppressedAfterReject: [],
        collectionEndpointsAppearingOnlyAfterAccept: ["www.google-analytics.com"],
        requestCountDeltaByVendor: { "Google Analytics": 1 },
        cookieCountDeltaByVendor: { "_ga": 1 },
        journeyPhaseDeltas: [
          {
            journeyKey: "vendor:Google Analytics",
            displayName: "Google Analytics",
            observedAfterReject: false,
            observedAfterAccept: true,
            appearedOnlyAfterAccept: true,
            evidenceRefs: [{ refId: "ref_net_accept", eventId: "net_accept", eventType: "network_request" }],
          },
        ],
        confidence: 0.78,
        coverageLimitations: [],
        comparableMeasurement: comparableMeasurement("after_reject_vs_after_accept"),
        evidenceRefs: [{ refId: "ref_net_accept", eventId: "net_accept", eventType: "network_request" }],
      },
    ],
    normalizedVendorObservations: [
      {
        observationId: "vendor_google_analytics",
        entity: "Google LLC",
        vendor: "Google",
        product: "Google Analytics",
        purpose: "analytics",
        confidence: 0.92,
        basis: ["fixture"],
        regulatoryRelevance: ["consent", "analytics"],
        matchedEvidenceIds: ["net_accept"],
        matchedEvidenceRefs: [{ refId: "ref_net_accept", eventId: "net_accept", eventType: "network_request" }],
        matchSources: [{
          source: "network_request",
          sourceEventId: "net_accept",
          sourceEventType: "network_request",
          sourceScanner: "consent_flow_runtime",
          scenario: "accept_all_flow",
          consentStateAtTime: "post_accept",
          matchedField: "hostname",
          matchedValueRedacted: "www.google-analytics.com",
          resolverBasis: ["fixture"],
          confidence: 0.92,
        }],
        firstObservedAtMs: 500,
        lastObservedAtMs: 1_500,
        matchedHostnames: ["www.google-analytics.com"],
        matchedUrls: ["https://www.google-analytics.com/g/collect"],
        matchedCookieNames: [],
      },
    ],
    ...overrides,
  });
}

function consentFlowModuleRun(): ReturnType<typeof minimalBundle>["modulesRun"][number] {
  return {
    moduleName: "consentFlowRuntimeScanner",
    status: "completed",
    startedAt: "2026-01-01T00:00:01.000Z",
    completedAt: "2026-01-01T00:00:03.000Z",
    durationMs: 2_000,
    evidenceRefs: [],
    errors: [],
  };
}

function consentActionCandidate(
  actionType: ReturnType<typeof minimalBundle>["consentActionCandidates"][number]["actionType"],
  labelText: string,
): ReturnType<typeof minimalBundle>["consentActionCandidates"][number] {
  return {
    actionId: `candidate_${actionType}`,
    actionType,
    labelText,
    normalizedLabel: labelText.toLowerCase(),
    selectorSummary: "controlIndex:0",
    visible: true,
    enabled: true,
    confidence: 0.9,
    detectionMethod: "deterministic_text",
    shouldClick: true,
    evidenceRefs: [{ refId: `ref_candidate_${actionType}`, artifactId: `dom_${actionType}`, eventType: "dom_snapshot", excerpt: labelText }],
    screenshotArtifactRefs: [],
    assistMetadata: [],
  };
}

function consentActionAttempt(
  actionType: ReturnType<typeof minimalBundle>["consentActionAttempts"][number]["actionType"],
  overrides: Partial<ReturnType<typeof minimalBundle>["consentActionAttempts"][number]> = {},
): ReturnType<typeof minimalBundle>["consentActionAttempts"][number] {
  const attempted = overrides.attempted ?? true;
  const succeeded = overrides.succeeded ?? true;
  const failureReason = overrides.failureReason;
  return {
    attemptId: `attempt_${actionType}`,
    actionType,
    attempted,
    succeeded,
    failureReason,
    bannerPresentBefore: true,
    bannerPresentAfter: false,
    actionProof: {
      proofVersion: "consent_action_proof.v1",
      candidateObserved: attempted,
      candidateActionId: `candidate_${actionType}`,
      candidateLabelText: actionType === "accept_all" ? "Accept All" : "Reject All",
      candidateSelectorSummary: "controlIndex:0",
      candidateConfidence: 0.9,
      actionPath: "direct_action",
      attemptedStatus: attempted ? succeeded ? "attempted_succeeded" : "attempted_failed" : "not_attempted",
      failureReason,
      actionTimestampMs: attempted ? 1_000 : undefined,
      postClickSettleMs: attempted ? 1_200 : undefined,
      evidenceRefs: [{ refId: `ref_attempt_${actionType}`, artifactId: `dom_attempt_${actionType}`, eventType: "dom_snapshot" }],
    },
    timestampMs: 1_000,
    scenario: "reject_all_flow",
    evidenceRefs: [{ refId: `ref_attempt_${actionType}`, artifactId: `dom_attempt_${actionType}`, eventType: "dom_snapshot" }],
    ...overrides,
  };
}

function comparableMeasurement(
  comparedScenarios: ReturnType<typeof minimalBundle>["consentFlowComparisons"][number]["comparedScenarios"],
): NonNullable<ReturnType<typeof minimalBundle>["consentFlowComparisons"][number]["comparableMeasurement"]> {
  const rejectActionEvent = comparedScenarios.includes("reject") || comparedScenarios === "fresh_pre_consent_vs_privacy_opt_out"
    ? {
      attemptId: comparedScenarios === "fresh_pre_consent_vs_privacy_opt_out" ? "attempt_do_not_sell_share" : "attempt_reject_all",
      attempted: true,
      succeeded: true,
      actionTimestampMs: 1_000,
      postClickSettleMs: 1_200,
      proofAvailable: true,
    }
    : undefined;
  return {
    comparable: true,
    preActionWindow: {
      scenario: comparedScenarios === "after_reject_vs_after_accept" ? "reject_all_flow" : "baseline_pre_consent",
      consentStateAtEnd: comparedScenarios === "after_reject_vs_after_accept" ? "post_reject" : "pre_consent",
      startedAtMs: 0,
      completedAtMs: 1_000,
      networkEventCount: 1,
      cookieEventCount: 1,
    },
    postActionWindow: {
      scenario: comparedScenarios === "fresh_pre_consent_vs_after_reject"
        ? "reject_all_flow"
        : comparedScenarios === "fresh_pre_consent_vs_gpc_enabled"
          ? "gpc_enabled"
          : comparedScenarios === "fresh_pre_consent_vs_privacy_opt_out" ? "privacy_opt_out_flow" : "accept_all_flow",
      consentStateAtEnd: comparedScenarios === "fresh_pre_consent_vs_after_reject"
        ? "post_reject"
        : comparedScenarios === "fresh_pre_consent_vs_gpc_enabled"
          ? "pre_consent"
          : comparedScenarios === "fresh_pre_consent_vs_privacy_opt_out" ? "post_reject" : "post_accept",
      startedAtMs: 1_200,
      completedAtMs: 2_400,
      networkEventCount: 1,
      cookieEventCount: 1,
    },
    rejectActionEvent,
  };
}

test("Google consent/tag support endpoint is not an unresolved review signal", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      observedJourneys: [
        {
          journeyId: "journey_google_ccm",
          journeyType: "endpoint",
          key: "endpoint:https://www.google.com/ccm/collect",
          displayName: "www.google.com",
          sourceScanner: "pre_consent_runtime",
          scenariosObserved: ["fresh_pre_consent"],
          firstObservedAtMs: 500,
          lastObservedAtMs: 500,
          firstObservedConsentState: "pre_consent",
          consentStatesObserved: ["pre_consent"],
          firstPartyOrThirdParty: "third_party",
          entryPoint: "https://www.google.com/ccm/collect",
          relatedCookies: [],
          relatedScripts: [],
          relatedEndpoints: ["https://www.google.com/ccm/collect"],
          relatedVendors: [],
          observedBehaviors: ["third_party_request_observed", "collection_endpoint_observed"],
          endpointSubtype: "google_consent_or_tag_support",
          attributionStatus: "site_owned_infrastructure",
          attributionReason: "google_consent_or_tag_support",
          resolverBasis: ["google_endpoint_subtype:google_consent_or_tag_support"],
          relatedEvidenceRefs: [],
          eventRefs: [
            {
              eventId: "net_google_ccm",
              eventType: "network_request",
              timestampMs: 500,
              url: "https://www.google.com/ccm/collect",
              behavior: "collection_endpoint_observed",
              thirdParty: true,
            },
          ],
          confidence: 0.52,
          directVsInferred: "inferred",
          evidenceRefs: [
            {
              refId: "ref_net_google_ccm",
              eventId: "net_google_ccm",
              eventType: "network_request",
              url: "https://www.google.com/ccm/collect",
            },
          ],
        },
      ],
      derivedRuntimeSignals: {
        thirdPartyVendorsObserved: false,
        preConsentTrackingObserved: false,
        thirdPartyCookiesPreConsentObserved: false,
        consentBannerLikelyPresent: false,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        notes: [],
      },
    }),
  );

  const trackerFinding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "pre_consent_tracking_detected",
  );
  const unresolvedSignal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "unresolved_collection_endpoint_review_signal",
  );

  assert.equal(trackerFinding?.eligibility.status, "not_eligible");
  assert.equal(unresolvedSignal?.eligibility.status, "not_eligible");
});

test("site-owned infrastructure endpoint is not an unresolved review signal or vendor finding", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      observedJourneys: [
        {
          journeyId: "journey_nbcu_video_ads",
          journeyType: "endpoint",
          key: "endpoint:https://video-ads-module.ad-tech.nbcuni.com/collect",
          displayName: "video-ads-module.ad-tech.nbcuni.com",
          sourceScanner: "pre_consent_runtime",
          scenariosObserved: ["fresh_pre_consent"],
          firstObservedAtMs: 500,
          lastObservedAtMs: 500,
          firstObservedConsentState: "pre_consent",
          consentStatesObserved: ["pre_consent"],
          firstPartyOrThirdParty: "third_party",
          entryPoint: "https://video-ads-module.ad-tech.nbcuni.com/collect",
          relatedCookies: [],
          relatedScripts: [],
          relatedEndpoints: ["https://video-ads-module.ad-tech.nbcuni.com/collect"],
          relatedVendors: [],
          observedBehaviors: ["third_party_request_observed", "collection_endpoint_observed"],
          attributionStatus: "site_owned_infrastructure",
          attributionReason: "nbcuniversal_video_ad_infrastructure_without_third_party_vendor_attribution",
          resolverBasis: ["site_owned_affiliate:nbcuniversal"],
          relatedEvidenceRefs: [],
          eventRefs: [
            {
              eventId: "net_nbcu_video_ads",
              eventType: "network_request",
              timestampMs: 500,
              url: "https://video-ads-module.ad-tech.nbcuni.com/collect",
              behavior: "collection_endpoint_observed",
              thirdParty: true,
            },
          ],
          confidence: 0.52,
          directVsInferred: "inferred",
          evidenceRefs: [
            {
              refId: "ref_net_nbcu_video_ads",
              eventId: "net_nbcu_video_ads",
              eventType: "network_request",
              url: "https://video-ads-module.ad-tech.nbcuni.com/collect",
            },
          ],
        },
      ],
      derivedRuntimeSignals: {
        thirdPartyVendorsObserved: false,
        preConsentTrackingObserved: false,
        thirdPartyCookiesPreConsentObserved: false,
        consentBannerLikelyPresent: false,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        notes: [],
      },
    }),
  );

  const vendorFinding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "third_party_vendors_observed",
  );
  const trackerFinding = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "pre_consent_tracking_detected",
  );
  const unresolvedSignal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "unresolved_collection_endpoint_review_signal",
  );
  const endpointTransferSignal = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "endpoint_transfer_review_signal",
  );
  const gdpr = result.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  const crossBorderRow = gdpr?.rows.find((row) => row.id === "cross_border_endpoint_review");

  assert.equal(vendorFinding?.eligibility.status, "not_eligible");
  assert.equal(trackerFinding?.eligibility.status, "not_eligible");
  assert.equal(unresolvedSignal?.eligibility.status, "not_eligible");
  assert.equal(endpointTransferSignal?.eligibility.status, "not_eligible");
  assert.equal(crossBorderRow?.status, "not_observed");
});

test("first-party vendor-associated GA cookie is not third-party cookie finding", async () => {
  const result = await reviewEvidenceBundle(
    minimalBundle({
      observedJourneys: [
        {
          journeyId: "journey_first_party_ga",
          journeyType: "cookie",
          key: "cookie:_ga",
          displayName: "_ga",
          entity: "Google LLC",
          vendor: "Google",
          product: "Google Analytics",
          purpose: "analytics",
          sourceScanner: "pre_consent_runtime",
          scenariosObserved: ["fresh_pre_consent"],
          firstObservedAtMs: 500,
          lastObservedAtMs: 500,
          firstObservedConsentState: "pre_consent",
          consentStatesObserved: ["pre_consent"],
          firstPartyOrThirdParty: "first_party",
          relatedCookies: ["_ga"],
          relatedScripts: [],
          relatedEndpoints: [],
          relatedVendors: ["Google"],
          observedBehaviors: ["cookie_set"],
          eventRefs: [
            {
              eventId: "cookie_ga",
              eventType: "cookie",
              timestampMs: 500,
              label: "_ga",
              behavior: "cookie_set",
              firstParty: true,
            },
          ],
          confidence: 0.9,
          directVsInferred: "direct",
          evidenceRefs: [
            {
              refId: "ref_cookie_ga",
              eventId: "cookie_ga",
              eventType: "cookie",
              label: "_ga",
            },
          ],
        },
      ],
      normalizedVendorObservations: [
        {
          observationId: "vendor_google_analytics",
          entity: "Google LLC",
          vendor: "Google",
          product: "Google Analytics",
          purpose: "analytics",
          confidence: 0.96,
          basis: ["fixture_cookie"],
          regulatoryRelevance: ["consent", "analytics"],
          matchedEvidenceIds: ["cookie_ga"],
          matchedHostnames: ["example.com"],
          matchedUrls: [],
          matchedCookieNames: ["_ga"],
        },
      ],
      derivedRuntimeSignals: {
        thirdPartyVendorsObserved: true,
        preConsentTrackingObserved: false,
        thirdPartyCookiesPreConsentObserved: false,
        consentBannerLikelyPresent: false,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        notes: [],
      },
    }),
  );

  const thirdPartyCookie = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "third_party_cookie_pre_consent",
  );
  const vendorCookie = result.findingCandidates.find(
    (candidate) => candidate.findingKey === "vendor_associated_cookie_pre_consent",
  );

  assert.equal(thirdPartyCookie?.eligibility.status, "not_eligible");
  assert.equal(vendorCookie?.eligibility.status, "eligible");
  assert.deepEqual(vendorCookie?.demotionReasons, [
    "first_party_cookie_not_third_party_cookie_finding",
  ]);
});
