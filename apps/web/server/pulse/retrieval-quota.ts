import {
  API_READ_RATE_POLICY,
  apiReadRateUnits,
  apiReadRateWindow,
  type ApiReadRateProfile,
  type ApiReadRateScope,
  type ApiReadRateWindowId
} from "@website-signal-risk-scanner/shared";
import type { PulseDetail } from "../../lib/pulse/types";

const TERMINAL_BURST_POLICY = apiReadRateWindow("terminal", "burst");
const TERMINAL_DAILY_POLICY = apiReadRateWindow("terminal", "daily");
const STATUS_BURST_POLICY = apiReadRateWindow("status", "burst");

export const PULSE_RETRIEVAL_WINDOW_SECONDS = TERMINAL_BURST_POLICY.windowSeconds;
export const PULSE_RETRIEVAL_DAILY_WINDOW_SECONDS = TERMINAL_DAILY_POLICY.windowSeconds;
export const PULSE_RETRIEVAL_PRINCIPAL_LIMIT = TERMINAL_BURST_POLICY.limits.caller;
export const PULSE_RETRIEVAL_PRINCIPAL_SCAN_LIMIT = TERMINAL_BURST_POLICY.limits.callerTarget;
export const PULSE_RETRIEVAL_SCAN_LIMIT = TERMINAL_BURST_POLICY.limits.target;
export const PULSE_RETRIEVAL_DAILY_PRINCIPAL_SCAN_LIMIT = TERMINAL_DAILY_POLICY.limits.callerTarget;
export const PULSE_STATUS_PRINCIPAL_LIMIT = STATUS_BURST_POLICY.limits.caller;
export const PULSE_STATUS_PRINCIPAL_SCAN_LIMIT = STATUS_BURST_POLICY.limits.callerTarget;
export const PULSE_STATUS_SCAN_LIMIT = STATUS_BURST_POLICY.limits.target;

export type PulseRetrievalProfile = ApiReadRateProfile;

export type PulseRetrievalThrottleReason =
  | "scan_retrieval_principal_scan_limit"
  | "scan_retrieval_daily_principal_scan_limit"
  | "scan_retrieval_scan_limit"
  | "scan_retrieval_principal_limit";

type Usage = {
  dailyPrincipalScanUnits: number;
  oldestDailyPrincipalScanAt: string | null;
  oldestPrincipalAt: string | null;
  oldestPrincipalScanAt: string | null;
  oldestScanAt: string | null;
  principalScanUnits: number;
  principalUnits: number;
  scanUnits: number;
};

export function pulseRetrievalWeight(detail: PulseDetail) {
  return apiReadRateUnits(detail === "evidence" || detail === "full" ? detail : "ordinary");
}

function retryAfterSeconds(oldestAt: string | null, now: Date, windowSeconds: number) {
  if (!oldestAt) return windowSeconds;
  const oldestMs = new Date(oldestAt).getTime();
  if (!Number.isFinite(oldestMs)) return windowSeconds;
  return Math.max(1, Math.ceil((oldestMs + windowSeconds * 1000 - now.getTime()) / 1000));
}

export function decidePulseRetrievalQuota(input: {
  detail: PulseDetail;
  now?: Date;
  profile?: PulseRetrievalProfile;
  usage: Usage;
}) {
  const weight = pulseRetrievalWeight(input.detail);
  const now = input.now ?? new Date();
  const profile = input.profile ?? "terminal";
  const limits = profile === "status"
    ? {
        principal: PULSE_STATUS_PRINCIPAL_LIMIT,
        principalScan: PULSE_STATUS_PRINCIPAL_SCAN_LIMIT,
        scan: PULSE_STATUS_SCAN_LIMIT
      }
    : {
        principal: PULSE_RETRIEVAL_PRINCIPAL_LIMIT,
        principalScan: PULSE_RETRIEVAL_PRINCIPAL_SCAN_LIMIT,
        scan: PULSE_RETRIEVAL_SCAN_LIMIT
      };
  const scopes: Array<{
    current: number;
    limit: number;
    oldestAt: string | null;
    reason: PulseRetrievalThrottleReason;
    scope: ApiReadRateScope;
    windowId: ApiReadRateWindowId;
    windowSeconds: number;
  }> = [
    {
      current: input.usage.principalScanUnits,
      limit: limits.principalScan,
      oldestAt: input.usage.oldestPrincipalScanAt,
      reason: "scan_retrieval_principal_scan_limit",
      scope: "callerTarget",
      windowId: "burst",
      windowSeconds: PULSE_RETRIEVAL_WINDOW_SECONDS
    },
    ...(profile === "status" ? [] : [{
      current: input.usage.dailyPrincipalScanUnits,
      limit: PULSE_RETRIEVAL_DAILY_PRINCIPAL_SCAN_LIMIT,
      oldestAt: input.usage.oldestDailyPrincipalScanAt,
      reason: "scan_retrieval_daily_principal_scan_limit" as const,
      scope: "callerTarget" as const,
      windowId: "daily" as const,
      windowSeconds: PULSE_RETRIEVAL_DAILY_WINDOW_SECONDS
    }]),
    {
      current: input.usage.scanUnits,
      limit: limits.scan,
      oldestAt: input.usage.oldestScanAt,
      reason: "scan_retrieval_scan_limit",
      scope: "target",
      windowId: "burst",
      windowSeconds: PULSE_RETRIEVAL_WINDOW_SECONDS
    },
    {
      current: input.usage.principalUnits,
      limit: limits.principal,
      oldestAt: input.usage.oldestPrincipalAt,
      reason: "scan_retrieval_principal_limit",
      scope: "caller",
      windowId: "burst",
      windowSeconds: PULSE_RETRIEVAL_WINDOW_SECONDS
    }
  ];
  const exceeded = scopes.find((scope) => scope.current + weight > scope.limit);
  if (exceeded) {
    return {
      allowed: false as const,
      limitUnits: exceeded.limit,
      policyVersion: API_READ_RATE_POLICY.version,
      profile,
      requestedUnits: weight,
      reason: exceeded.reason,
      retryAfterSeconds: retryAfterSeconds(exceeded.oldestAt, now, exceeded.windowSeconds),
      scope: exceeded.scope,
      usedUnits: exceeded.current,
      windowId: exceeded.windowId,
      windowSeconds: exceeded.windowSeconds,
      weight
    };
  }
  return {
    allowed: true as const,
    policyVersion: API_READ_RATE_POLICY.version,
    profile,
    requestedUnits: weight,
    retryAfterSeconds: 0,
    weight
  };
}

export function pulseRetrievalPrincipal(input: {
  apiKeyId?: string | null;
  ipHash?: string | null;
  userId?: string | null;
}) {
  if (input.apiKeyId) return `api_key:${input.apiKeyId}`;
  if (input.userId) return `user:${input.userId}`;
  if (input.ipHash) return `ip:${input.ipHash}`;
  return "anonymous:unattributed";
}
