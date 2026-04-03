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
  assert.equal(fallback?.preconsent_tracking_detected, true);
  assert.deepEqual(fallback?.runtimeEvidenceArtifacts, ["hybrid_runtime_evidence"]);
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
