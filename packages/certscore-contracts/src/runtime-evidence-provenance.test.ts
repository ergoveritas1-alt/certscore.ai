import assert from "node:assert/strict";
import test from "node:test";
import { cookieEventSchema, policySurfaceObservationSchema } from "./index.js";

test("cookie evidence retains typed purpose, necessity, confidence, and reason codes", () => {
  const parsed = cookieEventSchema.parse({
    eventId: "cookie_1",
    eventType: "cookie",
    timestampMs: 12,
    sourceScanner: "pre_consent_runtime",
    scenario: "baseline_pre_consent",
    consentStateAtTime: "pre_consent",
    pagePhase: "network_idle",
    url: "https://example.test/",
    evidenceRefs: [],
    confidence: 0.98,
    directVsInferred: "direct",
    cookieName: "_gcl_au",
    cookiePurpose: "advertising",
    cookieEssentiality: "non_essential",
    cookieEssentialityConfidence: 0.98,
    cookieEssentialityReasonCodes: ["canonical_cookie_kb:advertising"],
    operation: "browser_snapshot",
    valueRedacted: true,
  });

  assert.equal(parsed.cookiePurpose, "advertising");
  assert.equal(parsed.cookieEssentiality, "non_essential");
  assert.equal(parsed.cookieEssentialityConfidence, 0.98);
  assert.deepEqual(parsed.cookieEssentialityReasonCodes, ["canonical_cookie_kb:advertising"]);
});

test("policy evidence retains retrieval and regional provenance without inferring translation", () => {
  const parsed = policySurfaceObservationSchema.parse({
    observationId: "policy_1",
    surfaceType: "privacy_policy",
    url: "https://example.test/datenschutz",
    status: "fetched",
    confidence: 0.95,
    directVsInferred: "direct",
    retrievedAt: "2026-08-01T20:00:00.000Z",
    effectiveDate: "1 July 2026",
    directlyLinkedFromScannedPage: true,
    translationApplied: false,
  });

  assert.equal(parsed.retrievedAt, "2026-08-01T20:00:00.000Z");
  assert.equal(parsed.effectiveDate, "1 July 2026");
  assert.equal(parsed.directlyLinkedFromScannedPage, true);
  assert.equal(parsed.translationApplied, false);
});
