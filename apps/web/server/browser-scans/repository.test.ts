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
