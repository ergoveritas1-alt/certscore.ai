import type { LaunchOptions } from "playwright";

export function isAwsLambdaRuntime(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.AWS_LAMBDA_FUNCTION_NAME || env.AWS_LAMBDA_RUNTIME_API);
}

export function chromiumLaunchArgs(input: { env?: NodeJS.ProcessEnv } = {}) {
  const baseArgs = ["--no-sandbox", "--disable-dev-shm-usage"];

  if (!isAwsLambdaRuntime(input.env)) {
    return baseArgs;
  }

  return [
    ...baseArgs,
    "--disable-gpu",
    "--disable-setuid-sandbox",
    "--disable-software-rasterizer",
    "--no-zygote",
    "--single-process"
  ];
}

export function chromiumLaunchOptions(input: { headless: boolean; env?: NodeJS.ProcessEnv }): LaunchOptions {
  return {
    args: chromiumLaunchArgs({ env: input.env }),
    headless: input.headless
  };
}
