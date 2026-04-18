import type { ReactNode } from "react";
import { AppShell } from "../../components/dashboard/app-shell";
import { getDashboardContext } from "../../server/auth";
import { getPlatformAdminFlag } from "../../server/admin/platform-admin";
import { getValidationAdminFlag } from "../../server/validation/auth";

export const dynamic = "force-dynamic";

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const [{ organization, user }, isPlatformAdmin, isValidationAdmin] = await Promise.all([
    getDashboardContext(),
    getPlatformAdminFlag(),
    getValidationAdminFlag()
  ]);

  return (
    <AppShell
      isPlatformAdmin={isPlatformAdmin}
      isValidationAdmin={isValidationAdmin}
      organizationName={organization.name}
      plan={organization.plan}
      userEmail={user.email ?? "Unknown user"}
    >
      {children}
    </AppShell>
  );
}
