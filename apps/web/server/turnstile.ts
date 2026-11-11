import "server-only";

export class TurnstileError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export function getTurnstileConfig(env: Record<string, string | undefined> = process.env) {
  const siteKey = env.CERTSCORE_BF26_TURNSTILE_SITE_KEY?.trim();
  const secret = env.CERTSCORE_BF26_TURNSTILE_SECRET_KEY?.trim();
  if (!siteKey && !secret) return null;
  if (!siteKey || !secret) throw new Error("Both Turnstile keys are required.");
  const hostname = new URL(env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").hostname;
  return { siteKey, secret, hostname };
}

export async function verifyTurnstile(
  config: NonNullable<ReturnType<typeof getTurnstileConfig>>,
  action: string,
  token: unknown,
  requestId: unknown,
  verify = fetch
) {
  const retryMessage = "Please complete the security check and submit again.";
  if (typeof token !== "string" || !token.trim() || token.length > 2048 ||
      typeof requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(requestId)) {
    throw new TurnstileError(retryMessage);
  }

  let result: {
    success?: boolean;
    action?: string;
    hostname?: string;
    cdata?: string;
    "error-codes"?: string[];
  } | null;
  try {
    const response = await verify("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: config.secret, response: token }),
      redirect: "error",
      signal: AbortSignal.timeout(3000)
    });
    if (!response.ok) throw new Error("Siteverify request failed.");
    result = await response.json();
    if (!result || typeof result.success !== "boolean" || result["error-codes"]?.includes("internal-error")) {
      throw new Error("Siteverify is unavailable.");
    }
  } catch {
    throw new TurnstileError("The security check is temporarily unavailable. Please try again.", 503);
  }

  if (!result.success || result.action !== action ||
      result.hostname !== config.hostname || result.cdata !== requestId) {
    throw new TurnstileError(retryMessage);
  }
}
