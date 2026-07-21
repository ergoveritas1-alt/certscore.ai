import type { PlanCode, PlanStatus } from "@website-signal-risk-scanner/shared";
import { DEFAULT_NEW_MEMBERSHIP_ROLE } from "../lib/auth/membership-role-policy";
import type { AuthenticatedAppUser } from "./auth-flows/types";
import {
  createOrganization,
  createOrganizationMembership,
  findAppUserByEmailRecord,
  findAppUserProfileById,
  findOrganizationById,
  findOrganizationMembershipByUserId,
  upsertAppUserProfile
} from "./users/repository";

export type UserRecord = {
  id: string;
  email: string;
  full_name: string | null;
  auth_provider: string;
  created_at: string;
  updated_at: string;
};

export type OrganizationRecord = {
  id: string;
  name: string;
  slug: string;
  plan: PlanCode;
  planStatus: PlanStatus;
  created_at: string;
  updated_at: string;
};

export type OrganizationMemberRecord = {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  created_at: string;
};

export type BootstrapResult = {
  user: AuthenticatedAppUser;
  profile: UserRecord;
  organization: OrganizationRecord;
  membership: OrganizationMemberRecord;
};

export type BootstrapSessionUser = AuthenticatedAppUser;

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function getWorkspaceName(user: BootstrapSessionUser) {
  return `${user.email ?? "New user"} workspace`;
}

function getWorkspaceSlug(user: BootstrapSessionUser) {
  const emailPart = user.email?.split("@")[0] ?? "workspace";
  return `${slugify(emailPart)}-${user.id.slice(0, 8)}`;
}

function mergeAuthProviders(existingProvider: string | null | undefined, nextProvider: string) {
  const providers = new Set(
    [existingProvider, nextProvider]
      .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
      .map((value) => value.trim())
      .filter(Boolean)
  );

  return Array.from(providers).sort().join(",");
}

function mapOrganizationRow(row: {
  id: string;
  name: string;
  slug: string;
  plan: PlanCode;
  plan_status: PlanStatus;
  created_at: string;
  updated_at: string;
}): OrganizationRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    planStatus: row.plan_status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function shouldRefreshUserProfile(input: {
  authProvider: string;
  email: string;
  existingProfile: UserRecord;
  fullName: string | null;
}) {
  return (
    input.existingProfile.auth_provider !== input.authProvider ||
    input.existingProfile.email !== input.email ||
    input.existingProfile.full_name !== input.fullName
  );
}

export async function bootstrapAppUserSession(user: BootstrapSessionUser): Promise<BootstrapResult> {
  const existingProfileById = (await findAppUserProfileById(user.id)) as UserRecord | null;
  const existingProfileByEmail =
    existingProfileById ? null : ((await findAppUserByEmailRecord(user.email)) as UserRecord | null);
  const existingProfile = existingProfileById ?? existingProfileByEmail;
  const canonicalUserId = existingProfile?.id ?? user.id;
  const mergedProvider = mergeAuthProviders(existingProfile?.auth_provider, user.authProvider);
  const fullName = user.fullName ?? existingProfile?.full_name ?? null;
  const profile =
    existingProfile && !shouldRefreshUserProfile({
      authProvider: mergedProvider,
      email: user.email,
      existingProfile,
      fullName
    })
      ? existingProfile
      : ((await upsertAppUserProfile({
          authProvider: mergedProvider,
          email: user.email,
          fullName,
          userId: canonicalUserId
        })) as UserRecord);

  let membership = (await findOrganizationMembershipByUserId(canonicalUserId)) as OrganizationMemberRecord | null;
  let organization: OrganizationRecord | null = null;

  if (!membership) {
    organization = mapOrganizationRow(await createOrganization({
      name: getWorkspaceName(user),
      slug: getWorkspaceSlug(user)
    }));

    membership = (await createOrganizationMembership({
      organizationId: organization.id,
      role: DEFAULT_NEW_MEMBERSHIP_ROLE,
      userId: canonicalUserId
    })) as OrganizationMemberRecord;
  }

  return {
    user: {
      ...user,
      betterAuthUserId: user.betterAuthUserId ?? user.id,
      id: canonicalUserId
    },
    profile,
    organization:
      organization ??
      mapOrganizationRow(await findOrganizationById(membership.organization_id)),
    membership
  };
}

export async function bootstrapUserFromSession(user: AuthenticatedAppUser): Promise<BootstrapResult> {
  return bootstrapAppUserSession(user);
}
