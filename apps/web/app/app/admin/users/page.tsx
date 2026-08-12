import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { MembershipRoleForm, type MembershipRole } from "../../../../components/admin/membership-role-form";
import { OrganizationPlanForm } from "../../../../components/admin/organization-plan-form";
import { PaginationControls, normalizePage, normalizePageSize } from "../../../../components/ui/pagination-controls";
import { formatAdminCompactDateTime } from "../../../../lib/admin/date-time";
import { listAdminUsersPage } from "../../../../server/admin/list-admin-users";
import { normalizeAdminUsersSortDirection, normalizeAdminUsersSortKey } from "../../../../server/admin/admin-users-sort";
import { withServerTiming } from "../../../../server/performance/log-server-timing";
import { updateMembershipRoleFormAction } from "../../../../server/admin/update-membership-role";
import { updateOrganizationPlanFormAction } from "../../../../server/admin/update-organization-plan";
import { deleteAdminUserFormAction } from "../../../../server/admin/delete-user";
import { assignUserWorkspaceFormAction } from "../../../../server/admin/assign-user-workspace";
import { sendUserPasswordResetFormAction } from "../../../../server/admin/send-user-password-reset";
import { createAdminUserFormAction } from "../../../../server/admin/create-user";
import { listCompanies } from "../../../../server/company/repository";
import { DeleteUserButton } from "../../../../components/admin/delete-user-button";
import { AdminSubmitButton } from "../../../../components/admin/admin-submit-button";
import {
  ADMIN_PLAN_LABELS,
  ADMIN_PLAN_STATUSES,
  PLAN_CODES
} from "../../../../lib/admin/plan-options";
import { ASSIGNABLE_MEMBERSHIP_ROLES } from "../../../../lib/auth/membership-role-policy";

type AdminUsersPageProps = {
  searchParams?: Promise<{
    dir?: string;
    message?: string;
    page?: string;
    perPage?: string;
    sort?: string;
  }>;
};

const SORT_LABELS = {
  access: "Access level",
  activity: "Activity",
  assign: "Assign",
  lastLogin: "Last login",
  lastScan: "Last scan",
  plan: "Plan",
  user: "User"
} as const;

function sortHref(sortKey: keyof typeof SORT_LABELS, currentSort: keyof typeof SORT_LABELS, currentDirection: "asc" | "desc") {
  const direction = sortKey === currentSort && currentDirection === "asc" ? "desc" : "asc";
  return `/app/admin/users?${new URLSearchParams({ dir: direction, sort: sortKey }).toString()}`;
}

function SortHeader({
  currentDirection,
  currentSort,
  sortKey
}: {
  currentDirection: "asc" | "desc";
  currentSort: keyof typeof SORT_LABELS;
  sortKey: keyof typeof SORT_LABELS;
}) {
  const active = currentSort === sortKey;
  const direction = active ? currentDirection : null;
  return (
    <Link
      aria-label={`Sort by ${SORT_LABELS[sortKey]}`}
      aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}
      className="inline-flex items-center gap-1 rounded px-0.5 py-0.5 hover:bg-slate-200/70 hover:text-slate-700"
      href={sortHref(sortKey, currentSort, currentDirection)}
      title={direction ? `${SORT_LABELS[sortKey]}: ${direction === "asc" ? "ascending" : "descending"}` : `Sort by ${SORT_LABELS[sortKey]}`}
    >
      <span>{SORT_LABELS[sortKey]}</span>
      <span aria-hidden="true" className={active ? "text-sky-600" : "text-slate-400"}>{direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕"}</span>
    </Link>
  );
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const resolved = searchParams ? await searchParams : {};
  const pageSize = normalizePageSize(resolved.perPage);
  const requestedPage = normalizePage(resolved.page);
  const sortKey = normalizeAdminUsersSortKey(resolved.sort);
  const direction = normalizeAdminUsersSortDirection(resolved.dir);
  const requestedUserPage = await withServerTiming(
    "app.admin.users.list",
    () => listAdminUsersPage(pageSize, (requestedPage - 1) * pageSize, sortKey, direction)
  );
  const pageCount = Math.max(1, Math.ceil(requestedUserPage.totalCount / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const userPage = page === requestedPage
    ? requestedUserPage
    : await withServerTiming(
        "app.admin.users.list.normalized",
        () => listAdminUsersPage(pageSize, (page - 1) * pageSize, sortKey, direction)
      );
  const users = userPage.items;
  const workspaces = await listCompanies();
  const passwordResetSent = resolved.message === "password_reset_sent";
  const existingUserWorkspaceCreated = resolved.message === "existing_user_workspace_created";
  const userCreated = resolved.message === "user_created";
  const userAlreadyExists = resolved.message === "user_exists";

  return (
    <div className="space-y-4">
      {passwordResetSent ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">Password reset email sent. The user can use the secure link to choose a new password.</div> : null}
      {userCreated ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">User and workspace created successfully. A welcome email with a secure password setup link was sent.</div> : null}
      {existingUserWorkspaceCreated ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">That account already existed without a workspace. A new workspace was created and a fresh password setup link was sent.</div> : null}
      {userAlreadyExists ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">That user already exists and is assigned to a workspace. Use the existing user row to manage their workspace.</div> : null}
      <Card className="border-slate-200 bg-white">
        <CardHeader><CardTitle>Create user</CardTitle><p className="text-sm text-slate-600">Create a user, automatically assign them a new workspace, and send a secure link to set their password.</p></CardHeader>
        <CardContent>
          <form action={createAdminUserFormAction} className="flex flex-col gap-3 lg:flex-row lg:items-end"><label className="min-w-0 flex-1 text-sm font-medium text-slate-700">Email<input aria-label="Email address" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3" name="email" required type="email" /></label><AdminSubmitButton className="app-raised-button app-raised-button-dark h-10 shrink-0 rounded-lg px-4 text-sm font-semibold text-white" idleContent="Create user and send invite" pendingContent="Creating…" /></form>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle>User And Workspace Admin</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 overflow-visible">
        <PaginationControls
          basePath="/app/admin/users"
          itemLabel="users"
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          searchParams={{ dir: direction, sort: sortKey }}
          totalCount={userPage.totalCount}
          visibleCount={users.length}
        />
        <div className="overflow-x-auto overflow-y-visible">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="whitespace-nowrap pb-2 pr-4"><SortHeader currentDirection={direction} currentSort={sortKey} sortKey="user" /></th>
                <th className="whitespace-nowrap pb-2 pr-4"><SortHeader currentDirection={direction} currentSort={sortKey} sortKey="lastLogin" /></th>
                <th className="whitespace-nowrap pb-2 pr-4" title="Includes user-initiated API and scan requests, including reused scans; does not change scan ownership.">Last requested</th>
                <th className="whitespace-nowrap pb-2 pr-4" title="Includes scans submitted by the user or claimed from a verified anonymous browser handoff.">Last associated</th>
                <th className="whitespace-nowrap pb-2 pr-4"><SortHeader currentDirection={direction} currentSort={sortKey} sortKey="lastScan" /></th>
                <th className="whitespace-nowrap pb-2 pr-4"><SortHeader currentDirection={direction} currentSort={sortKey} sortKey="activity" /></th>
                <th className="whitespace-nowrap pb-2 pr-4"><SortHeader currentDirection={direction} currentSort={sortKey} sortKey="access" /></th>
                <th className="whitespace-nowrap pb-2 pr-4"><SortHeader currentDirection={direction} currentSort={sortKey} sortKey="assign" /></th>
                <th className="whitespace-nowrap pb-2 pr-4"><SortHeader currentDirection={direction} currentSort={sortKey} sortKey="plan" /></th>
                <th className="whitespace-nowrap pb-2 pl-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 [&_td]:align-top">
              {users.map((user) => {
                const assignmentFormId = `assign-user-${user.id}`;
                return (
                  <tr key={user.id}>
                  <td className="py-2.5 pr-4 align-top">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <p className="max-w-[260px] truncate font-medium text-slate-900" title={user.email}>{user.email}</p>
                          <Link
                            aria-label={`View activity for ${user.email}`}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-sky-200 bg-sky-50 text-sky-700 shadow-[0_2px_0_0_rgb(186,230,253)] transition hover:-translate-y-0.5 hover:border-sky-400 hover:bg-sky-100 hover:text-sky-800 hover:shadow-[0_3px_0_0_rgb(125,211,252)] active:translate-y-0.5 active:shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                            href={`/app/admin/users/${user.id}/activity`}
                            title="View user activity"
                          >
                            <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5V14m5 5.5V9m5 10.5V4m5 15.5V12" />
                            </svg>
                          </Link>
                        </div>
                        <p className="truncate text-xs text-slate-500">{user.organizationName ?? "Unassigned"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 align-top text-sm text-slate-600">
                    {formatAdminCompactDateTime(user.lastLoginAt)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 align-top text-sm text-slate-600">
                    <p>{formatAdminCompactDateTime(user.lastScanRequestedAt)}</p>
                    <p className="text-xs text-slate-400">{user.scanRequestCount} request{user.scanRequestCount === 1 ? "" : "s"}</p>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 align-top text-sm text-slate-600">
                    <p>{formatAdminCompactDateTime(user.lastAssociatedScanAt)}</p>
                    <p className="text-xs text-slate-400">{user.associatedScanCount} scan{user.associatedScanCount === 1 ? "" : "s"}</p>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 align-top text-sm text-slate-600">
                    {formatAdminCompactDateTime(user.lastScanAt)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 align-top text-sm text-slate-600">
                    {user.domainCount} domains <span className="text-slate-300">·</span> {user.totalScans} scans
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 align-top text-slate-600">
                    {user.organizationId ? (
                      <MembershipRoleForm
                        action={updateMembershipRoleFormAction}
                        defaultRole={(user.membershipRole ?? "user") as MembershipRole}
                        organizationId={user.organizationId}
                        userId={user.id}
                      />
                    ) : (
                      <select
                        aria-label={`Access level for ${user.email}`}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900"
                        defaultValue="user"
                        form={assignmentFormId}
                        name="role"
                      >
                        {ASSIGNABLE_MEMBERSHIP_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 align-top text-slate-600">
                    {user.organizationId ? (
                      <span className="text-slate-700">{user.organizationName}</span>
                    ) : workspaces.length > 0 ? (
                      <form action={assignUserWorkspaceFormAction} className="flex min-w-56 items-center gap-2" id={assignmentFormId}>
                        <input name="userId" type="hidden" value={user.id} />
                        <label className="sr-only" htmlFor={`workspace-${user.id}`}>Assign workspace for {user.email}</label>
                        <select
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900"
                          defaultValue=""
                          id={`workspace-${user.id}`}
                          name="organizationId"
                          required
                        >
                          <option disabled value="">Assign workspace</option>
                          {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                        </select>
                        <AdminSubmitButton className="app-raised-button app-raised-button-dark rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white" idleContent="Assign" pendingContent="Assigning…" />
                      </form>
                    ) : <span className="text-slate-500">No workspaces</span>}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 align-top">
                    {user.organizationId ? (
                      <OrganizationPlanForm
                        action={updateOrganizationPlanFormAction}
                        defaultPlan={(user.plan ?? "free") as "free" | "individual" | "pro" | "team"}
                        defaultPlanStatus={(user.planStatus ?? "active") as "active" | "trialing" | "past_due" | "paused"}
                        organizationId={user.organizationId}
                      />
                    ) : (
                      <div className="grid items-start gap-1.5 md:grid-cols-[126px_110px]">
                        <label className="sr-only" htmlFor={`plan-${user.id}`}>Plan for the assigned workspace</label>
                        <select
                          className="w-[126px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900"
                          defaultValue=""
                          form={assignmentFormId}
                          id={`plan-${user.id}`}
                          name="plan"
                        >
                          <option value="">Keep workspace plan</option>
                          {PLAN_CODES.map((plan) => <option key={plan} value={plan}>{ADMIN_PLAN_LABELS[plan]}</option>)}
                        </select>
                        <label className="sr-only" htmlFor={`plan-status-${user.id}`}>Plan status for the assigned workspace</label>
                        <select
                          className="w-[110px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900"
                          defaultValue="active"
                          form={assignmentFormId}
                          id={`plan-status-${user.id}`}
                          name="planStatus"
                        >
                          {ADMIN_PLAN_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pl-2 align-top">
                    <div className="flex flex-col items-start gap-3">
                      <form action={sendUserPasswordResetFormAction}>
                        <input name="userId" type="hidden" value={user.id} />
                        <AdminSubmitButton className="text-sm font-medium text-sky-700 underline decoration-sky-200 underline-offset-4 hover:text-sky-900" idleContent="Send reset link" pendingContent="Sending…" />
                      </form>
                      <DeleteUserButton action={deleteAdminUserFormAction} email={user.email} userId={user.id} />
                    </div>
                  </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
      </Card>
    </div>
  );
}
