export type AdminUsersSortKey = "user" | "activity" | "lastActivity" | "lastLogin" | "lastScan" | "access" | "assign" | "plan";
export type AdminUsersSortDirection = "asc" | "desc";

const ADMIN_USERS_SORT_EXPRESSIONS: Record<AdminUsersSortKey, string> = {
  access: "coalesce(selected_memberships.role, 'user')",
  activity: "greatest(latest_product_activity.occurred_at, request_activity.last_scan_requested_at, associated_activity.last_scan_at, connector_activity.last_connector_at)",
  assign: "organizations.name",
  lastActivity: "latest_product_activity.occurred_at",
  lastLogin: "login_activity.last_login_at",
  lastScan: "greatest(request_activity.last_scan_requested_at, associated_activity.last_scan_at)",
  plan: "organizations.plan",
  user: "selected_users.email"
};

export function getAdminUsersOrderBy(sortKey: AdminUsersSortKey, direction: AdminUsersSortDirection) {
  return `${ADMIN_USERS_SORT_EXPRESSIONS[sortKey]} ${direction} nulls last, selected_users.email asc, selected_users.id asc`;
}

export function normalizeAdminUsersSortKey(value: string | null | undefined): AdminUsersSortKey {
  return value === "activity" || value === "lastActivity" || value === "lastLogin" || value === "lastScan" || value === "access" || value === "assign" || value === "plan"
    ? value
    : "user";
}

export function normalizeAdminUsersSortDirection(value: string | null | undefined): AdminUsersSortDirection {
  return value === "asc" ? "asc" : "desc";
}
