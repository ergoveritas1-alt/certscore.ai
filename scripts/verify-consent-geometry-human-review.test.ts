import assert from "node:assert/strict";
import test from "node:test";
import {
  computeConsentHumanReviewMetrics,
  type ConsentHumanReviewComparisonRow,
} from "./verify-consent-geometry-human-review";

function row(
  expected: ConsentHumanReviewComparisonRow["expected"],
  actual: ConsentHumanReviewComparisonRow["actual"],
  eligible = true,
): ConsentHumanReviewComparisonRow {
  const disagreements = (["accept", "reject", "options"] as const)
    .filter((field) => expected[field] !== actual[field]);
  return {
    scanId: "scan-1",
    website: "https://example.com",
    expected,
    actual,
    disagreements,
    eligible,
    eligibilityReasons: eligible ? [] : ["retained_proof_screenshot_missing"],
    proofScreenshot: eligible ? "/tmp/proof.png" : null,
    proofScreenshotSha256: eligible ? "a".repeat(64) : null,
    assessmentStatus: "complete",
    documentIdentityStatus: "matched",
    surfaceStatus: "observed_actionable",
    limitationCodes: [],
    error: null,
  };
}

test("human review metrics keep unknown distinct and expose false positive claims", () => {
  const metrics = computeConsentHumanReviewMetrics([
    row(
      { accept: "observed", reject: "not_observed", options: "observed" },
      { accept: "observed", reject: "observed", options: "unknown" },
    ),
    row(
      { accept: "unknown", reject: "unknown", options: "unknown" },
      { accept: "observed", reject: "unknown", options: "unknown" },
    ),
  ]);

  assert.equal(metrics.eligibleRows, 2);
  assert.equal(metrics.exactAroAgreement, 0);
  assert.equal(metrics.perField.accept.exactAgreement, 0.5);
  assert.equal(metrics.perField.accept.observedRecall, 1);
  assert.equal(metrics.perField.reject.falsePositiveControlClaimRate, 1);
  assert.equal(metrics.perField.options.observedRecall, 0);
});

test("ineligible evidence rows do not enter calibration denominators", () => {
  const metrics = computeConsentHumanReviewMetrics([
    row(
      { accept: "observed", reject: "observed", options: "observed" },
      { accept: "not_observed", reject: "not_observed", options: "not_observed" },
      false,
    ),
  ]);

  assert.equal(metrics.totalRows, 1);
  assert.equal(metrics.eligibleRows, 0);
  assert.equal(metrics.exactAroAgreement, null);
  assert.equal(metrics.perField.accept.exactAgreement, null);
});
