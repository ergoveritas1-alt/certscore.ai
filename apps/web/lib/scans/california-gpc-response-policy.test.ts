import assert from "node:assert/strict";
import test from "node:test";
import type { GpcResponseAssessment } from "@certscore/contracts";
import {
  CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS,
  deriveCaliforniaGpcResponsePolicy,
} from "./california-gpc-response-policy";

function assessment(input: {
  advertisingBaselineOnly?: string[];
  advertisingShared?: string[];
  status?: GpcResponseAssessment["status"];
}): GpcResponseAssessment {
  const status = input.status ?? "no_observable_response";
  const delta = {
    baselineCount: 0,
    gpcCount: 0,
    countDelta: 0,
    baselineOnly: [] as string[],
    gpcOnly: [] as string[],
    shared: [] as string[],
  };
  return {
    contractVersion: "certscore.gpc-response-assessment.v1",
    generatedAt: "2026-09-02T12:00:00.000Z",
    status,
    findingTitle: status === "no_observable_response" ? "No observable GPC response" : "GPC response",
    scoreEffect: "none",
    legalInterpretation: "not_assessed",
    comparison: {
      comparable: status !== "indeterminate",
      protocol: "passive_baseline_with_sec_gpc",
      baselineArtifact: {
        lane: "runtime_evidence",
        sha256: "a".repeat(64),
        sizeBytes: 100,
        uri: "s3://evidence/baseline.json",
      },
      gpcArtifact: {
        lane: "gpc_observation",
        sha256: "b".repeat(64),
        sizeBytes: 100,
        uri: "s3://evidence/gpc.json",
      },
      enabledProof: {
        secGpcHeaderValue: "1",
        requestsWithSecGpc: status === "indeterminate" ? 0 : 2,
        requestEventIds: status === "indeterminate" ? [] : ["gpc-request-1"],
        navigatorGlobalPrivacyControl: true,
      },
      deltas: {
        cookies: delta,
        trackers: delta,
        advertisingOrMeasurementActivity: {
          ...delta,
          baselineCount: (input.advertisingBaselineOnly?.length ?? 0) + (input.advertisingShared?.length ?? 0),
          gpcCount: input.advertisingShared?.length ?? 0,
          countDelta: -(input.advertisingBaselineOnly?.length ?? 0),
          baselineOnly: input.advertisingBaselineOnly ?? [],
          shared: input.advertisingShared ?? [],
        },
        consentOrCmpBehavior: delta,
      },
      evidenceRefs: ["gpc-request-1"],
      limitationKeys: status === "indeterminate" ? ["sec_gpc_header_not_retained"] : [],
    },
  };
}

test("California GPC policy deducts exactly fifteen points when qualifying activity is not suppressed", () => {
  const result = deriveCaliforniaGpcResponsePolicy(assessment({
    advertisingShared: ["Example Ads|pixel|advertising", "Example Marketing|tag|marketing"],
  }));

  assert.equal(result.assessmentStatus, "gap_observed");
  assert.equal(result.deductionPoints, CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS);
  assert.equal(result.scoreEffect, "deduction");
  assert.equal(result.reasonCode, "comparable_gpc_no_qualifying_suppression");
});

test("California GPC policy stays neutral when qualifying activity is suppressed", () => {
  const result = deriveCaliforniaGpcResponsePolicy(assessment({
    advertisingBaselineOnly: ["Example Ads|pixel|advertising"],
    status: "responsive",
  }));

  assert.equal(result.assessmentStatus, "checked");
  assert.equal(result.deductionPoints, 0);
  assert.equal(result.scoreEffect, "none");
});

test("California GPC policy does not score analytics-only or indeterminate comparisons", () => {
  const analyticsOnly = deriveCaliforniaGpcResponsePolicy(assessment({
    advertisingShared: ["Example Analytics|tag|analytics"],
  }));
  const indeterminate = deriveCaliforniaGpcResponsePolicy(assessment({ status: "indeterminate" }));

  assert.equal(analyticsOnly.assessmentStatus, "not_applicable");
  assert.equal(analyticsOnly.deductionPoints, 0);
  assert.equal(indeterminate.assessmentStatus, "needs_evidence");
  assert.equal(indeterminate.deductionPoints, 0);
});

test("California GPC policy keeps partial suppression score-neutral for review", () => {
  const result = deriveCaliforniaGpcResponsePolicy(assessment({
    advertisingBaselineOnly: ["Suppressed Ads|pixel|advertising"],
    advertisingShared: ["Persistent Ads|pixel|advertising"],
    status: "responsive",
  }));

  assert.equal(result.assessmentStatus, "review_signal");
  assert.equal(result.deductionPoints, 0);
  assert.equal(result.scoreEffect, "none");
});
