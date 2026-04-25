import assert from "node:assert/strict";
import test from "node:test";
import { collectResolvedRuntimeVendors, collectVendorEnrichmentCandidates } from "./vendor-enrichment";

test("retains concrete pre-consent request URLs for unresolved vendor candidates", () => {
  const candidates = collectVendorEnrichmentCandidates({
    requestedHostname: "example.com",
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        requestObservations: [
          {
            domain: "connect.facebook.net",
            thirdParty: true,
            tsMs: 120,
            url: "https://connect.facebook.net/en_US/fbevents.js"
          },
          {
            domain: "analytics.example.com",
            thirdParty: true,
            tsMs: 480,
            url: "https://analytics.example.com/collect"
          }
        ],
        requestToVendorObservations: [
          {
            hostname: "connect.facebook.net",
            preConsent: true,
            vendor: "unresolved"
          }
        ],
        timelineMarkers: {
          consentBannerDetectedMs: 250
        }
      }
    },
    snapshot: null
  });

  assert.deepEqual(candidates, [
    {
      beforeConsent: true,
      collectionEndpointType: "request",
      cookieNames: [],
      firstPartyOrThirdParty: "third_party",
      hostname: "connect.facebook.net",
      sampleUrls: ["https://connect.facebook.net/en_US/fbevents.js"]
    }
  ]);
});

test("retains concrete pre-consent request URLs for resolved runtime vendors", () => {
  const vendors = collectResolvedRuntimeVendors({
    requestedHostname: "example.com",
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        requestObservations: [
          {
            domain: "www.google-analytics.com",
            thirdParty: true,
            ts_ms: 100,
            url: "https://www.google-analytics.com/g/collect?v=2"
          }
        ],
        requestToVendorObservations: [
          {
            category: "analytics",
            confidence: "high",
            hostname: "www.google-analytics.com",
            pre_consent: true,
            vendor: "Google Analytics"
          }
        ],
        timeline_markers: {
          consent_banner_detected_ms: 300
        }
      }
    }
  });

  assert.deepEqual(vendors, [
    {
      beforeConsent: true,
      collectionEndpointType: "request",
      confidence: 0.95,
      detectionSource: "hybrid_runtime_signature",
      firstPartyOrThirdParty: "third_party",
      hostname: "www.google-analytics.com",
      sampleUrls: ["https://www.google-analytics.com/g/collect?v=2"],
      vendorCategory: "analytics",
      vendorName: "Google Analytics"
    }
  ]);
});

test("derives request URL evidence from stored domain and path samples when vendor row is pre-consent", () => {
  const vendors = collectResolvedRuntimeVendors({
    requestedHostname: "example.com",
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        requestObservations: [
          {
            domain: "cdn.optimizely.com",
            pathSample: "/public/123/s/landing.js",
            thirdParty: true,
            tsMs: 2322
          }
        ],
        requestToVendorObservations: [
          {
            category: "analytics",
            confidence: "medium",
            hostname: "cdn.optimizely.com",
            preConsent: true,
            vendor: "Optimizely"
          }
        ]
      }
    }
  });

  assert.equal(vendors[0]?.sampleUrls[0], "https://cdn.optimizely.com/public/123/s/landing.js");
});

test("normalizes RTB and identity-sync domains from retained runtime domain lists", () => {
  const candidates = collectVendorEnrichmentCandidates({
    requestedHostname: "example.com",
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        vendorSummary: {
          rawThirdPartyDomains: [
            "static.criteo.net",
            "cdn.id5-sync.com",
            "micro.rubiconproject.com",
            "oa.openxcdn.net",
            "cdn.example-cdn.com"
          ]
        }
      },
      third_party_request_domains: ["dpm.demdex.net"]
    },
    snapshot: {
      preconsent_tracking_detected: true
    }
  });

  assert.deepEqual(
    candidates.map((candidate) => candidate.hostname).sort(),
    [
      "cdn.id5-sync.com",
      "dpm.demdex.net",
      "micro.rubiconproject.com",
      "oa.openxcdn.net",
      "static.criteo.net"
    ]
  );

  const criteo = candidates.find((candidate) => candidate.hostname === "static.criteo.net");
  assert.equal(criteo?.beforeConsent, true);
  assert.equal(criteo?.collectionEndpointType, "request");
  assert.equal(criteo?.firstPartyOrThirdParty, "third_party");
});
