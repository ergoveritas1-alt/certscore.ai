import {
  getPlanDefinition,
  isScheduledScanDue,
  type PlanCode,
  type ScanFrequency
} from "@website-signal-risk-scanner/shared";

export type ScheduledMonitoringDecision =
  | {
      due: true;
      frequency: ScanFrequency;
      reason: "due";
    }
  | {
      due: false;
      frequency: ScanFrequency;
      reason: "active_scan_exists" | "manual_frequency" | "not_due";
    };

function isFrequency(value: string | null): value is ScanFrequency {
  return value === "manual" || value === "hourly" || value === "daily" || value === "weekly" || value === "monthly";
}

export function resolveScheduledMonitoringFrequency(input: {
  domainFrequency: string | null;
  organizationPlan: PlanCode;
  settingsFrequency: string | null;
}): ScanFrequency {
  if (isFrequency(input.domainFrequency)) {
    return input.domainFrequency;
  }

  if (isFrequency(input.settingsFrequency)) {
    return input.settingsFrequency;
  }

  return getPlanDefinition(input.organizationPlan).scanFrequency;
}

export function getScheduledMonitoringDecision(input: {
  activeScanExists: boolean;
  domainFrequency: string | null;
  lastCompletedAt: string | null;
  now?: Date;
  organizationPlan: PlanCode;
  settingsFrequency: string | null;
}): ScheduledMonitoringDecision {
  const frequency = resolveScheduledMonitoringFrequency(input);

  if (frequency === "manual") {
    return {
      due: false,
      frequency,
      reason: "manual_frequency"
    };
  }

  if (input.activeScanExists) {
    return {
      due: false,
      frequency,
      reason: "active_scan_exists"
    };
  }

  if (
    !isScheduledScanDue({
      frequency,
      lastCompletedAt: input.lastCompletedAt,
      now: input.now
    })
  ) {
    return {
      due: false,
      frequency,
      reason: "not_due"
    };
  }

  return {
    due: true,
    frequency,
    reason: "due"
  };
}
