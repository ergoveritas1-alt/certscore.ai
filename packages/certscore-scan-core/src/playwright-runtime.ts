import type { LaunchOptions } from "playwright";

export function isAwsLambdaRuntime(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.AWS_LAMBDA_FUNCTION_NAME || env.AWS_LAMBDA_RUNTIME_API);
}

export function lambdaChromiumSingleProcessEnabled(env: NodeJS.ProcessEnv = process.env) {
  const value = env.CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_SINGLE_PROCESS?.trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "off";
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
  return {
    args: chromiumLaunchArgs({ env: input.env }),
    headless: input.headless
  };
}
