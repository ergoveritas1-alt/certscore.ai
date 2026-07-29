import type { ReactNode } from "react";
import { AppShell } from "../../components/dashboard/app-shell";
import { getDashboardContext } from "../../server/auth";
import { getPlatformAdminFlag } from "../../server/admin/platform-admin";
import { getCompanyAccess } from "../../server/company/authorization";

export const dynamic = "force-dynamic";

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const [{ organization, user }, isPlatformAdmin, companyAccess] = await Promise.all([
    getDashboardContext(),
    getPlatformAdminFlag(),
    getCompanyAccess()
  ]);

  const canManageCompany = Boolean(
    companyAccess.organizationId &&
      (companyAccess.membershipRole === "advanced" || companyAccess.membershipRole === "admin")
  );

  return (
    <AppShell
      isPlatformAdmin={isPlatformAdmin}
      canManageCompany={canManageCompany}
      organizationName={organization.name}
      plan={organization.plan}
      userEmail={user.email ?? "Unknown user"}
    >
      {children}
    </AppShell>
  );
}
