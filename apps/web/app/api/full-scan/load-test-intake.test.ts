import assert from "node:assert/strict";
import test from "node:test";
import { shouldBypassDnsValidationForProductionLoadTest } from "./load-test-intake";

const validProvenance = {
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

test("production load-test DNS bypass is disabled unless explicitly enabled", () => {
  const previous = process.env.FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS;
  delete process.env.FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS;

  try {
    assert.equal(shouldBypassDnsValidationForProductionLoadTest(validProvenance), false);
  } finally {
    restoreEnv("FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS", previous);
  }
});

test("production load-test DNS bypass requires trusted manifest provenance", () => {
  const previous = process.env.FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS;
  process.env.FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS = "true";

  try {
    assert.equal(shouldBypassDnsValidationForProductionLoadTest(validProvenance), true);
    assert.equal(
      shouldBypassDnsValidationForProductionLoadTest({
        ...validProvenance,
        githubWorkflow: "pull_request"
      }),
      false
    );
    assert.equal(
      shouldBypassDnsValidationForProductionLoadTest({
        ...validProvenance,
        source: "prod-manifest-601-630-load-test-20260508-0025;manifest_row=601;domain=example.invalid"
      }),
      false
    );
  } finally {
    restoreEnv("FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS", previous);
  }
});
