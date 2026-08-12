import assert from "node:assert/strict";
import test from "node:test";
import {
  createReportSignalValueIndexes,
  findMergedSignalValue,
  getReportSignalValue,
  getSnapshotSignalValue,
  isSignalValuePopulated
} from "./report-signal-values";

test("report signal indexes preserve first-row and selected-population semantics", () => {
  const indexes = createReportSignalValueIndexes({
    mergedSignals: [
      { key: "privacy.example", value: "first", selectedPopulation: { value: "selected" } },
      { key: "privacy.example", value: "second" }
    ],
    signals: [
      { key: "privacy.persisted", value: "first" },
      { key: "privacy.persisted", value: "second" }
    ]
  });

  assert.equal(indexes.mergedSignalValues.get("privacy.example"), "selected");
  assert.equal(indexes.persistedSignalValues.get("privacy.persisted"), "first");
  assert.equal(
    getReportSignalValue({
      indexes,
      mergedSignals: [],
      policyEnrichment: [],
      runtimeArtifacts: null,
      signals: [],
      snapshot: null,
      signal: {
        id: "privacy.persisted",
        key: "privacy.persisted",
        label: "Persisted",
        overlayEvidenceCategoryIds: [],
        primaryEvidenceCategoryId: "data_handling_disclosures",
        secondaryEvidenceCategoryIds: [],
        source: "document_semantic_signal"
      }
    }),
    "first"
  );
});

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
