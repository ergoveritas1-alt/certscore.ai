export const ANONYMOUS_SCAN_DAILY_LIMIT = 20;

export type AnonymousScanQuotaDecision =
  | {
      allowed: true;
      remaining: number;
      retryAfterSeconds: 0;
    }
  | {
      allowed: false;
      remaining: 0;
      retryAfterSeconds: number;
    };

export function anonymousScanQuotaKey(ipHash: string | null | undefined) {
  return ipHash?.trim() || "unknown-requester";
}

export function retryAfterNextUtcDay(now = new Date()) {
  const nextDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(1, Math.ceil((nextDay.getTime() - now.getTime()) / 1000));
}

export function decideAnonymousScanQuota(input: {
  currentCount: number;
  limit?: number;
  now?: Date;
}): AnonymousScanQuotaDecision {
  const limit = input.limit ?? ANONYMOUS_SCAN_DAILY_LIMIT;
  if (input.currentCount >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: retryAfterNextUtcDay(input.now)
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - input.currentCount - 1),
    retryAfterSeconds: 0
  };
}

export class AnonymousScanQuotaError extends Error {
  readonly code = "anonymous_scan_daily_limit";
  readonly limit = ANONYMOUS_SCAN_DAILY_LIMIT;
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      `The no-account allowance is ${ANONYMOUS_SCAN_DAILY_LIMIT} new scans per requester per UTC day. ` +
      "Reuse an eligible recent result, try again after the UTC reset, or contact support@certscore.ai to request a higher-volume allowance."
    );
    this.name = "AnonymousScanQuotaError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isAnonymousScanQuotaError(error: unknown): error is AnonymousScanQuotaError {
  return error instanceof AnonymousScanQuotaError || (
    Boolean(error) &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "anonymous_scan_daily_limit"
  );
}
