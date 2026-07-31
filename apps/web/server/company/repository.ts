import "server-only";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import type { AssignableMembershipRole } from "../../lib/auth/membership-role-policy";
import { canLoseAdvancedAccess, canRemoveCompanyMember, roleForNewCompanyMember } from "./policy";

export type CompanyListItem = {
  advancedUserCount: number;
  createdAt: string;
  domainCount: number;
  id: string;
  logoStorageKey: string | null;
  name: string;
  scanCount: number;
  slug: string;
  userCount: number;
};

export type CompanyUser = {
  createdAt: string;
  email: string;
  fullName: string | null;
  id: string;
  lastLoginAt: string | null;
  membershipId: string;
  role: string;
};

export type CompanyDetail = CompanyListItem & {
  plan: string;
  planStatus: string;
  updatedAt: string;
  users: CompanyUser[];
};

function mapCompany(row: Record<string, unknown>): CompanyListItem {
  return {
    advancedUserCount: Number(row.advanced_user_count ?? 0),
    createdAt: String(row.created_at),
    domainCount: Number(row.domain_count ?? 0),
    id: String(row.id),
    logoStorageKey: typeof row.logo_storage_key === "string" ? row.logo_storage_key : null,
    name: String(row.name),
    scanCount: Number(row.scan_count ?? 0),
    slug: String(row.slug),
    userCount: Number(row.user_count ?? 0)
  };
}

export async function listCompanies(): Promise<CompanyListItem[]> {
  const result = await query<Record<string, unknown>>(
    `select o.id,
            o.name,
            o.slug,
            o.logo_storage_key,
            o.created_at,
            count(distinct om.user_id)::int as user_count,
            count(distinct case when om.role in ('advanced', 'admin') then om.user_id end)::int as advanced_user_count,
            count(distinct d.id)::int as domain_count,
            count(distinct s.id)::int as scan_count
       from organizations o
       left join organization_members om on om.organization_id = o.id
       left join domains d on d.organization_id = o.id
       left join scans s on s.organization_id = o.id
      group by o.id
      order by o.created_at desc`,
    [],
    { readOnly: true }
  );
  return result.rows.map(mapCompany);
}

export async function getCompanyDetail(organizationId: string): Promise<CompanyDetail | null> {
  const company = await query<Record<string, unknown>>(
    `select o.id,
            o.name,
            o.slug,
            o.logo_storage_key,
            o.created_at,
            o.updated_at,
            o.plan,
            o.plan_status,
            count(distinct om.user_id)::int as user_count,
            count(distinct case when om.role in ('advanced', 'admin') then om.user_id end)::int as advanced_user_count,
            count(distinct d.id)::int as domain_count,
            count(distinct s.id)::int as scan_count
       from organizations o
       left join organization_members om on om.organization_id = o.id
       left join domains d on d.organization_id = o.id
       left join scans s on s.organization_id = o.id
      where o.id = $1
      group by o.id`,
    [organizationId],
    { readOnly: true }
  );
  const row = company.rows[0];
  if (!row) return null;

  const users = await query<Record<string, unknown>>(
    `select u.id,
            u.email,
            u.full_name,
            u.created_at,
            om.id as membership_id,
            om.role,
            login_activity.last_login_at
       from organization_members om
       join users u on u.id = om.user_id
       left join lateral (
         select max(s.created_at) as last_login_at
           from better_auth_users bau
           join better_auth_sessions s on s.user_id = bau.id
          where lower(bau.email) = lower(u.email)
       ) login_activity on true
      where om.organization_id = $1
      order by case when om.role in ('advanced', 'admin') then 0 else 1 end, u.created_at asc`,
    [organizationId],
    { readOnly: true }
  );

  const mapped = mapCompany(row);
  return {
    ...mapped,
    plan: String(row.plan ?? "free"),
    planStatus: String(row.plan_status ?? "active"),
    updatedAt: String(row.updated_at),
    users: users.rows.map((user) => ({
      createdAt: String(user.created_at),
      email: String(user.email),
      fullName: typeof user.full_name === "string" ? user.full_name : null,
      id: String(user.id),
      lastLoginAt: typeof user.last_login_at === "string" ? user.last_login_at : null,
      membershipId: String(user.membership_id),
      role: String(user.role)
    }))
  };
}

export async function findCompanyBySlug(slug: string) {
  return queryOne<{ id: string }>("select id from organizations where slug = $1", [slug], { readOnly: true });
}

export async function findCompanyByName(name: string, excludeOrganizationId?: string) {
  return queryOne<{ id: string }>(
    `select id
       from organizations
      where lower(btrim(name)) = lower(btrim($1))
        and ($2::uuid is null or id <> $2::uuid)`,
    [name, excludeOrganizationId ?? null],
    { readOnly: true }
  );
}

export async function createCompany(input: { name: string; slug: string; userId?: string | null }) {
  const company = await queryOne<{ id: string }>(
    `insert into organizations (name, slug, plan)
     values ($1, $2, 'team')
     returning id`,
    [input.name, input.slug]
  );
  if (!company) throw new Error("Company creation failed.");

  if (input.userId) {
    await query(
      `insert into organization_members (organization_id, user_id, role)
       values ($1, $2, 'advanced')`,
      [company.id, input.userId]
    );
  }
  return company.id;
}

export async function addCompanyMembership(input: { organizationId: string; userId: string; role?: AssignableMembershipRole }) {
  const existingMembership = await queryOne<{ organization_id: string }>(
    `select organization_id
       from organization_members
      where user_id = $1`,
    [input.userId],
    { readOnly: true }
  );
  if (existingMembership) throw new Error("A user can belong to only one workspace.");

  const existing = await queryOne<{ count: number }>(
    `select count(*)::int as count from organization_members where organization_id = $1`,
    [input.organizationId]
  );
  const role = roleForNewCompanyMember(existing?.count ?? 0, input.role ?? "user");
  try {
    await query(
      `insert into organization_members (organization_id, user_id, role)
       values ($1, $2, $3)`,
      [input.organizationId, input.userId, role]
    );
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new Error("A user can belong to only one workspace.");
    }
    throw error;
  }
  return role;
}

export async function updateCompanyMembershipRole(input: { organizationId: string; userId: string; role: AssignableMembershipRole }) {
  if (input.role === "user") {
    const advanced = await queryOne<{ count: number }>(
      `select count(*)::int as count
         from organization_members
        where organization_id = $1
          and role in ('advanced', 'admin')`,
      [input.organizationId]
    );
    const current = await queryOne<{ role: string }>(
      `select role from organization_members where organization_id = $1 and user_id = $2`,
      [input.organizationId, input.userId]
    );
    if (current?.role && !canLoseAdvancedAccess({ advancedCount: advanced?.count ?? 0, currentRole: current.role, nextRole: input.role })) {
      throw new Error("A company must retain at least one advanced user.");
    }
  }
  await query(
    `update organization_members set role = $3 where organization_id = $1 and user_id = $2`,
    [input.organizationId, input.userId, input.role]
  );
}

export async function removeCompanyMembership(input: { organizationId: string; userId: string }) {
  const current = await queryOne<{ role: string }>(
    `select role from organization_members where organization_id = $1 and user_id = $2`,
    [input.organizationId, input.userId]
  );
  if (!current) return;
  if (!canRemoveCompanyMember({ advancedCount: 0, currentRole: current.role })) {
    const advanced = await queryOne<{ count: number }>(
      `select count(*)::int as count from organization_members where organization_id = $1 and role in ('advanced', 'admin')`,
      [input.organizationId]
    );
    if (!canRemoveCompanyMember({ advancedCount: advanced?.count ?? 0, currentRole: current.role })) throw new Error("A company must retain at least one advanced user.");
  }
  await query(
    `delete from organization_members where organization_id = $1 and user_id = $2`,
    [input.organizationId, input.userId]
  );
}

export async function updateCompanyLogo(organizationId: string, logoStorageKey: string | null) {
  await query(`update organizations set logo_storage_key = $2 where id = $1`, [organizationId, logoStorageKey]);
}

export async function updateCompanyName(organizationId: string, name: string) {
  await query(`update organizations set name = $2 where id = $1`, [organizationId, name]);
}
