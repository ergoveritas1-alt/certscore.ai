import type { LoadTestQualityWarning } from "@website-signal-risk-scanner/shared";

export type QualityWarningEmailDecision = {
  reason: string;
  shouldSend: boolean;
  throttleKey: string;
};

export type QualityWarningEmailHistory = {
  sentAtByThrottleKey?: Record<string, string>;
  sustainedWarningIds?: string[];
};

const SUPPORT_EMAIL = "support@certscore.ai";
const THROTTLE_MS = 6 * 60 * 60 * 1000;

export function shouldSendQualityWarningEmail(input: {
  history?: QualityWarningEmailHistory;
  now?: Date;
  warning: LoadTestQualityWarning;
}): QualityWarningEmailDecision {
  const now = input.now ?? new Date();
  const throttleKey = `${input.warning.code}:${input.warning.egress_id}`;
  const lastSent = input.history?.sentAtByThrottleKey?.[throttleKey];
  if (lastSent) {
    const lastSentMs = Date.parse(lastSent);
    if (Number.isFinite(lastSentMs) && now.getTime() - lastSentMs < THROTTLE_MS) {
      return {
        reason: "suppressed_by_throttle",
        shouldSend: false,
        throttleKey
      };
    }
  }

  if (input.warning.code === "zero_finding_extreme" && input.warning.metrics.completedCount >= 25) {
    return {
      reason: `critical warning should notify ${SUPPORT_EMAIL}`,
      shouldSend: true,
      throttleKey
    };
  }

  if (input.history?.sustainedWarningIds?.includes(input.warning.warningId)) {
    return {
      reason: `sustained warning should notify ${SUPPORT_EMAIL}`,
      shouldSend: true,
      throttleKey
    };
  }

  return {
    reason: "not_sustained_or_critical",
    shouldSend: false,
    throttleKey
  };
}

export const QUALITY_WARNING_EMAIL_IMPLEMENTATION_PLAN = [
  "Persist quality warning fingerprints and last-sent timestamps in an ops table before enabling email sends.",
  "Send only to support@certscore.ai for sustained warnings across two completed windows, control-plane gate failures, or critical zero-finding extremes.",
  "Use the existing Gmail transport after persistence-backed throttling is available.",
  "Keep Phase 1B quality warnings WARN-only; do not pause or cancel batches from email decisions."
] as const;
