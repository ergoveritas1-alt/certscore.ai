import type { ScanFrequency } from "@website-signal-risk-scanner/shared";
import { isScheduledScanDue } from "@website-signal-risk-scanner/shared";

export function isDomainScanDue(input: {
  activeScanExists: boolean;
  frequency: ScanFrequency;
  lastCompletedAt: string | null;
  now?: Date;
}) {
  if (input.activeScanExists) {
    return false;
  }

  return isScheduledScanDue({
    frequency: input.frequency,
    lastCompletedAt: input.lastCompletedAt,
    now: input.now
  });
}
