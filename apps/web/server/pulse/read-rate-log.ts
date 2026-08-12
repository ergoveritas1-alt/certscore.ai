type ApiReadRateLimitLog = {
  event: "api_read.rate_limited";
  level: "warn";
  limitUnits: number;
  policyVersion: string;
  profile: string;
  reason: string;
  requestId: string;
  requestedUnits: number;
  retryAfterSeconds: number;
  route: string;
  scope: string;
  surface: "pulse-v1" | "api-v2";
  targetType: "domain" | "job" | "scan";
  usedUnits: number;
  windowId: string;
  windowSeconds: number;
};

/** Emits one safe, queryable denial event without caller secrets, IPs, or target identifiers. */
export function logApiReadRateLimited(input: Omit<ApiReadRateLimitLog, "event" | "level">) {
  console.warn(JSON.stringify({
    event: "api_read.rate_limited",
    level: "warn",
    ...input
  } satisfies ApiReadRateLimitLog));
}
