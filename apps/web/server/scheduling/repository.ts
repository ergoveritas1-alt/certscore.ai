"use server";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";
import type { PlanCode } from "@website-signal-risk-scanner/shared";

export type SchedulingOrganizationRow = {
  id: string;
  plan: PlanCode;
};

export type SchedulingScanRow = {
  completed_at: string | null;
  created_at: string;
  id: string;
  status: string;
};

export async function loadSchedulingOrganization(organizationId: string): Promise<SchedulingOrganizationRow | null> {
  const db = createDatabaseClient();
  const { data, error } = await db.from("organizations").select("id, plan").eq("id", organizationId).maybeSingle();

  if (error) {
    throw new Error(`Failed to load organization monitoring state: ${error.message}`);
  }

  return (data as SchedulingOrganizationRow | null) ?? null;
}

export async function loadDomainMonitoringScans(input: {
  domainId: string;
  organizationId: string;
}): Promise<SchedulingScanRow[]> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("scans")
    .select("id, status, completed_at, created_at")
    .eq("organization_id", input.organizationId)
    .eq("domain_id", input.domainId)
    .in("scan_type", ["full", "scheduled"])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load monitoring scans: ${error.message}`);
  }

  return (data ?? []) as SchedulingScanRow[];
}
