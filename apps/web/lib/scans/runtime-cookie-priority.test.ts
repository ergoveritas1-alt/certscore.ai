import assert from "node:assert/strict";
import test from "node:test";
import { getRuntimeCookieFirstSeenMs } from "./runtime-cookie-priority";
import type { RuntimeCookieEvidenceRow } from "./runtime-cookie-evidence";

function cookieTimingRow(
  overrides: Partial<RuntimeCookieEvidenceRow>
): RuntimeCookieEvidenceRow {
  return {
    category: "analytics",
    cookieName: "example_cookie",
    domain: "example.test",
    firstObservedAtMs: 2_540,
    initiatorDomain: "example.test",
    initiatorUrl: "https://example.test/script.js",
    initiatorVendor: "Example",
    nonEssential: true,
    party: "first_party",
    responseUrl: null,
    setAtMs: 4_380,
    setMethod: "document_cookie",
    sourceRequestUrl: null,
    timingBasis: "runtime_cookie_write",
    evidenceGrade: "high",
    timingEvidence: "before_consent_cookie_write",
    ...overrides,
  };
}

test("proven cookie writes use the retained write time rather than an earlier inventory observation", () => {
  assert.equal(getRuntimeCookieFirstSeenMs(cookieTimingRow({})), 4_380);
});

test("snapshot-only cookies retain their first observation time", () => {
  assert.equal(getRuntimeCookieFirstSeenMs(cookieTimingRow({
    setAtMs: null,
    setMethod: "initial_cookie_snapshot",
    timingEvidence: "initial_cookie_snapshot",
  })), 2_540);
});
