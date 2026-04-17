"use server";

import type { PlanCode, ScanFrequency } from "@website-signal-risk-scanner/shared";
import { getNextScheduledAt, getPlanDefinition, isScheduledScanDue } from "@website-signal-risk-scanner/shared";
import {
  loadDomainOrganizationAndSettings,
  loadIndustryLabels,
  loadLatestOrganizationDomainScans,
  loadOrganizationDomains,
  loadOrganizationMonitoringHistory,
  type OrganizationDomainScanRow
} from "./repository";

export type DomainListItem = {
  activeScanExists: boolean;
  id: string;
  industryPrimaryId: string | null;
  industryPrimaryLabel: string | null;
  isDueForScheduledScan: boolean;
  lastCompletedScanAt: string | null;
  lastScannedAt: string | null;
  hostname: string;
  normalizedUrl: string;
  nextScheduledAt: string | null;
  latestScanId: string | null;
  latestScanStatus: string | null;
  latestScanCreatedAt: string | null;
  scanFrequency: ScanFrequency;
  createdAt: string;
  updatedAt: string;
};

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

export async function getOrganizationDomains(organizationId: string): Promise<DomainListItem[]> {
  const [domainRows, { organization, settings }] = await Promise.all([
    loadOrganizationDomains(organizationId),
    loadDomainOrganizationAndSettings(organizationId)
  ]);

  const latestScanIds = domainRows.flatMap((domain) => (domain.latest_scan_id ? [domain.latest_scan_id] : []));
  const industryIds = [...new Set(domainRows.flatMap((domain) => (domain.industry_primary_id ? [domain.industry_primary_id] : [])))];
  const [scanMap, scanHistoryMap, industryMap] = await Promise.all([
    loadLatestOrganizationDomainScans(latestScanIds),
    domainRows.length > 0
      ? loadOrganizationMonitoringHistory(organizationId)
      : Promise.resolve(new Map<string, OrganizationDomainScanRow[]>()),
    loadIndustryLabels(industryIds)
  ]);

  const planFrequency: ScanFrequency = organization ? getPlanDefinition((organization.plan as PlanCode)).scanFrequency : "manual";

  return domainRows.map((domain) => {
    const latestScan = domain.latest_scan_id ? scanMap.get(domain.latest_scan_id) ?? null : null;
    const history = scanHistoryMap.get(domain.id) ?? [];
    const lastCompletedScanAt = history.find((scan) => scan.status === "completed" && scan.completed_at)?.completed_at ?? null;
    const activeScanExists = history.some((scan) => scan.status === "queued" || scan.status === "running");
    const effectiveFrequency = resolveEffectiveFrequency({
      domainFrequency: domain.scan_frequency,
      settingsFrequency: settings?.default_scan_frequency ?? null,
      planFrequency
    });

    return {
      activeScanExists,
      id: domain.id,
      industryPrimaryId: domain.industry_primary_id,
      industryPrimaryLabel: domain.industry_primary_id ? industryMap.get(domain.industry_primary_id) ?? null : null,
      isDueForScheduledScan:
        !activeScanExists &&
        isScheduledScanDue({
          frequency: effectiveFrequency,
          lastCompletedAt: lastCompletedScanAt
        }),
      lastCompletedScanAt,
      lastScannedAt: domain.last_scanned_at,
      hostname: domain.hostname,
      normalizedUrl: domain.normalized_url,
      nextScheduledAt: getNextScheduledAt({
        frequency: effectiveFrequency,
        lastCompletedAt: lastCompletedScanAt
      }),
      latestScanId: domain.latest_scan_id,
      latestScanStatus: latestScan?.status ?? null,
      latestScanCreatedAt: latestScan?.created_at ?? null,
      scanFrequency: effectiveFrequency,
      createdAt: domain.created_at,
      updatedAt: domain.updated_at
    };
  });
}
