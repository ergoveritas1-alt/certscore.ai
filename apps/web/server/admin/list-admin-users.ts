"use server";

import type { PlanCode, PlanStatus } from "@website-signal-risk-scanner/shared";
import { mcpTelemetryActorId } from "@certscore/mcp-auth";
import type { AdminUsersSortDirection, AdminUsersSortKey } from "./admin-users-sort";
import {
  loadAdminMcpActivationByUserIds,
  loadAdminMcpActivationFunnel,
  loadAdminMcpToolUsageByActorIds,
  loadAdminUserOverviewData,
  loadAdminUsersPageData,
  loadAdminUsersData,
  type AdminMcpActivationRow,
  type AdminUserOverviewMetricsRow,
  type AdminMcpToolUsageRow,
  type AdminUserOverviewRow,
  type AdminDomainSummaryRow as DomainRow,
  type AdminMembershipRow as MembershipRow,
  type AdminOrganizationScanSummaryRow as ScanRow,
  type AdminOrganizationSummaryRow as OrganizationRow,
  type AdminUserRow as UserRow
} from "./repository";
import { requirePlatformAdminContext } from "./platform-admin";
import { latestActivityAt } from "../../lib/admin/latest-activity-at";
import { getMcpOAuthIssuer } from "../oauth/mcp-oauth-config";

export type AdminUserListItem = {
  accountRole: string;
  activeMcpConnectorCount: number;
  authProvider: string;
  completedScans: number;
  createdAt: string;
  domainCount: number;
  email: string;
  fullName: string | null;
  id: string;
  lastCompletedScanAt: string | null;
  lastAssociatedScanAt: string | null;
  lastLoginAt: string | null;
  lastMcpConnectorAt: string | null;
  lastMcpInitializedAt: string | null;
  lastMcpOAuthAuthorizedAt: string | null;
  lastMcpToolInvocationAt: string | null;
  lastMcpToolsListedAt: string | null;
  lastScanAt: string | null;
  lastScanRequestedAt: string | null;
  membershipRole: string | null;
  mcpConnectorNames: string[];
  mcpToolInvocationCount: number | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationSlug: string | null;
  plan: PlanCode | null;
  planStatus: PlanStatus | null;
  associatedScanCount: number;
  scanRequestCount: number;
  totalScans: number;
  updatedAt: string;
};

export type AdminUserOverviewMetrics = {
  activePlans: Record<string, number>;
  totalUsers: number;
  totalWorkspaces: number;
};

export type AdminMcpActivationFunnel = {
  authorizedUsers: number;
  firstTool1h: number;
  firstTool24h: number;
  initialized1h: number;
  initialized24h: number;
  scanRequested1h: number;
  scanRequested24h: number;
  toolsListed1h: number;
  toolsListed24h: number;
};

export async function getAdminMcpActivationFunnel(): Promise<AdminMcpActivationFunnel> {
  await requirePlatformAdminContext();
  const row = await loadAdminMcpActivationFunnel();
  return {
    authorizedUsers: Number(row.authorized_users ?? 0),
    firstTool1h: Number(row.first_tool_1h ?? 0),
    firstTool24h: Number(row.first_tool_24h ?? 0),
    initialized1h: Number(row.initialized_1h ?? 0),
    initialized24h: Number(row.initialized_24h ?? 0),
    scanRequested1h: Number(row.scan_requested_1h ?? 0),
    scanRequested24h: Number(row.scan_requested_24h ?? 0),
    toolsListed1h: Number(row.tools_listed_1h ?? 0),
    toolsListed24h: Number(row.tools_listed_24h ?? 0)
  };
}

function normalizeMembershipRole(role: string | null) {
  if (role === "owner") {
    return "admin";
  }

  if (role === "member") {
    return "user";
  }

  return role;
}

export async function listAdminUsers(): Promise<AdminUserListItem[]> {
  await requirePlatformAdminContext();
  const { domains, memberships, organizations, scans, users } = await loadAdminUsersData();

  const membershipMap = new Map((memberships as MembershipRow[]).map((membership) => [membership.user_id, membership]));
  const organizationMap = new Map((organizations as OrganizationRow[]).map((organization) => [organization.id, organization]));
  const domainCounts = new Map<string, number>();
  const totalScans = new Map<string, number>();
  const completedScans = new Map<string, number>();
  const latestCompletedScan = new Map<string, string>();
  const latestScan = new Map<string, string>();

  for (const domain of domains as DomainRow[]) {
    if (!domain.organization_id) {
      continue;
    }

    domainCounts.set(domain.organization_id, (domainCounts.get(domain.organization_id) ?? 0) + 1);
  }

  for (const scan of scans as ScanRow[]) {
    if (!scan.organization_id) {
      continue;
    }

    totalScans.set(scan.organization_id, (totalScans.get(scan.organization_id) ?? 0) + 1);
    const currentLatestScan = latestScan.get(scan.organization_id);
    if (!currentLatestScan || scan.created_at > currentLatestScan) {
      latestScan.set(scan.organization_id, scan.created_at);
    }

    if (scan.completed_at) {
      completedScans.set(scan.organization_id, (completedScans.get(scan.organization_id) ?? 0) + 1);
      const currentLatest = latestCompletedScan.get(scan.organization_id);

      if (!currentLatest || scan.completed_at > currentLatest) {
        latestCompletedScan.set(scan.organization_id, scan.completed_at);
      }
    }
  }

  return (users as UserRow[]).map((user) => {
    const membership = membershipMap.get(user.id) ?? null;
    const organization = membership ? organizationMap.get(membership.organization_id) ?? null : null;

    return {
      accountRole: user.account_role,
      activeMcpConnectorCount: 0,
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      authProvider: user.auth_provider,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLoginAt: user.last_login_at,
      lastMcpConnectorAt: null,
      lastMcpInitializedAt: null,
      lastMcpOAuthAuthorizedAt: null,
      lastMcpToolInvocationAt: null,
      lastMcpToolsListedAt: null,
      organizationId: organization?.id ?? null,
      organizationName: organization?.name ?? null,
      organizationSlug: organization?.slug ?? null,
      membershipRole: normalizeMembershipRole(membership?.role ?? null),
      mcpConnectorNames: [],
      mcpToolInvocationCount: null,
      plan: (organization?.plan as PlanCode | null | undefined) ?? null,
      planStatus: (organization?.plan_status as PlanStatus | null | undefined) ?? null,
      domainCount: organization ? domainCounts.get(organization.id) ?? 0 : 0,
      totalScans: organization ? totalScans.get(organization.id) ?? 0 : 0,
      completedScans: organization ? completedScans.get(organization.id) ?? 0 : 0,
      lastScanAt: latestActivityAt(organization ? latestScan.get(organization.id) : null),
      lastCompletedScanAt: organization ? latestCompletedScan.get(organization.id) ?? null : null,
      lastAssociatedScanAt: null,
      lastScanRequestedAt: null,
      scanRequestCount: 0,
      associatedScanCount: organization ? totalScans.get(organization.id) ?? 0 : 0
    } satisfies AdminUserListItem;
  });
}

export async function listAdminUsersPage(
  limit = 25,
  offset = 0,
  sortKey: AdminUsersSortKey = "user",
  direction: AdminUsersSortDirection = "desc"
): Promise<{
  items: AdminUserListItem[];
  totalCount: number;
}> {
  await requirePlatformAdminContext();
  const page = await loadAdminUsersPageData(limit, offset, sortKey, direction);
  const items = await mapAdminUserOverviewRows(page.users);
  return {
    items,
    totalCount: page.totalCount
  };
}

function mapAdminUserOverviewRow(
  row: AdminUserOverviewRow,
  mcpActivation: AdminMcpActivationRow | null = null,
  mcpUsage: AdminMcpToolUsageRow | null = null
): AdminUserListItem {
  return {
    accountRole: row.account_role,
    activeMcpConnectorCount: Number(row.active_mcp_connector_count ?? 0),
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    authProvider: row.auth_provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    lastMcpConnectorAt: row.last_mcp_connector_at ?? null,
    lastMcpInitializedAt: mcpActivation?.last_mcp_initialized_at ?? null,
    lastMcpOAuthAuthorizedAt: mcpActivation?.last_oauth_authorized_at ?? null,
    lastMcpToolInvocationAt: mcpUsage?.last_tool_invocation_at ?? null,
    lastMcpToolsListedAt: mcpActivation?.last_mcp_tools_listed_at ?? null,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    membershipRole: normalizeMembershipRole(row.membership_role),
    mcpConnectorNames: row.mcp_connector_names ?? [],
    mcpToolInvocationCount: mcpUsage ? Number(mcpUsage.tool_invocation_count ?? 0) : null,
    plan: (row.plan as PlanCode | null | undefined) ?? null,
    planStatus: (row.plan_status as PlanStatus | null | undefined) ?? null,
    domainCount: Number(row.domain_count ?? 0),
    totalScans: Number(row.total_scans ?? 0),
    completedScans: Number(row.completed_scans ?? 0),
    lastScanAt: latestActivityAt(row.last_associated_scan_at, row.last_scan_requested_at),
    lastCompletedScanAt: row.last_completed_scan_at,
    lastAssociatedScanAt: row.last_associated_scan_at,
    lastScanRequestedAt: row.last_scan_requested_at,
    scanRequestCount: Number(row.scan_request_count ?? 0),
    associatedScanCount: Number(row.associated_scan_count ?? 0)
  };
}

function configuredMcpJwtSecret() {
  return process.env.CERTSCORE_OAUTH_JWT_SECRET?.trim() || process.env.JWT_SIGNING_KEY?.trim() || null;
}

async function mapAdminUserOverviewRows(rows: AdminUserOverviewRow[]) {
  const activationRowsPromise = loadAdminMcpActivationByUserIds(rows.map((row) => row.id));
  const jwtSecret = configuredMcpJwtSecret();
  const actorIdByUserId = new Map(jwtSecret ? rows.map((row) => [
    row.id,
    mcpTelemetryActorId({ issuer: getMcpOAuthIssuer(), jwtSecret, subject: row.id })
  ]) : []);
  const [activationRows, usageRows] = await Promise.all([
    activationRowsPromise,
    jwtSecret ? loadAdminMcpToolUsageByActorIds([...actorIdByUserId.values()]) : Promise.resolve([])
  ]);
  const activationByUserId = new Map(activationRows.map((activation) => [activation.user_id, activation]));
  const usageByActorId = new Map(usageRows.map((usage) => [usage.actor_id, usage]));
  return rows.map((row) => {
    const actorId = actorIdByUserId.get(row.id);
    const usage = actorId ? usageByActorId.get(actorId) ?? {
      actor_id: actorId,
      last_tool_invocation_at: null,
      tool_invocation_count: 0
    } : null;
    return mapAdminUserOverviewRow(row, activationByUserId.get(row.id) ?? null, usage);
  });
}

function mapOverviewMetrics(row: AdminUserOverviewMetricsRow | null): AdminUserOverviewMetrics {
  return {
    totalUsers: Number(row?.total_users ?? 0),
    totalWorkspaces: Number(row?.total_workspaces ?? 0),
    activePlans: {
      free: Number(row?.free_plan_users ?? 0),
      individual: Number(row?.individual_plan_users ?? 0),
      pro: Number(row?.pro_plan_users ?? 0),
      team: Number(row?.team_plan_users ?? 0)
    }
  };
}

export async function getAdminUserOverview(input: { limit?: number } = {}): Promise<{
  metrics: AdminUserOverviewMetrics;
  recentUsers: AdminUserListItem[];
}> {
  await requirePlatformAdminContext();
  const { metrics, users } = await loadAdminUserOverviewData(input.limit ?? 8);
  const recentUsers = await mapAdminUserOverviewRows(users);

  return {
    metrics: mapOverviewMetrics(metrics),
    recentUsers
  };
}
