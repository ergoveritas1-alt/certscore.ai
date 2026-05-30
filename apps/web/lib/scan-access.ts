export const SCAN_ACCESS = {
  adminScanThrottleSeconds: 30,
  salesEmail: "sales@certscore.ai",
  salesHref: "mailto:sales@certscore.ai",
  scanThrottleMinutes: 1
} as const;

export function formatScanThrottleIntervalLabel(minutes = SCAN_ACCESS.scanThrottleMinutes) {
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function getScanThrottleCopy(nextAllowedAtLabel?: string) {
  const retryCopy = nextAllowedAtLabel ? ` Try again after ${nextAllowedAtLabel}.` : " Please try again shortly.";

  return `Scan requests are limited to one request every ${formatScanThrottleIntervalLabel()}.${retryCopy}`;
}

export function getAdminScanThrottleMs() {
  return SCAN_ACCESS.adminScanThrottleSeconds * 1000;
}
