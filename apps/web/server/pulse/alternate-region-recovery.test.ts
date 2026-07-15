import assert from "node:assert/strict";
import test from "node:test";
import {
  hasAlternateRegionRecoveryAttempt,
  planAlternateRegionRecovery
} from "./alternate-region-recovery";

test("plans one EU-DE fallback for EU-IE access denial", () => {
  assert.deepEqual(
    planAlternateRegionRecovery({
      fallbackAlreadyAttempted: false,
      noGoReason: "access_denied_or_forbidden_page",
      primaryScanFrom: "eu_ie"
    }),
    {
      from: "eu_ie",
      reasonCode: "access_denied_or_forbidden_page",
      to: "eu_de"
    }
  );
});

test("does not fallback for other no-go reasons or regions", () => {
  for (const input of [
    { fallbackAlreadyAttempted: false, noGoReason: "captcha_or_challenge", primaryScanFrom: "eu_ie" },
    { fallbackAlreadyAttempted: false, noGoReason: "server_error_5xx", primaryScanFrom: "eu_ie" },
    { fallbackAlreadyAttempted: false, noGoReason: "access_denied_or_forbidden_page", primaryScanFrom: "eu_de" },
    { fallbackAlreadyAttempted: true, noGoReason: "access_denied_or_forbidden_page", primaryScanFrom: "eu_ie" }
  ]) {
    assert.equal(planAlternateRegionRecovery(input), null);
  }
});

test("recognizes a previously claimed fallback", () => {
  assert.equal(
    hasAlternateRegionRecoveryAttempt({ recovery: { alternateRegionAttempted: true } }),
    true
  );
  assert.equal(hasAlternateRegionRecoveryAttempt({ recovery: {} }), false);
  assert.equal(hasAlternateRegionRecoveryAttempt(null), false);
});
