import assert from "node:assert/strict";
import test from "node:test";
import { deriveCertScoreFindings } from "./derive-findings";
import { selectTopFindings } from "./rank-findings";

test("derives high-signal privacy and consent findings from hybrid runtime evidence", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        networkSummary: {
          totalRequestCount: 48,
          thirdPartyRequestCount: 124,
          thirdPartyDomainCount: 6,
          thirdPartyScriptCount: 5,
          preConsentRequestCount: 7,
          preConsentThirdPartyRequestCount: 4,
          identifierLikeRequestCount: 2,
          thirdPartyIdentifierLikeRequestCount: 2,
          collectionEndpointCount: 3,
          requestBurstScore: "high"
        },
        vendorSummary: {
          normalizedVendors: ["Google Analytics", "Meta Pixel", "Xandr", "TikTok"],
          rawThirdPartyDomains: ["google-analytics.com", "connect.facebook.net", "ib.adnxs.com"],
          preConsentVendorCount: 3,
          vendorCategoryCounts: {
            advertising: 2,
            analytics: 1,
            functional: 2,
            unknown: 5
          }
        },
        requestObservations: [
          { domain: "router.infolinks.com", thirdParty: true },
          { domain: "my.rtmark.net", thirdParty: true },
          { domain: "ib.adnxs.com", thirdParty: true, identifierLike: true, queryKeysSample: ["user_id", "session_id"] }
        ],
        consentSummary: {
          bannerPresent: true,
          rejectPresent: false,
          rejectDepthClass: "absent",
          pageInteractionBlocked: true,
          contentObstructed: true
        },
        consentVisual: {
          acceptProminence: "high",
          rejectProminence: "none",
          rejectHidden: true,
          ctaImbalanceDetected: true
        },
        storageSummary: {
          storageWrittenBeforeConsent: true,
          thirdPartyCookieBeforeConsentCount: 2,
          cookiesBeforeConsentCount: 4,
          cookiesSeenCount: 5,
          localStorageWriteDetected: true,
          identifierLikeStorageKeyCount: 1
        },
        cookieWriteObservations: [
          { cookieName: "_ga", domain: ".fojik.site" },
          { cookieName: "uuid2", domain: ".adnxs.com" },
          { cookieName: "cf_clearance", domain: ".fojik.site" }
        ],
        fingerprintSummary: {
          tier: 3,
          confidence: "high",
          summary: "Potential fingerprinting behavior observed based on multi-signal device data collection and transmission",
          reasons: ["Multiple device attributes collected", "Data transmitted to third-party endpoint"],
          attributeCategoryCount: 4
        },
        navigationSummary: {
          finalUrl: "https://fojik.site/",
          redirectHopCount: 2,
          crossDomainHopCount: 1,
          affiliateOrTrackerRedirectDetected: true
        },
        mediaSummary: {
          autoplayBeforeConsent: true,
          autoplayVideoObserved: true
        },
        uiSummary: {
          popupCount: 1,
          overlayDetected: true,
          forcedActionRequired: true,
          interstitialDetected: true
        }
      }
    },
    snapshot: {
      certscore_overall: 42,
      final_url: "https://fojik.site/"
    },
    scan: {
      completedAt: "2026-04-02T10:00:00.000Z",
      createdAt: "2026-04-02T09:59:00.000Z",
      domainHostname: "freefunz.site"
    }
  });

  assert.equal(summary.posture, "Action Needed");
  assert.equal(summary.score, 42);
  assert.equal(summary.fingerprintLabel, "Probable");
  assert.equal(summary.fingerprintNarrative, "Probable");
  assert.equal(summary.landedOnDifferentHost, true);
  assert.equal(summary.finalHost, "fojik.site");
  assert.equal(summary.thirdPartyRequestCount, 124);
  assert.match(summary.trackerSummary, /4 vendors across 6 third-party domains/i);
  assert.equal(summary.vendorCategoryCounts.advertising, 2);
  assert.equal(summary.vendorCategoryCounts.unknown, 5);
  assert.ok(summary.rawAdtechHosts.includes("ib.adnxs.com"));
  assert.ok(summary.rawAdtechHosts.includes("router.infolinks.com"));
  assert.deepEqual(summary.analyticsCookieNames, ["_ga"]);
  assert.deepEqual(summary.adtechCookieNames, ["uuid2"]);
  assert.deepEqual(summary.securityCookieNames, ["cf_clearance"]);
  assert.ok(summary.topObservedEntities.some((entity) => entity.label === "router.infolinks.com"));

  const ids = summary.findings.map((finding) => finding.id);
  assert.ok(ids.includes("pre_consent_tracking_detected"));
  assert.ok(ids.includes("third_party_tracking_pre_consent"));
  assert.ok(ids.includes("analytics_cookie_pre_consent"));
  assert.ok(ids.includes("adtech_cookie_pre_consent"));
  assert.ok(ids.includes("telemetry_rich_identification_observed"));
  assert.ok(ids.includes("reject_option_missing_or_hidden"));
  assert.ok(ids.includes("probable_fingerprinting"));
  assert.ok(ids.includes("tracking_redirect_chain"));
});

test("prefers event-derived landed host when runtime metadata shows an off-origin landing", () => {
  const summary = deriveCertScoreFindings({
    events: [
      {
        eventType: "runtime.browser_pass_diagnostic",
        metadataJson: {
          currentUrl: "https://www.brandforce.com/domain/Helio.com/",
          homepageUrl: "https://helio.com/",
          stepKey: "homepage_navigation"
        }
      }
    ],
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        navigationSummary: {
          finalUrl: "https://helio.com/",
          initialUrl: "https://helio.com/"
        }
      }
    },
    snapshot: {
      certscore_overall: 65,
      final_url: "https://helio.com/"
    },
    scan: {
      completedAt: "2026-04-18T20:02:33.000Z",
      createdAt: "2026-04-18T20:01:12.000Z",
      domainHostname: "helio.com"
    }
  });

  assert.equal(summary.finalHost, "www.brandforce.com");
  assert.equal(summary.landedOnDifferentHost, true);
});

test("treats apex and www host variants as the same landed site", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        navigationSummary: {
          finalUrl: "https://www.google.com/",
          initialUrl: "https://google.com/"
        }
      }
    },
    snapshot: {
      certscore_overall: 74,
      final_url: "https://www.google.com/"
    },
    scan: {
      completedAt: "2026-04-18T20:08:10.000Z",
      createdAt: "2026-04-18T20:07:11.000Z",
      domainHostname: "google.com"
    }
  });

  assert.equal(summary.finalHost, "www.google.com");
  assert.equal(summary.landedOnDifferentHost, false);
});

test("ignores browser error pages for landed-host attribution", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        navigationSummary: {
          finalUrl: "chrome-error://chromewebdata/",
          initialUrl: "https://danger.com/"
        }
      }
    },
    snapshot: {
      certscore_overall: 81,
      final_url: "https://danger.com/"
    },
    scan: {
      completedAt: "2026-04-18T20:09:09.000Z",
      createdAt: "2026-04-18T20:07:11.000Z",
      domainHostname: "danger.com"
    }
  });

  assert.equal(summary.finalHost, "danger.com");
  assert.equal(summary.landedOnDifferentHost, false);
});

test("selectTopFindings keeps the strongest privacy findings at the top", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        networkSummary: {
          preConsentRequestCount: 3,
          preConsentThirdPartyRequestCount: 2,
          identifierLikeRequestCount: 1,
          thirdPartyIdentifierLikeRequestCount: 1
        },
        vendorSummary: {
          normalizedVendors: ["Meta Pixel", "Google Analytics"],
          rawThirdPartyDomains: ["connect.facebook.net", "google-analytics.com"],
          preConsentVendorCount: 2
        },
        fingerprintSummary: {
          tier: 2,
          confidence: "medium",
          reasons: ["Observed access to 4 fingerprint-relevant attribute categories in a short window"],
          attributeCategoryCount: 4
        },
        consentSummary: {
          bannerPresent: true,
          rejectPresent: false,
          rejectDepthClass: "absent"
        },
        consentVisual: {
          rejectHidden: true
        }
      }
    },
    snapshot: null,
    scan: {
      completedAt: "2026-04-02T10:05:00.000Z",
      createdAt: "2026-04-02T10:04:00.000Z",
      domainHostname: "example.com"
    }
  });

  const topFindings = selectTopFindings(summary.findings, 5);

  assert.equal(topFindings[0]?.id, "pre_consent_tracking_detected");
  assert.ok(topFindings.some((finding) => finding.id === "probable_fingerprinting"));
  assert.ok(topFindings.some((finding) => finding.id === "reject_option_missing_or_hidden"));
});

test("does not present privacy_score as the overall score when certscore_overall is missing", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        networkSummary: {
          thirdPartyRequestCount: 12
        }
      }
    },
    snapshot: {
      privacy_score: 91
    },
    scan: {
      completedAt: "2026-04-02T10:05:00.000Z",
      createdAt: "2026-04-02T10:04:00.000Z",
      domainHostname: "example.com"
    }
  });

  assert.equal(summary.score, null);
});

test("selectTopFindings avoids duplicating overlapping pre-consent tracking cards", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        networkSummary: {
          preConsentRequestCount: 7,
          preConsentThirdPartyRequestCount: 7
        },
        vendorSummary: {
          normalizedVendors: ["Google Analytics", "Meta Pixel", "LinkedIn Insight Tag"],
          rawThirdPartyDomains: ["google-analytics.com", "connect.facebook.net", "snap.licdn.com"],
          preConsentVendorCount: 3
        },
        consentSummary: {
          bannerPresent: true,
          rejectPresent: false,
          rejectDepthClass: "absent"
        },
        consentVisual: {
          acceptProminence: "high",
          rejectProminence: "none",
          rejectHidden: true,
          ctaImbalanceDetected: true
        },
        storageSummary: {
          cookiesBeforeConsentCount: 2
        },
        cookieWriteObservations: [{ cookieName: "_ga", domain: ".example.com" }]
      }
    },
    snapshot: null,
    scan: {
      completedAt: "2026-04-02T10:05:00.000Z",
      createdAt: "2026-04-02T10:04:00.000Z",
      domainHostname: "example.com"
    }
  });

  const topFindings = selectTopFindings(summary.findings, 5);
  const topIds = topFindings.map((finding) => finding.id);

  assert.ok(topIds.includes("pre_consent_tracking_detected"));
  assert.equal(topIds.includes("third_party_tracking_pre_consent"), false);
});

test("uses identity-rich telemetry wording when telemetry is elevated but fingerprinting is not confirmed", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        networkSummary: {
          thirdPartyIdentifierLikeRequestCount: 2,
          deviceDataLikeRequestCount: 3
        },
        requestObservations: [
          { domain: "cdn.segment.com", thirdParty: true, identifierLike: true, queryKeysSample: ["anonymous_id", "user_id"] },
          { domain: "static.cloudflareinsights.com", thirdParty: true },
          { domain: "plausible.io", thirdParty: true }
        ],
        fingerprintSummary: {
          tier: 0,
          confidence: "low",
          attributeCategoryCount: 1
        }
      }
    },
    snapshot: null,
    scan: {
      completedAt: "2026-04-02T10:06:00.000Z",
      createdAt: "2026-04-02T10:05:00.000Z",
      domainHostname: "example.com"
    }
  });

  assert.equal(summary.fingerprintLabel, "None detected");
  assert.equal(summary.fingerprintNarrative, "Identity-rich telemetry observed");
  assert.ok(summary.findings.some((finding) => finding.id === "telemetry_rich_identification_observed"));
});

test("does not promote identifier transmission from generic bootstrap query keys alone", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        networkSummary: {
          identifierLikeRequestCount: 5,
          thirdPartyIdentifierLikeRequestCount: 2,
          deviceDataLikeRequestCount: 0
        },
        requestObservations: [
          { thirdParty: false, identifierLike: true, queryKeysSample: ["id"] },
          { thirdParty: true, identifierLike: true, queryKeysSample: ["id", "gtg_health"] },
          { thirdParty: true, identifierLike: true, queryKeysSample: ["client_id", "cas", "is_itp"] }
        ],
        fingerprintSummary: {
          tier: 0,
          confidence: "low",
          attributeCategoryCount: 0
        }
      }
    },
    snapshot: null,
    scan: {
      completedAt: "2026-04-02T10:06:00.000Z",
      createdAt: "2026-04-02T10:05:00.000Z",
      domainHostname: "example.com"
    }
  });

  assert.equal(summary.findings.some((finding) => finding.id === "identifier_transmission_detected"), false);
});

test("does not promote telemetry-rich identification from generic third-party sdk keys alone", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        networkSummary: {
          thirdPartyIdentifierLikeRequestCount: 1,
          deviceDataLikeRequestCount: 0
        },
        requestObservations: [
          {
            thirdParty: true,
            domain: "o13855.ingest.sentry.io",
            identifierLike: true,
            queryKeysSample: ["sentry_version", "sentry_key", "sentry_client"]
          },
          {
            thirdParty: true,
            domain: "static.cloudflareinsights.com",
            identifierLike: false,
            queryKeysSample: []
          }
        ],
        vendorSummary: {
          rawThirdPartyDomains: ["o13855.ingest.sentry.io", "static.cloudflareinsights.com"]
        },
        fingerprintSummary: {
          tier: 0,
          confidence: "low",
          attributeCategoryCount: 0
        }
      }
    },
    snapshot: null,
    scan: {
      completedAt: "2026-04-05T23:03:53.000Z",
      createdAt: "2026-04-05T23:03:34.000Z",
      domainHostname: "canva.com"
    }
  });

  assert.equal(summary.fingerprintNarrative, "None detected");
  assert.equal(summary.findings.some((finding) => finding.id === "telemetry_rich_identification_observed"), false);
});

test("promotes identifier transmission when stronger identifier keys are observed", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        networkSummary: {
          identifierLikeRequestCount: 2,
          thirdPartyIdentifierLikeRequestCount: 1
        },
        requestObservations: [
          { thirdParty: true, identifierLike: true, queryKeysSample: ["user_id", "session_id"] }
        ],
        fingerprintSummary: {
          tier: 0,
          confidence: "low",
          attributeCategoryCount: 0
        }
      }
    },
    snapshot: null,
    scan: {
      completedAt: "2026-04-02T10:06:00.000Z",
      createdAt: "2026-04-02T10:05:00.000Z",
      domainHostname: "example.com"
    }
  });

  assert.equal(summary.findings.some((finding) => finding.id === "identifier_transmission_detected"), true);
});

test("falls back to snapshot-backed pre-consent tracking and cookie evidence when hybrid counters are zeroed", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      consentSurfaceObserved: true,
      hybrid_runtime_evidence: {
        networkSummary: {},
        vendorSummary: {
          normalizedVendors: ["Google Ads"],
          preConsentVendorCount: 4,
          rawThirdPartyDomains: ["googleads.g.doubleclick.net", "analytics.tiktok.com"]
        },
        requestToVendorObservations: [
          { hostname: "googleads.g.doubleclick.net", preConsent: true, vendor: "Google Ads" },
          { hostname: "analytics.tiktok.com", preConsent: true, vendor: "TikTok Pixel" }
        ],
        consentSummary: {
          bannerPresent: true
        },
        storageSummary: {},
        cookieWriteObservations: [
          { cookieName: "_ttp", domain: ".tiktok.com", thirdParty: true },
          { cookieName: "test_cookie", domain: ".doubleclick.net", thirdParty: true }
        ]
      }
    },
    snapshot: {
      consent_surface_observed: true,
      preconsent_tracking_detected: true,
      tracking_before_consent_detected: true,
      first_party_cookie_set_before_consent: true,
      third_party_cookie_set_before_consent: true
    },
    scan: {
      completedAt: "2026-04-02T10:06:00.000Z",
      createdAt: "2026-04-02T10:05:00.000Z",
      domainHostname: "example.com"
    }
  });

  assert.ok(summary.findings.some((finding) => finding.id === "pre_consent_tracking_detected"));
  assert.ok(summary.findings.some((finding) => finding.id === "third_party_tracking_pre_consent"));
  assert.ok(summary.findings.some((finding) => finding.id === "third_party_cookie_pre_consent"));
  assert.deepEqual(summary.thirdPartyCookieNamesSeen.sort(), ["_ttp", "test_cookie"]);
  assert.deepEqual(summary.thirdPartyCookieNamesBeforeConsent.sort(), ["_ttp", "test_cookie"]);
  assert.deepEqual(summary.preConsentVendorNames.sort(), ["Google Ads", "TikTok Pixel"]);
});

test("does not use snapshot pre-consent fallback when runtime timing explicitly says no", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        networkSummary: {
          preConsentRequestCount: 0,
          preConsentThirdPartyRequestCount: 0,
          thirdPartyRequestCount: 122
        },
        vendorSummary: {
          normalizedVendors: ["Marketo"],
          preConsentVendorCount: 1,
          rawThirdPartyDomains: ["business.adobe.com", "www.adobe.com"]
        },
        consentSummary: {
          bannerPresent: true,
          rejectPresent: false,
          rejectDepthClass: "deeper_layer",
          requestsBeforeAnyConsentAction: false
        },
        consentVisual: {
          rejectHidden: true,
          rejectProminence: "none"
        },
        storageSummary: {
          cookiesBeforeConsentCount: 0,
          thirdPartyCookieBeforeConsentCount: 0
        },
        cookieWriteObservations: [
          { cookieName: "mbox", domain: ".adobe.com", thirdParty: true, beforeConsent: false },
          { cookieName: "AMCV_9E1005A551ED61CA0A490D45%40AdobeOrg", domain: ".adobe.com", thirdParty: true, beforeConsent: false }
        ],
        fingerprintSummary: {
          tier: 0,
          confidence: "low",
          attributeCategoryCount: 0
        }
      },
      initial_cookie_count: 14,
      initial_cookie_names: ["mbox", "AMCV_9E1005A551ED61CA0A490D45%40AdobeOrg"]
    },
    snapshot: {
      preconsent_tracking_detected: true,
      tracking_before_consent_detected: true,
      third_party_cookie_set_before_consent: true
    },
    scan: {
      completedAt: "2026-04-05T22:35:00.000Z",
      createdAt: "2026-04-05T22:33:06.000Z",
      domainHostname: "marketo.com"
    }
  });

  const ids = summary.findings.map((finding) => finding.id);
  assert.equal(ids.includes("pre_consent_tracking_detected"), false);
  assert.equal(ids.includes("third_party_tracking_pre_consent"), false);
  assert.equal(ids.includes("third_party_cookie_pre_consent"), false);
  assert.equal(ids.includes("analytics_cookie_pre_consent"), false);
});

test("does not promote consent or pre-consent findings when no consent surface was observed", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      consentSurfaceObserved: false,
      hybrid_runtime_evidence: {
        networkSummary: {
          preConsentRequestCount: 1,
          preConsentThirdPartyRequestCount: 1,
          thirdPartyRequestCount: 1
        },
        consentSummary: {
          bannerPresent: false,
          requestsBeforeAnyConsentAction: true
        },
        consentVisual: {
          acceptProminence: "high",
          rejectProminence: "none",
          ctaImbalanceDetected: true
        },
        storageSummary: {
          cookiesBeforeConsentCount: 1,
          thirdPartyCookieBeforeConsentCount: 1,
          storageWrittenBeforeConsent: true
        },
        cookieWriteObservations: [{ cookieName: "_ga", domain: ".example.com", thirdParty: true }]
      }
    },
    snapshot: {
      consent_surface_observed: false,
      cookie_banner_present: false,
      preconsent_tracking_detected: true,
      tracking_before_consent_detected: true,
      third_party_cookie_set_before_consent: true
    },
    scan: {
      completedAt: "2026-04-18T18:08:00.000Z",
      createdAt: "2026-04-18T18:07:49.000Z",
      domainHostname: "fandango.com"
    }
  });

  const ids = summary.findings.map((finding) => finding.id);
  assert.equal(ids.includes("pre_consent_tracking_detected"), false);
  assert.equal(ids.includes("third_party_tracking_pre_consent"), false);
  assert.equal(ids.includes("third_party_cookie_pre_consent"), false);
  assert.equal(ids.includes("storage_before_consent"), false);
  assert.equal(ids.includes("reject_option_missing_or_hidden"), false);
  assert.equal(ids.includes("asymmetric_consent_ui"), false);
  assert.equal(ids.includes("forced_consent_interaction"), false);
});

test("uses corroborating pre-consent vendor evidence even when aggregate timing counters are zero", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      consent_preconsent_violation_count: 1,
      hybrid_runtime_evidence: {
        networkSummary: {
          totalRequestCount: 249,
          thirdPartyRequestCount: 143,
          preConsentRequestCount: 0,
          preConsentThirdPartyRequestCount: 0
        },
        consentSummary: {
          bannerPresent: true,
          rejectPresent: true,
          requestsBeforeAnyConsentAction: false
        },
        requestToVendorObservations: [
          { vendor: "Google Tag Manager", hostname: "www.googletagmanager.com", preConsent: true, category: "cdn_infra" },
          { vendor: "Hotjar", hostname: "script.hotjar.com", preConsent: true, category: "session_replay" }
        ]
      }
    },
    snapshot: {
      preconsent_tracking_detected: true,
      tracking_before_consent_detected: true
    },
    scan: {
      completedAt: "2026-04-05T23:15:03.000Z",
      createdAt: "2026-04-05T23:14:15.000Z",
      domainHostname: "hubspot.com"
    }
  });

  const ids = summary.findings.map((finding) => finding.id);
  assert.equal(ids.includes("pre_consent_tracking_detected"), true);
  assert.equal(ids.includes("third_party_tracking_pre_consent"), true);
});

test("does not overcall overlay, device data, or redirect chain on benign paypal-style runtime evidence", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        networkSummary: {
          totalRequestCount: 101,
          thirdPartyRequestCount: 85,
          thirdPartyDomainCount: 5,
          thirdPartyScriptCount: 50,
          deviceDataLikeRequestCount: 2,
          preConsentRequestCount: 0,
          preConsentThirdPartyRequestCount: 0
        },
        consentSummary: {
          bannerPresent: true,
          rejectPresent: true,
          rejectDepthClass: "same_layer",
          requestsBeforeAnyConsentAction: false
        },
        consentVisual: {
          acceptProminence: "medium",
          rejectProminence: "medium"
        },
        uiSummary: {
          overlayDetected: true,
          fullScreenTakeover: false,
          forcedActionRequired: false
        },
        navigationSummary: {
          initialUrl: "https://paypal.com/",
          finalUrl: "https://www.paypal.com/us/home",
          redirectHopCount: 2,
          crossDomainHopCount: 1,
          affiliateOrTrackerRedirectDetected: false
        },
        vendorSummary: {
          normalizedVendors: ["Google Tag Manager"],
          rawThirdPartyDomains: ["www.paypalobjects.com", "www.googletagmanager.com"]
        },
        fingerprintSummary: {
          tier: 0,
          confidence: "low",
          attributeCategoryCount: 0
        }
      }
    },
    snapshot: {
      preconsent_tracking_detected: true,
      tracking_before_consent_detected: true
    },
    scan: {
      completedAt: "2026-04-05T23:07:47.000Z",
      createdAt: "2026-04-05T23:06:46.000Z",
      domainHostname: "paypal.com"
    }
  });

  const ids = summary.findings.map((finding) => finding.id);
  assert.equal(ids.includes("content_obstructed_by_overlay"), false);
  assert.equal(ids.includes("device_data_collection_detected"), false);
  assert.equal(ids.includes("tracking_redirect_chain"), false);
});

test("uses snapshot tracker vendor counts when runtime naming is incomplete", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        networkSummary: {
          thirdPartyDomainCount: 12
        },
        vendorSummary: {
          normalizedVendors: ["Google Analytics", "Meta Pixel"]
        }
      }
    },
    snapshot: {
      tracker_vendor_count: 5
    },
    scan: {
      completedAt: "2026-04-02T23:10:00.000Z",
      createdAt: "2026-04-02T23:09:00.000Z",
      domainHostname: "example.com"
    }
  });

  assert.equal(summary.vendorCount, 5);
  assert.match(summary.trackerSummary, /5 vendors observed, 2 named across 12 third-party domains/i);
});

test("surfaces session recording services from direct runtime replay evidence", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        vendorSummary: {
          normalizedVendors: ["Google Analytics", "Google Tag Manager", "Microsoft Clarity"],
          vendorCategoryCounts: {
            analytics: 2,
            session_replay: 1
          }
        },
        requestToVendorObservations: [
          { hostname: "www.clarity.ms", category: "session_replay", preConsent: true, vendor: "Microsoft Clarity" },
          { hostname: "scripts.clarity.ms", category: "session_replay", preConsent: true, vendor: "Microsoft Clarity" }
        ],
        networkSummary: {
          preConsentRequestCount: 5,
          preConsentThirdPartyRequestCount: 3
        }
      }
    },
    snapshot: {
      session_replay_tool_detected: true,
      session_replay_tracker_count: 1,
      session_replay_without_disclosure_detected: true
    },
    scan: {
      completedAt: "2026-04-02T23:15:00.000Z",
      createdAt: "2026-04-02T23:14:00.000Z",
      domainHostname: "kbdlab.io"
    }
  });

  const finding = summary.findings.find((entry) => entry.id === "session_recording_services_detected");
  assert.ok(finding);
  assert.deepEqual(summary.sessionReplayVendorNames, ["Microsoft Clarity"]);
  assert.match(finding?.shortSummary ?? "", /Microsoft Clarity/i);
  assert.ok(finding?.evidencePreview.some((entry) => /Microsoft Clarity/i.test(entry)));
  assert.equal(finding?.severity, "high");
});

test("surfaces possible pre-submit text capture from typing-probe evidence", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        keyloggingSummary: {
          inputListenerRegistrationCount: 5,
          keyloggingRisk: "likely",
          probeRunCount: 1,
          requestCountDuringTyping: 3,
          thirdPartyRequestCountDuringTyping: 2,
          totalTextInputEventCount: 8,
          vendorNamesDuringTyping: ["Microsoft Clarity"]
        }
      }
    },
    snapshot: null,
    scan: {
      completedAt: "2026-04-02T23:20:00.000Z",
      createdAt: "2026-04-02T23:19:00.000Z",
      domainHostname: "example.com"
    }
  });

  const finding = summary.findings.find((entry) => entry.id === "pre_submit_text_capture_detected");
  assert.ok(finding);
  assert.equal(finding?.severity, "critical");
  assert.match(finding?.shortSummary ?? "", /before form submission/i);
});

test("surfaces financial commercial validation findings in cert score summary", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: null,
    snapshot: {
      certscore_overall: 71
    },
    validationFindings: [
      {
        agreementScore: 0.91,
        category: "section_review",
        description: "Earn up to $5,000 per month language surfaced near signup copy without nearby disclosure.",
        evidence: {
          claimText: "Earn up to $5,000 per month",
          matchedText: "Join now and earn up to $5,000 per month."
        },
        findingFamily: "section_review",
        findingScope: "page",
        findingSource: "validation_worker",
        findingSubject: "financial_claim",
        id: "vf_1",
        model: "gpt-5.4-nano",
        modelConfidence: 0.88,
        pageUrl: "https://example.com/signup",
        promptVersion: "financial-commercial-claims-v1",
        rationale: "High-confidence earnings-style claim without adjacent balancing disclosure.",
        ruleKey: "section_review.earnings_claim_without_adjacent_disclosure",
        severity: "high",
        subtype: "earnings_claim",
        systemConfidenceBand: "high",
        systemConfidenceExplanation: "Matched claim pattern and model-supported extraction agreed.",
        systemConfidenceScore: 0.9,
        title: "Earnings claim without adjacent disclosure",
        verdict: "supported"
      },
      {
        agreementScore: 0.8,
        category: "section_review",
        description: "Pricing details were not clearly visible near the conversion path.",
        evidence: {
          matchedText: "Start now"
        },
        findingFamily: "section_review",
        findingScope: "page",
        findingSource: "validation_worker",
        findingSubject: "pricing",
        id: "vf_2",
        model: "gpt-5.4-nano",
        modelConfidence: 0.74,
        pageUrl: "https://example.com/pricing",
        promptVersion: "financial-commercial-claims-v1",
        rationale: "CTA surfaced without clear fee disclosure in the same block.",
        ruleKey: "section_review.pricing_or_fee_transparency_unclear",
        severity: "medium",
        subtype: "pricing_disclosure",
        systemConfidenceBand: "moderate",
        systemConfidenceExplanation: "Relevant commercial offer block with weak fee visibility.",
        systemConfidenceScore: 0.76,
        title: "Pricing or fee transparency unclear",
        verdict: "supported"
      }
    ],
    scan: {
      completedAt: "2026-04-20T18:20:00.000Z",
      createdAt: "2026-04-20T18:19:00.000Z",
      domainHostname: "example.com"
    }
  });

  const ids = summary.findings.map((finding) => finding.id);
  assert.ok(ids.includes("earnings_claim_without_adjacent_disclosure"));
  assert.ok(ids.includes("pricing_or_fee_transparency_unclear"));

  const topFindings = selectTopFindings(summary.findings, 5);
  assert.ok(topFindings.some((finding) => finding.id === "earnings_claim_without_adjacent_disclosure"));
});
