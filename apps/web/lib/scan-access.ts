export const SCAN_ACCESS = {
  salesEmail: "sales@certscore.ai",
  salesHref: "mailto:sales@certscore.ai",
  scanThrottleMinutes: 5
} as const;

export function getScanThrottleCopy(nextAllowedAtLabel?: string) {
  const retryCopy = nextAllowedAtLabel ? ` Try again after ${nextAllowedAtLabel}.` : " Please try again shortly.";

  return `Scan requests are limited to one request every ${SCAN_ACCESS.scanThrottleMinutes} minutes.${retryCopy}`;
}
