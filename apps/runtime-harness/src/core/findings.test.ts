import assert from "node:assert/strict";
import test from "node:test";
import { buildSignalFindings } from "./findings";

test("buildSignalFindings adds a fingerprinting finding when suspicious telemetry is present", () => {
  const findings = buildSignalFindings({
    consentUi: {
      acceptPresent: false,
      detected: false,
      firstDetectedTimestampMs: null,
      managePresent: false,
      rejectPresent: false,
      selectorHint: null,
      textSnippet: null
    },
    cookiesBeforeConsent: [],
    fingerprinting: {
      confidence: "medium",
      reasons: [
        "Observed 1 requests carrying device or browser attribute hints.",
        "Observed 4 identifier-like requests.",
        "Matched known anti-bot or bot-detection pattern: cloudflare_bot_management."
      ],
      signals: {
        attributeCategories: [],
        attributeCategoryCount: 0,
        burstDetected: false,
        collectionPattern: "isolated",
        firstPartyInvolved: null,
        identifierShapingDetected: false,
        knownBotLibraryMatch: "cloudflare_bot_management",
        knownFingerprintLibraryMatch: null,
        networkAfterCollection: false,
        preConsent: "unknown",
        thirdPartyAfterCollection: false,
        thirdPartyInvolved: null
      },
      summary: "Suspicious anti-bot or fingerprint-related telemetry was observed.",
      tier: 1
    },
    preConsentTimeline: [],
    preConsentVendorSummary: {
      categories: {
        advertising: 0,
        analytics: 0,
        functional: 0,
        unknown: 0
      },
      normalizedVendors: [],
      vendorCounts: {}
    },
    vendorSummary: {
      categories: {
        advertising: 0,
        analytics: 0,
        functional: 0,
        unknown: 0
      },
      normalizedVendors: [],
      rawDomains: [],
      vendorCounts: {}
    }
  });

  assert.ok(findings.some((finding) => finding.title === "Suspicious anti-bot or fingerprint-related telemetry observed"));
});
