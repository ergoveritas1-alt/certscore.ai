import assert from "node:assert/strict";
import test from "node:test";
import {
  chromiumExecutablePath,
  chromiumLaunchArgs,
  chromiumLaunchOptions,
  isAwsLambdaRuntime,
  lambdaChromiumSingleProcessEnabled
} from "./playwright-runtime";

test("detects AWS Lambda runtime from bounded environment keys", () => {
  assert.equal(isAwsLambdaRuntime({}), false);
  assert.equal(isAwsLambdaRuntime({ AWS_LAMBDA_FUNCTION_NAME: "certscore-v2-dag-local-lambda" }), true);
  assert.equal(isAwsLambdaRuntime({ AWS_LAMBDA_RUNTIME_API: "127.0.0.1:9001" }), true);
});

test("keeps local Chromium launch args minimal outside Lambda", () => {
  assert.deepEqual(chromiumLaunchArgs({ env: {} }), ["--no-sandbox", "--disable-dev-shm-usage"]);
});

test("adds serverless Chromium launch args inside Lambda", () => {
  const args = chromiumLaunchArgs({ env: { AWS_LAMBDA_FUNCTION_NAME: "certscore-v2-dag-local-lambda" } });

  assert.ok(args.includes("--no-sandbox"));
  assert.ok(args.includes("--disable-dev-shm-usage"));
  assert.ok(args.includes("--disable-gpu"));
  assert.ok(args.includes("--disable-setuid-sandbox"));
  assert.ok(args.includes("--no-zygote"));
  assert.ok(args.includes("--single-process"));
});

test("can disable single-process Chromium mode inside Lambda for quality A/B runs", () => {
  const env = {
    AWS_LAMBDA_FUNCTION_NAME: "certscore-v2-dag-local-lambda",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_SINGLE_PROCESS: "false"
  };
  const args = chromiumLaunchArgs({ env });

  assert.equal(lambdaChromiumSingleProcessEnabled(env), false);
  assert.ok(args.includes("--no-zygote"));
  assert.equal(args.includes("--single-process"), false);
});

test("builds Chromium launch options without changing headless intent", () => {
  assert.deepEqual(chromiumLaunchOptions({ env: {}, headless: true }), {
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    headless: true
  });
});

test("can launch with an explicit Chromium executable path for slim runtime images", () => {
  const env = { CERTSCORE_CHROMIUM_EXECUTABLE_PATH: " /usr/bin/chromium " };

  assert.equal(chromiumExecutablePath(env), "/usr/bin/chromium");
  assert.deepEqual(chromiumLaunchOptions({ env, headless: true }), {
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath: "/usr/bin/chromium",
    headless: true
  });
});
