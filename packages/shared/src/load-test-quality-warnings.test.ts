import assert from "node:assert/strict";
import test from "node:test";
import {
  assertControlPlaneGate,
  evaluateLoadTestQualityWarnings
} from "./load-test-quality-warnings";

const generatedAt = "2026-05-22T20:00:00.000Z";

test("does not warn for 1246-1270 when it improves over the same-row baseline", () => {
  const warnings = evaluateLoadTestQualityWarnings({
    baseline: {
      blockerLabelRate: 24 / 25,
      completedCount: 25,
      findingsPerCompleted: 0.8,
      label: "historical-force-rescan-1246-1270",
      zeroFindingRate: 0.56
    },
    batchId: "prod-manifest-1246-1270-load-test-20260522-1308",
    egressProvider: "aws-default",
    egress_id: "aws-default",
    generatedAt,
    labelCounts: {
      authentication_wall: 9,
      bot_block_or_forbidden: 6,
      captcha_or_security_challenge: 8
    },
    metrics: {
      completedCount: 25,
      findingsPerCompleted: 1.44,
      pagesScanned: 51,
      zeroFindingRate: 0.44
    }
  });

  assert.deepEqual(warnings, []);
});

test("warns when zero findings increase and findings per completed drops versus baseline", () => {
  const warnings = evaluateLoadTestQualityWarnings({
    baseline: {
      completedCount: 25,
      findingsPerCompleted: 2.76,
      label: "phase1a-seed",
      zeroFindingRate: 0.2
    },
    batchId: "prod-manifest-1-25-load-test-20260522-1300",
    egress_id: "egress-a",
    generatedAt,
    metrics: {
      completedCount: 25,
      findingsPerCompleted: 1.2,
      pagesScanned: 45,
      zeroFindingRate: 0.48
    }
  });

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.code, "quality_regression_vs_baseline");
  assert.equal(warnings[0]?.severity, "warn");
});

test("emits critical warning for extreme zero-finding rate over at least 25 scans", () => {
  const warnings = evaluateLoadTestQualityWarnings({
    batchId: "prod-manifest-1-25-load-test-20260522-1300",
    egress_id: "egress-a",
    generatedAt,
    metrics: {
      completedCount: 25,
      findingsPerCompleted: 0.12,
      pagesScanned: 30,
      zeroFindingRate: 0.84
    }
  });

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.code, "zero_finding_extreme");
  assert.equal(warnings[0]?.severity, "critical");
});

test("does not evaluate windows below 25 completed scans", () => {
  const warnings = evaluateLoadTestQualityWarnings({
    batchId: "prod-manifest-1-24-load-test-20260522-1300",
    egress_id: "egress-a",
    generatedAt,
    metrics: {
      completedCount: 24,
      findingsPerCompleted: 0,
      pagesScanned: 24,
      zeroFindingRate: 1
    }
  });

  assert.deepEqual(warnings, []);
});

test("warns when blocker labels spike versus baseline", () => {
  const warnings = evaluateLoadTestQualityWarnings({
    baseline: {
      blockerLabelRate: 0.2,
      completedCount: 25,
      findingsPerCompleted: 2,
      zeroFindingRate: 0.2
    },
    batchId: "prod-manifest-1-25-load-test-20260522-1300",
    egress_id: "egress-a",
    generatedAt,
    labelCounts: {
      authentication_wall: 8,
      bot_block_or_forbidden: 4,
      captcha_or_security_challenge: 5
    },
    metrics: {
      completedCount: 25,
      findingsPerCompleted: 2,
      pagesScanned: 50,
      zeroFindingRate: 0.2
    }
  });

  assert.equal(warnings.some((warning) => warning.code === "access_blocker_label_spike"), true);
});

test("control-plane gates remain hard failures", () => {
  assert.throws(
    () =>
      assertControlPlaneGate({
        error: "queue metadata missing",
        gate: "db_queue_metadata_canary",
        ok: false
      }),
    /db_queue_metadata_canary failed/
  );
});
