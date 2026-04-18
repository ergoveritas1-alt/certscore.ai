"use server";

import { query, queryOne } from "@website-signal-risk-scanner/db";
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
  try {
    return await queryOne<SchedulingOrganizationRow>(
      `select id, plan
         from organizations
        where id = $1`,
      [organizationId],
      { readOnly: true }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load organization monitoring state: ${message}`);
  }
}

export async function loadDomainMonitoringScans(input: {
  domainId: string;
  organizationId: string;
}): Promise<SchedulingScanRow[]> {
  try {
    const result = await query<SchedulingScanRow>(
      `select id, status, completed_at, created_at
         from scans
        where organization_id = $1
          and domain_id = $2
          and scan_type = any($3::text[])
        order by created_at desc`,
      [input.organizationId, input.domainId, ["full", "scheduled"]],
      { readOnly: true }
    );

    return result.rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load monitoring scans: ${message}`);
  }
}
