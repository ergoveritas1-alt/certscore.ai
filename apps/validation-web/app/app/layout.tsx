import type { ReactNode } from "react";
import { ValidationAppShell } from "../../components/validation/app-shell";
import { requireValidationAdminContext } from "../../server/validation/auth";

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const { user } = await requireValidationAdminContext();
  return <ValidationAppShell userEmail={user.email}>{children}</ValidationAppShell>;
}
