import assert from "node:assert/strict";
import test from "node:test";
import { detectRuntimeTarget, getRuntimeVersionInfo } from "./runtime-version";

test("detectRuntimeTarget identifies Vercel runtime", () => {
  assert.equal(detectRuntimeTarget({ VERCEL: "1" } as NodeJS.ProcessEnv), "vercel");
  assert.equal(detectRuntimeTarget({ VERCEL_ENV: "production" } as NodeJS.ProcessEnv), "vercel");
});

test("detectRuntimeTarget identifies Amplify runtime", () => {
  assert.equal(detectRuntimeTarget({ BUILD_RUNTIME_TARGET: "amplify" } as NodeJS.ProcessEnv), "amplify");
  assert.equal(detectRuntimeTarget({ AWS_APP_ID: "d123example" } as NodeJS.ProcessEnv), "amplify");
  assert.equal(detectRuntimeTarget({ AWS_BRANCH: "main" } as NodeJS.ProcessEnv), "amplify");
});

test("detectRuntimeTarget identifies VM runtime", () => {
  assert.equal(detectRuntimeTarget({ BUILD_RUNTIME_TARGET: "gcp-vm" } as NodeJS.ProcessEnv), "gcp-vm");
});

test("detectRuntimeTarget identifies App Runner runtime", () => {
  assert.equal(detectRuntimeTarget({ BUILD_RUNTIME_TARGET: "app-runner" } as NodeJS.ProcessEnv), "app-runner");
});

test("detectRuntimeTarget identifies ECS/Fargate runtime", () => {
  assert.equal(detectRuntimeTarget({ BUILD_RUNTIME_TARGET: "ecs-fargate" } as NodeJS.ProcessEnv), "ecs-fargate");
});

test("getRuntimeVersionInfo prefers baked VM git sha when present", () => {
  const info = getRuntimeVersionInfo({
    BUILD_GIT_REF: "main",
    BUILD_GIT_SHA: "abc123",
    BUILD_IMAGE_TAG: "abc123",
    BUILD_RUNTIME_TARGET: "gcp-vm",
    HOSTNAME: "certscore-web-prod",
    NEXT_PUBLIC_APP_URL: "https://certscore.ai",
    VERCEL_GIT_COMMIT_SHA: "vercel-sha"
  } as NodeJS.ProcessEnv);

  assert.equal(info.runtimeTarget, "gcp-vm");
  assert.equal(info.gitSha, "abc123");
  assert.equal(info.gitRef, "main");
  assert.equal(info.imageTag, "abc123");
  assert.equal(info.appUrl, "https://certscore.ai");
});

test("getRuntimeVersionInfo exposes Amplify metadata when present", () => {
  const info = getRuntimeVersionInfo({
    AWS_APP_ID: "d123example",
    AWS_BRANCH: "main",
    BUILD_RUNTIME_TARGET: "amplify",
    NEXT_PUBLIC_APP_URL: "https://consentcheck.site"
  } as NodeJS.ProcessEnv);

  assert.equal(info.runtimeTarget, "amplify");
  assert.equal(info.amplifyAppId, "d123example");
  assert.equal(info.amplifyBranch, "main");
  assert.equal(info.appUrl, "https://consentcheck.site");
});

test("getRuntimeVersionInfo exposes App Runner runtime target when configured", () => {
  const info = getRuntimeVersionInfo({
    BUILD_GIT_REF: "main",
    BUILD_GIT_SHA: "def456",
    BUILD_RUNTIME_TARGET: "app-runner",
    NEXT_PUBLIC_APP_URL: "https://certscore.ai"
  } as NodeJS.ProcessEnv);

  assert.equal(info.runtimeTarget, "app-runner");
  assert.equal(info.gitRef, "main");
  assert.equal(info.gitSha, "def456");
  assert.equal(info.appUrl, "https://certscore.ai");
});

test("getRuntimeVersionInfo exposes ECS/Fargate runtime target when configured", () => {
  const info = getRuntimeVersionInfo({
    BUILD_GIT_REF: "main",
    BUILD_GIT_SHA: "ghi789",
    BUILD_RUNTIME_TARGET: "ecs-fargate",
    NEXT_PUBLIC_APP_URL: "https://certscore.ai"
  } as NodeJS.ProcessEnv);

  assert.equal(info.runtimeTarget, "ecs-fargate");
  assert.equal(info.gitRef, "main");
  assert.equal(info.gitSha, "ghi789");
  assert.equal(info.appUrl, "https://certscore.ai");
});
