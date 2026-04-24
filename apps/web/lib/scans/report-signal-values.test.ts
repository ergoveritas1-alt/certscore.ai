import assert from "node:assert/strict";
import test from "node:test";
import {
  findMergedSignalValue,
  getSnapshotSignalValue,
  isSignalValuePopulated
} from "./report-signal-values";

test("findMergedSignalValue prefers selected population values", () => {
  assert.equal(
    findMergedSignalValue([
      {
        key: "privacyDoNotSell",
        value: "absent",
        selectedPopulation: { value: "present_link" }
      }
    ], "privacyDoNotSell"),
    "present_link"
  );
});

test("getSnapshotSignalValue derives fallback snapshot signal semantics", () => {
  assert.equal(
    getSnapshotSignalValue({
      consent_mechanism_type: "none",
      cookie_banner_present: false
    }, "privacy.consent_surface_missing"),
    true
  );
});

test("isSignalValuePopulated treats risk scores and absent strings consistently", () => {
  assert.equal(isSignalValuePopulated("consumer.risk_score", 0), true);
  assert.equal(isSignalValuePopulated("privacy.privacy_policy_present", "absent"), false);
});
