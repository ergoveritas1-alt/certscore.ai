"use server";

import type { PlanCode, PlanStatus } from "@website-signal-risk-scanner/shared";
import {
  loadAdminUsersData,
  type AdminDomainSummaryRow as DomainRow,
  type AdminMembershipRow as MembershipRow,
  type AdminOrganizationScanSummaryRow as ScanRow,
  type AdminOrganizationSummaryRow as OrganizationRow,
  type AdminUserRow as UserRow
} from "./repository";
import { requirePlatformAdminContext } from "./platform-admin";

export type AdminUserListItem = {
  authProvider: string;
  completedScans: number;
  createdAt: string;
  domainCount: number;
  email: string;
  fullName: string | null;
  id: string;
  lastCompletedScanAt: string | null;
  membershipRole: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationSlug: string | null;
  plan: PlanCode | null;
  planStatus: PlanStatus | null;
  totalScans: number;
  updatedAt: string;
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
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      authProvider: user.auth_provider,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      organizationId: organization?.id ?? null,
      organizationName: organization?.name ?? null,
      organizationSlug: organization?.slug ?? null,
      membershipRole: normalizeMembershipRole(membership?.role ?? null),
      plan: (organization?.plan as PlanCode | null | undefined) ?? null,
      planStatus: (organization?.plan_status as PlanStatus | null | undefined) ?? null,
      domainCount: organization ? domainCounts.get(organization.id) ?? 0 : 0,
      totalScans: organization ? totalScans.get(organization.id) ?? 0 : 0,
      completedScans: organization ? completedScans.get(organization.id) ?? 0 : 0,
      lastCompletedScanAt: organization ? latestCompletedScan.get(organization.id) ?? null : null
    } satisfies AdminUserListItem;
  });
}
