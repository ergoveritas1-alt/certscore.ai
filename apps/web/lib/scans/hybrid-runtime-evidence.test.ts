import assert from "node:assert/strict";
import test from "node:test";
import { deriveConsentControlAssessment } from "@certscore/contracts";
import {
  buildPreconsentEvidenceQualityFallback,
  createHybridRuntimeEvidenceProjectionCache,
  getHybridDerivedTrackerVendors,
  getHybridDerivedSignalValue,
  getHybridNanoSignalPopulations,
  getHybridSignalFallbackEvidence,
  withHybridRuntimeArtifactFallbacks
} from "./hybrid-runtime-evidence";

test("projection-scoped hybrid cache preserves derived values, fallback evidence, and source artifacts", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      consentSummary: {
        acceptPresent: true,
        bannerPresent: true,
        bannerTextSnippet: "We use cookies. Accept all or reject all.",
        closePresent: false,
        managePresent: true,
        rejectPresent: true
      },
      consentVisual: {
        acceptProminence: "high",
        ctaImbalanceDetected: true,
        rejectProminence: "low"
      },
      networkSummary: {
        preConsentThirdPartyRequestCount: 2
      },
      requestToVendorObservations: [
        { category: "session_replay", requestUrl: "https://clarity.example/collect", vendor: "Example Replay" }
      ],
      sessionReplayEvidenceSummary: {
        collectionEndpointObserved: true,
        libraryOnly: false
      },
      vendorSummary: {
        preConsentVendorCount: 1,
        vendorCategoryCounts: { session_replay: 1 }
      }
    }
  } satisfies Record<string, unknown>;
  const originalArtifacts = structuredClone(runtimeArtifacts);
  const cache = createHybridRuntimeEvidenceProjectionCache(runtimeArtifacts);
  const signalKeys = [
    "privacy.preconsent_tracking_detected",
    "privacy.dark_pattern_reject_button_missing",
    "privacy.dark_pattern_accept_button_prominence",
    "privacy.session_replay_runtime_detected",
    "privacy.session_replay_runtime_vendors",
    "privacy.non_hybrid_signal"
  ];

  for (const signalKey of signalKeys) {
    const uncached = getHybridDerivedSignalValue(runtimeArtifacts, signalKey);
    assert.deepEqual(cache.getDerivedSignalValue(signalKey), uncached);
    assert.deepEqual(cache.getDerivedSignalValue(signalKey), uncached);
  }

  const fallbackInput = {
    signalKey: "privacy.session_replay_runtime_detected",
    signalLabel: "Session replay runtime detected",
    signalValue: true
  };
  const uncachedFallback = getHybridSignalFallbackEvidence({ runtimeArtifacts, ...fallbackInput });
  assert.deepEqual(cache.getSignalFallbackEvidence(fallbackInput), uncachedFallback);
  assert.deepEqual(cache.getSignalFallbackEvidence(fallbackInput), uncachedFallback);
  assert.deepEqual(runtimeArtifacts, originalArtifacts);

  const separateCache = createHybridRuntimeEvidenceProjectionCache({
    hybrid_runtime_evidence: {
      networkSummary: { preConsentThirdPartyRequestCount: 0 },
      vendorSummary: { preConsentVendorCount: 0 }
    }
  });
  assert.equal(separateCache.getDerivedSignalValue("privacy.preconsent_tracking_detected"), false);
  assert.equal(cache.getDerivedSignalValue("privacy.preconsent_tracking_detected"), true);
});

test("non-hybrid signals bypass hybrid artifact reconstruction", () => {
  let hybridReadCount = 0;
  const runtimeArtifacts = Object.defineProperty({}, "hybrid_runtime_evidence", {
    enumerable: true,
    get() {
      hybridReadCount += 1;
      return { consentSummary: { bannerPresent: true } };
    }
  }) as Record<string, unknown>;

  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "accessibility.wcag_contrast_failures_count"), undefined);
  assert.equal(getHybridSignalFallbackEvidence({
    runtimeArtifacts,
    signalKey: "accessibility.wcag_contrast_failures_count",
    signalLabel: "Contrast failures",
    signalValue: 2
  }), null);
  assert.equal(hybridReadCount, 0);
});

test("derives pre-consent tracking and consent dark-pattern signals from hybrid runtime evidence", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      consentSummary: {
        acceptActionLabels: ["Accept all"],
        bannerPresent: true,
        bannerTextSnippet: "We use cookies to improve your experience. Accept all",
        acceptPresent: true,
        closePresent: false,
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
      consentUiPathEvidence: {
        acceptClickDepth: 1,
        acceptLabel: "Accept all",
        availability: "second_layer",
        choiceAsymmetry: "material",
        preferencesRequiredBeforeReject: true,
        rejectClickDepth: 2,
        rejectLabel: "Reject all"
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
  assert.deepEqual(
    getHybridSignalFallbackEvidence({
      runtimeArtifacts,
      signalKey: "privacy.dark_pattern_accept_button_prominence",
      signalLabel: "Accept button more prominent than reject",
      signalValue: true
    })?.consentUiPathEvidence,
    {
      acceptClickDepth: 1,
      acceptLabel: "Accept all",
      availability: "second_layer",
      choiceAsymmetry: "material",
      preferencesRequiredBeforeReject: true,
      rejectClickDepth: 2,
      rejectLabel: "Reject all"
    }
  );

  const dismissRuntimeArtifacts = {
    hybrid_runtime_evidence: {
      consentSummary: {
        acceptActionLabels: ["Accept cookies"],
        bannerPresent: true,
        bannerTextSnippet: "This website uses cookies to improve your experience. Accept cookies",
        acceptPresent: true,
        closePresent: true,
        managePresent: false,
        rejectPresent: false,
        rejectDepthClass: "absent"
      }
    }
  } satisfies Record<string, unknown>;
  assert.equal(getHybridDerivedSignalValue(dismissRuntimeArtifacts, "privacy.dark_pattern_dismiss_without_reject"), true);
});

test("canonical consent assessment overrides a stale raw missing-reject summary", () => {
  const assessment = deriveConsentControlAssessment({
    scan: {
      scanId: "scan-canonical-consent",
      requestedUrl: "https://example.test/",
      finalUrl: "https://example.test/",
      scanStatus: "completed",
      noGo: false,
    },
    document: {
      canonicalDocumentId: "https://example.test/",
      observedDocumentIds: ["https://example.test/"],
      identityStatus: "matched",
    },
    observations: [{
      observationId: "typed-controls",
      observedAtMs: 1_000,
      likelyPresent: true,
      layerInspected: "first_layer",
      documentId: "https://example.test/",
      captureStatus: "observed",
      inventoryOutcome: "complete_with_controls",
      completedChannels: ["dom_inventory"],
      incompleteChannels: [],
      controls: [
        { evidenceId: "accept", intent: "accept", layer: "first_layer", visible: true, actionable: true },
        { evidenceId: "reject", intent: "reject", layer: "first_layer", visible: true, actionable: true },
        { evidenceId: "options", intent: "options", layer: "first_layer", visible: true, actionable: true },
      ],
    }],
    surface: { status: "observed_actionable", firstObservedAtMs: 1_000, lastObservedAtMs: 1_000 },
    coverage: {
      status: "complete",
      requiredChannels: ["dom_inventory"],
      completedChannels: ["dom_inventory"],
      incompleteChannels: [],
    },
  });
  const runtimeArtifacts = {
    consentControlAssessment: assessment,
    hybrid_runtime_evidence: {
      consentControlAssessment: assessment,
      consentSummary: {
        acceptPresent: true,
        bannerPresent: true,
        rejectPresent: false,
        rejectDepthClass: "absent",
      },
      consentVisual: { rejectHidden: true },
    },
  } satisfies Record<string, unknown>;

  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.dark_pattern_reject_button_missing"), false);
});

test("derives session replay vendors from hybrid request-to-vendor observations", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      requestToVendorObservations: [
        { category: "session_replay", vendor: "Microsoft Clarity" },
        { category: "session_replay", vendor: "Microsoft Clarity" },
        { category: "analytics", vendor: "Google Analytics" }
      ],
      sessionReplayEvidenceSummary: {
        collectionEndpointObserved: true,
        libraryOnly: false,
        maskingOrExclusionObserved: false
      }
    }
  } satisfies Record<string, unknown>;

  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "commerce.session_replay_tool_detected"), true);
  assert.deepEqual(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.session_replay_runtime_vendors"), ["Microsoft Clarity"]);
  assert.deepEqual(
    getHybridSignalFallbackEvidence({
      runtimeArtifacts,
      signalKey: "privacy.session_replay_runtime_detected",
      signalLabel: "Session replay runtime detected",
      signalValue: true
    })?.sessionReplayEvidenceSummary,
    {
      collectionEndpointObserved: true,
      libraryOnly: false,
      maskingOrExclusionObserved: false
    }
  );
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

test("derives cross-domain identifier sharing evidence from hybrid runtime artifacts", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      crossDomainIdentifierSharingDestinationCategories: ["rtb", "identity_graph"],
      crossDomainIdentifierSharingDestinationCount: 2,
      crossDomainIdentifierSharingEvidence: [
        {
          destinationClassification: "rtb",
          destinationDomain: "sync.adnxs.com",
          destinationEtldPlusOne: "adnxs.com",
          identifierClass: "durable_id",
          key: "uid",
          repeatedAcrossEtlds: ["adnxs.com", "rlcdn.com"],
          requestUrlRedacted: "https://sync.adnxs.com/getuid?uid=%5Bredacted%5D",
          valueHash: "a".repeat(64)
        },
        {
          destinationClassification: "identity_graph",
          destinationDomain: "idsync.rlcdn.com",
          destinationEtldPlusOne: "rlcdn.com",
          identifierClass: "durable_id",
          key: "uid",
          repeatedAcrossEtlds: ["adnxs.com", "rlcdn.com"],
          requestUrlRedacted: "https://idsync.rlcdn.com/sync?uid=%5Bredacted%5D",
          valueHash: "a".repeat(64)
        }
      ],
      crossDomainIdentifierSharingObserved: true
    }
  } satisfies Record<string, unknown>;

  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.cross_domain_identifier_sharing_observed"), true);

  const fallback = getHybridSignalFallbackEvidence({
    runtimeArtifacts,
    signalKey: "privacy.cross_domain_identifier_sharing_observed",
    signalLabel: "Identifiers shared across domains",
    signalValue: true
  });

  assert.deepEqual(fallback?.crossDomainIdentifierSharingDestinationEtlds, ["adnxs.com", "rlcdn.com"]);
  assert.deepEqual(fallback?.crossDomainIdentifierSharingDestinationCategories, ["rtb", "identity_graph"]);
  assert.equal(fallback?.valueHashCount, 1);
  assert.equal(Array.isArray(fallback?.crossDomainIdentifierSharingEvidence), true);
});

test("derives cross-domain identifier sharing destinations from redirect-chain source urls", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      crossDomainIdentifierSharingDestinationCategories: ["other"],
      crossDomainIdentifierSharingDestinationCount: 1,
      crossDomainIdentifierSharingEvidence: [
        {
          destinationClassification: "other",
          destinationDomain: "ups.analytics.yahoo.com",
          destinationEtldPlusOne: "yahoo.com",
          identifierClass: "durable_id",
          key: "uid",
          repeatedAcrossEtlds: ["yahoo.com"],
          requestUrlRedacted: "https://ups.analytics.yahoo.com/ups/58922/cms?uid=%5Bredacted%5D",
          sourcePageUrl:
            "https://ssum.casalemedia.com/usermatch?cb=https%3A%2F%2Fpbs-us-east.ay.delivery%2Fsetuid%3Fuid%3D",
          valueHash: "c".repeat(64)
        }
      ],
      crossDomainIdentifierSharingObserved: true
    }
  } satisfies Record<string, unknown>;

  const fallback = getHybridSignalFallbackEvidence({
    runtimeArtifacts,
    signalKey: "privacy.cross_domain_identifier_sharing_observed",
    signalLabel: "Identifiers shared across domains",
    signalValue: true
  });

  assert.deepEqual(fallback?.crossDomainIdentifierSharingDestinationEtlds, [
    "yahoo.com",
    "casalemedia.com",
    "ay.delivery"
  ]);
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
  assert.deepEqual(fallback?.preconsent_cookie_categories, ["advertising", "session_replay"]);
  assert.deepEqual(fallback?.preconsent_cookie_excluded_functional_names, ["__cf_bm"]);
  assert.deepEqual(fallback?.preconsent_cookie_evidence, [
    {
      category: "advertising",
      cookieName: "_fbp",
      domain: "facebook.com",
      firstObservedAtMs: 120,
      initiatorDomain: null,
      initiatorUrl: null,
      initiatorVendor: null,
      nonEssential: true,
      party: "third_party",
      responseUrl: null,
      setAtMs: 120,
      setMethod: "http_header",
      sourceRequestUrl: null,
      timingEvidence: "before_consent_cookie_write"
    },
    {
      category: "advertising",
      cookieName: "demdex",
      domain: "demdex.net",
      firstObservedAtMs: 80,
      initiatorDomain: null,
      initiatorUrl: null,
      initiatorVendor: null,
      nonEssential: true,
      party: "third_party",
      responseUrl: null,
      setAtMs: 80,
      setMethod: "http_header",
      sourceRequestUrl: null,
      timingEvidence: "before_consent_cookie_write"
    },
    {
      category: "session_replay",
      cookieName: "QSI_ReplaySession_Info_ZN_8DiCwx5sYuF137L",
      domain: "example.com",
      firstObservedAtMs: 90,
      initiatorDomain: null,
      initiatorUrl: null,
      initiatorVendor: null,
      nonEssential: true,
      party: "first_party",
      responseUrl: null,
      setAtMs: 90,
      setMethod: "document_cookie",
      sourceRequestUrl: null,
      timingEvidence: "before_consent_cookie_write"
    }
  ]);
});

test("retains third-party pre-consent cookie writes when category is unknown", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      cookieWriteObservations: [
        {
          beforeConsent: true,
          cookieName: "visitor_id",
          cookiePartyType: "third_party",
          cookieSetMethod: "http_header",
          domain: ".vendor.example",
          setAtMs: 75,
          thirdParty: true
        },
        {
          beforeConsent: true,
          cookieName: "__cf_bm",
          cookiePartyType: "third_party",
          cookieSetMethod: "http_header",
          domain: ".vendor.example",
          setAtMs: 40,
          thirdParty: true
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

  assert.deepEqual(fallback?.preconsent_cookie_names, ["visitor_id"]);
  assert.deepEqual(fallback?.preconsent_cookie_excluded_functional_names, ["__cf_bm"]);
  assert.deepEqual(fallback?.preconsent_cookie_evidence, [
    {
      category: "unknown",
      cookieName: "visitor_id",
      domain: "vendor.example",
      firstObservedAtMs: 75,
      initiatorDomain: null,
      initiatorUrl: null,
      initiatorVendor: null,
      nonEssential: false,
      party: "third_party",
      responseUrl: null,
      setAtMs: 75,
      setMethod: "http_header",
      sourceRequestUrl: null,
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

test("does not derive consent dark-pattern signals from non-consent overlays without consent text", () => {
  const runtimeArtifacts = {
    overlayKind: "age_gate",
    consentSurfaceObserved: true,
    hybrid_runtime_evidence: {
      consentSummary: {
        bannerPresent: true,
        acceptPresent: true,
        rejectPresent: false,
        pageInteractionBlocked: true
      },
      consentVisual: {
        acceptOnly: true,
        ctaImbalanceDetected: true
      },
      uiSummary: {
        forcedActionRequired: true
      }
    }
  } satisfies Record<string, unknown>;
  const consentRuntimeArtifacts = {
    overlayKind: "age_gate",
    consentSurfaceObserved: true,
    hybrid_runtime_evidence: {
      consentSummary: {
        acceptActionLabels: ["Accept all"],
        bannerPresent: true,
        bannerTextSnippet: "We use cookies. Accept all or manage preferences.",
        acceptPresent: true,
        manageActionLabels: ["Manage preferences"],
        rejectPresent: false,
        pageInteractionBlocked: true
      },
      consentVisual: {
        acceptOnly: true
      },
      uiSummary: {
        forcedActionRequired: true
      }
    }
  } satisfies Record<string, unknown>;

  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.dark_pattern_reject_button_missing"), undefined);
  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.dark_pattern_forced_consent_wall"), undefined);
  assert.equal(
    getHybridSignalFallbackEvidence({
      runtimeArtifacts,
      signalKey: "privacy.dark_pattern_forced_consent_wall",
      signalLabel: "Forced consent wall",
      signalValue: true
    }),
    null
  );
  assert.equal(getHybridDerivedSignalValue(consentRuntimeArtifacts, "privacy.dark_pattern_forced_consent_wall"), true);
});

test("builds fallback evidence for hybrid fingerprinting concerns", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      fingerprintSummary: {
        tier: 3,
        confidence: "high",
        reasons: ["multiple device attributes collected"],
        summary: "Likely fingerprinting observed."
      },
      fingerprintingRuntimeEvidence: [
        {
          artifactRef: "runtime:fingerprint:petdesk",
          attributeCategories: ["canvas_webgl", "hardware", "font"],
          evidenceSource: "fingerprint_api_runtime_event",
          host: "collector.example.net",
          requestUrl: "https://collector.example.net/fp?visitor_id=[redacted]",
          runtimePhase: "pre_consent",
          tier: 3
        }
      ]
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
  assert.deepEqual(fallback?.fingerprintingRuntimeEvidence, [
    {
      artifactRef: "runtime:fingerprint:petdesk",
      attributeCategories: ["canvas_webgl", "hardware", "font"],
      evidenceSource: "fingerprint_api_runtime_event",
      host: "collector.example.net",
      requestUrl: "https://collector.example.net/fp?visitor_id=[redacted]",
      runtimePhase: "pre_consent",
      tier: 3
    }
  ]);
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
  assert.deepEqual(fallback?.consentTimeline, {
    firstCmpVisibleMs: 500,
    firstConsentActionMs: null,
    firstNonEssentialRequestMs: 120,
    navigationStartMs: 0,
    timelineConfidence: "derived_from_hybrid_runtime"
  });
  assert.deepEqual(fallback?.requestPurposeClassificationConfidence, [
    {
      category: "advertising",
      confidence: 0.9,
      essentiality: "non_essential",
      requestUrl: "https://connect.facebook.net/fbevents.js",
      tsMs: 120,
      vendor: "Meta Pixel"
    }
  ]);
  assert.equal(fallback?.runtimeEvidenceQuality, "timeline_and_classification");
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

test("retains state-0 preconsent request artifacts as material incomplete evidence", () => {
  const runtimeArtifacts = {
    consent_timeline: {
      firstCmpVisibleMs: 0,
      firstConsentActionMs: 0,
      firstNonEssentialRequestMs: null,
      firstTrackingCookieSetMs: null,
      timelineConfidence: "low"
    },
    hybrid_runtime_evidence: {
      consentSummary: {
        acceptPresent: true,
        bannerPresent: true,
        firstVisibleMs: 0
      },
      preconsentState0RequestObservations: [
        {
          category: "unknown",
          classification: "third_party_unclassified",
          confidence: "low",
          evidenceSource: "state0_request_capture",
          hostname: "cdn.example-ad.net",
          requestUrl: "https://cdn.example-ad.net/bootstrap.js",
          resourceType: "script",
          runtimePhase: "pre_consent",
          thirdParty: true,
          tsMs: 0,
          vendor: null
        }
      ],
      requestObservations: [
        {
          domain: "cdn.example-ad.net",
          pathSample: "/bootstrap.js",
          runtimePhase: "pre_consent",
          thirdParty: true,
          tsMs: 0
        }
      ],
      requestToVendorObservations: [],
      timelineMarkers: {
        consentBannerDetectedMs: 0,
        firstRequestMs: 0,
        firstThirdPartyRequestMs: 0
      }
    }
  } satisfies Record<string, unknown>;

  const fallback = buildPreconsentEvidenceQualityFallback(runtimeArtifacts);

  assert.equal(fallback?.runtimeEvidenceQuality, "state0_material_incomplete");
  assert.equal(fallback?.runtimeEvidenceQualityDisposition, "audit_only_until_request_or_cookie_classification_present");
  assert.deepEqual(fallback?.runtimeRequestUrls, ["https://cdn.example-ad.net/bootstrap.js"]);
  assert.deepEqual(fallback?.preconsent_tracker_evidence_urls, []);
  assert.equal(Array.isArray(fallback?.preconsent_state0_request_observations), true);
  assert.deepEqual(fallback?.requestPurposeClassificationConfidence, [
    {
      category: "unknown",
      confidence: 0.45,
      essentiality: "unknown",
      evidenceSource: "state0_request_capture",
      requestUrl: "https://cdn.example-ad.net/bootstrap.js",
      runtimePhase: "pre_consent",
      tsMs: 0,
      vendor: null
    }
  ]);
});

test("keeps service-classified state-0 requests out of tracker evidence fields", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      preconsentState0RequestObservations: [
        {
          category: "fraud_security",
          classification: "service_classified",
          confidence: "high",
          evidenceSource: "state0_request_capture",
          hostname: "js.stripe.com",
          requestUrl: "https://js.stripe.com/v3",
          resourceType: "script",
          runtimePhase: "pre_consent",
          serviceClass: "payment",
          thirdParty: true,
          tsMs: 0,
          vendor: "Stripe.js"
        }
      ],
      requestObservations: [],
      requestToVendorObservations: [],
      timelineMarkers: {
        firstRequestMs: 0,
        firstThirdPartyRequestMs: 0
      }
    }
  } satisfies Record<string, unknown>;

  const fallback = buildPreconsentEvidenceQualityFallback(runtimeArtifacts);

  assert.deepEqual(fallback?.runtimeRequestUrls, ["https://js.stripe.com/v3"]);
  assert.deepEqual(fallback?.preconsent_tracker_evidence_urls, []);
  assert.deepEqual(fallback?.preconsent_tracker_vendors, []);
  assert.deepEqual(fallback?.requestPurposeClassificationConfidence, [
    {
      category: "functional",
      confidence: 0.9,
      essentiality: "unknown",
      evidenceSource: "state0_request_capture",
      requestUrl: "https://js.stripe.com/v3",
      runtimePhase: "pre_consent",
      tsMs: 0,
      vendor: "Stripe.js"
    }
  ]);
});

test("builds promotion evidence from legacy baseline tracker arrays when quality columns are absent", () => {
  const runtimeArtifacts = {
    consent_baseline_tracker_evidence_urls: [
      "https://tags-eu.tiqcdn.com/utag/example/prod/utag.js"
    ],
    consent_baseline_tracker_vendor_names: ["Tealium"],
    hybrid_runtime_evidence: {
      consentSummary: {
        bannerPresent: true,
        clicksToReject: 2,
        firstVisibleMs: 0,
        rejectDepthClass: "deeper_layer"
      },
      timelineMarkers: {
        firstThirdPartyRequestMs: 3317,
        navigationStartMs: 0
      }
    }
  } satisfies Record<string, unknown>;

  const fallback = buildPreconsentEvidenceQualityFallback(runtimeArtifacts);

  assert.deepEqual(fallback?.preconsent_tracker_evidence_urls, [
    "https://tags-eu.tiqcdn.com/utag/example/prod/utag.js"
  ]);
  assert.deepEqual(fallback?.preconsent_tracker_vendors, ["Tealium"]);
  assert.equal(fallback?.consentTimeline, null);
  assert.equal(fallback?.consentActionableChoiceObserved, true);
  assert.equal(fallback?.consentSurfaceObserved, true);
  assert.deepEqual(fallback?.requestPurposeClassificationConfidence, [
    {
      category: "tag_management",
      confidence: 0.85,
      essentiality: "non_essential",
      evidenceSource: "baseline_url_without_event_timestamp",
      requestUrl: "https://tags-eu.tiqcdn.com/utag/example/prod/utag.js",
      baselineFirstRequestMs: 3317,
      vendor: "Tealium"
    }
  ]);

  const merged = withHybridRuntimeArtifactFallbacks(runtimeArtifacts);
  assert.equal(merged?.consentTimeline ?? null, fallback?.consentTimeline);
  assert.deepEqual(merged?.requestPurposeClassificationConfidence, fallback?.requestPurposeClassificationConfidence);
});

test("retains event-specific request timestamps when baseline URL arrays contain the same events", () => {
  const googleUrl = "https://www.google-analytics.com/g/collect?tid=G-TEST";
  const fullStoryUrl = "https://edge.fullstory.com/s/fs.js";
  const fallback = buildPreconsentEvidenceQualityFallback({
    consent_baseline_tracker_evidence_urls: [googleUrl, fullStoryUrl],
    consent_baseline_tracker_vendor_names: ["Google Analytics", "FullStory"],
    hybrid_runtime_evidence: {
      requestPurposeClassificationConfidence: [
        {
          category: "analytics",
          confidence: 0.98,
          essentiality: "non_essential",
          requestUrl: googleUrl,
          runtimePhase: "pre_consent",
          tsMs: 2343,
          vendor: "Google Analytics"
        },
        {
          category: "session_replay",
          confidence: 0.98,
          essentiality: "non_essential",
          requestUrl: fullStoryUrl,
          runtimePhase: "pre_consent",
          tsMs: 4484,
          vendor: "FullStory"
        }
      ],
      timelineMarkers: { firstThirdPartyRequestMs: 2343 }
    }
  });
  const rows = fallback?.requestPurposeClassificationConfidence ?? [];
  const byUrl = new Map(rows.map((row) => [row.requestUrl, row]));

  assert.equal(byUrl.get(googleUrl)?.tsMs, 2343);
  assert.equal(byUrl.get(fullStoryUrl)?.tsMs, 4484);
  assert.equal((byUrl.get(fullStoryUrl) as Record<string, unknown> | undefined)?.baselineFirstRequestMs, 2343);
});

test("uses runtime host inventory as fallback context without deriving pre-consent tracking", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      runtimeHostInventory: [
        {
          cookieCount: 1,
          cookieNamesSample: ["TDID"],
          etldPlusOne: "adsrvr.org",
          firstPartyStatus: "third_party",
          host: "match.adsrvr.org",
          matchedSignatureId: "trade_desk",
          matchedVendorCategory: "advertising",
          matchedVendorName: "The Trade Desk",
          requestCount: 3,
          samplePaths: ["/track/cmf"],
          sampleQueryKeys: ["uid"],
          scriptCount: 0,
          sources: ["request", "cookie"]
        },
        {
          etldPlusOne: "example.com",
          firstPartyStatus: "first_party",
          host: "cdn.example.com",
          requestCount: 2,
          sources: ["request"]
        },
        {
          etldPlusOne: "adsrvr.org",
          firstPartyStatus: "third_party",
          host: "js.adsrvr.org",
          matchedSignatureId: "trade_desk",
          matchedVendorCategory: "advertising",
          matchedVendorName: "The Trade Desk",
          scriptCount: 1,
          sources: ["script"]
        }
      ]
    }
  } satisfies Record<string, unknown>;

  const merged = withHybridRuntimeArtifactFallbacks(runtimeArtifacts);

  assert.deepEqual(merged?.third_party_request_domains, ["match.adsrvr.org"]);
  assert.deepEqual(merged?.initial_cookie_domains, ["match.adsrvr.org"]);
  assert.deepEqual(merged?.script_src_domains, ["js.adsrvr.org"]);
  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.preconsent_tracking_detected"), false);
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
