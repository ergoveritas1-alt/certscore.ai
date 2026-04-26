import assert from "node:assert/strict";
import test from "node:test";
import { buildPreviewPayloadFromSnapshot, enrichPreviewPayloadWithFallbackEvidence } from "./build-preview-payload";

function buildSnapshot(overrides: Partial<Parameters<typeof buildPreviewPayloadFromSnapshot>[0]["snapshot"]> = {}) {
  return {
    accessibilityScore: 82,
    authWallDetected: false,
    blockedFlag: false,
    certscoreOverall: 79,
    captchaFlag: false,
    contactPagePresent: false,
    cookiePolicyPresent: false,
    cookieBannerPresent: false,
    finalUrl: "https://example.com",
    granularPreferencesPresent: false,
    homepageFetchHttpStatus: 200,
    homepageFetchStatus: "ok" as const,
    pagesScanned: 2,
    partialScan: true,
    privacyPolicyPresent: true,
    privacyScore: 78,
    preconsentTrackingDetected: false,
    rejectAllPresent: false,
    redirectCount: 0,
    registeredDomain: "example.com",
    robotsAllowed: true,
    robotsFetchHttpStatus: 200,
    robotsFetchStatus: "ok" as const,
    termsOfServicePresent: false,
    thirdPartyCookieSetBeforeConsent: false,
    totalSignals: 12,
    trackingBeforeConsentDetected: false,
    wcagFormLabelErrorCount: 0,
    wcagMissingAltCount: 0,
    ...overrides
  };
}

test("lightweight previews suppress weak terms and contact absence findings", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "certscore.ai",
    normalizedUrl: "https://certscore.ai",
    snapshot: buildSnapshot()
  });

  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Terms or disclosure link not detected"),
    false
  );
  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Public contact path not detected"),
    false
  );
  assert.equal(
    payload.summaryBullets.includes(
      "This lightweight preview may not verify every secondary legal or contact route unless those pages are directly fetched during the live pass."
    ),
    true
  );
});

test("broader preview coverage can still surface missing terms and contact findings", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "example.com",
    normalizedUrl: "https://example.com",
    snapshot: buildSnapshot({
      pagesScanned: 4,
      partialScan: false
    })
  });

  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Terms or disclosure link not detected"),
    true
  );
  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Public contact path not detected"),
    true
  );
});

test("lightweight previews suppress weak privacy absence findings", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "draftkings.com",
    normalizedUrl: "https://draftkings.com",
    snapshot: buildSnapshot({
      pagesScanned: 1,
      partialScan: true,
      privacyPolicyPresent: false,
      totalSignals: 25
    })
  });

  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Privacy policy not detected"),
    false
  );
});

test("blocked or unreachable previews withhold scores and surface access blockers", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "chime.com",
    normalizedUrl: "https://chime.com",
    snapshot: buildSnapshot({
      finalUrl: "https://chime.com",
      homepageFetchHttpStatus: 403,
      homepageFetchStatus: "forbidden",
      pagesScanned: 0,
      partialScan: true,
      trackingBeforeConsentDetected: true
    })
  });

  assert.equal(payload.scores, undefined);
  assert.equal(payload.resultState?.title, "Access limited by site protections");
  assert.equal(payload.sampleFindings.some((finding) => finding.title === "Homepage blocked during live scan"), true);
  assert.equal(payload.sampleFindings.some((finding) => finding.title === "Tracking activity observed before consent"), false);
  assert.equal(
    payload.summaryBullets.includes("Preview scores are withheld because the live pass stopped before it verified a trustworthy public site surface."),
    true
  );
  assert.equal(payload.summaryBullets.includes("Access limited by site protections."), true);
  assert.equal(payload.summaryBullets.includes("Reason: homepage request was blocked with HTTP 403."), true);
});

test("preview pre-consent finding includes sensitive-context vendor roles when runtime evidence supports it", () => {
  const snapshot = buildSnapshot({
    cookieBannerPresent: true,
    finalUrl: "https://www.webmd.com/",
    registeredDomain: "webmd.com",
    trackingBeforeConsentDetected: true
  });
  const payload = enrichPreviewPayloadWithFallbackEvidence({
    payload: buildPreviewPayloadFromSnapshot({
      hostname: "webmd.com",
      normalizedUrl: "https://webmd.com",
      snapshot
    }),
    snapshot,
    events: [],
    runtimeArtifacts: {
      consent_baseline_tracker_evidence_urls: [
        "https://img.lb.staging.wbmdstatic.com/webmd_static_vue/webmd-experian.min.js",
        "https://cdn.id5-sync.com/api/1.0/id5-api.js",
        "https://bh-medscape-cdn.contextweb.com/pixel.js"
      ],
      third_party_request_domains: ["cdn.id5-sync.com", "bh-medscape-cdn.contextweb.com"]
    }
  });

  const finding = payload.sampleFindings.find((candidate) => candidate.title === "Tracking activity observed before consent");
  assert.match(finding?.description ?? "", /health information site/i);
  assert.match(finding?.description ?? "", /Experian/i);
  assert.match(finding?.description ?? "", /ID5/i);
  assert.match(finding?.description ?? "", /health-contextual advertising network/i);
});

test("preview pre-consent finding uses retained first-load diagnostics when explicit pre-consent URLs are sparse", () => {
  const snapshot = buildSnapshot({
    cookieBannerPresent: true,
    cmpVendorName: "TrustArc",
    finalUrl: "https://www.draftkings.com/",
    registeredDomain: "draftkings.com",
    trackingBeforeConsentDetected: true
  });
  const payload = enrichPreviewPayloadWithFallbackEvidence({
    payload: buildPreviewPayloadFromSnapshot({
      hostname: "draftkings.com",
      normalizedUrl: "https://draftkings.com",
      snapshot
    }),
    snapshot,
    events: [{
      event_type: "runtime.build_phase_diagnostic",
      metadata_json: {
        phase: "hybrid_auto_local_evidence",
        preconsentEvidenceUrls: [
          "https://form-renderer.trustarc.com/browser/client.js",
          "https://www.googletagmanager.com/gtm.js?id=GTM-5SJK66"
        ],
        requestHostEvidence: [
          {
            hostname: "connect.facebook.net",
            sampleUrls: ["https://connect.facebook.net/en_US/fbevents.js"]
          },
          {
            hostname: "www.redditstatic.com",
            sampleUrls: ["https://www.redditstatic.com/ads/pixel.js"]
          },
          {
            hostname: "bat.bing.com",
            sampleUrls: ["https://bat.bing.com/bat.js"]
          },
          {
            hostname: "form-renderer.trustarc.com",
            sampleUrls: ["https://form-renderer.trustarc.com/browser/client.js"]
          }
        ],
        scriptSrcDomains: [
          "connect.facebook.net",
          "www.redditstatic.com",
          "bat.bing.com",
          "form-renderer.trustarc.com"
        ],
        trackerDiagnostics: [
          {
            vendorName: "FullStory",
            vendorCategory: "session_replay",
            sampleUrls: ["https://www.draftkings.com/dkjs/header/v1/web/header.js"]
          },
          {
            vendorName: "Braze",
            vendorCategory: "marketing",
            sampleUrls: ["https://js.appboycdn.com/web-sdk/3.0/appboy.min.js"]
          }
        ]
      }
    }],
    runtimeArtifacts: {
      consent_baseline_tracker_evidence_urls: [
        "https://form-renderer.trustarc.com/browser/client.js",
        "https://www.googletagmanager.com/gtm.js?id=GTM-5SJK66"
      ]
    }
  });

  const finding = payload.sampleFindings.find((candidate) => candidate.title === "Tracking activity observed before consent");
  assert.match(finding?.description ?? "", /sports betting or gambling site/i);
  assert.match(finding?.description ?? "", /FullStory/i);
  assert.match(finding?.description ?? "", /Braze/i);
  assert.match(finding?.description ?? "", /Meta Pixel/i);
  assert.match(finding?.description ?? "", /Reddit Pixel/i);
  assert.match(finding?.description ?? "", /Microsoft Bing Ads/i);
  assert.doesNotMatch(finding?.description ?? "", /TrustArc/i);
});

test("blocked previews can still surface verified privacy and terms disclosures", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "coinbase.com",
    normalizedUrl: "https://coinbase.com",
    snapshot: buildSnapshot({
      homepageFetchHttpStatus: 403,
      homepageFetchStatus: "forbidden",
      pagesScanned: 0,
      privacyPolicyPresent: true,
      termsOfServicePresent: true
    })
  });

  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Verified public disclosure surfaces detected"),
    true
  );
  assert.equal(
    payload.summaryBullets.includes("Verified public surfaces detected: privacy policy, terms of service."),
    true
  );
  assert.equal(payload.evidence?.verifiedPublicSurfacesCount, 2);
});

test("blocked previews can still surface verified cookie policy and contact disclosures", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "coinbase.com",
    normalizedUrl: "https://coinbase.com",
    snapshot: buildSnapshot({
      contactPagePresent: true,
      cookiePolicyPresent: true,
      homepageFetchHttpStatus: 403,
      homepageFetchStatus: "forbidden",
      pagesScanned: 0,
      privacyPolicyPresent: false
    })
  });

  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Verified public disclosure surfaces detected"),
    true
  );
  assert.equal(
    payload.summaryBullets.includes("Verified public surfaces detected: cookie policy, contact page."),
    true
  );
});

test("degraded-but-useful previews do not let stale auth-wall classification suppress scores or pre-consent findings", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "fandango.com",
    normalizedUrl: "https://fandango.com",
    snapshot: buildSnapshot({
      accessPostureClass: "degraded_but_useful",
      accessibilityScore: 72,
      blockPageClassification: "login_wall_probable",
      blockedFlag: false,
      certscoreOverall: 70,
      challengeSuspected: false,
      cookieBannerPresent: true,
      homepageFetchHttpStatus: 200,
      homepageFetchStatus: "ok",
      pagesScanned: 4,
      partialScan: true,
      privacyScore: 68,
      thirdPartyCookieSetBeforeConsent: true,
      totalSignals: 52,
      trackingBeforeConsentDetected: true
    })
  });

  assert.equal(payload.resultState, undefined);
  assert.deepEqual(payload.scores, {
    accessibility: 72,
    overall: 70,
    privacy: 68
  });
  assert.equal(payload.sampleFindings.some((finding) => finding.title === "Tracking activity observed before consent"), true);
});

test("evidence-rich zero-page previews do not collapse into blocked-access mode when runtime and verified surfaces were retained", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "nytimes.com",
    normalizedUrl: "https://nytimes.com",
    snapshot: buildSnapshot({
      accessibilityScore: 0,
      certscoreOverall: 0,
      cookieBannerPresent: true,
      contactPagePresent: false,
      consentInteractionModel: "accept_reject",
      cookiePolicyPresent: true,
      homepageFetchHttpStatus: 200,
      homepageFetchStatus: "ok",
      pagesScanned: 0,
      partialScan: true,
      preconsentTrackingDetected: true,
      privacyPolicyPresent: true,
      privacyScore: 0,
      termsOfServicePresent: true,
      thirdPartyCookieSetBeforeConsent: false,
      totalSignals: 9,
      trackingBeforeConsentDetected: true
    })
  });

  assert.equal(payload.resultState, undefined);
  assert.equal(payload.scores, undefined);
  assert.equal(payload.sampleFindings.some((finding) => finding.title === "Tracking activity observed before consent"), true);
  assert.equal(
    payload.summaryBullets.includes(
      "Preview scores are temporarily withheld because structured evidence was retained but the saved score fields were incomplete for this run."
    ),
    true
  );
});

test("zero-page previews without an observed consent surface do not claim pre-consent tracking", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "fandango.com",
    normalizedUrl: "https://fandango.com",
    snapshot: buildSnapshot({
      cookieBannerPresent: false,
      cmpVendorName: null,
      consentInteractionModel: "none",
      pagesScanned: 0,
      partialScan: true,
      preconsentTrackingDetected: true,
      privacyPolicyPresent: true,
      termsOfServicePresent: true,
      thirdPartyCookieSetBeforeConsent: true,
      totalSignals: 6,
      trackingBeforeConsentDetected: true
    })
  });

  assert.equal(payload.resultState, undefined);
  assert.equal(payload.sampleFindings.some((finding) => finding.title === "No verified public pages were captured"), false);
  assert.equal(payload.sampleFindings.some((finding) => finding.title === "Tracking activity observed before consent"), false);
  assert.equal(payload.sampleFindings.some((finding) => finding.title === "Cookie preferences control not obvious"), false);
});

test("evidence-rich lean previews aggressively surface urlscan-backed fallback evidence", () => {
  const snapshot = buildSnapshot({
    cookieBannerPresent: false,
    cmpVendorName: null,
    consentInteractionModel: "none",
    cookiePolicyPresent: true,
    pagesScanned: 0,
    partialScan: true,
    preconsentTrackingDetected: true,
    privacyPolicyPresent: true,
    termsOfServicePresent: true,
    thirdPartyCookieSetBeforeConsent: true,
    totalSignals: 6,
    trackingBeforeConsentDetected: true
  });
  const basePayload = buildPreviewPayloadFromSnapshot({
    hostname: "fandango.com",
    normalizedUrl: "https://fandango.com",
    snapshot
  });

  const payload = enrichPreviewPayloadWithFallbackEvidence({
    payload: basePayload,
    snapshot,
    liveEarlyResults: [
      { label: "3P requests", value: "1" },
      { label: "Initial cookies", value: "1" },
      { label: "Verified surfaces", value: "3" }
    ],
    events: [
      {
        event_type: "runtime.build_phase_diagnostic",
        metadata_json: {
          phase: "urlscan_preflight_lookup",
          status: "search_hit",
          requestCount: 4,
          cookieCount: 1,
          reportUrl: "https://urlscan.io/result/example",
          resultApiUrl: "https://urlscan.io/api/v1/result/example"
        }
      },
      {
        event_type: "runtime.build_phase_diagnostic",
        metadata_json: {
          phase: "urlscan_preflight_legal_fetch",
          status: "search_hit",
          verifiedCount: 3,
          verifiedSurfaceTargets: ["privacy_policy", "terms_of_service", "cookie_policy"]
        }
      }
    ],
    urlscanResult: {
      data: {
        cookies: [
          { name: "_ga", domain: ".fandango.com" },
          { name: "OptanonConsent", domain: ".fandango.com" },
          { name: "visitor_id", domain: ".metrics.example.net" }
        ],
        requests: [{}, {}, {}, {}, {}, {}, {}, {}]
      },
      lists: {
        countries: ["DE", "NL"],
        domains: ["www.fandango.com", "images.fandango.com", "metrics.example.net"],
        ips: ["23.3.88.43", "2.16.183.20", "198.51.100.20"],
        servers: ["AkamaiNetStorage", "AmazonS3"]
      },
      meta: {
        processors: {
          wappa: {
            data: [{ app: "OneTrust" }, { app: "Google Publisher Tag" }]
          }
        }
      },
      stats: {
        domainStats: [{ count: 3 }, { count: 2 }, { count: 1 }],
        uniqCountries: 2
      }
    },
    urlscanSource: {
      reportUrl: "https://urlscan.io/result/promoted-example/",
      resultApiUrl: "https://urlscan.io/api/v1/result/promoted-example/"
    }
  });

  assert.equal(
    payload.summaryBullets.includes("Supplemental public runtime evidence was retained for this lightweight preview."),
    true
  );
  assert.equal(
    payload.summaryBullets.includes("8 network requests, 3 third-party requests, 3 initial cookies retained from supplemental public runtime evidence."),
    true
  );
  assert.equal(
    payload.summaryBullets.includes("Named technologies retained: OneTrust and Google Publisher Tag."),
    true
  );
  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Third-party data collection footprint retained"),
    true
  );
  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Tracking or consent technologies retained"),
    true
  );
  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Disclosure surfaces verified via supplemental retrieval"),
    true
  );
  assert.equal(payload.supplementalEvidence?.requestFootprint?.details.includes("Top hosts: www.fandango.com, images.fandango.com, metrics.example.net"), true);
  assert.equal(payload.supplementalEvidence?.vendorFootprint?.details.includes("Technologies: OneTrust, Google Publisher Tag"), true);
  assert.equal(payload.supplementalEvidence?.disclosureFootprint?.details.includes("Verified surfaces: privacy policy, terms of service, cookie policy"), true);
  assert.equal(payload.supplementalEvidence?.metrics?.requestCount, 8);
  assert.equal(payload.supplementalEvidence?.metrics?.thirdPartyRequestCount, 3);
  assert.equal(payload.supplementalEvidence?.metrics?.initialCookieCount, 3);
  assert.deepEqual(payload.supplementalEvidence?.entities?.cookieNames, ["_ga"]);
  assert.deepEqual(payload.supplementalEvidence?.entities?.diagnosticCookieNamesExcludedFromTrackingEvidence, ["OptanonConsent", "visitor_id"]);
  assert.equal(payload.supplementalEvidence?.cookieFootprint?.details.includes("Tracking cookie names: _ga"), true);
  assert.equal(payload.supplementalEvidence?.reportUrl, undefined);
  assert.equal(payload.supplementalEvidence?.resultApiUrl, undefined);
  assert.equal(payload.supplementalEvidence?.source, "supplemental_public_runtime");
  assert.equal(payload.supplementalEvidence?.entities?.technologyNames?.includes("OneTrust"), true);
  assert.equal(payload.supplementalEvidence?.entities?.topDomains?.includes("www.fandango.com"), true);
  assert.equal(payload.supplementalEvidence?.sourceLabel, "Supplemental public runtime evidence");
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "fallbackEvidence"), false);
});

test("sensitive fallback tracking is prioritized and calibrates preview scores", () => {
  const snapshot = buildSnapshot({
    cookieBannerPresent: false,
    cmpVendorName: null,
    consentInteractionModel: "none",
    cookiePolicyPresent: true,
    finalUrl: "https://www.webmd.com/",
    pagesScanned: 0,
    partialScan: true,
    preconsentTrackingDetected: true,
    privacyPolicyPresent: true,
    registeredDomain: "webmd.com",
    termsOfServicePresent: true,
    thirdPartyCookieSetBeforeConsent: true,
    totalSignals: 8,
    trackingBeforeConsentDetected: true
  });

  const payload = enrichPreviewPayloadWithFallbackEvidence({
    payload: buildPreviewPayloadFromSnapshot({
      hostname: "webmd.com",
      normalizedUrl: "https://webmd.com",
      snapshot
    }),
    snapshot,
    events: [
      {
        event_type: "runtime.build_phase_diagnostic",
        metadata_json: {
          phase: "urlscan_preflight_lookup",
          status: "search_hit",
          requestCount: 94,
          cookieCount: 14
        }
      },
      {
        event_type: "runtime.build_phase_diagnostic",
        metadata_json: {
          phase: "urlscan_preflight_legal_fetch",
          status: "search_hit",
          verifiedCount: 3,
          verifiedSurfaceTargets: ["privacy_policy", "terms_of_service", "cookie_policy"]
        }
      }
    ],
    urlscanResult: {
      data: {
        cookies: [
          { name: "aam", domain: ".webmd.com" },
          { name: "AMCV_16AD4362526701720A490D45%40AdobeOrg", domain: ".webmd.com" },
          { name: "OptanonConsent", domain: ".webmd.com" }
        ],
        requests: [
          { request: { url: "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js" } },
          { request: { url: "https://www.google.com/recaptcha/enterprise.js" } }
        ]
      },
      lists: {
        countries: ["US"],
        domains: ["cdn.cookielaw.org", "assets.adobedtm.com", "www.google.com", "www.gstatic.com"],
        ips: ["203.0.113.10"],
        servers: ["cloudflare"]
      },
      meta: {
        processors: {
          wappa: {
            data: [{ app: "OneTrust" }, { app: "reCAPTCHA" }]
          }
        }
      },
      stats: {
        domainStats: [{ count: 50 }, { count: 22 }, { count: 12 }, { count: 10 }],
        uniqCountries: 1
      }
    }
  });

  assert.equal(payload.sampleFindings[0]?.title, "Tracking activity observed before consent");
  assert.equal(payload.sampleFindings[0]?.severity, "high");
  assert.equal(payload.sampleFindings[0]?.description.includes("health information site"), true);
  const sensitiveFinding = payload.sampleFindings.find((finding) => finding.title === "DMP audience profiling before consent");
  assert.equal(sensitiveFinding?.severity, "high");
  assert.equal(sensitiveFinding?.description.includes("Adobe Audience Manager"), true);
  assert.equal(sensitiveFinding?.description.includes("reCAPTCHA Enterprise"), true);
  assert.equal(payload.scores?.privacy, 55);
  assert.equal(payload.scores?.overall, 62);
  assert.equal(payload.summaryBullets.includes("Preview scores: overall 62, privacy 55, accessibility 82."), true);
  assert.equal(payload.summaryBullets.includes("Preview scores: overall 79, privacy 78, accessibility 82."), false);
  assert.equal(
    payload.summaryBullets.includes("Preview scores were calibrated downward because sensitive-context tracking evidence was retained before consent."),
    true
  );
});

test("captcha-limited sensitive previews can surface calibrated scores when live evidence is strong", () => {
  const snapshot = buildSnapshot({
    accessibilityScore: 100,
    blockVendorGuess: "cloudflare",
    captchaFlag: true,
    certscoreOverall: 71,
    cookieBannerPresent: true,
    finalUrl: "https://www.webmd.com/",
    homepageFetchHttpStatus: 200,
    homepageFetchStatus: "ok",
    pagesScanned: 0,
    partialScan: true,
    privacyScore: 73,
    registeredDomain: "webmd.com",
    totalSignals: 26,
    trackingBeforeConsentDetected: true
  });

  const payload = enrichPreviewPayloadWithFallbackEvidence({
    payload: buildPreviewPayloadFromSnapshot({
      hostname: "webmd.com",
      normalizedUrl: "https://webmd.com",
      snapshot
    }),
    snapshot,
    events: [],
    runtimeArtifacts: {
      consent_baseline_tracker_evidence_urls: [
        "https://cdn.id5-sync.com/api/1.0/id5-api.js",
        "https://bh-medscape-cdn.contextweb.com/pixel.js",
        "https://c.amazon-adsystem.com/aax2/apstag.js"
      ],
      local_storage_keys: ["aps:3100:deviceSignal/sua"],
      third_party_request_domains: ["api.id5-sync.com", "bh-medscape-cdn.contextweb.com", "c.amazon-adsystem.com"]
    }
  });

  assert.equal(payload.resultState, undefined);
  assert.equal(payload.sampleFindings[0]?.title, "Tracking activity observed before consent");
  assert.equal(payload.scores?.overall, 62);
  assert.equal(payload.scores?.privacy, 55);
  assert.equal(payload.scores?.accessibility, 100);
  assert.equal(payload.summaryBullets.includes("Preview scores: overall 62, privacy 55, accessibility 100."), true);
  assert.equal(
    payload.summaryBullets.some((bullet) => bullet.includes("withheld because the live pass stopped")),
    false
  );
  assert.equal(
    payload.summaryBullets.includes(
      "Site protections limited page-depth verification, but retained live-browser evidence was sufficient to surface sensitive-context tracking risk."
    ),
    true
  );
});

test("preview payload surfaces urlscan no-api-key diagnostics as scanner health warnings", () => {
  const snapshot = buildSnapshot({
    cookieBannerPresent: true,
    pagesScanned: 4,
    trackingBeforeConsentDetected: true
  });
  const payload = enrichPreviewPayloadWithFallbackEvidence({
    payload: buildPreviewPayloadFromSnapshot({
      hostname: "fandango.com",
      normalizedUrl: "https://fandango.com",
      snapshot
    }),
    snapshot,
    events: [
      {
        event_type: "runtime.build_phase_diagnostic",
        metadata_json: {
          phase: "urlscan_preflight_lookup",
          status: "no_api_key"
        }
      },
      {
        event_type: "runtime.build_phase_diagnostic",
        metadata_json: {
          phase: "urlscan_preflight_legal_fetch",
          skipReason: "no_api_key"
        }
      }
    ]
  });

  assert.equal(payload.scannerHealthWarnings?.[0]?.code, "supplemental_enrichment_key_missing");
  assert.deepEqual(payload.scannerHealthWarnings?.[0]?.phases, ["supplemental_disclosure_fetch", "supplemental_runtime_lookup"]);
  assert.equal(
    payload.summaryBullets.some((bullet) => bullet.includes("Scanner health warning: Supplemental public runtime enrichment was skipped")),
    true
  );
});

test("rate-limited previews with zero pages stop normal interpretation and surface the exact reason", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "coinbase.com",
    normalizedUrl: "https://coinbase.com",
    snapshot: buildSnapshot({
      homepageFetchHttpStatus: 429,
      homepageFetchStatus: "ok",
      pagesScanned: 0
    })
  });

  assert.equal(payload.scores, undefined);
  assert.equal(payload.resultState?.title, "Access limited by site protections");
  assert.equal(payload.sampleFindings.some((finding) => finding.title === "Homepage rate-limited during live scan"), true);
  assert.equal(
    payload.summaryBullets.includes(
      "Reason: homepage request was rate-limited with HTTP 429 before the scanner could verify a usable page surface."
    ),
    true
  );
});

test("auth-wall previews stop normal interpretation and surface the exact reason", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "chime.com",
    normalizedUrl: "https://chime.com",
    snapshot: buildSnapshot({
      authWallDetected: true,
      pagesScanned: 0
    })
  });

  assert.equal(payload.scores, undefined);
  assert.equal(payload.resultState?.title, "Access limited by site protections");
  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Authentication wall blocked homepage verification"),
    true
  );
  assert.equal(
    payload.summaryBullets.includes(
      "Reason: the homepage presented an authentication wall before the scanner could verify a usable public page surface."
    ),
    true
  );
});

test("not-found previews classify the domain as inactive or unstable", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "example.org",
    normalizedUrl: "https://example.org",
    snapshot: buildSnapshot({
      homepageFetchHttpStatus: 404,
      homepageFetchStatus: "not_found",
      pagesScanned: 0
    })
  });

  assert.equal(payload.scores, undefined);
  assert.equal(payload.resultState?.title, "Domain inactive or unstable");
  assert.equal(payload.sampleFindings.some((finding) => finding.title === "Homepage may be inactive or unstable"), true);
  assert.equal(payload.summaryBullets.includes("Reason: homepage returned HTTP 404 Not Found."), true);
});

test("successful homepage fetches with missing retained body classify as degraded content capture", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "fxculturetrading.com",
    normalizedUrl: "https://fxculturetrading.com",
    snapshot: buildSnapshot({
      accessPostureClass: "tolerant",
      homepageFetchHttpStatus: 200,
      homepageFetchStatus: "ok",
      normalizedBodyHash: null,
      pagesScanned: 1
    })
  });

  assert.equal(payload.resultState?.code, "content_capture_degraded");
  assert.equal(payload.resultState?.title, "Content capture degraded");
  assert.equal(
    payload.summaryBullets.includes(
      "Reason: homepage fetch succeeded, but the run did not retain a usable normalized homepage body for downstream review."
    ),
    true
  );
});

test("degraded-but-useful content capture can show computed scores with a caveat", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "fandango.com",
    normalizedUrl: "https://fandango.com",
    snapshot: buildSnapshot({
      accessPostureClass: "degraded_but_useful",
      accessibilityScore: 72,
      certscoreOverall: 70,
      homepageFetchHttpStatus: 200,
      homepageFetchStatus: "ok",
      normalizedBodyHash: null,
      pagesScanned: 4,
      privacyScore: 68,
      totalSignals: 52
    })
  });

  assert.equal(payload.resultState?.code, "content_capture_degraded");
  assert.deepEqual(payload.scores, {
    accessibility: 72,
    overall: 70,
    privacy: 68
  });
  assert.equal(
    payload.summaryBullets.includes("Preview scores are shown with a coverage caveat: overall 70, privacy 68, accessibility 72."),
    true
  );
});

test("blocked previews expose first-class evidence fields", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "example.com",
    normalizedUrl: "https://example.com",
    snapshot: buildSnapshot({
      blockVendorGuess: "akamai",
      challengeSuspected: true,
      homepageFetchHttpStatus: 403,
      homepageFetchStatus: "forbidden",
      pagesScanned: 0,
      passiveVerificationAttemptCount: 2,
      privacyPolicyPresent: true
    })
  });

  assert.equal(payload.resultState?.message.includes("This does not by itself mean expected disclosures are absent."), true);
  assert.deepEqual(payload.evidence, {
    coverageLevel: "limited_partial",
    homepageStatus: 403,
    passiveVerificationAttempted: true,
    robotsStatus: 200,
    verifiedPublicSurfacesCount: 1,
    protectionVendor: "akamai"
  });
});

test("off-domain redirects surface an explicit redirect finding", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "hyperfund.com",
    normalizedUrl: "https://hyperfund.com",
    snapshot: buildSnapshot({
      finalUrl: "https://nfund.com/",
      registeredDomain: "hyperfund.com",
      redirectCount: 1,
      homepageFetchStatus: "error",
      pagesScanned: 0
    })
  });

  assert.equal(payload.sampleFindings.some((finding) => finding.title === "Domain redirected to a different site"), true);
  assert.equal(payload.summaryBullets.some((bullet) => bullet.includes("redirected to nfund.com")), true);
});

test("preview enrichment suppresses privacy absence when homepage discovery retained a strong privacy notice", () => {
  const snapshot = buildSnapshot({
    pagesScanned: 4,
    partialScan: false,
    privacyPolicyPresent: false,
    totalSignals: 42
  });
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "draftkings.com",
    normalizedUrl: "https://draftkings.com",
    snapshot
  });

  assert.equal(payload.sampleFindings.some((finding) => finding.title === "Privacy policy not detected"), true);

  const enriched = enrichPreviewPayloadWithFallbackEvidence({
    events: [
      {
        event_type: "runtime.build_phase_diagnostic",
        metadata_json: {
          discoveryDebug: {
            topDiscoveryCandidates: [
              {
                anchorText: "Privacy Notice",
                candidateScore: 0.98,
                candidateUrl: "https://myaccount.draftkings.com/documents/privacy-notice",
                discoveredFrom: "homepage_rendered_link",
                pageType: "privacy_policy",
                sourceUrl: "https://www.draftkings.com/"
              }
            ]
          },
          phase: "page_discovery_fetch"
        }
      }
    ],
    payload,
    snapshot
  });

  assert.equal(enriched.sampleFindings.some((finding) => finding.title === "Privacy policy not detected"), false);
  assert.equal(enriched.issueCounts.high, payload.issueCounts.high - 1);
  assert.equal(
    enriched.summaryBullets.includes("A likely privacy notice link was retained from the scanned homepage surface."),
    true
  );
});
