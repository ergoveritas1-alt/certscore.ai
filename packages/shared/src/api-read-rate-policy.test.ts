import assert from "node:assert/strict";
import test from "node:test";
import {
  API_READ_RATE_MAX_WINDOW_SECONDS,
  API_READ_RATE_POLICY,
  API_READ_RATE_POLICY_OPENAPI_EXTENSION,
  apiReadRateLimitGuidance,
  apiReadRateUnits,
  apiReadRateWindow
} from "./api-read-rate-policy";

test("publishes the canonical terminal burst and rolling-day limits", () => {
  assert.deepEqual(apiReadRateWindow("terminal", "burst"), {
    id: "burst",
    windowSeconds: 600,
    limits: { callerTarget: 120, target: 4_000, caller: 480 },
    mcpProviderLimit: 8_000
  });
  assert.deepEqual(apiReadRateWindow("terminal", "daily"), {
    id: "daily",
    windowSeconds: 86_400,
    limits: { callerTarget: 1_200 },
    mcpProviderLimit: 40_000
  });
  assert.equal(API_READ_RATE_MAX_WINDOW_SECONDS, 86_400);
});

test("provides canonical terminal and status 429 guidance", () => {
  const terminal = apiReadRateLimitGuidance("terminal", 73);
  assert.match(terminal.message, /Retry after 73 seconds/);
  assert.match(terminal.recommendedNextAction, /Do not poll terminal scan resources/);
  const status = apiReadRateLimitGuidance("status", 11);
  assert.match(status.message, /Scan status read limit exceeded/);
  assert.match(status.recommendedNextAction, /Stop polling when the scan reaches a terminal status/);
});

test("keeps status polling separate and heavy reads at four units", () => {
  assert.deepEqual(apiReadRateWindow("status", "burst").limits, {
    callerTarget: 120,
    target: 10_000,
    caller: 600
  });
  assert.equal(apiReadRateUnits("ordinary"), 1);
  for (const costClass of ["evidence", "full", "diagnostics", "export", "bundle"] as const) {
    assert.equal(apiReadRateUnits(costClass), 4);
  }
  assert.equal(API_READ_RATE_POLICY.version, "2026-08-14");
  assert.equal(API_READ_RATE_POLICY_OPENAPI_EXTENSION.policyVersion, API_READ_RATE_POLICY.version);
  assert.equal(API_READ_RATE_POLICY_OPENAPI_EXTENSION.profiles, API_READ_RATE_POLICY.profiles);
  assert.equal(API_READ_RATE_POLICY_OPENAPI_EXTENSION.throttledResponse.retryHeader, "Retry-After");
});
