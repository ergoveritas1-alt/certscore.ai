import type { RuntimeRunResult } from "../core/types";

export function buildRuntimeRunResult(overrides: Partial<RuntimeRunResult> = {}): RuntimeRunResult {
  return {
    browserCollector: null,
    bodyTextExcerpt: null,
    capabilities: {
      consoleMessages: true,
      htmlSnapshot: true,
      mainDocumentHeaders: true,
      pageErrors: true,
      requestEvents: true,
      responseEvents: true
    },
    classification: {
      blockerSummary: {
        confidence: 0,
        evidence: [],
        outcome: "no_blocker_detected",
        vendorHint: null
      },
      challengeDetected: false,
      classification: "full_runtime",
      classifierNotes: [],
      maxPhaseReached: "third_party_signals",
      originLikelyReached: true,
      stopReason: "observe_window_elapsed",
      verificationVendorHint: null
    },
    cnameCandidates: [],
    cnameCloaking: [],
    cnameObservations: [],
    consoleMessages: [],
    consentSignalTiming: {
      earliestSignalTimestampMs: null,
      firstConsentUiTimestampMs: null,
      firstCookieTimestampMs: null,
      firstHighSignalCookieTimestampMs: null,
      firstThirdPartyRequestTimestampMs: null,
      signalsPrecededConsentUi: "inconclusive"
    },
    consentSummary: {
      acceptPresent: false,
      bannerDisappearedWithoutChoice: null,
      bannerPresent: false,
      clicksToAccept: null,
      clicksToReject: null,
      closePresent: null,
      cmpDetected: false,
      contentObstructed: null,
      cookieWallDetected: null,
      firstVisibleMs: null,
      managePresent: false,
      pageInteractionBlocked: null,
      precheckedCategoryCount: null,
      precheckedCategoryLabels: [],
      rejectDepthClass: "unknown",
      rejectPresent: false,
      rejectRequiresMoreClicks: null,
      requestsBeforeAnyConsentAction: null,
      secondLayerPresent: null,
      surfaceType: "unknown"
    },
    consentUi: {
      acceptPresent: true,
      detected: true,
      firstDetectedTimestampMs: null,
      managePresent: true,
      rejectPresent: false,
      selectorHint: null,
      textSnippet: null
    },
    consentVisual: {
      acceptOnly: null,
      acceptContrastRatio: null,
      acceptProminence: "unknown",
      contrastAsymmetryDetected: null,
      ctaImbalanceDetected: null,
      rejectHidden: null,
      rejectContrastRatio: null,
      rejectLowContrast: null,
      rejectProminence: "unknown"
    },
    cookiesBeforeConsent: [
      {
        cookieDomain: "example.com",
        cookieName: "preconsent_cookie",
        firstSeenTimestampMs: 10,
        valuePreview: "1"
      }
    ],
    cookieDiffs: [],
    cookieRiskSummary: [],
    cookieSnapshots: [
      {
        cookieCount: 0,
        cookies: [],
        label: "0.5s",
        timestampMs: 500
      },
      {
        cookieCount: 5,
        cookies: [],
        label: "final",
        timestampMs: 10_000
      }
    ],
    cookieWriteObservations: [],
    domainVendorRegistry: [],
    errors: [],
    finalUrl: "https://example.com",
    findingPacket: {
      generatedAt: new Date().toISOString(),
      items: [],
      summary: {
        confirmed: 1,
        inconclusive: 0,
        likely: 0,
        notObserved: 0,
        possible: 0
      },
      targetUrl: "https://example.com"
    },
    findings: [],
    fingerprintApiEventSamples: [],
    fingerprinting: {
      confidence: "low",
      reasons: [],
      signals: {
        attributeCategories: [],
        attributeCategoryCount: 0,
        burstDetected: false,
        collectionPattern: "isolated",
        firstPartyInvolved: null,
        identifierShapingDetected: false,
        knownBotLibraryMatch: null,
        knownFingerprintLibraryMatch: null,
        networkAfterCollection: false,
        preConsent: "unknown",
        thirdPartyAfterCollection: false,
        thirdPartyInvolved: null
      },
      summary: "none",
      tier: 0
    },
    htmlSnapshotPath: null,
    keyloggingSummary: {
      inputListenerRegistrationCount: 0,
      keyloggingRisk: "none",
      probeRunCount: 0,
      requestCountDuringTyping: 0,
      thirdPartyRequestCountDuringTyping: 0,
      totalTextInputEventCount: 0,
      vendorNamesDuringTyping: []
    },
    leakMap: [],
    mainDocument: {
      headers: null,
      setCookieHeaders: null,
      status: 200,
      url: "https://example.com"
    },
    mediaSummary: {
      adVideoUnitDetected: null,
      audioPresent: false,
      autoplayAttrAudioCount: 0,
      autoplayAttrVideoCount: 0,
      autoplayAudioObserved: false,
      autoplayBeforeConsent: null,
      autoplayVideoObserved: false,
      mutedAutoplayVideo: null,
      thirdPartyEmbedCount: 0,
      videoPresent: false
    },
    mode: "playwright-local",
    navigationOutcome: "ok",
    navigationSummary: {
      affiliateOrTrackerRedirectDetected: null,
      autoRedirect: null,
      clientRedirectCount: 0,
      consentRelatedRedirectDetected: null,
      crossDomainHopCount: 0,
      finalUrl: "https://example.com",
      initialUrl: "https://example.com",
      jsNavigationDetected: false,
      metaRefreshDetected: false,
      redirectDelayMs: null,
      redirectHopCount: 0,
      serverRedirectCount: 0
    },
    networkSummary: {
      collectionEndpointCount: 0,
      deviceDataLikeRequestCount: 0,
      firstPartyRequestCount: 5,
      identifierLikeRequestCount: 0,
      preConsentRequestCount: 1,
      preConsentThirdPartyRequestCount: 1,
      redirectCount: 0,
      requestBurstScore: "low",
      requestTypeCounts: {
        beacon: 0,
        document: 1,
        fetch: 0,
        iframe: 0,
        image: 0,
        other: 0,
        script: 4,
        xhr: 0
      },
      suspiciousQueryKeyCount: 0,
      thirdPartyDomainCount: 4,
      thirdPartyIdentifierLikeRequestCount: 0,
      thirdPartyRequestCount: 4,
      thirdPartyScriptCount: 4,
      totalRequestCount: 50
    },
    outputDir: "/tmp/runtime-harness-test",
    pageErrors: [],
    pageSnapshotSummary: null,
    postRejectPersistence: null,
    preConsentTimeline: [
      {
        beforeConsentUi: true,
        category: "analytics",
        resourceType: "script",
        timestampMs: 20,
        url: "https://tracker.example/script.js",
        vendorName: "Vendor A"
      }
    ],
    preConsentVendorSummary: {
      categories: {
        advertising: 0,
        analytics: 1,
        functional: 0,
        unknown: 0
      },
      normalizedVendors: ["Vendor A", "Vendor B"],
      vendorCounts: {
        "Vendor A": 1,
        "Vendor B": 1
      }
    },
    redirectChain: [],
    requestedUrl: "https://example.com",
    requestObservations: [],
    requestToVendorObservations: [],
    requests: [],
    responses: [
      {
        frameUrl: "https://example.com",
        headers: null,
        requestId: "1",
        resourceType: "document",
        setCookieHeaders: null,
        status: 200,
        timestampMs: 0,
        url: "https://example.com"
      }
    ],
    runQualitySummary: {
      blockerInterference: false,
      evidenceDepth: "full",
      likelySufficientForFindings: true,
      overallConfidence: 0.9,
      rationale: [],
      usedEscalation: false
    },
    runtimeMetadata: {
      autoEscalated: false,
      browserFamily: "chromium",
      browserVersion: null,
      mode: "playwright-local",
      observeBudgetMs: 10_000,
      timeoutMs: 20_000,
      userAgent: null
    },
    screenshotPath: null,
    storageSummary: {
      cookiesBeforeConsentCount: 1,
      cookiesSeenCount: 5,
      identifierLikeStorageKeyCount: 0,
      indexeddbUsed: false,
      localStorageKeySample: [],
      localStorageWriteDetected: false,
      sessionStorageKeySample: [],
      sessionStorageWriteDetected: false,
      setCookieResponseCount: 0,
      storageWrittenBeforeConsent: null,
      thirdPartyCookieBeforeConsentCount: 0,
      thirdPartyCookieCount: 0,
      vendorLinkedStorageWriteCount: 0
    },
    stopSummary: {
      detail: null,
      reason: "observe_window_elapsed",
      timestampMs: 10_000
    },
    thirdPartyDomainCount: 4,
    timings: {
      challengeToRecoveryMs: null,
      finalDocumentStatus: 200,
      firstChallengeTimestampMs: null,
      firstConsentUiTimestampMs: null,
      firstCookieTimestampMs: null,
      firstHighSignalCookieTimestampMs: null,
      firstRecoveryTimestampMs: null,
      firstThirdPartyRequestTimestampMs: null,
      initialDocumentStatus: 200,
      navigationStartTimestampMs: 0,
      observationEndedTimestampMs: 10_000
    },
    timestamp: new Date().toISOString(),
    title: "Example",
    uiSummary: {
      dismissalPresent: null,
      forcedActionRequired: null,
      fullScreenTakeover: null,
      interstitialDetected: false,
      modalDetected: false,
      overlayDetected: false,
      popupCount: 0,
      repeatedResurfacing: null,
      scrollLocked: null,
      stickyTakeoverDetected: null
    },
    vendorLeaderboard: {
      byCategory: {
        advertising: 0,
        analytics: 1,
        functional: 0,
        unknown: 0
      },
      topCookieSettingHosts: [],
      topDomains: [],
      topHighSignalVendors: [],
      topVendors: []
    },
    vendorSummary: {
      categories: {
        advertising: 0,
        analytics: 1,
        functional: 0,
        unknown: 0
      },
      normalizedVendors: ["Vendor A", "Vendor B"],
      rawDomains: ["a.example", "b.example", "c.example", "d.example"],
      vendorCounts: {
        "Vendor A": 1,
        "Vendor B": 1
      }
    },
    vendorSummaryExtended: {
      ambiguousVendorCount: 0,
      normalizedVendors: ["Vendor A", "Vendor B"],
      postInteractionOnlyVendorCount: 0,
      preConsentVendorCount: 2,
      rawThirdPartyDomains: ["a.example", "b.example", "c.example", "d.example"],
      vendorCategoryCounts: {
        ads: 0,
        analytics: 1,
        cdn_infra: 0,
        fraud_security: 0,
        identity: 0,
        personalization: 0,
        session_replay: 0,
        social: 0,
        unknown: 0
      }
    },
    wallTimeMs: 10_000,
    ...overrides
  };
}
