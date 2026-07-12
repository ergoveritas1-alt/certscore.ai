import assert from "node:assert/strict";
import test from "node:test";
import { summarizeBrowserEvidence, type BrowserScanArtifactRow, type BrowserScanEventRow } from "./evidence-summary";
import { buildBrowserObservedSignalPackageFromEvidence } from "./observed-signal-package";

test("summarizeBrowserEvidence preserves browser-extension provenance shape without cookie values", () => {
  const events: BrowserScanEventRow[] = [
    {
      event_type: "network_request",
      observed_at_ms: 10,
      event_json: {
        eventType: "network_request",
        hostname: "example.com",
        observedAtMs: 10,
        resourceType: "main_frame",
        url: "https://example.com/"
      }
    },
    {
      event_type: "network_request",
      observed_at_ms: 25,
      event_json: {
        consentInteractionObserved: false,
        eventType: "network_request",
        hostname: "www.googletagmanager.com",
        observedAtMs: 25,
        resourceType: "script",
        url: "https://www.googletagmanager.com/gtm.js?id=GTM-TEST"
      }
    },
    {
      event_type: "cookie_added",
      observed_at_ms: 40,
      event_json: {
        cookieName: "_ga",
        domain: ".example.com",
        eventType: "cookie_added",
        httpOnly: false,
        observedAtMs: 40,
        path: "/",
        sameSite: "lax",
        secure: true,
        source: "chrome.cookies.onChanged",
        timingPrecision: "exact_event",
        valueCaptured: false
      }
    },
    {
      event_type: "consent_ui_observed",
      observed_at_ms: 75,
      event_json: {
        acceptObserved: true,
        bannerObserved: true,
        buttonsObserved: ["Accept all", "Reject all", "Manage choices"],
        eventType: "consent_ui_observed",
        manageObserved: true,
        matchedTextSnippets: ["We use cookies to improve your experience."],
        observedAtMs: 75,
        rejectObserved: true,
        selectorSummary: "div#cookie-banner"
      }
    }
  ];
  const artifacts: BrowserScanArtifactRow[] = [
    {
      artifact_json: { dataUrl: "data:image/png;base64,AAAA", sourceType: "browser_extension" },
      artifact_type: "screenshot",
      content_type: "image/png"
    }
  ];

  const summary = summarizeBrowserEvidence({
    artifacts,
    events,
    targetHostname: "example.com"
  });

  assert.deepEqual(summary.thirdPartyRequestDomains, ["www.googletagmanager.com"]);
  assert.equal(summary.thirdPartyRequestCount, 1);
  assert.deepEqual(summary.timelineMarkers, {
    consentBannerDetectedMs: 75,
    firstRequestMs: 10,
    firstThirdPartyRequestMs: 25
  });
  assert.deepEqual(summary.cookieNames, ["_ga"]);
  assert.deepEqual(summary.cookieDomains, [".example.com"]);
  assert.equal(summary.cookies[0]?.valueCaptured, false);
  assert.equal(summary.bannerObserved, true);
  assert.equal(summary.consentSummary?.selectorSummary, "div#cookie-banner");
  assert.equal(summary.screenshotArtifactCount, 1);
});

test("summarizeBrowserEvidence does not synthesize tracker findings from raw BX01 requests", () => {
  const summary = summarizeBrowserEvidence({
    artifacts: [],
    events: [
      {
        event_type: "network_request",
        observed_at_ms: 25,
        event_json: {
          eventType: "network_request",
          hostname: "www.googletagmanager.com",
          observedAtMs: 25,
          resourceType: "script",
          url: "https://www.googletagmanager.com/gtm.js?id=GTM-TEST"
        }
      }
    ],
    targetHostname: "example.com"
  });

  assert.equal("trackerVendorNames" in summary, false);
  assert.equal("trackerEvidenceUrls" in summary, false);
  assert.equal("classifiedThirdPartyRequests" in summary, false);
  assert.equal("requestObservations" in summary, false);
  assert.deepEqual(summary.thirdPartyRequestDomains, ["www.googletagmanager.com"]);
});

test("WS01-normalized BX01 signal package preserves request timing provenance", () => {
  const summary = summarizeBrowserEvidence({
    artifacts: [],
    events: [
      {
        event_type: "network_request",
        observed_at_ms: 25,
        event_json: {
          consentInteractionObserved: false,
          eventType: "network_request",
          hostname: "www.googletagmanager.com",
          observedAtMs: 25,
          resourceType: "script",
          url: "https://www.googletagmanager.com/gtm.js?id=GTM-TEST"
        }
      }
    ],
    targetHostname: "example.com"
  });

  const signalPackage = buildBrowserObservedSignalPackageFromEvidence({ evidence: summary });
  const preconsentSignal = signalPackage.observedSignals.find(
    (signal) => signal.key === "privacy.preconsent_tracking_detected"
  );

  assert.equal(preconsentSignal?.value, true);
  assert.ok(
    preconsentSignal?.evidenceRefs.includes("bx01.network_request:25:https://www.googletagmanager.com/gtm.js?id=GTM-TEST")
  );
});

test("browser signal package uses the canonical resolver for multiple pre-consent vendors", () => {
  const summary = summarizeBrowserEvidence({
    artifacts: [],
    events: [
      {
        event_type: "network_request",
        observed_at_ms: 25,
        event_json: {
          eventType: "network_request",
          hostname: "securepubads.g.doubleclick.net",
          observedAtMs: 25,
          resourceType: "script",
          url: "https://securepubads.g.doubleclick.net/tag/js/gpt.js"
        }
      },
      {
        event_type: "network_request",
        observed_at_ms: 40,
        event_json: {
          eventType: "network_request",
          hostname: "sb.scorecardresearch.com",
          observedAtMs: 40,
          resourceType: "image",
          url: "https://sb.scorecardresearch.com/p?c1=2"
        }
      },
      {
        event_type: "network_request",
        observed_at_ms: 50,
        event_json: {
          eventType: "network_request",
          hostname: "cdn.cnn.com",
          observedAtMs: 50,
          resourceType: "script",
          url: "https://cdn.cnn.com/app.js"
        }
      }
    ],
    targetHostname: "www.cnn.com"
  });

  const signalPackage = buildBrowserObservedSignalPackageFromEvidence({ evidence: summary });
  const vendors = signalPackage.observedSignals.find((signal) => signal.key === "privacy.preconsent_tracker_vendors");
  const violationCount = signalPackage.observedSignals.find((signal) => signal.key === "privacy.preconsent_violation_count");

  assert.deepEqual(vendors?.value, ["Google Publisher Tag", "Google Ads / DoubleClick", "ScorecardResearch"]);
  assert.equal(violationCount?.value, 2);
});

test("browser signal package counts unique cookies instead of repeated cookie events", () => {
  const cookie = {
    cookieName: "session-id",
    domain: ".example.com",
    observedAtMs: 20,
    path: "/",
    valueCaptured: false as const
  };
  const summary = summarizeBrowserEvidence({
    artifacts: [],
    events: [
      { event_type: "cookie_added", observed_at_ms: 20, event_json: { ...cookie, eventType: "cookie_added" } },
      { event_type: "cookie_changed", observed_at_ms: 30, event_json: { ...cookie, eventType: "cookie_changed" } },
      { event_type: "cookie_observed", observed_at_ms: 40, event_json: { ...cookie, eventType: "cookie_observed" } },
      {
        event_type: "cookie_added",
        observed_at_ms: 50,
        event_json: { ...cookie, cookieName: "preferences", eventType: "cookie_added", observedAtMs: 50 }
      }
    ],
    targetHostname: "example.com"
  });

  const signalPackage = buildBrowserObservedSignalPackageFromEvidence({ evidence: summary });
  const cookieCount = signalPackage.observedSignals.find((signal) => signal.key === "privacy.cookie_count_total");

  assert.equal(cookieCount?.value, 2);
  assert.equal(cookieCount?.label, "Unique cookies observed");
});

test("browser signal package projects fetched legal surfaces and page evidence", () => {
  const summary = summarizeBrowserEvidence({
    artifacts: [
      {
        artifact_type: "page_evidence",
        content_type: "application/json",
        artifact_json: {
          finalUrl: "https://example.com/",
          iframeUrls: ["https://player.example-video.com/embed/1"],
          insecureFormActionCount: 0,
          mixedContentCount: 0,
          transportSecure: true
        }
      },
      {
        artifact_type: "policy_surface",
        content_type: "application/json",
        artifact_json: {
          bodyText: "Privacy notice content retained for bounded review.",
          finalUrl: "https://example.com/privacy",
          pageType: "privacy_policy"
        }
      },
      {
        artifact_type: "policy_surface",
        content_type: "application/json",
        artifact_json: {
          bodyText: "Cookie notice content retained for bounded review.",
          finalUrl: "https://example.com/cookies",
          pageType: "cookie_policy"
        }
      }
    ],
    events: [],
    targetHostname: "example.com"
  });
  const signalPackage = buildBrowserObservedSignalPackageFromEvidence({ evidence: summary });
  const value = (key: string) => signalPackage.observedSignals.find((signal) => signal.key === key)?.value;

  assert.equal(value("disclosure.privacy_policy_present"), true);
  assert.equal(value("disclosure.cookie_policy_present"), true);
  assert.equal(value("disclosure.terms_of_service_present"), false);
  assert.equal(value("security.https_enforced"), true);
  assert.equal(value("privacy.preconsent_iframe_count"), 1);
  assert.deepEqual(value("disclosure.privacy_policy_urls"), ["https://example.com/privacy"]);
});
