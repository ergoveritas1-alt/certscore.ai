import assert from "node:assert/strict";
import test from "node:test";
import {
  assertControlPlaneGate,
  evaluateLoadTestQualityWarnings
} from "./load-test-quality-warnings";

const generatedAt = "2026-05-22T20:00:00.000Z";

function warningCodes(input: Parameters<typeof evaluateLoadTestQualityWarnings>[0]) {
  return evaluateLoadTestQualityWarnings({
    generatedAt,
    ...input
  }).map((warning) => warning.code);
}

test("does not warn for 7001-7025 without a baseline", () => {
  const warnings = evaluateLoadTestQualityWarnings({
    batchId: "prod-manifest-7001-7025-load-test-20260522-1204",
    egressProvider: "aws-default",
    egress_id: "aws-default",
    generatedAt,
    labelCounts: {
      authentication_wall: 7,
      bot_block_or_forbidden: 5,
      captcha_or_security_challenge: 10,
      early_loss: 1,
      scanner_runtime_interruption: 25
    },
    metrics: {
      completedCount: 25,
      findingsPerCompleted: 2.76,
      pagesScanned: 39,
      zeroFindingRate: 0.2
    }
  });

  assert.deepEqual(warnings, []);
});

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

test("does not warn for 1206-1230 when it is near same-row historical range", () => {
  const warnings = evaluateLoadTestQualityWarnings({
    baseline: {
      completedCount: 25,
      findingsPerCompleted: 3.05,
      label: "historical-force-rescan-1206-1230",
      pagesScanned: 44,
      tier: "same_row",
      zeroFindingRate: 0.455
    },
    batchId: "prod-manifest-1206-1230-load-test-20260522-2113",
    egressProvider: "aws-default",
    egress_id: "aws-default",
    generatedAt,
    metrics: {
      completedCount: 25,
      findingsPerCompleted: 2.6,
      pagesScanned: 48,
      zeroFindingRate: 0.48
    }
  });

  assert.deepEqual(warnings, []);
});

test("does not warn for 1231-1255 despite 64 percent zero-finding when historically in-family", () => {
  const warnings = evaluateLoadTestQualityWarnings({
    baseline: {
      completedCount: 23,
      findingsPerCompleted: 1.13,
      label: "historical-force-rescan-1231-1255",
      pagesScanned: 48,
      tier: "same_row",
      zeroFindingRate: 0.652
    },
    batchId: "prod-manifest-1231-1255-load-test-20260522-1435",
    egressProvider: "aws-default",
    egress_id: "aws-default",
    generatedAt,
    labelCounts: {
      authentication_wall: 11,
      bot_block_or_forbidden: 7,
      captcha_or_security_challenge: 10,
      early_loss: 4,
      robots_or_policy_block: 1,
      timeout_or_navigation_failure: 1
    },
    metrics: {
      completedCount: 25,
      findingsPerCompleted: 1.28,
      pagesScanned: 50,
      zeroFindingRate: 0.64
    }
  });

  assert.deepEqual(warnings, []);
});

test("does not warn for no-baseline 64 percent zero-finding over 25 scans", () => {
  const warnings = evaluateLoadTestQualityWarnings({
    batchId: "prod-manifest-1231-1255-load-test-20260522-1435",
    egressProvider: "aws-default",
    egress_id: "aws-default",
    generatedAt,
    labelCounts: {
      early_loss: 4
    },
    metrics: {
      completedCount: 25,
      findingsPerCompleted: 1.28,
      pagesScanned: 50,
      zeroFindingRate: 0.64
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

  assert.equal(warnings.some((warning) => warning.code === "zero_finding_extreme"), true);
  assert.equal(warnings.find((warning) => warning.code === "zero_finding_extreme")?.severity, "critical");
});

test("warns for same-egress rolling regression", () => {
  const codes = warningCodes({
    baseline: {
      completedCount: 75,
      findingsPerCompleted: 2.4,
      label: "rolling:aws-default:last-3-windows",
      pagesScanned: 150,
      tier: "rolling",
      zeroFindingRate: 0.28
    },
    batchId: "prod-manifest-1-25-load-test-20260522-1300",
    egress_id: "aws-default",
    metrics: {
      completedCount: 25,
      findingsPerCompleted: 1.3,
      pagesScanned: 48,
      zeroFindingRate: 0.52
    }
  });

  assert.equal(codes.includes("quality_regression_vs_baseline"), true);
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

test("warns when blocker labels spike versus baseline and findings drop", () => {
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
      findingsPerCompleted: 1.2,
      pagesScanned: 50,
      zeroFindingRate: 0.2
    }
  });

  assert.equal(warnings.some((warning) => warning.code === "access_blocker_label_spike"), true);
});

test("warns for batch peer egress underperformance only when multiple egresses exist", () => {
  const withoutPeers = evaluateLoadTestQualityWarnings({
    batchId: "prod-manifest-1-50-load-test-20260522-1300",
    egress_id: "egress-a",
    generatedAt,
    metrics: {
      completedCount: 25,
      findingsPerCompleted: 1.1,
      pagesScanned: 50,
      zeroFindingRate: 0.55
    }
  });
  assert.equal(withoutPeers.some((warning) => warning.code === "egress_underperforms_peer"), false);

  const withPeers = evaluateLoadTestQualityWarnings({
    batchId: "prod-manifest-1-50-load-test-20260522-1300",
    egress_id: "egress-a",
    generatedAt,
    metrics: {
      completedCount: 25,
      findingsPerCompleted: 1.1,
      pagesScanned: 50,
      zeroFindingRate: 0.55
    },
    peerWindows: [
      {
        egress_id: "egress-b",
        metrics: {
          completedCount: 25,
          findingsPerCompleted: 2.4,
          pagesScanned: 52,
          zeroFindingRate: 0.3
        }
      },
      {
        egress_id: "egress-c",
        metrics: {
          completedCount: 25,
          findingsPerCompleted: 2.2,
          pagesScanned: 48,
          zeroFindingRate: 0.28
        }
      }
    ]
  });

  assert.equal(withPeers.some((warning) => warning.code === "egress_underperforms_peer"), true);
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
