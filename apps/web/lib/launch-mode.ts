export const LAUNCH_ACCESS = {
  active: true,
  amountDueLabel: "$0",
  salesEmail: "sales@certscore.ai",
  salesHref: "mailto:sales@certscore.ai",
  scanThrottleMinutes: 5,
  statusLabel: "Launch access"
} as const;

export function getLaunchScanThrottleCopy(nextAllowedAtLabel?: string) {
  const retryCopy = nextAllowedAtLabel ? ` Try again after ${nextAllowedAtLabel}.` : " Please try again shortly.";

  return `Launch access currently allows one scan request every ${LAUNCH_ACCESS.scanThrottleMinutes} minutes.${retryCopy}`;
}
