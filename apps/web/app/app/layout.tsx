import type { ReactNode } from "react";
import { AppShell } from "../../components/dashboard/app-shell";
import { getDashboardContext } from "../../server/auth";
import { getPlatformAdminFlag } from "../../server/admin/platform-admin";

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const [{ organization, user }, isPlatformAdmin] = await Promise.all([getDashboardContext(), getPlatformAdminFlag()]);

  return (
    <AppShell
      isPlatformAdmin={isPlatformAdmin}
      organizationName={organization.name}
      plan={organization.plan}
      userEmail={user.email ?? "Unknown user"}
    >
      {children}
    </AppShell>
  );
}
