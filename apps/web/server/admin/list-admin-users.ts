"use server";

import type { PlanCode, PlanStatus } from "@website-signal-risk-scanner/shared";
import type { AdminUsersSortDirection, AdminUsersSortKey } from "./admin-users-sort";
import {
  loadAdminUserOverviewData,
  loadAdminUsersPageData,
  loadAdminUsersData,
  type AdminUserOverviewMetricsRow,
  type AdminUserOverviewRow,
  type AdminDomainSummaryRow as DomainRow,
  type AdminMembershipRow as MembershipRow,
  type AdminOrganizationScanSummaryRow as ScanRow,
  type AdminOrganizationSummaryRow as OrganizationRow,
  type AdminUserRow as UserRow
} from "./repository";
import { requirePlatformAdminContext } from "./platform-admin";

export type AdminUserListItem = {
  accountRole: string;
  authProvider: string;
  completedScans: number;
  createdAt: string;
  domainCount: number;
  email: string;
  fullName: string | null;
  id: string;
  lastCompletedScanAt: string | null;
  lastLoginAt: string | null;
  lastScanAt: string | null;
  membershipRole: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationSlug: string | null;
  plan: PlanCode | null;
  planStatus: PlanStatus | null;
  totalScans: number;
  updatedAt: string;
};

export type AdminUserOverviewMetrics = {
  activePlans: Record<string, number>;
  totalUsers: number;
  totalWorkspaces: number;
};

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
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      authProvider: user.auth_provider,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLoginAt: user.last_login_at,
      organizationId: organization?.id ?? null,
      organizationName: organization?.name ?? null,
      organizationSlug: organization?.slug ?? null,
      membershipRole: normalizeMembershipRole(membership?.role ?? null),
      plan: (organization?.plan as PlanCode | null | undefined) ?? null,
      planStatus: (organization?.plan_status as PlanStatus | null | undefined) ?? null,
      domainCount: organization ? domainCounts.get(organization.id) ?? 0 : 0,
      totalScans: organization ? totalScans.get(organization.id) ?? 0 : 0,
      completedScans: organization ? completedScans.get(organization.id) ?? 0 : 0,
      lastScanAt: organization ? latestScan.get(organization.id) ?? null : null,
      lastCompletedScanAt: organization ? latestCompletedScan.get(organization.id) ?? null : null
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
  return {
    items: page.users.map(mapAdminUserOverviewRow),
    totalCount: page.totalCount
  };
}

function mapAdminUserOverviewRow(row: AdminUserOverviewRow): AdminUserListItem {
  return {
    accountRole: row.account_role,
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    authProvider: row.auth_provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    membershipRole: normalizeMembershipRole(row.membership_role),
    plan: (row.plan as PlanCode | null | undefined) ?? null,
    planStatus: (row.plan_status as PlanStatus | null | undefined) ?? null,
    domainCount: Number(row.domain_count ?? 0),
    totalScans: Number(row.total_scans ?? 0),
    completedScans: Number(row.completed_scans ?? 0),
    lastScanAt: row.last_scan_at,
    lastCompletedScanAt: row.last_completed_scan_at
  };
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

  return {
    metrics: mapOverviewMetrics(metrics),
    recentUsers: users.map(mapAdminUserOverviewRow)
  };
}
