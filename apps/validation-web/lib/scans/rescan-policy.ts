import type { PlanCode } from "@website-signal-risk-scanner/shared";

const THREE_MINUTES_MS = 3 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export function getRescanCooldownMs(planCode: PlanCode): number {
  return planCode === "free" ? MONTH_MS : THREE_MINUTES_MS;
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
