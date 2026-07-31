import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateLegalFrameworkValidity,
  hasStaleLegalFrameworkReference,
} from "./legal-framework-validity";

const OXFAM_PRIVACY_SHIELD_SENTENCE =
  "Our payment provider is certified under the EU-US Privacy Shield.";

test("evaluates Privacy Shield relative to the scan date", () => {
  const beforeInvalidation = evaluateLegalFrameworkValidity(
    OXFAM_PRIVACY_SHIELD_SENTENCE,
    "2020-07-15T12:00:00.000Z",
  );
  const afterInvalidation = evaluateLegalFrameworkValidity(
    OXFAM_PRIVACY_SHIELD_SENTENCE,
    "2020-07-16T12:00:00.000Z",
  );

  assert.equal(beforeInvalidation[0]?.statusAtScan, "current");
  assert.equal(afterInvalidation[0]?.statusAtScan, "invalidated");
  assert.equal(hasStaleLegalFrameworkReference(beforeInvalidation), false);
  assert.equal(hasStaleLegalFrameworkReference(afterInvalidation), true);
});

test("recognizes the EU-US Data Privacy Framework without treating it as stale", () => {
  const matches = evaluateLegalFrameworkValidity(
    "We participate in the EU-US Data Privacy Framework.",
    "2026-07-25T12:00:00.000Z",
  );

  assert.equal(matches[0]?.canonicalId, "eu_us_data_privacy_framework");
  assert.equal(matches[0]?.statusAtScan, "current");
  assert.equal(hasStaleLegalFrameworkReference(matches), false);
});

test("marks framework references made before their effective date for review", () => {
  const matches = evaluateLegalFrameworkValidity(
    "We participate in the EU-US Data Privacy Framework.",
    "2023-07-09T12:00:00.000Z",
  );

  assert.equal(matches[0]?.statusAtScan, "not_yet_effective");
  assert.equal(hasStaleLegalFrameworkReference(matches), true);
});
