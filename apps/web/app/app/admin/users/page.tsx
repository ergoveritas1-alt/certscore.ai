import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { MembershipRoleForm, type MembershipRole } from "../../../../components/admin/membership-role-form";
import { OrganizationPlanForm } from "../../../../components/admin/organization-plan-form";
import { PaginationControls, normalizePage, normalizePageSize } from "../../../../components/ui/pagination-controls";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { listAdminUsers } from "../../../../server/admin/list-admin-users";
import { updateMembershipRoleFormAction } from "../../../../server/admin/update-membership-role";
import { updateOrganizationPlanFormAction } from "../../../../server/admin/update-organization-plan";

function InfoIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 10.5v5" />
      <circle cx="12" cy="7.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

type AdminUsersPageProps = {
  searchParams?: Promise<{
    page?: string;
    perPage?: string;
  }>;
};

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const resolved = searchParams ? await searchParams : {};
  const pageSize = normalizePageSize(resolved.perPage);
  const requestedPage = normalizePage(resolved.page);
  const allUsers = await listAdminUsers();
  const pageCount = Math.max(1, Math.ceil(allUsers.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const users = allUsers.slice((page - 1) * pageSize, page * pageSize);

  return (
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
          totalCount={allUsers.length}
          visibleCount={users.length}
        />
        <div className="overflow-x-auto overflow-y-visible">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-3 pr-4 font-medium">User</th>
                <th className="pb-3 pr-4 font-medium">Domains</th>
                <th className="pb-3 pr-4 font-medium">Scans</th>
                <th className="pb-3 pr-4 font-medium">Last login/scan</th>
                <th className="pb-3 pr-4 font-medium">Access</th>
                <th className="pb-3 font-medium">Plan Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 [&_td]:align-top">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="py-4 pr-4 align-top">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900">{user.email}</p>
                      <div className="group relative">
                        <button
                          type="button"
                          aria-label="User details"
                          className="app-raised-button inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:text-slate-800"
                        >
                          <InfoIcon />
                        </button>
                        <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg group-hover:block">
                          <p>Name: {user.fullName ?? "No full name"}</p>
                          <p>Provider: {user.authProvider}</p>
                          <p>Created: {formatAdminDateTime(user.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 pr-4 align-top text-slate-600">{user.domainCount}</td>
                  <td className="py-4 pr-4 align-top text-slate-600">{user.totalScans}</td>
                  <td className="whitespace-nowrap py-4 pr-4 align-top text-slate-600">
                    <div>Login: {formatAdminDateTime(user.lastLoginAt, { fallback: "Never" })}</div>
                    <div>Scan: {formatAdminDateTime(user.lastScanAt, { fallback: "Never" })}</div>
                  </td>
                  <td className="py-4 pr-4 align-top text-slate-600">
                    {user.organizationId ? (
                      <MembershipRoleForm
                        action={updateMembershipRoleFormAction}
                        defaultRole={(user.membershipRole ?? "user") as MembershipRole}
                        organizationId={user.organizationId}
                        userId={user.id}
                      />
                    ) : null}
                  </td>
                  <td className="py-4 align-top">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
