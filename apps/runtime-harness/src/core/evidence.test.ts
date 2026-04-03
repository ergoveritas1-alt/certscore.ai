import assert from "node:assert/strict";
import test from "node:test";
import { buildFingerprintingSummary } from "./evidence";
import type { ConsentUiSummary, FingerprintingCollectorSnapshot, RequestRecord } from "./types";

function buildRequestRecord(overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    frameUrl: "https://freefunz.site/",
    id: "req",
    initiatorType: "script",
    initiatorUrl: "https://freefunz.site/",
    method: "GET",
    resourceType: "script",
    timestampMs: 100,
    url: "https://freefunz.site/",
    ...overrides
  };
}

function buildConsentUiSummary(overrides: Partial<ConsentUiSummary> = {}): ConsentUiSummary {
  return {
    acceptPresent: false,
    detected: false,
    firstDetectedTimestampMs: null,
    managePresent: false,
    rejectPresent: false,
    selectorHint: null,
    textSnippet: null,
    ...overrides
  };
}

function buildFingerprintingCollectorSnapshot(
  overrides: Partial<FingerprintingCollectorSnapshot> = {}
): FingerprintingCollectorSnapshot {
  return {
    categories: [],
    eventSamples: [],
    identifierShapingDetected: false,
    knownBotLibraryMatch: null,
    knownFingerprintLibraryMatch: null,
    ...overrides
  };
}

test("anti-bot telemetry with identifier and device hints is surfaced as suspicious fingerprinting", () => {
  const summary = buildFingerprintingSummary({
    collector: buildFingerprintingCollectorSnapshot(),
    consentUi: buildConsentUiSummary(),
    requestedUrl: "https://freefunz.site/",
    requests: [
      buildRequestRecord({
        timestampMs: 20,
        url: "https://go.fojik.site/cdn-cgi/challenge-platform/scripts/jsd/main.js"
      }),
      buildRequestRecord({
        timestampMs: 40,
        url: "https://static.cloudflareinsights.com/beacon.min.js/v8"
      }),
      buildRequestRecord({
        timestampMs: 60,
        url: "https://www.google-analytics.com/g/collect?v=2&cid=957668531.1775169073&sr=1440x1600&uaa=x86&uab=64&uafvl=HeadlessChrome&uap=macOS&uapv=10_15_7"
      })
    ]
  });

  assert.equal(summary.tier, 1);
  assert.equal(summary.confidence, "medium");
  assert.equal(summary.signals.knownBotLibraryMatch, "cloudflare_bot_management");
  assert.equal(summary.signals.knownFingerprintLibraryMatch, null);
  assert.match(summary.summary, /anti-bot or fingerprint-related tooling/i);
  assert.ok(summary.reasons.some((reason) => /device or browser attribute hints/i.test(reason)));
  assert.ok(summary.reasons.some((reason) => /identifier-like requests/i.test(reason)));
  assert.ok(summary.reasons.some((reason) => /cloudflare_bot_management/i.test(reason)));
});

test("direct multi-attribute collection still wins the likely fingerprinting tier", () => {
  const summary = buildFingerprintingSummary({
    collector: buildFingerprintingCollectorSnapshot({
      categories: [
        { firstSeenMs: 100, hits: 1, name: "canvas_webgl" },
        { firstSeenMs: 150, hits: 1, name: "audio" },
        { firstSeenMs: 200, hits: 1, name: "hardware" }
      ],
      identifierShapingDetected: true
    }),
    consentUi: buildConsentUiSummary({
      detected: true,
      firstDetectedTimestampMs: 1_000
    }),
    requestedUrl: "https://example.com/",
    requests: [
      buildRequestRecord({
        timestampMs: 250,
        url: "https://collector.example/fp?visitor_id=abc123",
        initiatorUrl: "https://example.com/"
      })
    ]
  });

  assert.equal(summary.tier, 3);
  assert.equal(summary.confidence, "high");
  assert.equal(summary.signals.preConsent, "true");
});
