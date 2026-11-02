import assert from "node:assert/strict";
import test from "node:test";
import { cookieEventSchema } from "@certscore/contracts";
import {
  boundedInitiatorChain,
  boundedInitiatorUrl,
  MAX_INITIATOR_CHAIN_ENTRIES,
  MAX_INITIATOR_URL_CHARS,
  withBoundedCookieInitiatorMetadata,
} from "./bounded-initiator-url.js";

test("oversized Google-style initiator URLs remain contract-safe and query-value-free", () => {
  const oversizedUrl =
    `https://www.google.cz/xjs/${"bootstrap-segment/".repeat(180)}loader.js` +
    "?session_token=should-not-be-retained#runtime";

  const bounded = boundedInitiatorUrl(oversizedUrl);

  assert.ok(bounded);
  assert.ok(bounded.length <= MAX_INITIATOR_URL_CHARS);
  assert.match(bounded, /^https:\/\/www\.google\.cz\/xjs\//);
  assert.match(bounded, /#certscore_truncated_sha256=[a-f0-9]{16}$/);
  assert.doesNotMatch(bounded, /session_token|should-not-be-retained|runtime/);

  assert.doesNotThrow(() => cookieEventSchema.parse({
    eventId: "cookie_google_oversized_initiator",
    eventType: "cookie",
    timestampMs: 1,
    sourceScanner: "pre_consent_runtime",
    scenario: "fresh_pre_consent",
    consentStateAtTime: "pre_consent",
    pagePhase: "initial_navigation",
    evidenceRefs: [],
    confidence: 0.95,
    directVsInferred: "direct",
    cookieName: "NID",
    setterScriptUrl: bounded,
    initiatorChain: [bounded],
    cookieParty: "third_party",
    vendorAssociated: false,
    operation: "set_cookie_header",
    valueRedacted: true,
  }));
});

test("initiator chains are deduplicated, bounded, and safe for malformed stack entries", () => {
  const oversizedEntry = `not-a-url?secret=${"x".repeat(2_100)}`;
  const values = [
    "https://cdn.example/script.js?user=123",
    "https://cdn.example/script.js?user=456",
    oversizedEntry,
    ...Array.from({ length: 20 }, (_, index) => `https://scripts.example/${index}.js`),
  ];

  const bounded = boundedInitiatorChain(values);

  assert.equal(bounded.length, MAX_INITIATOR_CHAIN_ENTRIES);
  assert.equal(bounded[0], "https://cdn.example/script.js");
  assert.equal(bounded.filter((value) => value === "https://cdn.example/script.js").length, 1);
  assert.ok(bounded.every((value) => value.length <= MAX_INITIATOR_URL_CHARS));
  assert.ok(bounded.every((value) => !value.includes("secret=")));
});

test("schema-boundary defense repairs optional oversized cookie attribution", () => {
  const oversizedUrl = `https://www.google.cz/xjs/${"x".repeat(2_100)}?secret=value`;
  const repaired = withBoundedCookieInitiatorMetadata({
    cookieName: "NID",
    initiatorChain: [oversizedUrl],
    setterScriptUrl: oversizedUrl,
  });

  assert.ok(repaired.setterScriptUrl);
  assert.ok(repaired.setterScriptUrl.length <= MAX_INITIATOR_URL_CHARS);
  assert.ok(repaired.initiatorChain.every((value) => value.length <= MAX_INITIATOR_URL_CHARS));
  assert.doesNotMatch(JSON.stringify(repaired), /secret|value/);
});

test("cookie metadata normalization preserves absent setter proof despite request initiator context", () => {
  for (const operation of ["set_cookie_header", "browser_snapshot"]) {
    const event = {
      operation,
      initiatorChain: ["https://cdn.example/request.js?token=private-fixture"],
      setterScriptUrl: undefined,
      setByThirdPartyScript: false,
      sourceRequestId: "retained-request",
    };
    const original = structuredClone(event);
    const bounded = withBoundedCookieInitiatorMetadata(event);
    assert.equal(bounded.setterScriptUrl, undefined, operation);
    assert.equal(bounded.setByThirdPartyScript, false);
    assert.equal(bounded.sourceRequestId, "retained-request");
    assert.deepEqual(bounded.initiatorChain, ["https://cdn.example/request.js"]);
    assert.deepEqual(event, original, "normalization must not mutate the original evidence");
  }
});
