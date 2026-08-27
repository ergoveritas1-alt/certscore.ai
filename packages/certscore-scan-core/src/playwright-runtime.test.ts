import assert from "node:assert/strict";
import test from "node:test";
import {
  US_WEST_LAMBDA_CHROMIUM_CONTEXT_ENV,
  chromiumContextOptions,
  chromiumExecutablePath,
  chromiumLaunchArgs,
  chromiumLaunchOptions,
  chromiumProxyOptions,
  isAwsLambdaRuntime,
  isLocalHeadedFallbackEnabled,
  lambdaChromiumSingleProcessEnabled
} from "./playwright-runtime";

test("us-west Lambda browser context defaults are reusable by localhost calibration", () => {
  assert.deepEqual(chromiumContextOptions(US_WEST_LAMBDA_CHROMIUM_CONTEXT_ENV), {
    ignoreHTTPSErrors: true,
    viewport: { width: 1366, height: 900 },
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  });
});

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

test("local headed fallback can be explicitly enabled or disabled", () => {
  assert.equal(isLocalHeadedFallbackEnabled({ CERTSCORE_V2_HEADED_FALLBACK: "1" }), true);
  assert.equal(isLocalHeadedFallbackEnabled({ CERTSCORE_V2_HEADED_FALLBACK: "false" }), false);
});

test("builds default Chromium context options for scanner captures", () => {
  assert.deepEqual(chromiumContextOptions({}), {
    ignoreHTTPSErrors: true,
    viewport: { width: 1366, height: 900 }
  });
});

test("can configure Chromium context identity for regional Lambda parity runs", () => {
  const env = {
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE: " en-IE,en;q=0.9 ",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE: " en-IE ",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID: " Europe/Dublin ",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_USER_AGENT: " Mozilla/5.0 scanner "
  };

  assert.deepEqual(chromiumContextOptions(env), {
    extraHTTPHeaders: { "Accept-Language": "en-IE,en;q=0.9" },
    ignoreHTTPSErrors: true,
    locale: "en-IE",
    timezoneId: "Europe/Dublin",
    userAgent: "Mozilla/5.0 scanner",
    viewport: { width: 1366, height: 900 }
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

test("can launch Chromium through a configured Lambda proxy", () => {
  const env = {
    CERTSCORE_CHROMIUM_EXECUTABLE_PATH: " /usr/bin/chromium ",
    CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER: " http://proxy.example:8080 ",
    CERTSCORE_V2_DAG_LAMBDA_PROXY_USERNAME: " scanner ",
    CERTSCORE_V2_DAG_LAMBDA_PROXY_PASSWORD: " secret "
  };

  assert.deepEqual(chromiumProxyOptions(env), {
    server: "http://proxy.example:8080",
    username: "scanner",
    password: "secret"
  });
  assert.deepEqual(chromiumLaunchOptions({ env, headless: true }), {
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath: "/usr/bin/chromium",
    proxy: {
      server: "http://proxy.example:8080",
      username: "scanner",
      password: "secret"
    },
    headless: true
  });
});
