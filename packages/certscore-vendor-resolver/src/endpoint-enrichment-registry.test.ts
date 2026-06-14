import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import {
  buildEndpointEnrichmentOverlay,
  collectEndpointEnrichmentCandidatesFromBundle,
  createEmptyEndpointEnrichmentRegistry,
  enrichEndpointHostname,
  updateEndpointEnrichmentRegistry,
} from "./endpoint-enrichment-registry.js";

test("collects only third-party collection endpoints without retained region evidence", () => {
  const candidates = collectEndpointEnrichmentCandidatesFromBundle(bundleWithNetworkEvents([
    {
      hostname: "collector.example.com",
      collectionEndpointObserved: true,
      thirdParty: true,
      endpointGeographyStatus: "unknown",
    },
    {
      hostname: "collector.us-east-1.amazonaws.com",
      collectionEndpointObserved: true,
      thirdParty: true,
      endpointGeographyStatus: "region_observed",
    },
    {
      hostname: "first.example.test",
      collectionEndpointObserved: true,
      thirdParty: false,
      endpointGeographyStatus: "unknown",
    },
    {
      hostname: "cdn.example.net",
      collectionEndpointObserved: false,
      thirdParty: true,
    },
  ]));

  assert.deepEqual(candidates, [
    {
      hostname: "collector.example.com",
      observedAt: "2026-06-12T10:00:05.000Z",
      sourceDomain: "example.test",
      sourceScanId: "scan_registry_fixture",
    },
  ]);
});

test("builds host-only endpoint enrichment overlay for observed bundle endpoints", () => {
  const bundle = bundleWithNetworkEvents([
    {
      hostname: "metrics.example.com",
      collectionEndpointObserved: true,
      thirdParty: true,
      endpointGeographyStatus: "unknown",
    },
    {
      hostname: "unused.example.com",
      collectionEndpointObserved: false,
      thirdParty: true,
    },
  ]);
  const registry = {
    ...createEmptyEndpointEnrichmentRegistry(new Date("2026-06-12T10:00:00.000Z")),
    updatedAt: "2026-06-12T10:05:00.000Z",
    entries: [
      {
        basis: ["host_only_endpoint_geography", "dns_cname_chain", "provider_region_catalog"],
        dnsCnameChain: ["abc.execute-api.us-east-1.amazonaws.com"],
        endpointGeographyJurisdiction: "US",
        endpointGeographyLocationLabel: "AWS US East (N. Virginia)",
        endpointGeographyPrecision: "provider_region" as const,
        endpointGeographyProvider: "AWS",
        endpointGeographyRegion: "us-east-1",
        endpointGeographyStatus: "region_observed" as const,
        enrichmentAttempts: 1,
        firstObservedAt: "2026-06-12T10:00:05.000Z",
        hostname: "metrics.example.com",
        lastEnrichedAt: "2026-06-12T10:05:00.000Z",
        lastObservedAt: "2026-06-12T10:00:05.000Z",
        observationCount: 3,
        sourceDomains: ["example.test"],
        sourceScanIds: ["scan_registry_fixture"],
      },
      {
        basis: ["host_only_endpoint_geography", "provider_region_catalog"],
        dnsCnameChain: [],
        endpointGeographyRegion: "us-west-2",
        endpointGeographyStatus: "region_observed" as const,
        enrichmentAttempts: 1,
        firstObservedAt: "2026-06-12T10:00:05.000Z",
        hostname: "not-in-bundle.example.com",
        lastObservedAt: "2026-06-12T10:00:05.000Z",
        observationCount: 1,
        sourceDomains: [],
        sourceScanIds: [],
      },
    ],
  };

  const overlay = buildEndpointEnrichmentOverlay(bundle, registry, new Date("2026-06-12T10:06:00.000Z"));

  assert.equal(overlay.overlayVersion, "certscore.endpoint_enrichment_overlay.1");
  assert.equal(overlay.sourceBundleScanId, "scan_registry_fixture");
  assert.equal(overlay.sourceRegistryUpdatedAt, "2026-06-12T10:05:00.000Z");
  assert.equal(overlay.endpointOverlays.length, 1);
  assert.deepEqual(overlay.endpointOverlays[0], {
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
  });
});

test("enriches endpoint hostname from bounded CNAME region evidence", async () => {
  const result = await enrichEndpointHostname("metrics.example.com", {
    now: new Date("2026-06-12T10:00:00.000Z"),
    resolveCname: async (hostname) => hostname === "metrics.example.com"
      ? ["abc.execute-api.us-east-1.amazonaws.com"]
      : [],
  });

  assert.equal(result.endpointGeographyStatus, "region_observed");
  assert.equal(result.endpointGeographyRegion, "us-east-1");
  assert.equal(result.endpointGeographyProvider, "AWS");
  assert.equal(result.endpointGeographyLocationLabel, "AWS US East (N. Virginia)");
  assert.equal(result.endpointGeographyJurisdiction, "US");
  assert.equal(result.endpointGeographyPrecision, "provider_region");
  assert.deepEqual(result.dnsCnameChain, ["abc.execute-api.us-east-1.amazonaws.com"]);
  assert.equal(result.basis.includes("dns_cname_chain"), true);
  assert.equal(result.basis.includes("provider_region_catalog"), true);
});

test("updates registry without downgrading previously enriched endpoint location", async () => {
  const registry = createEmptyEndpointEnrichmentRegistry(new Date("2026-06-12T10:00:00.000Z"));
  const first = await updateEndpointEnrichmentRegistry(registry, [
    {
      hostname: "metrics.example.com",
      observedAt: "2026-06-12T10:01:00.000Z",
      sourceDomain: "example.test",
      sourceScanId: "scan_1",
    },
  ], {
    now: new Date("2026-06-12T10:02:00.000Z"),
    resolveCname: async (hostname) => hostname === "metrics.example.com"
      ? ["abc.execute-api.us-east-1.amazonaws.com"]
      : [],
  });

  const second = await updateEndpointEnrichmentRegistry(first.registry, [
    {
      hostname: "metrics.example.com",
      observedAt: "2026-06-12T10:03:00.000Z",
      sourceDomain: "second.example",
      sourceScanId: "scan_2",
    },
  ], {
    now: new Date("2026-06-12T10:04:00.000Z"),
    resolveCname: async () => [],
  });

  const entry = second.registry.entries.find((item) => item.hostname === "metrics.example.com");
  assert.equal(entry?.endpointGeographyStatus, "region_observed");
  assert.equal(entry?.endpointGeographyLocationLabel, "AWS US East (N. Virginia)");
  assert.equal(entry?.observationCount, 2);
  assert.deepEqual(entry?.sourceDomains, ["example.test", "second.example"]);
  assert.deepEqual(entry?.sourceScanIds, ["scan_1", "scan_2"]);
  assert.equal(second.report.newEntries, 0);
  assert.equal(second.report.updatedEntries, 1);
});

function bundleWithNetworkEvents(
  events: Array<{
    collectionEndpointObserved: boolean;
    endpointGeographyStatus?: "not_evaluated" | "unknown" | "region_observed";
    hostname: string;
    thirdParty: boolean;
  }>,
): CanonicalEvidenceBundle {
  return {
    scanId: "scan_registry_fixture",
    url: "https://example.test",
    normalizedUrl: "https://example.test",
    startedAt: "2026-06-12T10:00:00.000Z",
    completedAt: "2026-06-12T10:00:05.000Z",
    region: "fixture",
    scanProfile: {
      profileId: "quick",
      label: "Quick",
      modules: [],
      internalBudgetMs: 1000,
    },
    modulesRun: [],
    runtimeTimeline: [],
    networkEvents: events.map((event, index) => ({
      eventId: `net_${index}`,
      eventType: "network_request",
      timestampMs: index,
      sourceScanner: "pre_consent_runtime",
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
      pagePhase: "initial_navigation",
      url: `https://${event.hostname}/collect`,
      hostname: event.hostname,
      registrableDomain: event.hostname.split(".").slice(-2).join("."),
      firstParty: !event.thirdParty,
      thirdParty: event.thirdParty,
      evidenceRefs: [],
      confidence: 0.95,
      directVsInferred: "direct",
      method: "GET",
      resourceType: "image",
      requestUrl: `https://${event.hostname}/collect`,
      normalizedUrl: `https://${event.hostname}/collect`,
      requestHostname: event.hostname,
      path: "/collect",
      queryParamNames: [],
      identifierParamNames: [],
      advertisingClickIdParamNames: [],
      tagContainerParamNames: [],
      hasIdentifierLikeParameters: false,
      hasAdvertisingClickIdParameters: false,
      hasTagContainerParameters: false,
      isMainFrame: false,
      isSubFrame: false,
      isThirdParty: event.thirdParty,
      redirectChainRequestIds: [],
      requestHeaders: {
        cookieHeaderPresent: false,
        cookieNames: [],
        authorizationHeaderPresent: false,
      },
      cookieHeaderPresent: false,
      cookieNamesSent: [],
      authorizationHeaderPresent: false,
      collectionEndpointObserved: event.collectionEndpointObserved,
      endpointGeographyStatus: event.endpointGeographyStatus,
      relatedEvidenceRefs: [],
      requestPayloadSignals: {
        bodyPresent: false,
        bodyFieldNames: [],
      },
    })),
    networkResponseEvents: [],
    cookieEvents: [],
    cookieSnapshots: [],
    storageSnapshots: [],
    scriptEvents: [],
    iframeEvents: [],
    consentUiObservations: [],
    consentInteractionEvents: [],
    policySurfaceObservations: [],
    cmpRuntimeObservations: [],
    screenshots: [],
    domSnapshots: [],
    normalizedVendorObservations: [],
    observedJourneys: [],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: false,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: {
        journeyCount: 0,
        vendorJourneyCount: 0,
        productJourneyCount: 0,
        cookieJourneyCount: 0,
        scriptJourneyCount: 0,
        endpointJourneyCount: 0,
        trackerJourneyCount: 0,
        consentManagementJourneyCount: 0,
        countByPurpose: {},
        countByScenario: {},
        countByConsentState: {},
        countByObservedBehavior: {},
      },
      notes: [],
    },
    artifactRefs: [],
    scannerVersion: "fixture",
    schemaVersion: "certscore.v2.0",
  } as CanonicalEvidenceBundle;
}
