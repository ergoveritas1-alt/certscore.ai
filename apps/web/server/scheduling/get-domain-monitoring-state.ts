"use server";

import type { PlanCode, ScanFrequency } from "@website-signal-risk-scanner/shared";
import { getNextScheduledAt, getPlanDefinition, isScheduledScanDue } from "@website-signal-risk-scanner/shared";
import { loadOrganizationSettings } from "../settings/repository";
import { loadDomainMonitoringDomain } from "../domains/repository";
import { loadDomainMonitoringScans, loadSchedulingOrganization } from "./repository";

function isFrequency(value: string | null): value is ScanFrequency {
  return value === "manual" || value === "hourly" || value === "daily" || value === "weekly" || value === "monthly";
}

function resolveEffectiveFrequency(input: {
  domainFrequency: string | null;
  planFrequency: ScanFrequency;
  settingsFrequency: string | null;
}): ScanFrequency {
  if (isFrequency(input.domainFrequency)) {
    return input.domainFrequency;
  }

  if (isFrequency(input.settingsFrequency)) {
    return input.settingsFrequency;
  }

  return input.planFrequency;
}

export type DomainMonitoringState = {
  activeScanExists: boolean;
  effectiveFrequency: ScanFrequency;
  isDue: boolean;
  lastCompletedScanAt: string | null;
  nextScheduledAt: string | null;
};

export async function getDomainMonitoringState(input: { domainId: string; organizationId: string }): Promise<DomainMonitoringState | null> {
  const [domain, organization, settings] = await Promise.all([
    loadDomainMonitoringDomain({
      domainId: input.domainId,
      organizationId: input.organizationId
    }),
    loadSchedulingOrganization(input.organizationId),
    loadOrganizationSettings(input.organizationId)
  ]);

  if (!domain || !organization) {
    return null;
  }

  const effectiveFrequency = resolveEffectiveFrequency({
    domainFrequency: domain.scan_frequency,
    settingsFrequency: settings?.default_scan_frequency ?? null,
    planFrequency: getPlanDefinition(organization.plan as PlanCode).scanFrequency
  });

  const scanRows = await loadDomainMonitoringScans(input);
  const activeScanExists = scanRows.some((scan) => scan.status === "queued" || scan.status === "running");
  const lastCompletedScanAt =
    scanRows.find((scan) => scan.status === "completed" && scan.completed_at)?.completed_at ?? null;

  return {
    effectiveFrequency,
    activeScanExists,
    lastCompletedScanAt,
    nextScheduledAt: getNextScheduledAt({
      frequency: effectiveFrequency,
      lastCompletedAt: lastCompletedScanAt
    }),
    isDue: !activeScanExists &&
      isScheduledScanDue({
        frequency: effectiveFrequency,
        lastCompletedAt: lastCompletedScanAt
      })
  };
}
