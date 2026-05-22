import assert from "node:assert/strict";
import test from "node:test";
import type { LoadTestQualityWarning } from "@website-signal-risk-scanner/shared";
import { shouldSendQualityWarningEmail } from "./load-test-quality-email-plan";

function warning(overrides: Partial<LoadTestQualityWarning> = {}): LoadTestQualityWarning {
  return {
    batchId: "prod-manifest-1-25-load-test-20260522-1300",
    code: "zero_finding_extreme",
    completionWindow: {
      completedCount: 25
    },
    egressProvider: "aws-default",
    egress_id: "aws-default",
    explanation: "extreme",
    generatedAt: "2026-05-22T20:00:00.000Z",
    metrics: {
      completedCount: 25,
      findingsPerCompleted: 0,
      pagesScanned: 25,
      zeroFindingRate: 0.84
    },
    severity: "critical",
    warningId: "prod-manifest-1-25-load-test-20260522-1300:aws-default:zero_finding_extreme",
    ...overrides
  };
}

test("sends critical zero-finding warning when not throttled", () => {
  const decision = shouldSendQualityWarningEmail({
    now: new Date("2026-05-22T20:00:00.000Z"),
    warning: warning()
  });

  assert.equal(decision.shouldSend, true);
  assert.equal(decision.throttleKey, "zero_finding_extreme:aws-default");
});

test("dedupes warning emails within throttle window", () => {
  const decision = shouldSendQualityWarningEmail({
    history: {
      sentAtByThrottleKey: {
        "zero_finding_extreme:aws-default": "2026-05-22T19:00:00.000Z"
      }
    },
    now: new Date("2026-05-22T20:00:00.000Z"),
    warning: warning()
  });

  assert.equal(decision.shouldSend, false);
  assert.equal(decision.reason, "suppressed_by_throttle");
});

test("does not send non-critical one-off warnings without sustained history", () => {
  const decision = shouldSendQualityWarningEmail({
    now: new Date("2026-05-22T20:00:00.000Z"),
    warning: warning({
      code: "quality_regression_vs_baseline",
      severity: "warn",
      warningId: "prod-manifest-1-25-load-test-20260522-1300:aws-default:quality_regression_vs_baseline"
    })
  });

  assert.equal(decision.shouldSend, false);
  assert.equal(decision.reason, "not_sustained_or_critical");
});
