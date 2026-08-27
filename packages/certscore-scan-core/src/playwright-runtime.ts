import type { BrowserContextOptions, LaunchOptions } from "playwright";

const DEFAULT_VIEWPORT = { width: 1366, height: 900 } as const;

export const US_WEST_LAMBDA_CHROMIUM_CONTEXT_ENV = Object.freeze({
  CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE: "en-US,en;q=0.9",
  CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE: "en-US",
  CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID: "America/Los_Angeles",
  CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_USER_AGENT:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
} as const);

export function isAwsLambdaRuntime(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.AWS_LAMBDA_FUNCTION_NAME || env.AWS_LAMBDA_RUNTIME_API);
}

export function lambdaChromiumSingleProcessEnabled(env: NodeJS.ProcessEnv = process.env) {
  const value = env.CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_SINGLE_PROCESS?.trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "off";
}

export function chromiumExecutablePath(env: NodeJS.ProcessEnv = process.env) {
  return env.CERTSCORE_CHROMIUM_EXECUTABLE_PATH?.trim() || undefined;
}

export function chromiumProxyOptions(env: NodeJS.ProcessEnv = process.env): LaunchOptions["proxy"] | undefined {
  const proxyEnabled = env.SCAN_PROXY_ENABLED?.trim().toLowerCase();
  if (proxyEnabled === "false" || proxyEnabled === "0" || proxyEnabled === "off") {
    return undefined;
  }

  const server = env.CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER?.trim() ||
    env.SCAN_PROXY_SERVER?.trim() ||
    env.CERTSCORE_CHROMIUM_PROXY_SERVER?.trim();
  if (!server) {
    return undefined;
  }

  const username = env.CERTSCORE_V2_DAG_LAMBDA_PROXY_USERNAME?.trim() ||
    env.CERTSCORE_CHROMIUM_PROXY_USERNAME?.trim();
  const password = env.CERTSCORE_V2_DAG_LAMBDA_PROXY_PASSWORD?.trim() ||
    env.CERTSCORE_CHROMIUM_PROXY_PASSWORD?.trim();

  return {
    server,
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
  };
}

export function chromiumContextOptions(env: NodeJS.ProcessEnv = process.env): BrowserContextOptions {
  const userAgent = firstTrimmedEnv(env, [
    "CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_USER_AGENT",
    "CERTSCORE_CHROMIUM_USER_AGENT",
  ]);
  const locale = firstTrimmedEnv(env, [
    "CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE",
    "CERTSCORE_CHROMIUM_LOCALE",
  ]);
  const timezoneId = firstTrimmedEnv(env, [
    "CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID",
    "CERTSCORE_CHROMIUM_TIMEZONE_ID",
  ]);
  const acceptLanguage = firstTrimmedEnv(env, [
    "CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE",
    "CERTSCORE_CHROMIUM_ACCEPT_LANGUAGE",
  ]);

  return {
    ignoreHTTPSErrors: true,
    viewport: DEFAULT_VIEWPORT,
    ...(userAgent ? { userAgent } : {}),
    ...(locale ? { locale } : {}),
    ...(timezoneId ? { timezoneId } : {}),
    ...(acceptLanguage ? { extraHTTPHeaders: { "Accept-Language": acceptLanguage } } : {}),
  };
}

function firstTrimmedEnv(env: NodeJS.ProcessEnv, keys: string[]) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function chromiumLaunchArgs(input: { env?: NodeJS.ProcessEnv } = {}) {
  const baseArgs = ["--no-sandbox", "--disable-dev-shm-usage"];
  const env = input.env;

  if (!isAwsLambdaRuntime(env)) {
    return baseArgs;
  }

  const args = [
    ...baseArgs,
    "--disable-gpu",
    "--disable-setuid-sandbox",
    "--disable-software-rasterizer",
    "--no-zygote"
  ];

  if (lambdaChromiumSingleProcessEnabled(env)) {
    args.push("--single-process");
  }

  return args;
}

export function chromiumLaunchOptions(input: { headless: boolean; env?: NodeJS.ProcessEnv }): LaunchOptions {
  const executablePath = chromiumExecutablePath(input.env);
  const proxy = chromiumProxyOptions(input.env);

  return {
    args: chromiumLaunchArgs({ env: input.env }),
    ...(executablePath ? { executablePath } : {}),
    ...(proxy ? { proxy } : {}),
    headless: input.headless
  };
}

export function isLocalHeadedFallbackEnabled(env: NodeJS.ProcessEnv = process.env) {
  const explicit = env.CERTSCORE_V2_HEADED_FALLBACK?.trim();
  if (explicit === "0" || explicit === "false") return false;
  if (explicit === "1" || explicit === "true") return true;
  return env.NODE_ENV !== "production" && process.platform === "darwin" && !env.CI;
}
