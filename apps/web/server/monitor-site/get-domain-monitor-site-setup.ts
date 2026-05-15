import "server-only";

import { queryOne } from "@website-signal-risk-scanner/db";
import { ensureMonitorSiteRequestsTable } from "./monitor-site-request";

type DomainMonitorSiteSetupRow = {
  created_at: string;
  id: string;
  metadata_json: Record<string, unknown> | null;
  monitoring_goal: string;
  status: "pending" | "contacted" | "converted" | "closed";
  updated_at: string;
  website: string;
  work_email: string;
};

export type DomainMonitorSiteSetup = {
  activeFrequency: string | null;
  activatedAt: string | null;
  activationConfirmedAt: string | null;
  confirmationEmailSentAt: string | null;
  createdAt: string;
  linkedAt: string | null;
  monitoringGoal: string;
  publicStatusToken: string | null;
  requestedFrequency: string | null;
  requestStatus: DomainMonitorSiteSetupRow["status"];
  setupSource: string | null;
  setupStatus: "activated" | "pending_setup";
  updatedAt: string;
  website: string;
  workEmail: string;
};

function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getSetupStatus(value: unknown): "activated" | "pending_setup" | null {
  return value === "activated" || value === "pending_setup" ? value : null;
}

export async function getDomainMonitorSiteSetup(input: {
  domainId: string;
  organizationId: string;
}): Promise<DomainMonitorSiteSetup | null> {
  await ensureMonitorSiteRequestsTable();

  const row = await queryOne<DomainMonitorSiteSetupRow>(
    `select id,
            website,
            work_email,
            monitoring_goal,
            metadata_json,
            status,
            created_at,
            updated_at
       from monitor_site_requests
      where metadata_json->'monitorSetup'->>'domainId' = $1
        and metadata_json->'monitorSetup'->>'organizationId' = $2
      order by updated_at desc
      limit 1`,
    [input.domainId, input.organizationId],
    { readOnly: true }
  );

  if (!row) {
    return null;
  }

  const setup = getRecord(row.metadata_json?.monitorSetup);
  const setupStatus = getSetupStatus(setup?.setupStatus);

  if (!setupStatus) {
    return null;
  }

  return {
    activeFrequency: getString(setup?.activeFrequency),
    activatedAt: getString(setup?.activatedAt),
    activationConfirmedAt: getString(setup?.activationConfirmedAt),
    confirmationEmailSentAt: getString(setup?.confirmationEmailSentAt),
    createdAt: row.created_at,
    linkedAt: getString(setup?.linkedAt),
    monitoringGoal: row.monitoring_goal,
    publicStatusToken: getString(row.metadata_json?.publicStatusToken),
    requestedFrequency: getString(setup?.requestedFrequency),
    requestStatus: row.status,
    setupSource: getString(setup?.setupSource),
    setupStatus,
    updatedAt: row.updated_at,
    website: row.website,
    workEmail: row.work_email
  };
}
