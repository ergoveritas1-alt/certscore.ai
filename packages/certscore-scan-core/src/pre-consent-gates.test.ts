import assert from "node:assert/strict";
import test from "node:test";
import { hasConsentGateReachedHardCap } from "./scanners/pre-consent-runtime-scanner.js";

test("adaptive consent gates enforce the 25-second navigation-relative hard cap", () => {
  assert.equal(hasConsentGateReachedHardCap(-1), false);
  assert.equal(hasConsentGateReachedHardCap(24_999), false);
  assert.equal(hasConsentGateReachedHardCap(25_000), true);
  assert.equal(hasConsentGateReachedHardCap(31_050), true);
});
