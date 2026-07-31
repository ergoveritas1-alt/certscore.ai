import type { ReactNode } from "react";
import { AppShell } from "../../components/dashboard/app-shell";
import { getDashboardContext } from "../../server/auth";
import { getPlatformAdminFlag } from "../../server/admin/platform-admin";

export const dynamic = "force-dynamic";

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const [{ membership, organization, user }, isPlatformAdmin] = await Promise.all([
    getDashboardContext(),
    getPlatformAdminFlag()
  ]);

  const canManageCompany = isPlatformAdmin;
  const hasWorkspace = Boolean(organization && membership);

  return (
    <AppShell
      isPlatformAdmin={isPlatformAdmin}
      canManageCompany={canManageCompany}
      organizationName={organization?.name ?? "No workspace assigned"}
      plan={organization?.plan ?? "free"}
      userEmail={user.email ?? "Unknown user"}
    >
      {!hasWorkspace && !isPlatformAdmin ? (
        <div className="mx-auto w-full max-w-2xl px-6 py-16">
          <div className="rounded-2xl border border-sky-100 bg-white p-8 text-slate-900 shadow-sm">
            <h1 className="text-2xl font-semibold tracking-tight">Your account is ready</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">You do not have a workspace assigned yet. A CertScore administrator will create or assign one before you can scan sites.</p>
          </div>
        </div>
      ) : children}
    </AppShell>
  );
}
