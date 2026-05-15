"use server";

import {
  loadAdminMonitorSiteRequestCounts,
  loadAdminMonitorSiteRequestRows,
  type AdminMonitorSiteRequestCounts,
  type AdminMonitorSiteRequestRow,
  type AdminMonitorSiteRequestStatus
} from "./repository";
import { requirePlatformAdminContext } from "./platform-admin";

export type AdminMonitorSiteRequest = {
  company: string | null;
  createdAt: string;
  fullName: string | null;
  id: string;
  monitoringGoal: string;
  normalizedHostname: string;
  notes: string | null;
  sourcePageUrl: string | null;
  sourceReportUrl: string | null;
  status: AdminMonitorSiteRequestStatus;
  updatedAt: string;
  website: string;
  workEmail: string;
};

function toMonitorSiteRequest(row: AdminMonitorSiteRequestRow): AdminMonitorSiteRequest {
  return {
    id: row.id,
    website: row.website,
    normalizedHostname: row.normalized_hostname,
    workEmail: row.work_email,
    fullName: row.full_name,
    company: row.company,
    monitoringGoal: row.monitoring_goal,
    notes: row.notes,
    sourcePageUrl: row.source_page_url,
    sourceReportUrl: row.source_report_url,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listMonitorSiteRequests(
  status?: AdminMonitorSiteRequestStatus | null,
  limit = 100
): Promise<AdminMonitorSiteRequest[]> {
  await requirePlatformAdminContext();
  const rows = await loadAdminMonitorSiteRequestRows(status, limit);
  return rows.map(toMonitorSiteRequest);
}

export async function getMonitorSiteRequestCounts(): Promise<AdminMonitorSiteRequestCounts> {
  await requirePlatformAdminContext();
  return await loadAdminMonitorSiteRequestCounts();
}
