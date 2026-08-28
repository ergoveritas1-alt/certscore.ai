export const ANONYMOUS_SCAN_DAILY_LIMIT = 20;
export const LIGHT_MCP_NEW_SCAN_POLICY = {
  burstWindowSeconds: 10 * 60,
  concurrencyRetryAfterSeconds: 15,
  concurrencyLeaseSeconds: 15 * 60,
  session: { burstLimit: 20, dailyLimit: 60 },
  ip: { burstLimit: 30, dailyLimit: 100 },
  surface: { burstLimit: 60, dailyLimit: 200 },
  concurrency: { session: 4, ip: 8, surface: 20 }
} as const;

export type LightMcpScanQuotaScope = "session" | "ip" | "surface";
export type LightMcpScanQuotaWindow = "burst" | "daily" | "concurrent";

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

export function lightMcpScanRequesterKey(input: {
  ipHash: string | null | undefined;
  network: string | null | undefined;
  sessionHash?: string | null | undefined;
}) {
  const sessionHash = input.sessionHash?.trim();
  if (sessionHash) return `session:${sessionHash}`;
  return input.network === "anthropic"
    ? "provider:anthropic"
    : `ip:${anonymousScanQuotaKey(input.ipHash)}`;
}

export function lightMcpScanIpKey(ipHash: string | null | undefined) {
  return `ip:${anonymousScanQuotaKey(ipHash)}`;
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

function retryAfterRollingWindow(oldestAt: string | null, now: Date, windowSeconds: number) {
  const oldestMs = oldestAt ? new Date(oldestAt).getTime() : Number.NaN;
  if (!Number.isFinite(oldestMs)) return windowSeconds;
  return Math.max(1, Math.ceil((oldestMs + windowSeconds * 1_000 - now.getTime()) / 1_000));
}

export function decideLightMcpNewScanQuota(input: {
  now?: Date;
  usage: Record<LightMcpScanQuotaScope, {
    burstCount: number;
    dailyCount: number;
    oldestBurstAt: string | null;
  }>;
}) {
  const now = input.now ?? new Date();
  const checks = (["surface", "ip", "session"] as const).flatMap((scope) => [
    {
      count: input.usage[scope].burstCount,
      limit: LIGHT_MCP_NEW_SCAN_POLICY[scope].burstLimit,
      scope,
      window: "burst" as const
    },
    {
      count: input.usage[scope].dailyCount,
      limit: LIGHT_MCP_NEW_SCAN_POLICY[scope].dailyLimit,
      scope,
      window: "daily" as const
    }
  ]);
  const exceeded = checks.find((check) => check.count >= check.limit);
  if (exceeded) {
    return {
      allowed: false as const,
      limit: exceeded.limit,
      remaining: 0,
      used: exceeded.count,
      retryAfterSeconds: exceeded.window === "burst"
        ? retryAfterRollingWindow(input.usage[exceeded.scope].oldestBurstAt, now, LIGHT_MCP_NEW_SCAN_POLICY.burstWindowSeconds)
        : retryAfterNextUtcDay(now),
      scope: exceeded.scope,
      window: exceeded.window,
      windowSeconds: exceeded.window === "burst" ? LIGHT_MCP_NEW_SCAN_POLICY.burstWindowSeconds : null
    };
  }
  const remaining = Math.min(
    ...checks.map((check) => Math.max(0, check.limit - check.count - 1))
  );
  return {
    allowed: true as const,
    remaining,
    retryAfterSeconds: 0,
    scope: null,
    window: null
  };
}

export function decideLightMcpScanConcurrency(input: {
  usage: Record<LightMcpScanQuotaScope, number>;
}) {
  const exceeded = (["surface", "ip", "session"] as const)
    .map((scope) => ({
      count: input.usage[scope],
      limit: LIGHT_MCP_NEW_SCAN_POLICY.concurrency[scope],
      scope
    }))
    .find((check) => check.count >= check.limit);
  if (exceeded) {
    return {
      allowed: false as const,
      limit: exceeded.limit,
      remaining: 0,
      retryAfterSeconds: LIGHT_MCP_NEW_SCAN_POLICY.concurrencyRetryAfterSeconds,
      scope: exceeded.scope,
      used: exceeded.count,
      window: "concurrent" as const,
      windowSeconds: null
    };
  }
  return {
    allowed: true as const,
    remaining: Math.min(
      LIGHT_MCP_NEW_SCAN_POLICY.concurrency.session - input.usage.session - 1,
      LIGHT_MCP_NEW_SCAN_POLICY.concurrency.ip - input.usage.ip - 1,
      LIGHT_MCP_NEW_SCAN_POLICY.concurrency.surface - input.usage.surface - 1
    ),
    retryAfterSeconds: 0 as const,
    scope: null,
    window: null
  };
}

export class AnonymousScanQuotaError extends Error {
  readonly code = "anonymous_scan_daily_limit";
  readonly limit: number;
  readonly retryAfterSeconds: number;
  readonly scope: LightMcpScanQuotaScope | "requester";
  readonly window: LightMcpScanQuotaWindow | "daily";
  readonly windowSeconds: number | null;
  readonly used: number | null;

  constructor(retryAfterSeconds: number, options?: {
    lightMcp?: boolean;
    limit?: number;
    scope?: LightMcpScanQuotaScope;
    used?: number;
    window?: LightMcpScanQuotaWindow;
    windowSeconds?: number | null;
  }) {
    const limit = options?.limit ?? ANONYMOUS_SCAN_DAILY_LIMIT;
    const window = options?.window ?? "daily";
    const scope = options?.scope ?? "requester";
    const anonymousLimitName = options?.lightMcp ? "anonymous Light MCP limit" : "anonymous endpoint limit";
    const burstMinutes = Math.max(1, Math.round((options?.windowSeconds ?? LIGHT_MCP_NEW_SCAN_POLICY.burstWindowSeconds) / 60));
    const recovery = scope === "surface"
      ? "This is a shared public-Light limit; registering an account will not bypass the active window. Contact support@certscore.ai if it repeatedly affects legitimate use."
      : `If you need higher-volume scanning, create an account at https://certscore.ai/login?mode=create_account and contact support@certscore.ai to request a custom automated-access allowance. Creating an account does not automatically change the ${anonymousLimitName}.`;
    super(
      window === "concurrent"
        ? `The anonymous Light MCP already has ${limit} active scans for the ${scope} scope. Wait for an active scan to finish, then retry after Retry-After. ${recovery}`
        : window === "burst"
        ? `The anonymous Light MCP allows ${limit} genuinely new scans per ${burstMinutes} minutes for the active ${scope} scope. Reuse an eligible result or wait for Retry-After before trying again. ${recovery}`
        : `The no-account allowance is ${limit} genuinely new scans per UTC day. ` +
          `Reuse an eligible recent result or try again after the UTC reset. ${recovery}`
    );
    this.name = "AnonymousScanQuotaError";
    this.limit = limit;
    this.retryAfterSeconds = retryAfterSeconds;
    this.scope = scope;
    this.window = window;
    this.windowSeconds = window === "burst"
      ? options?.windowSeconds ?? LIGHT_MCP_NEW_SCAN_POLICY.burstWindowSeconds
      : null;
    this.used = typeof options?.used === "number" ? options.used : null;
  }
}

export function isAnonymousScanQuotaError(error: unknown): error is AnonymousScanQuotaError {
  return error instanceof AnonymousScanQuotaError || (
    Boolean(error) &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "anonymous_scan_daily_limit"
  );
}
