import "server-only";

import { query, queryOne, withWriteTransaction } from "@website-signal-risk-scanner/db";
import type { PlanCode, PlanStatus } from "@website-signal-risk-scanner/shared";
import type { AssignableMembershipRole } from "../../lib/auth/membership-role-policy";

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
  try {
    return await queryOne<AppUserProfileRow>(
      `select id, email, full_name, auth_provider, created_at, updated_at
         from users
        where email = $1`,
      [email],
      { readOnly: true }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load app user: ${message}`);
  }
}

export async function findAppUserProfileById(userId: string): Promise<AppUserProfileRow | null> {
  try {
    return await queryOne<AppUserProfileRow>(
      `select id, email, full_name, auth_provider, created_at, updated_at
         from users
        where id = $1`,
      [userId],
      { readOnly: true }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load existing user profile: ${message}`);
  }
}

export async function upsertAppUserProfile(input: {
  authProvider: string;
  email: string;
  fullName: string | null;
  userId: string;
}): Promise<AppUserProfileRow> {
  try {
    const row = await queryOne<AppUserProfileRow>(
      `insert into users (id, email, full_name, auth_provider)
       values ($1, $2, $3, $4)
       on conflict (id) do update
         set email = excluded.email,
             full_name = excluded.full_name,
             auth_provider = excluded.auth_provider
       returning id, email, full_name, auth_provider, created_at, updated_at`,
      [input.userId, input.email, input.fullName, input.authProvider]
    );

    if (!row) {
      throw new Error("Unknown error");
    }

    return row;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to upsert user profile: ${message}`);
  }
}

export async function findOrganizationMembershipByUserId(
  userId: string
): Promise<AppOrganizationMembershipRow | null> {
  try {
    return await queryOne<AppOrganizationMembershipRow>(
      `select id, organization_id, user_id, role, created_at
         from organization_members
        where user_id = $1`,
      [userId],
      { readOnly: true }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to look up organization membership: ${message}`);
  }
}

export async function countAdvancedOrganizationMembers(organizationId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `select count(*)::text as count
       from organization_members
      where organization_id = $1
        and role in ('advanced', 'admin')`,
    [organizationId],
    { readOnly: true }
  );

  return Number(row?.count ?? 0);
}

export async function deleteAppUserProfileById(userId: string): Promise<void> {
  await queryOne(`delete from users where id = $1`, [userId]);
}

export async function createOrganization(input: {
  name: string;
  slug: string;
}): Promise<AppOrganizationRow> {
  try {
    const row = await queryOne<AppOrganizationRow>(
      `insert into organizations (name, slug)
       values ($1, $2)
       returning id, name, slug, plan, plan_status, created_at, updated_at`,
      [input.name, input.slug]
    );

    if (!row) {
      throw new Error("Unknown error");
    }

    return row;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to create organization: ${message}`);
  }
}

export async function createOrganizationMembership(input: {
  organizationId: string;
  role: AssignableMembershipRole;
  userId: string;
}): Promise<AppOrganizationMembershipRow> {
  try {
    const row = await queryOne<AppOrganizationMembershipRow>(
      `insert into organization_members (organization_id, role, user_id)
       values ($1, $2, $3)
       returning id, organization_id, user_id, role, created_at`,
      [input.organizationId, input.role, input.userId]
    );

    if (!row) {
      throw new Error("Unknown error");
    }

    return row;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to create organization membership: ${message}`);
  }
}

export async function createOrganizationForUser(input: {
  name: string;
  role: AssignableMembershipRole;
  slug: string;
  userId: string;
}): Promise<{ membershipId: string; organizationId: string }> {
  try {
    const row = await queryOne<{ membership_id: string; organization_id: string }>(
      `with created_organization as (
         insert into organizations (name, slug)
         values ($1, $2)
         returning id
       ),
       created_membership as (
         insert into organization_members (organization_id, user_id, role)
         select id, $3, $4 from created_organization
         returning id, organization_id
       )
       select id as membership_id, organization_id
         from created_membership`,
      [input.name, input.slug, input.userId, input.role]
    );

    if (!row) {
      throw new Error("Unknown error");
    }

    return {
      membershipId: row.membership_id,
      organizationId: row.organization_id
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to create the user's workspace: ${message}`);
  }
}

export async function ensureOrganizationForUser(input: {
  name: string;
  role: AssignableMembershipRole;
  slug: string;
  userId: string;
}): Promise<{ created: boolean; membershipId: string; organizationId: string }> {
  try {
    return await withWriteTransaction(async (client) => {
      const lockedUser = await client.query<{ id: string }>(
        `select id
           from users
          where id = $1
          for update`,
        [input.userId]
      );
      if (!lockedUser.rows[0]) {
        throw new Error("The user profile does not exist.");
      }

      const existing = await client.query<{ membership_id: string; organization_id: string }>(
        `select id as membership_id, organization_id
           from organization_members
          where user_id = $1`,
        [input.userId]
      );
      if (existing.rows[0]) {
        return {
          created: false,
          membershipId: existing.rows[0].membership_id,
          organizationId: existing.rows[0].organization_id
        };
      }

      const created = await client.query<{ membership_id: string; organization_id: string }>(
        `with created_organization as (
           insert into organizations (name, slug)
           values ($1, $2)
           returning id
         ),
         created_membership as (
           insert into organization_members (organization_id, user_id, role)
           select id, $3, $4 from created_organization
           returning id, organization_id
         )
         select id as membership_id, organization_id
           from created_membership`,
        [input.name, input.slug, input.userId, input.role]
      );
      const row = created.rows[0];
      if (!row) {
        throw new Error("Unknown error");
      }

      return {
        created: true,
        membershipId: row.membership_id,
        organizationId: row.organization_id
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to ensure the user's workspace: ${message}`);
  }
}

export async function findOrganizationById(organizationId: string): Promise<AppOrganizationRow> {
  try {
    const row = await queryOne<AppOrganizationRow>(
      `select id, name, slug, plan, plan_status, created_at, updated_at
         from organizations
        where id = $1`,
      [organizationId],
      { readOnly: true }
    );

    if (!row) {
      throw new Error("Unknown error");
    }

    return row;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load organization after bootstrap: ${message}`);
  }
}

export async function findBetterAuthUserById(userId: string): Promise<BetterAuthUserRepositoryRow | null> {
  try {
    return await queryOne<BetterAuthUserRepositoryRow>(
      `select email, email_verified
         from better_auth_users
        where id = $1`,
      [userId],
      { readOnly: true }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load Better Auth verification status: ${message}`);
  }
}

export async function findBetterAuthUserByEmail(email: string): Promise<BetterAuthUserRepositoryRow | null> {
  try {
    return await queryOne<BetterAuthUserRepositoryRow>(
      `select id
         from better_auth_users
        where email = $1`,
      [email],
      { readOnly: true }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load Better Auth user: ${message}`);
  }
}

export async function findBetterAuthCredentialAccount(userId: string): Promise<BetterAuthAccountRepositoryRow | null> {
  try {
    return await queryOne<BetterAuthAccountRepositoryRow>(
      `select id, provider_id
         from better_auth_accounts
        where user_id = $1
          and provider_id = 'credential'`,
      [userId],
      { readOnly: true }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load Better Auth password account: ${message}`);
  }
}

export async function listBetterAuthAccountsByUserId(
  userId: string
): Promise<BetterAuthAccountRepositoryRow[]> {
  try {
    const result = await query<BetterAuthAccountRepositoryRow>(
      `select provider_id
         from better_auth_accounts
        where user_id = $1`,
      [userId],
      { readOnly: true }
    );

    return result.rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load Better Auth providers: ${message}`);
  }
}
