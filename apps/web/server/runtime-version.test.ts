import assert from "node:assert/strict";
import test from "node:test";
import { detectRuntimeTarget, getRuntimeVersionInfo } from "./runtime-version";

test("detectRuntimeTarget identifies Vercel runtime", () => {
  assert.equal(detectRuntimeTarget({ VERCEL: "1" } as NodeJS.ProcessEnv), "vercel");
  assert.equal(detectRuntimeTarget({ VERCEL_ENV: "production" } as NodeJS.ProcessEnv), "vercel");
});

test("detectRuntimeTarget identifies VM runtime", () => {
  assert.equal(detectRuntimeTarget({ BUILD_RUNTIME_TARGET: "gcp-vm" } as NodeJS.ProcessEnv), "gcp-vm");
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
