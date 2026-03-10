import type { ScanFrequency } from "../types/entities";

export const SCHEDULE_INTERVAL_MS: Record<Exclude<ScanFrequency, "manual">, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000
};

export function getScheduleIntervalMs(frequency: ScanFrequency) {
  if (frequency === "manual") {
    return null;
  }

  return SCHEDULE_INTERVAL_MS[frequency];
}

export function getNextScheduledAt(input: {
  frequency: ScanFrequency;
  lastCompletedAt: string | null;
  now?: Date;
}) {
  if (input.frequency === "manual") {
    return null;
  }

  if (!input.lastCompletedAt) {
    return (input.now ?? new Date()).toISOString();
  }

  const interval = getScheduleIntervalMs(input.frequency);

  if (!interval) {
    return null;
  }

  return new Date(new Date(input.lastCompletedAt).getTime() + interval).toISOString();
}

export function isScheduledScanDue(input: {
  frequency: ScanFrequency;
  lastCompletedAt: string | null;
  now?: Date;
}) {
  if (input.frequency === "manual") {
    return false;
  }

  if (!input.lastCompletedAt) {
    return true;
  }

  const interval = getScheduleIntervalMs(input.frequency);

  if (!interval) {
    return false;
  }

  return (input.now ?? new Date()).getTime() - new Date(input.lastCompletedAt).getTime() >= interval;
}
