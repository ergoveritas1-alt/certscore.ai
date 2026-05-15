import assert from "node:assert/strict";
import test from "node:test";
import { getFullScanQueueMetadata, getPreviewScanQueueMetadata } from "./scan-queue-priority";

const validLoadTestProvenance = {
  githubActor: "codex-ops",
  githubRunId: "prod-manifest-601-630-load-test-20260508-0025",
  githubSha: "manual",
  githubWorkflow: "production-load-test",
  source:
    "prod-manifest-601-630-load-test-20260508-0025;manifest_row=601;tranco_rank=601;tranco_list=tranco-3Q2VL;tranco_generated=2026-05-06;domain=example.invalid"
};

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

test("preview scans use the front-of-line scanner priority", () => {
  assert.deepEqual(getPreviewScanQueueMetadata(), {
    queueOrigin: "preview",
    queuePriority: 0
  });
});

test("full scans default to user priority when provenance is absent or untrusted", () => {
  const previous = process.env.FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS;
  process.env.FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS = "true";

  try {
    assert.deepEqual(getFullScanQueueMetadata({}), {
      queueOrigin: "user",
      queuePriority: 10
    });
    assert.deepEqual(
      getFullScanQueueMetadata({
        provenance: {
          ...validLoadTestProvenance,
          githubActor: "someone-else"
        }
      }),
      {
        queueOrigin: "user",
        queuePriority: 10
      }
    );
  } finally {
    restoreEnv("FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS", previous);
  }
});

test("scheduled scans use scheduled priority", () => {
  assert.deepEqual(getFullScanQueueMetadata({ scanType: "scheduled" }), {
    queueOrigin: "scheduled",
    queuePriority: 20
  });
});

test("trusted production load-test scans use the lowest scanner priority", () => {
  const previous = process.env.FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS;
  process.env.FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS = "true";

  try {
    assert.deepEqual(getFullScanQueueMetadata({ provenance: validLoadTestProvenance }), {
      queueOrigin: "production_load_test",
      queuePriority: 90
    });
  } finally {
    restoreEnv("FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS", previous);
  }
});
