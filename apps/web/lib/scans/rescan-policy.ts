import type { PlanCode } from "@website-signal-risk-scanner/shared";
import { SCAN_ACCESS } from "../scan-access";

const ONE_MINUTE_MS = 60 * 1000;

export function getRescanCooldownMs(planCode: PlanCode): number {
  void planCode;

  return SCAN_ACCESS.scanThrottleMinutes * ONE_MINUTE_MS;
}

export function getNextAllowedRescanAt(input: {
  lastScannedAt: string | null;
  planCode: PlanCode;
}): string | null {
  if (!input.lastScannedAt) {
    return null;
  }

  return new Date(new Date(input.lastScannedAt).getTime() + getRescanCooldownMs(input.planCode)).toISOString();
}

export function getRescanAvailability(input: {
  activeScanExists: boolean;
  lastScannedAt: string | null;
  now?: Date;
  planCode: PlanCode;
}) {
  if (input.activeScanExists) {
    return {
      allowed: false,
      reason: "A scan is already queued or running for this website.",
      nextAllowedAt: null
    };
  }

  if (!input.lastScannedAt) {
    return {
      allowed: true,
      reason: null,
      nextAllowedAt: null
    };
  }

  const nextAllowedAt = getNextAllowedRescanAt({
    lastScannedAt: input.lastScannedAt,
    planCode: input.planCode
  });

  if (!nextAllowedAt) {
    return {
      allowed: true,
      reason: null,
      nextAllowedAt: null
    };
  }

  if ((input.now ?? new Date()).getTime() >= new Date(nextAllowedAt).getTime()) {
    return {
      allowed: true,
      reason: null,
      nextAllowedAt
    };
  }

  return {
    allowed: false,
    reason: null,
    nextAllowedAt
  };
}
