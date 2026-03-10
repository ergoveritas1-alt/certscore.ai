"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import type { PlanCode, PlanStatus } from "@website-signal-risk-scanner/shared";
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

type UserRow = {
  auth_provider: string;
  created_at: string;
  email: string;
  full_name: string | null;
  id: string;
  updated_at: string;
};

type MembershipRow = {
  created_at: string;
  organization_id: string;
  role: string;
  user_id: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  plan: PlanCode;
  plan_status: PlanStatus;
  slug: string;
};

type DomainRow = {
  id: string;
  organization_id: string | null;
};

type ScanRow = {
  completed_at: string | null;
  id: string;
  organization_id: string | null;
};

export async function listAdminUsers(): Promise<AdminUserListItem[]> {
  await requirePlatformAdminContext();
  const supabase = createAdminClient();

  const [{ data: users, error: usersError }, { data: memberships, error: membershipsError }, { data: organizations, error: organizationsError }, { data: domains, error: domainsError }, { data: scans, error: scansError }] =
    await Promise.all([
      supabase.from("users").select("id, email, full_name, auth_provider, created_at, updated_at").order("created_at", { ascending: false }),
      supabase.from("organization_members").select("user_id, organization_id, role, created_at"),
      supabase.from("organizations").select("id, name, slug, plan, plan_status"),
      supabase.from("domains").select("id, organization_id"),
      supabase.from("scans").select("id, organization_id, completed_at")
    ]);

  if (usersError) {
    throw new Error(`Failed to load users: ${usersError.message}`);
  }

  if (membershipsError) {
    throw new Error(`Failed to load memberships: ${membershipsError.message}`);
  }

  if (organizationsError) {
    throw new Error(`Failed to load organizations: ${organizationsError.message}`);
  }

  if (domainsError) {
    throw new Error(`Failed to load domains: ${domainsError.message}`);
  }

  if (scansError) {
    throw new Error(`Failed to load scans: ${scansError.message}`);
  }

  const membershipMap = new Map(((memberships ?? []) as MembershipRow[]).map((membership) => [membership.user_id, membership]));
  const organizationMap = new Map(((organizations ?? []) as OrganizationRow[]).map((organization) => [organization.id, organization]));
  const domainCounts = new Map<string, number>();
  const totalScans = new Map<string, number>();
  const completedScans = new Map<string, number>();
  const latestCompletedScan = new Map<string, string>();

  for (const domain of (domains ?? []) as DomainRow[]) {
    if (!domain.organization_id) {
      continue;
    }

    domainCounts.set(domain.organization_id, (domainCounts.get(domain.organization_id) ?? 0) + 1);
  }

  for (const scan of (scans ?? []) as ScanRow[]) {
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

  return ((users ?? []) as UserRow[]).map((user) => {
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
      plan: organization?.plan ?? null,
      planStatus: organization?.plan_status ?? null,
      domainCount: organization ? domainCounts.get(organization.id) ?? 0 : 0,
      totalScans: organization ? totalScans.get(organization.id) ?? 0 : 0,
      completedScans: organization ? completedScans.get(organization.id) ?? 0 : 0,
      lastCompletedScanAt: organization ? latestCompletedScan.get(organization.id) ?? null : null
    } satisfies AdminUserListItem;
  });
}
