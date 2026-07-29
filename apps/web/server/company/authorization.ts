import "server-only";

import { queryOne } from "@website-signal-risk-scanner/db";
import { getDashboardContext } from "../auth";
import { isPlatformAdminEmail } from "../admin/platform-admin";

export type CompanyCapability = "manage_users" | "manage_settings" | "manage_logo";

export type CompanyAccess = {
  isPlatformAdmin: boolean;
  membershipRole: string | null;
  organizationId: string | null;
  userId: string;
};

export async function getCompanyAccess(): Promise<CompanyAccess> {
  const context = await getDashboardContext();
  const membership = await queryOne<{ organization_id: string; role: string }>(
    `select organization_id, role
       from organization_members
      where user_id = $1`,
    [context.user.id],
    { readOnly: true }
  );

  return {
    isPlatformAdmin: isPlatformAdminEmail(context.user.email),
    membershipRole: membership?.role ?? null,
    organizationId: membership?.organization_id ?? null,
    userId: context.user.id
  };
}

export async function requireCompanyCapability(
  organizationId: string,
  capability: CompanyCapability
) {
  const access = await getCompanyAccess();
  if (access.isPlatformAdmin) {
    return access;
  }

  if (access.organizationId !== organizationId || !["advanced", "admin"].includes(access.membershipRole ?? "")) {
    throw new Error(`Company capability denied: ${capability}`);
  }

  return access;
}

export async function requireCompanyViewer(organizationId: string) {
  const access = await getCompanyAccess();
  if (!access.isPlatformAdmin && access.organizationId !== organizationId) {
    throw new Error("Company access denied.");
  }
  return access;
}
