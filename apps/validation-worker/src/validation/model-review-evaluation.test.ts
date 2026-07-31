import assert from "node:assert/strict";
import test from "node:test";
import type { PolicyModelReviewArtifact } from "@certscore/contracts";
import { evaluatePolicyReviewArtifacts } from "./model-review-evaluation";

const artifact = {
  status: "completed",
  rows: [
    { topic: "processing_purposes", status: "not_observed_with_sufficient_coverage" },
    { topic: "data_retention", status: "observed" },
    { topic: "international_transfers", status: "conflicting" }
  ]
} as PolicyModelReviewArtifact;

test("policy review evaluation reports precision, recall, disagreement, and uncertainty", () => {
  const metrics = evaluatePolicyReviewArtifacts([{
    artifact,
    baseline: {
      processing_purposes: "observed",
      data_retention: "observed",
      international_transfers: "observed"
    },
    expected: {
      processing_purposes: "not_observed_with_sufficient_coverage",
      data_retention: "observed",
      international_transfers: "conflicting"
    }
  }]);
  assert.equal(metrics.exactAgreementRate, 1);
  assert.equal(metrics.observedPrecision, 1);
  assert.equal(metrics.observedRecall, 1);
  assert.equal(metrics.falsePositiveCount, 0);
  assert.equal(metrics.falseNegativeCount, 0);
  assert.equal(metrics.baselineDisagreementCount, 2);
  assert.equal(metrics.conflictingRate, 1 / 3);
  assert.equal(metrics.byTopic.processing_purposes.exactAgreementRate, 1);
  assert.equal(metrics.byTopic.data_retention.observedPrecision, 1);
  assert.equal(metrics.byTopic.international_transfers.expectedNonObservedCount, 1);
});
