import assert from "node:assert/strict";
import test from "node:test";
import { assessGitSha, assessPrimaryRuntime, assessSecondaryRuntime } from "./live-deployment-audit";

test("assessSecondaryRuntime warns on mismatch instead of failing", () => {
  const result = assessSecondaryRuntime({
    expectedRuntimeTarget: "app-runner",
    label: "Secondary host",
    report: {
      headers: {},
      payload: { runtimeTarget: "ecs-fargate" }
    }
  });

  assert.equal(result.messages.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /expected app-runner/);
});

test("assessGitSha fails when secondary host has expected sha and primary lags", () => {
  const result = assessGitSha({
    expectedLiveGitSha: "expected-sha",
    liveGitSha: "old-sha",
    secondaryGitSha: "expected-sha",
    liveBaseUrl: "https://certscore.ai",
    liveLabel: "Primary host",
    secondaryLabel: "Secondary host"
  });

  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /still on old-sha/);
});
