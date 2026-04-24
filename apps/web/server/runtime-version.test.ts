import assert from "node:assert/strict";
import test from "node:test";
import { detectRuntimeTarget, getRuntimeVersionInfo } from "./runtime-version";

function env(overrides: Record<string, string>): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    ...overrides
  };
}

test("detectRuntimeTarget identifies Amplify runtime", () => {
  assert.equal(detectRuntimeTarget(env({ BUILD_RUNTIME_TARGET: "amplify" })), "amplify");
  assert.equal(detectRuntimeTarget(env({ AWS_APP_ID: "d123example" })), "amplify");
  assert.equal(detectRuntimeTarget(env({ AWS_BRANCH: "main" })), "amplify");
});

test("detectRuntimeTarget identifies App Runner runtime", () => {
  assert.equal(detectRuntimeTarget(env({ BUILD_RUNTIME_TARGET: "app-runner" })), "app-runner");
});

test("detectRuntimeTarget identifies ECS/Fargate runtime", () => {
  assert.equal(detectRuntimeTarget(env({ BUILD_RUNTIME_TARGET: "ecs-fargate" })), "ecs-fargate");
});
test("getRuntimeVersionInfo prefers baked ECS git sha when present", () => {
  const info = getRuntimeVersionInfo(env({
    BUILD_GIT_REF: "main",
    BUILD_GIT_SHA: "abc123",
    BUILD_IMAGE_TAG: "abc123",
    BUILD_RUNTIME_TARGET: "ecs-fargate",
    HOSTNAME: "certscore-web",
    NEXT_PUBLIC_APP_URL: "https://certscore.ai"
  }));

  assert.equal(info.runtimeTarget, "ecs-fargate");
  assert.equal(info.gitSha, "abc123");
  assert.equal(info.gitRef, "main");
  assert.equal(info.imageTag, "abc123");
  assert.equal(info.appUrl, "https://certscore.ai");
});

test("getRuntimeVersionInfo exposes Amplify metadata when present", () => {
  const info = getRuntimeVersionInfo(env({
    AWS_APP_ID: "d123example",
    AWS_BRANCH: "main",
    BUILD_RUNTIME_TARGET: "amplify",
    NEXT_PUBLIC_APP_URL: "https://certscore.ai"
  }));

  assert.equal(info.runtimeTarget, "amplify");
  assert.equal(info.amplifyAppId, "d123example");
  assert.equal(info.amplifyBranch, "main");
  assert.equal(info.appUrl, "https://certscore.ai");
});

test("getRuntimeVersionInfo exposes App Runner runtime target when configured", () => {
  const info = getRuntimeVersionInfo(env({
    BUILD_GIT_REF: "main",
    BUILD_GIT_SHA: "def456",
    BUILD_RUNTIME_TARGET: "app-runner",
    NEXT_PUBLIC_APP_URL: "https://certscore.ai"
  }));

  assert.equal(info.runtimeTarget, "app-runner");
  assert.equal(info.gitRef, "main");
  assert.equal(info.gitSha, "def456");
  assert.equal(info.appUrl, "https://certscore.ai");
});

test("getRuntimeVersionInfo exposes ECS/Fargate runtime target when configured", () => {
  const info = getRuntimeVersionInfo(env({
    BUILD_GIT_REF: "main",
    BUILD_GIT_SHA: "ghi789",
    BUILD_RUNTIME_TARGET: "ecs-fargate",
    NEXT_PUBLIC_APP_URL: "https://certscore.ai"
  }));

  assert.equal(info.runtimeTarget, "ecs-fargate");
  assert.equal(info.gitRef, "main");
  assert.equal(info.gitSha, "ghi789");
  assert.equal(info.appUrl, "https://certscore.ai");
});
