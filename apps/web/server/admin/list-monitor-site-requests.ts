"use server";

import {
  loadAdminOrganizationOptions,
  loadAdminMonitorSiteRequestCounts,
  loadAdminMonitorSiteRequestRows,
  type AdminMonitorSiteRequestCounts,
  type AdminMonitorSiteRequestRow,
  type AdminMonitorSiteRequestStatus,
  type AdminOrganizationOptionRow
} from "./repository";
import { requirePlatformAdminContext } from "./platform-admin";

export type AdminMonitorSiteRequest = {
  company: string | null;
  createdAt: string;
  fullName: string | null;
  id: string;
  monitorSetup: MonitorRequestSetupMetadata | null;
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

export type MonitorRequestSetupMetadata = {
  activatedAt: string | null;
  activatedByUserId: string | null;
  activeFrequency: string | null;
  confirmationEmailSentAt: string | null;
  confirmationEmailSentByUserId: string | null;
  domainId: string;
  hostname: string;
  linkedAt: string;
  linkedByUserId: string;
  normalizedUrl: string;
  organizationId: string;
  requestedFrequency: string;
  setupStatus: "activated" | "pending_setup";
};

export type AdminOrganizationOption = {
  id: string;
  label: string;
  plan: string | null;
  slug: string;
};

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toSetupMetadata(metadata: Record<string, unknown> | null): MonitorRequestSetupMetadata | null {
  const setup = metadata?.monitorSetup;
  if (typeof setup !== "object" || setup === null) {
    return null;
  }

  const record = setup as Record<string, unknown>;
  const domainId = getString(record.domainId);
  const hostname = getString(record.hostname);
  const linkedAt = getString(record.linkedAt);
  const linkedByUserId = getString(record.linkedByUserId);
  const normalizedUrl = getString(record.normalizedUrl);
  const organizationId = getString(record.organizationId);
  const requestedFrequency = getString(record.requestedFrequency);
  const setupStatus = record.setupStatus === "pending_setup" || record.setupStatus === "activated" ? record.setupStatus : null;

  if (!domainId || !hostname || !linkedAt || !linkedByUserId || !normalizedUrl || !organizationId || !requestedFrequency || !setupStatus) {
    return null;
  }

  return {
    activatedAt: getString(record.activatedAt),
    activatedByUserId: getString(record.activatedByUserId),
    activeFrequency: getString(record.activeFrequency),
    confirmationEmailSentAt: getString(record.confirmationEmailSentAt),
    confirmationEmailSentByUserId: getString(record.confirmationEmailSentByUserId),
    domainId,
    hostname,
    linkedAt,
    linkedByUserId,
    normalizedUrl,
    organizationId,
    requestedFrequency,
    setupStatus
  };
}

function toMonitorSiteRequest(row: AdminMonitorSiteRequestRow): AdminMonitorSiteRequest {
  return {
    id: row.id,
    website: row.website,
    normalizedHostname: row.normalized_hostname,
    workEmail: row.work_email,
    fullName: row.full_name,
    company: row.company,
    monitorSetup: toSetupMetadata(row.metadata_json),
    monitoringGoal: row.monitoring_goal,
    notes: row.notes,
    sourcePageUrl: row.source_page_url,
    sourceReportUrl: row.source_report_url,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toOrganizationOption(row: AdminOrganizationOptionRow): AdminOrganizationOption {
  return {
    id: row.id,
    label: `${row.name} (${row.slug})`,
    plan: row.plan,
    slug: row.slug
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

export async function listMonitorRequestOrganizationOptions(): Promise<AdminOrganizationOption[]> {
  await requirePlatformAdminContext();
  const rows = await loadAdminOrganizationOptions();
  return rows.map(toOrganizationOption);
}
