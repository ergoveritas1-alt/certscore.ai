import "server-only";

import { queryOne } from "@website-signal-risk-scanner/db";
import { ensureMonitorSiteRequestsTable } from "./monitor-site-request";

export type PublicMonitorSiteRequestStatus = {
  activeFrequency: string | null;
  activatedAt: string | null;
  createdAt: string;
  hostname: string;
  setupStatus: "activated" | "pending_setup" | null;
  status: "pending" | "contacted" | "converted" | "closed";
  updatedAt: string;
  website: string;
};

type MonitorSiteRequestStatusRow = {
  created_at: string;
  metadata_json: Record<string, unknown> | null;
  normalized_hostname: string;
  status: PublicMonitorSiteRequestStatus["status"];
  updated_at: string;
  website: string;
};

function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export async function getMonitorSiteRequestStatusByToken(
  token: string
): Promise<PublicMonitorSiteRequestStatus | null> {
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(token)) {
    return null;
  }

  await ensureMonitorSiteRequestsTable();

  const row = await queryOne<MonitorSiteRequestStatusRow>(
    `select website, normalized_hostname, status, metadata_json, created_at, updated_at
       from monitor_site_requests
      where metadata_json->>'publicStatusToken' = $1
      limit 1`,
    [token],
    { readOnly: true }
  );

  if (!row) {
    return null;
  }

  const setup = getRecord(row.metadata_json?.monitorSetup);
  const setupStatus = setup?.setupStatus === "activated" || setup?.setupStatus === "pending_setup" ? setup.setupStatus : null;

  return {
    activatedAt: getString(setup?.activatedAt),
    activeFrequency: getString(setup?.activeFrequency) ?? getString(setup?.requestedFrequency),
    createdAt: row.created_at,
    hostname: row.normalized_hostname,
    setupStatus,
    status: row.status,
    updatedAt: row.updated_at,
    website: row.website
  };
}
