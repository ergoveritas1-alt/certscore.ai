import assert from "node:assert/strict";
import test from "node:test";
import { collectResolvedRuntimeVendors, collectVendorEnrichmentCandidates, resolveCanonicalVendorCandidate } from "./vendor-enrichment";

test("uses a unique canonical resolver identity before legacy static vendor fallback", () => {
  const resolved = resolveCanonicalVendorCandidate({
    beforeConsent: true,
    collectionEndpointType: "request",
    cookieNames: [],
    firstPartyOrThirdParty: "third_party",
    hostname: "connect.facebook.net",
    sampleUrls: ["https://connect.facebook.net/en_US/fbevents.js"]
  });
  assert.equal(resolved?.canonicalName, "Meta Pixel");
  assert.equal(resolved?.confidence, 0.96);
  assert.deepEqual(resolved?.cookieNames, []);
  assert.match(resolved?.id ?? "", /^canonical:vendor_/);
  assert.equal(resolved?.vendorCategory, "advertising");
});

test("leaves ambiguous canonical host identities for conservative fallback handling", () => {
  assert.equal(resolveCanonicalVendorCandidate({
    beforeConsent: true,
    collectionEndpointType: "request",
    cookieNames: [],
    firstPartyOrThirdParty: "third_party",
    hostname: "ad.doubleclick.net",
    sampleUrls: []
  }), null);
});

test("canonicalizes uniquely resolved runtime vendor labels without forcing ambiguous hosts", () => {
  const vendors = collectResolvedRuntimeVendors({
    requestedHostname: "example.com",
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        requestToVendorObservations: [
          {
            category: "audience_measurement",
            confidence: "high",
            hostname: "static.cloudflareinsights.com",
            preConsent: true,
            vendor: "Cloudflare Bot Management"
          },
          {
            category: "advertising_measurement",
            confidence: "high",
            hostname: "ad.doubleclick.net",
            preConsent: true,
            vendor: "Google Ads / DoubleClick"
          }
        ],
        requestObservations: [
          {
            domain: "static.cloudflareinsights.com",
            preConsent: true,
            url: "https://static.cloudflareinsights.com/beacon.min.js"
          }
        ]
      }
    }
  });

  const cloudflare = vendors.find((vendor) => vendor.hostname === "static.cloudflareinsights.com");
  assert.equal(cloudflare?.vendorName, "Cloudflare Web Analytics");
  assert.equal(cloudflare?.vendorCategory, "analytics");
  const doubleclick = vendors.find((vendor) => vendor.hostname === "ad.doubleclick.net");
  assert.equal(doubleclick?.vendorName, "Google Ads / DoubleClick");
});

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
        networkSummary: {
          preConsentThirdPartyRequestCount: 8
        },
        vendorSummary: {
          rawThirdPartyDomains: [
            "static.criteo.net",
            "cdn.id5-sync.com",
            "micro.rubiconproject.com",
            "oa.openxcdn.net",
            "vtrk.dv.tech",
            "insight.adsrvr.org",
            "x.liadm.com",
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
      "insight.adsrvr.org",
      "micro.rubiconproject.com",
      "oa.openxcdn.net",
      "static.criteo.net",
      "vtrk.dv.tech",
      "x.liadm.com"
    ]
  );

  const criteo = candidates.find((candidate) => candidate.hostname === "static.criteo.net");
  assert.equal(criteo?.beforeConsent, true);
  assert.equal(criteo?.collectionEndpointType, "request");
  assert.equal(criteo?.firstPartyOrThirdParty, "third_party");
});

test("does not promote retained third-party domains as before-consent when the canonical runtime count is zero", () => {
  const candidates = collectVendorEnrichmentCandidates({
    requestedHostname: "example.com",
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        networkSummary: {
          preConsentThirdPartyRequestCount: 0
        },
        vendorSummary: {
          rawThirdPartyDomains: ["www.google-analytics.com"]
        }
      }
    },
    snapshot: {
      preconsent_tracking_detected: true,
      tracking_before_consent_detected: true
    }
  });

  assert.deepEqual(candidates, []);
});

test("marks same-site unresolved vendor requests as first-party proxy evidence", () => {
  const candidates = collectVendorEnrichmentCandidates({
    requestedHostname: "fandango.com",
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        requestToVendorObservations: [
          {
            hostname: "images.fandango.com",
            preConsent: true,
            sampleUrls: ["https://images.fandango.com/require-core.js"],
            vendor: "unresolved"
          }
        ]
      }
    },
    snapshot: {
      preconsent_tracking_detected: true
    }
  });

  assert.equal(candidates[0]?.hostname, "images.fandango.com");
  assert.equal(candidates[0]?.firstPartyOrThirdParty, "first_party_proxy");
});
