import { createAdminClient, type User } from "@website-signal-risk-scanner/db";
import type { PlanCode, PlanStatus } from "@website-signal-risk-scanner/shared";
import type { AuthenticatedAppUser } from "./password-auth/types";

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

function getFullName(user: User) {
  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null;

  return metadataName;
}

function getAuthProvider(user: User) {
  const providers = user.app_metadata?.providers;

  if (Array.isArray(providers) && typeof providers[0] === "string") {
    return providers[0];
  }

  if (typeof user.app_metadata?.provider === "string") {
    return user.app_metadata.provider;
  }

  return "magic_link";
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

export async function bootstrapAppUserSession(user: BootstrapSessionUser): Promise<BootstrapResult> {
  const supabase = createAdminClient();
  const { data: existingProfileRow, error: existingProfileError } = await supabase
    .from("users")
    .select("id, email, full_name, auth_provider, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfileError) {
    throw new Error(`Failed to load existing user profile: ${existingProfileError.message}`);
  }

  const existingProfile = (existingProfileRow as UserRecord | null) ?? null;
  const mergedProvider = mergeAuthProviders(existingProfile?.auth_provider, user.authProvider);

  const { data: profileRow, error: upsertProfileError } = await supabase
    .from("users")
    .upsert(
      {
        id: user.id,
        email: user.email,
        full_name: user.fullName ?? existingProfile?.full_name ?? null,
        auth_provider: mergedProvider
      },
      {
        onConflict: "id"
      }
    )
    .select("*")
    .single();

  if (upsertProfileError || !profileRow) {
    throw new Error(`Failed to upsert user profile: ${upsertProfileError?.message ?? "Unknown error"}`);
  }

  const profile = profileRow as UserRecord;

  const { data: existingMembershipRow, error: membershipLookupError } = await supabase
    .from("organization_members")
    .select("id, organization_id, user_id, role, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipLookupError) {
    throw new Error(`Failed to look up organization membership: ${membershipLookupError.message}`);
  }

  let membership = existingMembershipRow as OrganizationMemberRecord | null;
  let organization: OrganizationRecord | null = null;

  if (!membership) {
    const { data: createdOrganizationRow, error: createOrganizationError } = await supabase
      .from("organizations")
      .insert({
        name: getWorkspaceName(user),
        slug: getWorkspaceSlug(user)
      })
      .select("id, name, slug, plan, plan_status, created_at, updated_at")
      .single();

    if (createOrganizationError || !createdOrganizationRow) {
      throw new Error(`Failed to create organization: ${createOrganizationError?.message ?? "Unknown error"}`);
    }

    organization = mapOrganizationRow(
      createdOrganizationRow as {
        id: string;
        name: string;
        slug: string;
        plan: PlanCode;
        plan_status: PlanStatus;
        created_at: string;
        updated_at: string;
      }
    );

    const { data: createdMembershipRow, error: createMembershipError } = await supabase
      .from("organization_members")
      .insert({
        organization_id: organization.id,
        role: "admin",
        user_id: user.id
      })
      .select("id, organization_id, user_id, role, created_at")
      .single();

    if (createMembershipError || !createdMembershipRow) {
      throw new Error(
        `Failed to create organization membership: ${createMembershipError?.message ?? "Unknown error"}`
      );
    }

    membership = createdMembershipRow as OrganizationMemberRecord;
  }

  const { data: organizationLookupRow, error: organizationLookupError } = await supabase
    .from("organizations")
    .select("id, name, slug, plan, plan_status, created_at, updated_at")
    .eq("id", membership.organization_id)
    .single();

  if (organizationLookupError || !organizationLookupRow) {
    throw new Error(
      `Failed to load organization after bootstrap: ${organizationLookupError?.message ?? "Unknown error"}`
    );
  }

  return {
    user,
    profile,
    organization:
      organization ??
      mapOrganizationRow(
        organizationLookupRow as {
          id: string;
          name: string;
          slug: string;
          plan: PlanCode;
          plan_status: PlanStatus;
          created_at: string;
          updated_at: string;
        }
      ),
    membership
  };
}

export async function bootstrapUserFromSession(user: User): Promise<BootstrapResult> {
  if (!user.email) {
    throw new Error("Authenticated user is missing an email address.");
  }

  return bootstrapAppUserSession({
    authProvider: getAuthProvider(user),
    email: user.email,
    fullName: getFullName(user),
    id: user.id
  });
}
