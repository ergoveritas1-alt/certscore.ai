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

test("evidence-rich zero-page previews do not collapse into blocked-access mode when runtime and verified surfaces were retained", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "nytimes.com",
    normalizedUrl: "https://nytimes.com",
    snapshot: buildSnapshot({
      accessibilityScore: 0,
      certscoreOverall: 0,
      cookieBannerPresent: true,
      contactPagePresent: false,
      consentInteractionModel: "banner",
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
          reportUrl: "https://urlscan.io/result/example"
        }
      },
      {
        event_type: "runtime.build_phase_diagnostic",
        metadata_json: {
          phase: "urlscan_preflight_legal_fetch",
          status: "search_hit",
          verifiedCount: 3
        }
      }
    ]
  });

  assert.equal(
    payload.summaryBullets.includes("Fallback runtime evidence from urlscan.io was retained for this lightweight preview."),
    true
  );
  assert.equal(
    payload.summaryBullets.includes("Fallback runtime evidence retained 4 network requests, 1 third-party requests, 1 initial cookies."),
    true
  );
  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Third-party runtime activity observed in fallback evidence"),
    true
  );
  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Cookie activity observed in fallback evidence"),
    true
  );
  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Disclosure surfaces verified via fallback retrieval"),
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
