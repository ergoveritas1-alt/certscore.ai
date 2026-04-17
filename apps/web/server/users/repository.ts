import "server-only";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";
import type { PlanCode, PlanStatus } from "@website-signal-risk-scanner/shared";

export type AppUserProfileRow = {
  auth_provider: string | null;
  created_at: string;
  email: string;
  full_name: string | null;
  id: string;
  updated_at: string;
};

export type AppOrganizationRow = {
  created_at: string;
  id: string;
  name: string;
  plan: PlanCode;
  plan_status: PlanStatus;
  slug: string;
  updated_at: string;
};

export type AppOrganizationMembershipRow = {
  created_at: string;
  id: string;
  organization_id: string;
  role: string;
  user_id: string;
};

export type BetterAuthUserRepositoryRow = {
  email: string;
  email_verified: boolean;
  id?: string;
};

export type BetterAuthAccountRepositoryRow = {
  id?: string;
  provider_id: string;
};

export async function findAppUserByEmailRecord(email: string): Promise<AppUserProfileRow | null> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("users")
    .select("id, email, full_name, auth_provider, created_at, updated_at")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load app user: ${error.message}`);
  }

  return (data as AppUserProfileRow | null) ?? null;
}

export async function findAppUserProfileById(userId: string): Promise<AppUserProfileRow | null> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("users")
    .select("id, email, full_name, auth_provider, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load existing user profile: ${error.message}`);
  }

  return (data as AppUserProfileRow | null) ?? null;
}

export async function upsertAppUserProfile(input: {
  authProvider: string;
  email: string;
  fullName: string | null;
  userId: string;
}): Promise<AppUserProfileRow> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("users")
    .upsert(
      {
        id: input.userId,
        email: input.email,
        full_name: input.fullName,
        auth_provider: input.authProvider
      },
      {
        onConflict: "id"
      }
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert user profile: ${error?.message ?? "Unknown error"}`);
  }

  return data as AppUserProfileRow;
}

export async function findOrganizationMembershipByUserId(
  userId: string
): Promise<AppOrganizationMembershipRow | null> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("organization_members")
    .select("id, organization_id, user_id, role, created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up organization membership: ${error.message}`);
  }

  return (data as AppOrganizationMembershipRow | null) ?? null;
}

export async function createOrganization(input: {
  name: string;
  slug: string;
}): Promise<AppOrganizationRow> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("organizations")
    .insert({
      name: input.name,
      slug: input.slug
    })
    .select("id, name, slug, plan, plan_status, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create organization: ${error?.message ?? "Unknown error"}`);
  }

  return data as AppOrganizationRow;
}

export async function createOrganizationMembership(input: {
  organizationId: string;
  role: string;
  userId: string;
}): Promise<AppOrganizationMembershipRow> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("organization_members")
    .insert({
      organization_id: input.organizationId,
      role: input.role,
      user_id: input.userId
    })
    .select("id, organization_id, user_id, role, created_at")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create organization membership: ${error?.message ?? "Unknown error"}`);
  }

  return data as AppOrganizationMembershipRow;
}

export async function findOrganizationById(organizationId: string): Promise<AppOrganizationRow> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("organizations")
    .select("id, name, slug, plan, plan_status, created_at, updated_at")
    .eq("id", organizationId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to load organization after bootstrap: ${error?.message ?? "Unknown error"}`);
  }

  return data as AppOrganizationRow;
}

export async function findBetterAuthUserById(userId: string): Promise<BetterAuthUserRepositoryRow | null> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("better_auth_users")
    .select("email, email_verified")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Better Auth verification status: ${error.message}`);
  }

  return (data as BetterAuthUserRepositoryRow | null) ?? null;
}

export async function findBetterAuthUserByEmail(email: string): Promise<BetterAuthUserRepositoryRow | null> {
  const db = createDatabaseClient();
  const { data, error } = await db.from("better_auth_users").select("id").eq("email", email).maybeSingle();

  if (error) {
    throw new Error(`Failed to load Better Auth user: ${error.message}`);
  }

  return (data as BetterAuthUserRepositoryRow | null) ?? null;
}

export async function findBetterAuthCredentialAccount(userId: string): Promise<BetterAuthAccountRepositoryRow | null> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("better_auth_accounts")
    .select("id, provider_id")
    .eq("user_id", userId)
    .eq("provider_id", "credential")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Better Auth password account: ${error.message}`);
  }

  return (data as BetterAuthAccountRepositoryRow | null) ?? null;
}

export async function listBetterAuthAccountsByUserId(
  userId: string
): Promise<BetterAuthAccountRepositoryRow[]> {
  const db = createDatabaseClient();
  const { data, error } = await db.from("better_auth_accounts").select("provider_id").eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to load Better Auth providers: ${error.message}`);
  }

  return (data ?? []) as BetterAuthAccountRepositoryRow[];
}
