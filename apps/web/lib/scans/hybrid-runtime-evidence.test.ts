import assert from "node:assert/strict";
import test from "node:test";
import {
  getHybridDerivedTrackerVendors,
  getHybridDerivedSignalValue,
  getHybridNanoSignalPopulations,
  getHybridSignalFallbackEvidence,
  withHybridRuntimeArtifactFallbacks
} from "./hybrid-runtime-evidence";

test("derives pre-consent tracking and consent dark-pattern signals from hybrid runtime evidence", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      consentSummary: {
        bannerPresent: true,
        acceptPresent: true,
        closePresent: true,
        managePresent: false,
        rejectPresent: false,
        rejectDepthClass: "absent"
      },
      consentVisual: {
        acceptOnly: true,
        acceptProminence: "high",
        contrastAsymmetryDetected: true,
        ctaImbalanceDetected: true,
        rejectProminence: "none"
      },
      networkSummary: {
        preConsentThirdPartyRequestCount: 2
      },
      uiSummary: {
        forcedActionRequired: true
      },
      vendorSummary: {
        preConsentVendorCount: 1
      }
    }
  } satisfies Record<string, unknown>;

  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.preconsent_tracking_detected"), true);
  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.dark_pattern_reject_button_missing"), true);
  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.dark_pattern_accept_button_prominence"), true);
  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.dark_pattern_forced_consent_wall"), true);
  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.dark_pattern_accept_only_banner"), true);
  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.dark_pattern_dismiss_without_reject"), true);
});

test("derives session replay vendors from hybrid request-to-vendor observations", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      requestToVendorObservations: [
        { category: "session_replay", vendor: "Microsoft Clarity" },
        { category: "session_replay", vendor: "Microsoft Clarity" },
        { category: "analytics", vendor: "Google Analytics" }
      ]
    }
  } satisfies Record<string, unknown>;

  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "commerce.session_replay_tool_detected"), true);
  assert.deepEqual(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.session_replay_runtime_vendors"), ["Microsoft Clarity"]);
});

test("derives video content tracking exposure from same-page Meta Pixel evidence", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      mediaSummary: {
        videoContentSurfaceObserved: true,
        videoEvidence: [
          {
            pageUrl: "https://example.com/watch/highlights",
            videoTitle: "Week 1 highlights"
          }
        ]
      },
      requestObservations: [
        {
          domain: "www.facebook.com",
          pageUrl: "https://example.com/watch/highlights",
          parameterKeys: ["ev", "dl", "page_title"],
          runtimePhase: "pre_consent",
          thirdParty: true,
          url: "https://www.facebook.com/tr/?ev=PageView&dl=https%3A%2F%2Fexample.com%2Fwatch%2Fhighlights"
        }
      ],
      requestToVendorObservations: [
        {
          category: "advertising",
          hostname: "www.facebook.com",
          preConsent: true,
          vendor: "Meta Pixel"
        }
      ]
    }
  } satisfies Record<string, unknown>;

  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.video_content_tracking_exposure_detected"), true);

  const fallback = getHybridSignalFallbackEvidence({
    runtimeArtifacts,
    signalKey: "privacy.video_content_tracking_exposure_detected",
    signalLabel: "Video content tracking exposure detected",
    signalValue: true
  });

  assert.deepEqual(fallback?.runtimeVendors, ["Meta Pixel"]);
  assert.deepEqual(fallback?.videoPageUrls, ["https://example.com/watch/highlights"]);
  assert.deepEqual(fallback?.videoTitleSnippets, ["Week 1 highlights"]);
  assert.deepEqual(fallback?.metaPixelPayloadFieldHints, ["ev", "dl", "page_title"]);
  assert.equal(fallback?.samePageVideoTrackingCorrelation, true);
});

test("does not derive video tracking exposure without same-page correlation", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      mediaSummary: {
        videoContentSurfaceObserved: true,
        videoPageUrls: ["https://example.com/watch/highlights"]
      },
      requestObservations: [
        {
          domain: "www.facebook.com",
          pageUrl: "https://example.com/",
          thirdParty: true,
          url: "https://www.facebook.com/tr/?ev=PageView"
        }
      ],
      requestToVendorObservations: [
        {
          category: "advertising",
          hostname: "www.facebook.com",
          vendor: "Meta Pixel"
        }
      ]
    }
  } satisfies Record<string, unknown>;

  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.video_content_tracking_exposure_detected"), false);
});

test("derives fingerprinting and intrusive behavior signals from hybrid runtime evidence", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      fingerprintSummary: {
        tier: 2,
        confidence: "medium",
        attributeCategories: [{ name: "canvas_webgl", count: 3, firstSeenMs: 100 }]
      },
      mediaSummary: {
        autoplayAudioObserved: false,
        autoplayVideoObserved: true
      },
      uiSummary: {
        forcedActionRequired: true,
        overlayDetected: true,
        popupCount: 2,
        scrollLocked: true
      }
    }
  } satisfies Record<string, unknown>;

  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.fingerprinting_detected"), true);
  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.popup_behavior_detected"), true);
  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.overlay_blocking_detected"), true);
  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.autoplay_media_detected"), true);
});

test("does not classify a plain banner overlay as a blocking overlay without obstruction signals", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      consentSummary: {
        bannerPresent: true
      },
      uiSummary: {
        overlayDetected: true,
        forcedActionRequired: false,
        interstitialDetected: false,
        scrollLocked: false
      }
    }
  } satisfies Record<string, unknown>;

  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.overlay_blocking_detected"), false);
});

test("builds fallback evidence for hybrid pre-consent tracking concerns", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      networkSummary: {
        preConsentThirdPartyRequestCount: 1
      },
      requestToVendorObservations: [
        { pre_consent: true, vendor: "Meta Pixel" }
      ]
    }
  } satisfies Record<string, unknown>;

  const fallback = getHybridSignalFallbackEvidence({
    runtimeArtifacts,
    signalKey: "privacy.preconsent_tracking_detected",
    signalLabel: "Pre-consent tracking detected",
    signalValue: true
  });

  assert.deepEqual(fallback?.preconsent_tracker_vendors, ["Meta Pixel"]);
  assert.deepEqual(fallback?.preconsent_cookie_evidence, []);
  assert.deepEqual(fallback?.preconsent_nonessential_cookie_names, []);
  assert.deepEqual(fallback?.preconsent_tracker_evidence_urls, []);
  assert.deepEqual(fallback?.preconsent_tracker_vendor_evidence, [
    {
      category: "unknown",
      confidence: "unknown",
      detectionSource: "hybrid_runtime",
      hostname: null,
      matchedSignatureId: null,
      requestUrl: null,
      vendor: "Meta Pixel"
    }
  ]);
  assert.equal(fallback?.preconsent_tracking_detected, true);
  assert.deepEqual(fallback?.runtimeEvidenceArtifacts, ["hybrid_runtime_evidence"]);
});

test("builds calibrated pre-consent cookie evidence from hybrid cookie writes", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      cookieWriteObservations: [
        {
          beforeConsent: true,
          cookieName: "_fbp",
          cookiePartyType: "third_party",
          cookieSameSite: "None",
          cookieSecure: true,
          cookieSetMethod: "http_header",
          domain: ".facebook.com",
          setAtMs: 120,
          thirdParty: true
        },
        {
          beforeConsent: true,
          cookieName: "__cf_bm",
          cookiePartyType: "first_party",
          cookieSetMethod: "http_header",
          domain: ".example.com",
          setAtMs: 0,
          thirdParty: false
        },
        {
          beforeConsent: true,
          cookieName: "demdex",
          cookiePartyType: "third_party",
          cookieSetMethod: "http_header",
          domain: ".demdex.net",
          setAtMs: 80,
          thirdParty: true
        },
        {
          beforeConsent: true,
          cookieName: "QSI_ReplaySession_Info_ZN_8DiCwx5sYuF137L",
          cookiePartyType: "first_party",
          cookieSetMethod: "document_cookie",
          domain: ".example.com",
          setAtMs: 90,
          thirdParty: false
        }
      ],
      networkSummary: {
        preConsentThirdPartyRequestCount: 0
      }
    }
  } satisfies Record<string, unknown>;

  const fallback = getHybridSignalFallbackEvidence({
    runtimeArtifacts,
    signalKey: "privacy.preconsent_tracking_detected",
    signalLabel: "Pre-consent tracking detected",
    signalValue: true
  });

  assert.deepEqual(fallback?.preconsent_cookie_names, ["_fbp", "demdex", "QSI_ReplaySession_Info_ZN_8DiCwx5sYuF137L"]);
  assert.deepEqual(fallback?.preconsent_nonessential_cookie_names, ["_fbp", "demdex", "QSI_ReplaySession_Info_ZN_8DiCwx5sYuF137L"]);
  assert.deepEqual(fallback?.preconsent_cookie_categories, ["advertising", "dmp", "session_replay"]);
  assert.deepEqual(fallback?.preconsent_cookie_excluded_functional_names, ["__cf_bm"]);
  assert.deepEqual(fallback?.preconsent_cookie_evidence, [
    {
      category: "advertising",
      cookieName: "_fbp",
      domain: ".facebook.com",
      firstObservedAtMs: 120,
      initiatorDomain: null,
      initiatorUrl: null,
      initiatorVendor: null,
      nonEssential: true,
      party: "third_party",
      setAtMs: 120,
      setMethod: "http_header",
      timingEvidence: "before_consent_cookie_write"
    },
    {
      category: "dmp",
      cookieName: "demdex",
      domain: ".demdex.net",
      firstObservedAtMs: 80,
      initiatorDomain: null,
      initiatorUrl: null,
      initiatorVendor: null,
      nonEssential: true,
      party: "third_party",
      setAtMs: 80,
      setMethod: "http_header",
      timingEvidence: "before_consent_cookie_write"
    },
    {
      category: "session_replay",
      cookieName: "QSI_ReplaySession_Info_ZN_8DiCwx5sYuF137L",
      domain: ".example.com",
      firstObservedAtMs: 90,
      initiatorDomain: null,
      initiatorUrl: null,
      initiatorVendor: null,
      nonEssential: true,
      party: "first_party",
      setAtMs: 90,
      setMethod: "document_cookie",
      timingEvidence: "before_consent_cookie_write"
    }
  ]);
});

test("does not derive consent dark-pattern signals without an observed consent surface", () => {
  const runtimeArtifacts = {
    consentSurfaceObserved: false,
    hybrid_runtime_evidence: {
      consentSummary: {
        bannerPresent: false,
        acceptPresent: true,
        rejectPresent: false
      },
      consentVisual: {
        acceptProminence: "high",
        rejectProminence: "none",
        ctaImbalanceDetected: true
      },
      uiSummary: {
        forcedActionRequired: true
      }
    }
  } satisfies Record<string, unknown>;

  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.dark_pattern_reject_button_missing"), undefined);
  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.dark_pattern_accept_button_prominence"), undefined);
  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.dark_pattern_forced_consent_wall"), undefined);
  assert.equal(
    getHybridSignalFallbackEvidence({
      runtimeArtifacts,
      signalKey: "privacy.dark_pattern_accept_button_prominence",
      signalLabel: "Accept button more prominent than reject",
      signalValue: true
    }),
    null
  );
});

test("builds fallback evidence for hybrid fingerprinting concerns", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      fingerprintSummary: {
        tier: 3,
        confidence: "high",
        reasons: ["multiple device attributes collected"],
        summary: "Likely fingerprinting observed."
      }
    }
  } satisfies Record<string, unknown>;

  const fallback = getHybridSignalFallbackEvidence({
    runtimeArtifacts,
    signalKey: "privacy.fingerprinting_detected",
    signalLabel: "Fingerprinting detected",
    signalValue: true
  });

  assert.equal(fallback?.fingerprinting_detected, true);
  assert.deepEqual(fallback?.runtimeEvidenceArtifacts, ["hybrid_runtime_evidence"]);
  assert.equal((fallback?.fingerprintSummary as { tier?: unknown } | undefined)?.tier, 3);
});

test("builds concrete fallback evidence for hybrid pre-consent request timing", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      timelineMarkers: {
        consentBannerDetectedMs: 500
      },
      requestObservations: [
        { domain: "connect.facebook.net", thirdParty: true, ts_ms: 120, url: "https://connect.facebook.net/fbevents.js" }
      ],
      requestToVendorObservations: [
        {
          category: "advertising",
          confidence: "high",
          evidenceSource: "vendor_signature",
          hostname: "connect.facebook.net",
          preConsent: true,
          vendor: "Meta Pixel"
        }
      ]
    }
  } satisfies Record<string, unknown>;

  const fallback = getHybridSignalFallbackEvidence({
    runtimeArtifacts,
    signalKey: "privacy.preconsent_tracking_detected",
    signalLabel: "Pre-consent tracking detected",
    signalValue: true
  });

  assert.deepEqual(fallback?.preconsent_tracker_evidence_urls, ["https://connect.facebook.net/fbevents.js"]);
  assert.deepEqual(fallback?.requestUrls, ["https://connect.facebook.net/fbevents.js"]);
  assert.deepEqual(fallback?.runtimeEvidenceUrls, ["https://connect.facebook.net/fbevents.js"]);
  assert.deepEqual(fallback?.runtimeVendors, ["Meta Pixel"]);
  assert.equal(fallback?.consentBannerDetectedMs, 500);
  assert.deepEqual(fallback?.preconsent_tracker_vendor_evidence, [
    {
      category: "advertising",
      confidence: "high",
      detectionSource: "vendor_signature",
      hostname: "connect.facebook.net",
      matchedSignatureId: null,
      requestUrl: "https://connect.facebook.net/fbevents.js",
      vendor: "Meta Pixel"
    }
  ]);
});

test("retains pre-consent request URLs from vendor observations when banner timing is absent", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      consentSummary: {
        interactionCount: 0
      },
      networkSummary: {
        preConsentThirdPartyRequestCount: 6
      },
      requestObservations: [
        {
          domain: "grid-bidder.criteo.com",
          thirdParty: true,
          url: "https://grid-bidder.criteo.com/openrtb_2_5/pbjs/auction/request?profileId=207"
        },
        {
          domain: "dpm.demdex.net",
          thirdParty: true,
          url: "https://dpm.demdex.net/id?d_orgid=8CF467C25245AE3F0A490D4C%40AdobeOrg"
        },
        {
          domain: "securepubads.g.doubleclick.net",
          thirdParty: true,
          url: "https://securepubads.g.doubleclick.net/gampad/ads?us_privacy=1YNN"
        },
        {
          domain: "hbopenbid.pubmatic.com",
          thirdParty: true,
          url: "https://hbopenbid.pubmatic.com/translator?source=prebid-client"
        }
      ],
      requestToVendorObservations: [
        { category: "advertising", confidence: "high", hostname: "grid-bidder.criteo.com", preConsent: true, vendor: "Criteo" },
        { category: "advertising", confidence: "high", hostname: "dpm.demdex.net", preConsent: true, vendor: "Adobe Audience Manager" },
        { category: "advertising", confidence: "high", hostname: "securepubads.g.doubleclick.net", preConsent: true, vendor: "Google Ad Manager" },
        { category: "advertising", confidence: "high", hostname: "hbopenbid.pubmatic.com", preConsent: true, vendor: "PubMatic" }
      ]
    }
  } satisfies Record<string, unknown>;

  const fallback = getHybridSignalFallbackEvidence({
    runtimeArtifacts,
    signalKey: "privacy.preconsent_tracking_detected",
    signalLabel: "Pre-consent tracking detected",
    signalValue: true
  });

  assert.deepEqual(fallback?.runtimeVendors, ["Criteo", "Adobe Audience Manager", "Google Ad Manager", "PubMatic"]);
  assert.deepEqual(fallback?.preconsent_tracker_evidence_urls, [
    "https://grid-bidder.criteo.com/openrtb_2_5/pbjs/auction/request?profileId=207",
    "https://dpm.demdex.net/id?d_orgid=8CF467C25245AE3F0A490D4C%40AdobeOrg",
    "https://securepubads.g.doubleclick.net/gampad/ads?us_privacy=1YNN",
    "https://hbopenbid.pubmatic.com/translator?source=prebid-client"
  ]);
  assert.equal(fallback?.preconsent_tracking_detected, true);
  assert.equal(fallback?.consentChoiceAtMs, null);
});

test("recognizes Qualtrics SiteIntercept as session replay behavioral analytics evidence", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      requestObservations: [
        {
          domain: "siteintercept.qualtrics.com",
          thirdParty: true,
          url: "https://siteintercept.qualtrics.com/WRSiteInterceptEngine/?Q_ZID=ZN_abc"
        }
      ],
      requestToVendorObservations: [
        {
          category: "session_replay_behavioral_analytics",
          confidence: "high",
          hostname: "siteintercept.qualtrics.com",
          vendor: "Qualtrics SiteIntercept"
        }
      ]
    }
  } satisfies Record<string, unknown>;

  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.session_replay_runtime_detected"), true);

  const fallback = getHybridSignalFallbackEvidence({
    runtimeArtifacts,
    signalKey: "privacy.session_replay_runtime_detected",
    signalLabel: "Session replay runtime detected",
    signalValue: true
  });

  assert.deepEqual(fallback?.runtimeVendors, ["Qualtrics SiteIntercept"]);
  assert.deepEqual(fallback?.runtimeEvidenceUrls, ["https://siteintercept.qualtrics.com/WRSiteInterceptEngine/?Q_ZID=ZN_abc"]);
  assert.equal(fallback?.session_replay_vendor_artifact_present, true);
});

test("backfills legacy runtime artifact summary fields from hybrid runtime evidence", () => {
  const merged = withHybridRuntimeArtifactFallbacks({
    hybrid_runtime_evidence: {
      networkSummary: {
        thirdPartyRequestCount: 4,
        requestTypeCounts: {
          script: 3
        }
      },
      requestObservations: [
        { domain: "cdn.example.com", resourceType: "script", thirdParty: true },
        { domain: "api.example.com", resourceType: "fetch", thirdParty: true },
        { domain: "cdn.example.com", resourceType: "script", thirdParty: true }
      ],
      vendorSummary: {
        rawThirdPartyDomains: ["metrics.example.com", "cdn.example.com"]
      },
      storageSummary: {
        cookiesSeenCount: 2
      },
      cookieWriteObservations: [
        { cookieName: "_ga", domain: ".example.com" },
        { cookieName: "uuid2", domain: ".adnxs.com" }
      ]
    }
  });

  assert.equal(merged?.third_party_request_count, 4);
  assert.deepEqual(merged?.third_party_request_domains, ["metrics.example.com", "cdn.example.com", "api.example.com"]);
  assert.equal(merged?.initial_cookie_count, 2);
  assert.deepEqual(merged?.initial_cookie_names, ["_ga", "uuid2"]);
  assert.deepEqual(merged?.initial_cookie_domains, [".example.com", ".adnxs.com"]);
  assert.equal(merged?.script_tag_count, 3);
  assert.deepEqual(merged?.script_src_domains, ["cdn.example.com"]);
});

test("backfills legacy consent reject outcome fields from hybrid consent outcome summary", () => {
  const merged = withHybridRuntimeArtifactFallbacks({
    hybrid_runtime_evidence: {
      consentOutcomeSummary: {
        auditCompleted: true,
        rejectInteractionSucceeded: true,
        acceptInteractionSucceeded: true,
        rejectReducedTracking: true,
        rejectReducedThirdPartyCookies: false,
        baselineCookieCount: 4,
        baselineThirdPartyCookieCount: 2,
        postRejectCookieCount: 2,
        postRejectThirdPartyCookieCount: 2,
        postAcceptCookieCount: 5,
        postAcceptThirdPartyCookieCount: 3,
        rejectClickCount: 2,
        acceptClickCount: 1,
        optInClicks: 1,
        optOutClicks: 2,
        rejectPersistedTrackerVendorNames: ["Meta Pixel"],
        rejectNewTrackerVendorNames: [],
        postRejectTrackerVendorNames: ["Meta Pixel"],
        postAcceptTrackerVendorNames: ["Meta Pixel", "Google Analytics"]
      },
      consentSummary: {
        bannerPresent: true
      }
    }
  });

  assert.equal(merged?.consent_audit_completed, true);
  assert.equal(merged?.consent_reject_interaction_succeeded, true);
  assert.equal(merged?.consentRejectInteractionSucceeded, true);
  assert.equal(merged?.consent_reject_reduced_tracking, true);
  assert.equal(merged?.consentRejectReducedTracking, true);
  assert.equal(merged?.consent_reject_reduced_third_party_cookies, false);
  assert.equal(merged?.consentRejectReducedThirdPartyCookies, false);
});

test("derives tracker vendor rows from hybrid runtime evidence when persisted tracker rows are absent", () => {
  const runtimeArtifacts = {
    domainVendorRegistry: [
      {
        beforeConsentUiRequestCount: 2,
        category: "unknown",
        endpointHostname: "logs.netflix.com",
        isCnameCloaked: true,
        vendorName: "Netflix Logging"
      }
    ],
    hybrid_runtime_evidence: {
      requestToVendorObservations: [
        { category: "advertising", confidence: "high", evidenceSource: "signature", hostname: "googleads.g.doubleclick.net", preConsent: true, vendor: "Google Ads" },
        { category: "advertising", confidence: "high", evidenceSource: "signature", hostname: "connect.facebook.net", preConsent: true, vendor: "Meta Pixel" },
        { category: "unknown", confidence: "low", evidenceSource: "signature", hostname: "unknown.example", preConsent: true, vendor: "unresolved" }
      ]
    }
  } satisfies Record<string, unknown>;

  const rows = getHybridDerivedTrackerVendors(runtimeArtifacts);

  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => row.vendorName).sort(),
    ["Google Ads", "Meta Pixel", "Netflix Logging"]
  );
  assert.equal(rows.find((row) => row.vendorName === "Netflix Logging")?.collectionEndpointType, "first_party_collection_proxy");
  assert.equal(rows.find((row) => row.vendorName === "Google Ads")?.beforeConsent, true);
});

test("hydrates nano signal populations from hybrid runtime evidence", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      nano_signals: [
        {
          key: "privacy.gpc_disclosure_present",
          label: "GPC disclosure present",
          value: true,
          confidence: 0.94,
          report_signal_source: "policy_enrichment_signal",
          population_status: "present",
          evidence_refs: ["https://example.com/privacy"]
        }
      ]
    }
  } satisfies Record<string, unknown>;

  const rows = getHybridNanoSignalPopulations(runtimeArtifacts);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.source, "nano");
  assert.equal(rows[0]?.key, "privacy.gpc_disclosure_present");
  assert.equal(rows[0]?.reportSignalSource, "policy_enrichment_signal");
});
