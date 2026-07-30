import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { MembershipRoleForm, type MembershipRole } from "../../../../components/admin/membership-role-form";
import { OrganizationPlanForm } from "../../../../components/admin/organization-plan-form";
import { PaginationControls, normalizePage, normalizePageSize } from "../../../../components/ui/pagination-controls";
import { formatAdminCompactDateTime } from "../../../../lib/admin/date-time";
import { listAdminUsersPage } from "../../../../server/admin/list-admin-users";
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

type AdminUsersPageProps = {
  searchParams?: Promise<{
    message?: string;
    page?: string;
    perPage?: string;
  }>;
};

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const resolved = searchParams ? await searchParams : {};
  const pageSize = normalizePageSize(resolved.perPage);
  const requestedPage = normalizePage(resolved.page);
  const requestedUserPage = await withServerTiming(
    "app.admin.users.list",
    () => listAdminUsersPage(pageSize, (requestedPage - 1) * pageSize)
  );
  const pageCount = Math.max(1, Math.ceil(requestedUserPage.totalCount / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const userPage = page === requestedPage
    ? requestedUserPage
    : await withServerTiming(
        "app.admin.users.list.normalized",
        () => listAdminUsersPage(pageSize, (page - 1) * pageSize)
      );
  const users = userPage.items;
  const workspaces = await listCompanies();
  const passwordResetSent = resolved.message === "password_reset_sent";
  const inviteSent = resolved.message === "invite_sent";
  const userAlreadyExists = resolved.message === "user_exists";

  return (
    <div className="space-y-4">
      {passwordResetSent ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">Password reset email sent. The user can use the secure link to choose a new password.</div> : null}
      {inviteSent ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">That user already exists and is unassigned. A fresh password setup link was sent.</div> : null}
      {userAlreadyExists ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">That user already exists and is assigned to a workspace. Use the existing user row to manage their workspace.</div> : null}
      <Card className="border-slate-200 bg-white">
        <CardHeader><CardTitle>Create user</CardTitle><p className="text-sm text-slate-600">Create an unassigned user and send a secure link to set their password. Assign the user to a workspace separately below.</p></CardHeader>
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
          totalCount={userPage.totalCount}
          visibleCount={users.length}
        />
        <div className="overflow-x-auto overflow-y-visible">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="whitespace-nowrap pb-2 pr-4">User</th>
                <th className="whitespace-nowrap pb-2 pr-4">Activity</th>
                <th className="whitespace-nowrap pb-2 pr-4">Last active</th>
                <th className="whitespace-nowrap pb-2 pr-4">Access level</th>
                <th className="whitespace-nowrap pb-2 pr-4">Assign</th>
                <th className="whitespace-nowrap pb-2 pr-4">Plan</th>
                <th className="whitespace-nowrap pb-2 pl-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 [&_td]:align-top">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="py-2.5 pr-4 align-top">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <p className="max-w-[260px] truncate font-medium text-slate-900" title={user.email}>{user.email}</p>
                        <p className="truncate text-xs text-slate-500">{user.organizationName ?? "Unassigned"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 align-top text-sm text-slate-600">
                    {user.domainCount} domains <span className="text-slate-300">·</span> {user.totalScans} scans
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 align-top text-sm text-slate-600">
                    <div>Login {formatAdminCompactDateTime(user.lastLoginAt)}</div>
                    <div>Scan {formatAdminCompactDateTime(user.lastScanAt)}</div>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 align-top text-slate-600">
                    {user.organizationId ? (
                      <MembershipRoleForm
                        action={updateMembershipRoleFormAction}
                        defaultRole={(user.membershipRole ?? "user") as MembershipRole}
                        organizationId={user.organizationId}
                        userId={user.id}
                      />
                    ) : <span className="text-slate-400">Not assigned</span>}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 align-top text-slate-600">
                    {user.organizationId ? (
                      <span className="text-slate-700">{user.organizationName}</span>
                    ) : workspaces.length > 0 ? (
                      <form action={assignUserWorkspaceFormAction} className="flex min-w-56 items-center gap-2">
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
                      <p className="text-slate-500">No organization to administer.</p>
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
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
      </Card>
    </div>
  );
}
