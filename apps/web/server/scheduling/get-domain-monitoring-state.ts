"use server";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";
import type { PlanCode, ScanFrequency } from "@website-signal-risk-scanner/shared";
import { getNextScheduledAt, getPlanDefinition, isScheduledScanDue } from "@website-signal-risk-scanner/shared";

type OrganizationRow = {
  id: string;
  plan: PlanCode;
};

type DomainRow = {
  id: string;
  scan_frequency: string | null;
};

type SettingsRow = {
  default_scan_frequency: string | null;
};

type ScanRow = {
  completed_at: string | null;
  created_at: string;
  id: string;
  status: string;
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

export type DomainMonitoringState = {
  activeScanExists: boolean;
  effectiveFrequency: ScanFrequency;
  isDue: boolean;
  lastCompletedScanAt: string | null;
  nextScheduledAt: string | null;
};

export async function getDomainMonitoringState(input: { domainId: string; organizationId: string }): Promise<DomainMonitoringState | null> {
  const db = createDatabaseClient();
  const [{ data: domain, error: domainError }, { data: organization, error: organizationError }, { data: settings }] = await Promise.all([
    db.from("domains").select("id, scan_frequency").eq("organization_id", input.organizationId).eq("id", input.domainId).maybeSingle(),
    db.from("organizations").select("id, plan").eq("id", input.organizationId).maybeSingle(),
    db
      .from("organization_settings")
      .select("default_scan_frequency")
      .eq("organization_id", input.organizationId)
      .maybeSingle()
  ]);

  if (domainError) {
    throw new Error(`Failed to load domain monitoring state: ${domainError.message}`);
  }

  if (organizationError) {
    throw new Error(`Failed to load organization monitoring state: ${organizationError.message}`);
  }

  if (!domain || !organization) {
    return null;
  }

  const domainRow = domain as DomainRow;
  const organizationRow = organization as OrganizationRow;
  const settingsRow = (settings as SettingsRow | null) ?? null;
  const effectiveFrequency = resolveEffectiveFrequency({
    domainFrequency: domainRow.scan_frequency,
    settingsFrequency: settingsRow?.default_scan_frequency ?? null,
    planFrequency: getPlanDefinition(organizationRow.plan).scanFrequency
  });

  const { data: scans, error: scansError } = await db
    .from("scans")
    .select("id, status, completed_at, created_at")
    .eq("organization_id", input.organizationId)
    .eq("domain_id", input.domainId)
    .in("scan_type", ["full", "scheduled"])
    .order("created_at", { ascending: false });

  if (scansError) {
    throw new Error(`Failed to load monitoring scans: ${scansError.message}`);
  }

  const scanRows = (scans ?? []) as ScanRow[];
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
