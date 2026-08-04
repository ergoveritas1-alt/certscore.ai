export type AdminUsersSortKey = "user" | "activity" | "lastLogin" | "lastScan" | "access" | "assign" | "plan";
export type AdminUsersSortDirection = "asc" | "desc";

const ADMIN_USERS_SORT_EXPRESSIONS: Record<AdminUsersSortKey, string> = {
  access: "coalesce(selected_memberships.role, login_activity.account_role, 'user')",
  activity: "coalesce(user_activity.total_scans, 0)",
  assign: "organizations.name",
  lastLogin: "login_activity.last_login_at",
  lastScan: "user_activity.last_scan_at",
  plan: "organizations.plan",
  user: "selected_users.email"
};

export function getAdminUsersOrderBy(sortKey: AdminUsersSortKey, direction: AdminUsersSortDirection) {
  return `${ADMIN_USERS_SORT_EXPRESSIONS[sortKey]} ${direction} nulls last, selected_users.email asc, selected_users.id asc`;
}

export function normalizeAdminUsersSortKey(value: string | null | undefined): AdminUsersSortKey {
  return value === "activity" || value === "lastLogin" || value === "lastScan" || value === "access" || value === "assign" || value === "plan"
    ? value
    : "user";
}

export function normalizeAdminUsersSortDirection(value: string | null | undefined): AdminUsersSortDirection {
  return value === "asc" ? "asc" : "desc";
}
