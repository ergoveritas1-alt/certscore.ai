import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { MembershipRoleForm } from "../../../../components/admin/membership-role-form";
import { OrganizationPlanForm } from "../../../../components/admin/organization-plan-form";
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

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(value));
}

export default async function AdminUsersPage() {
  const users = await listAdminUsers();

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle>User And Workspace Admin</CardTitle>
      </CardHeader>
      <CardContent className="overflow-visible">
        <div className="overflow-x-auto overflow-y-visible">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-3 pr-4 font-medium">User</th>
                <th className="pb-3 pr-4 font-medium">Domains</th>
                <th className="pb-3 pr-4 font-medium">Scans</th>
                <th className="pb-3 pr-4 font-medium">Last</th>
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
                          className="text-slate-400 transition hover:text-slate-700"
                        >
                          <InfoIcon />
                        </button>
                        <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg group-hover:block">
                          <p>Name: {user.fullName ?? "No full name"}</p>
                          <p>Provider: {user.authProvider}</p>
                          <p>Created: {formatDateTime(user.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 pr-4 align-top text-slate-600">{user.domainCount}</td>
                  <td className="py-4 pr-4 align-top text-slate-600">{user.totalScans}</td>
                  <td className="whitespace-nowrap py-4 pr-4 align-top text-slate-600">{formatDateTime(user.updatedAt)}</td>
                  <td className="py-4 pr-4 align-top text-slate-600">
                    {user.organizationId ? (
                      <MembershipRoleForm
                        action={updateMembershipRoleFormAction}
                        defaultRole={(user.membershipRole ?? "user") as "admin" | "user"}
                        organizationId={user.organizationId}
                        userId={user.id}
                      />
                    ) : null}
                  </td>
                  <td className="py-4 align-top">
                    {user.organizationId ? (
                      <OrganizationPlanForm
                        action={updateOrganizationPlanFormAction}
                        defaultPlan={(user.plan ?? "free") as "free" | "pro" | "team"}
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
